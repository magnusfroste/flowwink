// Send a quote to the customer via the provider-agnostic `email-send` router.
// Provider selection (SMTP / Resend) is handled centrally in `email-send`,
// driven by `site_settings.integrations.email.config.provider`.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

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
  url: string;
  reminder: boolean;
  custom: string;
  siteName: string;
}) {
  const { quote, url, reminder, custom, siteName } = opts;
  const total = fmtMoney(quote.total_cents, quote.currency || 'SEK');
  const validUntil = quote.valid_until ? new Date(quote.valid_until).toLocaleDateString('sv-SE') : null;
  const heading = reminder ? `Reminder: Quote ${quote.quote_number}` : `Your quote ${quote.quote_number}`;
  const intro = reminder
    ? `This is a friendly reminder regarding the quote we sent you.`
    : `Thank you for your interest. Please find your quote below.`;
  return `<!doctype html><html><body style="font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;background:#f6f7f9;margin:0;padding:24px;color:#111">
  <div style="max-width:560px;margin:0 auto;background:#fff;border-radius:12px;padding:32px;border:1px solid #e6e8ec">
    <h1 style="margin:0 0 8px;font-size:20px">${heading}</h1>
    <p style="margin:0 0 16px;color:#4b5563">${intro}</p>
    ${custom ? `<p style="margin:0 0 16px;white-space:pre-wrap">${escapeHtml(custom)}</p>` : ''}
    <div style="background:#f9fafb;border:1px solid #e6e8ec;border-radius:8px;padding:16px;margin:16px 0">
      <div style="display:flex;justify-content:space-between;margin-bottom:6px"><span style="color:#6b7280">Quote</span><strong>${quote.quote_number}</strong></div>
      ${quote.title ? `<div style="display:flex;justify-content:space-between;margin-bottom:6px"><span style="color:#6b7280">Title</span><span>${escapeHtml(quote.title)}</span></div>` : ''}
      <div style="display:flex;justify-content:space-between;margin-bottom:6px"><span style="color:#6b7280">Total</span><strong>${total}</strong></div>
      ${validUntil ? `<div style="display:flex;justify-content:space-between"><span style="color:#6b7280">Valid until</span><span>${validUntil}</span></div>` : ''}
    </div>
    <div style="text-align:center;margin:24px 0">
      <a href="${url}" style="display:inline-block;background:#111;color:#fff;text-decoration:none;padding:12px 24px;border-radius:8px;font-weight:600">View &amp; sign quote</a>
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

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  try {
    const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY');
    if (!RESEND_API_KEY) {
      return new Response(JSON.stringify({ error: 'RESEND_API_KEY not configured' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const body: Body = await req.json();
    if (!body.quote_id || !body.public_url) {
      return new Response(JSON.stringify({ error: 'quote_id and public_url required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    const { data: quote, error: qErr } = await supabase
      .from('quotes')
      .select('*')
      .eq('id', body.quote_id)
      .single();
    if (qErr || !quote) throw new Error(qErr?.message || 'Quote not found');
    if (!quote.customer_email) throw new Error('Quote has no customer_email');

    // Resolve site name
    const { data: settings } = await supabase
      .from('site_settings')
      .select('value')
      .eq('key', 'general')
      .maybeSingle();
    const siteName = (settings?.value as any)?.site_name || 'FlowWink';
    const fromEmail = Deno.env.get('QUOTE_FROM_EMAIL') || 'FlowWink <quotes@news.flowwink.com>';

    const html = buildHtml({
      quote,
      url: body.public_url,
      reminder: !!body.reminder,
      custom: body.custom_message || '',
      siteName,
    });

    const subject = body.reminder
      ? `Reminder: Quote ${quote.quote_number} from ${siteName}`
      : `Quote ${quote.quote_number} from ${siteName}`;

    const resendRes = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: fromEmail,
        to: [quote.customer_email],
        subject,
        html,
        reply_to: Deno.env.get('QUOTE_REPLY_TO') || undefined,
      }),
    });
    const resendData = await resendRes.json();
    if (!resendRes.ok) {
      throw new Error(`Resend error: ${resendData?.message || resendRes.statusText}`);
    }

    // Audit
    await supabase.from('audit_logs').insert({
      action: body.reminder ? 'quote.reminder_sent' : 'quote.email_sent',
      entity_type: 'quote',
      entity_id: quote.id,
      metadata: { message_id: resendData?.id, to: quote.customer_email, subject },
    });

    return new Response(JSON.stringify({ success: true, message_id: resendData?.id }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Unknown error';
    console.error('[send-quote-email]', msg);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
