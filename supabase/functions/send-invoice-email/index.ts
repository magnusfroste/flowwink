// Send an invoice to the customer via the provider-agnostic `email-send` router.
// Includes PDF attachment + link to public payment page.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

interface Body {
  invoice_id: string;
  public_url: string;
  reminder?: boolean;
  custom_message?: string;
}

function fmtMoney(cents: number, currency: string) {
  return new Intl.NumberFormat('sv-SE', { style: 'currency', currency }).format((cents || 0) / 100);
}

function escapeHtml(s: string) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
}

function buildHtml(opts: {
  invoice: any;
  url: string;
  reminder: boolean;
  custom: string;
  siteName: string;
}) {
  const { invoice, url, reminder, custom, siteName } = opts;
  const currency = invoice.currency || 'SEK';
  const total = fmtMoney(invoice.total_cents, currency);
  const subtotal = fmtMoney(invoice.subtotal_cents, currency);
  const tax = fmtMoney(invoice.tax_cents, currency);
  const dueDate = invoice.due_date ? new Date(invoice.due_date).toLocaleDateString('sv-SE') : null;
  const heading = reminder ? `Reminder: Invoice ${invoice.invoice_number}` : `Invoice ${invoice.invoice_number}`;
  const intro = reminder
    ? `This is a friendly reminder that the invoice below is awaiting payment.`
    : `Please find your invoice attached. You can also view and pay it online.`;

  const items = Array.isArray(invoice.line_items) ? invoice.line_items : [];
  const itemRows = items.map((it: any) => {
    const qty = Number(it.qty ?? it.quantity ?? 1);
    const unit = Number(it.unit_price_cents ?? 0);
    const lineTotal = qty * unit;
    return `
    <tr>
      <td style="padding:8px 0;border-bottom:1px solid #eef0f3;font-size:13px;vertical-align:top">
        <div>${escapeHtml(it.description || '')}</div>
        <div style="color:#6b7280;font-size:11px;margin-top:2px">${qty} × ${fmtMoney(unit, currency)}</div>
      </td>
      <td style="padding:8px 0;border-bottom:1px solid #eef0f3;text-align:right;font-family:ui-monospace,monospace;font-size:13px;white-space:nowrap;vertical-align:top">
        ${fmtMoney(lineTotal, currency)}
      </td>
    </tr>`;
  }).join('');

  const itemsBlock = items.length > 0 ? `
    <table style="width:100%;border-collapse:collapse;margin:12px 0 4px">
      <thead><tr>
        <th style="text-align:left;font-size:11px;text-transform:uppercase;color:#6b7280;padding-bottom:6px;border-bottom:1px solid #e6e8ec">Item</th>
        <th style="text-align:right;font-size:11px;text-transform:uppercase;color:#6b7280;padding-bottom:6px;border-bottom:1px solid #e6e8ec">Amount</th>
      </tr></thead>
      <tbody>${itemRows}</tbody>
    </table>` : '';

  return `<!doctype html><html><body style="font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;background:#f6f7f9;margin:0;padding:24px;color:#111">
  <div style="max-width:560px;margin:0 auto;background:#fff;border-radius:12px;padding:32px;border:1px solid #e6e8ec">
    <h1 style="margin:0 0 8px;font-size:20px">${heading}</h1>
    <p style="margin:0 0 16px;color:#4b5563">${intro}</p>
    ${custom ? `<p style="margin:0 0 16px;white-space:pre-wrap">${escapeHtml(custom)}</p>` : ''}
    <div style="background:#f9fafb;border:1px solid #e6e8ec;border-radius:8px;padding:16px;margin:16px 0">
      <div style="display:flex;justify-content:space-between;margin-bottom:6px"><span style="color:#6b7280">Invoice</span><strong>${invoice.invoice_number}</strong></div>
      ${itemsBlock}
      <div style="display:flex;justify-content:space-between;margin-top:8px;font-size:13px"><span style="color:#6b7280">Subtotal</span><span style="font-family:ui-monospace,monospace">${subtotal}</span></div>
      <div style="display:flex;justify-content:space-between;font-size:13px"><span style="color:#6b7280">Tax</span><span style="font-family:ui-monospace,monospace">${tax}</span></div>
      <div style="display:flex;justify-content:space-between;margin-top:6px;border-top:1px solid #e6e8ec;padding-top:6px"><strong>Total</strong><strong style="font-family:ui-monospace,monospace">${total}</strong></div>
      ${dueDate ? `<div style="display:flex;justify-content:space-between;margin-top:8px;font-size:12px;color:#6b7280"><span>Due</span><span>${dueDate}</span></div>` : ''}
    </div>
    <div style="text-align:center;margin:24px 0">
      <a href="${url}" style="display:inline-block;background:#111;color:#fff;text-decoration:none;padding:12px 24px;border-radius:8px;font-weight:600">View &amp; pay invoice</a>
    </div>
    <p style="margin:16px 0 0;font-size:12px;color:#6b7280;word-break:break-all">Or copy this link: <br/>${url}</p>
    <hr style="border:none;border-top:1px solid #e6e8ec;margin:24px 0"/>
    <p style="margin:0;font-size:12px;color:#9ca3af">Sent by ${escapeHtml(siteName)}</p>
  </div>
</body></html>`;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  try {
    const body: Body = await req.json();
    if (!body.invoice_id || !body.public_url) {
      return new Response(JSON.stringify({ error: 'invoice_id and public_url required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    const { data: invoice, error: invErr } = await supabase
      .from('invoices')
      .select('*, leads(name, email)')
      .eq('id', body.invoice_id)
      .single();
    if (invErr || !invoice) throw new Error(invErr?.message || 'Invoice not found');

    const recipientEmail = invoice.customer_email || invoice.leads?.email;
    const recipientName = invoice.customer_name || invoice.leads?.name;
    if (!recipientEmail) throw new Error('Invoice has no customer_email and lead has no email');

    if (!invoice.customer_email && recipientEmail) {
      await supabase.from('invoices')
        .update({ customer_email: recipientEmail, customer_name: recipientName })
        .eq('id', invoice.id);
    }

    // Site name
    const { data: settings } = await supabase
      .from('site_settings').select('value').eq('key', 'general').maybeSingle();
    const siteName = (settings?.value as any)?.site_name || 'FlowWink';

    const { data: integ } = await supabase
      .from('site_settings').select('value').eq('key', 'integrations').maybeSingle();
    const invCfg = ((integ?.value as any)?.invoices ?? {}) as { fromOverride?: string; replyTo?: string };

    // Generate PDF as attachment
    let pdfBase64: string | undefined;
    try {
      const pdfResp = await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/generate-invoice-pdf`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
        },
        body: JSON.stringify({ invoice_id: invoice.id }),
      });
      if (pdfResp.ok) {
        const pdfBytes = new Uint8Array(await pdfResp.arrayBuffer());
        // base64 encode
        let binary = '';
        const chunk = 0x8000;
        for (let i = 0; i < pdfBytes.length; i += chunk) {
          binary += String.fromCharCode.apply(null, Array.from(pdfBytes.subarray(i, i + chunk)) as any);
        }
        pdfBase64 = btoa(binary);
      } else {
        console.warn('[send-invoice-email] PDF generation failed:', pdfResp.status);
      }
    } catch (pdfErr) {
      console.warn('[send-invoice-email] PDF fetch error:', pdfErr);
    }

    const html = buildHtml({
      invoice,
      url: body.public_url,
      reminder: !!body.reminder,
      custom: body.custom_message || '',
      siteName,
    });

    const subject = body.reminder
      ? `Reminder: Invoice ${invoice.invoice_number} from ${siteName}`
      : `Invoice ${invoice.invoice_number} from ${siteName}`;

    const attachments = pdfBase64
      ? [{ filename: `${invoice.invoice_number}.pdf`, content: pdfBase64, contentType: 'application/pdf' }]
      : undefined;

    const { data: sendData, error: sendErr } = await supabase.functions.invoke('email-send', {
      body: {
        to: recipientEmail,
        subject,
        html,
        attachments,
        fromOverride: invCfg.fromOverride,
        replyTo: invCfg.replyTo,
        tags: { kind: body.reminder ? 'invoice_reminder' : 'invoice', invoice_id: invoice.id },
      },
    });
    if (sendErr) throw new Error(sendErr.message || 'email-send failed');
    if (!sendData?.success) throw new Error(sendData?.error || 'email-send returned failure');

    // Mark invoice as sent (only if currently draft)
    if (invoice.status === 'draft') {
      await supabase.from('invoices')
        .update({ status: 'sent', sent_at: new Date().toISOString() })
        .eq('id', invoice.id);
    }

    await supabase.from('audit_logs').insert({
      action: body.reminder ? 'invoice.reminder_sent' : 'invoice.email_sent',
      entity_type: 'invoice',
      entity_id: invoice.id,
      metadata: { provider: sendData.provider, to: recipientEmail, subject, has_pdf: !!pdfBase64 },
    });

    return new Response(JSON.stringify({ success: true, provider: sendData.provider, has_pdf: !!pdfBase64 }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Unknown error';
    console.error('[send-invoice-email]', msg);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
