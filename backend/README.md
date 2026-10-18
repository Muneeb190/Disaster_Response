# ResQNet Backend

The primary backend is Supabase: PostgreSQL/PostGIS migrations, Row Level
Security, Auth, Storage, RPC functions, Realtime, and Edge Functions. A separate
optional Express/PostgreSQL API is in [`api/`](api/); it is not required by the
main frontend.

See the [repository README](../README.md) for complete setup, secrets, auth,
local development, workflows, and deployment instructions.

## Supabase deployment

From the repository root, install/use the Supabase CLI, authenticate, and link
the intended project:

```powershell
npx supabase login
npx supabase link --project-ref YOUR_PROJECT_REF
npx supabase db push
```

Check the linked project and pending migrations before applying changes to
production. Back up important data first. Migrations are in `supabase/migrations`
and are applied in timestamp order.

Deploy the application's Edge Functions:

```powershell
npx supabase functions deploy ai-extract --use-api
npx supabase functions deploy evacuation-route --use-api
npx supabase functions deploy incident-photo --use-api
npx supabase functions deploy invite-role --use-api
npx supabase functions deploy sms-intake --use-api
npx supabase functions deploy transcribe --use-api
npx supabase functions deploy transcriptions --use-api
npx supabase functions deploy weather-warnings --use-api
```

Set `GEMINI_API_KEY` as a Supabase Function secret for server-side voice
transcription. Optional functions/features use `OPENROUTESERVICE_API_KEY`,
`APP_URL`, `ALLOWED_APP_ORIGINS`, and `SMS_WEBHOOK_SECRET`. Supabase injects its
project URL and service-role key into the Function runtime; never expose the
service-role key to the browser.

The voice recording upload and transcription functions use the private
`voice-recordings` bucket and the voice-recording database migration. Urdu
(Pakistan) and English are supported. On-device offline recordings remain on
the device and are not automatically delivered.

## Optional Express API

[`api/`](api/) is a separate Node.js/Express service backed by PostgreSQL. Refer
to its package scripts and source for its independent configuration. The main
React frontend uses Supabase directly and does not need this service to run.
