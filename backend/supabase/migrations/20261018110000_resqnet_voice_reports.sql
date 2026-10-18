/*
# Voice reports: speech-to-text in English or Urdu (feature 11)

The report form records audio and the `transcribe` Edge Function (Gemini) returns:
- the transcript exactly as spoken, in the speaker's own script (English, or Urdu in Urdu script)
- the detected language
- an English translation for coordinators
- the extracted facts (stored in ai_extracted, like AI Assist)

The reporter's own words are the description; nothing here overwrites them.
*/

alter table public.incidents
  add column if not exists input_mode text not null default 'text',
  add column if not exists voice_transcript text,
  add column if not exists transcript_language text,
  add column if not exists transcript_english text;
do $$ begin
  alter table public.incidents add constraint incidents_input_mode_check check (input_mode in ('text', 'voice'));
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.incidents add constraint incidents_transcript_language_check
    check (transcript_language is null or transcript_language in ('en', 'ur', 'mixed', 'other'));
exception when duplicate_object then null; end $$;
drop function if exists public.submit_public_incident(public.incident_type,text,text,int,public.tri_state,public.tri_state,public.tri_state,public.tri_state,double precision,double precision,text,text,jsonb,text,text,public.tri_state,boolean);
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
  p_followup_skipped boolean default false,
  p_input_mode text default 'text',
  p_voice_transcript text default null,
  p_transcript_language text default null,
  p_transcript_english text default null
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
  if coalesce(p_input_mode, 'text') not in ('text', 'voice') then raise exception 'Invalid input mode'; end if;
  if p_transcript_language is not null and p_transcript_language not in ('en', 'ur', 'mixed', 'other') then
    raise exception 'Invalid transcript language';
  end if;
  insert into public.incidents (
    type, description, area_landmark, people_affected, people_trapped,
    injuries_reported, vulnerable_people, danger_increasing, location,
    reporter_name, reporter_phone, reporter_user_id, tracking_token_hash,
    ai_extracted, followup_question, followup_field, followup_answer, followup_skipped,
    input_mode, voice_transcript, transcript_language, transcript_english
  ) values (
    p_type, trim(p_description), nullif(trim(coalesce(p_area_landmark, '')), ''),
    p_people_affected, p_people_trapped, p_injuries_reported,
    p_vulnerable_people, p_danger_increasing,
    st_setsrid(st_makepoint(p_longitude, p_latitude), 4326)::geography,
    nullif(trim(coalesce(p_reporter_name, '')), ''),
    nullif(trim(coalesce(p_reporter_phone, '')), ''),
    auth.uid(), encode(digest(raw_token, 'sha256'), 'hex'),
    case when p_ai_extracted is not null and pg_column_size(p_ai_extracted) <= 16384 then p_ai_extracted end,
    left(p_followup_question, 300), p_followup_field, p_followup_answer, coalesce(p_followup_skipped, false),
    coalesce(p_input_mode, 'text'), left(p_voice_transcript, 5000),
    case when p_input_mode = 'voice' then p_transcript_language end,
    case when p_input_mode = 'voice' then left(p_transcript_english, 5000) end
  ) returning * into created_incident;
  insert into public.audit_logs (actor, actor_user_id, actor_role, action, entity_type, entity_id, new_values, reason)
  values (
    case when auth.uid() is null then 'guest' else 'public-user' end,
    auth.uid(), 'public', 'incident_reported', 'incident', created_incident.id,
    jsonb_build_object('report_code', created_incident.report_code, 'type', created_incident.type,
      'input_mode', created_incident.input_mode, 'transcript_language', created_incident.transcript_language,
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
revoke execute on function public.submit_public_incident(public.incident_type,text,text,int,public.tri_state,public.tri_state,public.tri_state,public.tri_state,double precision,double precision,text,text,jsonb,text,text,public.tri_state,boolean,text,text,text,text) from public;
grant execute on function public.submit_public_incident(public.incident_type,text,text,int,public.tri_state,public.tri_state,public.tri_state,public.tri_state,double precision,double precision,text,text,jsonb,text,text,public.tri_state,boolean,text,text,text,text) to anon, authenticated;
