// Federation: peer-to-peer invitation
// Allows OpenClaw (or any authenticated peer with mcp_api_key) to invite
// new sub-agents into the federation. Trust model: full transitive
// (invitee inherits inviter's toolset_groups). Revocation: orphaned
// (revoking inviter does NOT cascade — sub-peers continue operating).
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getServiceClient } from '../_shared/supabase-clients.ts';

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface InvitePayload {
  inviter_peer_id?: string;       // Set when called via MCP (the peer that authenticated)
  caller_api_key_id?: string;     // Injected by agent-execute when invoked via MCP tool-call
  invitee_name: string;
  invitee_url?: string;            // Optional — pure inbound peers may not have one
  invitee_description?: string;
  owner_user_id?: string;          // Who the agent acts for (admins may set; a self-minter is always the owner)
  client_kind?: string;            // claude | chatgpt | cursor | opencode | gemini | hermes | copilot | openclaw | other
  toolset_groups?: string[];       // Override (defaults to inheriting inviter's)
  reason?: string;
  metadata?: Record<string, unknown>;
  // Mission metadata (optional — only used when inviting with a specific mission)
  mission_id?: string;             // Mission template ID (e.g., "growth-operator")
  mission_name?: string;           // Human-readable mission name
  instructions?: string;           // Mission instructions and responsibilities
  focus_resources?: string[];      // Resource types to prioritize
  focus_tools?: string[];          // Skill names to prioritize
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
    const supabase = getServiceClient();

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
    } else if (body.caller_api_key_id || (body as any)._caller_api_key_id) {
      // Invoked via agent-execute → MCP tool call. The caller's api_key_id is forwarded
      // either as `caller_api_key_id` (top-level) or `_caller_api_key_id` (in args).
      const callerApiKeyId = body.caller_api_key_id || (body as any)._caller_api_key_id;
      const { data } = await supabase
        .from("a2a_peers")
        .select("id, name, toolset_groups")
        .eq("api_key_id", callerApiKeyId)
        .maybeSingle();
      inviter = data as any;
    } else {
      // Look up by API key from Authorization header.
      // The MCP server links peers via api_key_id, so we hash the bearer token,
      // find the api_keys row, then the a2a_peers row that points to it.
      const auth = req.headers.get("authorization") ?? "";
      const token = auth.replace(/^Bearer\s+/i, "").trim();
      if (token.startsWith("fwk_")) {
        const tokenHash = await sha256Hex(token);
        const { data: keyRow } = await supabase
          .from("api_keys")
          .select("id")
          .eq("key_hash", tokenHash)
          .maybeSingle();
        if (keyRow?.id) {
          const { data } = await supabase
            .from("a2a_peers")
            .select("id, name, toolset_groups")
            .eq("api_key_id", keyRow.id)
            .maybeSingle();
          inviter = data as any;
        }
      }
    }

    // ─── AUTH GATE ───────────────────────────────────────────────────────
    // If no peer inviter resolved, the ONLY other legitimate caller is a
    // logged-in admin (the admin UI) or the service role (internal path).
    // Without this, an anonymous caller minted an mcp:* key with attacker-
    // controlled toolset_groups (inviter stayed null and execution continued).
    let isAdminCaller = false;
    let isServiceCaller = false;
    // A signed-in colleague may mint an agent for THEMSELVES (My account → My agents):
    // the agent then acts as them and the gateway holds it to their module access.
    let callerUserId: string | null = null;
    if (!inviter) {
      const auth = req.headers.get("authorization") ?? "";
      const token = auth.replace(/^Bearer\s+/i, "").trim();
      const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
      const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
      const publishableKey = Deno.env.get("SUPABASE_PUBLISHABLE_KEY") ?? "";
      if (token && token === serviceKey) {
        isServiceCaller = true;
      } else if (token && token !== anonKey && token !== publishableKey) {
        const { data: u } = await supabase.auth.getUser(token);
        if (u?.user) {
          callerUserId = u.user.id;
          const { data: adm } = await supabase.rpc("has_role", { _user_id: u.user.id, _role: "admin" });
          isAdminCaller = !!adm;
        }
      }
    }
    if (!inviter && !isAdminCaller && !isServiceCaller && !callerUserId) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ─── OWNER ────────────────────────────────────────────────────────────
    // Admin / service callers may name the owner (default: themselves); a
    // self-minting colleague is always the owner. A peer-invited sub-agent
    // inherits its inviter's owner.
    let ownerUserId: string | null = null;
    if (isAdminCaller || isServiceCaller) ownerUserId = body.owner_user_id ?? callerUserId ?? null;
    else if (callerUserId) ownerUserId = callerUserId;
    else if (inviter) {
      const { data: inviterRow, error: inviterErr } = await supabase.from("a2a_peers").select("owner_user_id").eq("id", inviter.id).maybeSingle();
      if (inviterErr) throw new Error(`Could not read the inviter's owner: ${inviterErr.message}`);
      ownerUserId = (inviterRow as { owner_user_id?: string | null } | null)?.owner_user_id ?? null;
    }
    let ownerIsAdmin = false;
    if (ownerUserId) {
      const { data: oa, error: oaErr } = await supabase.rpc("has_role", { _user_id: ownerUserId, _role: "admin" });
      if (oaErr) throw new Error(`Could not read the owner's role: ${oaErr.message}`);
      ownerIsAdmin = !!oa;
    }

    // Determine inherited toolset groups (full transitive trust).
    const inheritedGroups = inviter?.toolset_groups ?? [];
    // Privilege clamp: a peer inviter may only pass on groups it already holds
    // (no self-escalation). Admin / service callers may grant any requested set.
    let grantedGroups = body.toolset_groups ?? inheritedGroups;
    if (inviter && !isAdminCaller && !isServiceCaller && Array.isArray(body.toolset_groups)) {
      const allowed = new Set(inheritedGroups);
      grantedGroups = body.toolset_groups.filter((g: string) => allowed.has(g));
    }
    // An agent never reaches further than the person behind it. The gateway
    // enforces that per call (and in discovery) from the authoritative skill →
    // module map against can_access_module(owner); toolset_groups stay what the
    // caller asked for. An owner with no module access has nothing to delegate.
    if (ownerUserId && !ownerIsAdmin) {
      const { data: modRow, error: modErr } = await supabase.from("site_settings").select("value").eq("key", "modules").maybeSingle();
      if (modErr) throw new Error(`Could not read the module settings: ${modErr.message}`);
      const modulesRaw = ((modRow as { value?: unknown } | null)?.value ?? {}) as Record<string, { enabled?: boolean } | undefined>;
      const enabledModules = Object.entries(modulesRaw).filter(([, v]) => v?.enabled === true).map(([k]) => k);
      const ownerModules: string[] = [];
      for (const m of enabledModules) {
        const { data: can, error: canErr } = await supabase.rpc("can_access_module", { _user_id: ownerUserId, _module_id: m });
        if (canErr) throw new Error(`Could not read the owner's access to ${m}: ${canErr.message}`);
        if (can === true) ownerModules.push(m);
      }
      if (ownerModules.length === 0) {
        return new Response(JSON.stringify({ error: "You have no module access to delegate — an agent can only do what its owner can. Ask an admin to grant you a role under Users → Role Permissions." }), {
          status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    // Generate MCP key for the new peer. The raw key exists in the response
    // and nowhere else: only its hash is stored. (Until 2026-10-08 this also
    // stored the raw key in api_keys and on the peer row — every invited
    // agent's key sat in clear text, readable through its owner's RLS. The
    // api_keys column is gone now; agent-keys-never-in-clear guards the shape.)
    const mcpKey = generateMcpKey();
    const keyPrefix = mcpKey.slice(0, 8);
    const keyHash = await sha256Hex(mcpKey);
    // A key that travels in the URL (`?key=`, the only way ChatGPT's connector
    // UI can send it) ends up in edge, proxy and browser logs. Those keys get
    // a lifetime; header-borne keys do not.
    const QUERY_KEY_CLIENTS = new Set(["chatgpt"]);
    const expiresAt = QUERY_KEY_CLIENTS.has(String(body.client_kind ?? ""))
      ? new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString()
      : null;

    // Create the api_keys row
    const { data: apiKey, error: apiKeyErr } = await supabase
      .from("api_keys")
      .insert({
        name: `MCP key for peer ${body.invitee_name}`,
        key_hash: keyHash,
        key_prefix: keyPrefix,
        expires_at: expiresAt,
        scopes: ["mcp:*"],
        // The key belongs to the owner: River posts, expenses and audit rows
        // attribute to the person, not to the admin who clicked "generate".
        created_by: ownerUserId,
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
        owner_user_id: ownerUserId,
        client_kind: body.client_kind ?? null,
        // The MCP gateway resolves a caller to its peer via a2a_peers.api_key_id
        // (authenticateApiKey → resolvePeerGroups → mission lookup). Storing the
        // link only in the connection ledger (since retired) left this column NULL, so the very
        // first call found no peer for the key and auto-registered a SECOND one
        // named after the key. The invited peer kept the mission and no key; the
        // duplicate got the key and no mission. They never met, and every invite
        // ended with `flowwink://mission` → "No mission assigned to this peer" —
        // the first instruction we give every agent, failing for everyone.
        api_key_id: apiKey.id,
      })
      .select()
      .single();
    if (peerErr) throw peerErr;


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

    // Store mission metadata if provided (allows agents to query via /rest/resources/mission)
    if (body.mission_id && body.instructions) {
      await supabase.from("federation_peer_missions").insert({
        peer_id: newPeer.id,
        mission_id: body.mission_id,
        mission_name: body.mission_name || body.mission_id,
        instructions: body.instructions,
        focus_resources: body.focus_resources || [],
        focus_tools: body.focus_tools || [],
      });
    }

    const mcpEndpoint = `${supabaseUrl}/functions/v1/mcp-server`;
    const groupsQuery = grantedGroups.length > 0 ? `?groups=${grantedGroups.join(",")}` : "";

    return new Response(
      JSON.stringify({
        success: true,
        peer_id: newPeer.id,
        peer_name: newPeer.name,
        owner_user_id: ownerUserId,
        client_kind: body.client_kind ?? null,
        expires_at: expiresAt,
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
