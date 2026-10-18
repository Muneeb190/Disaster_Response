create table if not exists public.voice_recordings (
  id uuid primary key,
  storage_path text not null unique,
  mime_type text not null,
  language text not null check (language in ('ur-PK', 'en-US')),
  transcription_status text not null default 'transcribing'
    check (transcription_status in ('transcribing', 'ready', 'failed')),
  transcript text,
  transcript_language text,
  transcript_confidence real check (
    transcript_confidence is null or transcript_confidence between 0 and 1
  ),
  transcription_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_voice_recordings_created
  on public.voice_recordings(created_at desc);

alter table public.voice_recordings enable row level security;
revoke all on public.voice_recordings from public, anon, authenticated;

insert into storage.buckets (
  id, name, public, file_size_limit, allowed_mime_types
)
values (
  'voice-recordings',
  'voice-recordings',
  false,
  10485760,
  array['audio/webm', 'audio/ogg']
)
on conflict (id) do update set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

alter table public.incidents
  add column if not exists voice_recording_id uuid
    references public.voice_recordings(id) on delete set null;

create index if not exists idx_incidents_voice_recording
  on public.incidents(voice_recording_id)
  where voice_recording_id is not null;
