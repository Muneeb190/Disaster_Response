/* Atomic acceptance and safe revocation for additive role invitations. */

create or replace function public.accept_role_invitation(p_token_hash text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare invitation public.role_invitations; current_email text;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  current_email := lower(coalesce(auth.jwt() ->> 'email', ''));

  select * into invitation
  from public.role_invitations
  where token_hash = p_token_hash
  for update;

  if not found or invitation.status <> 'pending' then raise exception 'Invitation is invalid or has already been used'; end if;
  if invitation.expires_at <= now() then
    update public.role_invitations set status = 'expired' where id = invitation.id;
    raise exception 'Invitation has expired';
  end if;
  if current_email = '' or current_email <> lower(invitation.email) then raise exception 'Sign in with the invited email address'; end if;
  if invitation.user_id is not null and invitation.user_id <> auth.uid() then raise exception 'Invitation belongs to another account'; end if;

  insert into public.user_roles (user_id, role, granted_by)
  values (auth.uid(), invitation.role, invitation.invited_by)
  on conflict (user_id, role) do nothing;

  if invitation.role = 'responder' then
    insert into public.team_members (user_id, team_id, active, added_by)
    values (auth.uid(), invitation.team_id, true, invitation.invited_by)
    on conflict (user_id, team_id) do update set active = true, added_by = excluded.added_by, added_at = now();
  end if;

  update public.role_invitations
  set user_id = auth.uid(), status = 'accepted', accepted_at = now()
  where id = invitation.id;

  insert into public.audit_logs (actor, actor_user_id, actor_role, action, entity_type, entity_id, new_values, reason)
  values ('user', auth.uid(), invitation.role, 'role_invitation_accepted', 'profile', auth.uid(),
    jsonb_build_object('role', invitation.role, 'team_id', invitation.team_id, 'invited_by', invitation.invited_by),
    'User accepted a privileged role invitation');

  return jsonb_build_object('role', invitation.role, 'team_id', invitation.team_id);
end;
$$;

create or replace function public.admin_revoke_role(p_user_id uuid, p_role public.app_role, p_reason text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare remaining_admins int;
begin
  if not private.is_admin() then raise exception 'Administrator access required'; end if;
  if p_role = 'public' then raise exception 'The base public role cannot be removed'; end if;
  if p_user_id = auth.uid() and p_role = 'admin' then raise exception 'Administrators cannot remove their own admin access'; end if;

  if p_role = 'admin' then
    select count(*) into remaining_admins
    from public.user_roles ur
    join public.profiles p on p.id = ur.user_id
    where ur.role = 'admin' and p.account_status = 'active';
    if remaining_admins <= 1 then raise exception 'The last active administrator cannot be removed'; end if;
  end if;

  delete from public.user_roles where user_id = p_user_id and role = p_role;
  if p_role = 'responder' then update public.team_members set active = false where user_id = p_user_id; end if;

  insert into public.audit_logs (actor, actor_user_id, actor_role, action, entity_type, entity_id, new_values, reason)
  values ('admin', auth.uid(), 'admin', 'role_revoked', 'profile', p_user_id,
    jsonb_build_object('role', p_role), nullif(trim(coalesce(p_reason, '')), ''));
end;
$$;

revoke execute on function public.accept_role_invitation(text) from public, anon;
grant execute on function public.accept_role_invitation(text) to authenticated;
revoke execute on function public.admin_revoke_role(uuid,public.app_role,text) from public, anon;
grant execute on function public.admin_revoke_role(uuid,public.app_role,text) to authenticated;

