import { Hono } from "hono";
import { McpServer, StreamableHttpTransport } from "mcp-lite";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import templateAuditData from "./template-audit.json" with { type: "json" };

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

  if (data.expires_at && new Date(data.expires_at) < new Date()) {
    return { valid: false };
  }

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

// ---------- resource fetchers ----------

async function fetchResource(resourceKey: string): Promise<unknown> {
  const sb = serviceClient();

  switch (resourceKey) {
    case "health": {
      const [pages, posts, leads, bookings, orders, products, objectives] = await Promise.all([
        sb.from("pages").select("id", { count: "exact", head: true }),
        sb.from("blog_posts").select("id", { count: "exact", head: true }),
        sb.from("leads").select("id", { count: "exact", head: true }),
        sb.from("bookings").select("id", { count: "exact", head: true }).eq("status", "confirmed"),
        sb.from("orders").select("id", { count: "exact", head: true }),
        sb.from("products").select("id", { count: "exact", head: true }),
        sb.from("agent_objectives").select("id, goal, status").eq("status", "active").limit(10),
      ]);
      return {
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
    }
    case "skills": {
      const { data } = await sb
        .from("agent_skills")
        .select("name, description, category, scope, trust_level, enabled, mcp_exposed")
        .order("category");
      return data ?? [];
    }
    case "modules": {
      const { data } = await sb
        .from("site_settings")
        .select("value")
        .eq("key", "modules")
        .single();
      return data?.value ?? {};
    }
    case "activity": {
      const { data } = await sb
        .from("agent_activity")
        .select("id, skill_name, status, duration_ms, error_message, created_at")
        .order("created_at", { ascending: false })
        .limit(20);
      return data ?? [];
    }
    case "peers": {
      const { data } = await sb
        .from("a2a_peers")
        .select("id, name, status, capabilities, last_seen_at, request_count")
        .order("name");
      return data ?? [];
    }
    case "identity": {
      const { data } = await sb
        .from("agent_memory")
        .select("key, value, category")
        .in("key", ["soul", "identity", "agents", "tools", "user"]);
      const identity: Record<string, unknown> = {};
      for (const row of data ?? []) {
        identity[row.key] = row.value;
      }
      return identity;
    }
    case "templates": {
      return (templateAuditData as unknown[]).map((t: any) => ({
        id: t.id, name: t.name, category: t.category,
        description: t.description, tagline: t.tagline,
        summary: t.summary, requiredModules: t.requiredModules,
        hasHeaderSettings: t.hasHeaderSettings, hasFooterSettings: t.hasFooterSettings,
        hasSeoSettings: t.hasSeoSettings,
      }));
    }
    default: {
      // Check for templates/:id pattern
      if (resourceKey.startsWith("template:")) {
        const templateId = resourceKey.replace("template:", "");
        const template = (templateAuditData as any[]).find((t: any) => t.id === templateId);
        return template || { error: `Template not found: ${templateId}` };
      }
      return { error: `Unknown resource: ${resourceKey}` };
    }
}

// ---------- MCP server factory ----------

async function createMcpServer(): Promise<McpServer> {
  const server = new McpServer({
    name: "flowwink",
    version: "1.0.0",
  });

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

  const resourceDefs: Array<{ key: string; uri: string; name: string; description: string }> = [
    { key: "modules",  uri: "flowwink://modules",  name: "FlowWink Modules",  description: "All available modules and their enabled/disabled status" },
    { key: "health",   uri: "flowwink://health",   name: "Site Health",       description: "Current site statistics: pages, posts, leads, bookings, orders, products, active objectives" },
    { key: "skills",   uri: "flowwink://skills",   name: "Skill Registry",    description: "All FlowPilot skills with category, scope, trust level, and enabled status" },
    { key: "activity", uri: "flowwink://activity", name: "Recent Activity",   description: "Last 20 FlowPilot actions with skill name, status, duration, and timestamps" },
    { key: "peers",    uri: "flowwink://peers",    name: "Federation Peers",  description: "Connected A2A/MCP peers with status, capabilities, and last seen time" },
    { key: "identity", uri: "flowwink://identity", name: "FlowPilot Identity", description: "FlowPilot's soul, identity, and agent configuration" },
    { key: "templates", uri: "flowwink://templates", name: "Site Templates",    description: "All available starter templates with SEO audit summaries — page counts, meta descriptions, title lengths, product images, blog post quality" },
  ];

  for (const r of resourceDefs) {
    server.resource(
      r.uri,
      { name: r.name, description: r.description, mimeType: "application/json" },
      async (uri) => {
        const data = await fetchResource(r.key);
        return {
          contents: [{ uri: uri.href, mimeType: "application/json", text: JSON.stringify(data, null, 2) }],
        };
      },
    );
  }

  return server;
}

// ---------- Hono app ----------

const app = new Hono().basePath("/mcp-server");

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

// ══════════════════════════════════════════════════════════
// REST compatibility layer — for agents without MCP clients
// ══════════════════════════════════════════════════════════

app.get("/rest/tools", async (c) => {
  const skills = await loadExposedSkills();
  const tools = skills
    .filter((s) => s.tool_definition?.function?.name)
    .map((s) => ({
      name: s.tool_definition.function.name,
      description: s.tool_definition.function.description || s.description,
      category: s.category,
      parameters: s.tool_definition.function.parameters || {},
    }));
  return c.json({ tools, count: tools.length }, 200, corsHeaders);
});

app.get("/rest/resources", (c) => {
  const resources = [
    { key: "health",   description: "Site statistics: pages, posts, leads, bookings, orders, products, active objectives" },
    { key: "skills",   description: "Full skill registry with category, scope, trust level, enabled status" },
    { key: "modules",  description: "Module configuration (enabled/disabled)" },
    { key: "activity", description: "Last 20 FlowPilot actions" },
    { key: "peers",      description: "Federation peers with status and capabilities" },
    { key: "identity",  description: "FlowPilot soul, identity, and agent configuration" },
    { key: "templates", description: "All starter templates with SEO audit summaries (page counts, meta, titles, products)" },
  ];
  return c.json({ resources }, 200, corsHeaders);
});

app.get("/rest/resources/templates/:id", async (c) => {
  const id = c.req.param("id");
  const data = await fetchResource(`template:${id}`);
  return c.json({ resource: `template:${id}`, data }, 200, corsHeaders);
});

app.get("/rest/resources/:key", async (c) => {
  const key = c.req.param("key");
  const data = await fetchResource(key);
  return c.json({ resource: key, data }, 200, corsHeaders);
});

app.post("/rest/execute", async (c) => {
  const body = await c.req.json();
  const { tool, arguments: args } = body;
  if (!tool) {
    return c.json({ error: "Missing 'tool' field in request body" }, 400, corsHeaders);
  }

  const skills = await loadExposedSkills();
  const match = skills.find((s) => s.tool_definition?.function?.name === tool);
  if (!match) {
    return c.json({ error: `Unknown tool: ${tool}` }, 404, corsHeaders);
  }

  const result = await executeSkill(match.name, args || {});
  try {
    return c.json({ tool, result: JSON.parse(result) }, 200, corsHeaders);
  } catch {
    return c.json({ tool, result }, 200, corsHeaders);
  }
});

// ══════════════════════════════════════════════════════════
// Native MCP transport (JSON-RPC over POST)
// ══════════════════════════════════════════════════════════

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
