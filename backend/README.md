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

Install or invoke the Supabase CLI, authenticate locally with a scoped personal access token, and run these commands from this `backend` directory:

```bash
npx supabase link --project-ref gzgdcmzxqlrvazawygtu
npx supabase db push
npx supabase functions deploy ai-extract --use-api
npx supabase functions deploy transcriptions --use-api
```

Before deploying voice transcription, add `GEMINI_API_KEY` in Supabase Dashboard → Edge Functions → Secrets. The Edge Function sends recordings to Gemini 3.8 Flash for verbatim transcription in the selected language. Never put the key into frontend code, a `VITE_` variable, or a committed file.

Voice audio is stored in the private `voice-recordings` bucket, and the migration adds a recording reference to incidents. Browser recordings are limited to 55 seconds; the API accepts WebM/Ogg audio up to 10 MB. Local offline recordings remain on the user's device and are not submitted automatically.

If an API key has been pasted into chat, a source file, or another shared location, revoke it and create a replacement before saving it as the Supabase secret. Do not paste API keys into chat.

The frontend sends `voice_recording_id` through the public incident-submission RPC. The voice incident submission migration updates that RPC to persist the reference and return it to the report confirmation.

If the browser reports “Failed to send a request to the Edge Function,” redeploy `transcriptions` and confirm `VITE_SUPABASE_URL` points to the same project. This error indicates the request did not receive an HTTP response (commonly an undeployed function, unreachable project URL, or browser CORS/network block); the frontend shows more detail for HTTP errors. Check the function logs and verify that the migration and `GEMINI_API_KEY` secret are applied.

`supabase/config.toml` identifies the intended project, but migrations and functions must be deployed to your Supabase project before the feature is available. `db push` applies migrations that have not yet been applied. Review and back up important hosted data before making schema changes.

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
