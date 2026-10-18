import { isSupabaseConfigured, supabase } from '@/lib/supabase';

/**
 * API client for ResQNet backend REST API.
 * Set VITE_API_URL in your .env to point to the Railway backend.
 * Falls back to localhost:3001 in development.
 */
const RAW_API_URL = (import.meta.env.VITE_API_URL || 'http://localhost:3001').trim().replace(/\/$/, '');

export const API_BASE = RAW_API_URL;

export async function apiFetch<T = unknown>(
  path: string,
  options?: RequestInit
): Promise<T> {
  const url = `${API_BASE}${path}`;
  const res = await fetch(url, {
    headers: {
      'Content-Type': 'application/json',
      ...(options?.headers ?? {}),
    },
    ...options,
  });

  if (!res.ok) {
    let message = `API error ${res.status}`;
    try {
      const body = await res.json();
      if (body?.error) message = body.error;
    } catch {
      // ignore
    }
    throw new Error(message);
  }

  // 204 No Content
  if (res.status === 204) return null as T;

  return res.json() as Promise<T>;
}

export type SpeechLanguage = 'ur-PK' | 'en-US';

export interface TranscriptionJob {
  recordingId: string;
  status: 'transcribing' | 'ready' | 'failed';
  transcript: string | null;
  language: string | null;
  confidence: number | null;
  error: string | null;
  analysis?: import('@/types').VoiceTranscription | null;
}

async function transcriptionFunctionError(
  error: { message: string; context?: unknown },
  action: string
): Promise<Error> {
  if (error.context instanceof Response) {
    try {
      const body = await error.context.clone().json();
      if (typeof body?.error === 'string') return new Error(`${action}: ${body.error}`);
    } catch {
      // Use the SDK error and deployment guidance if the response is not JSON.
    }
    if (error.context.status === 404) {
      return new Error(`${action}: the transcriptions Edge Function is not deployed. Deploy it from the backend/supabase directory.`);
    }
    if (error.context.status === 401 || error.context.status === 403) {
      return new Error(`${action}: the Edge Function rejected the request. Check its deployment and Supabase API credentials.`);
    }
  }

  const cause = error.context instanceof Error ? error.context.message : error.message;
  return new Error(
    `${action}: ${cause}. Check your connection, the configured Supabase URL, and that the transcriptions Edge Function is deployed.`
  );
}

export async function uploadVoiceRecording(
  audio: Blob,
  language: SpeechLanguage
): Promise<{ recordingId: string }> {
  if (!isSupabaseConfigured) {
    throw new Error('Voice transcription is unavailable: configure VITE_SUPABASE_URL and the Supabase publishable key.');
  }
  const body = new FormData();
  const extension = audio.type.includes('ogg') ? 'ogg' : 'webm';
  body.append('audio', audio, `emergency.${extension}`);
  body.append('language', language);
  const { data, error } = await supabase.functions.invoke('transcriptions', { body });
  if (error) throw await transcriptionFunctionError(error, 'Audio upload failed');
  if (!data?.recordingId) throw new Error('The transcription service did not return an audio reference');
  return data as { recordingId: string };
}

export async function getTranscription(recordingId: string): Promise<TranscriptionJob> {
  if (!isSupabaseConfigured) {
    throw new Error('Voice transcription is unavailable: configure VITE_SUPABASE_URL and the Supabase publishable key.');
  }
  const { data, error } = await supabase.functions.invoke('transcriptions', {
    body: { recordingId },
  });
  if (error) throw await transcriptionFunctionError(error, 'Could not check transcription status');
  return data as TranscriptionJob;
}

export const api = {
  get: <T>(path: string) => apiFetch<T>(path, { method: 'GET' }),
  post: <T>(path: string, body: unknown) =>
    apiFetch<T>(path, { method: 'POST', body: JSON.stringify(body) }),
  patch: <T>(path: string, body: unknown) =>
    apiFetch<T>(path, { method: 'PATCH', body: JSON.stringify(body) }),
  delete: <T>(path: string) => apiFetch<T>(path, { method: 'DELETE' }),
};
