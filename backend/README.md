# ResQNet Backend

The backend is fully managed by Supabase and contains PostgreSQL/PostGIS migrations, deterministic priority scoring, row-level security policies, Realtime configuration, RPC functions, fictional demo seed data, and the AI extraction Edge Function.

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
```

The target project currently has an older incompatible schema. Review or back up any important hosted data before applying the ResQNet migrations.

Never commit a personal access token, database password, or service-role key.
