/* Phase B — Finding unseen risk (features 63–68, 71).
   Sensitive resident details remain admin-only; public operations use narrow RPCs. */

create table if not exists public.areas (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  boundary geometry(polygon, 4326) not null,
  population integer not null default 0 check (population >= 0),
  low_lying boolean not null default false,
  elderly_share numeric(4,3) not null default 0 check (elderly_share between 0 and 1),
  disability_share numeric(4,3) not null default 0 check (disability_share between 0 and 1),
  living_alone_share numeric(4,3) not null default 0 check (living_alone_share between 0 and 1),
  low_income_share numeric(4,3) not null default 0 check (low_income_share between 0 and 1),
  poor_housing_share numeric(4,3) not null default 0 check (poor_housing_share between 0 and 1),
  poor_signal_share numeric(4,3) not null default 0 check (poor_signal_share between 0 and 1),
  vulnerability_index numeric(4,3) generated always as (
    least(1::numeric, (case when low_lying then .20 else 0 end) + elderly_share*.15 + disability_share*.20 + living_alone_share*.10 + low_income_share*.15 + poor_housing_share*.10 + poor_signal_share*.10)
  ) stored,
  is_demo boolean not null default false,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index if not exists idx_areas_boundary on public.areas using gist(boundary);

insert into public.areas(name,boundary,population,low_lying,elderly_share,disability_share,living_alone_share,low_income_share,poor_housing_share,poor_signal_share,is_demo)
values
('Demo: Rawal Lake East',st_geomfromtext('POLYGON((73.105 33.675,73.135 33.675,73.135 33.705,73.105 33.705,73.105 33.675))',4326),6200,true,.42,.38,.45,.72,.65,.58,true),
('Demo: G-8 Sector',st_geomfromtext('POLYGON((73.025 33.675,73.055 33.675,73.055 33.705,73.025 33.705,73.025 33.675))',4326),10800,false,.13,.07,.10,.20,.09,.05,true),
('Demo: Bari Imam',st_geomfromtext('POLYGON((73.075 33.725,73.105 33.725,73.105 33.755,73.075 33.755,73.075 33.725))',4326),7900,true,.50,.50,.50,.80,.80,.80,true)
on conflict(name) do nothing;

alter table public.incidents add column if not exists is_proxy_report boolean not null default false,
  add column if not exists proxy_relationship text,
  add column if not exists vulnerability_flags text[] not null default '{}',
  add column if not exists incident_origin text not null default 'public_report' check (incident_origin in ('public_report','proactive_check')),
  add column if not exists area_id uuid references public.areas(id) on delete set null,
  add column if not exists area_vulnerability_index numeric(4,3),
  add column if not exists hazard_risk_adjustment integer not null default 0;
create index if not exists idx_incidents_area on public.incidents(area_id);
create index if not exists idx_incidents_origin on public.incidents(incident_origin);

create or replace function private.assign_incident_area() returns trigger language plpgsql security definer set search_path=public,extensions as $$
begin
  select a.id,a.vulnerability_index into new.area_id,new.area_vulnerability_index from public.areas a
  where st_covers(a.boundary, new.location::geometry) order by a.vulnerability_index desc limit 1;
  return new;
end $$;
drop trigger if exists trg_01_assign_incident_area on public.incidents;
create trigger trg_01_assign_incident_area before insert or update of location on public.incidents for each row execute function private.assign_incident_area();

create or replace function private.apply_phase_b_risk() returns trigger language plpgsql security definer set search_path=public as $$
declare extra int:=0; labels text[]:='{}'; flag text; final_score int;
begin
  if new.is_proxy_report then extra:=extra+3; labels:=labels||'Reported for another person (+3)'; end if;
  foreach flag in array coalesce(new.vulnerability_flags,'{}') loop
    if flag in ('cannot_walk','oxygen_dependency','dialysis','bedbound') then extra:=extra+10;
    elsif flag in ('elderly','child','disabled','pregnant','needs_medicine','chronic_condition','lives_alone','no_phone') then extra:=extra+5;
    elsif flag in ('power_dependency','limited_transport') then extra:=extra+7; end if;
  end loop;
  extra:=extra+least(12,round(coalesce(new.area_vulnerability_index,0)*12)::int);
  if new.type='heatwave' and new.vulnerability_flags && array['elderly','chronic_condition','lives_alone','power_dependency'] then extra:=extra+8; labels:=labels||'Heat vulnerability factors (+8)'; end if;
  if new.type='flood' and (coalesce(new.area_vulnerability_index,0)>=.6 or new.vulnerability_flags && array['cannot_walk','limited_transport']) then extra:=extra+8; labels:=labels||'Flood evacuation vulnerability (+8)'; end if;
  if new.type='fire' and new.vulnerability_flags && array['cannot_walk','oxygen_dependency','bedbound'] then extra:=extra+10; labels:=labels||'Fire evacuation vulnerability (+10)'; end if;
  new.hazard_risk_adjustment:=extra;
  if extra>0 then
    final_score:=least(100,new.calculated_priority_score+extra); new.calculated_priority_score:=final_score;
    new.calculated_priority_level:=(case when final_score>=75 then 'critical' when final_score>=50 then 'high' when final_score>=25 then 'moderate' else 'low' end)::public.priority_level;
    new.priority_reasons:=new.priority_reasons||labels||format('Area and personal vulnerability (+%s)',extra);
    if new.priority_override_level is null then new.priority_score:=final_score; new.priority_level:=new.calculated_priority_level; end if;
    new.needs_urgent_check:=(private.level_rank(new.priority_level)>=3 or new.life_threatening) and new.confidence_level='low';
  end if;
  return new;
end $$;
drop trigger if exists trg_zz_phase_b_risk on public.incidents;
create trigger trg_zz_phase_b_risk before insert or update on public.incidents for each row execute function private.apply_phase_b_risk();

create or replace function public.submit_public_incident_v2(
 p_type public.incident_type,p_description text,p_area_landmark text,p_people_affected integer,p_people_trapped public.tri_state,p_injuries_reported public.tri_state,p_vulnerable_people public.tri_state,p_danger_increasing public.tri_state,p_latitude double precision,p_longitude double precision,
 p_reporter_name text default null,p_reporter_phone text default null,p_ai_extracted jsonb default null,p_followup_question text default null,p_followup_field text default null,p_followup_answer public.tri_state default null,p_followup_skipped boolean default false,p_input_mode text default 'text',p_voice_transcript text default null,p_transcript_language text default null,p_transcript_english text default null,p_voice_recording_id uuid default null,
 p_is_proxy_report boolean default false,p_proxy_relationship text default null,p_vulnerability_flags text[] default '{}'
) returns jsonb language plpgsql security definer set search_path=public,extensions as $$
declare result jsonb; iid uuid;
begin
 result:=public.submit_public_incident(p_type,p_description,p_area_landmark,p_people_affected,p_people_trapped,p_injuries_reported,p_vulnerable_people,p_danger_increasing,p_latitude,p_longitude,p_reporter_name,p_reporter_phone,p_ai_extracted,p_followup_question,p_followup_field,p_followup_answer,p_followup_skipped,p_input_mode,p_voice_transcript,p_transcript_language,p_transcript_english,p_voice_recording_id);
 iid:=(result->>'id')::uuid;
 update public.incidents set is_proxy_report=coalesce(p_is_proxy_report,false),proxy_relationship=case when p_is_proxy_report then left(nullif(trim(p_proxy_relationship),''),100) end,vulnerability_flags=coalesce(p_vulnerability_flags,'{}'),updated_at=now() where id=iid;
 return result;
end $$;
revoke execute on function public.submit_public_incident_v2(public.incident_type,text,text,integer,public.tri_state,public.tri_state,public.tri_state,public.tri_state,double precision,double precision,text,text,jsonb,text,text,public.tri_state,boolean,text,text,text,text,uuid,boolean,text,text[]) from public;
grant execute on function public.submit_public_incident_v2(public.incident_type,text,text,integer,public.tri_state,public.tri_state,public.tri_state,public.tri_state,double precision,double precision,text,text,jsonb,text,text,public.tri_state,boolean,text,text,text,text,uuid,boolean,text,text[]) to anon,authenticated;

create table if not exists public.at_risk_residents(
 id uuid primary key default gen_random_uuid(), reference_code text not null default ('AR-'||upper(substr(replace(gen_random_uuid()::text,'-',''),1,8))) unique,
 full_name text not null, phone text not null, preferred_language text not null default 'en', needs text[] not null default '{}', location geography(point,4326) not null, area_id uuid references public.areas(id) on delete set null,
 consent_confirmed boolean not null check(consent_confirmed), active boolean not null default true, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index if not exists idx_at_risk_location on public.at_risk_residents using gist(location);
create or replace function public.register_at_risk(p_full_name text,p_phone text,p_preferred_language text,p_needs text[],p_latitude double precision,p_longitude double precision,p_consent boolean)
returns text language plpgsql security definer set search_path=public,extensions as $$ declare r text; begin
 if not p_consent then raise exception 'Consent is required'; end if; if length(trim(p_full_name))<2 or length(trim(p_phone))<7 then raise exception 'Name and reachable phone are required'; end if;
 insert into public.at_risk_residents(full_name,phone,preferred_language,needs,location,area_id,consent_confirmed)
 select trim(p_full_name),trim(p_phone),coalesce(nullif(p_preferred_language,''),'en'),coalesce(p_needs,'{}'),st_setsrid(st_makepoint(p_longitude,p_latitude),4326)::geography,a.id,true from (select 1) x left join lateral(select id from public.areas where st_covers(boundary,st_setsrid(st_makepoint(p_longitude,p_latitude),4326)) limit 1)a on true returning reference_code into r; return r; end $$;
revoke execute on function public.register_at_risk(text,text,text,text[],double precision,double precision,boolean) from public; grant execute on function public.register_at_risk(text,text,text,text[],double precision,double precision,boolean) to anon,authenticated;

create table if not exists public.hazard_events(id uuid primary key default gen_random_uuid(),title text not null,hazard_type public.incident_type not null,area_id uuid references public.areas(id),message text not null,severity public.priority_level not null default 'high',source text not null default 'coordinator',is_simulation boolean not null default false,active boolean not null default true,created_by uuid references public.profiles(id),created_at timestamptz not null default now(),expires_at timestamptz);
create table if not exists public.safety_checkins(id uuid primary key default gen_random_uuid(),hazard_event_id uuid not null references public.hazard_events(id) on delete cascade,resident_id uuid not null references public.at_risk_residents(id) on delete cascade,token_hash text not null unique,status text not null default 'pending' check(status in('pending','safe','needs_help','no_response')),delivery_status text not null default 'simulated' check(delivery_status in('simulated','queued','sent','failed')),responded_at timestamptz,expires_at timestamptz not null,created_at timestamptz not null default now(),unique(hazard_event_id,resident_id));
create table if not exists public.warning_outbox(id uuid primary key default gen_random_uuid(),checkin_id uuid references public.safety_checkins(id) on delete cascade,channel text not null default 'simulated_sms',destination_masked text,message text not null,is_simulation boolean not null default true,created_at timestamptz not null default now());

create or replace function public.admin_issue_area_warning(p_area_id uuid,p_title text,p_hazard_type public.incident_type,p_message text,p_severity public.priority_level default 'high',p_is_simulation boolean default true,p_expires_hours integer default 6)
returns jsonb language plpgsql security definer set search_path=public,extensions as $$ declare h uuid; r record; tok text; cid uuid; n int:=0; begin if not private.is_admin() then raise exception 'Administrator access required'; end if;
 insert into public.hazard_events(title,hazard_type,area_id,message,severity,is_simulation,created_by,expires_at) values(trim(p_title),p_hazard_type,p_area_id,trim(p_message),p_severity,p_is_simulation,auth.uid(),now()+make_interval(hours=>greatest(1,p_expires_hours))) returning id into h;
 for r in select * from public.at_risk_residents where active and area_id=p_area_id loop tok:=replace(gen_random_uuid()::text,'-',''); insert into public.safety_checkins(hazard_event_id,resident_id,token_hash,expires_at) values(h,r.id,encode(digest(tok,'sha256'),'hex'),now()+make_interval(hours=>greatest(1,p_expires_hours))) returning id into cid; insert into public.warning_outbox(checkin_id,destination_masked,message,is_simulation) values(cid,'***'||right(r.phone,4),p_message||' Check in: /check-in?token='||tok,p_is_simulation); n:=n+1; end loop;
 return jsonb_build_object('hazard_event_id',h,'checkins_created',n,'delivery',case when p_is_simulation then 'simulated' else 'queued' end); end $$;

create or replace function private.create_welfare_incident(p_checkin uuid,p_reason text) returns uuid language plpgsql security definer set search_path=public,extensions as $$ declare c record; iid uuid; begin select sc.*,r.full_name,r.phone,r.needs,r.location,h.hazard_type,h.title into c from public.safety_checkins sc join public.at_risk_residents r on r.id=sc.resident_id join public.hazard_events h on h.id=sc.hazard_event_id where sc.id=p_checkin; insert into public.incidents(type,description,area_landmark,people_affected,people_trapped,injuries_reported,vulnerable_people,danger_increasing,location,reporter_name,reporter_phone,incident_origin,vulnerability_flags) values(c.hazard_type,'Proactive welfare check: '||p_reason||'. Warning: '||c.title,'At-risk register',1,'unknown','unknown','yes','unknown',c.location,c.full_name,c.phone,'proactive_check',c.needs) returning id into iid; return iid; end $$;
create or replace function public.public_safety_checkin(p_token text,p_status text) returns jsonb language plpgsql security definer set search_path=public,extensions as $$ declare c public.safety_checkins;iid uuid;begin if p_status not in('safe','needs_help') then raise exception 'Invalid response'; end if; select * into c from public.safety_checkins where token_hash=encode(digest(p_token,'sha256'),'hex') and status='pending' and expires_at>now() for update; if not found then raise exception 'This check-in link is invalid or expired'; end if; update public.safety_checkins set status=p_status,responded_at=now() where id=c.id; if p_status='needs_help' then iid:=private.create_welfare_incident(c.id,'Resident requested help'); end if; return jsonb_build_object('status',p_status,'incident_created',iid is not null); end $$;
revoke execute on function public.public_safety_checkin(text,text) from public; grant execute on function public.public_safety_checkin(text,text) to anon,authenticated;

create or replace function public.admin_process_overdue_checkins() returns integer language plpgsql security definer set search_path=public as $$ declare r record;n int:=0;begin if not private.is_admin() then raise exception 'Administrator access required'; end if; for r in select id from public.safety_checkins where status='pending' and expires_at<=now() for update skip locked loop update public.safety_checkins set status='no_response' where id=r.id; perform private.create_welfare_incident(r.id,'No response to safety warning');n:=n+1;end loop;return n;end $$;

create or replace function public.list_silent_zones() returns table(area_id uuid,area_name text,vulnerability_index numeric,population integer,recent_reports bigint,active_hazards bigint,is_demo boolean) language sql security definer set search_path=public,extensions as $$ select a.id,a.name,a.vulnerability_index,a.population,(select count(*) from public.incidents i where i.area_id=a.id and i.created_at>now()-interval '3 hours'),(select count(*) from public.hazard_events h where h.area_id=a.id and h.active and (h.expires_at is null or h.expires_at>now())),a.is_demo from public.areas a where a.vulnerability_index>=.6 and exists(select 1 from public.hazard_events h where h.area_id=a.id and h.active and (h.expires_at is null or h.expires_at>now())) and (select count(*) from public.incidents i where i.area_id=a.id and i.created_at>now()-interval '3 hours')<greatest(1,ceil(a.population/2000.0)); $$;

create or replace function public.admin_create_proactive_check_from_area(p_area_id uuid,p_reason text)
returns uuid language plpgsql security definer set search_path=public,extensions as $$ declare a public.areas;ht public.incident_type;iid uuid;begin
 if not private.is_admin() then raise exception 'Administrator access required';end if;
 select * into a from public.areas where id=p_area_id;if not found then raise exception 'Area not found';end if;
 select hazard_type into ht from public.hazard_events where area_id=p_area_id and active and(expires_at is null or expires_at>now())order by created_at desc limit 1;ht:=coalesce(ht,'other');
 insert into public.incidents(type,description,area_landmark,people_affected,people_trapped,injuries_reported,vulnerable_people,danger_increasing,location,incident_origin,vulnerability_flags)
 values(ht,'Proactive welfare verification requested: '||trim(p_reason),a.name,1,'unknown','unknown','yes','unknown',st_centroid(a.boundary)::geography,'proactive_check',array['area_silent_zone'])returning id into iid;
 insert into public.audit_logs(actor,actor_user_id,actor_role,action,entity_type,entity_id,reason)values('admin',auth.uid(),'admin','proactive_welfare_check','incident',iid,trim(p_reason));return iid;end $$;

alter table public.areas enable row level security; alter table public.at_risk_residents enable row level security; alter table public.hazard_events enable row level security; alter table public.safety_checkins enable row level security; alter table public.warning_outbox enable row level security;
create policy areas_auth_read on public.areas for select to authenticated using(true); create policy areas_admin_write on public.areas for all to authenticated using(private.is_admin()) with check(private.is_admin());
create policy residents_admin on public.at_risk_residents for all to authenticated using(private.is_admin()) with check(private.is_admin()); create policy hazards_admin on public.hazard_events for all to authenticated using(private.is_admin()) with check(private.is_admin()); create policy checkins_admin on public.safety_checkins for all to authenticated using(private.is_admin()) with check(private.is_admin()); create policy outbox_admin on public.warning_outbox for all to authenticated using(private.is_admin()) with check(private.is_admin());
grant select,insert,update,delete on public.areas,public.at_risk_residents,public.hazard_events,public.safety_checkins,public.warning_outbox to authenticated;
grant execute on function public.admin_issue_area_warning(uuid,text,public.incident_type,text,public.priority_level,boolean,integer),public.admin_process_overdue_checkins(),public.list_silent_zones(),public.admin_create_proactive_check_from_area(uuid,text) to authenticated;

do $$ begin
 if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='safety_checkins') then alter publication supabase_realtime add table public.safety_checkins; end if;
 if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='hazard_events') then alter publication supabase_realtime add table public.hazard_events; end if;
end $$;

update public.incidents set updated_at=updated_at;
