// Federation: peer-to-peer invitation
// Allows OpenClaw (or any authenticated peer with mcp_api_key) to invite
// new sub-agents into the federation. Trust model: full transitive
// (invitee inherits inviter's toolset_groups). Revocation: orphaned
// (revoking inviter does NOT cascade — sub-peers continue operating).
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface InvitePayload {
  inviter_peer_id?: string;       // Set when called via MCP (the peer that authenticated)
  invitee_name: string;
  invitee_url?: string;            // Optional — pure inbound peers may not have one
  invitee_description?: string;
  toolset_groups?: string[];       // Override (defaults to inheriting inviter's)
  reason?: string;
  metadata?: Record<string, unknown>;
}

async function sha256Hex(input: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function generateMcpKey(): string {
  return "fwk_" + Array.from(crypto.getRandomValues(new Uint8Array(32)))
    .map((b) => b.toString(16).padStart(2, "0")).join("");
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabase = createClient(supabaseUrl, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    const body = (await req.json()) as InvitePayload;
    if (!body.invitee_name || body.invitee_name.length < 2) {
      return new Response(JSON.stringify({ error: "invitee_name is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Resolve inviter — either explicitly passed or via MCP api key in Authorization
    let inviter: { id: string; name: string; toolset_groups: string[] | null } | null = null;
    if (body.inviter_peer_id) {
      const { data } = await supabase
        .from("a2a_peers")
        .select("id, name, toolset_groups")
        .eq("id", body.inviter_peer_id)
        .maybeSingle();
      inviter = data as any;
    } else {
      // Look up by mcp_api_key from Authorization header
      const auth = req.headers.get("authorization") ?? "";
      const token = auth.replace(/^Bearer\s+/i, "").trim();
      if (token.startsWith("fwk_")) {
        const { data } = await supabase
          .from("a2a_peers")
          .select("id, name, toolset_groups")
          .eq("mcp_api_key", token)
          .maybeSingle();
        inviter = data as any;
      }
    }

    // Determine inherited toolset groups (full transitive trust)
    const inheritedGroups = inviter?.toolset_groups ?? [];
    const grantedGroups = body.toolset_groups ?? inheritedGroups;

    // Generate MCP key for the new peer
    const mcpKey = generateMcpKey();
    const keyPrefix = mcpKey.slice(0, 8);
    const keyHash = await sha256Hex(mcpKey);

    // Create the api_keys row
    const { data: apiKey, error: apiKeyErr } = await supabase
      .from("api_keys")
      .insert({
        name: `MCP key for peer ${body.invitee_name}`,
        key_hash: keyHash,
        key_prefix: keyPrefix,
        scopes: ["mcp:*"],
      })
      .select()
      .single();
    if (apiKeyErr) throw apiKeyErr;

    // Create the new peer
    const { data: newPeer, error: peerErr } = await supabase
      .from("a2a_peers")
      .insert({
        name: body.invitee_name,
        url: body.invitee_url ?? "https://invited.local",
        status: "active",
        capabilities: [],
        invited_by_peer_id: inviter?.id ?? null,
        toolset_groups: grantedGroups,
        invitation_metadata: {
          description: body.invitee_description ?? null,
          inviter_name: inviter?.name ?? "system",
          ...(body.metadata ?? {}),
        },
        mcp_api_key: mcpKey,
      })
      .select()
      .single();
    if (peerErr) throw peerErr;

    // Federation connection (inbound — they call our MCP)
    await supabase.from("federation_connections").insert({
      peer_id: newPeer.id,
      direction: "inbound",
      transport: "mcp",
      api_key_id: apiKey.id,
      status: "active",
      metadata: { invited_by_peer_id: inviter?.id ?? null },
    });

    // Audit row
    await supabase.from("peer_invitations").insert({
      inviter_peer_id: inviter?.id ?? null,
      invitee_peer_id: newPeer.id,
      invitee_name: body.invitee_name,
      invitee_url: body.invitee_url ?? null,
      toolset_groups: grantedGroups,
      reason: body.reason ?? null,
      metadata: body.metadata ?? {},
    });

    const mcpEndpoint = `${supabaseUrl}/functions/v1/mcp-server`;
    const groupsQuery = grantedGroups.length > 0 ? `?groups=${grantedGroups.join(",")}` : "";

    return new Response(
      JSON.stringify({
        success: true,
        peer_id: newPeer.id,
        peer_name: newPeer.name,
        invited_by: inviter?.name ?? "system",
        toolset_groups: grantedGroups,
        // Onboarding payload the inviter passes to its sub-agent
        credentials: {
          mcp_api_key: mcpKey,
          mcp_endpoint: mcpEndpoint,
          mcp_url_with_groups: `${mcpEndpoint}${groupsQuery}`,
          authorization_header: `Bearer ${mcpKey}`,
        },
        instructions:
          `New peer '${newPeer.name}' is registered in the FlowWink federation. ` +
          `Hand the credentials above to the sub-agent. It calls ${mcpEndpoint} with the bearer token. ` +
          `Inherited toolset groups: ${grantedGroups.join(", ") || "(none)"}.`,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e: any) {
    console.error("[federation-invite-peer] error", e);
    return new Response(JSON.stringify({ success: false, error: e?.message ?? String(e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
