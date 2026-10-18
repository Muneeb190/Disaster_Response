/* Remove labelled demo/simulated data and the temporary end-to-end test account.
   Unlabelled public reports and real operational records are preserved. */

do $$
declare
  tester_id uuid;
begin
  select id into tester_id
  from auth.users
  where lower(email) = 'resqnet.tester@example.com'
  limit 1;

  if tester_id is not null then
    delete from public.role_invitations where invited_by = tester_id;
    delete from public.resource_movements where actor_id = tester_id;
    delete from public.prepositioning_suggestions where approved_by = tester_id;
    delete from public.hazard_events where created_by = tester_id;
    delete from public.road_closures where created_by = tester_id;
    delete from public.dispatch_plans where created_by = tester_id;
    delete from public.sync_operations where user_id = tester_id;
    delete from public.incidents where reporter_user_id = tester_id;
    delete from public.audit_logs where actor_user_id = tester_id;
    delete from auth.users where id = tester_id;
  end if;
end $$;

delete from public.sms_inbox where is_simulation;
delete from public.warning_outbox where is_simulation;
delete from public.hazard_events where is_simulation;
delete from public.incidents where is_demo or report_code like 'RN-DEMO%';
delete from public.shelters where is_demo;
delete from public.resources where is_demo;
delete from public.rescue_teams where is_demo;
delete from public.areas where is_demo or name like 'Demo:%';
delete from public.audit_logs where actor = 'seed' or action = 'seed_data_loaded';
