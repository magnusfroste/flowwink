// invoice-reminders — runs on cron, mails customers about overdue / upcoming invoices.
// Reminder cadence (relative to invoice.due_date):
//   T-3 days (upcoming)   → friendly heads-up
//   T+0  (due today)      → due today
//   T+7  (overdue)        → first overdue notice
//   T+14 (overdue)        → second overdue + flips status to 'overdue'
// Idempotency: tracks sent reminders in audit_logs (action='invoice.reminder_sent', metadata.stage).
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

type Stage = 'upcoming_3' | 'due_today' | 'overdue_7' | 'overdue_14';

function fmtMoney(cents: number, currency: string) {
  return new Intl.NumberFormat('sv-SE', { style: 'currency', currency }).format((cents || 0) / 100);
}
function escapeHtml(s: string) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
}

function classifyStage(dueDate: string): Stage | null {
  const now = new Date();
  const due = new Date(dueDate + 'T00:00:00Z');
  const diffDays = Math.floor((due.getTime() - now.getTime()) / 86400000);
  if (diffDays === 3) return 'upcoming_3';
  if (diffDays === 0) return 'due_today';
  if (diffDays === -7) return 'overdue_7';
  if (diffDays <= -14) return 'overdue_14';
  return null;
}

function buildHtml(invoice: any, stage: Stage, siteName: string) {
  const total = fmtMoney(invoice.total_cents, invoice.currency || 'SEK');
  const heading = {
    upcoming_3: `Reminder: Invoice ${invoice.invoice_number} due soon`,
    due_today: `Invoice ${invoice.invoice_number} is due today`,
    overdue_7: `Overdue: Invoice ${invoice.invoice_number}`,
    overdue_14: `Final notice: Invoice ${invoice.invoice_number} overdue`,
  }[stage];
  const intro = {
    upcoming_3: `This is a friendly reminder that your invoice is due in 3 days.`,
    due_today: `Your invoice is due today. Please process payment at your earliest convenience.`,
    overdue_7: `Your invoice is now 7 days overdue. Please process payment as soon as possible.`,
    overdue_14: `Your invoice is now 14 days overdue. Please contact us immediately if there is an issue.`,
  }[stage];
  return `<!doctype html><html><body style="font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;background:#f6f7f9;margin:0;padding:24px;color:#111">
  <div style="max-width:560px;margin:0 auto;background:#fff;border-radius:12px;padding:32px;border:1px solid #e6e8ec">
    <h1 style="margin:0 0 8px;font-size:20px">${escapeHtml(heading)}</h1>
    <p style="margin:0 0 16px;color:#4b5563">${escapeHtml(intro)}</p>
    <div style="background:#f9fafb;border:1px solid #e6e8ec;border-radius:8px;padding:16px;margin:16px 0">
      <div style="display:flex;justify-content:space-between;margin-bottom:6px"><span style="color:#6b7280">Invoice</span><strong>${escapeHtml(invoice.invoice_number)}</strong></div>
      <div style="display:flex;justify-content:space-between;margin-bottom:6px"><span style="color:#6b7280">Amount</span><strong>${total}</strong></div>
      <div style="display:flex;justify-content:space-between"><span style="color:#6b7280">Due date</span><span>${escapeHtml(invoice.due_date)}</span></div>
    </div>
    <p style="margin:16px 0 0;color:#4b5563">If you've already paid, please disregard this message.</p>
    <hr style="border:none;border-top:1px solid #e6e8ec;margin:24px 0"/>
    <p style="margin:0;font-size:12px;color:#9ca3af">Sent by ${escapeHtml(siteName)}</p>
  </div>
</body></html>`;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  );

  try {
    // Get site name once
    const { data: settings } = await supabase
      .from('site_settings')
      .select('value')
      .eq('key', 'general')
      .maybeSingle();
    const siteName = (settings?.value as any)?.site_name || 'FlowWink';

    // Pull invoices that are sent or overdue and have a due_date and customer email
    const { data: invoices, error } = await supabase
      .from('invoices')
      .select('id, invoice_number, customer_email, customer_name, total_cents, currency, due_date, status')
      .in('status', ['sent', 'overdue'])
      .not('due_date', 'is', null)
      .not('customer_email', 'is', null);

    if (error) throw error;

    let sent = 0;
    let skipped = 0;
    let flipped = 0;

    for (const inv of invoices || []) {
      if (!inv.customer_email || !inv.due_date) {
        skipped++;
        continue;
      }
      const stage = classifyStage(inv.due_date);
      if (!stage) {
        skipped++;
        continue;
      }

      // Idempotency: have we already sent this stage for this invoice?
      const { data: prior } = await supabase
        .from('audit_logs')
        .select('id')
        .eq('entity_type', 'invoice')
        .eq('entity_id', inv.id)
        .eq('action', 'invoice.reminder_sent')
        .contains('metadata', { stage })
        .limit(1);
      if (prior && prior.length) {
        skipped++;
        continue;
      }

      // Send email
      try {
        await supabase.functions.invoke('email-send', {
          body: {
            to: inv.customer_email,
            subject:
              stage === 'upcoming_3'
                ? `Reminder: Invoice ${inv.invoice_number} due soon`
                : stage === 'due_today'
                ? `Invoice ${inv.invoice_number} due today`
                : `Overdue: Invoice ${inv.invoice_number}`,
            html: buildHtml(inv, stage, siteName),
          },
        });
        sent++;

        await supabase.from('audit_logs').insert({
          action: 'invoice.reminder_sent',
          entity_type: 'invoice',
          entity_id: inv.id,
          metadata: { stage, invoice_number: inv.invoice_number, due_date: inv.due_date },
        });

        // Flip to overdue at T+14
        if (stage === 'overdue_14' && inv.status !== 'overdue') {
          await supabase.from('invoices').update({ status: 'overdue' }).eq('id', inv.id);
          flipped++;
        }
      } catch (e) {
        console.error(`Failed reminder for invoice ${inv.id}:`, e);
      }
    }

    return new Response(
      JSON.stringify({ ok: true, processed: invoices?.length || 0, sent, skipped, flipped }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (err) {
    console.error('invoice-reminders error:', err);
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : 'Unknown' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
