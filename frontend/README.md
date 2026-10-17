# ResQNet Frontend

React 18, TypeScript, Vite, Tailwind CSS, TanStack Query, and Leaflet frontend for ResQNet.

## Environment

Copy `.env.example` to `.env` and set the browser-safe Supabase credentials:

```env
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=your-publishable-key
```

Do not place a service-role key in this folder or in any `VITE_` variable.

## Development

```bash
npm ci
npm run dev
```

The application runs at `http://127.0.0.1:5173` by default.

## Validation and production build

```bash
npm run typecheck
npm run lint
npm run build
```

Deploy the generated `dist/` directory. For Vercel or Netlify, set the project root/base directory to `frontend`, use `npm run build`, and publish `dist`.

## Routes

- `/` citizen landing page
- `/report` emergency report form
- `/status` report-code lookup
- `/dashboard` command center
- `/incidents` incident queue
- `/teams` rescue-team management
- `/resources` resource inventory
- `/assignments` assignment management
