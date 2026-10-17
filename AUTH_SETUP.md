# ResQNet Authentication and Role Setup

ResQNet uses one Supabase Auth identity per person and additive application roles:

- `public` is automatically assigned to every registered account.
- `responder` is granted by an administrator and requires team membership.
- `admin` is granted by an existing administrator.

## Deploy

From `backend/`:

```bash
npx supabase link --project-ref gzgdcmzxqlrvazawygtu
npx supabase db push
npx supabase functions deploy invite-role --use-api
npx supabase secrets set APP_URL=http://localhost:5173
```

Set `APP_URL` to the deployed frontend URL before production judging. Add localhost and the deployed URL to the Supabase Auth redirect URL allowlist.

## Bootstrap the first administrator

1. Create a normal account through `/signup` and confirm its email.
2. In the Supabase SQL Editor, run the following with the account's actual email:

```sql
insert into public.user_roles (user_id, role)
select id, 'admin'::public.app_role
from public.profiles
where lower(email) = lower('YOUR_EMAIL@example.com')
on conflict do nothing;
```

3. Sign out and back in, then open `/dashboard`.
4. Use `/admin/users` for every later admin or responder invitation.

There is deliberately no public “become admin” endpoint.

## Invitation behavior

- New email: Supabase creates an invited Auth account and sends its invitation email.
- Existing email: ResQNet creates an expiring role invitation for that same account. The admin copies the secure link to the user.
- The user signs in with the invited email and accepts the role.
- Responder acceptance also activates membership in the selected rescue team.
- Role grants and removals are written to `audit_logs`.

Configure custom SMTP before relying on invitation emails. The built-in Supabase mailer is suitable only for limited testing.

## Required security checks

- Never expose the secret/service-role key in `frontend/`.
- Rotate credentials previously shared during development.
- Test public, responder, and admin accounts in separate browser profiles.
- Confirm public users cannot query operational tables.
- Confirm responders see only their teams, assignments, and linked incidents.
- Confirm an administrator cannot revoke their own admin role or the last active administrator.

## Public report tracking

Guest and signed-in submissions use `submit_public_incident`. The response contains:

- a human-friendly report code; and
- a random private tracking key.

Only a signed-in owner or somebody holding both values can retrieve the public-safe report status.

