import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-api-version",
};

const BUCKET = "incident-evidence";
const MAX_PHOTO_BYTES = 3 * 1024 * 1024;
const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function serviceClient() {
  const url = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !serviceRoleKey) throw new Error("Incident evidence storage is not configured");
  return createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

async function sha256(value: string): Promise<string> {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(bytes)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function extensionFor(mimeType: string): string {
  if (mimeType === "image/png") return "png";
  if (mimeType === "image/webp") return "webp";
  return "jpg";
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);

  try {
    const form = await req.formData();
    const photo = form.get("photo");
    const reportCode = form.get("reportCode");
    const trackingToken = form.get("trackingToken");

    if (!(photo instanceof File) || photo.size === 0) {
      return jsonResponse({ error: "Choose a photo to upload" }, 400);
    }
    const mimeType = photo.type.split(";")[0].toLowerCase();
    if (!ALLOWED_TYPES.has(mimeType)) {
      return jsonResponse({ error: "Use a JPEG, PNG, or WebP photo" }, 415);
    }
    if (photo.size > MAX_PHOTO_BYTES) {
      return jsonResponse({ error: "Photo must be 3 MB or smaller after compression" }, 413);
    }
    if (typeof reportCode !== "string" || !/^RN-\d+$/i.test(reportCode.trim())) {
      return jsonResponse({ error: "A valid report ID is required" }, 400);
    }
    if (typeof trackingToken !== "string" || trackingToken.trim().length < 16) {
      return jsonResponse({ error: "The private tracking key is required" }, 401);
    }

    const client = serviceClient();
    const normalizedCode = reportCode.trim().toUpperCase();
    const { data: incident, error: incidentError } = await client.from("incidents")
      .select("id, report_code, tracking_token_hash")
      .eq("report_code", normalizedCode)
      .maybeSingle();
    if (incidentError) throw incidentError;
    if (!incident || !incident.tracking_token_hash || incident.tracking_token_hash !== await sha256(trackingToken.trim())) {
      return jsonResponse({ error: "Report not found or tracking key is invalid" }, 403);
    }

    const { count, error: countError } = await client.from("incident_evidence")
      .select("id", { count: "exact", head: true })
      .eq("incident_id", incident.id);
    if (countError) throw countError;
    if ((count ?? 0) >= 3) {
      return jsonResponse({ error: "This report already has the maximum of three evidence photos" }, 409);
    }

    const evidenceId = crypto.randomUUID();
    const storagePath = `${incident.id}/${evidenceId}.${extensionFor(mimeType)}`;
    const { error: uploadError } = await client.storage.from(BUCKET).upload(storagePath, photo, {
      contentType: mimeType,
      cacheControl: "3600",
      upsert: false,
    });
    if (uploadError) throw uploadError;

    const { error: evidenceError } = await client.from("incident_evidence").insert({
      id: evidenceId,
      incident_id: incident.id,
      storage_path: storagePath,
      mime_type: mimeType,
      size_bytes: photo.size,
      original_name: photo.name.slice(0, 200),
    });
    if (evidenceError) {
      await client.storage.from(BUCKET).remove([storagePath]);
      throw evidenceError;
    }

    await client.from("incidents").update({ photo_url: storagePath, updated_at: new Date().toISOString() })
      .eq("id", incident.id);
    await client.from("incident_events").insert({
      incident_id: incident.id,
      event_type: "evidence_uploaded",
      to_value: evidenceId,
      details: { evidence_id: evidenceId, mime_type: mimeType, size_bytes: photo.size },
      reason: "Reporter added private photo evidence",
      actor_user_id: null,
    });
    await client.from("audit_logs").insert({
      actor: "guest",
      actor_role: "public",
      action: "evidence_uploaded",
      entity_type: "incident_evidence",
      entity_id: evidenceId,
      new_values: { incident_id: incident.id, mime_type: mimeType, size_bytes: photo.size },
      reason: "Reporter added private photo evidence",
    });

    return jsonResponse({ evidenceId, status: "pending" }, 201);
  } catch (error) {
    console.error("Incident evidence upload failed", error);
    return jsonResponse({
      error: error instanceof Error ? error.message : "Could not upload the evidence photo",
    }, 500);
  }
});
