import { ALLOWED_MIME_TYPES, buildRequest, MAX_AUDIO_BASE64_LENGTH, parseResponse } from "./gemini.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");
const GEMINI_MODEL = Deno.env.get("GEMINI_MODEL") || "gemini-3.5-flash-lite";
const TIMEOUT_MS = 30000;

// Browser recordings are converted to mono 16-bit WAV. Reject silence locally:
// multimodal models can otherwise infer plausible words from an empty recording.
function wavHasAudibleSignal(base64: string) {
  let bytes: Uint8Array;
  try {
    const binary = atob(base64);
    bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  } catch {
    return false;
  }
  if (bytes.length < 46 || new TextDecoder().decode(bytes.subarray(0, 4)) !== "RIFF") return true;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let dataOffset = 44;
  for (let offset = 12; offset + 8 <= bytes.length;) {
    const id = new TextDecoder().decode(bytes.subarray(offset, offset + 4));
    const size = view.getUint32(offset + 4, true);
    if (id === "data") { dataOffset = offset + 8; break; }
    offset += 8 + size + (size % 2);
  }
  let sumSquares = 0;
  let peak = 0;
  let count = 0;
  for (let i = dataOffset; i + 1 < bytes.length; i += 2) {
    const sample = Math.abs(view.getInt16(i, true)) / 32768;
    sumSquares += sample * sample;
    peak = Math.max(peak, sample);
    count++;
  }
  const rms = count ? Math.sqrt(sumSquares / count) : 0;
  // Keep this deliberately permissive: laptop and phone microphones can be very
  // quiet after browser noise suppression. This still rejects digital silence.
  return peak >= 0.001 && rms >= 0.0001;
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 200, headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  if (!GEMINI_API_KEY) return json({ error: "Voice input is not set up yet. Please type your report." }, 503);

  let audio: string, mimeType: string;
  try {
    const body = await req.json() as { audio_base64?: unknown; mime_type?: unknown };
    audio = typeof body.audio_base64 === "string" ? body.audio_base64 : "";
    mimeType = typeof body.mime_type === "string" ? body.mime_type.split(";")[0].trim().toLowerCase() : "";
  } catch {
    return json({ error: "Request body must be JSON" }, 400);
  }
  if (!audio) return json({ error: "No audio received" }, 400);
  if (audio.length > MAX_AUDIO_BASE64_LENGTH) return json({ error: "Recording is too long. Please keep it under 2 minutes." }, 413);
  if (!ALLOWED_MIME_TYPES.includes(mimeType)) return json({ error: `Unsupported audio format: ${mimeType || "unknown"}` }, 415);
  if ((mimeType === "audio/wav" || mimeType === "audio/x-wav") && !wavHasAudibleSignal(audio)) {
    return json({ error: "The recording appears silent or the microphone level is too low. Check the selected microphone and try speaking closer to it." }, 422);
  }

  try {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": GEMINI_API_KEY },
      body: JSON.stringify(buildRequest(audio, mimeType)),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    const body = await res.json().catch(() => null);
    if (!res.ok) {
      console.error("Gemini error", res.status, JSON.stringify(body)?.slice(0, 500));
      return json({ error: "Could not transcribe the recording. Please try again or type your report." }, 502);
    }
    const result = parseResponse(body, GEMINI_MODEL);
    if (!result.transcript) return json({ error: "No speech was detected. Please try again, closer to the microphone." }, 422);
    return json(result);
  } catch (err) {
    console.error("Transcription failed:", err instanceof Error ? err.message : err);
    return json({ error: "Could not transcribe the recording. Please try again or type your report." }, 502);
  }
});
