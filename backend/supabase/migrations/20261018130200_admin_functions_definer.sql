/*
  create_assignment, cancel_assignment and recalculate_incident_priority wrote audit rows
  with the caller's own permissions. Clients can no longer insert audit rows, so these now
  run as the owner and check for an admin themselves.
*/
create or replace function public.create_assignment(p_incident_id uuid, p_team_id uuid, p_resource_ids uuid[] default '{}', p_actor text default 'coordinator')
returns uuid language plpgsql security definer set search_path = public as $$
declare assignment_id uuid; tstat team_status; istat incident_status; rid uuid; ravail int;
begin
  if not private.is_admin() then raise exception 'Administrator access required'; end if;
  select status into tstat from rescue_teams where id = p_team_id for update;
  if not found then raise exception 'Team not found'; end if;
  if tstat <> 'available' then raise exception 'Team is not available (current status: %)', tstat; end if;
  select status into istat from incidents where id = p_incident_id for update;
  if not found then raise exception 'Incident not found'; end if;
  if istat in ('assigned', 'dispatched') then raise exception 'Incident already has an active assignment'; end if;
  if istat in ('resolved', 'cancelled') then raise exception 'Incident is already %', istat; end if;
  foreach rid in array p_resource_ids loop
    select quantity_available into ravail from resources where id = rid for update;
    if not found then raise exception 'Resource % not found', rid; end if;
    if ravail < 1 then raise exception 'Insufficient available quantity for resource %', rid; end if;
  end loop;
  insert into assignments (incident_id, team_id, resource_ids, status) values (p_incident_id, p_team_id, p_resource_ids, 'assigned') returning id into assignment_id;
  update rescue_teams set status = 'assigned', current_assignment_id = assignment_id, updated_at = now() where id = p_team_id;
  foreach rid in array p_resource_ids loop
    update resources set quantity_reserved = quantity_reserved + 1, quantity_available = quantity_available - 1, updated_at = now() where id = rid;
  end loop;
  update incidents set status = 'assigned', assigned_team_id = p_team_id, updated_at = now() where id = p_incident_id;
  insert into audit_logs (actor, action, entity_type, entity_id, new_values, reason)
  values (p_actor, 'assignment_create', 'incident', p_incident_id,
    jsonb_build_object('team_id', p_team_id, 'resource_ids', p_resource_ids, 'assignment_id', assignment_id), 'Team assigned to incident');
  insert into alerts (incident_id, type, severity, message, dedup_key, entity_type, entity_id)
  values (p_incident_id, 'assignment', 'moderate', 'Team assigned to incident', 'assign-' || assignment_id::text, 'assignment', assignment_id);
  return assignment_id;
end;
$$;
create or replace function public.cancel_assignment(p_assignment_id uuid, p_reason text default '', p_actor text default 'coordinator')
returns void language plpgsql security definer set search_path = public as $$
declare a_rec record; rid uuid;
begin
  if not private.is_admin() then raise exception 'Administrator access required'; end if;
  select * into a_rec from assignments where id = p_assignment_id for update;
  if not found then raise exception 'Assignment not found'; end if;
  if a_rec.status in ('completed', 'cancelled') then raise exception 'Assignment already %', a_rec.status; end if;
  update assignments set status = 'cancelled', cancelled_at = now(), cancellation_reason = p_reason, updated_at = now() where id = p_assignment_id;
  update rescue_teams set status = case when status in ('unavailable', 'offline') then status else 'available' end,
    current_assignment_id = null, updated_at = now() where id = a_rec.team_id;
  foreach rid in array a_rec.resource_ids loop
    update resources set quantity_reserved = greatest(0, quantity_reserved - 1), quantity_available = quantity_available + 1, updated_at = now() where id = rid;
  end loop;
  update incidents set status = 'verified', assigned_team_id = null, updated_at = now() where id = a_rec.incident_id;
  insert into audit_logs (actor, action, entity_type, entity_id, new_values, reason)
  values (p_actor, 'assignment_cancel', 'assignment', p_assignment_id, jsonb_build_object('reason', p_reason), 'Assignment cancelled');
end;
$$;
alter function public.recalculate_incident_priority(uuid, text) security definer;
create or replace function public.recalculate_incident_priority(p_incident_id uuid, p_actor text default 'system')
returns table(new_score int, new_level public.priority_level, reasons text[], life_threatening boolean, escalated boolean)
language plpgsql security definer set search_path = public, extensions as $$
declare before_row public.incidents; after_row public.incidents; esc boolean;
begin
  if not private.is_admin() then raise exception 'Administrator access required'; end if;
  select * into before_row from public.incidents where id = p_incident_id;
  if not found then raise exception 'Incident not found'; end if;
  update public.incidents set updated_at = now() where id = p_incident_id returning * into after_row;
  esc := after_row.priority_score > before_row.priority_score
      or private.level_rank(after_row.priority_level) > private.level_rank(before_row.priority_level)
      or (after_row.life_threatening and not before_row.life_threatening);
  insert into public.audit_logs (actor, action, entity_type, entity_id, previous_values, new_values, reason)
  values (p_actor, 'priority_recalculate', 'incident', p_incident_id,
    jsonb_build_object('score', before_row.priority_score, 'level', before_row.priority_level),
    jsonb_build_object('score', after_row.priority_score, 'level', after_row.priority_level, 'reasons', after_row.priority_reasons),
    'Priority recalculated');
  if esc then
    insert into public.escalations (incident_id, previous_score, new_score, previous_level, new_level, reason)
    values (p_incident_id, before_row.priority_score, after_row.priority_score, before_row.priority_level, after_row.priority_level,
      format('Priority increased from %s (%s) to %s (%s)', before_row.priority_score, before_row.priority_level, after_row.priority_score, after_row.priority_level));
    insert into public.alerts (incident_id, type, severity, message, dedup_key, entity_type, entity_id)
    values (p_incident_id, 'escalation', after_row.priority_level,
      format('Incident %s escalated to %s (score %s)', after_row.report_code, after_row.priority_level, after_row.priority_score),
      'esc-' || p_incident_id::text || '-' || after_row.priority_score::text, 'incident', p_incident_id);
  end if;
  return query select after_row.priority_score, after_row.priority_level, after_row.priority_reasons, after_row.life_threatening, esc;
end;
$$;
revoke execute on function public.create_assignment(uuid, uuid, uuid[], text) from public, anon;
grant execute on function public.create_assignment(uuid, uuid, uuid[], text) to authenticated;
revoke execute on function public.cancel_assignment(uuid, text, text) from public, anon;
grant execute on function public.cancel_assignment(uuid, text, text) to authenticated;
revoke execute on function public.recalculate_incident_priority(uuid, text) from public, anon;
grant execute on function public.recalculate_incident_priority(uuid, text) to authenticated;
