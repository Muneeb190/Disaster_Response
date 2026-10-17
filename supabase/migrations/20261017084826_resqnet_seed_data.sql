/*
# ResQNet Seed Data — Fictional Demo Locations
6 teams, 7 resources, 18 incidents, 2 historical assignments. All fictional.
Repeatable via ON CONFLICT.
*/

insert into rescue_teams (team_code, name, capabilities, equipment, capacity, status, location, last_location_update) values
('TM-0001','Riverine Rescue Alpha', array['water_rescue','boat','evacuation','medical'], array['rescue_boat','life_jackets','first_aid_kit'], 6, 'available', st_setsrid(st_makepoint(77.21, 28.61),4326)::geography, now())
on conflict (team_code) do nothing;
insert into rescue_teams (team_code, name, capabilities, equipment, capacity, status, location, last_location_update) values
('TM-0002','Fire Response Bravo', array['fire_suppression','evacuation','medical'], array['fire_engine','breathing_apparatus','extrication_tools'], 8, 'available', st_setsrid(st_makepoint(77.19, 28.59),4326)::geography, now())
on conflict (team_code) do nothing;
insert into rescue_teams (team_code, name, capabilities, equipment, capacity, status, location, last_location_update) values
('TM-0003','Medical Evac Charlie', array['medical','ambulance','evacuation'], array['ambulance','trauma_kits','oxygen'], 4, 'available', st_setsrid(st_makepoint(77.22, 28.63),4326)::geography, now())
on conflict (team_code) do nothing;
insert into rescue_teams (team_code, name, capabilities, equipment, capacity, status, location, last_location_update) values
('TM-0004','Relief Distribution Delta', array['relief_distribution','evacuation','general_rescue'], array['supply_truck','water_tanks','blankets'], 10, 'available', st_setsrid(st_makepoint(77.18, 28.60),4326)::geography, now())
on conflict (team_code) do nothing;
insert into rescue_teams (team_code, name, capabilities, equipment, capacity, status, location, last_location_update) values
('TM-0005','Urban Search Echo', array['general_rescue','evacuation','medical'], array['rope_rescue','thermal_camera','first_aid_kit'], 6, 'offline', st_setsrid(st_makepoint(77.23, 28.61),4326)::geography, now())
on conflict (team_code) do nothing;
insert into rescue_teams (team_code, name, capabilities, equipment, capacity, status, location, last_location_update) values
('TM-0006','Water Rescue Foxtrot', array['water_rescue','boat','medical'], array['inflatable_boat','life_rafts','first_aid_kit'], 5, 'available', st_setsrid(st_makepoint(77.20, 28.58),4326)::geography, now())
on conflict (team_code) do nothing;

insert into resources (name, type, quantity_available, quantity_reserved, location, low_stock_threshold) values
('Rescue Boats Depot A', 'boat', 8, 2, st_setsrid(st_makepoint(77.20, 28.60),4326)::geography, 3)
on conflict (name) do nothing;
insert into resources (name, type, quantity_available, quantity_reserved, location, low_stock_threshold) values
('Ambulance Fleet Central', 'ambulance', 5, 1, st_setsrid(st_makepoint(77.22, 28.62),4326)::geography, 2)
on conflict (name) do nothing;
insert into resources (name, type, quantity_available, quantity_reserved, location, low_stock_threshold) values
('Medical Supply Cache', 'medical_kit', 3, 0, st_setsrid(st_makepoint(77.21, 28.61),4326)::geography, 5)
on conflict (name) do nothing;
insert into resources (name, type, quantity_available, quantity_reserved, location, low_stock_threshold) values
('Drinking Water Stockpile', 'drinking_water', 500, 100, st_setsrid(st_makepoint(77.19, 28.60),4326)::geography, 100)
on conflict (name) do nothing;
insert into resources (name, type, quantity_available, quantity_reserved, location, low_stock_threshold) values
('Food Supply Warehouse', 'food', 200, 50, st_setsrid(st_makepoint(77.18, 28.59),4326)::geography, 50)
on conflict (name) do nothing;
insert into resources (name, type, quantity_available, quantity_reserved, location, low_stock_threshold) values
('Central Shelter', 'shelter', 120, 85, st_setsrid(st_makepoint(77.21, 28.62),4326)::geography, 20)
on conflict (name) do nothing;
insert into resources (name, type, quantity_available, quantity_reserved, location, low_stock_threshold) values
('North Shelter', 'shelter', 80, 30, st_setsrid(st_makepoint(77.23, 28.63),4326)::geography, 15)
on conflict (name) do nothing;

insert into incidents (report_code, type, description, area_landmark, people_affected, people_trapped, injuries_reported, vulnerable_people, danger_increasing, location, status, verification_status, reporter_name, reporter_phone)
values ('RN-DEMO001','flood','Water is entering our house on the ground floor. My elderly father cannot walk and we are trapped upstairs. Water level rising fast.','Riverside Colony Block 3', 4, 'yes', 'no', 'yes', 'yes', st_setsrid(st_makepoint(77.20, 28.60),4326)::geography, 'verified', 'verified', 'Demo Citizen A', '555-0101')
on conflict (report_code) do nothing;

insert into incidents (report_code, type, description, area_landmark, people_affected, people_trapped, injuries_reported, vulnerable_people, danger_increasing, location, status, verification_status)
values ('RN-DEMO002','medical_emergency','A man collapsed with chest pain at the market square. He is conscious but in severe pain. Needs immediate medical attention.','Market Square Junction', 1, 'no', 'yes', 'yes', 'unknown', st_setsrid(st_makepoint(77.22, 28.61),4326)::geography, 'verified', 'verified')
on conflict (report_code) do nothing;

insert into incidents (report_code, type, description, area_landmark, people_affected, people_trapped, injuries_reported, vulnerable_people, danger_increasing, location, status, verification_status)
values ('RN-DEMO003','flood','Our neighborhood has been without clean drinking water for two days. We need water supply urgently. 6 families affected.','Green Park Area', 12, 'no', 'no', 'no', 'no', st_setsrid(st_makepoint(77.19, 28.59),4326)::geography, 'reported', 'pending')
on conflict (report_code) do nothing;

insert into incidents (report_code, type, description, area_landmark, people_affected, people_trapped, injuries_reported, vulnerable_people, danger_increasing, location, status, verification_status)
values ('RN-DEMO004','flood','Central shelter is filling up fast. We have 85 of 120 beds occupied and more families arriving. May need overflow capacity soon.','Central Shelter Complex', 85, 'no', 'no', 'yes', 'yes', st_setsrid(st_makepoint(77.21, 28.62),4326)::geography, 'verified', 'verified')
on conflict (report_code) do nothing;

insert into incidents (report_code, type, description, area_landmark, people_affected, people_trapped, injuries_reported, vulnerable_people, danger_increasing, location, status, verification_status)
values ('RN-DEMO005','flood','Flood water breaching the embankment near our street. Several houses already waterlogged. Situation getting worse.','Embankment Road Sector 7', 20, 'unknown', 'unknown', 'unknown', 'yes', st_setsrid(st_makepoint(77.20, 28.59),4326)::geography, 'verified', 'verified')
on conflict (report_code) do nothing;

insert into incidents (report_code, type, description, area_landmark, people_affected, people_trapped, injuries_reported, vulnerable_people, danger_increasing, location, status, verification_status)
values ('RN-DEMO006','fire','Fire broke out in a residential building on Park Street. Smoke visible from multiple floors. Residents evacuating.','Park Street Building 12', 15, 'no', 'unknown', 'unknown', 'yes', st_setsrid(st_makepoint(77.23, 28.60),4326)::geography, 'verified', 'verified')
on conflict (report_code) do nothing;

insert into incidents (report_code, type, description, area_landmark, people_affected, people_trapped, injuries_reported, vulnerable_people, danger_increasing, location, status, verification_status)
values ('RN-DEMO007','heatwave','Extreme heat affecting elderly residents in our apartment complex. Several people feeling dizzy and dehydrated.','Sunrise Apartments', 8, 'no', 'unknown', 'yes', 'no', st_setsrid(st_makepoint(77.21, 28.58),4326)::geography, 'reported', 'pending')
on conflict (report_code) do nothing;

insert into incidents (report_code, type, description, area_landmark, people_affected, people_trapped, injuries_reported, vulnerable_people, danger_increasing, location, status, verification_status)
values ('RN-DEMO008','flood','Minor waterlogging on the street has been cleared. No one trapped, no injuries.','Lake View Road', 0, 'no', 'no', 'no', 'no', st_setsrid(st_makepoint(77.18, 28.61),4326)::geography, 'resolved', 'verified')
on conflict (report_code) do nothing;

insert into incidents (report_code, type, description, area_landmark, people_affected, people_trapped, injuries_reported, vulnerable_people, danger_increasing, location, status, verification_status)
values ('RN-DEMO009','medical_emergency','Clinic reporting shortage of medical supplies. They have patients needing treatment but insufficient kits.','District Clinic North', 10, 'no', 'unknown', 'yes', 'no', st_setsrid(st_makepoint(77.22, 28.63),4326)::geography, 'verified', 'verified')
on conflict (report_code) do nothing;

insert into incidents (report_code, type, description, area_landmark, people_affected, people_trapped, injuries_reported, vulnerable_people, danger_increasing, location, status, verification_status)
values ('RN-DEMO010','flood','Water suddenly entered homes in the low-lying area. We could hear people calling for help but cannot confirm details.','Low-Lying Sector 4', 25, 'unknown', 'unknown', 'unknown', 'yes', st_setsrid(st_makepoint(77.19, 28.58),4326)::geography, 'reported', 'pending')
on conflict (report_code) do nothing;

insert into incidents (report_code, type, description, area_landmark, people_affected, people_trapped, injuries_reported, vulnerable_people, danger_increasing, location, status, verification_status)
values ('RN-DEMO011','fire','Factory fire with workers trapped inside. Smoke is very thick. Multiple injuries reported by those who escaped.','Industrial Zone Plot 9', 30, 'yes', 'yes', 'unknown', 'yes', st_setsrid(st_makepoint(77.17, 28.59),4326)::geography, 'verified', 'verified')
on conflict (report_code) do nothing;

insert into incidents (report_code, type, description, area_landmark, people_affected, people_trapped, injuries_reported, vulnerable_people, danger_increasing, location, status, verification_status)
values ('RN-DEMO012','heatwave','Heatwave conditions persisting. Elderly care home requesting support. Some residents need medical evaluation.','Golden Years Care Home', 22, 'no', 'no', 'yes', 'no', st_setsrid(st_makepoint(77.24, 28.61),4326)::geography, 'verified', 'verified')
on conflict (report_code) do nothing;

insert into incidents (report_code, type, description, area_landmark, people_affected, people_trapped, injuries_reported, vulnerable_people, danger_increasing, location, status, verification_status)
values ('RN-DEMO013','other','Tree fallen on road blocking access to our street. Need clearing crew. No injuries.','Hill Road Junction', 0, 'no', 'no', 'no', 'no', st_setsrid(st_makepoint(77.25, 28.62),4326)::geography, 'reported', 'pending')
on conflict (report_code) do nothing;

insert into incidents (report_code, type, description, area_landmark, people_affected, people_trapped, injuries_reported, vulnerable_people, danger_increasing, location, status, verification_status)
values ('RN-DEMO014','flood','Rising water in our colony. 15 families need evacuation. Children and elderly among us. Water entering homes.','Subhash Colony', 30, 'no', 'no', 'yes', 'yes', st_setsrid(st_makepoint(77.20, 28.57),4326)::geography, 'verified', 'verified')
on conflict (report_code) do nothing;

insert into incidents (report_code, type, description, area_landmark, people_affected, people_trapped, injuries_reported, vulnerable_people, danger_increasing, location, status, verification_status)
values ('RN-DEMO015','medical_emergency','Pregnant woman at shelter experiencing complications. Needs ambulance and medical team urgently.','North Shelter Block 2', 1, 'no', 'yes', 'yes', 'unknown', st_setsrid(st_makepoint(77.23, 28.63),4326)::geography, 'verified', 'verified')
on conflict (report_code) do nothing;

insert into incidents (report_code, type, description, area_landmark, people_affected, people_trapped, injuries_reported, vulnerable_people, danger_increasing, location, status, verification_status)
values ('RN-DEMO016','flood','Report of flooding at bus depot appears to be pre-existing water feature, not an emergency. Dispatch team flagged it.','City Bus Depot', 0, 'no', 'no', 'no', 'no', st_setsrid(st_makepoint(77.26, 28.60),4326)::geography, 'cancelled', 'disputed')
on conflict (report_code) do nothing;

insert into incidents (report_code, type, description, area_landmark, people_affected, people_trapped, injuries_reported, vulnerable_people, danger_increasing, location, status, verification_status)
values ('RN-DEMO017','fire','Small kitchen fire in restaurant. Contained by staff but smoke damage. One person with minor burns needs checkup.','Food Street Shop 15', 3, 'no', 'yes', 'no', 'no', st_setsrid(st_makepoint(77.22, 28.60),4326)::geography, 'verified', 'verified')
on conflict (report_code) do nothing;

insert into incidents (report_code, type, description, area_landmark, people_affected, people_trapped, injuries_reported, vulnerable_people, danger_increasing, location, status, verification_status)
values ('RN-DEMO018','heatwave','Multiple dehydration cases reported at the construction site. Workers need water and shade immediately.','Metro Construction Site', 18, 'no', 'yes', 'no', 'yes', st_setsrid(st_makepoint(77.19, 28.62),4326)::geography, 'verified', 'verified')
on conflict (report_code) do nothing;

-- Historical assignments (skip if already exist)
do $$
declare inc_id uuid; team_id uuid; asgn_id uuid;
begin
  select id into inc_id from incidents where report_code = 'RN-DEMO002';
  select id into team_id from rescue_teams where team_code = 'TM-0003';
  if inc_id is not null and team_id is not null and not exists (select 1 from assignments where incident_id=inc_id) then
    select create_assignment(inc_id, team_id, '{}'::uuid[], 'seed') into asgn_id;
    update assignments set status='dispatched', dispatched_at=now() where id=asgn_id;
    update incidents set status='dispatched' where id=inc_id;
  end if;
  select id into inc_id from incidents where report_code = 'RN-DEMO011';
  select id into team_id from rescue_teams where team_code = 'TM-0002';
  if inc_id is not null and team_id is not null and not exists (select 1 from assignments where incident_id=inc_id) then
    select create_assignment(inc_id, team_id, '{}'::uuid[], 'seed') into asgn_id;
  end if;
end $$;

insert into audit_logs (actor, action, entity_type, reason)
select 'seed', 'seed_data_loaded', 'system', 'Demo data seeded'
where not exists (select 1 from audit_logs where actor='seed' and action='seed_data_loaded');
