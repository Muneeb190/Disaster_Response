import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-api-version",
};

const BUCKET = "voice-recordings";
const MAX_AUDIO_BYTES = 6 * 1024 * 1024;
const LANGUAGE_CODES = ["ur-PK", "en-US"] as const;

type LanguageCode = typeof LANGUAGE_CODES[number];

interface VoiceAnalysis {
  language: "en" | "ur" | "mixed" | "other";
  transcript: string;
  english_translation: string;
  summary: string;
  incident_category: "flood" | "fire" | "medical_emergency" | "heatwave" | "other";
  people_affected: number | null;
  people_trapped: "yes" | "no" | "unknown";
  injuries_reported: "yes" | "no" | "unknown";
  vulnerable_people: "yes" | "no" | "unknown";
  danger_increasing: "yes" | "no" | "unknown";
  injury_details: string | null;
  immediate_needs: string[];
  uncertainties: string[];
  source: "gemini";
  model: string;
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function serviceClient() {
  const url = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !serviceRoleKey) throw new Error("Voice transcription storage is not configured");
  return createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
  }
  return btoa(binary);
}

async function processTranscription(
  recordingId: string,
  storagePath: string,
  mimeType: string,
): Promise<void> {
  const client = serviceClient();
  try {
    const { data: audioFile, error: downloadError } = await client.storage.from(BUCKET).download(storagePath);
    if (downloadError || !audioFile) throw new Error("Could not retrieve the stored recording");

    const audio = bytesToBase64(new Uint8Array(await audioFile.arrayBuffer()));
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const response = await fetch(
      `${supabaseUrl}/functions/v1/transcribe`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${serviceRoleKey}`,
          "apikey": serviceRoleKey,
        },
        signal: AbortSignal.timeout(60_000),
        body: JSON.stringify({ audio_base64: audio, mime_type: mimeType }),
      },
    );

    const result = await response.json() as VoiceAnalysis & { error?: string };
    if (!response.ok) {
      throw new Error(result.error || `Voice transcription returned ${response.status}`);
    }
    const { error: updateError } = await client.from("voice_recordings").update({
      transcription_status: "ready",
      transcript: result.transcript || null,
      transcript_language: result.language,
      transcript_confidence: null,
      analysis: result,
      transcription_error: null,
      updated_at: new Date().toISOString(),
    }).eq("id", recordingId);
    if (updateError) throw updateError;

    // The incident may already have been sent while transcription was running.
    // Preserve known reporter answers, but fill unknown facts and the transcript.
    const { data: pendingIncidents, error: pendingError } = await client.from("incidents")
      .select("id, description, people_affected, people_trapped, injuries_reported, vulnerable_people, danger_increasing, ai_extracted")
      .eq("voice_recording_id", recordingId);
    if (pendingError) throw pendingError;
    for (const incident of pendingIncidents || []) {
      const placeholder = incident.description.startsWith("Voice emergency report");
      const { error: incidentError } = await client.from("incidents").update({
        ...(placeholder ? {
          description: result.transcript,
          type: result.incident_category,
          people_affected: result.people_affected ?? incident.people_affected,
          people_trapped: incident.people_trapped === "unknown" ? result.people_trapped : incident.people_trapped,
          injuries_reported: incident.injuries_reported === "unknown" ? result.injuries_reported : incident.injuries_reported,
          vulnerable_people: incident.vulnerable_people === "unknown" ? result.vulnerable_people : incident.vulnerable_people,
          danger_increasing: incident.danger_increasing === "unknown" ? result.danger_increasing : incident.danger_increasing,
        } : {}),
        voice_transcript: result.transcript,
        transcript_language: result.language,
        transcript_english: result.english_translation,
        ai_extracted: { ...((incident.ai_extracted as Record<string, unknown> | null) ?? {}), ...result },
        updated_at: new Date().toISOString(),
      }).eq("id", incident.id);
      if (incidentError) throw incidentError;
      await client.from("audit_logs").insert({
        actor: "system",
        actor_role: "system",
        action: "voice_transcription_completed",
        entity_type: "incident",
        entity_id: incident.id,
        new_values: { language: result.language, uncertainties: result.uncertainties },
        reason: "Background voice transcription and extraction completed",
      });
    }
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
      const form = await req.formData();
      const audio = form.get("audio");
      const language = form.get("language");
      if (!(audio instanceof File) || audio.size === 0) {
        return jsonResponse({ error: "An audio recording is required" }, 400);
      }
      if (audio.size > MAX_AUDIO_BYTES) {
        return jsonResponse({ error: "Audio must be 6 MB or smaller" }, 413);
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
        processTranscription(recordingId, storagePath, mimeType),
      );
      return jsonResponse({ recordingId, status: "transcribing" }, 202);
    }

    const body = await req.json() as { recordingId?: string };
    if (!body.recordingId || !/^[0-9a-f-]{36}$/i.test(body.recordingId)) {
      return jsonResponse({ error: "A valid recording reference is required" }, 400);
    }
    const { data, error } = await client.from("voice_recordings")
      .select("id, transcription_status, transcript, transcript_language, transcript_confidence, transcription_error, analysis")
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
      analysis: data.analysis,
      error: data.transcription_error,
    });
  } catch (error) {
    console.error("Voice transcription request failed", error);
    return jsonResponse({
      error: error instanceof Error ? error.message : "Voice transcription request failed",
    }, 500);
  }
});
