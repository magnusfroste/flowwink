import { Hono } from "npm:hono@4";
import { McpServer, StreamableHttpTransport } from "npm:mcp-lite@^0.10.0";
import { createClient } from "npm:@supabase/supabase-js@2";

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
    if (!fn) continue;

    server.tool({
      name: fn.name,
      description: fn.description || skill.description || skill.name,
      inputSchema: (fn.parameters as any) || {
        type: "object",
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

  // Resource: list all modules
  server.resource({
    uri: "flowwink://modules",
    name: "FlowWink Modules",
    description: "List of all available FlowWink modules and their status",
    mimeType: "application/json",
    handler: async () => {
      const sb = serviceClient();
      const { data } = await sb
        .from("site_settings")
        .select("value")
        .eq("key", "modules")
        .single();

      return {
        contents: [
          {
            uri: "flowwink://modules",
            mimeType: "application/json",
            text: JSON.stringify(data?.value ?? {}, null, 2),
          },
        ],
      };
    },
  });

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
  // Store scopes for potential scope checks
  c.set("apiKeyScopes" as any, auth.scopes);
  return next();
});

// MCP transport
const transport = new StreamableHttpTransport();

app.all("/*", async (c) => {
  const server = await createMcpServer();
  const response = await transport.handleRequest(c.req.raw, server);
  // Add CORS headers to response
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
