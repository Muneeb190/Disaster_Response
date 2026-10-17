import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-api-version",
};

const BUCKET = "voice-recordings";
const MAX_AUDIO_BYTES = 10 * 1024 * 1024;
const LANGUAGE_CODES = ["ur-PK", "en-US"] as const;

type LanguageCode = typeof LANGUAGE_CODES[number];

interface TranscriptionResult {
  results?: Array<{
    languageCode?: string;
    alternatives?: Array<{ transcript?: string; confidence?: number }>;
  }>;
  error?: { message?: string };
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
  }
  return btoa(binary);
}

function serviceClient() {
  const url = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !serviceRoleKey) throw new Error("Voice transcription storage is not configured");
  return createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

async function processTranscription(
  recordingId: string,
  storagePath: string,
  language: LanguageCode,
  mimeType: string,
  apiKey: string,
): Promise<void> {
  const client = serviceClient();
  try {
    const { data: audioFile, error: downloadError } = await client.storage.from(BUCKET).download(storagePath);
    if (downloadError || !audioFile) throw new Error("Could not retrieve the stored recording");

    const encoding = mimeType === "audio/webm" ? "WEBM_OPUS" : "OGG_OPUS";
    const response = await fetch(
      `https://speech.googleapis.com/v1/speech:recognize?key=${encodeURIComponent(apiKey)}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: AbortSignal.timeout(60_000),
        body: JSON.stringify({
          config: {
            encoding,
            sampleRateHertz: 48000,
            languageCode: language,
            enableAutomaticPunctuation: true,
          },
          audio: { content: toBase64(new Uint8Array(await audioFile.arrayBuffer())) },
        }),
      },
    );

    const result = await response.json() as TranscriptionResult;
    if (!response.ok) {
      throw new Error(result.error?.message || `Google Speech-to-Text returned ${response.status}`);
    }

    const transcript = (result.results ?? [])
      .flatMap((item) => item.alternatives?.[0]?.transcript?.trim() || [])
      .join(" ")
      .trim();
    const firstResult = result.results?.find((item) => item.alternatives?.[0]);
    const confidence = firstResult?.alternatives?.[0]?.confidence;
    const { error: updateError } = await client.from("voice_recordings").update({
      transcription_status: "ready",
      transcript: transcript || null,
      transcript_language: firstResult?.languageCode || language,
      transcript_confidence: typeof confidence === "number" ? confidence : null,
      transcription_error: null,
      updated_at: new Date().toISOString(),
    }).eq("id", recordingId);
    if (updateError) throw updateError;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Speech-to-text failed";
    const { error: updateError } = await client.from("voice_recordings").update({
      transcription_status: "failed",
      transcription_error: message.slice(0, 500),
      updated_at: new Date().toISOString(),
    }).eq("id", recordingId);
    if (updateError) console.error("Could not record transcription failure", updateError);
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);

  try {
    const client = serviceClient();
    const contentType = req.headers.get("content-type") || "";

    if (contentType.includes("multipart/form-data")) {
      const apiKey = Deno.env.get("GOOGLE_CLOUD_SPEECH_API_KEY");
      if (!apiKey) return jsonResponse({ error: "Speech-to-text is not configured on the server" }, 503);

      const form = await req.formData();
      const audio = form.get("audio");
      const language = form.get("language");
      if (!(audio instanceof File) || audio.size === 0) {
        return jsonResponse({ error: "An audio recording is required" }, 400);
      }
      if (audio.size > MAX_AUDIO_BYTES) {
        return jsonResponse({ error: "Audio must be 10 MB or smaller" }, 413);
      }
      const mimeType = audio.type.split(";")[0].toLowerCase();
      if (mimeType !== "audio/webm" && mimeType !== "audio/ogg") {
        return jsonResponse({ error: "Use a browser that records WebM or Ogg Opus audio" }, 415);
      }
      if (typeof language !== "string" || !LANGUAGE_CODES.includes(language as LanguageCode)) {
        return jsonResponse({ error: "Choose Urdu (Pakistan) or English" }, 400);
      }

      const recordingId = crypto.randomUUID();
      const storagePath = `${recordingId}.${mimeType === "audio/webm" ? "webm" : "ogg"}`;
      const { error: uploadError } = await client.storage.from(BUCKET).upload(storagePath, audio, {
        contentType: mimeType,
        upsert: false,
      });
      if (uploadError) throw uploadError;

      const { error: insertError } = await client.from("voice_recordings").insert({
        id: recordingId,
        storage_path: storagePath,
        mime_type: mimeType,
        language,
      });
      if (insertError) {
        await client.storage.from(BUCKET).remove([storagePath]);
        throw insertError;
      }

      EdgeRuntime.waitUntil(
        processTranscription(recordingId, storagePath, language as LanguageCode, mimeType, apiKey),
      );
      return jsonResponse({ recordingId, status: "transcribing" }, 202);
    }

    const body = await req.json() as { recordingId?: string };
    if (!body.recordingId || !/^[0-9a-f-]{36}$/i.test(body.recordingId)) {
      return jsonResponse({ error: "A valid recording reference is required" }, 400);
    }
    const { data, error } = await client.from("voice_recordings")
      .select("id, transcription_status, transcript, transcript_language, transcript_confidence, transcription_error")
      .eq("id", body.recordingId)
      .maybeSingle();
    if (error) throw error;
    if (!data) return jsonResponse({ error: "Recording not found" }, 404);

    return jsonResponse({
      recordingId: data.id,
      status: data.transcription_status,
      transcript: data.transcript,
      language: data.transcript_language,
      confidence: data.transcript_confidence,
      error: data.transcription_error,
    });
  } catch (error) {
    console.error("Voice transcription request failed", error);
    return jsonResponse({
      error: error instanceof Error ? error.message : "Voice transcription request failed",
    }, 500);
  }
});
