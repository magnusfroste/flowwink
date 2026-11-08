// agent-execute — the HTTP face of the executor.
//
// The request pipeline itself (every gate, the handler dispatch, the envelope,
// the journal) is executeSkillRequest in _shared/execute/core.ts since
// 2026-11-07, so FlowPilot's ReAct loop and the MCP gateway run a skill
// in-process. This function is what the wire still needs: the auth header,
// CORS, the async handoff, and a Response around the outcome. The edge deploy
// bundles the core (and its JSON bundles, which live beside this file) into
// every function that imports it.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { executeSkillRequest, type ExecuteRequest } from '../_shared/execute/core.ts';
import { backgroundErrorText, isRunReportTo, runOutcomeError } from '../_shared/execute/run-outcome.ts';

// Supabase edge runtime: keeps a promise alive after the response is sent.
declare const EdgeRuntime: { waitUntil?: (p: Promise<unknown>) => void } | undefined;

/**
 * The wire's own fields, never part of the request the core runs: `async: true`
 * asks for the 202 handoff; `report_to: { automation_id, event_id }` (service
 * callers) names the automation a background failure is written back to.
 */
type WireRequest = ExecuteRequest & { async?: boolean; report_to?: unknown };

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
});

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabase = createClient(supabaseUrl, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

  try {
    // ─── AUTH GATE ───────────────────────────────────────────────────────
    // agent-execute runs any enabled skill with the service-role client (RLS
    // off) and is deployed --no-verify-jwt, so it MUST authenticate in-body or
    // it is an unauthenticated universal skill executor reachable from the
    // internet. Legitimate callers are exactly two: internal edge functions
    // (mcp-server, voice-ingest, automation-dispatcher, send-webhook,
    // run-autonomy-tests) which send Bearer <service_role key>, and the admin
    // UI which sends the logged-in user's JWT via functions.invoke.
    //
    // AUTHENTICATION happens here (who are you); AUTHORIZATION for JWT callers
    // happens after the skill lookup (may you run THIS skill) — admins run
    // everything, other staff run skills whose owning module their role is
    // granted in role_module_access. Before #102 this gate required admin for
    // every JWT caller, which 401'd module-granted staff out of every skill-
    // backed surface (accounting tabs, staged FlowWork actions, order actions).
    const authHeader = req.headers.get('Authorization') ?? '';
    const bearer = authHeader.replace(/^Bearer\s+/i, '').trim();
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
    let gateUserId: string | null = null;
    let gateIsAdmin = false;
    let isServiceCaller = false;
    if (bearer && serviceKey && bearer === serviceKey) {
      isServiceCaller = true; // trusted internal edge caller
    } else if (bearer && bearer !== anonKey) {
      const { data: userData } = await supabase.auth.getUser(bearer);
      if (userData?.user) {
        gateUserId = userData.user.id;
        const { data: isAdmin } = await supabase.rpc('has_role', { _user_id: gateUserId, _role: 'admin' });
        gateIsAdmin = isAdmin === true;
      }
    }
    if (!isServiceCaller && !gateUserId) {
      return json({ error: 'Unauthorized' }, 401);
    }

    const { report_to: reportTo, ...body }: WireRequest = await req.json();
    // ─── ASYNC HANDOFF ──────────────────────────────────────────────────────
    // A dispatcher must not sit on a 20-second skill (the responder, a send)
    // for every event in its batch: on Resta the event-dispatcher died mid-
    // batch, left events unmarked, re-ran the same ones every minute and never
    // reached new mail (2026-09-04). With async:true the caller gets 202 at
    // once and the skill runs here in the background; the activity log is the
    // result. Only for callers already authenticated above.
    if (body.async === true) {
      const { async: _async, ...rest } = body;
      // The caller got 202 and wrote last_error: null. A failure in the
      // background used to end in the activity log only, so an automation
      // that failed on every event read as healthy (allocate_picking on
      // order.paid, 2026-11-02). With report_to (a service caller's), the
      // failure is written back to the automation that fired the run.
      const report = isServiceCaller && isRunReportTo(reportTo) ? reportTo : null;
      const recordFailure = async (err: string) => {
        if (!report) return;
        const { error: writeErr } = await supabase.from('agent_automations')
          .update({ last_error: backgroundErrorText(err, report) })
          .eq('id', report.automation_id);
        if (writeErr) console.error('[agent-execute] could not record background failure:', writeErr.message);
      };
      const run = fetch(`${supabaseUrl}/functions/v1/agent-execute`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: authHeader },
        body: JSON.stringify(rest),
      }).then(async (r) => {
        const out = await r.json().catch(() => ({ error: `no JSON answer (HTTP ${r.status})` }));
        const err = runOutcomeError(r.ok, r.status, out);
        if (err) await recordFailure(err);
      }).catch(async (e) => {
        console.error('[agent-execute] async handoff failed:', e);
        await recordFailure(`background run ended without an answer: ${(e as Error)?.message ?? String(e)}`);
      });
      if (typeof EdgeRuntime !== 'undefined') EdgeRuntime?.waitUntil?.(run);
      return json({ accepted: true, async: true, skill: rest.skill_name ?? rest.skill_id ?? null, note: 'Running in the background — the activity log carries the result, and a failure lands on the automation named in report_to.' }, 202);
    }

    const out = await executeSkillRequest(body, { isServiceCaller, gateUserId, gateIsAdmin });
    return json(out.body, out.status);
  } catch (err) {
    console.error('agent-execute error:', err);
    return json({ error: (err as Error).message || 'Internal error' }, 500);
  }
});
