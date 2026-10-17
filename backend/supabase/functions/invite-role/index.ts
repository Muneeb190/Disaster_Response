import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type InviteBody = {
  email?: string;
  role?: "admin" | "responder";
  team_id?: string | null;
  full_name?: string;
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function randomToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function sha256(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const appUrl = (Deno.env.get("APP_URL") || req.headers.get("origin") || "http://localhost:5173").replace(/\/$/, "");
    const authorization = req.headers.get("Authorization");
    if (!supabaseUrl || !anonKey || !serviceKey) return json({ error: "Function is not configured" }, 500);
    if (!authorization) return json({ error: "Authentication required" }, 401);

    const callerClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authorization } },
      auth: { persistSession: false },
    });
    const { data: authData, error: authError } = await callerClient.auth.getUser();
    if (authError || !authData.user) return json({ error: "Invalid or expired session" }, 401);

    const adminClient = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });
    const [{ data: callerProfile }, { data: callerRole }] = await Promise.all([
      adminClient.from("profiles").select("account_status").eq("id", authData.user.id).maybeSingle(),
      adminClient.from("user_roles").select("role").eq("user_id", authData.user.id).eq("role", "admin").maybeSingle(),
    ]);
    if (!callerRole || callerProfile?.account_status !== "active") return json({ error: "Administrator access required" }, 403);

    const body = (await req.json()) as InviteBody;
    const email = body.email?.trim().toLowerCase();
    const role = body.role;
    const teamId = body.team_id || null;
    if (!email || !/^\S+@\S+\.\S+$/.test(email)) return json({ error: "A valid email is required" }, 400);
    if (role !== "admin" && role !== "responder") return json({ error: "Role must be admin or responder" }, 400);
    if (role === "responder" && !teamId) return json({ error: "A rescue team is required for responders" }, 400);

    if (teamId) {
      const { data: team } = await adminClient.from("rescue_teams").select("id").eq("id", teamId).maybeSingle();
      if (!team) return json({ error: "Rescue team not found" }, 404);
    }

    const { data: existingProfile } = await adminClient
      .from("profiles")
      .select("id,email")
      .ilike("email", email)
      .maybeSingle();

    if (existingProfile) {
      const { data: existingRole } = await adminClient.from("user_roles").select("role")
        .eq("user_id", existingProfile.id).eq("role", role).maybeSingle();
      if (existingRole) return json({ error: `User already has the ${role} role` }, 409);
    }

    await adminClient.from("role_invitations").update({ status: "revoked" })
      .ilike("email", email).eq("role", role).eq("status", "pending");

    const rawToken = randomToken();
    const tokenHash = await sha256(rawToken);
    const expiresAt = new Date(Date.now() + 72 * 60 * 60 * 1000).toISOString();
    const { data: invitation, error: invitationError } = await adminClient.from("role_invitations").insert({
      user_id: existingProfile?.id || null,
      email,
      role,
      team_id: teamId,
      invited_by: authData.user.id,
      token_hash: tokenHash,
      expires_at: expiresAt,
    }).select("id").single();
    if (invitationError) throw invitationError;

    const invitationUrl = `${appUrl}/accept-invite?token=${encodeURIComponent(rawToken)}`;
    let emailSent = false;
    let invitedUserId = existingProfile?.id || null;

    if (!existingProfile) {
      const { data: invited, error: inviteError } = await adminClient.auth.admin.inviteUserByEmail(email, {
        redirectTo: invitationUrl,
        data: { full_name: body.full_name?.trim() || "" },
      });
      if (inviteError) {
        await adminClient.from("role_invitations").update({ status: "revoked" }).eq("id", invitation.id);
        throw inviteError;
      }
      emailSent = true;
      invitedUserId = invited.user?.id || null;
      if (invitedUserId) await adminClient.from("role_invitations").update({ user_id: invitedUserId }).eq("id", invitation.id);
    }

    await adminClient.from("audit_logs").insert({
      actor: "admin",
      actor_user_id: authData.user.id,
      actor_role: "admin",
      action: "role_invitation_created",
      entity_type: "profile",
      entity_id: invitedUserId,
      new_values: { email, role, team_id: teamId, invitation_id: invitation.id },
      reason: "Privileged access invitation created",
    });

    return json({
      invitation_id: invitation.id,
      invitation_url: invitationUrl,
      email_sent: emailSent,
      existing_user: Boolean(existingProfile),
      expires_at: expiresAt,
    });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "Invitation failed" }, 500);
  }
});

