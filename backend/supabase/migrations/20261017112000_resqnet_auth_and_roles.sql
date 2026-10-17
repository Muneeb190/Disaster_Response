/*
  ResQNet authentication, additive roles, invitations, team membership, and
  production-safe access control.

  Every registered account receives the public role. Admin and responder are
  additive grants. Privileged grants are accepted through the role invitation
  Edge Function; clients cannot write roles directly.
*/

do $$ begin
  create type public.app_role as enum ('public', 'responder', 'admin');
exception when duplicate_object then null; end $$;
do $$ begin
  create type public.account_status as enum ('invited', 'active', 'suspended', 'disabled');
exception when duplicate_object then null; end $$;
do $$ begin
  create type public.role_invitation_status as enum ('pending', 'accepted', 'declined', 'expired', 'revoked');
exception when duplicate_object then null; end $$;
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  full_name text not null default '',
  account_status public.account_status not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists idx_profiles_email_lower on public.profiles(lower(email));
create table if not exists public.user_roles (
  user_id uuid not null references public.profiles(id) on delete cascade,
  role public.app_role not null,
  granted_by uuid references public.profiles(id) on delete set null,
  granted_at timestamptz not null default now(),
  primary key (user_id, role)
);
create table if not exists public.team_members (
  user_id uuid not null references public.profiles(id) on delete cascade,
  team_id uuid not null references public.rescue_teams(id) on delete cascade,
  active boolean not null default true,
  added_by uuid references public.profiles(id) on delete set null,
  added_at timestamptz not null default now(),
  primary key (user_id, team_id)
);
create index if not exists idx_team_members_team on public.team_members(team_id) where active;
create table if not exists public.role_invitations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id) on delete cascade,
  email text not null,
  role public.app_role not null check (role in ('responder', 'admin')),
  team_id uuid references public.rescue_teams(id) on delete set null,
  invited_by uuid not null references public.profiles(id) on delete restrict,
  token_hash text not null unique,
  status public.role_invitation_status not null default 'pending',
  expires_at timestamptz not null,
  accepted_at timestamptz,
  created_at timestamptz not null default now(),
  check (role <> 'responder' or team_id is not null)
);
create index if not exists idx_role_invitations_email on public.role_invitations(lower(email), status);
alter table public.incidents
  add column if not exists reporter_user_id uuid references public.profiles(id) on delete set null,
  add column if not exists tracking_token_hash text,
  add column if not exists is_demo boolean not null default false,
  add column if not exists data_source text not null default 'public_report';
create index if not exists idx_incidents_reporter on public.incidents(reporter_user_id);
alter table public.audit_logs
  add column if not exists actor_user_id uuid references public.profiles(id) on delete set null,
  add column if not exists actor_role public.app_role,
  add column if not exists correlation_id uuid not null default gen_random_uuid();
alter table public.alerts
  add column if not exists acknowledged_by uuid references public.profiles(id) on delete set null;
create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated, anon;
create or replace function private.has_role(requested_role public.app_role, requested_user uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select requested_user is not null
    and exists (
      select 1
      from public.profiles p
      join public.user_roles ur on ur.user_id = p.id
      where p.id = requested_user
        and p.account_status = 'active'
        and ur.role = requested_role
    );
$$;
create or replace function private.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$ select private.has_role('admin'::public.app_role, auth.uid()); $$;
create or replace function private.is_team_member(requested_team uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.has_role('responder'::public.app_role, auth.uid())
    and exists (
      select 1 from public.team_members tm
      where tm.user_id = auth.uid() and tm.team_id = requested_team and tm.active
    );
$$;
grant execute on function private.has_role(public.app_role, uuid) to authenticated, anon;
grant execute on function private.is_admin() to authenticated;
grant execute on function private.is_team_member(uuid) to authenticated;
create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, email, full_name, account_status)
  values (
    new.id,
    coalesce(new.email, ''),
    coalesce(new.raw_user_meta_data ->> 'full_name', split_part(coalesce(new.email, ''), '@', 1)),
    'active'
  )
  on conflict (id) do update
    set email = excluded.email,
        updated_at = now();

  insert into public.user_roles (user_id, role)
  values (new.id, 'public')
  on conflict do nothing;
  return new;
end;
$$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert or update of email on auth.users
  for each row execute function public.handle_new_auth_user();
insert into public.profiles (id, email, full_name, account_status)
select id, coalesce(email, ''), coalesce(raw_user_meta_data ->> 'full_name', split_part(coalesce(email, ''), '@', 1)), 'active'
from auth.users
on conflict (id) do nothing;
insert into public.user_roles (user_id, role)
select id, 'public'::public.app_role from public.profiles
on conflict do nothing;
create or replace function public.update_my_profile(p_full_name text)
returns public.profiles
language plpgsql
security invoker
set search_path = ''
as $$
declare result public.profiles;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if length(trim(coalesce(p_full_name, ''))) < 2 then raise exception 'Full name is required'; end if;
  update public.profiles
    set full_name = trim(p_full_name), updated_at = now()
    where id = auth.uid()
    returning * into result;
  return result;
end;
$$;
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
  p_reporter_phone text default null
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
    reporter_name, reporter_phone, reporter_user_id, tracking_token_hash
  ) values (
    p_type, trim(p_description), nullif(trim(coalesce(p_area_landmark, '')), ''),
    p_people_affected, p_people_trapped, p_injuries_reported,
    p_vulnerable_people, p_danger_increasing,
    st_setsrid(st_makepoint(p_longitude, p_latitude), 4326)::geography,
    nullif(trim(coalesce(p_reporter_name, '')), ''),
    nullif(trim(coalesce(p_reporter_phone, '')), ''),
    auth.uid(), encode(digest(raw_token, 'sha256'), 'hex')
  ) returning * into created_incident;

  insert into public.audit_logs (actor, actor_user_id, actor_role, action, entity_type, entity_id, new_values, reason)
  values (
    case when auth.uid() is null then 'guest' else 'public-user' end,
    auth.uid(), 'public', 'incident_reported', 'incident', created_incident.id,
    jsonb_build_object('report_code', created_incident.report_code, 'type', created_incident.type),
    'Emergency report submitted'
  );

  return jsonb_build_object(
    'id', created_incident.id,
    'report_code', created_incident.report_code,
    'tracking_token', raw_token
  );
end;
$$;
create or replace function public.get_public_incident_status(p_report_code text, p_tracking_token text default null)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare incident_record public.incidents;
begin
  select * into incident_record
  from public.incidents i
  where upper(i.report_code) = upper(trim(p_report_code))
    and (
      (auth.uid() is not null and i.reporter_user_id = auth.uid())
      or (
        p_tracking_token is not null
        and i.tracking_token_hash is not null
        and i.tracking_token_hash = encode(digest(trim(p_tracking_token), 'sha256'), 'hex')
      )
    );

  if not found then return null; end if;

  return jsonb_build_object(
    'id', incident_record.id,
    'report_code', incident_record.report_code,
    'type', incident_record.type,
    'description', incident_record.description,
    'area_landmark', incident_record.area_landmark,
    'people_affected', incident_record.people_affected,
    'people_trapped', incident_record.people_trapped,
    'injuries_reported', incident_record.injuries_reported,
    'vulnerable_people', incident_record.vulnerable_people,
    'danger_increasing', incident_record.danger_increasing,
    'priority_score', incident_record.priority_score,
    'priority_level', incident_record.priority_level,
    'priority_reasons', incident_record.priority_reasons,
    'life_threatening', incident_record.life_threatening,
    'verification_status', incident_record.verification_status,
    'status', incident_record.status,
    'created_at', incident_record.created_at,
    'updated_at', incident_record.updated_at
  );
end;
$$;
create or replace function public.responder_update_assignment_status(p_assignment_id uuid, p_status public.assignment_status)
returns public.assignments
language plpgsql
security definer
set search_path = ''
as $$
declare current_assignment public.assignments; result public.assignments;
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
    update public.incidents set status = 'resolved' where id = result.incident_id;
  else
    update public.incidents set status = 'dispatched' where id = result.incident_id;
  end if;

  insert into public.audit_logs (actor, actor_user_id, actor_role, action, entity_type, entity_id, new_values, reason)
  values ('responder', auth.uid(), 'responder', 'assignment_status_changed', 'assignment', result.id,
    jsonb_build_object('status', p_status), 'Responder updated assignment status');
  return result;
end;
$$;
-- Existing security-definer operational functions become invoker functions so
-- their writes are still subject to the caller's RLS permissions.
alter function public.recalculate_incident_priority(uuid, text) security invoker;
alter function public.recommend_teams(uuid) security invoker;
alter function public.create_assignment(uuid, uuid, uuid[], text) security invoker;
alter function public.cancel_assignment(uuid, text, text) security invoker;
-- Remove the original demo-wide policies.
do $$
declare table_name text; policy_name text;
begin
  foreach table_name in array array['incidents','rescue_teams','resources','assignments','audit_logs','escalations','alerts'] loop
    foreach policy_name in array array[table_name||'_select',table_name||'_insert',table_name||'_update',table_name||'_delete'] loop
      execute format('drop policy if exists %I on public.%I', policy_name, table_name);
    end loop;
  end loop;
end $$;
alter table public.profiles enable row level security;
alter table public.user_roles enable row level security;
alter table public.team_members enable row level security;
alter table public.role_invitations enable row level security;
-- Profiles and role metadata.
create policy profiles_read_self_or_admin on public.profiles for select to authenticated
using (id = auth.uid() or private.is_admin());
create policy profiles_admin_update on public.profiles for update to authenticated
using (private.is_admin()) with check (private.is_admin());
create policy user_roles_read_self_or_admin on public.user_roles for select to authenticated
using (user_id = auth.uid() or private.is_admin());
create policy team_members_read_own_or_admin on public.team_members for select to authenticated
using (user_id = auth.uid() or private.is_admin());
create policy invitations_read_recipient_or_admin on public.role_invitations for select to authenticated
using (user_id = auth.uid() or lower(email) = lower(coalesce(auth.jwt() ->> 'email', '')) or private.is_admin());
-- Admin operational access.
create policy incidents_admin_all on public.incidents for all to authenticated using (private.is_admin()) with check (private.is_admin());
create policy teams_admin_all on public.rescue_teams for all to authenticated using (private.is_admin()) with check (private.is_admin());
create policy resources_admin_all on public.resources for all to authenticated using (private.is_admin()) with check (private.is_admin());
create policy assignments_admin_all on public.assignments for all to authenticated using (private.is_admin()) with check (private.is_admin());
create policy audit_admin_read on public.audit_logs for select to authenticated using (private.is_admin());
create policy audit_admin_insert on public.audit_logs for insert to authenticated with check (private.is_admin());
create policy escalations_admin_all on public.escalations for all to authenticated using (private.is_admin()) with check (private.is_admin());
create policy alerts_admin_all on public.alerts for all to authenticated using (private.is_admin()) with check (private.is_admin());
-- Registered public users retain private access to reports they submitted.
create policy incidents_owner_read on public.incidents for select to authenticated
using (reporter_user_id = auth.uid());
-- Responders can read only their teams and assignments, plus the incident and
-- operational resources needed to perform those assignments.
create policy teams_responder_read on public.rescue_teams for select to authenticated
using (private.is_team_member(id));
create policy assignments_responder_read on public.assignments for select to authenticated
using (private.is_team_member(team_id));
create policy incidents_responder_read on public.incidents for select to authenticated
using (exists (
  select 1 from public.assignments a
  where a.incident_id = incidents.id and private.is_team_member(a.team_id)
));
create policy resources_responder_read on public.resources for select to authenticated
using (private.has_role('responder'::public.app_role, auth.uid()));
create policy alerts_responder_read on public.alerts for select to authenticated
using (
  private.has_role('responder'::public.app_role, auth.uid())
  and incident_id is not null
  and exists (
    select 1 from public.assignments a
    where a.incident_id = alerts.incident_id and private.is_team_member(a.team_id)
  )
);
-- Explicit grants and revocations: policies and grants are both required.
revoke all on public.profiles, public.user_roles, public.team_members, public.role_invitations from anon;
revoke all on public.incidents, public.rescue_teams, public.resources, public.assignments, public.audit_logs, public.escalations, public.alerts from anon;
grant select on public.profiles, public.user_roles, public.team_members, public.role_invitations to authenticated;
grant update on public.profiles to authenticated;
grant select, insert, update, delete on public.incidents, public.rescue_teams, public.resources, public.assignments, public.escalations, public.alerts to authenticated;
grant select, insert on public.audit_logs to authenticated;
revoke execute on function public.recalculate_incident_priority(uuid, text) from anon, public;
revoke execute on function public.recommend_teams(uuid) from anon, public;
revoke execute on function public.create_assignment(uuid, uuid, uuid[], text) from anon, public;
revoke execute on function public.cancel_assignment(uuid, text, text) from anon, public;
grant execute on function public.recalculate_incident_priority(uuid, text) to authenticated;
grant execute on function public.recommend_teams(uuid) to authenticated;
grant execute on function public.create_assignment(uuid, uuid, uuid[], text) to authenticated;
grant execute on function public.cancel_assignment(uuid, text, text) to authenticated;
revoke execute on function public.update_my_profile(text) from public, anon;
grant execute on function public.update_my_profile(text) to authenticated;
revoke execute on function public.submit_public_incident(public.incident_type,text,text,int,public.tri_state,public.tri_state,public.tri_state,public.tri_state,double precision,double precision,text,text) from public;
grant execute on function public.submit_public_incident(public.incident_type,text,text,int,public.tri_state,public.tri_state,public.tri_state,public.tri_state,double precision,double precision,text,text) to anon, authenticated;
revoke execute on function public.get_public_incident_status(text,text) from public;
grant execute on function public.get_public_incident_status(text,text) to anon, authenticated;
revoke execute on function public.responder_update_assignment_status(uuid,public.assignment_status) from public, anon;
grant execute on function public.responder_update_assignment_status(uuid,public.assignment_status) to authenticated;
