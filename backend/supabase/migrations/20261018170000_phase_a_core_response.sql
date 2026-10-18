/*
  Phase A: complete the report -> dispatch -> field response -> completion loop.

  This migration deliberately keeps assignment_status unchanged. The existing
  assigned/dispatched/completed/cancelled states remain the operational state,
  while field_status records the responder's finer-grained progress.
*/

alter table public.assignments
  add column if not exists field_status text not null default 'awaiting_response'
    check (field_status in ('awaiting_response', 'en_route', 'arrived', 'victim_reached', 'completed', 'rejected')),
  add column if not exists accepted_at timestamptz,
  add column if not exists arrived_at timestamptz,
  add column if not exists victim_reached_at timestamptz,
  add column if not exists rejected_at timestamptz,
  add column if not exists rejection_reason text,
  add column if not exists last_field_update_at timestamptz,
  add column if not exists last_field_location geography(point, 4326),
  add column if not exists last_field_location_accuracy_m double precision;

update public.assignments
set field_status = case status
  when 'assigned' then 'awaiting_response'
  when 'dispatched' then 'en_route'
  when 'completed' then 'completed'
  when 'cancelled' then case when rejected_at is not null then 'rejected' else 'awaiting_response' end
end
where field_status is null
   or (status = 'dispatched' and field_status = 'awaiting_response')
   or (status = 'completed' and field_status <> 'completed');

create index if not exists idx_assignments_field_status
  on public.assignments(field_status, last_field_update_at desc);
create index if not exists idx_assignments_last_field_location
  on public.assignments using gist(last_field_location);

create table if not exists public.backup_requests (
  id uuid primary key default gen_random_uuid(),
  assignment_id uuid not null references public.assignments(id) on delete cascade,
  incident_id uuid not null references public.incidents(id) on delete cascade,
  team_id uuid not null references public.rescue_teams(id) on delete restrict,
  reason text not null,
  status text not null default 'requested' check (status in ('requested', 'acknowledged', 'resolved')),
  location geography(point, 4326),
  location_accuracy_m double precision,
  requested_by uuid references public.profiles(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  acknowledged_at timestamptz,
  resolved_at timestamptz
);
create index if not exists idx_backup_requests_incident
  on public.backup_requests(incident_id, created_at desc);

create table if not exists public.rescue_completion_reports (
  id uuid primary key default gen_random_uuid(),
  assignment_id uuid not null unique references public.assignments(id) on delete cascade,
  incident_id uuid not null references public.incidents(id) on delete cascade,
  team_id uuid not null references public.rescue_teams(id) on delete restrict,
  people_reached integer not null default 0 check (people_reached >= 0),
  supplies_used jsonb not null default '[]'::jsonb check (jsonb_typeof(supplies_used) = 'array'),
  further_help_needed boolean not null default false,
  further_help_details text,
  notes text,
  location geography(point, 4326),
  location_accuracy_m double precision,
  submitted_by uuid references public.profiles(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now()
);
create index if not exists idx_completion_reports_incident
  on public.rescue_completion_reports(incident_id, created_at desc);

create table if not exists public.incident_evidence (
  id uuid primary key default gen_random_uuid(),
  incident_id uuid not null references public.incidents(id) on delete cascade,
  storage_path text not null unique,
  mime_type text not null check (mime_type in ('image/jpeg', 'image/png', 'image/webp')),
  size_bytes integer not null check (size_bytes > 0 and size_bytes <= 3145728),
  original_name text,
  review_status text not null default 'pending' check (review_status in ('pending', 'verified', 'disputed')),
  review_notes text,
  reviewed_by uuid references public.profiles(id) on delete set null,
  reviewed_at timestamptz,
  uploaded_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists idx_incident_evidence_incident
  on public.incident_evidence(incident_id, created_at desc);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'incident-evidence', 'incident-evidence', false, 3145728,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

alter table public.backup_requests enable row level security;
alter table public.rescue_completion_reports enable row level security;
alter table public.incident_evidence enable row level security;

drop policy if exists backup_requests_admin_all on public.backup_requests;
create policy backup_requests_admin_all on public.backup_requests
  for all to authenticated using (private.is_admin()) with check (private.is_admin());
drop policy if exists backup_requests_responder_read on public.backup_requests;
create policy backup_requests_responder_read on public.backup_requests
  for select to authenticated using (private.is_team_member(team_id));

drop policy if exists completion_reports_admin_all on public.rescue_completion_reports;
create policy completion_reports_admin_all on public.rescue_completion_reports
  for all to authenticated using (private.is_admin()) with check (private.is_admin());
drop policy if exists completion_reports_responder_read on public.rescue_completion_reports;
create policy completion_reports_responder_read on public.rescue_completion_reports
  for select to authenticated using (private.is_team_member(team_id));

drop policy if exists incident_evidence_admin_all on public.incident_evidence;
create policy incident_evidence_admin_all on public.incident_evidence
  for all to authenticated using (private.is_admin()) with check (private.is_admin());
drop policy if exists incident_evidence_responder_read on public.incident_evidence;
create policy incident_evidence_responder_read on public.incident_evidence
  for select to authenticated using (
    exists (
      select 1 from public.assignments a
      where a.incident_id = incident_evidence.incident_id
        and private.is_team_member(a.team_id)
    )
  );

drop policy if exists incident_evidence_staff_read on storage.objects;
create policy incident_evidence_staff_read on storage.objects
  for select to authenticated using (
    bucket_id = 'incident-evidence'
    and exists (
      select 1
      from public.incident_evidence e
      where e.storage_path = storage.objects.name
        and (
          private.is_admin()
          or exists (
            select 1 from public.assignments a
            where a.incident_id = e.incident_id
              and private.is_team_member(a.team_id)
          )
        )
    )
  );

revoke all on public.backup_requests, public.rescue_completion_reports, public.incident_evidence
  from public, anon;
grant select on public.backup_requests, public.rescue_completion_reports, public.incident_evidence
  to authenticated;

create or replace function private.record_responder_location(
  p_assignment_id uuid,
  p_team_id uuid,
  p_latitude double precision,
  p_longitude double precision,
  p_accuracy_m double precision
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare v_location geography(point, 4326);
begin
  if p_latitude is null or p_longitude is null then return; end if;
  if p_latitude not between -90 and 90 or p_longitude not between -180 and 180 then
    raise exception 'Invalid responder coordinates';
  end if;
  if p_accuracy_m is not null and (p_accuracy_m < 0 or p_accuracy_m > 10000) then
    raise exception 'Invalid location accuracy';
  end if;
  v_location := st_setsrid(st_makepoint(p_longitude, p_latitude), 4326)::geography;
  update public.assignments
  set last_field_location = v_location,
      last_field_location_accuracy_m = p_accuracy_m,
      last_field_update_at = now()
  where id = p_assignment_id;
  update public.rescue_teams
  set location = v_location, last_location_update = now(), updated_at = now()
  where id = p_team_id;
end;
$$;

create or replace function public.responder_assignment_action(
  p_assignment_id uuid,
  p_action text,
  p_reason text default null,
  p_latitude double precision default null,
  p_longitude double precision default null,
  p_accuracy_m double precision default null
)
returns public.assignments
language plpgsql
security definer
set search_path = public
as $$
declare
  a public.assignments;
  result public.assignments;
  inc public.incidents;
  t public.rescue_teams;
  action_name text := lower(trim(coalesce(p_action, '')));
  clean_reason text := nullif(trim(coalesce(p_reason, '')), '');
  request_id uuid;
begin
  select * into a from public.assignments where id = p_assignment_id for update;
  if not found then raise exception 'Assignment not found'; end if;
  if not private.is_team_member(a.team_id) then raise exception 'Not authorized for this team'; end if;
  if a.status in ('completed', 'cancelled') then raise exception 'Assignment is already closed'; end if;
  select * into inc from public.incidents where id = a.incident_id;
  select * into t from public.rescue_teams where id = a.team_id;

  perform private.record_responder_location(a.id, a.team_id, p_latitude, p_longitude, p_accuracy_m);
  perform set_config('resqnet.reason', coalesce(clean_reason, ''), true);

  if action_name = 'accept' then
    if a.status <> 'assigned' then raise exception 'Only a pending assignment can be accepted'; end if;
    update public.assignments
    set status = 'dispatched', field_status = 'en_route', accepted_at = now(),
        dispatched_at = coalesce(dispatched_at, now()), last_field_update_at = now(), updated_at = now()
    where id = a.id;
    update public.rescue_teams set status = 'en_route', updated_at = now() where id = a.team_id;
    update public.incidents set status = 'dispatched', updated_at = now() where id = a.incident_id;
  elsif action_name = 'arrived' then
    if a.status <> 'dispatched' or a.field_status not in ('en_route', 'arrived') then
      raise exception 'Accept the assignment before marking arrival';
    end if;
    update public.assignments
    set field_status = 'arrived', arrived_at = coalesce(arrived_at, now()),
        last_field_update_at = now(), updated_at = now()
    where id = a.id;
    insert into public.incident_events (incident_id, event_type, to_value, details, reason)
    values (a.incident_id, 'responder_arrived', t.team_code,
      jsonb_build_object('assignment_id', a.id, 'accuracy_m', p_accuracy_m), clean_reason);
  elsif action_name = 'victim_reached' then
    if a.status <> 'dispatched' or a.field_status not in ('arrived', 'victim_reached') then
      raise exception 'Mark arrival before confirming the victim was reached';
    end if;
    update public.assignments
    set field_status = 'victim_reached', victim_reached_at = coalesce(victim_reached_at, now()),
        last_field_update_at = now(), updated_at = now()
    where id = a.id;
    insert into public.incident_events (incident_id, event_type, to_value, details, reason)
    values (a.incident_id, 'victim_reached', t.team_code,
      jsonb_build_object('assignment_id', a.id, 'accuracy_m', p_accuracy_m), clean_reason);
  elsif action_name = 'needs_backup' then
    if a.status <> 'dispatched' then raise exception 'Accept the assignment before requesting backup'; end if;
    if clean_reason is null or length(clean_reason) < 5 then raise exception 'Explain why backup is needed'; end if;
    insert into public.backup_requests (
      assignment_id, incident_id, team_id, reason, location, location_accuracy_m
    ) values (
      a.id, a.incident_id, a.team_id, clean_reason,
      case when p_latitude is not null and p_longitude is not null
        then st_setsrid(st_makepoint(p_longitude, p_latitude), 4326)::geography end,
      p_accuracy_m
    ) returning id into request_id;
    insert into public.alerts (incident_id, type, severity, message, dedup_key, entity_type, entity_id)
    values (
      a.incident_id, 'backup_request', 'critical',
      format('%s requested backup for %s: %s', t.team_code, inc.report_code, clean_reason),
      'backup-' || request_id::text, 'backup_request', request_id
    );
    insert into public.incident_events (incident_id, event_type, to_value, details, reason)
    values (a.incident_id, 'backup_requested', t.team_code,
      jsonb_build_object('assignment_id', a.id, 'backup_request_id', request_id, 'accuracy_m', p_accuracy_m), clean_reason);
    update public.assignments set last_field_update_at = now(), updated_at = now() where id = a.id;
  else
    raise exception 'Unsupported responder action';
  end if;

  insert into public.audit_logs (
    actor, actor_user_id, actor_role, action, entity_type, entity_id, new_values, reason
  ) values (
    'responder', auth.uid(), 'responder', 'responder_' || action_name,
    'assignment', a.id,
    jsonb_build_object('field_action', action_name, 'latitude', p_latitude, 'longitude', p_longitude, 'accuracy_m', p_accuracy_m),
    clean_reason
  );

  select * into result from public.assignments where id = a.id;
  return result;
end;
$$;

create or replace function public.responder_reject_assignment(
  p_assignment_id uuid,
  p_reason text
)
returns public.assignments
language plpgsql
security definer
set search_path = public
as $$
declare
  a public.assignments;
  result public.assignments;
  t public.rescue_teams;
  rid uuid;
  clean_reason text := nullif(trim(coalesce(p_reason, '')), '');
begin
  if clean_reason is null or length(clean_reason) < 5 then raise exception 'A rejection reason is required'; end if;
  select * into a from public.assignments where id = p_assignment_id for update;
  if not found then raise exception 'Assignment not found'; end if;
  if not private.is_team_member(a.team_id) then raise exception 'Not authorized for this team'; end if;
  if a.status <> 'assigned' then raise exception 'Only a pending assignment can be rejected'; end if;
  select * into t from public.rescue_teams where id = a.team_id;

  perform set_config('resqnet.reason', clean_reason, true);
  update public.assignments
  set status = 'cancelled', field_status = 'rejected', rejected_at = now(),
      rejection_reason = clean_reason, cancellation_reason = clean_reason,
      last_field_update_at = now(), updated_at = now()
  where id = a.id;
  update public.rescue_teams
  set status = case when status in ('unavailable', 'offline') then status else 'available' end,
      current_assignment_id = null, updated_at = now()
  where id = a.team_id;
  foreach rid in array a.resource_ids loop
    update public.resources
    set quantity_reserved = greatest(0, quantity_reserved - 1),
        quantity_available = quantity_available + 1, updated_at = now()
    where id = rid;
  end loop;
  update public.incidents
  set status = 'verified', assigned_team_id = null, updated_at = now()
  where id = a.incident_id;

  update public.alerts
  set type = 'assignment_rejected', severity = 'high',
      message = format('%s rejected assignment: %s', t.team_code, clean_reason)
  where dedup_key = 'cancel-' || a.id::text;

  insert into public.audit_logs (
    actor, actor_user_id, actor_role, action, entity_type, entity_id, new_values, reason
  ) values (
    'responder', auth.uid(), 'responder', 'assignment_rejected', 'assignment', a.id,
    jsonb_build_object('team_id', a.team_id), clean_reason
  );
  select * into result from public.assignments where id = a.id;
  return result;
end;
$$;

create or replace function public.responder_complete_assignment(
  p_assignment_id uuid,
  p_people_reached integer,
  p_supplies_used jsonb default '[]'::jsonb,
  p_further_help_needed boolean default false,
  p_further_help_details text default null,
  p_notes text default null,
  p_latitude double precision default null,
  p_longitude double precision default null,
  p_accuracy_m double precision default null
)
returns public.rescue_completion_reports
language plpgsql
security definer
set search_path = public
as $$
declare
  a public.assignments;
  report public.rescue_completion_reports;
  rid uuid;
  used_quantity integer;
  clean_help text := nullif(trim(coalesce(p_further_help_details, '')), '');
  clean_notes text := nullif(trim(coalesce(p_notes, '')), '');
begin
  if coalesce(p_people_reached, -1) < 0 then raise exception 'People reached cannot be negative'; end if;
  if jsonb_typeof(coalesce(p_supplies_used, '[]'::jsonb)) <> 'array' then raise exception 'Supplies used must be a list'; end if;
  if coalesce(p_further_help_needed, false) and (clean_help is null or length(clean_help) < 5) then
    raise exception 'Describe the further help needed';
  end if;

  select * into a from public.assignments where id = p_assignment_id for update;
  if not found then raise exception 'Assignment not found'; end if;
  if not private.is_team_member(a.team_id) then raise exception 'Not authorized for this team'; end if;
  if a.status <> 'dispatched' then raise exception 'Only an active field assignment can be completed'; end if;
  if a.field_status not in ('arrived', 'victim_reached') then raise exception 'Mark arrival before completing the response'; end if;
  if exists (
    select 1 from jsonb_array_elements(coalesce(p_supplies_used, '[]'::jsonb)) item
    where not ((item ->> 'resource_id')::uuid = any(a.resource_ids))
       or coalesce((item ->> 'quantity')::integer, 0) not between 1 and 1
  ) then
    raise exception 'Only one reserved unit per listed resource can be recorded as used';
  end if;

  perform private.record_responder_location(a.id, a.team_id, p_latitude, p_longitude, p_accuracy_m);
  insert into public.rescue_completion_reports (
    assignment_id, incident_id, team_id, people_reached, supplies_used,
    further_help_needed, further_help_details, notes, location, location_accuracy_m
  ) values (
    a.id, a.incident_id, a.team_id, p_people_reached, coalesce(p_supplies_used, '[]'::jsonb),
    coalesce(p_further_help_needed, false), clean_help, clean_notes,
    case when p_latitude is not null and p_longitude is not null
      then st_setsrid(st_makepoint(p_longitude, p_latitude), 4326)::geography end,
    p_accuracy_m
  ) returning * into report;

  perform set_config('resqnet.reason', coalesce(clean_notes, 'Responder submitted completion report'), true);
  update public.assignments
  set status = 'completed', field_status = 'completed', completed_at = now(),
      last_field_update_at = now(), updated_at = now()
  where id = a.id;
  update public.rescue_teams set status = 'available', current_assignment_id = null, updated_at = now()
  where id = a.team_id;

  foreach rid in array a.resource_ids loop
    select coalesce(sum((item ->> 'quantity')::integer), 0) into used_quantity
    from jsonb_array_elements(coalesce(p_supplies_used, '[]'::jsonb)) item
    where (item ->> 'resource_id')::uuid = rid;
    update public.resources
    set quantity_reserved = greatest(0, quantity_reserved - 1),
        quantity_available = quantity_available + case when used_quantity = 0 then 1 else 0 end,
        updated_at = now()
    where id = rid;
  end loop;

  if coalesce(p_further_help_needed, false) then
    update public.incidents set status = 'verified', assigned_team_id = null, updated_at = now()
    where id = a.incident_id;
    insert into public.alerts (incident_id, type, severity, message, dedup_key, entity_type, entity_id)
    values (
      a.incident_id, 'further_help_needed', 'critical',
      'Responder completed the current task but reported that further help is needed: ' || clean_help,
      'further-help-' || report.id::text, 'completion_report', report.id
    );
  else
    update public.incidents set status = 'resolved', updated_at = now() where id = a.incident_id;
  end if;

  insert into public.incident_events (incident_id, event_type, to_value, details, reason)
  values (
    a.incident_id, 'completion_report', p_people_reached::text,
    jsonb_build_object(
      'completion_report_id', report.id,
      'people_reached', p_people_reached,
      'supplies_used', coalesce(p_supplies_used, '[]'::jsonb),
      'further_help_needed', coalesce(p_further_help_needed, false),
      'accuracy_m', p_accuracy_m
    ),
    coalesce(clean_help, clean_notes)
  );
  insert into public.audit_logs (
    actor, actor_user_id, actor_role, action, entity_type, entity_id, new_values, reason
  ) values (
    'responder', auth.uid(), 'responder', 'completion_report_submitted', 'assignment', a.id,
    jsonb_build_object(
      'report_id', report.id, 'people_reached', p_people_reached,
      'supplies_used', coalesce(p_supplies_used, '[]'::jsonb),
      'further_help_needed', coalesce(p_further_help_needed, false),
      'latitude', p_latitude, 'longitude', p_longitude, 'accuracy_m', p_accuracy_m
    ),
    coalesce(clean_help, clean_notes)
  );
  return report;
end;
$$;

create or replace function public.admin_review_incident_evidence(
  p_evidence_id uuid,
  p_status text,
  p_notes text default null
)
returns public.incident_evidence
language plpgsql
security definer
set search_path = public
as $$
declare e public.incident_evidence; clean_status text := lower(trim(coalesce(p_status, '')));
begin
  if not private.is_admin() then raise exception 'Administrator access required'; end if;
  if clean_status not in ('verified', 'disputed') then raise exception 'Evidence must be verified or disputed'; end if;
  update public.incident_evidence
  set review_status = clean_status, review_notes = nullif(trim(coalesce(p_notes, '')), ''),
      reviewed_by = auth.uid(), reviewed_at = now()
  where id = p_evidence_id returning * into e;
  if not found then raise exception 'Evidence not found'; end if;
  insert into public.incident_events (incident_id, event_type, to_value, details, reason)
  values (e.incident_id, 'evidence_' || clean_status, e.id::text,
    jsonb_build_object('evidence_id', e.id), e.review_notes);
  insert into public.audit_logs (
    actor, actor_user_id, actor_role, action, entity_type, entity_id, new_values, reason
  ) values (
    'admin', auth.uid(), 'admin', 'evidence_' || clean_status, 'incident_evidence', e.id,
    jsonb_build_object('incident_id', e.incident_id, 'status', clean_status), e.review_notes
  );
  return e;
end;
$$;

create or replace function public.get_public_shelter_suggestions(
  p_report_code text,
  p_tracking_token text default null,
  p_needs text[] default '{}'
)
returns table (
  id uuid,
  name text,
  address text,
  location jsonb,
  capacity integer,
  occupancy integer,
  spaces_available integer,
  status text,
  wheelchair_access boolean,
  medical_support boolean,
  family_area boolean,
  has_power boolean,
  last_updated_at timestamptz,
  distance_km numeric
)
language plpgsql
security definer
set search_path = public, extensions
as $$
declare inc public.incidents; needs text[] := coalesce(p_needs, '{}');
begin
  if exists (
    select 1 from unnest(needs) n
    where n not in ('wheelchair_access', 'medical_support', 'family_area', 'has_power')
  ) then raise exception 'Unsupported shelter requirement'; end if;
  select * into inc from public.incidents i
  where upper(i.report_code) = upper(trim(p_report_code))
    and (
      (auth.uid() is not null and i.reporter_user_id = auth.uid())
      or (
        p_tracking_token is not null and i.tracking_token_hash is not null
        and i.tracking_token_hash = encode(digest(trim(p_tracking_token), 'sha256'), 'hex')
      )
    );
  if not found then raise exception 'Report not found or tracking key is invalid'; end if;

  return query
  select s.id, s.name, s.address, st_asgeojson(s.location::geometry)::jsonb,
    s.capacity, s.occupancy, greatest(0, s.capacity - s.occupancy), s.status,
    s.wheelchair_access, s.medical_support, s.family_area, s.has_power,
    s.last_updated_at,
    round((st_distance(inc.location, s.location) / 1000.0)::numeric, 1)
  from public.shelters s
  where s.status = 'open'
    and s.location is not null
    and s.occupancy < s.capacity
    and (not ('wheelchair_access' = any(needs)) or s.wheelchair_access is true)
    and (not ('medical_support' = any(needs)) or s.medical_support is true)
    and (not ('family_area' = any(needs)) or s.family_area is true)
    and (not ('has_power' = any(needs)) or s.has_power is true)
  order by st_distance(inc.location, s.location), s.name
  limit 4;
end;
$$;

revoke execute on function private.record_responder_location(uuid, uuid, double precision, double precision, double precision)
  from public, anon, authenticated;
revoke execute on function public.responder_assignment_action(uuid, text, text, double precision, double precision, double precision)
  from public, anon;
grant execute on function public.responder_assignment_action(uuid, text, text, double precision, double precision, double precision)
  to authenticated;
revoke execute on function public.responder_reject_assignment(uuid, text) from public, anon;
grant execute on function public.responder_reject_assignment(uuid, text) to authenticated;
revoke execute on function public.responder_complete_assignment(uuid, integer, jsonb, boolean, text, text, double precision, double precision, double precision)
  from public, anon;
grant execute on function public.responder_complete_assignment(uuid, integer, jsonb, boolean, text, text, double precision, double precision, double precision)
  to authenticated;
revoke execute on function public.admin_review_incident_evidence(uuid, text, text) from public, anon;
grant execute on function public.admin_review_incident_evidence(uuid, text, text) to authenticated;
revoke execute on function public.get_public_shelter_suggestions(text, text, text[]) from public;
grant execute on function public.get_public_shelter_suggestions(text, text, text[]) to anon, authenticated;

alter publication supabase_realtime add table public.backup_requests;
alter publication supabase_realtime add table public.rescue_completion_reports;
alter publication supabase_realtime add table public.incident_evidence;
