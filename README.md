# ResQNet

ResQNet is a disaster-response and resource-coordination application. The public
site lets people report emergencies, track reports, register someone who may need
help, and respond to safety check-ins. Authenticated responders manage assigned
field jobs; coordinators manage incidents, teams, resources, shelters, warnings,
and operational alerts.

This guide covers the complete setup. The main web application uses Supabase
directly; the optional Express API in `backend/api` is separate and is not
required to run the web application.

## Repository layout

```text
frontend/                 React, TypeScript, Vite, Tailwind, PWA
backend/supabase/         PostgreSQL/PostGIS migrations and Edge Functions
backend/api/              Optional standalone Express/PostgreSQL API
docs/                     Feature and implementation references
```

## Requirements

- Node.js 20 LTS recommended (Node.js 18 or newer is required by the optional
  Express API).
- npm (included with Node.js).
- A Supabase project for database, authentication, storage, and Edge Functions.
- Supabase CLI for linking the project, applying migrations, and deploying
  functions. Commands below use `npx supabase`.
- Docker only if you want to run Supabase locally with `supabase start`.

## 1. Configure Supabase

Create or choose a Supabase project. The repository's
[`config.toml`](backend/supabase/config.toml) contains the current project
reference; verify the target carefully before applying migrations. Use a
separate staging project for development and tests.

From the repository root:

```powershell
npx supabase login
npx supabase link --project-ref YOUR_PROJECT_REF
npx supabase db push
```

`db push` applies the migrations in `backend/supabase/migrations` that have not
yet been applied. Review pending migrations and back up important data before
applying them to a production project. Never rewrite or delete migrations that
have already been applied to a shared project.

### Deploy Edge Functions

Deploy the functions used by the application after the database migrations:

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

Set function secrets in the Supabase Dashboard under **Project Settings →
Edge Functions → Secrets**, or with the CLI. Do not commit secret values:

| Secret | Used for |
| --- | --- |
| `GEMINI_API_KEY` | Voice transcription and analysis. Required for server-side transcription. |
| `OPENROUTESERVICE_API_KEY` | Optional road-route and ETA requests. |
| `APP_URL` | Base URL for invitation links when no allowed request origin is used. |
| `ALLOWED_APP_ORIGINS` | Optional comma-separated app origins allowed for invitation links. |
| `SMS_WEBHOOK_SECRET` | Optional shared secret for authenticated inbound SMS webhooks. |

Supabase provides its project URL and service-role key to Edge Functions. Do not
put a service-role key in the frontend, a `VITE_` variable, source control, or
chat. The default transcription model is `gemini-3.5-flash-lite`; `GEMINI_MODEL`
can optionally override it.

### Authentication and roles

In **Authentication → URL Configuration**, allow the local development
callback URLs and the deployed site URLs, for example:

```text
http://localhost:5173/**
http://127.0.0.1:5173/**
https://your-deployed-site.example/**
```

Configure SMTP under **Authentication → SMTP Settings** before relying on
production invitations or password recovery. The built-in Supabase mailer is
limited and is not appropriate for general production delivery.

Every signed-up account has public access. `responder` and `admin` roles are
granted by invitation from **User management** (`/admin/users`). To create the
first admin, sign up through the app, confirm the account, then run this once in
the Supabase SQL Editor, replacing the email:

```sql
insert into public.user_roles (user_id, role)
select id, 'admin'
from public.profiles
where email = lower('admin@example.com')
on conflict do nothing;
```

## 2. Configure and run the frontend

```powershell
cd frontend
npm ci
Copy-Item .env.example .env
```

Edit `frontend/.env` and set the browser-safe Supabase project values:

```env
VITE_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=your-supabase-publishable-key
```

The legacy `VITE_SUPABASE_ANON_KEY` is accepted as a fallback, but use the
publishable key for new configurations. Optional frontend settings:

```env
# Map tiles; OpenStreetMap is used when this is omitted.
VITE_MAPTILER_KEY=your-maptiler-key

# Optional base URL for the separate REST API; the app's main data hooks use Supabase.
VITE_API_URL=http://localhost:3001
```

Never add a service-role key or other server-side secret to this file. Vite
embeds `VITE_` values into browser assets. The production build intentionally
fails if the Supabase URL or publishable key is missing or still a placeholder.

Start the local site:

```powershell
npm run dev
```

Vite prints its local URL, normally `http://localhost:5173`. Stop it with
Ctrl+C.

## 3. Optional Express API

The primary frontend does not require `backend/api`; it is a separate Express
API using PostgreSQL. Only run it if you specifically need that API and have a
compatible PostgreSQL database.

```powershell
cd backend/api
npm ci
```

Create `backend/api/.env` with the server-side connection settings:

```env
DATABASE_URL=postgresql://USER:PASSWORD@HOST:5432/DATABASE
PORT=3001
CORS_ORIGIN=http://localhost:5173
```

Keep the database URL private. Start the API in development with
`npm run dev`; its health endpoint is `http://localhost:3001/health`. Build and
run the compiled API with `npm run build` and `npm start`. The API exposes
`/api/incidents`, `/api/teams`, `/api/resources`, `/api/assignments`, `/api/alerts`,
`/api/audit-logs`, and `/api/dashboard`.

## Application workflows

- **Public reporting:** `/report` accepts an emergency description, location,
  hazard details, and optional voice/photo evidence. A successful submission
  returns a report ID and private tracking key. The confirmation means the
  server received the report; it does not promise that rescuers have been
  dispatched.
- **Voice reports:** recording is optional and supports Urdu (Pakistan)
  (`ur-PK`) and English (`en-US`). The browser uploads audio through
  `transcriptions`; `transcribe` uses Gemini. Transcription may finish after
  report submission. Offline recordings are kept locally when storage is
  available and are not sent automatically.
- **Report tracking:** `/status` looks up a report with its report ID and
  private tracking key, or with the signed-in account where permitted.
- **At-risk register:** `/register-at-risk` records consent, needs, and a pinned
  location so coordinators can issue area warnings and check-ins.
- **Responder workspace:** `/responder` shows team assignments and supports
  the responder's field-status workflow.
- **Command center:** `/dashboard`, `/incidents`, `/teams`, `/resources`,
  `/assignments`, `/shelters`, `/alerts`, `/activity`, `/reports/summary`,
  `/vulnerability`, `/planning`, and `/admin/users` are restricted by role.
- **Safety check-ins:** `/check-in` is used to respond to a coordinator's
  check-in link.

The app assists response operations; it does not replace official emergency
services. In Pakistan, call 1122 first when someone is in immediate danger.

## Validation and production build

From `frontend/`:

```powershell
npm run lint
npm run typecheck
npm run build
npm run preview
```

The build output is `frontend/dist`. For Vercel or Netlify, set the project root
to `frontend`, build with `npm run build`, and publish `dist`. Add
`VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` to every deployment
environment (Production, Preview, and Development as applicable). Rebuild after
changing either value because Vite embeds them at build time. SPA hosting must
rewrite application routes to `index.html`.

The optional API checks run from `backend/api/`:

```powershell
npm run typecheck
npm run build
```

## Troubleshooting

- **Missing/invalid Supabase configuration:** check `frontend/.env` and the
  deployment environment variables, then restart Vite or rebuild/redeploy.
- **Authentication or invite redirects fail:** allow the exact local and
  deployed origins in Supabase Authentication URL Configuration, and configure
  SMTP for real email delivery.
- **Edge Function request fails:** confirm the function is deployed to the same
  project as `VITE_SUPABASE_URL`, check its Supabase logs, and verify its required
  secrets.
- **Voice transcription unavailable:** deploy both `transcriptions` and
  `transcribe`; configure `GEMINI_API_KEY` as a Supabase Function secret.
- **Map tiles do not load:** configure `VITE_MAPTILER_KEY`, or check that the
  browser can reach OpenStreetMap fallback tiles.
- **Protected page redirects to sign-in:** confirm the user is authenticated
  and has the required role; responder users also need team membership.

## Security

- Never commit `.env` files, Supabase service-role keys, database passwords,
  access tokens, or provider secrets.
- Rotate any credential exposed in chat, logs, or source control.
- Use separate staging and production Supabase projects and accounts.
- Use only clearly labeled test data in staging. Avoid testing emergency
  dispatch, messaging, or resident check-ins against production.
