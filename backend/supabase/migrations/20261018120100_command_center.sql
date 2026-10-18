/*
  ResQNet command center (features 21-30).

  - Demo data flags so seeded rows can carry a DEMO SCENARIO label (#21).
  - Shelters as their own table with facilities and freshness (#27).
  - Append-only incident timeline (#24) fed by triggers.
  - Alerts raised by the database for critical incidents, teams becoming
    unavailable, low stock, near-full shelters and cancellations (#28).
  - Admin functions that enforce business rules, require reasons and write
    the audit log (#20, #25, #26, #27, #30). Completing an assignment now
    releases the team and its reserved resources.
  - Every audit row records the signed-in user and role (#30).
  - Situation report facts computed in SQL and saved append-only (#29).

  Changes run inside admin functions can attach a reason to the triggers below
  with set_config('resqnet.reason', ..., true).
*/

-- ===================== DEMO FLAGS =====================
alter table public.rescue_teams add column if not exists is_demo boolean not null default false;
alter table public.resources add column if not exists is_demo boolean not null default false;
-- ===================== REMOVE SEED DATA =====================
-- The app now runs on real data only. Seed rows are identified by how they were made:
-- seeded incidents were inserted directly and never received a tracking token (real reports
-- always go through submit_public_incident), and the seed migration ran in one transaction,
-- so its teams and resources share one created_at. Seed teams that real responders already
-- belong to are kept as ordinary teams.
do $$
declare seed_ts timestamptz; seed_ids uuid[];
begin
  select created_at into seed_ts from public.rescue_teams where team_code = 'TM-0001';

  select coalesce(array_agg(id), '{}') into seed_ids from (
    select id from public.incidents where tracking_token_hash is null and reporter_user_id is null
    union all
    select id from public.rescue_teams t where t.created_at = seed_ts
      and not exists (select 1 from public.team_members m where m.team_id = t.id)
    union all
    select id from public.resources where created_at = seed_ts
  ) s;

  -- Assignments, escalations and alerts cascade from their incident.
  delete from public.incidents where id = any(seed_ids);
  delete from public.rescue_teams where id = any(seed_ids);
  delete from public.resources where id = any(seed_ids);
  delete from public.audit_logs where entity_id = any(seed_ids);

  -- Kept teams must not point at deleted seed assignments.
  update public.rescue_teams t set current_assignment_id = null,
    status = case when t.status = 'assigned' then 'available'::public.team_status else t.status end
  where t.current_assignment_id is not null
    and not exists (select 1 from public.assignments a where a.id = t.current_assignment_id);
end $$;
-- ===================== SHELTERS =====================
create table if not exists public.shelters (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  address text,
  location geography(point, 4326),
  capacity int not null check (capacity >= 0),
  occupancy int not null default 0 check (occupancy >= 0),
  status text not null default 'open' check (status in ('open', 'full', 'closed')),
  -- Facilities are null when unknown: never claim a facility we have not confirmed.
  wheelchair_access boolean,
  medical_support boolean,
  family_area boolean,
  has_power boolean,
  notes text,
  is_demo boolean not null default false,
  last_updated_at timestamptz not null default now(),
  last_updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint shelters_occupancy_within_capacity check (occupancy <= capacity)
);
create index if not exists idx_shelters_location on public.shelters using gist(location);
-- Move shelter rows out of the resources inventory (kept if any assignment references them).
insert into public.shelters (name, location, capacity, occupancy, is_demo, last_updated_at, created_at)
select r.name, r.location, r.quantity_available + r.quantity_reserved, r.quantity_reserved, r.is_demo, r.updated_at, r.created_at
from public.resources r
where r.type = 'shelter'
  and not exists (select 1 from public.shelters s where s.name = r.name);
delete from public.resources r
where r.type = 'shelter'
  and not exists (select 1 from public.assignments a where r.id = any(a.resource_ids));
create or replace function private.shelter_before_write()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.status <> 'closed' then
    new.status := case when new.occupancy >= new.capacity then 'full' else 'open' end;
  end if;
  if tg_op = 'INSERT'
     or (new.occupancy, new.capacity, new.status, new.wheelchair_access, new.medical_support, new.family_area, new.has_power)
        is distinct from (old.occupancy, old.capacity, old.status, old.wheelchair_access, old.medical_support, old.family_area, old.has_power) then
    new.last_updated_at := now();
    new.last_updated_by := coalesce(auth.uid(), new.last_updated_by);
  end if;
  new.updated_at := now();
  return new;
end;
$$;
drop trigger if exists trg_shelters_before_write on public.shelters;
create trigger trg_shelters_before_write before insert or update on public.shelters
  for each row execute function private.shelter_before_write();
-- ===================== AUDIT ATTRIBUTION =====================
-- Fill the signed-in user and role on every audit row, whichever function wrote it.
create or replace function private.audit_fill_actor()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  new.actor_user_id := coalesce(new.actor_user_id, auth.uid());
  if new.actor_user_id is not null and new.actor_role is null then
    new.actor_role := case
      when private.has_role('admin'::public.app_role, new.actor_user_id) then 'admin'::public.app_role
      when private.has_role('responder'::public.app_role, new.actor_user_id) then 'responder'::public.app_role
      else 'public'::public.app_role end;
  end if;
  return new;
end;
$$;
drop trigger if exists trg_audit_fill_actor on public.audit_logs;
create trigger trg_audit_fill_actor before insert on public.audit_logs
  for each row execute function private.audit_fill_actor();
-- Generic change log for operational tables edited from the admin screens.
create or replace function private.audit_row_change()
returns trigger language plpgsql security definer set search_path = '' as $$
declare changed jsonb; previous jsonb;
begin
  if current_setting('resqnet.skip_row_audit', true) = 'on' then return new; end if;
  if tg_op = 'INSERT' then
    insert into public.audit_logs (actor, action, entity_type, entity_id, new_values, reason)
    values ('admin', tg_argv[0] || '_created', tg_argv[0], new.id, to_jsonb(new) - 'location',
      nullif(current_setting('resqnet.reason', true), ''));
    return new;
  end if;
  select jsonb_object_agg(n.key, n.value), jsonb_object_agg(n.key, to_jsonb(old) -> n.key)
    into changed, previous
  from jsonb_each(to_jsonb(new)) n
  where n.key not in ('updated_at', 'last_updated_at', 'last_updated_by')
    and n.value is distinct from to_jsonb(old) -> n.key;
  if changed is null then return new; end if;
  insert into public.audit_logs (actor, action, entity_type, entity_id, previous_values, new_values, reason)
  values ('admin', tg_argv[0] || '_updated', tg_argv[0], new.id, previous - 'location', changed - 'location',
    nullif(current_setting('resqnet.reason', true), ''));
  return new;
end;
$$;
drop trigger if exists trg_audit_teams on public.rescue_teams;
create trigger trg_audit_teams after insert or update on public.rescue_teams
  for each row execute function private.audit_row_change('team');
drop trigger if exists trg_audit_resources on public.resources;
create trigger trg_audit_resources after insert or update on public.resources
  for each row execute function private.audit_row_change('resource');
drop trigger if exists trg_audit_shelters on public.shelters;
create trigger trg_audit_shelters after insert or update on public.shelters
  for each row execute function private.audit_row_change('shelter');
-- ===================== ALERT LINKS =====================
alter table public.alerts
  add column if not exists entity_type text,
  add column if not exists entity_id uuid;
-- ===================== INCIDENT TIMELINE =====================
create table if not exists public.incident_events (
  id uuid primary key default gen_random_uuid(),
  incident_id uuid not null references public.incidents(id) on delete cascade,
  event_type text not null,
  from_value text,
  to_value text,
  details jsonb,
  reason text,
  actor_user_id uuid references public.profiles(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now()
);
create index if not exists idx_incident_events_incident on public.incident_events(incident_id, created_at);
create index if not exists idx_incident_events_created on public.incident_events(created_at desc);
create or replace function private.incident_after_write()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_reason text := nullif(current_setting('resqnet.reason', true), ''); changed jsonb;
begin
  if tg_op = 'INSERT' then
    insert into public.incident_events (incident_id, event_type, to_value, reason, created_at)
    values (new.id, 'reported', new.status::text, 'Report received', new.created_at);
    if new.priority_level = 'critical' or new.life_threatening then
      insert into public.alerts (incident_id, type, severity, message, dedup_key, entity_type, entity_id)
      values (new.id, 'critical_incident', case when new.priority_level = 'critical' then 'critical' else 'high' end::public.priority_level,
        format('New %s incident %s%s', new.priority_level, new.report_code, case when new.life_threatening then ' — danger to life reported' else '' end),
        'new-' || new.id::text, 'incident', new.id);
    end if;
    return new;
  end if;

  if new.status is distinct from old.status then
    insert into public.incident_events (incident_id, event_type, from_value, to_value, reason)
    values (new.id, 'status_changed', old.status::text, new.status::text, v_reason);
  end if;
  if new.verification_status is distinct from old.verification_status then
    insert into public.incident_events (incident_id, event_type, from_value, to_value, reason)
    values (new.id, 'verification_changed', old.verification_status::text, new.verification_status::text, v_reason);
  end if;
  if (new.priority_score, new.priority_level) is distinct from (old.priority_score, old.priority_level) then
    insert into public.incident_events (incident_id, event_type, from_value, to_value, details, reason)
    values (new.id, 'priority_changed', format('%s (%s)', old.priority_level, old.priority_score),
      format('%s (%s)', new.priority_level, new.priority_score), jsonb_build_object('reasons', new.priority_reasons), v_reason);
  end if;
  select jsonb_object_agg(n.key, jsonb_build_object('from', to_jsonb(old) -> n.key, 'to', n.value)) into changed
  from jsonb_each(to_jsonb(new)) n
  where n.key in ('type', 'people_affected', 'people_trapped', 'injuries_reported', 'vulnerable_people', 'danger_increasing', 'area_landmark')
    and n.value is distinct from to_jsonb(old) -> n.key;
  if changed is not null then
    insert into public.incident_events (incident_id, event_type, details, reason)
    values (new.id, 'facts_updated', changed, v_reason);
  end if;
  if new.coordinator_notes is distinct from old.coordinator_notes then
    insert into public.incident_events (incident_id, event_type, reason) values (new.id, 'notes_updated', v_reason);
  end if;
  return new;
end;
$$;
drop trigger if exists trg_incident_after_write on public.incidents;
create trigger trg_incident_after_write after insert or update on public.incidents
  for each row execute function private.incident_after_write();
create or replace function private.assignment_after_write()
returns trigger language plpgsql security definer set search_path = '' as $$
declare team_label text;
begin
  select team_code || ' · ' || name into team_label from public.rescue_teams where id = new.team_id;
  if tg_op = 'INSERT' then
    insert into public.incident_events (incident_id, event_type, to_value, details, created_at)
    values (new.incident_id, 'team_assigned', team_label, jsonb_build_object('assignment_id', new.id, 'team_id', new.team_id), new.assigned_at);
    return new;
  end if;
  if new.status is distinct from old.status then
    insert into public.incident_events (incident_id, event_type, from_value, to_value, details, reason)
    values (new.incident_id, 'assignment_' || new.status::text, old.status::text, team_label,
      jsonb_build_object('assignment_id', new.id, 'team_id', new.team_id),
      coalesce(new.cancellation_reason, nullif(current_setting('resqnet.reason', true), '')));
    if new.status = 'cancelled' then
      insert into public.alerts (incident_id, type, severity, message, dedup_key, entity_type, entity_id)
      values (new.incident_id, 'assignment_cancelled', 'high',
        format('Assignment for %s cancelled — incident needs a new team', team_label),
        'cancel-' || new.id::text, 'assignment', new.id);
    end if;
  end if;
  return new;
end;
$$;
drop trigger if exists trg_assignment_after_write on public.assignments;
create trigger trg_assignment_after_write after insert or update on public.assignments
  for each row execute function private.assignment_after_write();
-- Backfill history for existing records.
insert into public.incident_events (incident_id, event_type, to_value, reason, created_at, actor_user_id)
select i.id, 'reported', 'reported', 'Report received', i.created_at, null
from public.incidents i
where not exists (select 1 from public.incident_events e where e.incident_id = i.id and e.event_type = 'reported');
insert into public.incident_events (incident_id, event_type, to_value, details, reason, created_at, actor_user_id)
select a.incident_id, x.event_type, t.team_code || ' · ' || t.name, jsonb_build_object('assignment_id', a.id, 'team_id', a.team_id), x.reason, x.at, null
from public.assignments a
join public.rescue_teams t on t.id = a.team_id
cross join lateral (values
  ('team_assigned', a.assigned_at, null::text),
  ('assignment_dispatched', a.dispatched_at, null::text),
  ('assignment_completed', a.completed_at, null::text),
  ('assignment_cancelled', a.cancelled_at, a.cancellation_reason)
) as x(event_type, at, reason)
where x.at is not null
  and not exists (select 1 from public.incident_events e where e.incident_id = a.incident_id and e.event_type = x.event_type and e.created_at = x.at);
-- ===================== DATABASE ALERTS =====================
create or replace function private.team_after_status()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.status in ('unavailable', 'offline') and old.status not in ('unavailable', 'offline') and new.current_assignment_id is not null then
    insert into public.alerts (incident_id, type, severity, message, dedup_key, entity_type, entity_id)
    select a.incident_id, 'team_unavailable', 'critical',
      format('%s became %s during an active assignment — reassign the incident', new.team_code, new.status),
      'team-unavail-' || new.id::text || '-' || extract(epoch from now())::bigint, 'team', new.id
    from public.assignments a where a.id = new.current_assignment_id;
  end if;
  return new;
end;
$$;
drop trigger if exists trg_team_after_status on public.rescue_teams;
create trigger trg_team_after_status after update of status on public.rescue_teams
  for each row execute function private.team_after_status();
create or replace function private.resource_after_stock()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.quantity_available <= new.low_stock_threshold
     and (tg_op = 'INSERT' or old.quantity_available > old.low_stock_threshold) then
    insert into public.alerts (type, severity, message, dedup_key, entity_type, entity_id)
    values ('low_stock', case when new.quantity_available = 0 then 'critical' else 'high' end::public.priority_level,
      format('%s is low: %s available (threshold %s)', new.name, new.quantity_available, new.low_stock_threshold),
      'low-' || new.id::text || '-' || extract(epoch from now())::bigint, 'resource', new.id);
  end if;
  return new;
end;
$$;
drop trigger if exists trg_resource_after_stock on public.resources;
create trigger trg_resource_after_stock after insert or update of quantity_available, low_stock_threshold on public.resources
  for each row execute function private.resource_after_stock();
create or replace function private.shelter_after_occupancy()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.capacity > 0 and new.occupancy >= ceil(new.capacity * 0.9)
     and (tg_op = 'INSERT' or old.occupancy < ceil(old.capacity * 0.9)) then
    insert into public.alerts (type, severity, message, dedup_key, entity_type, entity_id)
    values ('shelter_near_full', case when new.occupancy >= new.capacity then 'critical' else 'high' end::public.priority_level,
      format('Shelter %s is %s%% full (%s / %s)', new.name, round(100.0 * new.occupancy / new.capacity), new.occupancy, new.capacity),
      'shelter-' || new.id::text || '-' || extract(epoch from now())::bigint, 'shelter', new.id);
  end if;
  return new;
end;
$$;
drop trigger if exists trg_shelter_after_occupancy on public.shelters;
create trigger trg_shelter_after_occupancy after insert or update of occupancy, capacity on public.shelters
  for each row execute function private.shelter_after_occupancy();
-- ===================== PRIORITY ESCALATION FIX =====================
-- priority_level is declared critical < high < moderate < low, so a smaller
-- enum value is more urgent. The old check compared the labels as text.
create or replace function public.recalculate_incident_priority(p_incident_id uuid, p_actor text default 'system')
returns table(new_score int, new_level priority_level, reasons text[], life_threatening boolean, escalated boolean)
language plpgsql security invoker set search_path = public as $$
declare old_score int; old_level priority_level; v_score int; v_level priority_level; r text[]; lt boolean; esc boolean := false; inc record;
begin
  select * into inc from incidents where id = p_incident_id;
  if not found then raise exception 'Incident not found'; end if;
  old_score := inc.priority_score; old_level := inc.priority_level;
  select * into v_score, v_level, r, lt from calculate_priority(inc.people_trapped, inc.injuries_reported, inc.vulnerable_people, inc.danger_increasing, inc.people_affected);
  update incidents set priority_score = v_score, priority_level = v_level, priority_reasons = r, life_threatening = lt,
    previous_priority_score = old_score, previous_priority_level = old_level, updated_at = now()
  where id = p_incident_id;
  insert into audit_logs (actor, action, entity_type, entity_id, previous_values, new_values, reason)
  values (p_actor, 'priority_recalculate', 'incident', p_incident_id, jsonb_build_object('score', old_score, 'level', old_level),
    jsonb_build_object('score', v_score, 'level', v_level, 'reasons', r), 'Priority recalculated');
  if v_score > old_score or v_level < old_level or (lt and not inc.life_threatening) then
    esc := true;
    insert into escalations (incident_id, previous_score, new_score, previous_level, new_level, reason)
    values (p_incident_id, old_score, v_score, old_level, v_level, format('Priority increased from %s (%s) to %s (%s)', old_score, old_level, v_score, v_level));
    insert into alerts (incident_id, type, severity, message, dedup_key, entity_type, entity_id)
    values (p_incident_id, 'escalation', v_level, format('Incident %s escalated to %s (score %s)', inc.report_code, v_level, v_score),
      'esc-' || p_incident_id::text || '-' || v_score::text, 'incident', p_incident_id);
  end if;
  return query select v_score, v_level, r, lt, esc;
end;
$$;
-- ===================== ADMIN FUNCTIONS =====================
create or replace function public.admin_set_assignment_status(p_assignment_id uuid, p_status public.assignment_status, p_reason text default null)
returns public.assignments language plpgsql security definer set search_path = public as $$
declare a assignments; rid uuid; v_reason text := nullif(trim(coalesce(p_reason, '')), '');
begin
  if not private.is_admin() then raise exception 'Administrator access required'; end if;
  select * into a from assignments where id = p_assignment_id for update;
  if not found then raise exception 'Assignment not found'; end if;
  if a.status in ('completed', 'cancelled') then raise exception 'Assignment is already %', a.status; end if;
  perform set_config('resqnet.reason', coalesce(v_reason, ''), true);

  if p_status = 'cancelled' then
    if v_reason is null then raise exception 'A reason is required to cancel an assignment'; end if;
    perform cancel_assignment(p_assignment_id, v_reason, 'admin');
  elsif p_status = 'dispatched' then
    if a.status <> 'assigned' then raise exception 'Only an assigned team can be dispatched'; end if;
    update assignments set status = 'dispatched', dispatched_at = now(), updated_at = now() where id = p_assignment_id;
    update rescue_teams set status = 'en_route', updated_at = now() where id = a.team_id;
    update incidents set status = 'dispatched', updated_at = now() where id = a.incident_id;
  elsif p_status = 'completed' then
    update assignments set status = 'completed', completed_at = now(), updated_at = now() where id = p_assignment_id;
    update rescue_teams set status = 'available', current_assignment_id = null, updated_at = now() where id = a.team_id;
    -- ponytail: reserved items return to stock on completion (boats, vehicles); consumables need the resource ledger (#38).
    foreach rid in array a.resource_ids loop
      update resources set quantity_reserved = greatest(0, quantity_reserved - 1), quantity_available = quantity_available + 1, updated_at = now() where id = rid;
    end loop;
    update incidents set status = 'resolved', updated_at = now() where id = a.incident_id;
  else
    raise exception 'Unsupported assignment status %', p_status;
  end if;

  insert into audit_logs (actor, action, entity_type, entity_id, previous_values, new_values, reason)
  values ('admin', 'assignment_status_changed', 'assignment', p_assignment_id,
    jsonb_build_object('status', a.status), jsonb_build_object('status', p_status), v_reason);
  select * into a from assignments where id = p_assignment_id;
  return a;
end;
$$;
create or replace function public.admin_update_incident(p_incident_id uuid, p_changes jsonb, p_reason text default null)
returns public.incidents language plpgsql security definer set search_path = public as $$
declare
  inc incidents; result incidents; k text; active_id uuid; new_status incident_status;
  v_reason text := nullif(trim(coalesce(p_reason, '')), '');
  facts_changed boolean;
  allowed text[] := array['status', 'verification_status', 'coordinator_notes', 'type', 'people_affected', 'people_trapped',
    'injuries_reported', 'vulnerable_people', 'danger_increasing', 'area_landmark'];
begin
  if not private.is_admin() then raise exception 'Administrator access required'; end if;
  if p_changes is null or p_changes = '{}'::jsonb then raise exception 'No changes provided'; end if;
  for k in select jsonb_object_keys(p_changes) loop
    if not k = any(allowed) then raise exception 'Field % cannot be changed here', k; end if;
  end loop;
  select * into inc from incidents where id = p_incident_id for update;
  if not found then raise exception 'Incident not found'; end if;

  facts_changed := p_changes ?| array['type', 'people_affected', 'people_trapped', 'injuries_reported', 'vulnerable_people', 'danger_increasing'];
  if (facts_changed or p_changes ? 'status' or p_changes ? 'verification_status') and v_reason is null then
    raise exception 'A reason is required for this change';
  end if;
  perform set_config('resqnet.reason', coalesce(v_reason, ''), true);

  if p_changes ? 'status' then
    new_status := (p_changes ->> 'status')::incident_status;
    if new_status in ('assigned', 'dispatched') then raise exception 'Use the assignment workflow to assign or dispatch a team'; end if;
    select id into active_id from assignments where incident_id = p_incident_id and status in ('assigned', 'dispatched') limit 1;
    if active_id is not null then
      if new_status = 'resolved' then perform admin_set_assignment_status(active_id, 'completed', v_reason);
      elsif new_status = 'cancelled' then perform admin_set_assignment_status(active_id, 'cancelled', v_reason);
      else raise exception 'Complete or cancel the active assignment first'; end if;
    end if;
  end if;

  update incidents set
    status = coalesce(new_status, status),
    verification_status = case when p_changes ? 'verification_status' then (p_changes ->> 'verification_status')::verification_status else verification_status end,
    coordinator_notes = case when p_changes ? 'coordinator_notes' then nullif(trim(p_changes ->> 'coordinator_notes'), '') else coordinator_notes end,
    type = case when p_changes ? 'type' then (p_changes ->> 'type')::incident_type else type end,
    people_affected = case when p_changes ? 'people_affected' then greatest(0, (p_changes ->> 'people_affected')::int) else people_affected end,
    people_trapped = case when p_changes ? 'people_trapped' then (p_changes ->> 'people_trapped')::tri_state else people_trapped end,
    injuries_reported = case when p_changes ? 'injuries_reported' then (p_changes ->> 'injuries_reported')::tri_state else injuries_reported end,
    vulnerable_people = case when p_changes ? 'vulnerable_people' then (p_changes ->> 'vulnerable_people')::tri_state else vulnerable_people end,
    danger_increasing = case when p_changes ? 'danger_increasing' then (p_changes ->> 'danger_increasing')::tri_state else danger_increasing end,
    area_landmark = case when p_changes ? 'area_landmark' then nullif(trim(p_changes ->> 'area_landmark'), '') else area_landmark end,
    updated_at = now()
  where id = p_incident_id;

  insert into audit_logs (actor, action, entity_type, entity_id, previous_values, new_values, reason)
  values ('admin', 'incident_updated', 'incident', p_incident_id,
    (select jsonb_object_agg(key, to_jsonb(inc) -> key) from jsonb_object_keys(p_changes) key), p_changes, v_reason);

  if facts_changed then perform recalculate_incident_priority(p_incident_id, 'admin'); end if;
  select * into result from incidents where id = p_incident_id;
  return result;
end;
$$;
create or replace function public.admin_set_team_status(p_team_id uuid, p_status public.team_status, p_reason text default null)
returns public.rescue_teams language plpgsql security definer set search_path = public as $$
declare t rescue_teams; old_status team_status; v_reason text := nullif(trim(coalesce(p_reason, '')), '');
begin
  if not private.is_admin() then raise exception 'Administrator access required'; end if;
  select * into t from rescue_teams where id = p_team_id for update;
  if not found then raise exception 'Team not found'; end if;
  if p_status = t.status then return t; end if;
  old_status := t.status;
  if p_status in ('assigned', 'en_route') then raise exception 'Busy and travelling are set automatically by assignments'; end if;
  if p_status = 'available' and t.current_assignment_id is not null then
    raise exception 'This team has an active assignment. Complete or cancel it first';
  end if;
  if p_status in ('unavailable', 'offline') and v_reason is null then raise exception 'A reason is required'; end if;

  perform set_config('resqnet.reason', coalesce(v_reason, ''), true);
  perform set_config('resqnet.skip_row_audit', 'on', true);
  update rescue_teams set status = p_status, updated_at = now() where id = p_team_id returning * into t;
  perform set_config('resqnet.skip_row_audit', 'off', true);
  insert into audit_logs (actor, action, entity_type, entity_id, previous_values, new_values, reason)
  values ('admin', 'team_status_changed', 'team', p_team_id, jsonb_build_object('status', old_status), jsonb_build_object('status', p_status), v_reason);
  return t;
end;
$$;
create or replace function public.admin_adjust_resource(p_resource_id uuid, p_delta int, p_reason text)
returns public.resources language plpgsql security definer set search_path = public as $$
declare r resources; v_reason text := nullif(trim(coalesce(p_reason, '')), '');
begin
  if not private.is_admin() then raise exception 'Administrator access required'; end if;
  if v_reason is null then raise exception 'A reason is required to change stock'; end if;
  if coalesce(p_delta, 0) = 0 then raise exception 'Quantity change cannot be zero'; end if;
  select * into r from resources where id = p_resource_id for update;
  if not found then raise exception 'Resource not found'; end if;
  if r.quantity_available + p_delta < 0 then
    raise exception 'Not enough stock: only % available', r.quantity_available;
  end if;
  perform set_config('resqnet.skip_row_audit', 'on', true);
  update resources set quantity_available = quantity_available + p_delta, updated_at = now() where id = p_resource_id returning * into r;
  perform set_config('resqnet.skip_row_audit', 'off', true);
  insert into audit_logs (actor, action, entity_type, entity_id, previous_values, new_values, reason)
  values ('admin', 'resource_adjusted', 'resource', p_resource_id,
    jsonb_build_object('quantity_available', r.quantity_available - p_delta),
    jsonb_build_object('quantity_available', r.quantity_available, 'delta', p_delta), v_reason);
  return r;
end;
$$;
create or replace function public.admin_adjust_shelter_occupancy(p_shelter_id uuid, p_delta int, p_reason text default null)
returns public.shelters language plpgsql security definer set search_path = public as $$
declare s shelters;
begin
  if not private.is_admin() then raise exception 'Administrator access required'; end if;
  if coalesce(p_delta, 0) = 0 then raise exception 'Occupancy change cannot be zero'; end if;
  select * into s from shelters where id = p_shelter_id for update;
  if not found then raise exception 'Shelter not found'; end if;
  if s.status = 'closed' and p_delta > 0 then raise exception 'Shelter is closed'; end if;
  if s.occupancy + p_delta > s.capacity then
    raise exception 'Shelter only has % spaces left', s.capacity - s.occupancy;
  end if;
  if s.occupancy + p_delta < 0 then raise exception 'Occupancy cannot go below zero'; end if;
  perform set_config('resqnet.skip_row_audit', 'on', true);
  update shelters set occupancy = occupancy + p_delta where id = p_shelter_id returning * into s;
  perform set_config('resqnet.skip_row_audit', 'off', true);
  insert into audit_logs (actor, action, entity_type, entity_id, previous_values, new_values, reason)
  values ('admin', 'shelter_occupancy_changed', 'shelter', p_shelter_id,
    jsonb_build_object('occupancy', s.occupancy - p_delta), jsonb_build_object('occupancy', s.occupancy, 'delta', p_delta),
    nullif(trim(coalesce(p_reason, '')), ''));
  return s;
end;
$$;
create or replace function public.acknowledge_alert(p_alert_id uuid)
returns public.alerts language plpgsql security definer set search_path = public as $$
declare a alerts;
begin
  if not private.is_admin() then raise exception 'Administrator access required'; end if;
  update alerts set acknowledged = true, acknowledged_at = now(), acknowledged_by = auth.uid()
  where id = p_alert_id and not acknowledged returning * into a;
  if not found then
    select * into a from alerts where id = p_alert_id;
    if not found then raise exception 'Alert not found'; end if;
    return a;
  end if;
  insert into audit_logs (actor, action, entity_type, entity_id, new_values, reason)
  values ('admin', 'alert_acknowledged', 'alert', p_alert_id, jsonb_build_object('message', a.message), null);
  return a;
end;
$$;
-- Responders: dispatch now marks the team travelling, completion releases reserved resources.
create or replace function public.responder_update_assignment_status(p_assignment_id uuid, p_status public.assignment_status)
returns public.assignments
language plpgsql
security definer
set search_path = ''
as $$
declare current_assignment public.assignments; result public.assignments; rid uuid;
begin
  select * into current_assignment from public.assignments where id = p_assignment_id for update;
  if not found then raise exception 'Assignment not found'; end if;
  if not private.is_team_member(current_assignment.team_id) then raise exception 'Not authorized for this team'; end if;
  if p_status not in ('dispatched', 'completed') then raise exception 'Responders can only mark assignments dispatched or completed'; end if;
  if current_assignment.status = 'assigned' and p_status <> 'dispatched' then raise exception 'Assignment must be accepted before completion'; end if;
  if current_assignment.status = 'dispatched' and p_status <> 'completed' then raise exception 'Invalid assignment transition'; end if;
  if current_assignment.status in ('completed', 'cancelled') then raise exception 'Assignment is already closed'; end if;

  update public.assignments
  set status = p_status,
      dispatched_at = case when p_status = 'dispatched' then now() else dispatched_at end,
      completed_at = case when p_status = 'completed' then now() else completed_at end,
      updated_at = now()
  where id = p_assignment_id returning * into result;

  if p_status = 'completed' then
    update public.rescue_teams set status = 'available', current_assignment_id = null where id = result.team_id;
    foreach rid in array result.resource_ids loop
      update public.resources set quantity_reserved = greatest(0, quantity_reserved - 1), quantity_available = quantity_available + 1, updated_at = now() where id = rid;
    end loop;
    update public.incidents set status = 'resolved' where id = result.incident_id;
  else
    update public.rescue_teams set status = 'en_route' where id = result.team_id;
    update public.incidents set status = 'dispatched' where id = result.incident_id;
  end if;

  insert into public.audit_logs (actor, action, entity_type, entity_id, new_values, reason)
  values ('responder', 'assignment_status_changed', 'assignment', result.id,
    jsonb_build_object('status', p_status), 'Responder updated assignment status');
  return result;
end;
$$;
-- ===================== SITUATION REPORTS =====================
create table if not exists public.situation_reports (
  id uuid primary key default gen_random_uuid(),
  period_hours int not null,
  facts jsonb not null,
  notes text,
  reviewed_by uuid references public.profiles(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now()
);
create index if not exists idx_situation_reports_created on public.situation_reports(created_at desc);
create or replace function public.situation_summary(p_hours int default 12)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare since timestamptz := now() - make_interval(hours => greatest(1, least(coalesce(p_hours, 12), 168)));
begin
  if not private.is_admin() then raise exception 'Administrator access required'; end if;
  return jsonb_build_object(
    'generated_at', now(),
    'period_hours', greatest(1, least(coalesce(p_hours, 12), 168)),
    'contains_demo_data', exists (select 1 from incidents where is_demo) or exists (select 1 from rescue_teams where is_demo)
      or exists (select 1 from resources where is_demo) or exists (select 1 from shelters where is_demo),
    'incidents', (select jsonb_build_object(
        'open', count(*) filter (where status not in ('resolved', 'cancelled')),
        'critical_open', count(*) filter (where priority_level = 'critical' and status not in ('resolved', 'cancelled')),
        'unassigned_open', count(*) filter (where status in ('reported', 'verified')),
        'unverified_open', count(*) filter (where verification_status = 'pending' and status not in ('resolved', 'cancelled')),
        'reported_in_period', count(*) filter (where created_at >= since),
        'resolved_in_period', (select count(distinct incident_id) from incident_events where event_type = 'status_changed' and to_value = 'resolved' and created_at >= since)
      ) from incidents),
    'urgent', (select coalesce(jsonb_agg(u order by u.priority_score desc, u.created_at), '[]'::jsonb) from (
        select report_code, type, area_landmark, priority_level, priority_score, status, verification_status, life_threatening, created_at
        from incidents where status not in ('resolved', 'cancelled') and priority_level in ('critical', 'high')
        order by priority_score desc, created_at limit 10) u),
    'teams', (select coalesce(jsonb_object_agg(status, n), '{}'::jsonb) from (select status::text, count(*) n from rescue_teams group by status) s),
    'active_assignments', (select count(*) from assignments where status in ('assigned', 'dispatched')),
    'shortages', (select coalesce(jsonb_agg(jsonb_build_object('name', name, 'type', type, 'available', quantity_available, 'threshold', low_stock_threshold)
        order by quantity_available), '[]'::jsonb) from resources where quantity_available <= low_stock_threshold),
    'shelters', (select jsonb_build_object(
        'open', count(*) filter (where status = 'open'), 'full', count(*) filter (where status = 'full'),
        'capacity', coalesce(sum(capacity) filter (where status <> 'closed'), 0),
        'occupancy', coalesce(sum(occupancy) filter (where status <> 'closed'), 0),
        'stale', count(*) filter (where status <> 'closed' and last_updated_at < now() - interval '6 hours')) from shelters),
    'alerts_unacknowledged', (select count(*) from alerts where not acknowledged),
    'recent_changes', (select coalesce(jsonb_agg(c order by c.created_at desc), '[]'::jsonb) from (
        select i.report_code, e.event_type, e.from_value, e.to_value, e.reason, e.created_at
        from incident_events e join incidents i on i.id = e.incident_id
        where e.created_at >= since and e.event_type <> 'reported'
        order by e.created_at desc limit 15) c)
  );
end;
$$;
create or replace function public.save_situation_report(p_hours int, p_notes text default null)
returns public.situation_reports language plpgsql security definer set search_path = public as $$
declare r situation_reports; v_hours int := greatest(1, least(coalesce(p_hours, 12), 168));
begin
  if not private.is_admin() then raise exception 'Administrator access required'; end if;
  insert into situation_reports (period_hours, facts, notes)
  values (v_hours, situation_summary(v_hours), nullif(trim(coalesce(p_notes, '')), '')) returning * into r;
  insert into audit_logs (actor, action, entity_type, entity_id, new_values, reason)
  values ('admin', 'situation_report_saved', 'situation_report', r.id, jsonb_build_object('period_hours', v_hours), 'Situation report reviewed and saved');
  return r;
end;
$$;
-- ===================== ACCESS CONTROL =====================
alter table public.shelters enable row level security;
alter table public.incident_events enable row level security;
alter table public.situation_reports enable row level security;
drop policy if exists shelters_admin_all on public.shelters;
create policy shelters_admin_all on public.shelters for all to authenticated using (private.is_admin()) with check (private.is_admin());
drop policy if exists shelters_responder_read on public.shelters;
create policy shelters_responder_read on public.shelters for select to authenticated
  using (private.has_role('responder'::public.app_role, auth.uid()));
drop policy if exists incident_events_admin_read on public.incident_events;
create policy incident_events_admin_read on public.incident_events for select to authenticated using (private.is_admin());
drop policy if exists incident_events_responder_read on public.incident_events;
create policy incident_events_responder_read on public.incident_events for select to authenticated
  using (exists (select 1 from public.assignments a where a.incident_id = incident_events.incident_id and private.is_team_member(a.team_id)));
drop policy if exists situation_reports_admin_read on public.situation_reports;
create policy situation_reports_admin_read on public.situation_reports for select to authenticated using (private.is_admin());
revoke all on public.shelters, public.incident_events, public.situation_reports from anon, public;
grant select, insert, update on public.shelters to authenticated;
grant select on public.incident_events, public.situation_reports to authenticated;
-- History is append-only: nobody deletes incidents, assignments, alerts or escalations from the app.
revoke delete on public.incidents, public.assignments, public.alerts, public.escalations, public.audit_logs from authenticated;
do $$
declare fn text;
begin
  foreach fn in array array[
    'public.admin_set_assignment_status(uuid, public.assignment_status, text)',
    'public.admin_update_incident(uuid, jsonb, text)',
    'public.admin_set_team_status(uuid, public.team_status, text)',
    'public.admin_adjust_resource(uuid, int, text)',
    'public.admin_adjust_shelter_occupancy(uuid, int, text)',
    'public.acknowledge_alert(uuid)',
    'public.situation_summary(int)',
    'public.save_situation_report(int, text)',
    'public.recalculate_incident_priority(uuid, text)',
    'public.responder_update_assignment_status(uuid, public.assignment_status)'
  ] loop
    execute format('revoke execute on function %s from public, anon', fn);
    execute format('grant execute on function %s to authenticated', fn);
  end loop;
end $$;
-- ===================== REALTIME =====================
do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'shelters') then
    alter publication supabase_realtime add table public.shelters;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'incident_events') then
    alter publication supabase_realtime add table public.incident_events;
  end if;
end $$;
