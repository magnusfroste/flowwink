// demo-cycle — the nightly rebuild for a demo/sandbox instance.
//
// Two stages, one toggle (site_settings.demo_mode — no-op on customer sites):
//   1. FULL rebuild: reset_sandbox via the skill rail — wipe everything outside
//      the seeded layers, reinstall the configured template, normalize auth to
//      the shared demo admin. This is what makes "testers get full admin" safe:
//      the rebuild is the permission system.
//   2. Scenario data: reset + reseed demo data for every module that HAS a
//      seeder (asked of the database, not carried in a list here), restock.
//
// Body {"skip_rebuild": true} runs stage 2 alone (the pre-2026-08-12 behavior).
// Deploy with --no-verify-jwt and schedule via pg_cron.
import { createClient } from "npm:@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

/**
 * Which modules get demo data.
 *
 * This was a hardcoded five while seed_module_demo had grown to thirty — on a
 * demo whose pitch is "68 modules", twenty-five seeders never ran. So ask the
 * database what it can seed (demo_seedable_modules reads the seeder's own CASE
 * branches) and only remove what the instance has POSITIVELY switched off.
 *
 * The "positively" matters: four seeder names (crm, invoices, kb, vendors) have
 * no identically-named entry in the module settings, so requiring `enabled ===
 * true` would silently drop the demo's most important data. An unrecognised
 * name is seeded, not skipped — the failure mode of the other choice is an
 * empty demo that looks like a broken product.
 */
async function modulesToSeed(supabase: any): Promise<{ seed: string[]; skipped: string[] }> {
  const { data: seedable, error } = await supabase.rpc("demo_seedable_modules");
  const all: string[] = Array.isArray(seedable) && !error && seedable.length
    ? seedable
    // Pre-20260813090000 instances lack the function; the old five keep working.
    : ["crm", "quotes", "invoices", "expenses", "ecommerce"];

  const { data: modSetting } = await supabase
    .from("site_settings").select("value").eq("key", "modules").maybeSingle();
  const modules = (modSetting?.value ?? {}) as Record<string, { enabled?: boolean }>;

  const seed: string[] = [];
  const skipped: string[] = [];
  for (const m of all) {
    if (modules[m] && modules[m].enabled === false) skipped.push(m);
    else seed.push(m);
  }
  return { seed, skipped };
}

/**
 * Supabase returns errors as plain objects, not Error instances, so the usual
 * `String(e)` renders them "[object Object]" — a failure report that reports
 * nothing. Two modules failed that way in the first 30-module run and the
 * output could not say why.
 */
function describeError(e: unknown): string {
  if (e instanceof Error) return e.message;
  if (e && typeof e === "object") {
    const o = e as Record<string, unknown>;
    const parts = [o.message, o.details, o.hint, o.code].filter(Boolean).map(String);
    if (parts.length) return parts.join(" | ");
    try { return JSON.stringify(e); } catch { /* fall through */ }
  }
  return String(e);
}

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

    // FULL rebuild first — the toggle's whole contract (2026-08-12: "allt bör
    // hamna under den toggeln"). Before this, demo-cycle only re-staged module
    // scenario data, so a tester with full admin could repaint pages, settings
    // and users and the damage survived every night. Now the night starts from
    // the template: reset_sandbox (via the skill rail, so it is one
    // implementation and it lands in agent_activity) wipes everything outside
    // the seeded layers and reinstalls the instance's configured template.
    // Failure is reported but does not stop the data cycle below — a sandbox
    // with yesterday's pages but fresh scenario data beats a silent no-op.
    // Body {"skip_rebuild": true} runs the old data-only cycle.
    let rebuild: unknown = { skipped: true };
    const body = await req.json().catch(() => ({}));
    if (body?.skip_rebuild !== true) {
      try {
        const resp = await fetch(
          `${Deno.env.get("SUPABASE_URL")}/functions/v1/agent-execute`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
            },
            body: JSON.stringify({
              skill_name: "reset_sandbox",
              agent_type: "cron",
              arguments: { source: "demo-cycle" },
            }),
          },
        );
        rebuild = resp.ok
          ? await resp.json()
          : { error: `agent-execute answered ${resp.status}` };
      } catch (e) {
        rebuild = { error: describeError(e) };
      }
    }

    const { seed: MODULES, skipped: modulesOff } = await modulesToSeed(supabase);

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
        r.error = describeError(e);
      }
      results[module] = r;
    }

    // Restock so the storefront stock indicators reset between cycles — orders
    // generated by the seeders (and any visitor checkouts) decrement stock via
    // trg_order_item_stock_decrement.
    //
    // Since 20260822120000 this skips any product that has actually received
    // goods, so the `operations` chains' earned balances survive the night.
    // Assigned stock fills in for everything they do not touch.
    //
    // It reports under its own key. Writing to `results.inventory` overwrote
    // the inventory seeder's result from the loop above, so every night's
    // report silently dropped what that module had done.
    try {
      const { data: restock, error: restockErr } = await supabase.rpc("restock_demo_products");
      if (restockErr) throw restockErr;
      (results as any).restock = restock;
    } catch (e) {
      (results as any).restock = { error: describeError(e) };
    }

    return new Response(
      JSON.stringify({
        ok: true,
        started_at: startedAt,
        finished_at: new Date().toISOString(),
        rebuild,
        modules_seeded: MODULES.length,
        modules_skipped_disabled: modulesOff,
        modules: results,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    return new Response(
      JSON.stringify({ ok: false, error: describeError(e) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
