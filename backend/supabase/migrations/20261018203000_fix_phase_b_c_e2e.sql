-- Fixes found by end-to-end testing of Phase B/C.

-- 1. text[] || 'literal' parsed the literal as an array ("malformed array literal"), so every
--    vulnerability-boosted incident (proxy, welfare, proactive, flood in a vulnerable area) failed to save.
--    Also keep previous_priority_* stable when the boost leaves the effective priority unchanged.
create or replace function private.apply_phase_b_risk()
returns trigger language plpgsql security definer set search_path=public as $$
declare extra int:=0;labels text[]:='{}';flag text;final_score int;
begin
 if new.is_proxy_report then extra:=extra+3;labels:=array_append(labels,'Reported for another person (+3)');end if;
 foreach flag in array array(select distinct unnest(coalesce(new.vulnerability_flags,'{}'))) loop
  if flag in('cannot_walk','oxygen_dependency','dialysis','bedbound')then extra:=extra+10;
  elsif flag in('elderly','child','disabled','pregnant','needs_medicine','chronic_condition','lives_alone','no_phone','wheelchair')then extra:=extra+5;
  elsif flag in('power_dependency','limited_transport')then extra:=extra+7;end if;
 end loop;
 extra:=extra+least(12,round(coalesce(new.area_vulnerability_index,0)*12)::int);
 if new.type='heatwave'and new.vulnerability_flags&&array['elderly','chronic_condition','lives_alone','power_dependency']then extra:=extra+8;labels:=array_append(labels,'Heat vulnerability factors (+8)');end if;
 if new.type='flood'and(coalesce(new.area_vulnerability_index,0)>=.6 or new.vulnerability_flags&&array['cannot_walk','limited_transport','wheelchair'])then extra:=extra+8;labels:=array_append(labels,'Flood evacuation vulnerability (+8)');end if;
 if new.type='fire'and new.vulnerability_flags&&array['cannot_walk','oxygen_dependency','bedbound','wheelchair']then extra:=extra+10;labels:=array_append(labels,'Fire evacuation vulnerability (+10)');end if;
 new.hazard_risk_adjustment:=extra;
 if extra>0 then
  final_score:=least(100,new.calculated_priority_score+extra);new.calculated_priority_score:=final_score;
  new.calculated_priority_level:=(case when final_score>=75 then'critical'when final_score>=50 then'high'when final_score>=25 then'moderate'else'low'end)::public.priority_level;
  new.priority_reasons:=new.priority_reasons||labels||format('Area and personal vulnerability (+%s)',extra);
  if new.priority_override_level is null then new.priority_score:=final_score;new.priority_level:=new.calculated_priority_level;end if;
  new.needs_urgent_check:=(private.level_rank(new.priority_level)>=3 or new.life_threatening)and new.confidence_level='low';
 end if;
 if tg_op='UPDATE' and (new.priority_score,new.priority_level)=(old.priority_score,old.priority_level) then
  new.previous_priority_score:=old.previous_priority_score;new.previous_priority_level:=old.previous_priority_level;
 end if;
 return new;
end $$;

-- 2. Use the app's real capability/equipment vocabulary (TeamsPage, original recommend_teams).
--    Equipment entries are alternatives separated by '|'; a team capability also satisfies them (e.g. 'boat').
create or replace function public.recommend_teams_v2(p_incident_id uuid)
returns table(team_id uuid,team_name text,team_code text,current_status public.team_status,distance_km double precision,capability_match integer,required_capabilities text[],equipment text[],missing_equipment text[],capacity integer,capacity_gap integer,eligible boolean,recommendation_reason text)
language plpgsql security invoker set search_path=public,extensions as $$
declare inc public.incidents;req text[];eq text[];
begin
 select * into inc from public.incidents where id=p_incident_id;if not found then raise exception 'Incident not found';end if;
 req:=case inc.type
  when 'flood' then array['water_rescue','boat','evacuation']
  when 'fire' then array['fire_suppression','evacuation','medical']
  when 'medical_emergency' then array['medical','ambulance']
  when 'heatwave' then array['medical','evacuation','relief_distribution']
  else array['evacuation','general_rescue'] end;
 if inc.life_threatening and not 'medical'=any(req) then req:=req||array['medical'];end if;
 eq:=case inc.type
  when 'flood' then array['rescue_boat|inflatable_boat|life_rafts|boat','life_jackets']
  when 'fire' then array['fire_engine|fire_suppression','breathing_apparatus']
  when 'medical_emergency' then array['first_aid_kit|trauma_kits','ambulance']
  when 'heatwave' then array['water_tanks|relief_distribution','first_aid_kit|trauma_kits']
  else array['first_aid_kit|trauma_kits'] end;
 return query
 select x.id,x.name,x.team_code,x.status,x.km,x.match,req,x.equipment,x.missing,x.capacity,greatest(0,inc.people_affected-x.capacity),
  (x.status='available' and x.capacity>0),
  format('%s/%s capabilities; %s km straight-line; capacity %s for %s people%s',x.match,cardinality(req),x.km,x.capacity,inc.people_affected,
   case when x.status<>'available' then '; unavailable' when x.capacity<inc.people_affected then '; capacity shortfall' when cardinality(x.missing)>0 then '; equipment gaps shown' else '' end)
 from (
  select t.id,t.name,t.team_code,t.status,t.equipment,t.capacity,
   round((st_distance(t.location,inc.location)/1000.0)::numeric,1)::float8 km,
   (select count(*)::int from unnest(req) q where q=any(t.capabilities)) match,
   array(select replace(e,'|',' or ') from unnest(eq) e where not (string_to_array(e,'|') && (t.equipment||t.capabilities))) missing,
   st_distance(t.location,inc.location) d
  from public.rescue_teams t where t.location is not null
 ) x
 order by (x.status='available') desc,x.match desc,cardinality(x.missing) asc,x.d;
end $$;

-- 3. Real greedy allocation: incidents by priority; each takes the best unused eligible team
--    (capability, equipment, distance via recommend_teams_v2) with a reason and a "why not nearest".
create or replace function public.admin_generate_dispatch_plan(p_reason text default 'Coordinator requested plan')
returns uuid language plpgsql security definer set search_path=public,extensions as $$
declare pid uuid;body jsonb:='[]';i record;best record;nearest record;used uuid[]:='{}';why text;
begin
 if not private.is_admin() then raise exception 'Administrator access required';end if;
 -- ponytail: greedy, not optimal; fine at tens of incidents/teams.
 for i in select * from public.incidents where status in('reported','verified') and primary_incident_id is null order by priority_score desc,created_at loop
  select * into best from public.recommend_teams_v2(i.id) r where r.eligible and not r.team_id=any(used) limit 1;
  select * into nearest from public.recommend_teams_v2(i.id) r where r.eligible and not r.team_id=any(used) order by r.distance_km limit 1;
  if best.team_id is not null then
   used:=used||best.team_id;
   why:=format('Best unused team for priority %s: %s',i.priority_score,best.recommendation_reason);
   if cardinality(best.missing_equipment)>0 then why:=why||'. Missing: '||array_to_string(best.missing_equipment,', ');end if;
   if nearest.team_id<>best.team_id then why:=why||format('. Nearest team %s (%s km) not chosen: %s/%s capabilities%s',nearest.team_name,nearest.distance_km,nearest.capability_match,cardinality(nearest.required_capabilities),case when cardinality(nearest.missing_equipment)>0 then ', missing '||array_to_string(nearest.missing_equipment,', ') else '' end);end if;
  end if;
  body:=body||jsonb_build_object('incident_id',i.id,'report_code',i.report_code,'priority',i.priority_level,'score',i.priority_score,
   'team_id',best.team_id,'team_name',best.team_name,'straight_line_km',best.distance_km,
   'reason',case when best.team_id is not null then why end,
   'gap',case when best.team_id is null then 'No available team left — coverage gap' end);
 end loop;
 update public.dispatch_plans set status='superseded' where status='draft';
 insert into public.dispatch_plans(trigger_reason,plan,created_by) values(trim(p_reason),body,auth.uid()) returning id into pid;
 return pid;
end $$;

-- 4. alerts has no unique index on dedup_key, so "on conflict (dedup_key)" raised an error and rolled back
--    every incident that was high/critical at insert. Use a not-exists guard instead.
create or replace function private.create_report_danger_zone()
returns trigger language plpgsql security definer set search_path=public,extensions as $$
declare radius int;
begin
  if new.priority_level not in ('high','critical') or new.status in ('resolved','cancelled') then return null; end if;
  radius := case when new.priority_level='critical' then 500 else 300 end;
  insert into public.danger_zones(incident_id,name,hazard_type,severity,zone,radius_m,instructions)
  values(new.id, format('%s provisional zone',new.report_code),new.type,new.priority_level,
    st_buffer(new.location,radius)::geography,radius,
    'Unverified public report. Avoid the marked area and follow coordinator instructions.')
  on conflict (incident_id) where source='user_report' do update set
    severity=excluded.severity, zone=excluded.zone, radius_m=excluded.radius_m, active=true, updated_at=now();
  insert into public.alerts(incident_id,type,severity,message,dedup_key,entity_type,entity_id)
  select new.id,'danger_zone',new.priority_level,format('Provisional danger zone created from %s',new.report_code),
    'danger-zone-'||new.id::text,'incident',new.id
  where not exists(select 1 from public.alerts where dedup_key='danger-zone-'||new.id::text);
  return null;
end $$;
