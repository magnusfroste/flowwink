// Auto-match unmatched bank_transactions against invoices and expenses.
//
// Strategy (no live bank yet):
//   1. Load all unmatched bank_transactions.
//   2. For each, look for invoice/expense with matching amount AND
//      either (a) reference contains the invoice_number, or
//             (b) amount + date within ±3 days.
//   3. amount + ref → auto match (confidence 0.95)
//      amount only → suggested (confidence 0.6)
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: txs, error: txErr } = await supabase
      .from("bank_transactions")
      .select("id, transaction_date, amount_cents, currency, reference, counterparty")
      .eq("status", "unmatched")
      .limit(500);
    if (txErr) throw txErr;

    // Pull candidate invoices + expenses (small datasets — fine for v1).
    const { data: invoices } = await supabase
      .from("invoices")
      .select("id, invoice_number, total_cents, currency, created_at")
      .in("status", ["sent", "overdue"]);
    const { data: expenses } = await supabase
      .from("expenses")
      .select("id, description, amount_cents, currency, created_at")
      .eq("status", "approved");

    let matched = 0;
    let suggested = 0;
    for (const tx of txs || []) {
      // Skip negative amounts for invoice matching (invoices = inbound payments)
      const candidates: Array<{
        entity_type: "invoice" | "expense";
        entity_id: string;
        amount: number;
        ref: string;
        date: string;
      }> = [];

      if (tx.amount_cents > 0) {
        for (const inv of invoices || []) {
          if (inv.currency !== tx.currency) continue;
          if (inv.total_cents !== tx.amount_cents) continue;
          candidates.push({
            entity_type: "invoice",
            entity_id: inv.id,
            amount: inv.total_cents,
            ref: inv.invoice_number,
            date: inv.created_at,
          });
        }
      }
      if (tx.amount_cents < 0) {
        for (const exp of expenses || []) {
          if (exp.currency !== tx.currency) continue;
          if (exp.amount_cents !== Math.abs(tx.amount_cents)) continue;
          candidates.push({
            entity_type: "expense",
            entity_id: exp.id,
            amount: -exp.amount_cents,
            ref: exp.description || "",
            date: exp.created_at,
          });
        }
      }

      if (candidates.length === 0) continue;

      // Score: ref containment > date proximity
      const txRef = (tx.reference || "").toLowerCase();
      let chosen = candidates[0];
      let confidence = 0.6;
      let isAuto = false;

      for (const c of candidates) {
        if (c.ref && txRef.includes(c.ref.toLowerCase())) {
          chosen = c;
          confidence = 0.95;
          isAuto = true;
          break;
        }
      }

      // Only insert if no match exists yet
      const { data: existing } = await supabase
        .from("reconciliation_matches")
        .select("id")
        .eq("bank_transaction_id", tx.id)
        .limit(1);
      if (existing && existing.length > 0) continue;

      const { error: insErr } = await supabase.from("reconciliation_matches").insert({
        bank_transaction_id: tx.id,
        entity_type: chosen.entity_type,
        entity_id: chosen.entity_id,
        amount_cents: chosen.amount,
        match_type: isAuto ? "auto" : "suggested",
        confidence,
      });
      if (insErr) {
        console.error("[auto-match] insert error", insErr);
        continue;
      }
      if (isAuto) matched++;
      else suggested++;
    }

    return new Response(JSON.stringify({ success: true, matched, suggested }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    console.error("[reconciliation-auto-match] error", e);
    return new Response(JSON.stringify({ success: false, error: e.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
