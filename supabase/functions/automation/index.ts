// Automation — unified event-dispatch + cron-dispatch
// Actions: event-dispatch, cron-dispatch
import { getServiceClient } from '../_shared/supabase-clients.ts';

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const BATCH_SIZE = 100;

// ─── Cron parser (from automation-dispatcher) ───────────────────────────────
function calculateNextRun(cronExpr?: string, from?: Date): string {
  if (!cronExpr) return new Date(Date.now() + 60 * 60 * 1000).toISOString();
  const parts = cronExpr.trim().split(/\s+/);
  if (parts.length < 5) return new Date(Date.now() + 60 * 60 * 1000).toISOString();
  const [minute, hour, dayOfMonth, month, dayOfWeek] = parts;
  const now = from || new Date();
  if (minute.startsWith("*/") && hour === "*") { const i = parseInt(minute.replace("*/", ""), 10) || 5; return new Date(now.getTime() + i * 60 * 1000).toISOString(); }
  if (hour.startsWith("*/")) { const i = parseInt(hour.replace("*/", ""), 10) || 1; return new Date(now.getTime() + i * 60 * 60 * 1000).toISOString(); }
  if (dayOfMonth === "*" && month === "*" && dayOfWeek === "*" && !minute.includes("*") && !hour.includes("*")) {
    const d = new Date(now); d.setUTCHours(parseInt(hour, 10), parseInt(minute, 10), 0, 0); if (d <= now) d.setUTCDate(d.getUTCDate() + 1); return d.toISOString();
  }
  if (dayOfMonth === "*" && month === "*" && dayOfWeek !== "*" && !minute.includes("*") && !hour.includes("*")) {
    const td = parseInt(dayOfWeek, 10); const d = new Date(now); d.setUTCHours(parseInt(hour, 10), parseInt(minute, 10), 0, 0); let da = td - now.getUTCDay(); if (da < 0 || (da === 0 && d <= now)) da += 7; d.setUTCDate(d.getUTCDate() + da); return d.toISOString();
  }
  return new Date(now.getTime() + 60 * 60 * 1000).toISOString();
}

// ─── Action: event-dispatch ──────────────────────────────────────────────────
async function handleEventDispatch(req: Request): Promise<Response> {
  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = getServiceClient();

  const { data: events, error: eventsErr } = await supabase.from("agent_events").select("*").is("processed_at", null).order("created_at", { ascending: true }).limit(BATCH_SIZE);
  if (eventsErr) throw eventsErr;
  if (!events || events.length === 0) return new Response(JSON.stringify({ processed: 0, fired: 0, results: [] }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });

  const { data: automations, error: autoErr } = await supabase.from("agent_automations").select("*").eq("enabled", true).eq("trigger_type", "event");
  if (autoErr) throw autoErr;

  let flowpilotEnabled: boolean | null = null;
  async function isFlowpilotOn(): Promise<boolean> {
    if (flowpilotEnabled !== null) return flowpilotEnabled;
    const { data: s } = await supabase.from("site_settings").select("value").eq("key", "modules").maybeSingle();
    flowpilotEnabled = (s?.value as any)?.flowpilot?.enabled === true;
    return flowpilotEnabled;
  }

  const results: any[] = [];
  for (const ev of events) {
    const matching = (automations || []).filter((a) => (a.trigger_config as any)?.event_name === ev.event_name);
    const errs: string[] = []; let fired = 0;
    for (const auto of matching) {
      const executor = (auto.executor || "platform");
      if (executor === "openclaw" || executor === "external") continue;
      if (executor === "flowpilot" && !(await isFlowpilotOn())) continue;
      try {
        const resp = await fetch(`${SUPABASE_URL}/functions/v1/agent-execute`, {
          method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${SERVICE_KEY}` },
          body: JSON.stringify({ skill_id: auto.skill_id, skill_name: auto.skill_name, arguments: { ...(auto.skill_arguments || {}), event: { name: ev.event_name, payload: ev.payload, source: ev.source, id: ev.id } }, agent_type: executor === "flowpilot" ? "flowpilot" : "platform" }),
        });
        const out = await resp.json().catch(() => ({}));
        if (!resp.ok || out.error) errs.push(`${auto.name}: ${out.error || `HTTP ${resp.status}`}`); else fired += 1;
        await supabase.from("agent_automations").update({ last_triggered_at: new Date().toISOString(), run_count: (auto.run_count || 0) + 1, last_error: !resp.ok || out.error ? (out.error || `HTTP ${resp.status}`) : null }).eq("id", auto.id);
      } catch (e) { errs.push(`${auto.name}: ${(e as Error).message}`); }
    }
    await supabase.from("agent_events").update({ processed_at: new Date().toISOString(), processed_count: matching.length, last_error: errs.length ? errs.join(" | ") : null }).eq("id", ev.id);
    results.push({ event_id: ev.id, event_name: ev.event_name, matched: matching.length, fired, errors: errs });
  }

  return new Response(JSON.stringify({ processed: events.length, fired: results.reduce((s, r) => s + r.fired, 0), results }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

// ─── Action: cron-dispatch ───────────────────────────────────────────────────
async function handleCronDispatch(req: Request): Promise<Response> {
  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = getServiceClient();
  const now = new Date().toISOString();

  const { data: dueAutomations, error: qe } = await supabase.from("agent_automations").select("*").eq("enabled", true).eq("trigger_type", "cron").or(`next_run_at.lte.${now},next_run_at.is.null`);
  if (qe) throw qe;

  const results: any[] = [];
  for (const auto of (dueAutomations || [])) {
    if (!auto.next_run_at) {
      const cronExpr = (auto.trigger_config as any)?.expression || (auto.trigger_config as any)?.cron;
      await supabase.from("agent_automations").update({ next_run_at: calculateNextRun(cronExpr) }).eq("id", auto.id);
      results.push({ id: auto.id, name: auto.name, status: "initialized", type: "automation" }); continue;
    }
    const executor = (auto.executor || "platform");
    if (executor === "openclaw" || executor === "external") { results.push({ id: auto.id, name: auto.name, status: "skipped_external", type: "automation" }); continue; }
    if (executor === "flowpilot") {
      const { data: s } = await supabase.from("site_settings").select("value").eq("key", "modules").maybeSingle();
      if ((s?.value as any)?.flowpilot?.enabled !== true) {
        const cronExpr = (auto.trigger_config as any)?.expression || (auto.trigger_config as any)?.cron;
        await supabase.from("agent_automations").update({ next_run_at: calculateNextRun(cronExpr) }).eq("id", auto.id);
        results.push({ id: auto.id, name: auto.name, status: "skipped_module_off", type: "automation" }); continue;
      }
    }
    let status = "success"; let lastError: string | null = null;
    const agentTag = executor === "flowpilot" ? "flowpilot" : auto.trigger_type === "cron" ? "cron" : "automation";
    try {
      const r = await fetch(`${SUPABASE_URL}/functions/v1/agent-execute`, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${SERVICE_KEY}` }, body: JSON.stringify({ skill_id: auto.skill_id, skill_name: auto.skill_name, arguments: auto.skill_arguments || {}, agent_type: agentTag }) });
      const jr = await r.json(); if (!r.ok || jr.error) { status = "failed"; lastError = jr.error || `HTTP ${r.status}`; }
    } catch (e) { status = "failed"; lastError = (e as Error).message; }
    const cronExpr = (auto.trigger_config as any)?.expression || (auto.trigger_config as any)?.cron;
    await supabase.from("agent_automations").update({ last_triggered_at: now, next_run_at: calculateNextRun(cronExpr), run_count: (auto.run_count || 0) + 1, last_error: lastError }).eq("id", auto.id);
    results.push({ id: auto.id, name: auto.name, status, type: "automation", error: lastError ?? undefined });
  }

  // Also execute due cron workflows
  const { data: dueWorkflows } = await supabase.from("agent_workflows").select("*").eq("enabled", true).eq("trigger_type", "cron");
  for (const wf of (dueWorkflows || [])) {
    const cronExpr = (wf.trigger_config as any)?.expression || (wf.trigger_config as any)?.cron;
    if (!cronExpr) continue;
    const nextRun = wf.last_run_at ? calculateNextRun(cronExpr, new Date(wf.last_run_at)) : new Date(0).toISOString();
    if (new Date(nextRun) > new Date(now)) continue;
    let status = "success"; let lastError: string | null = null;
    try {
      const steps = (wf.steps as any[]) || []; let ctx: Record<string, unknown> = {};
      for (const step of steps) {
        const sr = await fetch(`${SUPABASE_URL}/functions/v1/agent-execute`, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${SERVICE_KEY}` }, body: JSON.stringify({ skill_name: step.skill_name, arguments: { ...step.arguments, ...ctx }, agent_type: "automation" }) });
        const jr = await sr.json(); if (!sr.ok || jr.error) { if (step.on_failure === "stop") throw new Error(`Step '${step.name}' failed`); } else { ctx[step.id] = jr; }
      }
    } catch (e) { status = "failed"; lastError = (e as Error).message; }
    await supabase.from("agent_workflows").update({ last_run_at: now, run_count: (wf.run_count || 0) + 1, last_error: lastError }).eq("id", wf.id);
    results.push({ id: wf.id, name: wf.name, status, type: "workflow", error: lastError ?? undefined });
  }

  return new Response(JSON.stringify({ dispatched: results.length, results }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

// ─── Router ──────────────────────────────────────────────────────────────────
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const url = new URL(req.url);
    let action = url.searchParams.get("action");
    if (!action) { try { action = (await req.json()).action; } catch { /* */ } }
    switch (action) {
      case "event-dispatch": return await handleEventDispatch(req);
      case "cron-dispatch": return await handleCronDispatch(req);
      default: return new Response(JSON.stringify({ error: "Unknown action. Use: event-dispatch, cron-dispatch" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
  } catch (e) { return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Internal error" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }); }
});
