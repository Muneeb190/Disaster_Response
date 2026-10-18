-- Phases D/E: one migration because persistent early-action decisions and
-- exactly-once offline replay both require server-side state.
alter table public.hazard_events add column if not exists feed_key text unique,
  add column if not exists source_url text,
  add column if not exists observed_at timestamptz,
  add column if not exists zone geography(polygon,4326);
alter table public.danger_zones add column if not exists hazard_event_id uuid unique references public.hazard_events(id) on delete cascade;

create table if not exists public.prepositioning_suggestions(
  id uuid primary key default gen_random_uuid(), hazard_event_id uuid not null references public.hazard_events(id) on delete cascade,
  area_id uuid references public.areas(id), team_id uuid references public.rescue_teams(id), resource_id uuid references public.resources(id),
  reason text not null, status text not null default 'suggested' check(status in('suggested','approved','dismissed')),
  approved_by uuid references public.profiles(id), approved_at timestamptz, created_at timestamptz not null default now(),
  unique(hazard_event_id,team_id,resource_id)
);
create table if not exists public.pre_hazard_evacuations(
  id uuid primary key default gen_random_uuid(), hazard_event_id uuid not null references public.hazard_events(id) on delete cascade,
  resident_id uuid not null references public.at_risk_residents(id) on delete cascade,
  shelter_id uuid references public.shelters(id), team_id uuid references public.rescue_teams(id),
  status text not null default 'needs_transport' check(status in('needs_transport','planned','en_route','arrived','cancelled')),
  reason text not null, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique(hazard_event_id,resident_id)
);
create table if not exists public.sync_operations(
  id uuid primary key default gen_random_uuid(), idempotency_key uuid not null unique, user_id uuid references public.profiles(id),
  operation_type text not null, payload jsonb not null, status text not null default 'completed' check(status in('completed','conflict')),
  result jsonb, error text, created_at timestamptz not null default now()
);
create table if not exists public.sms_inbox(
  id uuid primary key default gen_random_uuid(), provider_message_id text unique, sender_masked text not null,
  message text not null, parsed_payload jsonb, incident_id uuid references public.incidents(id),
  status text not null default 'received' check(status in('received','incident_created','needs_review','rejected')),
  is_simulation boolean not null default true, received_at timestamptz not null default now()
);

create or replace function public.admin_generate_early_actions()
returns jsonb language plpgsql security definer set search_path=public,extensions as $$
declare h record; t uuid; r uuid; inserted_moves int:=0; inserted_evac int:=0;
begin
  if not private.is_admin() then raise exception 'Administrator access required'; end if;
  for h in select * from public.hazard_events where active and (expires_at is null or expires_at>now()) loop
    select id into t from public.rescue_teams where status='available' order by case when capabilities && case h.hazard_type when 'flood' then array['boat','water_rescue'] when 'medical_emergency' then array['medical','ambulance'] when 'fire' then array['fire_suppression'] else array['evacuation','general_rescue'] end then 0 else 1 end, updated_at limit 1;
    select id into r from public.resources where quantity_available>0 order by case when type::text in('vehicle','boat','medical_kit') then 0 else 1 end,quantity_available desc limit 1;
    if t is not null then insert into public.prepositioning_suggestions(hazard_event_id,area_id,team_id,resource_id,reason)
      values(h.id,h.area_id,t,r,'Active '||h.hazard_type||' warning: move a capable team closer before reports arrive') on conflict do nothing;
      get diagnostics inserted_moves=row_count; end if;
    insert into public.pre_hazard_evacuations(hazard_event_id,resident_id,reason)
      select h.id,ar.id,'Registered needs require transport before '||h.hazard_type||' conditions worsen'
      from public.at_risk_residents ar where ar.active and (h.area_id is null or ar.area_id=h.area_id)
        and ar.needs && array['cannot_walk','wheelchair','bedridden','oxygen','dialysis','lives_alone'] on conflict do nothing;
    get diagnostics inserted_evac=row_count;
  end loop;
  return jsonb_build_object('suggestions_created',inserted_moves,'evacuations_created',inserted_evac);
end $$;

create or replace function public.admin_approve_prepositioning(p_id uuid,p_destination text)
returns void language plpgsql security definer set search_path=public as $$
declare s public.prepositioning_suggestions;
begin
  if not private.is_admin() then raise exception 'Administrator access required'; end if;
  select * into s from public.prepositioning_suggestions where id=p_id and status='suggested' for update;
  if not found then raise exception 'Suggestion is no longer available'; end if;
  update public.prepositioning_suggestions set status='approved',approved_by=auth.uid(),approved_at=now() where id=p_id;
  if s.resource_id is not null then insert into public.resource_movements(resource_id,movement_type,quantity,destination_location,reason,actor_id)
    values(s.resource_id,'transferred',1,nullif(trim(p_destination),''),'Approved pre-positioning for active warning',auth.uid()); end if;
  insert into public.alerts(type,severity,message,dedup_key,entity_type,entity_id)
    values('prepositioning','moderate','Pre-positioning approved: '||coalesce(nullif(trim(p_destination),''),'warning area'),'preposition-'||p_id,'prepositioning',p_id);
end $$;

create or replace function public.shelter_pressure()
returns table(shelter_id uuid,shelter_name text,capacity int,occupancy int,expected_arrivals bigint,projected_free bigint,overflow_risk boolean)
language sql stable security invoker set search_path=public as $$
 select s.id,s.name,s.capacity,s.occupancy,count(e.id) filter(where e.status in('planned','en_route')),
   s.capacity-s.occupancy-count(e.id) filter(where e.status in('planned','en_route')),
   s.occupancy+count(e.id) filter(where e.status in('planned','en_route'))>s.capacity
 from public.shelters s left join public.pre_hazard_evacuations e on e.shelter_id=s.id
 where s.status<>'closed' group by s.id;
$$;

create or replace function public.sync_responder_action(p_idempotency_key uuid,p_assignment_id uuid,p_action text,p_reason text,p_latitude double precision,p_longitude double precision,p_accuracy_m double precision)
returns jsonb language plpgsql security definer set search_path=public as $$
declare existing jsonb; a public.assignments;
begin
 select result into existing from public.sync_operations where idempotency_key=p_idempotency_key and user_id=auth.uid();
 if found then return existing; end if;
 a:=public.responder_assignment_action(p_assignment_id,p_action,p_reason,p_latitude,p_longitude,p_accuracy_m);
 existing:=to_jsonb(a); insert into public.sync_operations(idempotency_key,user_id,operation_type,payload,result)
 values(p_idempotency_key,auth.uid(),'responder_action',jsonb_build_object('assignment_id',p_assignment_id,'action',p_action),existing);
 return existing;
end $$;

create or replace function public.sync_public_report(p_idempotency_key uuid,p_payload jsonb)
returns jsonb language plpgsql security definer set search_path=public as $$
declare existing jsonb; result jsonb; flags text[];
begin
 select so.result into existing from public.sync_operations so where so.idempotency_key=p_idempotency_key;
 if found then return existing; end if;
 select coalesce(array_agg(value),'{}') into flags from jsonb_array_elements_text(coalesce(p_payload->'vulnerability_flags','[]'::jsonb));
 result:=public.submit_public_incident_v2(
   (p_payload->>'type')::public.incident_type,p_payload->>'description',p_payload->>'area_landmark',coalesce((p_payload->>'people_affected')::int,0),
   coalesce((p_payload->>'people_trapped')::public.tri_state,'unknown'),coalesce((p_payload->>'injuries_reported')::public.tri_state,'unknown'),coalesce((p_payload->>'vulnerable_people')::public.tri_state,'unknown'),coalesce((p_payload->>'danger_increasing')::public.tri_state,'unknown'),
   (p_payload->>'latitude')::double precision,(p_payload->>'longitude')::double precision,p_payload->>'reporter_name',p_payload->>'reporter_phone',p_payload->'ai_extracted',
   p_payload->>'followup_question',p_payload->>'followup_field',nullif(p_payload->>'followup_answer','')::public.tri_state,coalesce((p_payload->>'followup_skipped')::boolean,false),
   coalesce(p_payload->>'input_mode','text'),p_payload->>'voice_transcript',p_payload->>'transcript_language',p_payload->>'transcript_english',nullif(p_payload->>'voice_recording_id','')::uuid,
   coalesce((p_payload->>'is_proxy_report')::boolean,false),p_payload->>'proxy_relationship',flags);
 insert into public.sync_operations(idempotency_key,user_id,operation_type,payload,result) values(p_idempotency_key,auth.uid(),'public_report',p_payload,result);
 return result;
end $$;

alter table public.prepositioning_suggestions enable row level security; alter table public.pre_hazard_evacuations enable row level security;
alter table public.sync_operations enable row level security; alter table public.sms_inbox enable row level security;
create policy early_moves_admin on public.prepositioning_suggestions for all to authenticated using(private.is_admin()) with check(private.is_admin());
create policy early_evac_admin on public.pre_hazard_evacuations for all to authenticated using(private.is_admin()) with check(private.is_admin());
create policy sync_own on public.sync_operations for select to authenticated using(user_id=auth.uid());
create policy sms_admin on public.sms_inbox for all to authenticated using(private.is_admin()) with check(private.is_admin());
grant select,insert,update on public.prepositioning_suggestions,public.pre_hazard_evacuations,public.sms_inbox to authenticated;
grant select on public.sync_operations to authenticated;
grant execute on function public.admin_generate_early_actions(),public.admin_approve_prepositioning(uuid,text),public.shelter_pressure(),public.sync_responder_action(uuid,uuid,text,text,double precision,double precision,double precision) to authenticated;
revoke execute on function public.sync_public_report(uuid,jsonb) from public;
grant execute on function public.sync_public_report(uuid,jsonb) to anon,authenticated;
