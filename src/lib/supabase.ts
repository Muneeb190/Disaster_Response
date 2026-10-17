import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL || 'https://placeholder.supabase.co';
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || 'placeholder-anon-key';

export const isSupabaseConfigured = Boolean(
  import.meta.env.VITE_SUPABASE_URL &&
  import.meta.env.VITE_SUPABASE_ANON_KEY &&
  !import.meta.env.VITE_SUPABASE_URL.includes('your-project')
);

if (!isSupabaseConfigured) {
  console.warn(
    'ResQNet: Missing or default Supabase configuration in .env. Please configure VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY for live data.'
  );
}

export const supabase = createClient(url, anonKey, {
  realtime: { params: { eventsPerSecond: 10 } },
});

