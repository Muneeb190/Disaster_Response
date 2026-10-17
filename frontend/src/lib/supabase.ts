import { createClient } from '@supabase/supabase-js';

const rawUrl = (import.meta.env.VITE_SUPABASE_URL || '').trim();
const rawKey = (
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
  import.meta.env.VITE_SUPABASE_ANON_KEY ||
  ''
).trim();

const isPlaceholder = (value: string) =>
  !value || /(?:your-project|placeholder|your-publishable-key|placeholder-key)/i.test(value);

export const isSupabaseConfigured = Boolean(
  !isPlaceholder(rawUrl) &&
  !isPlaceholder(rawKey) &&
  rawUrl.startsWith('http') &&
  (() => {
    try {
      return Boolean(new URL(rawUrl).hostname);
    } catch {
      return false;
    }
  })()
);

export const supabaseConfigurationError = isSupabaseConfigured
  ? null
  : 'Authentication is unavailable because this deployment is missing its Supabase URL or publishable key.';

const url = isSupabaseConfigured ? rawUrl : 'https://placeholder.supabase.co';
const publishableKey = isSupabaseConfigured ? rawKey : 'placeholder-key';

if (!isSupabaseConfigured) {
  console.warn(
    'ResQNet: Missing or invalid Supabase credentials. Set VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY in the deployment environment and rebuild.'
  );
}

export const supabase = createClient(url, publishableKey, {
  realtime: { params: { eventsPerSecond: 10 } },
});

