// Send a quote to the customer via the provider-agnostic `email-send` router.
// Provider selection (SMTP / Resend) is handled centrally in `email-send`,
// driven by `site_settings.integrations.email.config.provider`.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';
import { getServiceClient } from '../_shared/supabase-clients.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

interface Body {
  quote_id: string;
  public_url: string;
  reminder?: boolean;
  custom_message?: string;
}

function fmtMoney(cents: number, currency: string) {
  return new Intl.NumberFormat('sv-SE', { style: 'currency', currency }).format((cents || 0) / 100);
}

function buildHtml(opts: {
  quote: any;
  items: any[];
  url: string;
  reminder: boolean;
  custom: string;
  siteName: string;
  contractMode: boolean;
}) {
  const { quote, items, url, reminder, custom, siteName, contractMode } = opts;
  const currency = quote.currency || 'SEK';
  const total = fmtMoney(quote.total_cents, currency);
  const subtotal = fmtMoney(quote.subtotal_cents, currency);
  const tax = fmtMoney(quote.tax_cents, currency);
  const validUntil = quote.valid_until ? new Date(quote.valid_until).toLocaleDateString('sv-SE') : null;
  const heading = reminder ? `Reminder: Quote ${quote.quote_number}` : `Your quote ${quote.quote_number}`;
  const intro = reminder
    ? `This is a friendly reminder regarding the quote we sent you.`
    : `Thank you for your interest. Please find your quote below.`;

  const itemRows = (items || []).map((it: any) => `
    <tr>
      <td style="padding:8px 0;border-bottom:1px solid #eef0f3;font-size:13px;vertical-align:top">
        <div>${escapeHtml(it.description || '')}</div>
        <div style="color:#6b7280;font-size:11px;margin-top:2px">${it.quantity} ${escapeHtml(it.unit || '')} × ${fmtMoney(it.unit_price_cents, currency)}</div>
      </td>
      <td style="padding:8px 0;border-bottom:1px solid #eef0f3;text-align:right;font-family:ui-monospace,monospace;font-size:13px;white-space:nowrap;vertical-align:top">
        ${fmtMoney(it.line_total_cents, currency)}
      </td>
    </tr>`).join('');

  const itemsBlock = items && items.length > 0 ? `
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
      <div style="display:flex;justify-content:space-between;margin-bottom:6px"><span style="color:#6b7280">Quote</span><strong>${quote.quote_number}</strong></div>
      ${quote.title ? `<div style="display:flex;justify-content:space-between;margin-bottom:6px"><span style="color:#6b7280">Title</span><span>${escapeHtml(quote.title)}</span></div>` : ''}
      ${itemsBlock}
      <div style="display:flex;justify-content:space-between;margin-top:8px;font-size:13px"><span style="color:#6b7280">Subtotal</span><span style="font-family:ui-monospace,monospace">${subtotal}</span></div>
      <div style="display:flex;justify-content:space-between;font-size:13px"><span style="color:#6b7280">Tax</span><span style="font-family:ui-monospace,monospace">${tax}</span></div>
      <div style="display:flex;justify-content:space-between;margin-top:6px;border-top:1px solid #e6e8ec;padding-top:6px"><strong>Total</strong><strong style="font-family:ui-monospace,monospace">${total}</strong></div>
      ${validUntil ? `<div style="display:flex;justify-content:space-between;margin-top:8px;font-size:12px;color:#6b7280"><span>Valid until</span><span>${validUntil}</span></div>` : ''}
    </div>
    <div style="text-align:center;margin:24px 0">
      <a href="${url}" style="display:inline-block;background:#111;color:#fff;text-decoration:none;padding:12px 24px;border-radius:8px;font-weight:600">${contractMode ? 'View &amp; approve quote' : 'View &amp; sign quote'}</a>
    </div>
    <p style="margin:16px 0 0;font-size:12px;color:#6b7280;word-break:break-all">Or copy this link: <br/>${url}</p>
    <hr style="border:none;border-top:1px solid #e6e8ec;margin:24px 0"/>
    <p style="margin:0;font-size:12px;color:#9ca3af">Sent by ${escapeHtml(siteName)}</p>
  </div>
</body></html>`;
}

function escapeHtml(s: string) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
}

// Moved VERBATIM from supabase/functions/send-quote-email/index.ts (edge-surface B2).
export async function handler(req: Request): Promise<Response> {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  try {
    const body: Body = await req.json();
    if (!body.quote_id || !body.public_url) {
      return new Response(JSON.stringify({ error: 'quote_id and public_url required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabase = getServiceClient();

    const { data: quote, error: qErr } = await supabase
      .from('quotes')
      .select('*, leads(name, email)')
      .eq('id', body.quote_id)
      .single();
    if (qErr || !quote) throw new Error(qErr?.message || 'Quote not found');

    // Fallback: use linked lead's email/name if quote doesn't have its own
    const recipientEmail = quote.customer_email || quote.leads?.email;
    const recipientName = quote.customer_name || quote.leads?.name;
    if (!recipientEmail) throw new Error('Quote has no customer_email and lead has no email');

    // Backfill quote so future sends + audit trail have it
    if (!quote.customer_email && recipientEmail) {
      await supabase
        .from('quotes')
        .update({ customer_email: recipientEmail, customer_name: recipientName })
        .eq('id', quote.id);
      quote.customer_email = recipientEmail;
      quote.customer_name = recipientName;
    }

    // Resolve site name + optional from/reply-to override from settings
    const { data: settings } = await supabase
      .from('site_settings')
      .select('value')
      .eq('key', 'general')
      .maybeSingle();
    const siteName = (settings?.value as any)?.site_name || 'FlowWink';

    const { data: integ } = await supabase
      .from('site_settings')
      .select('value')
      .eq('key', 'integrations')
      .maybeSingle();
    const quoteCfg = ((integ?.value as any)?.quotes ?? {}) as {
      fromOverride?: string;
      replyTo?: string;
    };

    // The accept-behavior dial governs this mail's language too: in contract
    // mode the customer approves the quote and signs the AGREEMENT, so the
    // button must not promise a signature here. Same rule the public quote
    // page follows — quote-sign reads the same setting server-side.
    const { data: qproc } = await supabase
      .from('site_settings')
      .select('value')
      .eq('key', 'quotes')
      .maybeSingle();
    const contractMode = ((qproc?.value as any)?.accept_behavior as string) === 'contract';

    const { data: items } = await supabase
      .from('quote_items')
      .select('*')
      .eq('quote_id', quote.id)
      .order('position', { ascending: true });

    // ── Mallen är sajtinnehåll, på mottagarens språk ─────────────────────
    // Mejlet i själva AFFÄREN var hårdkodad engelska: en svensk kund fick sin
    // offert på engelska och ingen operatör kunde ändra det. Nu: mottagarens
    // språk från parten, mallen via samma stege som allt annat (exakt tagg →
    // samma språk → sajtens standard → NÅGON aktiv version), och den gamla
    // HTML:en som Law 4-fallback — mejlet uteblir aldrig för att en mall
    // saknas. ALL språktext bor i mallen; koden prerendrar bara data.
    let recipientLang: string | null = null;
    if (quote.partner_id) {
      const { data: langRow, error: langErr } = await supabase.rpc('partner_language', { p_partner_id: quote.partner_id });
      if (langErr) console.warn('[quote-email] could not read the recipient language:', langErr.message);
      recipientLang = (langRow as { lang?: string } | null)?.lang ?? null;
    }
    const templateKind = body.reminder ? 'quote_reminder' : 'quote_email';
    const { data: resolvedTpl, error: tplErr } = await supabase.rpc('resolve_email_template', {
      p_name: templateKind,
      p_locale: recipientLang,
    });
    if (tplErr) console.warn('[quote-email] template lookup failed — using built-in fallback:', tplErr.message);
    const tpl = resolvedTpl as { ok?: boolean; html?: string; subject?: string; locale?: string } | null;

    let html: string;
    let subject: string;
    if (tpl?.ok && tpl.html) {
      // Prerendrade DATA-block — inga ord, bara rader, belopp och länkar.
      const itemsRows = (items || []).map((it: any) => `
    <tr>
      <td style="padding:8px 0;border-bottom:1px solid #eef0f3;font-size:13px;vertical-align:top">
        <div>${escapeHtml(it.description || '')}</div>
        <div style="color:#6b7280;font-size:11px;margin-top:2px">${it.quantity} ${escapeHtml(it.unit || '')} × ${fmtMoney(it.unit_price_cents, quote.currency || 'SEK')}</div>
      </td>
      <td style="padding:8px 0;border-bottom:1px solid #eef0f3;text-align:right;font-family:ui-monospace,monospace;font-size:13px;white-space:nowrap;vertical-align:top">${fmtMoney(it.line_total_cents ?? (it.quantity * it.unit_price_cents), quote.currency || 'SEK')}</td>
    </tr>`).join('');
      const vars: Record<string, string> = {
        quote_number: String(quote.quote_number ?? ''),
        quote_title: escapeHtml(quote.title || ''),
        site_name: escapeHtml(siteName),
        items_rows: itemsRows,
        subtotal: fmtMoney(quote.subtotal_cents, quote.currency || 'SEK'),
        tax: fmtMoney(quote.tax_cents, quote.currency || 'SEK'),
        total: fmtMoney(quote.total_cents, quote.currency || 'SEK'),
        valid_until: quote.valid_until ? new Date(quote.valid_until).toLocaleDateString('sv-SE') : '—',
        cta_url: body.public_url,
        custom_block: body.custom_message
          ? `<p style="margin:0 0 16px;white-space:pre-wrap">${escapeHtml(body.custom_message)}</p>` : '',
      };
      const render = (t: string) => t.replace(/\{\{(\w+)\}\}/g, (_, k) => vars[k] ?? '');
      html = render(tpl.html);
      subject = tpl.subject ? render(tpl.subject) : `Quote ${quote.quote_number} from ${siteName}`;
      if (recipientLang && tpl.locale && tpl.locale !== recipientLang.toLowerCase()) {
        console.warn(`[quote-email] no ${recipientLang} template for ${templateKind} — sent the ${tpl.locale} one`);
      }
    } else {
      html = buildHtml({
        quote,
        items: items || [],
        url: body.public_url,
        reminder: !!body.reminder,
        custom: body.custom_message || '',
        siteName,
        contractMode,
      });
      subject = body.reminder
        ? `Reminder: Quote ${quote.quote_number} from ${siteName}`
        : `Quote ${quote.quote_number} from ${siteName}`;
    }

    // Route via the provider-agnostic email-send function.
    //
    // expects_reply: a quote is the salesperson's conversation, not a
    // transactional receipt — the customer is supposed to hit reply. That flag
    // flips the provider order to Composio (the connected mailbox) → SMTP →
    // Resend. Without it the router picked Resend first, which on an instance
    // with no verified sender domain answered 403 "example.com is not
    // verified" and the send died — while a perfectly connected Gmail sat
    // unused one step down the chain.
    const { data: sendData, error: sendErr } = await supabase.functions.invoke('email-send', {
      body: {
        to: recipientEmail,
        subject,
        html,
        expects_reply: true,
        fromOverride: quoteCfg.fromOverride,
        replyTo: quoteCfg.replyTo,
        tags: { kind: body.reminder ? 'quote_reminder' : 'quote', quote_id: quote.id },
      },
    });
    if (sendErr) throw new Error(sendErr.message || 'email-send failed');
    if (!sendData?.success) throw new Error(sendData?.error || 'email-send returned failure');

    // Audit
    await supabase.from('audit_logs').insert({
      action: body.reminder ? 'quote.reminder_sent' : 'quote.email_sent',
      entity_type: 'quote',
      entity_id: quote.id,
      metadata: { provider: sendData.provider, to: recipientEmail, subject },
    });

    return new Response(JSON.stringify({ success: true, provider: sendData.provider }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Unknown error';
    console.error('[send-quote-email]', msg);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
}
