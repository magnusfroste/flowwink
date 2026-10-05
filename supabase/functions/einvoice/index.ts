// einvoice — UBL 2.1 / Peppol BIS Billing 3.0 for one invoice.
//
// Actions (body.action, or the skill name the edge: dispatcher injects as _skill):
//   export   → { xml, validation, totals, recipient_id, sender_id }; with
//              ?download=1 (or body.download) the raw XML as an attachment.
//   dispatch → validates, then hands the XML to the configured access point and
//              writes ONE einvoice_dispatches row. No access point configured
//              ⇒ status 'simulated' — the row says so, nothing is ever marked
//              'sent' that nobody received. body.dry_run: true answers what
//              WOULD happen (recipient, provider, validation) and writes nothing.
//   list     → the dispatch ledger for an invoice.
//
// Who may call: an invoicing-module user or the service role (the agent), the
// same gate as generate-invoice-pdf's invoice_id path.
//
// Seller = site_settings.company_profile (+ einvoice settings: bank, Peppol id
// override). Buyer = the invoice's party in the register (partners: street,
// city, postal_code, country_code, vat, company_registry), else its company
// (companies: org_number, vat_number, peppol_id, address, country), else the
// customer name on the invoice. The XML itself is _shared/einvoice/ubl.ts —
// pure and unit-tested, so what the tests prove is what leaves here.

import { getServiceClient } from '../_shared/supabase-clients.ts';
import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { requireServiceOrModule, unauthorized } from '../_shared/edge-auth.ts';
import { buildUblInvoice, type UblInvoiceInput, type UblParty } from '../_shared/einvoice/ubl.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

interface EinvoiceSettings {
  bankgiro?: string; iban?: string; bic?: string;
  peppol_id?: string;
  /** Generic access point: POST the UBL document here. The token is a secret (PEPPOL_AP_TOKEN). */
  access_point_url?: string;
  access_point_name?: string;
}

/** Split a one-line address "Storgatan 1, 111 22 Stockholm" into street / postal / city when it has that shape. */
function splitAddress(address: string | null | undefined): { street?: string; postal_code?: string; city?: string } {
  const a = (address ?? '').trim();
  if (!a) return {};
  const m = a.match(/^(.*?)[,\n]\s*(\d{3}\s?\d{2})\s+(.+)$/s);
  if (m) return { street: m[1].trim(), postal_code: m[2].replace(/\s/g, ''), city: m[3].trim() };
  return { street: a };
}

async function gather(supabase: SupabaseClient, invoiceId: string): Promise<{ input: UblInvoiceInput; invoice: Record<string, unknown>; settings: EinvoiceSettings } | { error: string; status: number }> {
  const { data: invoice, error } = await supabase.from('invoices').select('*').eq('id', invoiceId).maybeSingle();
  if (error) return { error: error.message, status: 500 };
  if (!invoice) return { error: 'Invoice not found', status: 404 };

  const { data: settingsRows, error: sErr } = await supabase.from('site_settings').select('key, value').in('key', ['company_profile', 'einvoice']);
  if (sErr) console.warn('[einvoice] settings read failed:', sErr.message);
  const byKey = Object.fromEntries(((settingsRows ?? []) as Array<{ key: string; value: unknown }>).map((r) => [r.key, r.value]));
  const profile = (byKey.company_profile ?? {}) as Record<string, string>;
  const settings = (byKey.einvoice ?? {}) as EinvoiceSettings;

  const sellerAddr = profile.city || profile.postal_code ? { street: profile.address } : splitAddress(profile.address);
  const seller: UblParty = {
    name: profile.legal_name || profile.company_name || '',
    org_number: profile.org_number, vat_number: profile.vat_number,
    peppol_id: settings.peppol_id,
    street: sellerAddr.street, city: profile.city || sellerAddr.city, postal_code: profile.postal_code || sellerAddr.postal_code,
    country: profile.country, email: profile.contact_email, phone: profile.contact_phone,
  };

  // A credit note is addressed to whoever the credited invoice was. create_credit_note
  // copies the party since 20261005060100; older credit notes carry only amounts, so the
  // credited invoice fills in what the row lacks — the same buyer, never a guessed one.
  let creditedNumber: string | null = null;
  let creditedBuyerRef: string | null = null;
  if (invoice.invoice_type === 'credit_note' && invoice.credited_invoice_id) {
    const { data: orig, error: oErr } = await supabase.from('invoices')
      .select('invoice_number, company_id, partner_id, buyer_reference').eq('id', invoice.credited_invoice_id).maybeSingle();
    if (oErr) console.warn('[einvoice] credited invoice read failed:', oErr.message);
    creditedNumber = orig?.invoice_number ?? null;
    creditedBuyerRef = orig?.buyer_reference ?? null;
    if (!invoice.company_id && orig?.company_id) invoice.company_id = orig.company_id;
    if (!invoice.partner_id && orig?.partner_id) invoice.partner_id = orig.partner_id;
  }

  // Buyer: the party register first, then the company, then what the invoice says.
  let buyer: UblParty = { name: String(invoice.customer_name ?? ''), email: invoice.customer_email ?? null };
  let company: Record<string, string | null> | null = null;
  if (invoice.company_id) {
    const { data: c, error: cErr } = await supabase.from('companies').select('name, org_number, vat_number, peppol_id, address, country').eq('id', invoice.company_id).maybeSingle();
    if (cErr) console.warn('[einvoice] company read failed:', cErr.message);
    company = c ?? null;
  }
  if (invoice.partner_id) {
    const { data: p, error: pErr } = await supabase.from('partners')
      .select('name, street, city, postal_code, country_code, vat, company_registry, email, source_company_id').eq('id', invoice.partner_id).maybeSingle();
    if (pErr) console.warn('[einvoice] partner read failed:', pErr.message);
    if (p) {
      if (!company && p.source_company_id) {
        const { data: c2, error: c2Err } = await supabase.from('companies').select('name, org_number, vat_number, peppol_id, address, country').eq('id', p.source_company_id).maybeSingle();
        if (c2Err) console.warn('[einvoice] company read failed:', c2Err.message);
        company = c2 ?? null;
      }
      buyer = {
        name: p.name || company?.name || buyer.name,
        org_number: p.company_registry || company?.org_number, vat_number: p.vat || company?.vat_number,
        peppol_id: company?.peppol_id,
        street: p.street, city: p.city, postal_code: p.postal_code, country: p.country_code || company?.country,
        email: p.email || buyer.email,
      };
    }
  }
  if (company && !buyer.org_number && !buyer.vat_number) {
    const addr = splitAddress(company.address);
    buyer = {
      name: company.name || buyer.name, org_number: company.org_number, vat_number: company.vat_number, peppol_id: company.peppol_id,
      street: buyer.street || addr.street, city: buyer.city || addr.city, postal_code: buyer.postal_code || addr.postal_code,
      country: buyer.country || company.country, email: buyer.email,
    };
  }


  type RawLine = { description?: unknown; qty?: unknown; quantity?: unknown; unit_price_cents?: unknown; discount_pct?: unknown; unit?: unknown };
  const lines = ((invoice.line_items as RawLine[]) ?? []).map((l) => ({
    description: String(l.description ?? ''),
    qty: Number(l.qty ?? l.quantity ?? 0),
    unit_price_cents: Number(l.unit_price_cents ?? 0),
    discount_pct: l.discount_pct != null ? Number(l.discount_pct) : null,
    unit: l.unit != null ? String(l.unit) : null,
  }));

  if (lines.length === 0 && invoice.invoice_type === 'credit_note') {
    // Older credit notes stored amounts only. One line for the credited amount keeps the
    // document's arithmetic equal to the row's (subtotal → VAT → total).
    lines.push({ description: String(invoice.notes ?? `Credit note for ${creditedNumber ?? ''}`).trim() || 'Credit', qty: 1,
      unit_price_cents: Math.abs(Number(invoice.subtotal_cents ?? 0)), discount_pct: null, unit: null });
  }

  const input: UblInvoiceInput = {
    invoice_number: String(invoice.invoice_number),
    invoice_type: invoice.invoice_type === 'credit_note' ? 'credit_note' : 'invoice',
    issue_date: String(invoice.issue_date ?? '').slice(0, 10),
    due_date: invoice.due_date ? String(invoice.due_date).slice(0, 10) : null,
    currency: String(invoice.currency ?? 'SEK'),
    tax_rate: Number(invoice.tax_rate ?? 0),
    lines,
    paid_amount_cents: Number(invoice.paid_amount_cents ?? 0),
    buyer_reference: invoice.buyer_reference ?? creditedBuyerRef ?? null,
    order_reference: null,
    credited_invoice_number: creditedNumber,
    payment_terms: invoice.payment_terms ?? null,
    note: invoice.notes ?? null,
    seller, buyer,
    payment: { bankgiro: settings.bankgiro, iban: settings.iban, bic: settings.bic },
  };
  return { input, invoice, settings };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const url = new URL(req.url);
    const body = req.method === 'POST' ? await req.json().catch(() => ({})) : Object.fromEntries(url.searchParams);
    const skill = String(body._skill ?? '');
    const action = String(body.action ?? (skill === 'send_einvoice' ? 'dispatch' : skill === 'export_invoice_ubl' ? 'export' : 'export'));
    const invoiceId = String(body.invoice_id ?? body.id ?? '');
    if (!invoiceId) return json({ error: 'invoice_id is required' }, 400);

    const supabase = getServiceClient();
    const auth = await requireServiceOrModule(req, supabase, 'invoicing');
    if (!auth.authorized) return unauthorized(corsHeaders);

    if (action === 'list') {
      const { data, error } = await supabase.from('einvoice_dispatches')
        .select('id, status, provider, provider_ref, recipient_id, sender_id, validation, error_message, created_at, sent_at')
        .eq('invoice_id', invoiceId).order('created_at', { ascending: false }).limit(50);
      if (error) return json({ error: error.message }, 500);
      return json({ dispatches: data ?? [] });
    }

    const g = await gather(supabase, invoiceId);
    if ('error' in g) return json({ error: g.error }, g.status);
    const result = buildUblInvoice(g.input);

    if (action === 'export') {
      if (body.download === true || body.download === '1' || url.searchParams.get('download') === '1') {
        return new Response(result.xml, {
          headers: {
            ...corsHeaders,
            'Content-Type': 'application/xml; charset=utf-8',
            'Content-Disposition': `attachment; filename="${String(g.invoice.invoice_number).replace(/[^A-Za-z0-9._-]/g, '_')}.xml"`,
          },
        });
      }
      return json({
        success: true, invoice_id: invoiceId, invoice_number: g.invoice.invoice_number,
        format: 'peppol-bis-3', xml: result.xml, validation: result.validation, totals: result.totals,
        recipient_id: result.recipient_id, sender_id: result.sender_id,
      });
    }

    if (action === 'dispatch') {
      const dryRun = body.dry_run === true;
      const apUrl = (g.settings.access_point_url ?? '').trim();
      const apToken = Deno.env.get('PEPPOL_AP_TOKEN') ?? '';
      const provider = apUrl ? (g.settings.access_point_name || new URL(apUrl).hostname) : null;
      const plan = {
        invoice_id: invoiceId, invoice_number: g.invoice.invoice_number,
        recipient_id: result.recipient_id, sender_id: result.sender_id,
        validation: result.validation, provider,
        would_simulate: !provider,
        message: !result.validation.ok
          ? `The document fails ${result.validation.errors.length} rule(s); nothing would be sent.`
          : provider
            ? `Would send ${g.invoice.invoice_number} to ${result.recipient_id} via ${provider}.`
            : 'No access point configured — the attempt would be recorded as simulated and reach nobody.',
      };
      if (dryRun) return json({ success: true, dry_run: true, ...plan });

      if (!result.validation.ok) {
        return json({ success: false, error: 'E-invoice refused: the document fails validation', ...plan }, 422);
      }

      const row: Record<string, unknown> = {
        invoice_id: invoiceId, format: 'peppol-bis-3', recipient_id: result.recipient_id, sender_id: result.sender_id,
        validation: result.validation, xml: result.xml, provider, created_by: auth.userId ?? null,
      };
      if (!provider) {
        row.status = 'simulated';
        row.error_message = 'No access point configured (Invoices → E-invoice). Recorded, not sent.';
      } else {
        try {
          const res = await fetch(apUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/xml', ...(apToken ? { Authorization: `Bearer ${apToken}` } : {}) },
            body: result.xml,
          });
          const text = await res.text();
          if (res.ok) {
            let ref: string | null = null;
            try { const j = JSON.parse(text); ref = j.id ?? j.message_id ?? j.transmission_id ?? null; } catch { /* plain text answer */ }
            row.status = 'sent'; row.provider_ref = ref; row.sent_at = new Date().toISOString();
          } else {
            row.status = 'failed'; row.error_message = `${provider} answered ${res.status}: ${text.slice(0, 500)}`;
          }
        } catch (e) {
          row.status = 'failed'; row.error_message = `${provider} unreachable: ${(e as Error).message}`;
        }
      }
      const { data: saved, error: saveErr } = await supabase.from('einvoice_dispatches').insert(row)
        .select('id, status, provider, provider_ref, recipient_id, error_message, created_at, sent_at').single();
      if (saveErr) return json({ error: `Could not record the dispatch: ${saveErr.message}` }, 500);
      return json({ success: row.status === 'sent' || row.status === 'simulated', dispatch: saved, ...plan,
        message: row.status === 'simulated' ? row.error_message : row.status === 'sent' ? `Sent to ${result.recipient_id} via ${provider}.` : row.error_message });
    }

    return json({ error: `Unknown action: ${action} (export, dispatch, list)` }, 400);
  } catch (e) {
    console.error('[einvoice]', e);
    return json({ error: (e as Error).message ?? 'Internal error' }, 500);
  }
});
