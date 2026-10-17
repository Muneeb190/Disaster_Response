-- =====================================================================
-- ResQNet PostgreSQL Schema
-- Standalone PostgreSQL 14+ with PostGIS and pgcrypto
-- =====================================================================

create extension if not exists "postgis";
create extension if not exists "pgcrypto";

-- ===================== SEQUENCES =====================
create sequence if not exists report_code_seq start 1;

create or replace function increment_report_code()
returns text language sql as $$
  select 'RN-' || lpad(nextval('report_code_seq')::text, 6, '0');
$$;

-- ===================== ENUMS =====================
do $$ begin create type incident_type as enum ('flood','fire','medical_emergency','heatwave','other'); exception when duplicate_object then null; end $$;
do $$ begin create type tri_state as enum ('yes','no','unknown'); exception when duplicate_object then null; end $$;
do $$ begin create type priority_level as enum ('critical','high','moderate','low'); exception when duplicate_object then null; end $$;
do $$ begin create type incident_status as enum ('reported','verified','assigned','dispatched','resolved','cancelled'); exception when duplicate_object then null; end $$;
do $$ begin create type verification_status as enum ('pending','verified','disputed','flagged'); exception when duplicate_object then null; end $$;
do $$ begin create type team_status as enum ('available','assigned','offline'); exception when duplicate_object then null; end $$;
do $$ begin create type assignment_status as enum ('assigned','dispatched','completed','cancelled'); exception when duplicate_object then null; end $$;

-- ===================== TABLES =====================

-- 1. Incidents
create table if not exists incidents (
  id uuid primary key default gen_random_uuid(),
  report_code text not null default increment_report_code() unique,
  type incident_type not null,
  description text not null,
  area_landmark text,
  people_affected int not null default 0 check (people_affected >= 0),
  people_trapped tri_state not null default 'unknown',
  injuries_reported tri_state not null default 'unknown',
  vulnerable_people tri_state not null default 'unknown',
  danger_increasing tri_state not null default 'unknown',
  location geography(point, 4326) not null,
  priority_score int not null default 0 check (priority_score between 0 and 100),
  priority_level priority_level not null default 'low',
  priority_reasons text[] not null default '{}',
  life_threatening boolean not null default false,
  previous_priority_score int,
  previous_priority_level priority_level,
  verification_status verification_status not null default 'pending',
  status incident_status not null default 'reported',
  assigned_team_id uuid,
  reporter_name text,
  reporter_phone text,
  ai_extracted jsonb,
  coordinator_notes text,
  photo_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_incidents_status on incidents(status);
create index if not exists idx_incidents_priority on incidents(priority_score desc);
create index if not exists idx_incidents_created on incidents(created_at desc);
create index if not exists idx_incidents_type on incidents(type);
create index if not exists idx_incidents_location on incidents using gist(location);

-- 2. Rescue Teams
create table if not exists rescue_teams (
  id uuid primary key default gen_random_uuid(),
  team_code text not null default ('TM-' || lpad(nextval('report_code_seq')::text, 4, '0')) unique,
  name text not null,
  capabilities text[] not null default '{}',
  equipment text[] not null default '{}',
  capacity int not null default 4 check (capacity >= 0),
  status team_status not null default 'available',
  location geography(point, 4326),
  current_assignment_id uuid,
  last_location_update timestamptz default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_teams_status on rescue_teams(status);
create index if not exists idx_teams_location on rescue_teams using gist(location);

-- 3. Resources & Depots
create table if not exists resources (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  type text not null,
  quantity_available int not null default 0 check (quantity_available >= 0),
  quantity_reserved int not null default 0 check (quantity_reserved >= 0),
  location geography(point, 4326),
  low_stock_threshold int not null default 5,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_resources_type on resources(type);

-- 4. Assignments
create table if not exists assignments (
  id uuid primary key default gen_random_uuid(),
  incident_id uuid not null references incidents(id) on delete cascade,
  team_id uuid not null references rescue_teams(id) on delete restrict,
  resource_ids uuid[] not null default '{}',
  status assignment_status not null default 'assigned',
  assigned_at timestamptz not null default now(),
  dispatched_at timestamptz,
  completed_at timestamptz,
  cancelled_at timestamptz,
  cancellation_reason text,
  notes text,
  updated_at timestamptz not null default now()
);

create index if not exists idx_assignments_incident on assignments(incident_id);
create index if not exists idx_assignments_team on assignments(team_id);
create index if not exists idx_assignments_status on assignments(status);

-- 5. Audit Logs
create table if not exists audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor text not null default 'system',
  action text not null,
  entity_type text not null,
  entity_id uuid,
  previous_values jsonb,
  new_values jsonb,
  reason text,
  created_at timestamptz not null default now()
);

create index if not exists idx_audit_created on audit_logs(created_at desc);
create index if not exists idx_audit_entity on audit_logs(entity_type, entity_id);

-- 6. Escalations
create table if not exists escalations (
  id uuid primary key default gen_random_uuid(),
  incident_id uuid not null references incidents(id) on delete cascade,
  previous_score int,
  new_score int,
  previous_level priority_level,
  new_level priority_level,
  reason text not null,
  acknowledged boolean not null default false,
  acknowledged_by text,
  acknowledged_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists idx_escalations_incident on escalations(incident_id);
create index if not exists idx_escalations_created on escalations(created_at desc);

-- 7. Alerts
create table if not exists alerts (
  id uuid primary key default gen_random_uuid(),
  incident_id uuid references incidents(id) on delete cascade,
  type text not null default 'escalation',
  severity priority_level not null default 'high',
  message text not null,
  acknowledged boolean not null default false,
  acknowledged_at timestamptz,
  dedup_key text,
  created_at timestamptz not null default now()
);

create index if not exists idx_alerts_created on alerts(created_at desc);
create index if not exists idx_alerts_ack on alerts(acknowledged);

-- ===================== STORED PROCEDURES & LOGIC =====================

-- Priority Scoring calculation (Deterministic & Explainable)
create or replace function calculate_priority(
  p_people_trapped tri_state,
  p_injuries_reported tri_state,
  p_vulnerable_people tri_state,
  p_danger_increasing tri_state,
  p_people_affected int
) returns table(score int, level priority_level, reasons text[], life_threatening boolean)
language plpgsql immutable as $$
declare
  s int := 0;
  r text[] := '{}';
  lt boolean := false;
  ps int;
  lvl priority_level;
begin
  if p_people_trapped = 'yes' then
    s := s + 40;
    r := array_append(r, 'People reported trapped (+40)');
    lt := true;
  elsif p_people_trapped = 'unknown' then
    r := array_append(r, 'Trapped status unknown — cannot assume safe');
  end if;

  if p_injuries_reported = 'yes' then
    s := s + 25;
    r := array_append(r, 'Injuries or urgent medical needs reported (+25)');
    lt := true;
  elsif p_injuries_reported = 'unknown' then
    r := array_append(r, 'Injury status unknown — cannot assume none');
  end if;

  if p_vulnerable_people = 'yes' then
    s := s + 15;
    r := array_append(r, 'Vulnerable people potentially at risk (+15)');
  elsif p_vulnerable_people = 'unknown' then
    r := array_append(r, 'Vulnerable-people status unknown');
  end if;

  if p_danger_increasing = 'yes' then
    s := s + 10;
    r := array_append(r, 'Danger reportedly increasing (+10)');
  elsif p_danger_increasing = 'unknown' then
    r := array_append(r, 'Danger trend unknown');
  end if;

  ps := least(10, greatest(0, p_people_affected * 2));
  if ps > 0 then
    s := s + ps;
    r := array_append(r, format('%s people affected (+%s)', p_people_affected, ps));
  end if;

  s := least(s, 100);

  if s >= 75 then
    lvl := 'critical';
  elsif s >= 50 then
    lvl := 'high';
  elsif s >= 25 then
    lvl := 'moderate';
  else
    lvl := 'low';
  end if;

  if lt and s < 75 then
    r := array_append(r, 'Flagged for urgent review: immediate danger to life reported');
  end if;

  return query select s, lvl, r, lt;
end;
$$;

-- Recalculate Incident Priority (detects escalation, creates alerts & audit records)
create or replace function recalculate_incident_priority(p_incident_id uuid, p_actor text default 'system')
returns table(new_score int, new_level priority_level, reasons text[], life_threatening boolean, escalated boolean)
language plpgsql security definer as $$
declare
  old_score int;
  old_level priority_level;
  calculated_score int;
  calculated_level priority_level;
  r text[];
  lt boolean;
  esc boolean := false;
  inc record;
begin
  select * into inc from incidents where id = p_incident_id;
  if not found then raise exception 'Incident not found'; end if;

  old_score := inc.priority_score;
  old_level := inc.priority_level;

  select * into calculated_score, calculated_level, r, lt
  from calculate_priority(inc.people_trapped, inc.injuries_reported, inc.vulnerable_people, inc.danger_increasing, inc.people_affected);

  update incidents
  set priority_score = calculated_score,
      priority_level = calculated_level,
      priority_reasons = r,
      life_threatening = lt,
      previous_priority_score = old_score,
      previous_priority_level = old_level,
      updated_at = now()
  where id = p_incident_id;

  insert into audit_logs (actor, action, entity_type, entity_id, previous_values, new_values, reason)
  values (
    p_actor,
    'priority_recalculate',
    'incident',
    p_incident_id,
    jsonb_build_object('score', old_score, 'level', old_level),
    jsonb_build_object('score', calculated_score, 'level', calculated_level, 'reasons', r),
    'Priority recalculated'
  );

  if calculated_score > old_score or (calculated_level::text > old_level::text) or (lt and not inc.life_threatening) then
    esc := true;
    insert into escalations (incident_id, previous_score, new_score, previous_level, new_level, reason)
    values (
      p_incident_id,
      old_score,
      calculated_score,
      old_level,
      calculated_level,
      format('Priority increased from %s (%s) to %s (%s)', old_score, old_level, calculated_score, calculated_level)
    );
    insert into alerts (incident_id, type, severity, message, dedup_key)
    values (
      p_incident_id,
      'escalation',
      calculated_level,
      format('Incident %s escalated to %s (score %s)', inc.report_code, calculated_level, calculated_score),
      'esc-' || p_incident_id::text || '-' || calculated_score::text
    );
  end if;

  return query select calculated_score, calculated_level, r, lt, esc;
end;
$$;

-- Recommend Teams (Ranks compatible teams by match count & distance)
create or replace function recommend_teams(p_incident_id uuid)
returns table(
  team_id uuid,
  team_name text,
  team_code text,
  capabilities text[],
  distance_km float,
  capability_match int,
  recommendation_reason text,
  current_status team_status
)
language plpgsql security definer as $$
declare
  inc record;
  req_caps text[];
begin
  select * into inc from incidents where id = p_incident_id;
  if not found then raise exception 'Incident not found'; end if;

  req_caps := case inc.type
    when 'flood' then array['water_rescue','boat','evacuation']
    when 'fire' then array['fire_suppression','evacuation','medical']
    when 'medical_emergency' then array['medical','ambulance']
    when 'heatwave' then array['medical','evacuation','relief_distribution']
    else array['evacuation','general_rescue'] end;

  if inc.life_threatening then
    req_caps := req_caps || array['medical'];
  end if;

  return query
  select
    r.tid,
    r.tname,
    r.tcode,
    r.caps,
    r.dist::double precision,
    r.match::int,
    format('Matches %s of %s required capabilities; %s km away%s', r.match, array_length(req_caps, 1), r.dist, case when r.match = 0 then ' — no direct capability match' else '' end),
    r.tstat
  from (
    select
      t.id as tid,
      t.name as tname,
      t.team_code as tcode,
      t.capabilities as caps,
      t.status as tstat,
      round((st_distance(inc.location::geometry, t.location::geometry) / 1000.0)::numeric, 1) as dist,
      (select count(*)::int from unnest(req_caps) req where req = any(t.capabilities)) as match
    from rescue_teams t
    where t.status = 'available' and t.location is not null
  ) r
  order by r.match desc, r.dist asc;
end;
$$;

-- Atomic Assignment Creation
create or replace function create_assignment(
  p_incident_id uuid,
  p_team_id uuid,
  p_resource_ids uuid[] default '{}',
  p_actor text default 'coordinator'
)
returns uuid language plpgsql security definer as $$
declare
  assignment_id uuid;
  tstat team_status;
  istat incident_status;
  rid uuid;
  ravail int;
begin
  select status into tstat from rescue_teams where id = p_team_id;
  if not found then raise exception 'Team not found'; end if;
  if tstat <> 'available' then raise exception 'Team is not available (current status: %)', tstat; end if;

  select status into istat from incidents where id = p_incident_id;
  if not found then raise exception 'Incident not found'; end if;
  if istat in ('assigned','dispatched') then raise exception 'Incident already has an active assignment'; end if;

  foreach rid in array p_resource_ids loop
    select quantity_available into ravail from resources where id = rid;
    if not found then raise exception 'Resource % not found', rid; end if;
    if ravail < 1 then raise exception 'Insufficient available quantity for resource %', rid; end if;
  end loop;

  insert into assignments (incident_id, team_id, resource_ids, status)
  values (p_incident_id, p_team_id, p_resource_ids, 'assigned')
  returning id into assignment_id;

  update rescue_teams
  set status = 'assigned', current_assignment_id = assignment_id, updated_at = now()
  where id = p_team_id;

  foreach rid in array p_resource_ids loop
    update resources
    set quantity_reserved = quantity_reserved + 1,
        quantity_available = greatest(0, quantity_available - 1),
        updated_at = now()
    where id = rid;
  end loop;

  update incidents
  set status = 'assigned', assigned_team_id = p_team_id, updated_at = now()
  where id = p_incident_id;

  insert into audit_logs (actor, action, entity_type, entity_id, new_values, reason)
  values (
    p_actor,
    'assignment_create',
    'incident',
    p_incident_id,
    jsonb_build_object('team_id', p_team_id, 'resource_ids', p_resource_ids, 'assignment_id', assignment_id),
    'Team assigned to incident'
  );

  insert into alerts (incident_id, type, severity, message, dedup_key)
  values (p_incident_id, 'assignment', 'moderate', 'Team assigned to incident', 'assign-' || assignment_id::text);

  return assignment_id;
end;
$$;

-- Atomic Assignment Cancellation
create or replace function cancel_assignment(
  p_assignment_id uuid,
  p_reason text default '',
  p_actor text default 'coordinator'
)
returns void language plpgsql security definer as $$
declare
  a_rec record;
  rid uuid;
begin
  select * into a_rec from assignments where id = p_assignment_id;
  if not found then raise exception 'Assignment not found'; end if;
  if a_rec.status in ('completed','cancelled') then raise exception 'Assignment already %', a_rec.status; end if;

  update assignments
  set status = 'cancelled', cancelled_at = now(), cancellation_reason = p_reason, updated_at = now()
  where id = p_assignment_id;

  update rescue_teams
  set status = 'available', current_assignment_id = null, updated_at = now()
  where id = a_rec.team_id;

  foreach rid in array a_rec.resource_ids loop
    update resources
    set quantity_reserved = greatest(0, quantity_reserved - 1),
        quantity_available = quantity_available + 1,
        updated_at = now()
    where id = rid;
  end loop;

  update incidents
  set status = 'verified', assigned_team_id = null, updated_at = now()
  where id = a_rec.incident_id;

  insert into audit_logs (actor, action, entity_type, entity_id, new_values, reason)
  values (p_actor, 'assignment_cancel', 'assignment', p_assignment_id, jsonb_build_object('reason', p_reason), 'Assignment cancelled');
end;
$$;

-- ===================== TRIGGERS =====================
create or replace function set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_incidents_updated on incidents;
create trigger trg_incidents_updated before update on incidents for each row execute function set_updated_at();

drop trigger if exists trg_teams_updated on rescue_teams;
create trigger trg_teams_updated before update on rescue_teams for each row execute function set_updated_at();

drop trigger if exists trg_resources_updated on resources;
create trigger trg_resources_updated before update on resources for each row execute function set_updated_at();

drop trigger if exists trg_assignments_updated on assignments;
create trigger trg_assignments_updated before update on assignments for each row execute function set_updated_at();

create or replace function incident_insert_priority()
returns trigger language plpgsql as $$
declare
  res record;
begin
  select * into res from calculate_priority(new.people_trapped, new.injuries_reported, new.vulnerable_people, new.danger_increasing, new.people_affected);
  new.priority_score := res.score;
  new.priority_level := res.level;
  new.priority_reasons := res.reasons;
  new.life_threatening := res.life_threatening;
  return new;
end;
$$;

drop trigger if exists trg_incidents_insert_priority on incidents;
create trigger trg_incidents_insert_priority before insert on incidents for each row execute function incident_insert_priority();
