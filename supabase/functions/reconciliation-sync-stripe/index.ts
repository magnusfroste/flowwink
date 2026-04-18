// Sync Stripe payouts and balance transactions into bank_transactions.
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import Stripe from "https://esm.sh/stripe@14.21.0?target=deno";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
    if (!stripeKey) {
      return new Response(JSON.stringify({ error: "STRIPE_SECRET_KEY not configured" }), {
        status: 503,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const stripe = new Stripe(stripeKey, { apiVersion: "2024-06-20" });
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Create batch
    const { data: batch, error: batchErr } = await supabase
      .from("bank_import_batches")
      .insert({ source: "stripe", status: "processing" })
      .select()
      .single();
    if (batchErr) throw batchErr;

    // Pull last 30 days of payouts
    const since = Math.floor(Date.now() / 1000) - 30 * 24 * 3600;
    const payouts = await stripe.payouts.list({ created: { gte: since }, limit: 100 });

    let imported = 0;
    let skipped = 0;
    for (const p of payouts.data) {
      const row = {
        batch_id: batch.id,
        source: "stripe" as const,
        external_id: p.id,
        transaction_date: new Date(p.arrival_date * 1000).toISOString().slice(0, 10),
        value_date: new Date(p.created * 1000).toISOString().slice(0, 10),
        amount_cents: p.amount,
        currency: p.currency.toUpperCase(),
        counterparty: "Stripe Payout",
        reference: p.id,
        description: p.description || `Payout ${p.id}`,
        raw_data: p as unknown as Record<string, unknown>,
      };
      const { error } = await supabase.from("bank_transactions").upsert(row, {
        onConflict: "source,external_id",
        ignoreDuplicates: true,
      });
      if (error) {
        console.error("[reconciliation-sync-stripe] upsert error", error);
        skipped++;
      } else {
        imported++;
      }
    }

    await supabase
      .from("bank_import_batches")
      .update({ imported_count: imported, skipped_count: skipped, status: "completed" })
      .eq("id", batch.id);

    return new Response(JSON.stringify({ success: true, imported, skipped, batch_id: batch.id }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    console.error("[reconciliation-sync-stripe] error", e);
    return new Response(JSON.stringify({ success: false, error: e.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
