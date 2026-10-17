/* Submission limits, same-reporter duplicate blocking, corroboration priority,
   and conservative fact enrichment from highly similar independent reports. */

alter table public.incidents
  add column if not exists corroboration_count int not null default 0,
  add column if not exists corroboration_bonus int not null default 0,
  add column if not exists enriched_from_report_ids uuid[] not null default '{}';

create or replace function private.incident_submission_guard()
returns trigger language plpgsql security definer set search_path = public, extensions as $$
declare session_id text := new.ai_extracted ->> 'client_session_id';
begin
  if exists (
    select 1 from public.incidents i where i.created_at > now() - interval '30 seconds'
      and ((auth.uid() is not null and i.reporter_user_id = auth.uid())
        or (session_id is not null and i.ai_extracted ->> 'client_session_id' = session_id))
  ) then raise exception 'Please wait 30 seconds before sending another report'; end if;

  if exists (
    select 1 from public.incidents i where i.created_at > now() - interval '6 hours'
      and i.type = new.type and st_dwithin(i.location, new.location, 200)
      and extensions.similarity(lower(i.description), lower(new.description)) >= 0.65
      and ((auth.uid() is not null and i.reporter_user_id = auth.uid())
        or (session_id is not null and i.ai_extracted ->> 'client_session_id' = session_id))
  ) then raise exception 'You already reported this emergency. Coordinators can see your original report'; end if;
  return new;
end;
$$;
drop trigger if exists trg_incident_submission_guard on public.incidents;
create trigger trg_incident_submission_guard before insert on public.incidents
for each row execute function private.incident_submission_guard();

create or replace function private.incident_assess_before_write()
returns trigger language plpgsql security definer set search_path = public, extensions as $$
declare a jsonb := private.assess_incident(new); base_score int; final_score int;
begin
  base_score := (a ->> 'score')::int;
  final_score := least(100, base_score + coalesce(new.corroboration_bonus, 0));
  if tg_op = 'UPDATE' and old.priority_score is distinct from final_score then
    new.previous_priority_score := old.priority_score; new.previous_priority_level := old.priority_level;
  end if;
  new.priority_score := final_score;
  new.priority_level := (case when final_score >= 75 then 'critical' when final_score >= 50 then 'high' when final_score >= 25 then 'moderate' else 'low' end)::public.priority_level;
  new.priority_reasons := array(select jsonb_array_elements_text(a -> 'reasons'));
  if new.corroboration_bonus > 0 then new.priority_reasons := new.priority_reasons || format('%s independent nearby reports (+%s)', new.corroboration_count, new.corroboration_bonus); end if;
  new.life_threatening := (a ->> 'life_threatening')::boolean;
  new.risk_factors := a -> 'factors'; new.confidence_score := (a ->> 'confidence_score')::int;
  new.confidence_level := a ->> 'confidence_level'; new.confidence_reasons := a -> 'confidence_reasons';
  new.matching_report_count := (a ->> 'matching_report_count')::int;
  new.needs_urgent_check := (private.level_rank(new.priority_level) >= 3 or new.life_threatening) and new.confidence_level = 'low';
  return new;
end;
$$;

create or replace function private.corroborate_and_enrich_after_insert()
returns trigger language plpgsql security definer set search_path = public, extensions as $$
declare main_id uuid; affected_id uuid; witness_count int;
begin
  -- Independent nearby reports raise priority by 5 each, capped at +20.
  for affected_id in
    select i.id from public.incidents i where i.type = new.type
      and i.status not in ('resolved','cancelled') and abs(extract(epoch from (i.created_at-new.created_at))) <= 21600
      and st_dwithin(i.location,new.location,500)
  loop
    select count(*)::int into witness_count from public.incidents o join public.incidents i on i.id=affected_id
    where o.id <> i.id and o.type=i.type and o.status not in ('resolved','cancelled')
      and abs(extract(epoch from (o.created_at-i.created_at))) <= 21600 and st_dwithin(o.location,i.location,500);
    update public.incidents set corroboration_count=witness_count,
      corroboration_bonus=least(20,witness_count*5), updated_at=now() where id=affected_id;
  end loop;

  -- Add only missing facts to the oldest, highly similar report; never replace a known answer.
  select i.id into main_id from public.incidents i where i.id <> new.id and i.type=new.type
    and i.primary_incident_id is null and i.status not in ('resolved','cancelled')
    and abs(extract(epoch from (i.created_at-new.created_at))) <= 21600 and st_dwithin(i.location,new.location,300)
    and extensions.similarity(lower(i.description),lower(new.description)) >= 0.65
    order by i.created_at asc limit 1;
  if main_id is not null then
    update public.incidents i set
      people_affected = greatest(i.people_affected,new.people_affected),
      people_trapped = case when i.people_trapped='unknown' then new.people_trapped else i.people_trapped end,
      injuries_reported = case when i.injuries_reported='unknown' then new.injuries_reported else i.injuries_reported end,
      vulnerable_people = case when i.vulnerable_people='unknown' then new.vulnerable_people else i.vulnerable_people end,
      danger_increasing = case when i.danger_increasing='unknown' then new.danger_increasing else i.danger_increasing end,
      enriched_from_report_ids = array_append(i.enriched_from_report_ids,new.id), updated_at=now()
    where i.id=main_id;
  end if;
  return null;
end;
$$;
drop trigger if exists trg_corroborate_and_enrich on public.incidents;
create trigger trg_corroborate_and_enrich after insert on public.incidents
for each row execute function private.corroborate_and_enrich_after_insert();
