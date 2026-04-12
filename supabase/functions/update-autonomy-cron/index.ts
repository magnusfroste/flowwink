import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

/**
 * Update Autonomy Cron — Re-registers pg_cron jobs based on admin schedule settings.
 * Reads autonomy_schedule from site_settings, converts local hours to UTC,
 * and updates cron jobs via schedule_cron_job/unschedule_cron_job DB functions.
 */

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

/**
 * Convert a local hour to UTC hour using Intl.DateTimeFormat.
 * Uses a stable reference date (Jan 15) to get standard offset, 
 * and Jul 15 for DST offset — picks whichever is "current".
 */
function localHourToUtc(localHour: number, timezone: string): number {
  try {
    // Use current date to get the correct offset (handles DST automatically)
    const now = new Date();
    const year = now.getUTCFullYear();
    const month = now.getUTCMonth();
    const day = now.getUTCDate();

    // Create a date at noon UTC to avoid date boundary issues
    const ref = new Date(Date.UTC(year, month, day, 12, 0, 0));
    
    // Get UTC hour and local hour at the same instant
    const utcFormatter = new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', hour: 'numeric', hour12: false });
    const localFormatter = new Intl.DateTimeFormat('en-US', { timeZone: timezone, hour: 'numeric', hour12: false });
    
    const refUtcHour = parseInt(utcFormatter.format(ref), 10);
    const refLocalHour = parseInt(localFormatter.format(ref), 10);
    
    // offset = how many hours ahead local is from UTC
    const offset = refLocalHour - refUtcHour;
    
    let utcHour = (localHour - offset) % 24;
    if (utcHour < 0) utcHour += 24;
    return utcHour;
  } catch {
    // Fallback: assume UTC
    return localHour;
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY") || Deno.env.get("SUPABASE_PUBLISHABLE_KEY") || "";
  const supabase = createClient(supabaseUrl, serviceKey);

  try {
    // 1. Read autonomy_schedule from site_settings
    const { data: settingsRow } = await supabase
      .from("site_settings")
      .select("value")
      .eq("key", "autonomy_schedule")
      .maybeSingle();

    const settings = (settingsRow?.value as any) || {
      timezone: "Europe/Stockholm",
      heartbeatEnabled: true,
      heartbeatHours: [0, 12],
      briefingEnabled: true,
      briefingHour: 8,
      learnEnabled: true,
      learnHour: 3,
    };

    const tz = settings.timezone || "UTC";
    const authHeader = JSON.stringify({
      "Content-Type": "application/json",
      "Authorization": `Bearer ${anonKey}`,
    });

    const results: Record<string, string> = {};

    // 2. Heartbeat
    if (settings.heartbeatEnabled && settings.heartbeatHours?.length) {
      const utcHours = (settings.heartbeatHours as number[]).map((h) => localHourToUtc(h, tz));
      const cronExpr = `0 ${utcHours.join(",")} * * *`;

      const { error } = await supabase.rpc("schedule_cron_job", {
        p_jobname: "flowpilot-heartbeat",
        p_schedule: cronExpr,
        p_url: `${supabaseUrl}/functions/v1/flowpilot-heartbeat`,
        p_headers: authHeader,
        p_body: JSON.stringify({ time: new Date().toISOString() }),
      });
      results.heartbeat = error ? `error: ${error.message}` : `${cronExpr} (local ${settings.heartbeatHours.join(",")}:00 ${tz})`;
    } else {
      await supabase.rpc("unschedule_cron_job", { p_jobname: "flowpilot-heartbeat" });
      results.heartbeat = "disabled";
    }

    // 3. Briefing
    if (settings.briefingEnabled) {
      const utcHour = localHourToUtc(settings.briefingHour, tz);
      const { error } = await supabase.rpc("schedule_cron_job", {
        p_jobname: "flowpilot-daily-briefing",
        p_schedule: `0 ${utcHour} * * *`,
        p_url: `${supabaseUrl}/functions/v1/flowpilot-briefing`,
        p_headers: authHeader,
        p_body: JSON.stringify({ source: "cron" }),
      });
      results.briefing = error ? `error: ${error.message}` : `0 ${utcHour} * * * (local ${settings.briefingHour}:00 ${tz})`;
    } else {
      await supabase.rpc("unschedule_cron_job", { p_jobname: "flowpilot-daily-briefing" });
      results.briefing = "disabled";
    }

    // 4. Learn
    if (settings.learnEnabled) {
      const utcHour = localHourToUtc(settings.learnHour, tz);
      const { error } = await supabase.rpc("schedule_cron_job", {
        p_jobname: "flowpilot-learn",
        p_schedule: `0 ${utcHour} * * *`,
        p_url: `${supabaseUrl}/functions/v1/flowpilot-learn`,
        p_headers: authHeader,
        p_body: JSON.stringify({ time: new Date().toISOString() }),
      });
      results.learn = error ? `error: ${error.message}` : `0 ${utcHour} * * * (local ${settings.learnHour}:00 ${tz})`;
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
});
