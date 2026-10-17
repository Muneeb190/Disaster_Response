/* Remove all legacy fictional seed data. Real user-created rows are untouched. */

delete from public.incidents where is_demo or report_code like 'RN-DEMO%';
delete from public.audit_logs where actor = 'seed' or action = 'seed_data_loaded';

delete from public.shelters
where is_demo or name in ('Central Shelter', 'North Shelter');

delete from public.resources
where is_demo or name in (
  'Rescue Boats Depot A', 'Ambulance Fleet Central', 'Medical Supply Cache',
  'Drinking Water Stockpile', 'Food Supply Warehouse', 'Central Shelter', 'North Shelter'
);

delete from public.role_invitations
where team_id in (select id from public.rescue_teams where is_demo or team_code in ('TM-0001','TM-0002','TM-0003','TM-0004','TM-0005','TM-0006'));
delete from public.team_members
where team_id in (select id from public.rescue_teams where is_demo or team_code in ('TM-0001','TM-0002','TM-0003','TM-0004','TM-0005','TM-0006'));

delete from public.rescue_teams
where is_demo or team_code in ('TM-0001','TM-0002','TM-0003','TM-0004','TM-0005','TM-0006');
