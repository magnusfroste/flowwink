// demo-cycle — hourly reset + reseed for the public FlowWink demo instance.
// Wipes only data registered in `demo_run_items` (PROTECTED_TABLES are never
// touched) then re-stages a fresh scenario across the pilot modules.
//
// Gated by site_settings.demo_mode = true so this is a no-op on customer sites.
// Deploy with --no-verify-jwt and schedule via pg_cron.
import { createClient } from "npm:@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const MODULES = ["crm", "quotes", "invoices", "expenses"] as const;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    { auth: { persistSession: false } },
  );

  try {
    // Guardrail: only run when site is explicitly marked as a demo.
    const { data: flag } = await supabase
      .from("site_settings")
      .select("value")
      .eq("key", "demo_mode")
      .maybeSingle();

    const enabled = flag?.value === true || (flag?.value as any)?.enabled === true;
    if (!enabled) {
      return new Response(
        JSON.stringify({ ok: false, skipped: true, reason: "demo_mode not enabled" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const startedAt = new Date().toISOString();
    const results: Record<string, { reset?: unknown; seed?: unknown; error?: string }> = {};

    for (const module of MODULES) {
      const r: { reset?: unknown; seed?: unknown; error?: string } = {};
      try {
        const { data: resetData, error: resetErr } = await supabase.rpc("reset_module_data", {
          p_module: module,
          p_dry_run: false,
          p_run_id: null,
        });
        if (resetErr) throw resetErr;
        r.reset = resetData;

        const { data: seedData, error: seedErr } = await supabase.rpc("seed_module_demo", {
          p_module: module,
          p_scenario: "default",
        });
        if (seedErr) throw seedErr;
        r.seed = seedData;
      } catch (e) {
        r.error = e instanceof Error ? e.message : String(e);
      }
      results[module] = r;
    }

    return new Response(
      JSON.stringify({
        ok: true,
        started_at: startedAt,
        finished_at: new Date().toISOString(),
        modules: results,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    return new Response(
      JSON.stringify({ ok: false, error: e instanceof Error ? e.message : String(e) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
