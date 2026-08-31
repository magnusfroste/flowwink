// contract_email — email the customer the signing link for a contract.
//
// The gap this fills: the admin "Send for signature" button only copied the
// link to the clipboard — no mail ever went out. Quotes had an email path;
// contracts did not, so a signing request could only be sent by hand-pasting
// the URL. This mirrors quote_email: a FRAGMENT (email-send wraps it in the
// operator's branded shell) routed through the provider-agnostic router with
// expects_reply, since a signing request is a conversation the customer may
// reply to.
import { getServiceClient } from '../_shared/supabase-clients.ts';
import { renderTemplate } from '../_shared/template-render.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface Body {
  contract_id?: string;
  /** Fallback link. The canonical link is rebuilt from siteUrl + token below. */
  public_url?: string;
  reminder?: boolean;
  custom_message?: string;
}

const escapeHtml = (s: string) =>
  String(s ?? '').replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));

// deno-lint-ignore no-explicit-any
async function primaryHex(supabase: any): Promise<string> {
  const { data } = await supabase.from('site_settings').select('value').eq('key', 'branding').maybeSingle();
  const triplet = (data?.value as { primaryColor?: string } | null)?.primaryColor;
  // HSL triplet "H S% L%" → hex; the shell does the same, kept local to avoid a
  // cross-import here.
  const m = String(triplet ?? '').match(/^(\d+(?:\.\d+)?)\s+(\d+(?:\.\d+)?)%\s+(\d+(?:\.\d+)?)%$/);
  if (!m) return /^#[0-9a-fA-F]{6}$/.test(String(triplet ?? '')) ? String(triplet) : '#1f6feb';
  const h = +m[1] / 360, s = +m[2] / 100, l = +m[3] / 100;
  const k = (n: number) => (n + h * 12) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  const to = (v: number) => Math.round(v * 255).toString(16).padStart(2, '0');
  return `#${to(f(0))}${to(f(8))}${to(f(4))}`;
}

export async function handler(req: Request): Promise<Response> {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  const json = (b: unknown, status = 200) =>
    new Response(JSON.stringify(b), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  try {
    const supabase = getServiceClient();
    const body: Body = await req.json();
    if (!body.contract_id) {
      return json({ error: 'contract_id required' }, 400);
    }

    const { data: contract, error: cErr } = await supabase
      .from('contracts')
      .select('id, title, contract_number, counterparty_name, counterparty_email, accept_token, partner_id')
      .eq('id', body.contract_id)
      .single();
    if (cErr || !contract) throw new Error(cErr?.message || 'Contract not found');
    if (!contract.counterparty_email) throw new Error('Contract has no counterparty_email');

    // The sender name is the operator's brand, not a generic default. general
    // has no site_name on most instances, which is how a signing request went
    // out "from FlowWink" instead of from Optic. Read branding, same source as
    // the shell, with general.site_name only as a legacy fallback.
    const { data: brandingRow } = await supabase
      .from('site_settings').select('value').eq('key', 'branding').maybeSingle();
    const { data: settings } = await supabase
      .from('site_settings').select('value').eq('key', 'general').maybeSingle();
    // deno-lint-ignore no-explicit-any
    const b = (brandingRow?.value as any) ?? {};
    // deno-lint-ignore no-explicit-any
    const g = (settings?.value as any) ?? {};
    const siteName = b.organizationName || b.adminName || g.site_name || 'us';
    const hex = await primaryHex(supabase);

    // Canonical link from siteUrl + the contract's own token, so it always
    // points at the public domain — not whatever admin origin the salesperson
    // built the passed public_url from (a salesperson on ot.garageai.eu would
    // otherwise mail an ot.garageai.eu link). Falls back to the passed URL.
    const siteUrl = String(g.siteUrl ?? '').replace(/\/+$/, '');
    const link = (siteUrl && contract.accept_token)
      ? `${siteUrl}/contract/${contract.accept_token}`
      : body.public_url;
    if (!link) throw new Error('No signing link — contract has no token and no public_url given');

    // ── Mallen är sajtinnehåll, på mottagarens språk ─────────────────────
    // Signeringsbegäran var hårdkodad engelska. Nu: mottagarens språk från
    // parten, mallen via stegen, gamla HTML:en som Law 4-fallback.
    let recipientLang: string | null = null;
    if (contract.partner_id) {
      const { data: langRow, error: langErr } = await supabase.rpc('partner_language', { p_partner_id: contract.partner_id });
      if (langErr) console.warn('[contract-email] could not read the recipient language:', langErr.message);
      recipientLang = (langRow as { lang?: string } | null)?.lang ?? null;
    }
    const templateKind = body.reminder ? 'contract_reminder' : 'contract_email';
    const { data: resolvedTpl, error: tplErr } = await supabase.rpc('resolve_email_template', {
      p_name: templateKind,
      p_locale: recipientLang,
    });
    if (tplErr) console.warn('[contract-email] template lookup failed — using built-in fallback:', tplErr.message);
    const tpl = resolvedTpl as { ok?: boolean; html?: string; subject?: string; locale?: string } | null;

    const custom = body.custom_message
      ? `<p style="white-space:pre-wrap">${escapeHtml(body.custom_message)}</p>` : '';

    let html: string;
    let subject: string;
    if (tpl?.ok && tpl.html) {
      const vars: Record<string, string> = {
        contract_title: escapeHtml(contract.title || 'Agreement'),
        contract_number: escapeHtml(contract.contract_number || ''),
        site_name: escapeHtml(siteName),
        cta_url: link,
        custom_block: custom,
      };
      html = renderTemplate(tpl.html, vars);
      subject = tpl.subject ? renderTemplate(tpl.subject, vars)
        : `Agreement ${contract.contract_number} from ${siteName} — ready to sign`;
      if (recipientLang && tpl.locale && tpl.locale !== recipientLang.toLowerCase()) {
        console.warn(`[contract-email] no ${recipientLang} template for ${templateKind} — sent the ${tpl.locale} one`);
      }
    } else {
      const intro = body.reminder
        ? 'A reminder to review and sign the agreement below.'
        : 'Please review and sign the agreement below.';

      // Fragment — email-send applies the branded shell.
      html = `
      <h2 style="margin:0 0 12px;font-size:20px;">${escapeHtml(contract.title || 'Agreement')}</h2>
      <p>${intro}</p>
      ${custom}
      <div style="background:#f9fafb;border:1px solid #e6e8ec;border-radius:8px;padding:12px 16px;margin:16px 0;font-size:14px;">
        <div><span style="color:#6b7280">Agreement</span> &nbsp; <strong>${escapeHtml(contract.contract_number || '')}</strong></div>
      </div>
      <p style="margin:24px 0;">
        <a href="${link}" style="display:inline-block;padding:12px 24px;background-color:${hex};color:#ffffff;text-decoration:none;border-radius:6px;font-weight:600;">Review &amp; sign</a>
      </p>
      <p style="font-size:12px;color:#6b7280;word-break:break-all">Or open this link:<br/>${escapeHtml(link)}</p>
    `;

      subject = body.reminder
        ? `Reminder: sign ${contract.contract_number} from ${siteName}`
        : `Agreement ${contract.contract_number} from ${siteName} — ready to sign`;
    }

    // expects_reply: a signing request is a conversation, not a receipt — same
    // reasoning as quote_email (Composio → SMTP → Resend).
    const { data: sendData, error: sendErr } = await supabase.functions.invoke('email-send', {
      body: {
        to: contract.counterparty_email,
        subject,
        html,
        expects_reply: true,
        source: 'contract_email',
        tags: { kind: body.reminder ? 'contract_reminder' : 'contract', contract_id: contract.id },
      },
    });
    if (sendErr) throw new Error(sendErr.message || 'email-send failed');
    if (!sendData?.success) throw new Error(sendData?.error || 'email-send returned failure');

    return json({ success: true, simulated: !!sendData?.simulated, to: contract.counterparty_email });
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
}
