import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getServiceClient } from '../_shared/supabase-clients.ts';
import { isModuleEnabled } from '../_shared/modules.ts';

/**
 * Event Dispatcher (Phase 3 — Platform Event Bus)
 *
 * Reads unprocessed rows from `agent_events` and fans them out to
 * automations registered with `trigger_type = 'event'` whose
 * `trigger_config.event_name` matches.
 *
 * Respects the same `executor` semantics as automation-dispatcher:
 *   - platform → execute via agent-execute
 *   - flowpilot → only if module is enabled
 *   - openclaw / external → skipped (those operators consume events themselves)
 *
 * Triggered every minute by pg_cron, and can be invoked on demand.
 */

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const BATCH_SIZE = 25;
/** Stop taking new events after this; the next minute's run continues. */
const RUN_BUDGET_MS = 40_000;

/**
 * Substitute {{event...}} templates in skill_arguments. Whole-string templates
 * preserve the raw value type ({{event.payload.order_id}} → the uuid string);
 * embedded templates interpolate. Paths: event.name, event.source, event.id,
 * event.payload.<key...>.
 */
function resolveTemplates(value: unknown, ev: { name: string; payload: any; source: string; id: string }): unknown {
  const lookup = (path: string): unknown => {
    const parts = path.split('.');
    if (parts[0] !== 'event') return undefined;
    let cur: any = ev;
    for (const part of parts.slice(1)) {
      cur = cur?.[part];
      if (cur === undefined) return undefined;
    }
    return cur;
  };
  if (typeof value === 'string') {
    const whole = value.match(/^\{\{\s*([a-zA-Z0-9_.]+)\s*\}\}$/);
    if (whole) {
      const v = lookup(whole[1]);
      return v === undefined ? value : v;
    }
    return value.replace(/\{\{\s*([a-zA-Z0-9_.]+)\s*\}\}/g, (m, path) => {
      const v = lookup(path);
      return v === undefined ? m : String(v);
    });
  }
  if (Array.isArray(value)) return value.map((v) => resolveTemplates(v, ev));
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) out[k] = resolveTemplates(v, ev);
    return out;
  }
  return value;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = getServiceClient();

  try {
    // 1. Fetch unprocessed events (oldest first)
    const { data: events, error: eventsErr } = await supabase
      .from("agent_events")
      .select("*")
      .is("processed_at", null)
      .order("created_at", { ascending: true })
      .limit(BATCH_SIZE);

    if (eventsErr) throw eventsErr;

    if (!events || events.length === 0) {
      return new Response(
        JSON.stringify({ processed: 0, fired: 0, results: [] }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // 2. Fetch all enabled event-triggered automations once
    const { data: automations, error: autoErr } = await supabase
      .from("agent_automations")
      .select("*")
      .eq("enabled", true)
      .eq("trigger_type", "event");

    if (autoErr) throw autoErr;

    // 3. Cache module status (avoid N queries)
    let flowpilotEnabled: boolean | null = null;
    async function isFlowpilotOn(): Promise<boolean> {
      if (flowpilotEnabled !== null) return flowpilotEnabled;
      // Centralised lookup (key/value row, not a 'modules' column — the trap that
      // previously skipped every executor='flowpilot' automation). Cached per call.
      flowpilotEnabled = await isModuleEnabled(supabase, "flowpilot");
      return flowpilotEnabled;
    }

    const results: Array<{
      event_id: string;
      event_name: string;
      matched: number;
      fired: number;
      errors: string[];
    }> = [];

    // 4. Process each event
    // Claim-then-dispatch, within a budget. Each event is stamped processed
    // BEFORE its automations fire (a claim; a second run in the same minute
    // skips it), every automation is handed to agent-execute with async:true
    // (202 at once, the skill runs there in the background, the activity log
    // is the result), and the run stops taking new events after RUN_BUDGET_MS
    // so the function never dies mid-batch with events half-done. Before this
    // the dispatcher awaited every slow skill in sequence, was killed by the
    // wall clock, left events unmarked, re-fired the same ones every minute
    // and never reached new mail (Resta, 2026-09-04).
    const startedAt = Date.now();
    for (const ev of events) {
      if (Date.now() - startedAt > RUN_BUDGET_MS) break;
      // deno-lint-ignore no-explicit-any
      const matchingAutos: any[] = ((automations || []) as any[]).filter((a: any) => {
        const cfg = a.trigger_config as any;
        const cfgEvent = cfg?.event_name ?? cfg?.event;
        return cfgEvent && cfgEvent === ev.event_name;
      });
      // Claim. No row back = someone else took it in the meantime.
      const { data: claimed, error: claimErr } = await supabase
        .from("agent_events")
        .update({ processed_at: new Date().toISOString(), processed_count: matchingAutos.length })
        .eq("id", ev.id)
        .is("processed_at", null)
        .select("id");
      if (claimErr) { console.error(`event-dispatcher: claim failed for ${ev.id}:`, claimErr.message); continue; }
      if (!claimed || claimed.length === 0) continue;

      // deno-lint-ignore no-explicit-any
      const runnable: any[] = [];
      for (const auto of matchingAutos) {
        const executor = (auto.executor || "platform") as "platform" | "flowpilot" | "openclaw" | "external";
        if (executor === "openclaw" || executor === "external") continue;
        if (executor === "flowpilot" && !(await isFlowpilotOn())) continue;
        runnable.push(auto);
      }

      const settled = await Promise.allSettled(runnable.map(async (auto: any) => {
        const executor = (auto.executor || "platform") as string;
        const resp = await fetch(`${supabaseUrl}/functions/v1/agent-execute`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${serviceKey}` },
          body: JSON.stringify({
            skill_id: auto.skill_id,
            skill_name: auto.skill_name,
            arguments: resolveTemplates(auto.skill_arguments || {}, {
              name: ev.event_name, payload: ev.payload, source: ev.source, id: ev.id,
            }) as Record<string, unknown>,
            agent_type: executor === "flowpilot" ? "flowpilot" : "platform",
            async: true,
          }),
          signal: AbortSignal.timeout(15_000),
        });
        const out = await resp.json().catch(() => ({}));
        const err = !resp.ok ? (out.error || `HTTP ${resp.status}`) : (out.error || null);
        const { error: bumpErr } = await supabase
          .from("agent_automations")
          .update({ last_triggered_at: new Date().toISOString(), run_count: (auto.run_count || 0) + 1, last_error: err })
          .eq("id", auto.id);
        if (bumpErr) console.error(`event-dispatcher: could not bump ${auto.name}:`, bumpErr.message);
        if (err) throw new Error(`${auto.name}: ${err}`);
        return auto.name;
      }));

      const errs = settled.filter((r: PromiseSettledResult<string>): r is PromiseRejectedResult => r.status === "rejected").map((r: PromiseRejectedResult) => (r.reason as Error).message);
      const fired = settled.filter((r: PromiseSettledResult<string>) => r.status === "fulfilled").length;
      if (errs.length) {
        const { error: noteErr } = await supabase.from("agent_events").update({ last_error: errs.join(" | ") }).eq("id", ev.id);
        if (noteErr) console.error(`event-dispatcher: could not note errors on ${ev.id}:`, noteErr.message);
      }
      results.push({ event_id: ev.id, event_name: ev.event_name, matched: matchingAutos.length, fired, errors: errs });
    }
    const totalFired = results.reduce((s, r) => s + r.fired, 0);
    console.log(
      `event-dispatcher: processed ${events.length} events, fired ${totalFired} automations`,
    );

    return new Response(
      JSON.stringify({
        processed: events.length,
        fired: totalFired,
        results,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("event-dispatcher error:", err);
    return new Response(
      JSON.stringify({ error: (err as Error).message || "Internal error" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});
