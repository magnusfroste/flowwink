// Signals — unified ingest + dispatch (signal-ingest called signal-dispatcher via fetch)
// Actions: ingest, dispatch
import { getServiceClient } from '../_shared/supabase-clients.ts';

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-signal-token, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// ─── Condition evaluator (from signal-dispatcher) ────────────────────────────
function evaluateCondition(condition: Record<string, unknown>, data: Record<string, unknown>): boolean {
  if (condition.min_score !== undefined) return ((data.score as number) || 0) >= (condition.min_score as number);
  if (condition.min_count !== undefined) return ((data.count as number) || 0) >= (condition.min_count as number);
  if (condition.to !== undefined) {
    const matchesTo = data.new_status === condition.to || data.status === condition.to;
    if (condition.from) return matchesTo && (data.old_status === condition.from || data.previous_status === condition.from);
    return matchesTo;
  }
  if (condition.field && condition.operator) {
    const fv = data[condition.field as string]; const tv = condition.value;
    switch (condition.operator) {
      case 'eq': return fv === tv; case 'neq': return fv !== tv;
      case 'gt': return (fv as number) > (tv as number); case 'gte': return (fv as number) >= (tv as number);
      case 'lt': return (fv as number) < (tv as number); case 'lte': return (fv as number) <= (tv as number);
      case 'contains': return typeof fv === 'string' && fv.includes(tv as string);
      case 'in': return Array.isArray(tv) && tv.includes(fv);
      default: return false;
    }
  }
  if (Array.isArray(condition.all)) return condition.all.every((c: any) => evaluateCondition(c, data));
  if (Array.isArray(condition.any)) return condition.any.some((c: any) => evaluateCondition(c, data));
  return false;
}

// ─── Action: dispatch ────────────────────────────────────────────────────────
async function handleDispatch(req: Request): Promise<Response> {
  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = getServiceClient();

  try {
    const { signal, data, context } = await req.json();
    if (!signal || !data) return new Response(JSON.stringify({ error: "signal and data required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const { data: signalAutomations, error: queryError } = await supabase.from("agent_automations").select("*").eq("enabled", true).eq("trigger_type", "signal");
    if (queryError) throw queryError;

    const matching = (signalAutomations || []).filter((auto: any) => {
      const config = auto.trigger_config || {};
      if (config.signal !== signal) return false;
      return evaluateCondition(config.condition || {}, data);
    });

    if (matching.length === 0) return new Response(JSON.stringify({ signal, matched: 0, dispatched: 0 }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const results: any[] = [];
    await Promise.all(matching.map(async (auto: any) => {
      let status = "success"; let lastError: string | null = null;
      try {
        const execRes = await fetch(`${SUPABASE_URL}/functions/v1/agent-execute`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${SERVICE_KEY}` },
          body: JSON.stringify({ skill_id: auto.skill_id, skill_name: auto.skill_name, arguments: { ...auto.skill_arguments, signal_data: data, signal_context: context || {}, signal_name: signal }, agent_type: "flowpilot" }),
        });
        const execResult = await execRes.json();
        if (!execRes.ok || execResult.error) { status = "failed"; lastError = execResult.error || `HTTP ${execRes.status}`; }
      } catch (err: any) { status = "failed"; lastError = err.message || "Execution error"; }
      const { data: current } = await supabase.from("agent_automations").select("run_count").eq("id", auto.id).single();
      await supabase.from("agent_automations").update({ last_triggered_at: new Date().toISOString(), run_count: (current?.run_count || 0) + 1, last_error: lastError }).eq("id", auto.id);
      results.push({ id: auto.id, name: auto.name, status, error: lastError ?? undefined });
    }));

    return new Response(JSON.stringify({ signal, matched: matching.length, dispatched: results.length, results }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message || "Internal error" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
}

// ─── Action: ingest ──────────────────────────────────────────────────────────
async function handleIngest(req: Request): Promise<Response> {
  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") || "";
  const PUBLISHABLE_KEY = Deno.env.get("SUPABASE_PUBLISHABLE_KEY") || "";
  const supabase = getServiceClient();

  const signalToken = req.headers.get("x-signal-token");
  const authHeader = req.headers.get("Authorization");
  const token = signalToken?.trim() || (authHeader?.startsWith("Bearer ") ? authHeader.replace("Bearer ", "").trim() : "");
  if (!token) return new Response(JSON.stringify({ ok: false, error: "Missing token" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  let authorized = (ANON_KEY && token === ANON_KEY) || (PUBLISHABLE_KEY && token === PUBLISHABLE_KEY);
  if (!authorized) {
    const { data: tokenSetting } = await supabase.from("site_settings").select("value").eq("key", "signal_ingest_token").maybeSingle();
    authorized = !!(tokenSetting?.value as any)?.token && (tokenSetting?.value as any)?.token === token;
  }
  if (!authorized) return new Response(JSON.stringify({ ok: false, error: "Invalid token" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  const body = await req.json();
  const url = typeof body.url === "string" ? body.url.trim().slice(0, 2048) : "";
  const title = typeof body.title === "string" ? body.title.trim().slice(0, 500) : "";
  const content = typeof body.content === "string" ? body.content.trim().slice(0, 10000) : "";
  const rawNote = typeof body.note === "string" ? body.note.trim().slice(0, 1000) : "";
  const sourceType = typeof body.source_type === "string" ? body.source_type.trim().slice(0, 50) : "web";
  if (!url && !content) return new Response(JSON.stringify({ ok: false, error: "Either url or content is required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  let action = "signal"; let cleanNote = rawNote;
  if (rawNote.startsWith("[ACTION:draft]")) { action = "draft"; cleanNote = rawNote.replace("[ACTION:draft]", "").trim(); }
  else if (rawNote.startsWith("[ACTION:bookmark]")) { action = "bookmark"; cleanNote = rawNote.replace("[ACTION:bookmark]", "").trim(); }

  const signalData = { url, title: title || url, content, note: cleanNote, source_type: sourceType, action, captured_at: new Date().toISOString() };
  const results: Record<string, any> = {};

  if (action === "bookmark") {
    await supabase.from("agent_memory").upsert({ key: `bookmark:${url || Date.now()}`, value: signalData, category: "context" as any, created_by: "flowpilot" as any }, { onConflict: "key" });
    results.memory_key = `bookmark:${url || Date.now()}`;
  }

  if (action === "draft" && title) {
    const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
    const { data: post } = await supabase.from("blog_posts").insert({ title, slug: `signal-${slug}-${Date.now()}`, status: "draft", excerpt: cleanNote || `Captured from ${sourceType}: ${url}`, meta_json: { signal_source: sourceType, signal_url: url, generated_by: "signal-ingest" } }).select("id").single();
    results.draft_id = post?.id;
  }

  const { data: activity, error: insertError } = await supabase.from("agent_activity").insert({ agent: "flowpilot", skill_name: `signal_ingest:${action}`, input: signalData, output: results, status: "success" }).select("id").single();
  if (insertError) return new Response(JSON.stringify({ ok: false, error: "Failed to save signal" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  if (action === "signal") {
    await supabase.from("agent_memory").insert({ key: `signal:${activity.id.slice(0, 8)}`, value: { url, title, content: content.slice(0, 500), note: cleanNote, source_type: sourceType, ingested_at: new Date().toISOString() }, category: "context" as any, created_by: "flowpilot" as any });
  }

  // Dispatch signal internally (no HTTP fetch needed)
  try {
    const urgency = (body.urgency as string) || 'medium';
    await handleDispatchInternal(supabase, SUPABASE_URL, SERVICE_KEY, { signal: "signal_ingested", data: { ...signalData, activity_id: activity.id, urgency }, context: { entity_type: "signal", entity_id: activity.id } });
  } catch (dispatchErr: any) { console.error("[signals] Dispatch error:", dispatchErr); }

  return new Response(JSON.stringify({ ok: true, id: activity.id, action, ...results }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

async function handleDispatchInternal(supabase: any, SUPABASE_URL: string, SERVICE_KEY: string, payload: any): Promise<void> {
  const { signal, data, context } = payload;
  const { data: signalAutomations } = await supabase.from("agent_automations").select("*").eq("enabled", true).eq("trigger_type", "signal");
  const matching = (signalAutomations || []).filter((auto: any) => {
    const config = auto.trigger_config || {};
    if (config.signal !== signal) return false;
    return evaluateCondition(config.condition || {}, data);
  });
  if (matching.length === 0) return;
  await Promise.all(matching.map(async (auto: any) => {
    try {
      await fetch(`${SUPABASE_URL}/functions/v1/agent-execute`, {
        method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${SERVICE_KEY}` },
        body: JSON.stringify({ skill_id: auto.skill_id, skill_name: auto.skill_name, arguments: { ...auto.skill_arguments, signal_data: data, signal_context: context || {}, signal_name: signal }, agent_type: "flowpilot" }),
      });
    } catch { /* fire-and-forget */ }
  }));
}

// ─── Router ──────────────────────────────────────────────────────────────────
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const url = new URL(req.url);
    let action = url.searchParams.get("action");
    if (!action) { try { action = (await req.json()).action; } catch { /* */ } }
    switch (action) {
      case "ingest": return await handleIngest(req);
      case "dispatch": return await handleDispatch(req);
      default: return new Response(JSON.stringify({ error: "Unknown action. Use: ingest, dispatch" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message || "Internal error" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
