# ResQNet Backend

The backend is fully managed by Supabase and contains PostgreSQL/PostGIS migrations, deterministic priority scoring, row-level security policies, Realtime configuration, RPC functions, and AI Edge Functions.

## Structure

```text
supabase/
  config.toml
  migrations/
  functions/ai-extract/
```

## Deploy

Install or invoke the Supabase CLI, authenticate with a scoped personal access token, and run these commands from this `backend` directory:

```bash
npx supabase link --project-ref gzgdcmzxqlrvazawygtu
npx supabase db push
npx supabase functions deploy ai-extract --use-api
npx supabase functions deploy transcribe --use-api
```

The ResQNet migrations and `ai-extract` function are deployed to the configured project. Future deployments only apply new migration files. Review and back up important hosted data before making destructive schema changes.

Never commit a personal access token, database password, or service-role key.

## English and Urdu voice reports

The public report form can record up to two minutes of speech. The `transcribe`
Edge Function returns the original English/Urdu transcript, an English
translation, and conservative structured incident facts. Configure Gemini and
deploy the function before enabling this in production:

```bash
npx supabase secrets set GEMINI_API_KEY=your-key
npx supabase functions deploy transcribe --use-api
```

`GEMINI_MODEL` is optional and defaults to `gemini-3.5-flash-lite`. Audio is sent to
Gemini for transcription but is not stored by ResQNet; only transcript text,
translation, language, and extracted facts are saved with the incident.

## Auth and role invitations

Roles: every account has `public`; `responder` (tied to a rescue team) and `admin` are granted only by invitation.

Flow: an admin invites from `/admin/users` → the `invite-role` function emails the person →
- **new email**: Supabase invite link → `/accept-invite?new=1` → they set name + password and accept.
- **existing account**: sign-in link → `/accept-invite` → they accept.

If the email can't be sent, the admin is shown a one-time link to share manually.

Invite links point at the admin's current origin when it is `APP_URL`, `localhost:5173`, `127.0.0.1:5173`, or listed in the comma-separated `ALLOWED_APP_ORIGINS` secret; otherwise at `APP_URL`. For production: `npx supabase secrets set ALLOWED_APP_ORIGINS=https://your-app.example`.

Deploy the function after changes:

```bash
npx supabase functions deploy invite-role --use-api
```

Required project settings (Dashboard → Authentication):
- **URL Configuration → Redirect URLs**: add `http://127.0.0.1:5173/**`, `http://localhost:5173/**`, and your production URL + `/**`. Without this, email links drop the invitation token.
- **Emails → SMTP Settings**: configure custom SMTP (e.g. Resend, Gmail). Supabase's built-in mailer only delivers to your organization's team members and is heavily rate-limited.

The first admin can't be invited by anyone. Sign up normally at `/signup`, confirm the email, then run once in the SQL Editor:

```sql
insert into public.user_roles (user_id, role)
select id, 'admin' from public.profiles where email = lower('you@example.com')
on conflict do nothing;
```
