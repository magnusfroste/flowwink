// Platform Test Runner — FlowWink SaaS-level health checks.
// Distinct from run-autonomy-tests (which only tests FlowPilot reasoning).
// Tests here verify the platform shell, modules, skills, MCP exposure,
// manifest integrity, and tenant data isolation (RLS smoke).

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

type Status = "pass" | "fail" | "skip";

interface TestResult {
  suite: string;
  name: string;
  status: Status;
  duration_ms: number;
  error?: string;
  details?: unknown;
}

function timed<T>(fn: () => Promise<T>): Promise<{ result: T; ms: number }> {
  const start = Date.now();
  return fn().then((result) => ({ result, ms: Date.now() - start }));
}

async function runCheck(
  suite: string,
  name: string,
  fn: () => Promise<void | { details?: unknown }>,
): Promise<TestResult> {
  const start = Date.now();
  try {
    const out = await fn();
    return {
      suite,
      name,
      status: "pass",
      duration_ms: Date.now() - start,
      details: out?.details,
    };
  } catch (err) {
    return {
      suite,
      name,
      status: "fail",
      duration_ms: Date.now() - start,
      error: (err as Error).message,
    };
  }
}

// ─── Suite implementations ───────────────────────────────────────────────────

type SuiteFn = (
  admin: ReturnType<typeof createClient>,
  anon: ReturnType<typeof createClient>,
  payload: Record<string, unknown>,
) => Promise<TestResult[]>;

/** Suite: MCP exposure invariants (mirrors DB trigger + lint guardrail). */
const suite_mcp_invariants: SuiteFn = async (admin) => {
  const out: TestResult[] = [];

  out.push(
    await runCheck("mcp_invariants", "no orphan MCP tools (mcp_exposed=true → enabled=true)", async () => {
      const { data, error } = await admin
        .from("agent_skills")
        .select("name")
        .eq("mcp_exposed", true)
        .eq("enabled", false);
      if (error) throw new Error(error.message);
      if (data && data.length > 0) {
        throw new Error(
          `Orphan MCP tools: ${data.map((r) => r.name).join(", ")}`,
        );
      }
      return { details: { checked: "agent_skills" } };
    }),
  );

  out.push(
    await runCheck("mcp_invariants", "utility skills are MCP-exposed", async () => {
      const utilityNames = [
        "migrate_url",
        "scrape_url",
        "search_web",
        "extract_pdf_text",
        "sla_check",
        "process_signal",
        "competitor_monitor",
      ];
      const { data, error } = await admin
        .from("agent_skills")
        .select("name, mcp_exposed, enabled")
        .in("name", utilityNames);
      if (error) throw new Error(error.message);
      const missing = (data ?? []).filter(
        (r) => !r.mcp_exposed || !r.enabled,
      );
      if (missing.length > 0) {
        throw new Error(
          `Utility skills not MCP-exposed: ${missing.map((m) => m.name).join(", ")}`,
        );
      }
      return { details: { found: data?.length ?? 0, expected: utilityNames.length } };
    }),
  );

  return out;
};

/** Suite: agent_skills table is healthy (no duplicates, all have descriptions). */
const suite_skills_health: SuiteFn = async (admin) => {
  const out: TestResult[] = [];

  out.push(
    await runCheck("skills_health", "no duplicate skill names", async () => {
      const { data, error } = await admin.from("agent_skills").select("name");
      if (error) throw new Error(error.message);
      const counts = new Map<string, number>();
      for (const r of data ?? []) {
        counts.set(r.name, (counts.get(r.name) ?? 0) + 1);
      }
      const dupes = [...counts.entries()].filter(([, n]) => n > 1);
      if (dupes.length > 0) {
        throw new Error(`Duplicates: ${dupes.map(([n]) => n).join(", ")}`);
      }
      return { details: { total: data?.length ?? 0 } };
    }),
  );

  out.push(
    await runCheck("skills_health", "all enabled skills have descriptions", async () => {
      const { data, error } = await admin
        .from("agent_skills")
        .select("name, description")
        .eq("enabled", true);
      if (error) throw new Error(error.message);
      const empty = (data ?? []).filter(
        (r) => !r.description || r.description.trim().length < 20,
      );
      if (empty.length > 0) {
        throw new Error(
          `Missing/thin descriptions: ${empty.map((m) => m.name).slice(0, 10).join(", ")}${empty.length > 10 ? "…" : ""}`,
        );
      }
      return { details: { checked: data?.length ?? 0 } };
    }),
  );

  return out;
};

/** Suite: per-module skill seed coverage. Payload: { moduleId, expectedSkills: string[] } */
const suite_module_skills: SuiteFn = async (admin, _anon, payload) => {
  const moduleId = String(payload.moduleId ?? "");
  const expected = (payload.expectedSkills as string[]) ?? [];
  const out: TestResult[] = [];

  if (!moduleId || expected.length === 0) {
    out.push({
      suite: `module_${moduleId || "unknown"}_skills`,
      name: "module skills seeded",
      status: "skip",
      duration_ms: 0,
      error: "no expected skills declared",
    });
    return out;
  }

  out.push(
    await runCheck(`module_${moduleId}_skills`, `all ${expected.length} skill seeds exist in agent_skills`, async () => {
      const { data, error } = await admin
        .from("agent_skills")
        .select("name")
        .in("name", expected);
      if (error) throw new Error(error.message);
      const found = new Set((data ?? []).map((r) => r.name));
      const missing = expected.filter((n) => !found.has(n));
      if (missing.length > 0) {
        throw new Error(`Missing seeds: ${missing.join(", ")}`);
      }
      return { details: { module: moduleId, expected: expected.length } };
    }),
  );

  return out;
};

/** Suite: RLS smoke — anon can NOT read protected tables. */
const suite_rls_smoke: SuiteFn = async (_admin, anon) => {
  const out: TestResult[] = [];
  const protectedTables = [
    "agent_messages",
    "agent_objectives",
    "agent_memory",
    "audit_logs",
    "user_roles",
  ];

  for (const table of protectedTables) {
    out.push(
      await runCheck("rls_smoke", `anon cannot read ${table}`, async () => {
        const { data, error } = await anon.from(table).select("*").limit(1);
        // We expect either an RLS error OR an empty result. Non-empty = leak.
        if (!error && Array.isArray(data) && data.length > 0) {
          throw new Error(`Anon read ${data.length} row(s) from ${table}`);
        }
        return { details: { rls_blocked: !!error || (data?.length ?? 0) === 0 } };
      }),
    );
  }

  return out;
};

/** Suite: event bus roundtrip — emit_platform_event writes to agent_events. */
const suite_event_bus: SuiteFn = async (admin) => {
  const out: TestResult[] = [];

  out.push(
    await runCheck("event_bus", "emit_platform_event → agent_events row", async () => {
      const marker = `platform-test-${Date.now()}`;
      // Try the helper RPC; if it doesn't exist we skip.
      const { error: rpcErr } = await admin.rpc("emit_platform_event", {
        _event_name: "platform.test.ping",
        _payload: { marker },
        _source: "run-platform-tests",
      });
      if (rpcErr) {
        if (/function .* does not exist/i.test(rpcErr.message)) {
          throw new Error("emit_platform_event RPC not installed");
        }
        throw new Error(rpcErr.message);
      }
      // Look it up
      const { data, error } = await admin
        .from("agent_events")
        .select("id, payload")
        .eq("event_name", "platform.test.ping")
        .order("created_at", { ascending: false })
        .limit(5);
      if (error) throw new Error(error.message);
      const found = (data ?? []).some(
        (r) => (r.payload as { marker?: string })?.marker === marker,
      );
      if (!found) throw new Error("event not found in agent_events");
      return { details: { marker } };
    }),
  );

  return out;
};

/** Suite: instance health — DB reachable + critical tables present. */
const suite_instance_health: SuiteFn = async (admin) => {
  const out: TestResult[] = [];
  const critical = [
    "agent_skills",
    "agent_objectives",
    "pages",
    "products",
    "site_settings",
  ];

  for (const t of critical) {
    out.push(
      await runCheck("instance_health", `table ${t} reachable`, async () => {
        const { error } = await admin.from(t).select("*", { count: "exact", head: true });
        if (error) throw new Error(error.message);
      }),
    );
  }

  return out;
};

const SUITES: Record<string, SuiteFn> = {
  instance_health: suite_instance_health,
  mcp_invariants: suite_mcp_invariants,
  skills_health: suite_skills_health,
  module_skills: suite_module_skills,
  rls_smoke: suite_rls_smoke,
  event_bus: suite_event_bus,
};

// ─── HTTP ────────────────────────────────────────────────────────────────────

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const body = (await req.json().catch(() => ({}))) as {
      suiteIds?: string[];
      payload?: Record<string, unknown>;
    };
    const suiteIds = body.suiteIds && body.suiteIds.length > 0
      ? body.suiteIds
      : Object.keys(SUITES);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    const admin = createClient(supabaseUrl, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const anon = createClient(supabaseUrl, anonKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const start = Date.now();
    const allResults: TestResult[] = [];

    for (const id of suiteIds) {
      const fn = SUITES[id];
      if (!fn) {
        allResults.push({
          suite: id,
          name: "suite registered",
          status: "skip",
          duration_ms: 0,
          error: `Unknown suite: ${id}`,
        });
        continue;
      }
      const r = await fn(admin, anon, body.payload ?? {});
      allResults.push(...r);
    }

    const summary = {
      total: allResults.length,
      passed: allResults.filter((r) => r.status === "pass").length,
      failed: allResults.filter((r) => r.status === "fail").length,
      skipped: allResults.filter((r) => r.status === "skip").length,
      duration_ms: Date.now() - start,
    };

    return new Response(
      JSON.stringify({ summary, results: allResults }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: (err as Error).message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
