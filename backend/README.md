# ResQNet Backend

The backend is fully managed by Supabase and contains PostgreSQL/PostGIS migrations, deterministic priority scoring, row-level security policies, Realtime configuration, RPC functions, fictional demo seed data, and the AI extraction Edge Function.

## Structure

```text
supabase/
  config.toml
  migrations/
  functions/ai-extract/
  functions/transcriptions/
```

## Deploy

Install or invoke the Supabase CLI, authenticate with a scoped personal access token, and run these commands from this `backend` directory:

```bash
npx supabase link --project-ref gzgdcmzxqlrvazawygtu
npx supabase db push
npx supabase functions deploy ai-extract --use-api
npx supabase functions deploy transcriptions --use-api
```

Set `GOOGLE_CLOUD_SPEECH_API_KEY` as a Supabase Edge Function secret before deploying voice transcription:

```bash
npx supabase secrets set GOOGLE_CLOUD_SPEECH_API_KEY=YOUR_GOOGLE_CLOUD_API_KEY
```

The key must be enabled for Google Cloud Speech-to-Text and must never be added to a `VITE_` variable or committed to the repository. Voice audio is stored in the private `voice-recordings` bucket, and the migration adds a recording reference to incidents. Browser recordings are limited to 55 seconds; the API accepts WebM/Ogg audio up to 10 MB and configures `ur-PK` and `en-US` explicitly. Local offline recordings remain on the user's device and are not submitted automatically.

The frontend sends `voice_recording_id` with the existing incident-create request. The deployed incident API must persist that field and include it in its response; the report confirmation warns the user if the API does not confirm the association.

If the browser reports “Failed to send a request to the Edge Function,” redeploy `transcriptions` and confirm `VITE_SUPABASE_URL` points to the same project. This error indicates the request did not receive an HTTP response (commonly an undeployed function, unreachable project URL, or browser CORS/network block); the updated frontend now shows more detail for HTTP errors. Check the function logs and verify that the migration and `GOOGLE_CLOUD_SPEECH_API_KEY` secret are applied.

The ResQNet migrations and Edge Functions are deployed to the configured project. Future deployments only apply new migration files. Review and back up important hosted data before making destructive schema changes.

Never commit a personal access token, database password, or service-role key.

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
