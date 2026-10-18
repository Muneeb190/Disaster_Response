-- Harden public Phase B entry points: allowlisted, de-duplicated flags; admin-only silent zones;
-- no PUBLIC/anon execute on coordinator functions.

create or replace function private.clean_vulnerability_flags(p_flags text[])
returns text[] language sql immutable set search_path=public as $$
 select coalesce(array(select distinct f from unnest(coalesce(p_flags,'{}')) f
  where f = any(array['elderly','child','disabled','pregnant','cannot_walk','chronic_condition','needs_medicine','oxygen_dependency','dialysis','bedbound','lives_alone','no_phone','power_dependency','limited_transport','wheelchair'])
  order by f),'{}');
$$;

create or replace function public.submit_public_incident_v2(
 p_type public.incident_type,p_description text,p_area_landmark text,p_people_affected integer,p_people_trapped public.tri_state,p_injuries_reported public.tri_state,p_vulnerable_people public.tri_state,p_danger_increasing public.tri_state,p_latitude double precision,p_longitude double precision,
 p_reporter_name text default null,p_reporter_phone text default null,p_ai_extracted jsonb default null,p_followup_question text default null,p_followup_field text default null,p_followup_answer public.tri_state default null,p_followup_skipped boolean default false,p_input_mode text default 'text',p_voice_transcript text default null,p_transcript_language text default null,p_transcript_english text default null,p_voice_recording_id uuid default null,
 p_is_proxy_report boolean default false,p_proxy_relationship text default null,p_vulnerability_flags text[] default '{}'
) returns jsonb language plpgsql security definer set search_path=public,extensions as $$
declare result jsonb; iid uuid;
begin
 result:=public.submit_public_incident(p_type,p_description,p_area_landmark,p_people_affected,p_people_trapped,p_injuries_reported,p_vulnerable_people,p_danger_increasing,p_latitude,p_longitude,p_reporter_name,p_reporter_phone,p_ai_extracted,p_followup_question,p_followup_field,p_followup_answer,p_followup_skipped,p_input_mode,p_voice_transcript,p_transcript_language,p_transcript_english,p_voice_recording_id);
 iid:=(result->>'id')::uuid;
 update public.incidents set is_proxy_report=coalesce(p_is_proxy_report,false),proxy_relationship=case when p_is_proxy_report then left(nullif(trim(p_proxy_relationship),''),100) end,vulnerability_flags=private.clean_vulnerability_flags(p_vulnerability_flags),updated_at=now() where id=iid;
 return result;
end $$;

-- One active registration per phone (re-registering updates it); validated, bounded input.
-- ponytail: no OTP phone verification; add it before real (non-demo) deployment.
create or replace function public.register_at_risk(p_full_name text,p_phone text,p_preferred_language text,p_needs text[],p_latitude double precision,p_longitude double precision,p_consent boolean)
returns text language plpgsql security definer set search_path=public,extensions as $$
declare r text; ph text:=regexp_replace(coalesce(p_phone,''),'[^0-9+]','','g'); nm text:=left(trim(coalesce(p_full_name,'')),100);
 pt geography:=st_setsrid(st_makepoint(p_longitude,p_latitude),4326)::geography; aid uuid; lang text:=case when p_preferred_language='ur' then 'ur' else 'en' end;
begin
 if not coalesce(p_consent,false) then raise exception 'Consent is required'; end if;
 if length(nm)<2 or length(ph)<7 or length(ph)>16 then raise exception 'Name and reachable phone are required'; end if;
 if p_latitude is null or p_longitude is null or p_latitude not between -90 and 90 or p_longitude not between -180 and 180 then raise exception 'A valid location is required'; end if;
 select id into aid from public.areas where st_covers(boundary,pt::geometry) limit 1;
 update public.at_risk_residents set full_name=nm,preferred_language=lang,needs=private.clean_vulnerability_flags(p_needs),location=pt,area_id=aid,updated_at=now()
  where phone=ph and active returning reference_code into r;
 if r is null then
  insert into public.at_risk_residents(full_name,phone,preferred_language,needs,location,area_id,consent_confirmed)
  values(nm,ph,lang,private.clean_vulnerability_flags(p_needs),pt,aid,true) returning reference_code into r;
 end if;
 return r;
end $$;

create or replace function public.list_silent_zones()
returns table(area_id uuid,area_name text,vulnerability_index numeric,population integer,recent_reports bigint,active_hazards bigint,is_demo boolean)
language plpgsql security definer set search_path=public,extensions as $$
begin
 if not private.is_admin() then raise exception 'Administrator access required'; end if;
 return query select a.id,a.name,a.vulnerability_index,a.population,
 (select count(*) from public.incidents i where i.area_id=a.id and i.created_at>now()-interval '3 hours'),
 (select count(*) from public.hazard_events h where h.area_id=a.id and h.active and(h.expires_at is null or h.expires_at>now())),a.is_demo
 from public.areas a where a.vulnerability_index>=.6
 and exists(select 1 from public.hazard_events h where h.area_id=a.id and h.active and(h.expires_at is null or h.expires_at>now()))
 and(select count(*) from public.incidents i where i.area_id=a.id and i.created_at>now()-interval '3 hours')<greatest(1,ceil(a.population/2000.0));
end $$;

revoke execute on function private.clean_vulnerability_flags(text[]) from public, anon, authenticated;
revoke execute on function
 public.admin_issue_area_warning(uuid,text,public.incident_type,text,public.priority_level,boolean,integer),
 public.admin_process_overdue_checkins(),
 public.list_silent_zones(),
 public.admin_create_proactive_check_from_area(uuid,text),
 public.admin_create_road_closure(text,text,jsonb,text,timestamptz),
 public.list_active_road_closures(),
 public.recommend_teams_v2(uuid),
 public.admin_generate_dispatch_plan(text),
 public.admin_approve_dispatch_plan(uuid),
 public.admin_record_resource_movement(uuid,text,integer,text,text,text),
 public.area_response_fairness()
from public, anon;
grant execute on function
 public.admin_issue_area_warning(uuid,text,public.incident_type,text,public.priority_level,boolean,integer),
 public.admin_process_overdue_checkins(),
 public.list_silent_zones(),
 public.admin_create_proactive_check_from_area(uuid,text),
 public.admin_create_road_closure(text,text,jsonb,text,timestamptz),
 public.list_active_road_closures(),
 public.recommend_teams_v2(uuid),
 public.admin_generate_dispatch_plan(text),
 public.admin_approve_dispatch_plan(uuid),
 public.admin_record_resource_movement(uuid,text,integer,text,text,text),
 public.area_response_fairness()
to authenticated;
