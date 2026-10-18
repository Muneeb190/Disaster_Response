# ResQNet Frontend

The primary ResQNet web application is built with React 18, TypeScript, Vite,
Tailwind CSS, TanStack Query, Supabase, and Leaflet. It includes a PWA build.

For the complete project setup, Supabase configuration/deployment, authentication,
roles, application workflows, and production instructions, see the
[repository README](../README.md).

## Local development

```powershell
npm ci
Copy-Item .env.example .env
```

Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` in `.env`, then run:

```powershell
npm run dev
```

`VITE_MAPTILER_KEY` is optional; the map falls back to OpenStreetMap. Never put
service-role keys or server-side secrets in frontend variables.

## Checks and build

```powershell
npm run lint
npm run typecheck
npm run build
npm run preview
```

The static production bundle is generated in `dist/`. Configure the hosting
provider's base directory as `frontend`, build with `npm run build`, and publish
`dist/`. Set the two required Supabase variables for every build environment;
Vite embeds them at build time.
