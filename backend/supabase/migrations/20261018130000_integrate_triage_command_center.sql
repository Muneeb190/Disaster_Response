/*
  Integrates features 12-14 (risk factors, confidence, follow-up: 20261018100000) with the
  command center (21-30: 20261018120100). Runs after both, so every environment ends up
  with the same definitions whichever order those two were applied in.

  - Priority is recalculated by the incidents BEFORE trigger on every write, so
    admin_update_incident now detects escalation itself (before vs after the update)
    instead of calling recalculate_incident_priority afterwards, which would see no change.
  - recalculate_incident_priority keeps the trigger-based version and links its alerts.
  - situation_summary also reports incidents flagged for urgent checking.
*/

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
create or replace function public.admin_update_incident(p_incident_id uuid, p_changes jsonb, p_reason text default null)
returns public.incidents language plpgsql security definer set search_path = public, extensions as $$
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

  -- The BEFORE trigger recalculates risk and confidence from the new values.
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
  where id = p_incident_id
  returning * into result;

  insert into audit_logs (actor, action, entity_type, entity_id, previous_values, new_values, reason)
  values ('admin', 'incident_updated', 'incident', p_incident_id,
    (select jsonb_object_agg(key, to_jsonb(inc) -> key) from jsonb_object_keys(p_changes) key), p_changes, v_reason);

  if result.priority_score > inc.priority_score
     or private.level_rank(result.priority_level) > private.level_rank(inc.priority_level)
     or (result.life_threatening and not inc.life_threatening) then
    insert into escalations (incident_id, previous_score, new_score, previous_level, new_level, reason)
    values (p_incident_id, inc.priority_score, result.priority_score, inc.priority_level, result.priority_level,
      format('Priority increased from %s (%s) to %s (%s)%s', inc.priority_score, inc.priority_level, result.priority_score, result.priority_level,
        case when v_reason is not null then ': ' || v_reason else '' end));
    insert into alerts (incident_id, type, severity, message, dedup_key, entity_type, entity_id)
    values (p_incident_id, 'escalation', result.priority_level,
      format('Incident %s escalated to %s (score %s)', result.report_code, result.priority_level, result.priority_score),
      'esc-' || p_incident_id::text || '-' || result.priority_score::text, 'incident', p_incident_id);
  end if;
  return result;
end;
$$;
create or replace function public.situation_summary(p_hours int default 12)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_hours int := greatest(1, least(coalesce(p_hours, 12), 168));
  since timestamptz := now() - make_interval(hours => greatest(1, least(coalesce(p_hours, 12), 168)));
begin
  if not private.is_admin() then raise exception 'Administrator access required'; end if;
  return jsonb_build_object(
    'generated_at', now(),
    'period_hours', v_hours,
    'contains_demo_data', exists (select 1 from incidents where is_demo) or exists (select 1 from rescue_teams where is_demo)
      or exists (select 1 from resources where is_demo) or exists (select 1 from shelters where is_demo),
    'incidents', (select jsonb_build_object(
        'open', count(*) filter (where status not in ('resolved', 'cancelled')),
        'critical_open', count(*) filter (where priority_level = 'critical' and status not in ('resolved', 'cancelled')),
        'unassigned_open', count(*) filter (where status in ('reported', 'verified')),
        'unverified_open', count(*) filter (where verification_status = 'pending' and status not in ('resolved', 'cancelled')),
        'urgent_check_open', count(*) filter (where needs_urgent_check and status not in ('resolved', 'cancelled')),
        'reported_in_period', count(*) filter (where created_at >= since),
        'resolved_in_period', (select count(distinct incident_id) from incident_events where event_type = 'status_changed' and to_value = 'resolved' and created_at >= since)
      ) from incidents),
    'urgent', (select coalesce(jsonb_agg(u order by u.needs_urgent_check desc, u.priority_score desc, u.created_at), '[]'::jsonb) from (
        select report_code, type, area_landmark, priority_level, priority_score, status, verification_status, life_threatening,
          confidence_level, needs_urgent_check, created_at
        from incidents where status not in ('resolved', 'cancelled') and (priority_level in ('critical', 'high') or needs_urgent_check)
        order by needs_urgent_check desc, priority_score desc, created_at limit 10) u),
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
revoke execute on function public.admin_update_incident(uuid, jsonb, text) from public, anon;
grant execute on function public.admin_update_incident(uuid, jsonb, text) to authenticated;
revoke execute on function public.recalculate_incident_priority(uuid, text) from public, anon;
grant execute on function public.recalculate_incident_priority(uuid, text) to authenticated;
revoke execute on function public.situation_summary(int) from public, anon;
grant execute on function public.situation_summary(int) to authenticated;
