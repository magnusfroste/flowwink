import { Hono } from "hono";
import { McpServer, StreamableHttpTransport } from "mcp-lite";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

// ---------- helpers ----------

async function sha256(raw: string): Promise<string> {
  const buf = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(raw),
  );
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function serviceClient() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
}

// ---------- auth ----------

async function authenticateApiKey(
  authHeader: string | null,
): Promise<{ valid: boolean; keyId?: string; scopes?: string[] }> {
  if (!authHeader?.startsWith("Bearer ")) return { valid: false };
  const raw = authHeader.replace("Bearer ", "").trim();
  if (!raw) return { valid: false };

  const hash = await sha256(raw);
  const sb = serviceClient();

  const { data, error } = await sb
    .from("api_keys")
    .select("id, scopes, expires_at")
    .eq("key_hash", hash)
    .single();

  if (error || !data) return { valid: false };

  // Check expiry
  if (data.expires_at && new Date(data.expires_at) < new Date()) {
    return { valid: false };
  }

  // Touch last_used_at (fire-and-forget)
  sb.from("api_keys")
    .update({ last_used_at: new Date().toISOString() })
    .eq("id", data.id)
    .then();

  return { valid: true, keyId: data.id, scopes: data.scopes ?? [] };
}

// ---------- load tools ----------

interface SkillRow {
  name: string;
  description: string | null;
  category: string;
  tool_definition: {
    type: string;
    function: {
      name: string;
      description: string;
      parameters: Record<string, unknown>;
    };
  };
}

async function loadExposedSkills(): Promise<SkillRow[]> {
  const sb = serviceClient();
  const { data, error } = await sb
    .from("agent_skills")
    .select("name, description, category, tool_definition")
    .eq("enabled", true)
    .eq("mcp_exposed", true)
    .order("category");

  if (error) {
    console.error("Failed to load skills:", error.message);
    return [];
  }
  return (data ?? []) as unknown as SkillRow[];
}

// ---------- execute skill ----------

async function executeSkill(
  skillName: string,
  args: Record<string, unknown>,
): Promise<string> {
  const sb = serviceClient();
  const url = `${Deno.env.get("SUPABASE_URL")}/functions/v1/agent-execute`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
    },
    body: JSON.stringify({
      skill_name: skillName,
      arguments: args,
      agent_type: "mcp",
    }),
  });

  const body = await res.text();
  if (!res.ok) {
    return JSON.stringify({ error: `Execution failed (${res.status}): ${body}` });
  }
  return body;
}

// ---------- MCP server factory ----------

async function createMcpServer(): Promise<McpServer> {
  const server = new McpServer({
    name: "flowwink",
    version: "1.0.0",
  });

  // Register tools from exposed skills
  const skills = await loadExposedSkills();

  for (const skill of skills) {
    const fn = skill.tool_definition?.function;
    if (!fn?.name) continue;

    server.tool(fn.name, {
      description: fn.description || skill.description || skill.name,
      inputSchema: (fn.parameters as any) || {
        type: "object" as const,
        properties: {},
      },
      handler: async (args: Record<string, unknown>) => {
        const result = await executeSkill(skill.name, args);
        return {
          content: [{ type: "text" as const, text: result }],
        };
      },
    });
  }

  // ── Resources: read-only inspection for external agents ──

  // Modules overview
  server.resource(
    "flowwink://modules",
    {
      name: "FlowWink Modules",
      description: "All available modules and their enabled/disabled status",
      mimeType: "application/json",
    },
    async (uri) => {
      const sb = serviceClient();
      const { data } = await sb
        .from("site_settings")
        .select("value")
        .eq("key", "modules")
        .single();
      return {
        contents: [{ uri: uri.href, mimeType: "application/json", text: JSON.stringify(data?.value ?? {}, null, 2) }],
      };
    },
  );

  // Site health & stats
  server.resource(
    "flowwink://health",
    {
      name: "Site Health",
      description: "Current site statistics: pages, posts, leads, bookings, orders, products, active objectives",
      mimeType: "application/json",
    },
    async (uri) => {
      const sb = serviceClient();
      const [pages, posts, leads, bookings, orders, products, objectives] = await Promise.all([
        sb.from("pages").select("id", { count: "exact", head: true }),
        sb.from("blog_posts").select("id", { count: "exact", head: true }),
        sb.from("leads").select("id", { count: "exact", head: true }),
        sb.from("bookings").select("id", { count: "exact", head: true }).eq("status", "confirmed"),
        sb.from("orders").select("id", { count: "exact", head: true }),
        sb.from("products").select("id", { count: "exact", head: true }),
        sb.from("agent_objectives").select("id, goal, status").eq("status", "active").limit(10),
      ]);
      const health = {
        counts: {
          pages: pages.count ?? 0,
          blog_posts: posts.count ?? 0,
          leads: leads.count ?? 0,
          active_bookings: bookings.count ?? 0,
          orders: orders.count ?? 0,
          products: products.count ?? 0,
        },
        active_objectives: objectives.data ?? [],
        timestamp: new Date().toISOString(),
      };
      return {
        contents: [{ uri: uri.href, mimeType: "application/json", text: JSON.stringify(health, null, 2) }],
      };
    },
  );

  // Skill registry
  server.resource(
    "flowwink://skills",
    {
      name: "Skill Registry",
      description: "All FlowPilot skills with category, scope, trust level, and enabled status",
      mimeType: "application/json",
    },
    async (uri) => {
      const sb = serviceClient();
      const { data } = await sb
        .from("agent_skills")
        .select("name, description, category, scope, trust_level, enabled, mcp_exposed")
        .order("category");
      return {
        contents: [{ uri: uri.href, mimeType: "application/json", text: JSON.stringify(data ?? [], null, 2) }],
      };
    },
  );

  // Recent activity log
  server.resource(
    "flowwink://activity",
    {
      name: "Recent Activity",
      description: "Last 20 FlowPilot actions with skill name, status, duration, and timestamps",
      mimeType: "application/json",
    },
    async (uri) => {
      const sb = serviceClient();
      const { data } = await sb
        .from("agent_activity")
        .select("id, skill_name, status, duration_ms, error_message, created_at")
        .order("created_at", { ascending: false })
        .limit(20);
      return {
        contents: [{ uri: uri.href, mimeType: "application/json", text: JSON.stringify(data ?? [], null, 2) }],
      };
    },
  );

  // Federation peers
  server.resource(
    "flowwink://peers",
    {
      name: "Federation Peers",
      description: "Connected A2A/MCP peers with status, capabilities, and last seen time",
      mimeType: "application/json",
    },
    async (uri) => {
      const sb = serviceClient();
      const { data } = await sb
        .from("a2a_peers")
        .select("id, name, status, capabilities, last_seen_at, request_count")
        .order("name");
      return {
        contents: [{ uri: uri.href, mimeType: "application/json", text: JSON.stringify(data ?? [], null, 2) }],
      };
    },
  );

  // FlowPilot identity & soul
  server.resource(
    "flowwink://identity",
    {
      name: "FlowPilot Identity",
      description: "FlowPilot's soul, identity, and agent configuration",
      mimeType: "application/json",
    },
    async (uri) => {
      const sb = serviceClient();
      const { data } = await sb
        .from("agent_memory")
        .select("key, value, category")
        .in("key", ["soul", "identity", "agents", "tools", "user"]);
      const identity: Record<string, unknown> = {};
      for (const row of data ?? []) {
        identity[row.key] = row.value;
      }
      return {
        contents: [{ uri: uri.href, mimeType: "application/json", text: JSON.stringify(identity, null, 2) }],
      };
    },
  );
  return server;
}

// ---------- Hono app ----------

const app = new Hono();

// CORS preflight
app.options("/*", (c) => {
  return c.newResponse(null, 204, corsHeaders);
});

// Auth middleware
app.use("/*", async (c, next) => {
  if (c.req.method === "OPTIONS") return next();

  const auth = await authenticateApiKey(c.req.header("Authorization"));
  if (!auth.valid) {
    return c.json({ error: "Invalid or expired API key" }, 401);
  }
  c.set("apiKeyScopes" as any, auth.scopes);
  return next();
});

// MCP transport — bind once, reuse handler
let mcpHandler: ((req: Request) => Promise<Response>) | null = null;

async function getMcpHandler() {
  if (!mcpHandler) {
    const server = await createMcpServer();
    const transport = new StreamableHttpTransport();
    mcpHandler = transport.bind(server);
  }
  return mcpHandler;
}

app.all("/*", async (c) => {
  const handler = await getMcpHandler();
  const response = await handler(c.req.raw);
  // Add CORS headers
  const headers = new Headers(response.headers);
  for (const [k, v] of Object.entries(corsHeaders)) {
    headers.set(k, v);
  }
  return new Response(response.body, {
    status: response.status,
    headers,
  });
});

Deno.serve(app.fetch);
