import { Hono } from "hono";
import { McpServer, StreamableHttpTransport } from "mcp-lite";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { AsyncLocalStorage } from "node:async_hooks";
import templateAuditData from "./template-audit.json" with { type: "json" };

// Per-request context propagated through MCP handlers (cached transport bypasses Hono ctx)
const requestContext = new AsyncLocalStorage<{ callerUserId: string | null }>();

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, x-api-key, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
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
  if (!authHeader?.startsWith("Bearer ")) {
    console.error("Auth: missing or malformed header");
    return { valid: false };
  }
  const raw = authHeader.replace("Bearer ", "").trim();
  if (!raw) return { valid: false };

  const hash = await sha256(raw);
  console.log("Auth: key_prefix=", raw.substring(0, 12), "hash=", hash.substring(0, 16));
  const sb = serviceClient();

  const { data, error } = await sb
    .from("api_keys")
    .select("id, scopes, expires_at")
    .eq("key_hash", hash)
    .single();

  if (error || !data) {
    console.error("Auth: no matching key found, error=", error?.message);
    return { valid: false };
  }

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

// Skill category → module IDs that must be enabled for the category to be exposed
const SKILL_CATEGORY_MODULES: Record<string, string[]> = {
  content: ["pages", "blog", "knowledgeBase", "handbook", "resume", "mediaLibrary", "siteMigration"],
  crm: ["leads", "deals", "companies", "forms", "bookings", "hr", "projects", "salesIntelligence", "tickets"],
  communication: ["newsletter", "chat", "liveSupport", "webinars"],
  automation: ["flowpilot"],
  search: ["flowpilot", "browserControl"],
  analytics: ["analytics", "sla"],
  system: [], // always available
  commerce: ["ecommerce", "accounting", "expenses", "contracts", "inventory", "purchasing", "invoicing", "timesheets"],
  growth: ["paidGrowth"],
};

async function loadActiveModules(): Promise<Set<string>> {
  const sb = serviceClient();
  const { data, error } = await sb
    .from("site_settings")
    .select("value")
    .eq("key", "modules")
    .maybeSingle();

  if (error || !data?.value) {
    console.warn("Could not load modules settings, exposing all skills");
    return new Set(["__all__"]);
  }

  const modules = data.value as Record<string, { enabled?: boolean }>;
  const active = new Set<string>();
  for (const [id, config] of Object.entries(modules)) {
    if (config?.enabled) active.add(id);
  }
  return active;
}

function isCategoryActive(category: string, activeModules: Set<string>): boolean {
  if (activeModules.has("__all__")) return true;
  const requiredModules = SKILL_CATEGORY_MODULES[category];
  if (!requiredModules || requiredModules.length === 0) return true; // system = always
  return requiredModules.some((m) => activeModules.has(m));
}

// All valid toolset groups — used for validation and discovery
const TOOLSET_GROUPS = Object.keys(SKILL_CATEGORY_MODULES) as string[];

// Reverse map: module-id → category, so ?groups=leads resolves to "crm".
// Built once from SKILL_CATEGORY_MODULES.
const MODULE_TO_CATEGORY: Record<string, string> = (() => {
  const out: Record<string, string> = {};
  for (const [cat, mods] of Object.entries(SKILL_CATEGORY_MODULES)) {
    for (const m of mods) out[m.toLowerCase()] = cat;
  }
  return out;
})();

/** Resolve a list of group/module tokens to their underlying skill categories. */
function resolveGroupTokens(tokens: string[]): Set<string> {
  const cats = new Set<string>();
  for (const raw of tokens) {
    const t = raw.toLowerCase().trim();
    if (!t) continue;
    if (SKILL_CATEGORY_MODULES[t]) {
      cats.add(t); // already a category
    } else if (MODULE_TO_CATEGORY[t]) {
      cats.add(MODULE_TO_CATEGORY[t]); // module name → its category
    }
    // unknown tokens silently dropped
  }
  return cats;
}

async function loadExposedSkills(filterGroups?: string[]): Promise<SkillRow[]> {
  const sb = serviceClient();
  const [skillsResult, activeModules] = await Promise.all([
    sb
      .from("agent_skills")
      .select("name, description, category, tool_definition")
      .eq("enabled", true)
      .eq("mcp_exposed", true)
      .order("category"),
    loadActiveModules(),
  ]);

  if (skillsResult.error) {
    console.error("Failed to load skills:", skillsResult.error.message);
    return [];
  }

  const all = (skillsResult.data ?? []) as unknown as SkillRow[];
  let filtered = all.filter((s) => isCategoryActive(s.category, activeModules));

  // Apply toolset group filter if requested — accepts both category ids and module ids
  if (filterGroups && filterGroups.length > 0) {
    const catSet = resolveGroupTokens(filterGroups);
    filtered = filtered.filter((s) => catSet.has(s.category));
  }

  console.log(
    `MCP: ${filtered.length}/${all.length} skills exposed` +
    (filterGroups ? ` (groups: ${filterGroups.join(",")})` : "") +
    ` (${activeModules.size} active modules)`,
  );
  return filtered;
}

// ---------- execute skill ----------

async function executeSkill(
  skillName: string,
  args: Record<string, unknown>,
  callerUserId?: string | null,
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
      caller_user_id: callerUserId ?? undefined,
    }),
  });

  const body = await res.text();
  if (!res.ok) {
    return JSON.stringify({ error: `Execution failed (${res.status}): ${body}` });
  }
  return body;
}

// ---------- lock helpers ----------

async function acquireLock(lane: string, lockedBy: string, ttlSeconds: number): Promise<{ acquired: boolean; lane: string }> {
  const sb = serviceClient();
  const { data, error } = await sb.rpc('try_acquire_agent_lock', {
    p_lane: lane,
    p_locked_by: lockedBy,
    p_ttl_seconds: ttlSeconds,
  });
  if (error) {
    console.error(`Lock acquire failed for '${lane}':`, error.message);
    return { acquired: false, lane };
  }
  return { acquired: data === true, lane };
}

async function releaseLock(lane: string): Promise<{ released: boolean; lane: string }> {
  const sb = serviceClient();
  const { error } = await sb.rpc('release_agent_lock', { p_lane: lane });
  if (error) {
    console.error(`Lock release failed for '${lane}':`, error.message);
    return { released: false, lane };
  }
  return { released: true, lane };
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

    // ── New resources for external orchestration ──

    case "objectives": {
      const { data } = await sb
        .from("agent_objectives")
        .select("id, goal, status, progress, success_criteria, constraints, created_at, updated_at, locked_by, locked_at")
        .in("status", ["active", "pending", "paused"])
        .order("created_at", { ascending: false })
        .limit(20);
      return {
        objectives: data ?? [],
        count: data?.length ?? 0,
        timestamp: new Date().toISOString(),
      };
    }

    case "automations": {
      const { data } = await sb
        .from("agent_automations")
        .select("id, name, description, trigger_type, trigger_config, skill_name, enabled, last_triggered_at, next_run_at, run_count, last_error")
        .order("name");
      return {
        automations: data ?? [],
        active_count: (data ?? []).filter((a: any) => a.enabled).length,
        total_count: data?.length ?? 0,
        timestamp: new Date().toISOString(),
      };
    }

    case "heartbeat": {
      // Latest heartbeat activity
      const [lastHeartbeat, heartbeatMemory] = await Promise.all([
        sb.from("agent_activity")
          .select("id, status, duration_ms, created_at, token_usage, output")
          .eq("skill_name", "heartbeat")
          .order("created_at", { ascending: false })
          .limit(1)
          .single(),
        sb.from("agent_memory")
          .select("value, updated_at")
          .eq("key", "heartbeat_state")
          .single(),
      ]);

      return {
        last_run: lastHeartbeat.data ?? null,
        state: heartbeatMemory.data?.value ?? null,
        state_updated_at: heartbeatMemory.data?.updated_at ?? null,
        timestamp: new Date().toISOString(),
      };
    }

    case "briefing": {
      // Aggregated context briefing — one call for full situational awareness
      const [
        bHealth, bIdentity, bObjectives, bActivity, bModules, bAutomations, bHeartbeat, bSkillCount
      ] = await Promise.all([
        // Health counts
        (async () => {
          const [pages, posts, leads, bookings, orders, products, subscribers] = await Promise.all([
            sb.from("pages").select("id", { count: "exact", head: true }).eq("status", "published"),
            sb.from("blog_posts").select("id", { count: "exact", head: true }).eq("status", "published"),
            sb.from("leads").select("id", { count: "exact", head: true }),
            sb.from("bookings").select("id", { count: "exact", head: true }).eq("status", "confirmed"),
            sb.from("orders").select("id", { count: "exact", head: true }),
            sb.from("products").select("id", { count: "exact", head: true }),
            sb.from("leads").select("id", { count: "exact", head: true }).eq("type", "subscriber"),
          ]);
          return {
            pages: pages.count ?? 0,
            blog_posts: posts.count ?? 0,
            leads: leads.count ?? 0,
            active_bookings: bookings.count ?? 0,
            orders: orders.count ?? 0,
            products: products.count ?? 0,
            subscribers: subscribers.count ?? 0,
          };
        })(),
        // Identity (soul summary)
        (async () => {
          const { data } = await sb
            .from("agent_memory")
            .select("key, value")
            .in("key", ["soul", "identity"]);
          const result: Record<string, unknown> = {};
          for (const row of data ?? []) result[row.key] = row.value;
          return result;
        })(),
        // Active objectives
        sb.from("agent_objectives")
          .select("id, goal, status, progress, success_criteria, updated_at")
          .in("status", ["active", "pending"])
          .order("updated_at", { ascending: false })
          .limit(10),
        // Recent activity (last 10)
        sb.from("agent_activity")
          .select("skill_name, status, created_at")
          .order("created_at", { ascending: false })
          .limit(10),
        // Modules
        sb.from("site_settings")
          .select("value")
          .eq("key", "modules")
          .single(),
        // Automations summary
        sb.from("agent_automations")
          .select("name, enabled, last_triggered_at, next_run_at")
          .eq("enabled", true)
          .order("next_run_at"),
        // Last heartbeat
        sb.from("agent_activity")
          .select("status, duration_ms, created_at, token_usage")
          .eq("skill_name", "heartbeat")
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle(),
        // Skill count
        sb.from("agent_skills")
          .select("id", { count: "exact", head: true })
          .eq("enabled", true)
          .eq("mcp_exposed", true),
      ]);

      return {
        identity: bIdentity,
        health: bHealth,
        objectives: (bObjectives.data ?? []).map((o: any) => ({
          id: o.id,
          goal: o.goal,
          status: o.status,
          progress: o.progress,
        })),
        recent_activity: (bActivity.data ?? []).map((a: any) => ({
          skill: a.skill_name,
          status: a.status,
          at: a.created_at,
        })),
        active_modules: (() => {
          const raw = (bModules.data?.value ?? {}) as Record<string, { enabled?: boolean }>;
          const enabled = Object.entries(raw)
            .filter(([, v]) => v?.enabled === true)
            .map(([k]) => k);
          return {
            enabled,
            count: enabled.length,
            available_count: Object.keys(raw).length,
          };
        })(),
        automations: {
          active: (bAutomations.data ?? []).map((a: any) => ({
            name: a.name,
            next_run: a.next_run_at,
            last_run: a.last_triggered_at,
          })),
          count: bAutomations.data?.length ?? 0,
        },
        heartbeat: bHeartbeat.data ? {
          status: bHeartbeat.data.status,
          duration_ms: bHeartbeat.data.duration_ms,
          last_run: bHeartbeat.data.created_at,
          token_usage: bHeartbeat.data.token_usage,
        } : null,
        skill_count: bSkillCount.count ?? 0,
        timestamp: new Date().toISOString(),
      };
    }

    default: {
      if (resourceKey.startsWith("template:")) {
        const templateId = resourceKey.replace("template:", "");
        const template = (templateAuditData as any[]).find((t: any) => t.id === templateId);
        return template || { error: `Template not found: ${templateId}` };
      }
      return { error: `Unknown resource: ${resourceKey}` };
    }
  }
}

// ---------- MCP server factory ----------

async function createMcpServer(filterGroups?: string[]): Promise<McpServer> {
  const server = new McpServer({
    name: "flowwink",
    version: "1.0.0",
  });

  const skills = await loadExposedSkills(filterGroups);

  for (const skill of skills) {
    const fn = skill.tool_definition?.function;
    if (!fn?.name) continue;

    server.tool(fn.name, {
      description: `[${skill.category}] ${fn.description || skill.description || skill.name}`,
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

  // ── Lock tools for concurrency ──

  server.tool("acquire_lock", {
    description: "Acquire an advisory lock on a resource lane to prevent concurrent operations. Use when: you are about to modify a specific entity (lead, order, page) and need exclusive access. NOT for: read-only operations.",
    inputSchema: {
      type: "object" as const,
      properties: {
        lane: { type: "string", description: "Lock lane identifier, e.g. 'lead_abc123' or 'blog_post_xyz'" },
        locked_by: { type: "string", description: "Identifier for the agent acquiring the lock (default: 'mcp')" },
        ttl_seconds: { type: "number", description: "Time-to-live in seconds before auto-expiry (default: 60, max: 300)" },
      },
      required: ["lane"],
    },
    handler: async (args: Record<string, unknown>) => {
      const lane = typeof args.lane === "string" ? args.lane.trim() : "";
      if (!lane) {
        return {
          content: [{
            type: "text" as const,
            text: JSON.stringify({
              error: "Missing required argument 'lane'",
              hint: "Pass a non-empty string identifier like 'lead_abc123' or 'page_xyz'.",
            }),
          }],
          isError: true,
        };
      }
      const lockedBy = (typeof args.locked_by === "string" && args.locked_by) || "mcp";
      const ttl = Math.min(Number(args.ttl_seconds) || 60, 300);
      const result = await acquireLock(lane, lockedBy, ttl);
      return { content: [{ type: "text" as const, text: JSON.stringify(result) }] };
    },
  });

  server.tool("release_lock", {
    description: "Release an advisory lock on a resource lane. Use when: you have finished modifying an entity and want to allow other agents to operate on it. Always release locks after completing your operation.",
    inputSchema: {
      type: "object" as const,
      properties: {
        lane: { type: "string", description: "Lock lane identifier to release" },
      },
      required: ["lane"],
    },
    handler: async (args: Record<string, unknown>) => {
      const lane = typeof args.lane === "string" ? args.lane.trim() : "";
      if (!lane) {
        return {
          content: [{
            type: "text" as const,
            text: JSON.stringify({
              error: "Missing required argument 'lane'",
              hint: "Pass the same lane string you used in acquire_lock.",
            }),
          }],
          isError: true,
        };
      }
      const result = await releaseLock(lane);
      return { content: [{ type: "text" as const, text: JSON.stringify(result) }] };
    },
  });

  // ── Report finding tool — autonomous objective reporting ──

  server.tool("openclaw_report_finding", {
    description: "Submit an operational finding from an autonomous objective check. Use when: you have completed an objective audit (OBJ-001 through OBJ-006) and want to report a gap, SLA violation, missing data, compliance issue, stale entity, quality gap, or utilization alert. NOT for: general chat or queries — this is a structured reporting tool.",
    inputSchema: {
      type: "object" as const,
      properties: {
        title: { type: "string", description: "Short finding title, e.g. 'OBJ-002: Order #xyz pending >48h'" },
        type: {
          type: "string",
          enum: ["broken_chain", "sla_violation", "missing_data", "compliance_issue", "stale_entity", "quality_gap", "utilization_alert"],
          description: "Finding type category",
        },
        severity: {
          type: "string",
          enum: ["critical", "high", "medium", "low"],
          description: "Impact level: critical=revenue/compliance risk, high=fix within 24h, medium=fix this week, low=nice to have",
        },
        description: { type: "string", description: "Detailed description of the finding with context and evidence" },
        context: {
          type: "object",
          description: "Structured metadata: objective ID, entity_type, entity_id, metric, value, threshold",
          properties: {
            objective: { type: "string", description: "Objective ID, e.g. OBJ-001" },
            entity_type: { type: "string" },
            entity_id: { type: "string" },
            metric: { type: "string" },
            value: {},
            threshold: {},
          },
        },
      },
      required: ["title", "type", "severity"],
    },
    handler: async (args: Record<string, unknown>) => {
      const sb = serviceClient();
      const { data, error } = await sb
        .from("beta_test_findings")
        .insert({
          title: args.title as string,
          type: args.type as string,
          severity: args.severity as string,
          description: (args.description as string) || null,
          context: (args.context as Record<string, unknown>) || null,
        })
        .select("id, title, severity, created_at")
        .single();

      if (error) {
        return { content: [{ type: "text" as const, text: JSON.stringify({ error: error.message }) }] };
      }
      return { content: [{ type: "text" as const, text: JSON.stringify({ success: true, finding: data }) }] };
    },
  });

  const resourceDefs: Array<{ key: string; uri: string; name: string; description: string }> = [
    { key: "modules",     uri: "flowwink://modules",     name: "FlowWink Modules",    description: "All available modules and their enabled/disabled status" },
    { key: "health",      uri: "flowwink://health",      name: "Site Health",          description: "Current site statistics: pages, posts, leads, bookings, orders, products, active objectives" },
    { key: "skills",      uri: "flowwink://skills",      name: "Skill Registry",       description: "All FlowPilot skills with category, scope, trust level, and enabled status" },
    { key: "activity",    uri: "flowwink://activity",    name: "Recent Activity",      description: "Last 20 FlowPilot actions with skill name, status, duration, and timestamps" },
    { key: "peers",       uri: "flowwink://peers",       name: "Federation Peers",     description: "Connected A2A/MCP peers with status, capabilities, and last seen time" },
    { key: "identity",    uri: "flowwink://identity",    name: "FlowPilot Identity",   description: "FlowPilot's soul, identity, and agent configuration" },
    { key: "templates",   uri: "flowwink://templates",   name: "Site Templates",       description: "All available starter templates with SEO audit summaries" },
    { key: "objectives",  uri: "flowwink://objectives",  name: "Active Objectives",    description: "FlowPilot's active, pending and paused objectives with progress, success criteria, and lock status. Use to understand what the embedded agent is working towards and coordinate." },
    { key: "automations", uri: "flowwink://automations", name: "Automations",          description: "All configured automations with trigger type, schedule, last run, and error status. Use to avoid duplicating scheduled work." },
    { key: "heartbeat",   uri: "flowwink://heartbeat",   name: "Heartbeat Status",     description: "FlowPilot's last heartbeat run: timing, token usage, and current state. Use to understand when FlowPilot last operated and what it prioritized." },
    { key: "briefing",    uri: "flowwink://briefing",    name: "Context Briefing",      description: "Aggregated situational awareness in ONE call: identity, health metrics, active objectives, recent activity, modules, automations, heartbeat status, and skill count. Use this FIRST to understand the full system state before taking action. ~50ms latency vs ~500ms+ for individual resource calls." },
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

  // Support both Authorization: Bearer <key> and x-api-key: <key> (OpenAI MCP format)
  const xApiKey = c.req.header("x-api-key");
  const authHeader = xApiKey ? `Bearer ${xApiKey}` : c.req.header("Authorization");
  const auth = await authenticateApiKey(authHeader);
  if (!auth.valid) {
    return c.json({ error: "Invalid or expired API key" }, 401);
  }
  c.set("apiKeyScopes" as any, auth.scopes);
  c.set("apiKeyCreatedBy" as any, auth.createdBy);
  return next();
});

// ══════════════════════════════════════════════════════════
// REST compatibility layer — for agents without MCP clients
// ══════════════════════════════════════════════════════════

// Toolset groups discovery — transparent: shows catalog + live state
app.get("/rest/groups", async (c) => {
  const sb = serviceClient();
  const [activeModules, skillsResult] = await Promise.all([
    loadActiveModules(),
    sb
      .from("agent_skills")
      .select("category")
      .eq("enabled", true)
      .eq("mcp_exposed", true),
  ]);

  // Count exposed tools per category, respecting module-active filter
  const toolCountByCategory: Record<string, number> = {};
  for (const row of (skillsResult.data ?? []) as Array<{ category: string }>) {
    if (!isCategoryActive(row.category, activeModules)) continue;
    toolCountByCategory[row.category] = (toolCountByCategory[row.category] ?? 0) + 1;
  }

  const allActive = activeModules.has("__all__");
  const groups = TOOLSET_GROUPS.map((g) => {
    const available = SKILL_CATEGORY_MODULES[g] || [];
    const active = available.length === 0
      ? [] // system: no module gating
      : available.filter((m) => allActive || activeModules.has(m));
    const toolCount = toolCountByCategory[g] ?? 0;
    return {
      id: g,
      available_modules: available,
      active_modules: active,
      tool_count: toolCount,
      is_active: available.length === 0 ? true : active.length > 0,
    };
  });

  return c.json(
    {
      groups,
      note: "available_modules = catalog (what could be enabled). active_modules = currently on. tool_count = skills actually exposed right now via ?groups=<id>. system has no module gating.",
    },
    200,
    corsHeaders,
  );
});

app.get("/rest/tools", async (c) => {
  // ?groups=crm,commerce filters to only those categories
  const groupsParam = c.req.query("groups");
  const filterGroups = groupsParam
    ? groupsParam.split(",").map((g) => g.trim()).filter(Boolean)
    : undefined;

  const skills = await loadExposedSkills(filterGroups);
  const tools = skills
    .filter((s) => s.tool_definition?.function?.name)
    .map((s) => ({
      name: s.tool_definition.function.name,
      description: s.tool_definition.function.description || s.description,
      group: s.category,
      parameters: s.tool_definition.function.parameters || {},
    }));
  return c.json(
    { tools, count: tools.length, available_groups: TOOLSET_GROUPS },
    200, corsHeaders,
  );
});

app.get("/rest/resources", (c) => {
  const resources = [
    { key: "health",       description: "Site statistics: pages, posts, leads, bookings, orders, products, active objectives" },
    { key: "skills",       description: "Full skill registry with category, scope, trust level, enabled status" },
    { key: "modules",      description: "Module configuration (enabled/disabled)" },
    { key: "activity",     description: "Last 20 FlowPilot actions" },
    { key: "peers",        description: "Federation peers with status and capabilities" },
    { key: "identity",     description: "FlowPilot soul, identity, and agent configuration" },
    { key: "templates",    description: "All starter templates with SEO audit summaries" },
    { key: "objectives",   description: "Active objectives with progress, criteria, and lock status" },
    { key: "automations",  description: "All automations with triggers, schedules, and run history" },
    { key: "heartbeat",    description: "Last heartbeat run timing, state, and token usage" },
    { key: "briefing",     description: "Aggregated context: identity + health + objectives + activity + modules + automations + heartbeat in ONE call" },
  ];
  return c.json({ resources }, 200, corsHeaders);
});

// ── Lock REST endpoints ──

app.post("/rest/lock/acquire", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const { lane, locked_by, ttl_seconds } = body as { lane?: string; locked_by?: string; ttl_seconds?: number };
  if (!lane) return c.json({ error: "Missing 'lane' field" }, 400, corsHeaders);
  const ttl = Math.min(Number(ttl_seconds) || 60, 300);
  const result = await acquireLock(lane, locked_by || "mcp", ttl);
  return c.json(result, result.acquired ? 200 : 409, corsHeaders);
});

app.post("/rest/lock/release", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const { lane } = body as { lane?: string };
  if (!lane) return c.json({ error: "Missing 'lane' field" }, 400, corsHeaders);
  const result = await releaseLock(lane);
  return c.json(result, 200, corsHeaders);
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
  // Resilient JSON parsing — 27B models often produce malformed JSON
  let body: Record<string, unknown>;
  try {
    body = await c.req.json();
  } catch {
    // Try to salvage the raw text
    const raw = await c.req.text().catch(() => "");
    try {
      // Common fixes: trailing commas, unescaped quotes in values
      const cleaned = raw
        .replace(/,\s*([}\]])/g, "$1")           // trailing commas
        .replace(/([{,]\s*)(\w+)\s*:/g, '$1"$2":'); // unquoted keys
      body = JSON.parse(cleaned);
    } catch {
      console.error("REST /execute: unparseable JSON body:", raw.substring(0, 500));
      return c.json(
        { ok: false, error: "Invalid JSON in request body. Send valid JSON with 'tool' and 'arguments' fields." },
        400, corsHeaders,
      );
    }
  }

  const { tool, arguments: args } = body as { tool?: string; arguments?: Record<string, unknown> };
  if (!tool) {
    return c.json({ ok: false, error: "Missing 'tool' field in request body" }, 400, corsHeaders);
  }

  const skills = await loadExposedSkills();
  const match = skills.find((s) => s.tool_definition?.function?.name === tool);
  if (!match) {
    const available = skills.map((s) => s.tool_definition?.function?.name).filter(Boolean);
    return c.json(
      { ok: false, error: `Unknown tool: ${tool}`, available_tools: available },
      404, corsHeaders,
    );
  }

  const result = await executeSkill(match.name, args || {});
  try {
    return c.json({ ok: true, tool, result: JSON.parse(result) }, 200, corsHeaders);
  } catch {
    return c.json({ ok: true, tool, result }, 200, corsHeaders);
  }
});

// ══════════════════════════════════════════════════════════
// Native MCP transport (JSON-RPC over POST)
// ══════════════════════════════════════════════════════════

// Cache MCP handlers by group key
const mcpHandlerCache = new Map<string, (req: Request) => Promise<Response>>();

async function getMcpHandler(filterGroups?: string[]) {
  const cacheKey = filterGroups ? filterGroups.sort().join(",") : "__all__";
  let handler = mcpHandlerCache.get(cacheKey);
  if (!handler) {
    const server = await createMcpServer(filterGroups);
    const transport = new StreamableHttpTransport();
    handler = transport.bind(server);
    mcpHandlerCache.set(cacheKey, handler);
    // Expire cache after 5 minutes to pick up skill changes
    setTimeout(() => mcpHandlerCache.delete(cacheKey), 5 * 60 * 1000);
  }
  return handler;
}

app.all("/*", async (c) => {
  // Support ?groups=crm,commerce for MCP native clients
  const groupsParam = new URL(c.req.url).searchParams.get("groups");
  const filterGroups = groupsParam
    ? groupsParam.split(",").map((g) => g.trim()).filter(Boolean)
    : undefined;

  const handler = await getMcpHandler(filterGroups);
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
