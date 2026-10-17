/*
  Audit log integrity.
  - The actor on every audit row is the signed-in user, whatever the insert claims.
    Rows written without a session (service-role Edge Functions) keep the actor they pass.
  - Clients can no longer insert audit rows directly; only database functions and
    triggers (which run as the table owner) write them.
*/
create or replace function private.audit_fill_actor()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is not null then
    new.actor_user_id := auth.uid();
    new.actor_role := null;
  end if;
  if new.actor_user_id is not null and new.actor_role is null then
    new.actor_role := case
      when private.has_role('admin'::public.app_role, new.actor_user_id) then 'admin'::public.app_role
      when private.has_role('responder'::public.app_role, new.actor_user_id) then 'responder'::public.app_role
      else 'public'::public.app_role end;
  end if;
  return new;
end;
$$;

drop policy if exists audit_admin_insert on public.audit_logs;
revoke insert, update, delete on public.audit_logs from authenticated, anon;
