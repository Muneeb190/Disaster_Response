/* Complete the remaining reporting/review workflows without weakening public RLS. */

alter table public.voice_recordings
  add column if not exists analysis jsonb;

alter table public.incidents
  add column if not exists calculated_priority_score int,
  add column if not exists calculated_priority_level public.priority_level,
  add column if not exists priority_override_level public.priority_level,
  add column if not exists priority_override_reason text,
  add column if not exists priority_override_by uuid references public.profiles(id) on delete set null,
  add column if not exists priority_override_at timestamptz;

-- If the background transcription won the race and completed before submission,
-- enrich the new report before its risk/confidence trigger evaluates it.
create or replace function private.enrich_new_incident_from_voice()
returns trigger language plpgsql security definer set search_path = public as $$
declare v jsonb;
begin
  if new.voice_recording_id is null then return new; end if;
  select analysis into v from public.voice_recordings where id = new.voice_recording_id;
  if v is null then return new; end if;
  new.input_mode := 'voice';
  new.voice_transcript := left(v ->> 'transcript', 5000);
  new.transcript_language := v ->> 'language';
  new.transcript_english := left(v ->> 'english_translation', 5000);
  new.ai_extracted := coalesce(new.ai_extracted, '{}'::jsonb) || v;
  if new.description like 'Voice emergency report%' and length(coalesce(v ->> 'transcript', '')) >= 5 then
    new.description := v ->> 'transcript';
    new.type := coalesce((v ->> 'incident_category')::public.incident_type, new.type);
    new.people_affected := coalesce((v ->> 'people_affected')::int, new.people_affected);
    new.people_trapped := coalesce((v ->> 'people_trapped')::public.tri_state, new.people_trapped);
    new.injuries_reported := coalesce((v ->> 'injuries_reported')::public.tri_state, new.injuries_reported);
    new.vulnerable_people := coalesce((v ->> 'vulnerable_people')::public.tri_state, new.vulnerable_people);
    new.danger_increasing := coalesce((v ->> 'danger_increasing')::public.tri_state, new.danger_increasing);
  end if;
  return new;
end;
$$;
drop trigger if exists trg_00_enrich_new_incident_from_voice on public.incidents;
create trigger trg_00_enrich_new_incident_from_voice
before insert on public.incidents for each row execute function private.enrich_new_incident_from_voice();

-- Preserve the calculated result for transparency, while an explicit human
-- override controls the operational level and queue position until cleared.
create or replace function private.incident_assess_before_write()
returns trigger language plpgsql security definer set search_path = public, extensions as $$
declare a jsonb := private.assess_incident(new); base_score int; final_score int; effective_score int;
begin
  base_score := (a ->> 'score')::int;
  final_score := least(100, base_score + coalesce(new.corroboration_bonus, 0));
  new.calculated_priority_score := final_score;
  new.calculated_priority_level := (case when final_score >= 75 then 'critical' when final_score >= 50 then 'high' when final_score >= 25 then 'moderate' else 'low' end)::public.priority_level;
  effective_score := case new.priority_override_level
    when 'critical' then greatest(final_score, 75)
    when 'high' then least(74, greatest(final_score, 50))
    when 'moderate' then least(49, greatest(final_score, 25))
    when 'low' then least(24, final_score)
    else final_score end;
  if tg_op = 'UPDATE' and (old.priority_score, old.priority_level) is distinct from (effective_score, coalesce(new.priority_override_level, new.calculated_priority_level)) then
    new.previous_priority_score := old.priority_score;
    new.previous_priority_level := old.priority_level;
  end if;
  new.priority_score := effective_score;
  new.priority_level := coalesce(new.priority_override_level, new.calculated_priority_level);
  new.priority_reasons := array(select jsonb_array_elements_text(a -> 'reasons'));
  if new.corroboration_bonus > 0 then new.priority_reasons := new.priority_reasons || format('%s independent nearby reports (+%s)', new.corroboration_count, new.corroboration_bonus); end if;
  if new.priority_override_level is not null then new.priority_reasons := new.priority_reasons || format('Coordinator override: %s', new.priority_override_reason); end if;
  new.life_threatening := (a ->> 'life_threatening')::boolean;
  new.risk_factors := a -> 'factors';
  new.confidence_score := (a ->> 'confidence_score')::int;
  new.confidence_level := a ->> 'confidence_level';
  new.confidence_reasons := a -> 'confidence_reasons';
  new.matching_report_count := (a ->> 'matching_report_count')::int;
  new.needs_urgent_check := (private.level_rank(new.priority_level) >= 3 or new.life_threatening) and new.confidence_level = 'low';
  return new;
end;
$$;

update public.incidents set updated_at = updated_at
where calculated_priority_score is null;

create or replace function public.admin_override_incident_priority(
  p_incident_id uuid,
  p_level public.priority_level,
  p_reason text
) returns public.incidents
language plpgsql security definer set search_path = public as $$
declare before_row public.incidents; after_row public.incidents;
begin
  if not private.is_admin() then raise exception 'Administrator access required'; end if;
  if length(trim(coalesce(p_reason, ''))) < 5 then raise exception 'Give a short reason for this priority decision'; end if;
  select * into before_row from public.incidents where id = p_incident_id for update;
  if not found then raise exception 'Incident not found'; end if;
  update public.incidents set
    priority_override_level = p_level,
    priority_override_reason = case when p_level is null then null else trim(p_reason) end,
    priority_override_by = case when p_level is null then null else auth.uid() end,
    priority_override_at = case when p_level is null then null else now() end,
    updated_at = now()
  where id = p_incident_id returning * into after_row;
  insert into public.audit_logs (actor, actor_user_id, actor_role, action, entity_type, entity_id, previous_values, new_values, reason)
  values ('admin', auth.uid(), 'admin', case when p_level is null then 'priority_override_cleared' else 'priority_overridden' end,
    'incident', p_incident_id,
    jsonb_build_object('level', before_row.priority_level, 'score', before_row.priority_score, 'override', before_row.priority_override_level),
    jsonb_build_object('level', after_row.priority_level, 'score', after_row.priority_score, 'override', after_row.priority_override_level), trim(p_reason));
  return after_row;
end;
$$;

create or replace function public.dismiss_duplicate_suggestion(
  p_incident_id uuid,
  p_candidate_id uuid,
  p_reason text
) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not private.is_admin() then raise exception 'Administrator access required'; end if;
  if length(trim(coalesce(p_reason, ''))) < 5 then raise exception 'Give a short reason for rejecting this suggestion'; end if;
  update public.incident_duplicate_candidates set status = 'dismissed', reviewed_by = auth.uid(), reviewed_at = now(), updated_at = now()
  where incident_a_id = least(p_incident_id, p_candidate_id) and incident_b_id = greatest(p_incident_id, p_candidate_id)
    and status in ('suggested', 'unlinked');
  if not found then raise exception 'Duplicate suggestion was not found'; end if;
  insert into public.audit_logs (actor, actor_user_id, actor_role, action, entity_type, entity_id, new_values, reason)
  values ('admin', auth.uid(), 'admin', 'duplicate_suggestion_dismissed', 'incident', p_incident_id,
    jsonb_build_object('candidate_incident_id', p_candidate_id), trim(p_reason));
end;
$$;

revoke execute on function public.admin_override_incident_priority(uuid, public.priority_level, text) from public, anon;
revoke execute on function public.dismiss_duplicate_suggestion(uuid, uuid, text) from public, anon;
grant execute on function public.admin_override_incident_priority(uuid, public.priority_level, text) to authenticated;
grant execute on function public.dismiss_duplicate_suggestion(uuid, uuid, text) to authenticated;

create or replace function public.append_public_incident_details(
  p_report_code text,
  p_tracking_token text,
  p_details text
) returns timestamptz
language plpgsql security definer set search_path = public, extensions as $$
declare target public.incidents; changed_at timestamptz;
begin
  if length(trim(coalesce(p_details, ''))) < 5 then raise exception 'Add at least 5 characters of new information'; end if;
  if length(p_details) > 2000 then raise exception 'Additional information is too long'; end if;
  select * into target from public.incidents where report_code = upper(trim(p_report_code)) for update;
  if not found then raise exception 'Report not found'; end if;
  if not ((auth.uid() is not null and target.reporter_user_id = auth.uid()) or
    (p_tracking_token is not null and encode(digest(p_tracking_token, 'sha256'), 'hex') = target.tracking_token_hash)) then
    raise exception 'Invalid report ID or private tracking key';
  end if;
  update public.incidents set description = description || E'\n\nReporter update: ' || trim(p_details), updated_at = now()
  where id = target.id returning updated_at into changed_at;
  insert into public.audit_logs (actor, actor_user_id, actor_role, action, entity_type, entity_id, new_values, reason)
  values (case when auth.uid() is null then 'guest' else 'public-user' end, auth.uid(), 'public', 'reporter_details_added', 'incident', target.id,
    jsonb_build_object('details', trim(p_details)), 'Reporter added information after initial submission');
  return changed_at;
end;
$$;
revoke execute on function public.append_public_incident_details(text, text, text) from public;
grant execute on function public.append_public_incident_details(text, text, text) to anon, authenticated;
