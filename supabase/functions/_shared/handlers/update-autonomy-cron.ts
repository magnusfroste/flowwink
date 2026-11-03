import { loadHomeCached } from '../locale/load-home.ts';
import { LOCAL_HOUR_CRON } from '../locale/local-hour-gate.ts';
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getServiceClient } from '../supabase-clients.ts';

/**
 * Update Autonomy Cron — Re-registers pg_cron jobs based on admin schedule settings.
 * Reads autonomy_schedule from site_settings and registers each job every half
 * hour with its LOCAL hours in the body; the function itself runs only when the
 * business's clock shows one of them (_shared/locale/local-hour-gate.ts), so
 * DST and half-hour zones never shift it.
 */

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// Moved VERBATIM from supabase/functions/update-autonomy-cron/index.ts (edge-surface B1b).
// Kept as a Request→Response handler; agent-execute adapts args↔Request via
// callResponseHandler — zero body changes.
export async function handler(req: Request): Promise<Response> {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  // The jobs post to flowpilot-heartbeat and flowpilot-lifecycle, both of which
  // authenticate the caller in-body (service role or admin). The publishable
  // key is public, so a job carrying it is refused — and until 2026-10-30 the
  // heartbeat accepted anyone, which is why nobody noticed. A fork whose edge
  // runtime lacks the service key keeps the old behaviour and the heartbeat's
  // 401 names the fix.
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  const anonKey = serviceKey || Deno.env.get("SUPABASE_ANON_KEY") || Deno.env.get("SUPABASE_PUBLISHABLE_KEY") || "";
  const supabase = getServiceClient();

  try {
    // 1. Read autonomy_schedule from site_settings
    const { data: settingsRow } = await supabase
      .from("site_settings")
      .select("value")
      .eq("key", "autonomy_schedule")
      .maybeSingle();

    const settings = (settingsRow?.value as any) || {
      timezone: null,
      heartbeatEnabled: true,
      heartbeatHours: [0, 12],
      briefingEnabled: true,
      briefingHour: 8,
      learnEnabled: true,
      learnHour: 3,
    };

    // The business's clock — one zone for the whole business. The schedule's
    // own `timezone` is retired: a default of Europe/Stockholm in it ran
    // FlowPilot on Swedish time for businesses elsewhere.
    const tz = (await loadHomeCached(supabase)).timeZone;
    const authHeader = JSON.stringify({
      "Content-Type": "application/json",
      "Authorization": `Bearer ${anonKey}`,
    });

    const results: Record<string, string> = {};

    // 2. Heartbeat
    if (settings.heartbeatEnabled && settings.heartbeatHours?.length) {
      const cronExpr = LOCAL_HOUR_CRON;

      const { error } = await supabase.rpc("schedule_cron_job", {
        p_jobname: "flowpilot-heartbeat",
        p_schedule: cronExpr,
        p_url: `${supabaseUrl}/functions/v1/flowpilot-heartbeat`,
        p_headers: authHeader,
        p_body: JSON.stringify({ local_hours: settings.heartbeatHours }),
      });
      results.heartbeat = error ? `error: ${error.message}` : `${cronExpr} (local ${settings.heartbeatHours.join(",")}:00 ${tz})`;
    } else {
      await supabase.rpc("unschedule_cron_job", { p_jobname: "flowpilot-heartbeat" });
      results.heartbeat = "disabled";
    }

    // 3. Briefing — handled by the platform automation "Daily Briefing"
    //    (executor=platform, trigger_type=cron) via automation-dispatcher.
    //    pg_cron path is intentionally removed to prevent duplicate posts.
    await supabase.rpc("unschedule_cron_job", { p_jobname: "flowpilot-daily-briefing" });
    results.briefing = "managed by automation-dispatcher";


    // 4. Learn
    if (settings.learnEnabled) {
      const { error } = await supabase.rpc("schedule_cron_job", {
        p_jobname: "flowpilot-learn",
        p_schedule: LOCAL_HOUR_CRON,
        p_url: `${supabaseUrl}/functions/v1/flowpilot-lifecycle?task=learn`,
        p_headers: authHeader,
        p_body: JSON.stringify({ local_hours: [settings.learnHour] }),
      });
      results.learn = error ? `error: ${error.message}` : `${LOCAL_HOUR_CRON} (local ${settings.learnHour}:00 ${tz})`;
    } else {
      await supabase.rpc("unschedule_cron_job", { p_jobname: "flowpilot-learn" });
      results.learn = "disabled";
    }

    console.log("[update-autonomy-cron] Results:", results);

    return new Response(
      JSON.stringify({ success: true, results, timezone: tz }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    console.error("[update-autonomy-cron] Error:", err);
    return new Response(
      JSON.stringify({ error: err.message || "Internal error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
}
