// Contract billing cron — daily
// 1. Generates invoices for active contracts with billing_enabled where
//    billing_next_date <= today (reuses generate_contract_invoice RPC).
// 2. For contract-generated invoices (contract_id IS NOT NULL) that are still
//    unpaid, sends payment reminders per the contract's billing_reminder_offsets
//    array. Reminders are logged idempotently in contract_invoice_reminders
//    (UNIQUE(invoice_id, offset_days)) so retries are safe.
//
// Delivery uses the existing email-send function — no parallel machinery.
import { createClient } from "npm:@supabase/supabase-js@2.57.2";
import { homeFormat } from "../_shared/locale/home.ts";
import { loadHome } from "../_shared/locale/load-home.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function daysBetween(a: Date, b: Date): number {
  return Math.floor((a.getTime() - b.getTime()) / (24 * 60 * 60 * 1000));
}

function reminderSubject(offset: number, contractTitle: string): string {
  if (offset < 0) return `Reminder: upcoming payment for ${contractTitle}`;
  if (offset === 0) return `Payment due today — ${contractTitle}`;
  return `Payment overdue (${offset} days) — ${contractTitle}`;
}

function reminderHtml(params: {
  counterparty: string;
  contractTitle: string;
  invoiceNumber: string;
  amount: string;
  dueDate: string;
  offset: number;
}): string {
  const { counterparty, contractTitle, invoiceNumber, amount, dueDate, offset } = params;
  const lead =
    offset < 0
      ? `This is a friendly reminder that your upcoming payment for <strong>${contractTitle}</strong> is due on <strong>${dueDate}</strong>.`
      : offset === 0
        ? `The payment for <strong>${contractTitle}</strong> is due today.`
        : `The payment for <strong>${contractTitle}</strong> was due on <strong>${dueDate}</strong> and is now <strong>${offset} day(s) overdue</strong>. Please settle at your earliest convenience.`;

  return `<!doctype html><html><body style="font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;color:#111;max-width:560px;margin:0 auto;padding:24px;">
  <p>Hi ${counterparty},</p>
  <p>${lead}</p>
  <table style="border-collapse:collapse;margin:16px 0;">
    <tr><td style="padding:4px 12px 4px 0;color:#666;">Invoice</td><td style="padding:4px 0;"><strong>${invoiceNumber}</strong></td></tr>
    <tr><td style="padding:4px 12px 4px 0;color:#666;">Amount</td><td style="padding:4px 0;"><strong>${amount}</strong></td></tr>
    <tr><td style="padding:4px 12px 4px 0;color:#666;">Due date</td><td style="padding:4px 0;">${dueDate}</td></tr>
  </table>
  <p>If the payment has already been made, please disregard this message.</p>
  <p>Thank you,<br/>Accounts</p>
</body></html>`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    { auth: { persistSession: false } },
  );

  // Reminders are English; amounts are written the business's way.
  const money = homeFormat(await loadHome(supabase), "en").money;

  const today = new Date();
  const todayStr = today.toISOString().slice(0, 10);
  const results: Record<string, unknown> = { run_at: today.toISOString() };

  try {
    // ── 1) Auto-invoicing ─────────────────────────────────
    const { data: dueContracts, error: dueErr } = await supabase
      .from("contracts")
      .select("id, title, counterparty_name, billing_amount_cents, currency")
      .eq("status", "active")
      .eq("billing_enabled", true)
      .not("billing_next_date", "is", null)
      .lte("billing_next_date", todayStr)
      .limit(500);
    if (dueErr) throw dueErr;

    const invoiceResults: Array<{ contract_id: string; ok: boolean; invoice_id?: string; error?: string }> = [];
    for (const c of dueContracts ?? []) {
      const { data, error } = await supabase.rpc("generate_contract_invoice", {
        _contract_id: c.id,
      });
      if (error) {
        invoiceResults.push({ contract_id: c.id, ok: false, error: error.message });
      } else {
        const d = data as { invoice_id?: string };
        invoiceResults.push({ contract_id: c.id, ok: true, invoice_id: d?.invoice_id });
      }
    }
    results.invoicing = {
      candidates: dueContracts?.length ?? 0,
      succeeded: invoiceResults.filter((r) => r.ok).length,
      failed: invoiceResults.filter((r) => !r.ok).length,
      details: invoiceResults,
    };

    // ── 2) Payment reminders ──────────────────────────────
    const { data: openInvoices, error: invErr } = await supabase
      .from("invoices")
      .select(
        "id, invoice_number, customer_email, customer_name, total_cents, paid_amount_cents, currency, due_date, status, contract_id, contracts:contract_id(id, title, counterparty_name, counterparty_email, billing_reminder_offsets, billing_reminders_enabled, status)",
      )
      .not("contract_id", "is", null)
      .in("status", ["sent", "overdue"])
      .not("due_date", "is", null)
      .limit(1000);
    if (invErr) throw invErr;

    const reminderResults: Array<{ invoice_id: string; offset: number; ok: boolean; error?: string; skipped?: string }> = [];
    for (const inv of openInvoices ?? []) {
      const c = (inv as any).contracts;
      if (!c) continue;
      if (c.status !== "active" || c.billing_reminders_enabled === false) continue;
      const paid = inv.paid_amount_cents ?? 0;
      if (paid >= (inv.total_cents ?? 0)) continue;
      const recipient = inv.customer_email || c.counterparty_email;
      if (!recipient) continue;

      const dueDate = new Date(inv.due_date + "T00:00:00Z");
      const daysFromDue = daysBetween(today, dueDate); // negative = before due, positive = past due
      const offsets: number[] = Array.isArray(c.billing_reminder_offsets)
        ? c.billing_reminder_offsets
        : [];

      for (const offset of offsets) {
        // Send if today is on or after (dueDate + offset). Convert intent:
        //   offset < 0 means "N days before due"  ⇒ trigger when daysFromDue >= offset
        //   offset > 0 means "N days after due"   ⇒ trigger when daysFromDue >= offset
        if (daysFromDue < offset) continue;

        // Reserve the reminder atomically via unique-constraint insert.
        const { data: logged, error: logErr } = await supabase.rpc("log_contract_invoice_reminder", {
          _invoice_id: inv.id,
          _offset_days: offset,
          _triggered_by: "cron",
          _recipient: recipient,
          _metadata: { subject_offset: offset },
        });
        if (logErr) {
          reminderResults.push({ invoice_id: inv.id, offset, ok: false, error: logErr.message });
          continue;
        }
        const isDup = (logged as any)?.duplicate === true;
        if (isDup) {
          reminderResults.push({ invoice_id: inv.id, offset, ok: true, skipped: "already_sent" });
          continue;
        }

        // Deliver via existing email-send router.
        const amount = money(inv.total_cents ?? 0, inv.currency);
        try {
          const { error: sendErr } = await supabase.functions.invoke("email-send", {
            body: {
              to: recipient,
              subject: reminderSubject(offset, c.title),
              html: reminderHtml({
                counterparty: c.counterparty_name || inv.customer_name || "there",
                contractTitle: c.title,
                invoiceNumber: inv.invoice_number,
                amount,
                dueDate: inv.due_date,
                offset,
              }),
              source: "contract-payment-reminder",
              related_entity_type: "invoice",
              related_entity_id: inv.id,
              extra_metadata: { contract_id: c.id, offset_days: offset },
              tags: { type: "contract_reminder", offset: String(offset) },
            },
          });
          if (sendErr) throw sendErr;
          reminderResults.push({ invoice_id: inv.id, offset, ok: true });
        } catch (e) {
          reminderResults.push({
            invoice_id: inv.id,
            offset,
            ok: false,
            error: e instanceof Error ? e.message : String(e),
          });
        }
      }
    }
    results.reminders = {
      candidates_invoices: openInvoices?.length ?? 0,
      attempted: reminderResults.length,
      succeeded: reminderResults.filter((r) => r.ok).length,
      failed: reminderResults.filter((r) => !r.ok).length,
      details: reminderResults,
    };

    // ── 3) Best-effort: flag overdue obligations ──────────
    // View contract_obligations_with_status already exposes is_overdue; no-op here.
    // (Kept lightweight — UI derives overdue-ness from the same view.)

    return new Response(JSON.stringify({ ok: true, ...results }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(
      JSON.stringify({ ok: false, error: e instanceof Error ? e.message : String(e) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
