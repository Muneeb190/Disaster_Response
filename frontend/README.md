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

For Vercel, add both variables under **Project Settings → Environment Variables** and enable them for every environment that will build the app. Git branch URLs such as `*-git-branch-*` are Preview deployments, so selecting only Production will leave them unconfigured. Redeploy after changing the variables because Vite embeds them at build time.

Never use `https://placeholder.supabase.co` or commit a service-role key. The production build intentionally fails when the browser-safe configuration is missing or still contains placeholder values.

## Routes

- `/` citizen landing page
- `/report` emergency report form
- `/status` report-code lookup
- `/dashboard` command center
- `/incidents` incident queue
- `/teams` rescue-team management
- `/resources` resource inventory
- `/assignments` assignment management

## Voice emergency reports

On `/report`, users can record up to 55 seconds of audio and choose Urdu (Pakistan) or English. The recording is uploaded to the `transcriptions` Supabase Edge Function, which stores it in private storage and starts Gemini transcription. The complete transcript is editable before submission, and a report can be submitted while transcription is processing once the recording reference has been received. Reports still require the form's existing written description and pinned location.

If upload fails, the browser attempts to save the recording in IndexedDB. The page provides a playback/download/delete option and clearly states that a local recording has not been sent to rescuers. Deploy the matching backend migration and Edge Function and configure `GEMINI_API_KEY` as described in the backend README.
