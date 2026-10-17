import { createClient } from '@supabase/supabase-js';

const rawUrl = (import.meta.env.VITE_SUPABASE_URL || '').trim();
const rawKey = (
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
  import.meta.env.VITE_SUPABASE_ANON_KEY ||
  ''
).trim();

export const isSupabaseConfigured = Boolean(
  rawUrl &&
  rawKey &&
  rawUrl.startsWith('http') &&
  !rawUrl.includes('your-project')
);

const url = isSupabaseConfigured ? rawUrl : 'https://placeholder.supabase.co';
const publishableKey = isSupabaseConfigured ? rawKey : 'placeholder-key';

if (!isSupabaseConfigured) {
  console.warn(
    'ResQNet: Missing or invalid Supabase credentials. Running in demo mode. Please set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in Vercel environment variables.'
  );
}

export const supabase = createClient(url, publishableKey, {
  realtime: { params: { eventsPerSecond: 10 } },
});

