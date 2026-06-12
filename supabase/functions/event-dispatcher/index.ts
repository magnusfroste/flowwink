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

const BATCH_SIZE = 100;

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
    for (const ev of events) {
      const matchingAutos = (automations || []).filter((a) => {
        // Seeds write {event: ...}; older docs said {event_name: ...} — accept both.
        // (Before this fix NO event automation ever matched: seeds and matcher
        // disagreed on the key, silently disabling the event→automation path.)
        const cfg = a.trigger_config as any;
        const cfgEvent = cfg?.event_name ?? cfg?.event;
        return cfgEvent && cfgEvent === ev.event_name;
      });

      const errs: string[] = [];
      let fired = 0;

      for (const auto of matchingAutos) {
        const executor = (auto.executor || "platform") as
          | "platform"
          | "flowpilot"
          | "openclaw"
          | "external";

        // External operators consume events through their own pollers
        if (executor === "openclaw" || executor === "external") continue;

        if (executor === "flowpilot") {
          const on = await isFlowpilotOn();
          if (!on) continue;
        }

        try {
          const resp = await fetch(
            `${supabaseUrl}/functions/v1/agent-execute`,
            {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${serviceKey}`,
              },
              body: JSON.stringify({
                skill_id: auto.skill_id,
                skill_name: auto.skill_name,
                // {{event...}} templates resolved against the event; the raw event
                // object is NOT injected (it broke the rpc p_-prefix mapping as
                // p_event and no RPC accepts it — payload access is via templates).
                arguments: resolveTemplates(auto.skill_arguments || {}, {
                  name: ev.event_name,
                  payload: ev.payload,
                  source: ev.source,
                  id: ev.id,
                }) as Record<string, unknown>,
                agent_type: executor === "flowpilot" ? "flowpilot" : "platform",
              }),
            },
          );

          const out = await resp.json().catch(() => ({}));
          const innerError = out?.result?.error || (out?.result?.status === 'failed' ? 'skill failed' : null);
          if (!resp.ok || out.error || innerError) {
            errs.push(
              `${auto.name}: ${out.error || innerError || `HTTP ${resp.status}`}`,
            );
          } else {
            fired += 1;
          }

          // Bump automation metadata
          await supabase
            .from("agent_automations")
            .update({
              last_triggered_at: new Date().toISOString(),
              run_count: (auto.run_count || 0) + 1,
              last_error: !resp.ok || out.error
                ? (out.error || `HTTP ${resp.status}`)
                : null,
            })
            .eq("id", auto.id);
        } catch (e) {
          errs.push(`${auto.name}: ${(e as Error).message}`);
        }
      }

      // Mark event processed
      await supabase
        .from("agent_events")
        .update({
          processed_at: new Date().toISOString(),
          processed_count: matchingAutos.length,
          last_error: errs.length ? errs.join(" | ") : null,
        })
        .eq("id", ev.id);

      results.push({
        event_id: ev.id,
        event_name: ev.event_name,
        matched: matchingAutos.length,
        fired,
        errors: errs,
      });
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
