// Platform Test Runner — FlowWink SaaS-level health checks.
// Distinct from run-autonomy-tests (which only tests FlowPilot reasoning).
// Tests here verify the platform shell, modules, skills, MCP exposure,
// manifest integrity, and tenant data isolation (RLS smoke).

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getServiceClient, getAnonClient } from '../_shared/supabase-clients.ts';
import { readAllRows } from '../_shared/read-all-rows.ts';

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

class SkipTest extends Error {
  constructor(reason: string) {
    super(reason);
    this.name = "SkipTest";
  }
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
    const isSkip = err instanceof SkipTest || (err as Error)?.name === "SkipTest";
    return {
      suite,
      name,
      status: isSkip ? "skip" : "fail",
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
      // Paginated: a test that reads a prefix and passes is worse than no test.
      const { rows, error, truncated } = await readAllRows<{ name: string }>(
        admin,
        "agent_skills",
        { columns: "name", orderBy: "name" },
      );
      if (error) throw new Error(error);
      if (truncated) throw new Error("Could not read the whole skill register — result would only cover a prefix.");
      const counts = new Map<string, number>();
      for (const r of rows) {
        counts.set(r.name, (counts.get(r.name) ?? 0) + 1);
      }
      const dupes = [...counts.entries()].filter(([, n]) => n > 1);
      if (dupes.length > 0) {
        throw new Error(`Duplicates: ${dupes.map(([n]) => n).join(", ")}`);
      }
      return { details: { total: rows.length } };
    }),
  );

  out.push(
    await runCheck("skills_health", "all enabled skills have descriptions", async () => {
      const { rows, error, truncated } = await readAllRows<{ name: string; description: string | null }>(
        admin,
        "agent_skills",
        { columns: "name, description", orderBy: "name", filter: (q) => q.eq("enabled", true) },
      );
      if (error) throw new Error(error);
      if (truncated) throw new Error("Could not read the whole skill register — result would only cover a prefix.");
      const empty = rows.filter(
        (r) => !r.description || r.description.trim().length < 20,
      );
      if (empty.length > 0) {
        throw new Error(
          `Missing/thin descriptions: ${empty.map((m) => m.name).slice(0, 10).join(", ")}${empty.length > 10 ? "…" : ""}`,
        );
      }
      return { details: { checked: rows.length } };
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

/** Suite: AI usage logging — table exists, service-role can insert, recent activity. */
const suite_ai_usage_logging: SuiteFn = async (admin) => {
  const out: TestResult[] = [];

  out.push(
    await runCheck("ai_usage_logging", "ai_usage_logs table reachable", async () => {
      const { error } = await admin
        .from("ai_usage_logs")
        .select("*", { count: "exact", head: true });
      if (error) {
        if (/does not exist|schema cache/i.test(error.message)) {
          throw new Error(
            "Table public.ai_usage_logs is missing. Migration 20260428222712_*.sql has not been applied.",
          );
        }
        throw new Error(error.message);
      }
    }),
  );

  out.push(
    await runCheck("ai_usage_logging", "log_ai_usage RPC works (no service_role needed)", async () => {
      const marker = `platform-test-${Date.now()}`;
      const { data, error } = await admin.rpc("log_ai_usage", {
        p_source: "platform-test",
        p_provider: "test",
        p_model: "test-model",
        p_metadata: { marker },
      });
      if (error) {
        if (/function .* does not exist|schema cache/i.test(error.message)) {
          throw new Error(
            "RPC public.log_ai_usage is missing — apply the latest migration (adds SECURITY DEFINER logger so anon-key edge functions can log without service_role).",
          );
        }
        throw new Error(error.message);
      }
      if (data) await admin.from("ai_usage_logs").delete().eq("id", data);
      return { details: { marker, inserted_id: data } };
    }),
  );

  out.push(
    await runCheck("ai_usage_logging", "recent AI activity recorded (last 7 days)", async () => {
      const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
      const { count, error } = await admin
        .from("ai_usage_logs")
        .select("*", { count: "exact", head: true })
        .neq("source", "platform-test")
        .gte("created_at", since);
      if (error) throw new Error(error.message);
      if ((count ?? 0) === 0) {
        // No recent AI activity. Treat as informational — this is normal on
        // fresh installs, demo instances, and quiet dev projects. The earlier
        // `log_ai_usage RPC works` check already proves the logging path is
        // intact; this row count only reflects real usage.
        throw new SkipTest("No AI traffic in the last 7 days. This is informational only — the RPC path is verified above and will populate once AI features run.");
      }
      return { details: { rows_last_7d: count } };
    }),
  );

  return out;
};

/** Suite: demo cycle — verify cron job is scheduled when demo_mode is on. */
const suite_demo_cycle: SuiteFn = async (admin) => {
  const out: TestResult[] = [];

  out.push(
    await runCheck("demo_cycle", "cron job scheduled when demo_mode is enabled", async () => {
      const { data: flag } = await admin
        .from("site_settings")
        .select("value")
        .eq("key", "demo_mode")
        .maybeSingle();
      const isDemo = flag?.value === true || (flag?.value as any)?.enabled === true;
      if (!isDemo) {
        throw new SkipTest("demo_mode is off on this instance — cron check not applicable.");
      }
      const { data, error } = await admin.rpc("demo_cycle_cron_status");
      if (error) throw new Error(error.message);
      const status = data as any;
      if (!status?.scheduled) {
        throw new Error(
          "demo_mode is enabled but demo-cycle-hourly cron is NOT scheduled. " +
          "Toggle Demo Mode off and on in Settings → General to re-register it, " +
          "or run enable_demo_cycle_cron(url, anon_key) directly.",
        );
      }
      if (status.active === false) {
        throw new Error("cron job exists but is inactive (cron.job.active = false).");
      }
      if (status.last_status && status.last_status !== "succeeded" && status.last_status !== "starting") {
        throw new Error(`last cron run failed: ${status.last_status} — ${status.last_message ?? ""}`);
      }
      return { details: status };
    }),
  );

  return out;
};

/**
 * Suite: ticket escalations — the sweep must actually RUN, not just exist.
 *
 * run_ticket_escalations() aborted on `ticket_priority = text` for every active
 * rule from 20260708124322 until 20260823040000, so the Escalation tab was dead
 * fleet-wide while pg_proc happily reported the function present. Existence
 * checks could not see it; only a call can. regression_ticket_escalations()
 * builds its own ticket + rules, sweeps, asserts and rolls everything back, so
 * this is safe to run against a live instance.
 */
const suite_ticket_escalations: SuiteFn = async (admin) => {
  const out: TestResult[] = [];

  out.push(
    await runCheck("ticket_escalations", "run_ticket_escalations completes with active rules present", async () => {
      const { data, error } = await admin.rpc("regression_ticket_escalations");
      if (error) {
        if (/PGRST202|schema cache|does not exist/i.test(error.message)) {
          throw new SkipTest(
            "regression_ticket_escalations() is not on this instance — apply " +
            "supabase/migrations/20260828130000_the-sweep-is-fixed-now-prove-it-keeps-running.sql.",
          );
        }
        throw new Error(error.message);
      }
      const verdict = data as { skipped?: boolean; reason?: string } | null;
      if (verdict?.skipped) {
        throw new SkipTest(verdict.reason ?? "the regression could not build its fixture on this instance");
      }
      return { details: verdict };
    }),
  );

  return out;
};

const SUITES: Record<string, SuiteFn> = {
  instance_health: suite_instance_health,
  mcp_invariants: suite_mcp_invariants,
  skills_health: suite_skills_health,
  module_skills: suite_module_skills,
  rls_smoke: suite_rls_smoke,
  event_bus: suite_event_bus,
  ai_usage_logging: suite_ai_usage_logging,
  skill_manifest_coverage: suite_skill_manifest_coverage,
  demo_cycle: suite_demo_cycle,
  ticket_escalations: suite_ticket_escalations,
};

// ─── Suite: Skill Manifest Coverage ──────────────────────────────────────────
// Detects DB skills with no module-manifest declaration. These "orphans" still
// work but never receive schema/description updates from a module bootstrap —
// they have to be edited via direct SQL. See mem://architecture/skill-manifest-coverage.

import declaredSkillsSnapshot from "./_declared-skills.json" with { type: "json" };

async function suite_skill_manifest_coverage(admin: any): Promise<TestResult[]> {
  const out: TestResult[] = [];
  const declared = new Set<string>((declaredSkillsSnapshot as any).declared ?? []);

  out.push(
    await runCheck("skill_manifest_coverage", "every DB skill is declared in a module manifest", async () => {
      // Paginated. This check exists to find orphans, and an orphan is defined
      // by ABSENCE from the manifest — so a read that stops at PostgREST's
      // silent 1000-row cap turns the whole suite green on a prefix. The
      // register measured 540 rows on optic (2026-08-23) and grows with every
      // module; the orphans in the unread tail would be exactly the ones
      // nobody is watching. A truncated read is a FAILURE here, not a caveat.
      const { rows, error, truncated } = await readAllRows<{ name: string }>(
        admin,
        "agent_skills",
        { columns: "name", orderBy: "name", filter: (q) => q.eq("origin", "bundled") },
      );
      if (error) throw new Error(error);
      if (truncated) {
        throw new Error(
          "Could not read the whole skill register — orphan detection over a prefix " +
          "would pass without having looked at the tail.",
        );
      }
      const dbNames = rows.map((r) => r.name);
      const orphans = dbNames.filter((n) => !declared.has(n)).sort();
      if (orphans.length > 0) {
        throw new Error(
          `${orphans.length} orphan skills in DB without manifest seed: [${orphans.join(", ")}]. ` +
          `These skills cannot be schema-updated via module bootstrap. Move them into the matching ` +
          `*-module.ts skillSeeds, then run: bun run scripts/snapshot-declared-skills.ts`,
        );
      }
      return { details: { db_skills: dbNames.length, declared: declared.size } };
    }),
  );

  return out;
}

// ─── HTTP ────────────────────────────────────────────────────────────────────

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const body = (await req.json().catch(() => ({}))) as {
      suiteIds?: string[];
      payload?: Record<string, unknown>;
      // UI sends these so the history row is meaningful + grouped correctly.
      loggedAs?: { suite_id: string; suite_title?: string; scope?: string; category?: string; module?: string };
      triggered_by?: 'ui' | 'edge' | 'ci' | 'cron' | 'manual';
    };
    const suiteIds = body.suiteIds && body.suiteIds.length > 0
      ? body.suiteIds
      : Object.keys(SUITES);

    const admin = getServiceClient();
    const anon = getAnonClient();

    const start = Date.now();
    const startedAt = new Date().toISOString();
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

    // Persist run history. Best-effort: never block the response on a logging failure.
    try {
      const loggedSuiteId = body.loggedAs?.suite_id ?? suiteIds[0] ?? "unknown";
      // Infer user from JWT (if provided by UI)
      let runBy: string | null = null;
      const authHeader = req.headers.get("authorization");
      if (authHeader?.startsWith("Bearer ")) {
        try {
          const { data: u } = await admin.auth.getUser(authHeader.replace("Bearer ", ""));
          runBy = u?.user?.id ?? null;
        } catch { /* ignore */ }
      }
      await admin.from("platform_test_runs").insert({
        suite_id: loggedSuiteId,
        suite_title: body.loggedAs?.suite_title ?? null,
        scope: body.loggedAs?.scope ?? "platform",
        category: body.loggedAs?.category ?? null,
        module: body.loggedAs?.module ?? null,
        status: summary.failed > 0 ? "fail" : summary.total === 0 ? "skip" : "pass",
        total: summary.total,
        passed: summary.passed,
        failed: summary.failed,
        skipped: summary.skipped,
        duration_ms: summary.duration_ms,
        results: allResults,
        triggered_by: body.triggered_by ?? "ui",
        run_by: runBy,
        started_at: startedAt,
      });
    } catch (logErr) {
      console.error("[run-platform-tests] failed to log run:", logErr);
    }

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
