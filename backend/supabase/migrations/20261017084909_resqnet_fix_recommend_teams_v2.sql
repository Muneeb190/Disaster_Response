/* Fix recommend_teams: cast distance_km to double precision */
create or replace function recommend_teams(p_incident_id uuid)
returns table(team_id uuid, team_name text, team_code text, capabilities text[], distance_km float, capability_match int, recommendation_reason text, current_status team_status)
language plpgsql security definer as $$
declare inc record; req_caps text[];
begin
  select * into inc from incidents where id = p_incident_id;
  if not found then raise exception 'Incident not found'; end if;
  req_caps := case inc.type
    when 'flood' then array['water_rescue','boat','evacuation']
    when 'fire' then array['fire_suppression','evacuation','medical']
    when 'medical_emergency' then array['medical','ambulance']
    when 'heatwave' then array['medical','evacuation','relief_distribution']
    else array['evacuation','general_rescue'] end;
  if inc.life_threatening then req_caps := req_caps || array['medical']; end if;

  return query
  select
    r.tid, r.tname, r.tcode, r.caps, r.dist::double precision, r.match,
    format('Matches %s of %s required capabilities; %s km away%s', r.match, array_length(req_caps,1), r.dist, case when r.match=0 then ' — no direct capability match' else '' end),
    r.tstat
  from (
    select
      t.id as tid, t.name as tname, t.team_code as tcode, t.capabilities as caps, t.status as tstat,
      round((st_distance(inc.location::geometry, t.location::geometry)/1000.0)::numeric,1) as dist,
      (select count(*) from unnest(req_caps) req where req = any(t.capabilities)) as match
    from rescue_teams t
    where t.status='available' and t.location is not null
  ) r
  order by r.match desc, r.dist asc;
end;
$$;
