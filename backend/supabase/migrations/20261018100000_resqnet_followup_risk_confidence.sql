/*
# Follow-up questions, explained risk score, information confidence (features 12, 13, 14)

## Feature 12 - follow-up question
The report form may ask one short question when a critical fact is missing. The question, the
answer and whether it was skipped are stored with the report.

## Feature 13 - risk score with reasons
Same weights as calculate_priority() (existing scores do not change), but every factor is stored
in risk_factors with its points and whether it was reported, answered in the follow-up, or is
still unknown. Unknown critical facts are listed so coordinators can see the gaps.

## Feature 14 - information confidence
A separate 0-100 score (high / medium / low) with reasons: location, landmark, key facts known,
people count, form answers vs. written description, follow-up answered, matching reports nearby
(within 500 m, 6 hours, same type) and coordinator verification.
Low confidence never lowers risk. High risk + low confidence sets needs_urgent_check.

Both scores are recalculated by a BEFORE INSERT/UPDATE trigger, so they stay correct whatever
changes the incident. A new report also refreshes the confidence of matching reports nearby.
*/

-- ===================== COLUMNS =====================
alter table public.incidents
  add column if not exists followup_question text,
  add column if not exists followup_field text,
  add column if not exists followup_answer public.tri_state,
  add column if not exists followup_skipped boolean not null default false,
  add column if not exists risk_factors jsonb not null default '[]',
  add column if not exists confidence_score int not null default 0,
  add column if not exists confidence_level text not null default 'low',
  add column if not exists confidence_reasons jsonb not null default '[]',
  add column if not exists matching_report_count int not null default 0,
  add column if not exists needs_urgent_check boolean not null default false;

do $$ begin
  alter table public.incidents add constraint incidents_confidence_level_check check (confidence_level in ('high', 'medium', 'low'));
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.incidents add constraint incidents_followup_field_check
    check (followup_field is null or followup_field in ('people_trapped', 'injuries_reported', 'vulnerable_people', 'danger_increasing'));
exception when duplicate_object then null; end $$;

-- ===================== HELPERS =====================
create or replace function private.level_rank(l public.priority_level)
returns int language sql immutable as $$
  select case l when 'critical' then 4 when 'high' then 3 when 'moderate' then 2 else 1 end;
$$;

-- Other open reports that look like the same event: within 500 m, 6 hours, same type.
create or replace function private.matching_reports(i public.incidents)
returns int language sql stable security definer set search_path = public, extensions as $$
  select count(*)::int
  from public.incidents o
  where o.id <> i.id
    and o.type = i.type
    and o.status not in ('resolved', 'cancelled')
    and abs(extract(epoch from (o.created_at - i.created_at))) <= 6 * 3600
    and st_dwithin(o.location, i.location, 500);
$$;

-- ===================== ASSESSMENT =====================
create or replace function private.assess_incident(i public.incidents)
returns jsonb language plpgsql stable security definer set search_path = public, extensions as $$
declare
  factors jsonb := '[]';
  reasons text[] := '{}';
  s int := 0;
  pts int;
  lt boolean := false;
  lvl public.priority_level;
  f record;
  item jsonb;
  status text;
  conf int;
  conf_reasons jsonb := '[]';
  conf_level text;
  known int;
  conflicts text[] := '{}';
  ai_value text;
  matches int := private.matching_reports(i);
begin
  -- Risk (feature 13): same weights as calculate_priority().
  for f in
    select * from (values
      ('people_trapped', i.people_trapped::text, 40, 'People reported trapped', 'Not yet known whether anyone is trapped', 'Cannot assume everyone is safe'),
      ('injuries_reported', i.injuries_reported::text, 25, 'Injuries or urgent medical needs', 'Not yet known whether anyone is injured', 'Cannot assume there are no injuries'),
      ('vulnerable_people', i.vulnerable_people::text, 15, 'Vulnerable people at risk', 'Not yet known whether vulnerable people are present', null),
      ('danger_increasing', i.danger_increasing::text, 10, 'Conditions getting worse', 'Not yet known whether the danger is growing', null)
    ) as t(key, value, points, yes_label, unknown_label, unknown_detail)
  loop
    status := case when i.followup_field = f.key and i.followup_answer is not null and not i.followup_skipped
                   then 'followup' else 'reported' end;
    if f.value = 'yes' then
      s := s + f.points;
      if f.key in ('people_trapped', 'injuries_reported') then lt := true; end if;
      factors := factors || jsonb_build_object('key', f.key, 'label', f.yes_label, 'points', f.points, 'status', status, 'detail', null);
    elsif f.value = 'unknown' then
      factors := factors || jsonb_build_object('key', f.key, 'label', f.unknown_label, 'points', 0, 'status', 'unknown', 'detail', f.unknown_detail);
    end if;
  end loop;

  pts := least(10, greatest(0, i.people_affected * 2));
  if pts > 0 then
    s := s + pts;
    factors := factors || jsonb_build_object('key', 'people_affected', 'label', format('%s people affected', i.people_affected),
      'points', pts, 'status', 'reported', 'detail', null);
  end if;

  s := least(s, 100);
  lvl := (case when s >= 75 then 'critical' when s >= 50 then 'high' when s >= 25 then 'moderate' else 'low' end)::public.priority_level;

  for item in select * from jsonb_array_elements(factors) loop
    reasons := reasons || case when (item ->> 'points')::int > 0
      then format('%s (+%s)', item ->> 'label', item ->> 'points') else item ->> 'label' end;
  end loop;
  if lt and s < 75 then reasons := reasons || 'Flagged for urgent review: immediate danger to life reported'::text; end if;

  -- Confidence (feature 14): how well supported the information is, never how dangerous.
  conf := 15;
  conf_reasons := conf_reasons || jsonb_build_object('label', 'Location pinned on the map', 'delta', 15);
  if nullif(trim(coalesce(i.area_landmark, '')), '') is not null then
    conf := conf + 10;
    conf_reasons := conf_reasons || jsonb_build_object('label', 'Area or landmark given', 'delta', 10);
  else
    conf_reasons := conf_reasons || jsonb_build_object('label', 'No area or landmark given', 'delta', 0);
  end if;

  known := (i.people_trapped <> 'unknown')::int + (i.injuries_reported <> 'unknown')::int
         + (i.vulnerable_people <> 'unknown')::int + (i.danger_increasing <> 'unknown')::int;
  conf := conf + known * 8;
  conf_reasons := conf_reasons || jsonb_build_object('label', format('%s of 4 key facts known', known), 'delta', known * 8);

  if i.people_affected > 0 then
    conf := conf + 5;
    conf_reasons := conf_reasons || jsonb_build_object('label', 'Number of people stated', 'delta', 5);
  end if;

  if length(trim(i.description)) >= 60 then
    conf := conf + 5;
    conf_reasons := conf_reasons || jsonb_build_object('label', 'Detailed description', 'delta', 5);
  end if;

  if i.ai_extracted is not null then
    foreach ai_value in array array['people_trapped', 'injuries_reported', 'vulnerable_people', 'danger_increasing'] loop
      if (i.ai_extracted ->> ai_value) in ('yes', 'no')
         and (to_jsonb(i) ->> ai_value) in ('yes', 'no')
         and (i.ai_extracted ->> ai_value) <> (to_jsonb(i) ->> ai_value) then
        conflicts := conflicts || initcap(replace(ai_value, '_', ' '));
      end if;
    end loop;
    if cardinality(conflicts) = 0 then
      conf := conf + 5;
      conf_reasons := conf_reasons || jsonb_build_object('label', 'Form answers match the written description', 'delta', 5);
    else
      conf := conf - 8 * cardinality(conflicts);
      conf_reasons := conf_reasons || jsonb_build_object('label', 'Form answers differ from the description: ' || array_to_string(conflicts, ', '),
        'delta', -8 * cardinality(conflicts));
    end if;
  end if;

  if i.followup_answer in ('yes', 'no') and not i.followup_skipped then
    conf := conf + 5;
    conf_reasons := conf_reasons || jsonb_build_object('label', 'Reporter answered the follow-up question', 'delta', 5);
  end if;

  if matches > 0 then
    conf := conf + least(30, 10 * matches);
    conf_reasons := conf_reasons || jsonb_build_object('label',
      format('%s other %s nearby a similar %s', matches, case when matches = 1 then 'report describes' else 'reports describe' end,
        replace(i.type::text, '_', ' ')),
      'delta', least(30, 10 * matches));
  end if;

  if i.verification_status = 'verified' then
    conf := conf + 20;
    conf_reasons := conf_reasons || jsonb_build_object('label', 'Verified by a coordinator', 'delta', 20);
  elsif i.verification_status = 'disputed' then
    conf := conf - 25;
    conf_reasons := conf_reasons || jsonb_build_object('label', 'Disputed by a coordinator', 'delta', -25);
  elsif i.verification_status = 'flagged' then
    conf := conf - 10;
    conf_reasons := conf_reasons || jsonb_build_object('label', 'Flagged for checking', 'delta', -10);
  end if;

  conf := greatest(0, least(100, conf));
  conf_level := case when conf >= 70 then 'high' when conf >= 40 then 'medium' else 'low' end;

  return jsonb_build_object(
    'score', s, 'level', lvl, 'reasons', to_jsonb(reasons), 'factors', factors, 'life_threatening', lt,
    'confidence_score', conf, 'confidence_level', conf_level, 'confidence_reasons', conf_reasons,
    'matching_report_count', matches,
    'needs_urgent_check', (private.level_rank(lvl) >= 3 or lt) and conf_level = 'low'
  );
end;
$$;

-- ===================== TRIGGERS =====================
create or replace function private.incident_assess_before_write()
returns trigger language plpgsql security definer set search_path = public, extensions as $$
declare a jsonb := private.assess_incident(new);
begin
  if tg_op = 'UPDATE' and (old.priority_score is distinct from (a ->> 'score')::int) then
    new.previous_priority_score := old.priority_score;
    new.previous_priority_level := old.priority_level;
  end if;
  new.priority_score := (a ->> 'score')::int;
  new.priority_level := (a ->> 'level')::public.priority_level;
  new.priority_reasons := array(select jsonb_array_elements_text(a -> 'reasons'));
  new.life_threatening := (a ->> 'life_threatening')::boolean;
  new.risk_factors := a -> 'factors';
  new.confidence_score := (a ->> 'confidence_score')::int;
  new.confidence_level := a ->> 'confidence_level';
  new.confidence_reasons := a -> 'confidence_reasons';
  new.matching_report_count := (a ->> 'matching_report_count')::int;
  new.needs_urgent_check := (a ->> 'needs_urgent_check')::boolean;
  return new;
end;
$$;

-- A new report is a new witness for matching reports nearby: refresh their confidence too.
create or replace function private.incident_refresh_matches_after_insert()
returns trigger language plpgsql security definer set search_path = public, extensions as $$
begin
  update public.incidents o set updated_at = now()
  where o.id <> new.id
    and o.type = new.type
    and o.status not in ('resolved', 'cancelled')
    and abs(extract(epoch from (o.created_at - new.created_at))) <= 6 * 3600
    and st_dwithin(o.location, new.location, 500);
  return null;
end;
$$;

drop trigger if exists trg_incidents_insert_priority on public.incidents;
drop function if exists public.incident_insert_priority();
drop trigger if exists trg_incidents_assess on public.incidents;
create trigger trg_incidents_assess before insert or update on public.incidents
  for each row execute function private.incident_assess_before_write();
drop trigger if exists trg_incidents_refresh_matches on public.incidents;
create trigger trg_incidents_refresh_matches after insert on public.incidents
  for each row execute function private.incident_refresh_matches_after_insert();

-- ===================== RECALCULATE =====================
-- Same signature and result as before; the trigger now does the calculation.
create or replace function public.recalculate_incident_priority(p_incident_id uuid, p_actor text default 'system')
returns table(new_score int, new_level public.priority_level, reasons text[], life_threatening boolean, escalated boolean)
language plpgsql security invoker set search_path = public, extensions as $$
declare before_row public.incidents; after_row public.incidents; esc boolean;
begin
  select * into before_row from public.incidents where id = p_incident_id;
  if not found then raise exception 'Incident not found'; end if;
  update public.incidents set updated_at = now() where id = p_incident_id returning * into after_row;
  esc := after_row.priority_score > before_row.priority_score
      or private.level_rank(after_row.priority_level) > private.level_rank(before_row.priority_level)
      or (after_row.life_threatening and not before_row.life_threatening);

  insert into public.audit_logs (actor, actor_user_id, action, entity_type, entity_id, previous_values, new_values, reason)
  values (p_actor, auth.uid(), 'priority_recalculate', 'incident', p_incident_id,
    jsonb_build_object('score', before_row.priority_score, 'level', before_row.priority_level),
    jsonb_build_object('score', after_row.priority_score, 'level', after_row.priority_level, 'reasons', after_row.priority_reasons),
    'Priority recalculated');
  if esc then
    insert into public.escalations (incident_id, previous_score, new_score, previous_level, new_level, reason)
    values (p_incident_id, before_row.priority_score, after_row.priority_score, before_row.priority_level, after_row.priority_level,
      format('Priority increased from %s (%s) to %s (%s)', before_row.priority_score, before_row.priority_level, after_row.priority_score, after_row.priority_level));
    insert into public.alerts (incident_id, type, severity, message, dedup_key)
    values (p_incident_id, 'escalation', after_row.priority_level,
      format('Incident %s escalated to %s (score %s)', after_row.report_code, after_row.priority_level, after_row.priority_score),
      'esc-' || p_incident_id::text || '-' || after_row.priority_score::text);
  end if;
  return query select after_row.priority_score, after_row.priority_level, after_row.priority_reasons, after_row.life_threatening, esc;
end;
$$;

-- ===================== PUBLIC SUBMISSION (adds follow-up fields) =====================
drop function if exists public.submit_public_incident(public.incident_type,text,text,int,public.tri_state,public.tri_state,public.tri_state,public.tri_state,double precision,double precision,text,text);

create or replace function public.submit_public_incident(
  p_type public.incident_type,
  p_description text,
  p_area_landmark text,
  p_people_affected int,
  p_people_trapped public.tri_state,
  p_injuries_reported public.tri_state,
  p_vulnerable_people public.tri_state,
  p_danger_increasing public.tri_state,
  p_latitude double precision,
  p_longitude double precision,
  p_reporter_name text default null,
  p_reporter_phone text default null,
  p_ai_extracted jsonb default null,
  p_followup_question text default null,
  p_followup_field text default null,
  p_followup_answer public.tri_state default null,
  p_followup_skipped boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  created_incident public.incidents;
  raw_token text := replace(gen_random_uuid()::text, '-', '');
begin
  if length(trim(coalesce(p_description, ''))) < 10 then raise exception 'Description must be at least 10 characters'; end if;
  if p_people_affected < 0 then raise exception 'People affected cannot be negative'; end if;
  if p_latitude not between -90 and 90 or p_longitude not between -180 and 180 then raise exception 'Invalid coordinates'; end if;
  insert into public.incidents (
    type, description, area_landmark, people_affected, people_trapped,
    injuries_reported, vulnerable_people, danger_increasing, location,
    reporter_name, reporter_phone, reporter_user_id, tracking_token_hash,
    ai_extracted, followup_question, followup_field, followup_answer, followup_skipped
  ) values (
    p_type, trim(p_description), nullif(trim(coalesce(p_area_landmark, '')), ''),
    p_people_affected, p_people_trapped, p_injuries_reported,
    p_vulnerable_people, p_danger_increasing,
    st_setsrid(st_makepoint(p_longitude, p_latitude), 4326)::geography,
    nullif(trim(coalesce(p_reporter_name, '')), ''),
    nullif(trim(coalesce(p_reporter_phone, '')), ''),
    auth.uid(), encode(digest(raw_token, 'sha256'), 'hex'),
    case when p_ai_extracted is not null and pg_column_size(p_ai_extracted) <= 16384 then p_ai_extracted end,
    left(p_followup_question, 300), p_followup_field, p_followup_answer, coalesce(p_followup_skipped, false)
  ) returning * into created_incident;
  insert into public.audit_logs (actor, actor_user_id, actor_role, action, entity_type, entity_id, new_values, reason)
  values (
    case when auth.uid() is null then 'guest' else 'public-user' end,
    auth.uid(), 'public', 'incident_reported', 'incident', created_incident.id,
    jsonb_build_object('report_code', created_incident.report_code, 'type', created_incident.type,
      'followup_field', created_incident.followup_field, 'followup_skipped', created_incident.followup_skipped),
    'Emergency report submitted'
  );
  return jsonb_build_object(
    'id', created_incident.id,
    'report_code', created_incident.report_code,
    'tracking_token', raw_token
  );
end;
$$;

revoke execute on function public.submit_public_incident(public.incident_type,text,text,int,public.tri_state,public.tri_state,public.tri_state,public.tri_state,double precision,double precision,text,text,jsonb,text,text,public.tri_state,boolean) from public;
grant execute on function public.submit_public_incident(public.incident_type,text,text,int,public.tri_state,public.tri_state,public.tri_state,public.tri_state,double precision,double precision,text,text,jsonb,text,text,public.tri_state,boolean) to anon, authenticated;

-- ===================== BACKFILL =====================
update public.incidents set updated_at = updated_at;
