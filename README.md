# ResQNet

ResQNet is a real-time disaster response and resource coordination platform. Citizens can report emergencies without an account, while coordinators prioritize incidents, assign rescue teams, manage resources, and monitor escalations.

## Repository structure

```text
frontend/  React, TypeScript, Vite, and Tailwind application
backend/   Supabase schema migrations, Edge Functions, and configuration
```

The two applications are independently deployable. The frontend communicates directly with Supabase using a browser-safe publishable key; there is no Express or local PostgreSQL runtime.

## Quick start

```bash
cd frontend
npm ci
cp .env.example .env
npm run dev
```

See [frontend/README.md](frontend/README.md) for frontend setup and [backend/README.md](backend/README.md) for Supabase deployment.

## Security

Never commit service-role keys, database passwords, personal access tokens, or secrets prefixed with `VITE_`. Only the Supabase URL and publishable key belong in the frontend environment.

Operational access is protected by Supabase Auth and role-based database policies.
