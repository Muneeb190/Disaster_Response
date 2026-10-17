/*
# Duplicate detection and combined incidents (features 15 and 16)

Potential duplicates are scored from incident type, distance, time and text
similarity. Coordinators decide whether to combine them. Combining never deletes
or overwrites a source report: it records the primary incident relationship and
keeps every report independently reviewable and reversible.
*/

create extension if not exists pg_trgm with schema extensions;

alter table public.incidents
  add column if not exists primary_incident_id uuid references public.incidents(id) on delete set null,
  add column if not exists linked_at timestamptz,
  add column if not exists linked_by uuid references public.profiles(id) on delete set null;

create index if not exists idx_incidents_primary_incident on public.incidents(primary_incident_id);

do $$ begin
  alter table public.incidents add constraint incidents_not_own_primary
    check (primary_incident_id is null or primary_incident_id <> id);
exception when duplicate_object then null; end $$;

create table if not exists public.incident_duplicate_candidates (
  incident_a_id uuid not null references public.incidents(id) on delete cascade,
  incident_b_id uuid not null references public.incidents(id) on delete cascade,
  score int not null check (score between 0 and 100),
  distance_m int not null,
  time_difference_minutes int not null,
  description_similarity numeric(5,4) not null,
  status text not null default 'suggested' check (status in ('suggested', 'linked', 'dismissed', 'unlinked')),
  reviewed_by uuid references public.profiles(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (incident_a_id, incident_b_id),
  check (incident_a_id::text < incident_b_id::text)
);
create index if not exists idx_duplicate_candidates_status on public.incident_duplicate_candidates(status, score desc);

create or replace function public.refresh_duplicate_candidates(p_incident_id uuid)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
declare target public.incidents;
begin
  select * into target from public.incidents where id = p_incident_id;
  if not found then return; end if;

  insert into public.incident_duplicate_candidates (
    incident_a_id, incident_b_id, score, distance_m,
    time_difference_minutes, description_similarity
  )
  select
    case when target.id::text < other.id::text then target.id else other.id end,
    case when target.id::text < other.id::text then other.id else target.id end,
    least(100, round(
      20
      + 40 * greatest(0, 1 - st_distance(target.location, other.location) / 1000.0)
      + 20 * greatest(0, 1 - abs(extract(epoch from (target.created_at - other.created_at))) / 86400.0)
      + 20 * extensions.similarity(lower(target.description), lower(other.description))
    ))::int,
    round(st_distance(target.location, other.location))::int,
    round(abs(extract(epoch from (target.created_at - other.created_at))) / 60.0)::int,
    extensions.similarity(lower(target.description), lower(other.description))::numeric(5,4)
  from public.incidents other
  where other.id <> target.id
    and other.type = target.type
    and other.primary_incident_id is null
    and target.primary_incident_id is null
    and other.created_at between target.created_at - interval '24 hours' and target.created_at + interval '24 hours'
    and st_dwithin(target.location, other.location, 1000)
    and (
      20
      + 40 * greatest(0, 1 - st_distance(target.location, other.location) / 1000.0)
      + 20 * greatest(0, 1 - abs(extract(epoch from (target.created_at - other.created_at))) / 86400.0)
      + 20 * extensions.similarity(lower(target.description), lower(other.description))
    ) >= 50
  on conflict (incident_a_id, incident_b_id) do update set
    score = excluded.score,
    distance_m = excluded.distance_m,
    time_difference_minutes = excluded.time_difference_minutes,
    description_similarity = excluded.description_similarity,
    updated_at = now()
  where public.incident_duplicate_candidates.status in ('suggested', 'unlinked');
end;
$$;

create or replace function public.detect_incident_duplicates()
returns trigger language plpgsql security definer set search_path = public, extensions as $$
begin
  perform public.refresh_duplicate_candidates(new.id);
  return new;
end;
$$;
drop trigger if exists trg_detect_incident_duplicates on public.incidents;
create trigger trg_detect_incident_duplicates
after insert on public.incidents for each row execute function public.detect_incident_duplicates();

create or replace function public.get_duplicate_candidates(p_incident_id uuid)
returns table (
  incident_id uuid, report_code text, type public.incident_type, description text,
  area_landmark text, priority_level public.priority_level, status public.incident_status,
  created_at timestamptz, score int, distance_m int, time_difference_minutes int,
  description_similarity numeric, review_status text
)
language plpgsql security definer set search_path = public, extensions as $$
begin
  if not private.is_admin() then raise exception 'Administrator access required'; end if;
  return query
  select i.id, i.report_code, i.type, i.description, i.area_landmark,
    i.priority_level, i.status, i.created_at, d.score, d.distance_m,
    d.time_difference_minutes, d.description_similarity::numeric, d.status
  from public.incident_duplicate_candidates d
  join public.incidents i on i.id = case when d.incident_a_id = p_incident_id then d.incident_b_id else d.incident_a_id end
  where p_incident_id in (d.incident_a_id, d.incident_b_id)
    and d.status in ('suggested', 'unlinked')
    and i.primary_incident_id is null
  order by d.score desc, d.distance_m asc;
end;
$$;

create or replace function public.link_duplicate_report(p_source_incident_id uuid, p_primary_incident_id uuid)
returns void language plpgsql security definer set search_path = public, extensions as $$
declare root_id uuid; source_code text; primary_code text;
begin
  if not private.is_admin() then raise exception 'Administrator access required'; end if;
  if p_source_incident_id = p_primary_incident_id then raise exception 'An incident cannot be linked to itself'; end if;

  select coalesce(primary_incident_id, id), report_code into root_id, primary_code
  from public.incidents where id = p_primary_incident_id for update;
  if not found then raise exception 'Primary incident not found'; end if;
  select report_code into source_code from public.incidents where id = p_source_incident_id for update;
  if not found then raise exception 'Source report not found'; end if;
  if p_source_incident_id = root_id then raise exception 'The primary incident cannot be linked beneath its own report'; end if;
  if exists (select 1 from public.assignments where incident_id = p_source_incident_id and status in ('assigned','dispatched')) then
    raise exception 'Cancel the source report''s active assignment before combining it';
  end if;

  update public.incidents
  set primary_incident_id = root_id, linked_at = now(), linked_by = auth.uid()
  where id = p_source_incident_id or primary_incident_id = p_source_incident_id;

  update public.incident_duplicate_candidates set status = 'linked', reviewed_by = auth.uid(), reviewed_at = now(), updated_at = now()
  where p_source_incident_id in (incident_a_id, incident_b_id)
    and root_id in (incident_a_id, incident_b_id);

  insert into public.audit_logs (actor, actor_user_id, actor_role, action, entity_type, entity_id, new_values, reason)
  values ('admin', auth.uid(), 'admin', 'duplicate_linked', 'incident', root_id,
    jsonb_build_object('source_incident_id', p_source_incident_id, 'source_report_code', source_code, 'primary_report_code', primary_code),
    'Duplicate report combined with primary incident');
end;
$$;

create or replace function public.unlink_duplicate_report(p_source_incident_id uuid)
returns void language plpgsql security definer set search_path = public, extensions as $$
declare old_primary uuid; source_code text;
begin
  if not private.is_admin() then raise exception 'Administrator access required'; end if;
  select primary_incident_id, report_code into old_primary, source_code
  from public.incidents where id = p_source_incident_id for update;
  if not found then raise exception 'Source report not found'; end if;
  if old_primary is null then raise exception 'Report is not linked'; end if;

  update public.incidents set primary_incident_id = null, linked_at = null, linked_by = null
  where id = p_source_incident_id;
  update public.incident_duplicate_candidates set status = 'unlinked', reviewed_by = auth.uid(), reviewed_at = now(), updated_at = now()
  where p_source_incident_id in (incident_a_id, incident_b_id)
    and old_primary in (incident_a_id, incident_b_id);
  perform public.refresh_duplicate_candidates(p_source_incident_id);

  insert into public.audit_logs (actor, actor_user_id, actor_role, action, entity_type, entity_id, new_values, reason)
  values ('admin', auth.uid(), 'admin', 'duplicate_unlinked', 'incident', old_primary,
    jsonb_build_object('source_incident_id', p_source_incident_id, 'source_report_code', source_code),
    'Report separated from combined incident');
end;
$$;

create or replace function public.reject_linked_report_assignment()
returns trigger language plpgsql set search_path = public as $$
begin
  if exists (select 1 from public.incidents where id = new.incident_id and primary_incident_id is not null) then
    raise exception 'Linked source reports cannot receive a separate team assignment';
  end if;
  return new;
end;
$$;
drop trigger if exists trg_reject_linked_report_assignment on public.assignments;
create trigger trg_reject_linked_report_assignment
before insert on public.assignments for each row execute function public.reject_linked_report_assignment();

alter table public.incident_duplicate_candidates enable row level security;
create policy duplicate_candidates_admin_all on public.incident_duplicate_candidates
for all to authenticated using (private.is_admin()) with check (private.is_admin());
grant select, insert, update, delete on public.incident_duplicate_candidates to authenticated;

revoke execute on function public.refresh_duplicate_candidates(uuid) from public, anon, authenticated;
revoke execute on function public.get_duplicate_candidates(uuid) from public, anon;
revoke execute on function public.link_duplicate_report(uuid, uuid) from public, anon;
revoke execute on function public.unlink_duplicate_report(uuid) from public, anon;
grant execute on function public.get_duplicate_candidates(uuid) to authenticated;
grant execute on function public.link_duplicate_report(uuid, uuid) to authenticated;
grant execute on function public.unlink_duplicate_report(uuid) to authenticated;

-- Generate suggestions for reports that already exist when this migration runs.
do $$ declare incident_row record; begin
  for incident_row in select id from public.incidents where primary_incident_id is null loop
    perform public.refresh_duplicate_candidates(incident_row.id);
  end loop;
end $$;
