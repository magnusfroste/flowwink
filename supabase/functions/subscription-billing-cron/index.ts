// Daily cron — generates invoices for all manual (invoice-driven) subscriptions
// whose next_invoice_date <= today. Stripe subscriptions are NOT touched —
// Stripe bills them via its own scheduler.
import { createClient } from "npm:@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    { auth: { persistSession: false } },
  );

  try {
    const today = new Date().toISOString().slice(0, 10);

    // 1) Convert trials whose trial_end has passed (manual + auto_finalize only).
    //    Safe to run every day; the RPC scopes itself.
    const { data: trialResult, error: trialErr } = await supabase.rpc("run_trial_conversions");
    if (trialErr) {
      console.warn("[subscription-billing-cron] run_trial_conversions failed:", trialErr.message);
    }



    const { data: due, error } = await supabase
      .from("subscriptions")
      .select("id, customer_email, product_name, unit_amount_cents, next_invoice_date")
      .eq("provider", "manual")
      .eq("status", "active")
      .lte("next_invoice_date", today)
      .limit(500);

    if (error) throw error;

    const results: Array<{ subscription_id: string; ok: boolean; invoice_id?: string; error?: string }> = [];

    for (const sub of due ?? []) {
      const { data, error: rpcErr } = await supabase.rpc("generate_subscription_invoice", {
        _subscription_id: sub.id,
      });
      if (rpcErr) {
        results.push({ subscription_id: sub.id, ok: false, error: rpcErr.message });
      } else {
        results.push({
          subscription_id: sub.id,
          ok: true,
          invoice_id: (data as any)?.invoice_id,
        });
      }
    }

    return new Response(
      JSON.stringify({
        ok: true,
        run_at: new Date().toISOString(),
        trial_sweep: trialResult ?? null,
        candidates: due?.length ?? 0,
        succeeded: results.filter((r) => r.ok).length,
        failed: results.filter((r) => !r.ok).length,
        results,
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
