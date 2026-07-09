// Public quote signing endpoint.
// Atomically: records signature, sets quote.status, and on accept:
//   - generates a draft invoice from quote.line_items / totals
//   - links invoice back to the quote (invoice_id + converted_to_invoice_id)
//   - emails customer the receipt and admins an internal notice via `email-send`
// Bypasses JWT verification — auth is by accept_token + quote.status check.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';
import { getServiceClient } from '../_shared/supabase-clients.ts';
import { sha256Hex } from '../_shared/agent-audit.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

interface Body {
  accept_token: string;
  action: 'accept' | 'reject';
  signer_name: string;
  signer_email: string;
  signature_data?: string;
  /** Optional drawn signature — data:image/png base64 data-URL from the public sign page. */
  signature_image?: string;
  comment?: string;
  user_agent?: string;
}

/** Accept only reasonably-sized PNG/JPEG data-URLs; anything else is dropped (typed name still recorded). */
function sanitizeSignatureImage(img: string | undefined): string | null {
  if (!img) return null;
  if (img.length > 300_000) return null; // ~220KB binary — far above any real signature stroke
  if (!/^data:image\/(png|jpeg);base64,[A-Za-z0-9+/=]+$/.test(img)) return null;
  return img;
}

function fmtMoney(cents: number, currency: string) {
  return new Intl.NumberFormat('sv-SE', { style: 'currency', currency }).format((cents || 0) / 100);
}

function escapeHtml(s: string) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const body = (await req.json()) as Body;
    if (!body.accept_token || !body.action || !body.signer_name || !body.signer_email) {
      return new Response(JSON.stringify({ error: 'Missing required fields' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabase = getServiceClient();

    // 1) Look up quote by accept_token
    const { data: quote, error: qErr } = await supabase
      .from('quotes')
      .select('*')
      .eq('accept_token', body.accept_token)
      .maybeSingle();

    if (qErr || !quote) {
      return new Response(JSON.stringify({ error: 'Quote not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (!['sent', 'viewed'].includes(quote.status)) {
      return new Response(JSON.stringify({ error: `Quote already ${quote.status}` }), {
        status: 409,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Expiry gate (Odoo parity: an expired quote can no longer be signed).
    // valid_until is a DATE — the quote is valid through that day, expired the day after.
    const today = new Date().toISOString().slice(0, 10);
    if (body.action === 'accept' && quote.valid_until && quote.valid_until < today) {
      return new Response(
        JSON.stringify({
          error: `This quote expired on ${quote.valid_until} — contact us for a renewed offer`,
          code: 'quote_expired',
          expired_on: quote.valid_until,
        }),
        { status: 410, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const ip =
      req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
      req.headers.get('x-real-ip') ||
      null;

    // Content hash: SHA-256 of the canonical quote content at signing time —
    // durable tamper-evidence stored on the signature row and shown on the certificate.
    const contentHash = await sha256Hex(JSON.stringify({
      quote_number: quote.quote_number,
      title: quote.title ?? null,
      intro_text: quote.intro_text ?? null,
      terms_text: quote.terms_text ?? null,
      line_items: quote.line_items ?? [],
      subtotal_cents: quote.subtotal_cents,
      tax_cents: quote.tax_cents,
      total_cents: quote.total_cents,
      currency: quote.currency,
      valid_until: quote.valid_until ?? null,
      version: quote.version ?? 1,
    }));

    // 2) Record signature
    const { error: sigErr } = await supabase.from('quote_signatures').insert({
      quote_id: quote.id,
      action: body.action,
      signer_name: body.signer_name,
      signer_email: body.signer_email,
      signature_data: body.signature_data ?? body.signer_name,
      signature_image: sanitizeSignatureImage(body.signature_image),
      content_hash: contentHash,
      comment: body.comment ?? null,
      ip_address: ip,
      user_agent: body.user_agent ?? req.headers.get('user-agent') ?? null,
    });
    if (sigErr) throw sigErr;

    // 3) Update quote status
    const updates: Record<string, unknown> = {};
    const nowIso = new Date().toISOString();
    if (body.action === 'accept') {
      updates.status = 'accepted';
      updates.accepted_at = nowIso;
    } else {
      updates.status = 'rejected';
      updates.rejected_at = nowIso;
    }
    const { error: updErr } = await supabase.from('quotes').update(updates).eq('id', quote.id);
    if (updErr) throw updErr;

    // 4) Audit log
    await supabase.from('audit_logs').insert({
      action: `quote.${body.action}`,
      entity_type: 'quote',
      entity_id: quote.id,
      metadata: {
        quote_number: quote.quote_number,
        signer_name: body.signer_name,
        signer_email: body.signer_email,
        total_cents: quote.total_cents,
        currency: quote.currency,
        content_hash: contentHash,
      },
    });

    let invoice: any = null;

    // 5) On accept → auto-create invoice (Quote-to-Cash close)
    if (body.action === 'accept' && !quote.converted_to_invoice_id && !quote.invoice_id) {
      // Canonical INV-YYYY-NNNNN series (matches manage_invoice / convert_to_invoice /
      // send_invoice_for_order). The old INV-${count+1} scheme diverged in format AND
      // counted every invoice-row series (SUB-/CN-/POS-/CTR-), breaking sequential
      // customer-invoice numbering. Fixed in the same 2026-07-09 sweep.
      const yr = new Date().getFullYear();
      const { data: lastInv } = await supabase.from('invoices')
        .select('invoice_number').ilike('invoice_number', `INV-${yr}-%`)
        .order('invoice_number', { ascending: false }).limit(1).maybeSingle();
      let nextNum = 1;
      const lm = String(lastInv?.invoice_number || '').match(/INV-\d{4}-(\d+)/);
      if (lm) nextNum = parseInt(lm[1], 10) + 1;
      const invoiceNumber = `INV-${yr}-${String(nextNum).padStart(5, '0')}`;

      // Default due date: 14 days
      const due = new Date();
      due.setDate(due.getDate() + 14);
      const dueDate = due.toISOString().slice(0, 10);

      const { data: inv, error: invErr } = await supabase
        .from('invoices')
        .insert({
          invoice_number: invoiceNumber,
          lead_id: quote.lead_id,
          deal_id: quote.deal_id,
          customer_email: body.signer_email || quote.customer_email || '',
          customer_name: body.signer_name || quote.customer_name || '',
          line_items: quote.line_items ?? [],
          subtotal_cents: quote.subtotal_cents,
          tax_rate: quote.tax_rate,
          tax_cents: quote.tax_cents,
          total_cents: quote.total_cents,
          currency: quote.currency,
          notes: quote.notes,
          due_date: dueDate,
          status: 'draft',
          payment_terms: 'Net 14',
        })
        .select()
        .single();

      if (invErr) {
        console.error('Failed to auto-create invoice:', invErr);
      } else {
        invoice = inv;
        await supabase
          .from('quotes')
          .update({
            invoice_id: inv.id,
            converted_to_invoice_id: inv.id,
            converted_at: nowIso,
          })
          .eq('id', quote.id);

        await supabase.from('audit_logs').insert({
          action: 'invoice.auto_created',
          entity_type: 'invoice',
          entity_id: inv.id,
          metadata: {
            from_quote_id: quote.id,
            quote_number: quote.quote_number,
            invoice_number: invoiceNumber,
            total_cents: inv.total_cents,
          },
        });
      }
    }

    // 6) Send confirmation emails (best-effort, non-blocking failures)
    try {
      // Resolve site name
      const { data: settings } = await supabase
        .from('site_settings')
        .select('value')
        .eq('key', 'general')
        .maybeSingle();
      const siteName = (settings?.value as any)?.site_name || 'FlowWink';

      const total = fmtMoney(quote.total_cents, quote.currency || 'SEK');

      if (body.action === 'accept') {
        // Customer receipt
        const customerHtml = `<!doctype html><html><body style="font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;background:#f6f7f9;margin:0;padding:24px;color:#111">
  <div style="max-width:560px;margin:0 auto;background:#fff;border-radius:12px;padding:32px;border:1px solid #e6e8ec">
    <h1 style="margin:0 0 8px;font-size:20px">Thank you for accepting quote ${escapeHtml(quote.quote_number)}</h1>
    <p style="margin:0 0 16px;color:#4b5563">Hi ${escapeHtml(body.signer_name)}, we've received your acceptance and our team has been notified.</p>
    <div style="background:#f9fafb;border:1px solid #e6e8ec;border-radius:8px;padding:16px;margin:16px 0">
      <div style="display:flex;justify-content:space-between;margin-bottom:6px"><span style="color:#6b7280">Quote</span><strong>${escapeHtml(quote.quote_number)}</strong></div>
      <div style="display:flex;justify-content:space-between;margin-bottom:6px"><span style="color:#6b7280">Total</span><strong>${total}</strong></div>
      ${invoice ? `<div style="display:flex;justify-content:space-between"><span style="color:#6b7280">Invoice</span><strong>${escapeHtml(invoice.invoice_number)}</strong></div>` : ''}
    </div>
    ${invoice ? `<p style="margin:16px 0 0;color:#4b5563">An invoice (${escapeHtml(invoice.invoice_number)}) will be issued shortly. You'll receive it separately.</p>` : ''}
    <hr style="border:none;border-top:1px solid #e6e8ec;margin:24px 0"/>
    <p style="margin:0;font-size:12px;color:#9ca3af">Sent by ${escapeHtml(siteName)}</p>
  </div>
</body></html>`;

        await supabase.functions.invoke('email-send', {
          body: {
            to: body.signer_email,
            subject: `Thank you — Quote ${quote.quote_number} accepted`,
            html: customerHtml,
          },
        });
      }

      // Internal notification to admins
      const adminHtml = `<!doctype html><html><body style="font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;padding:24px">
  <h2>Quote ${escapeHtml(quote.quote_number)} ${body.action === 'accept' ? 'ACCEPTED ✅' : 'REJECTED ❌'}</h2>
  <p><strong>Signer:</strong> ${escapeHtml(body.signer_name)} &lt;${escapeHtml(body.signer_email)}&gt;</p>
  <p><strong>Total:</strong> ${total}</p>
  ${body.comment ? `<p><strong>Comment:</strong><br/>${escapeHtml(body.comment)}</p>` : ''}
  ${invoice ? `<p><strong>Invoice auto-created:</strong> ${escapeHtml(invoice.invoice_number)} (draft, due ${escapeHtml(invoice.due_date)})</p>` : ''}
</body></html>`;

      // Best-effort lookup of admin emails
      const { data: admins } = await supabase
        .from('user_roles')
        .select('user_id, profiles:profiles!inner(email)')
        .eq('role', 'admin')
        .limit(5);
      const adminEmails = (admins || [])
        .map((r: any) => r?.profiles?.email)
        .filter(Boolean);

      if (adminEmails.length) {
        await supabase.functions.invoke('email-send', {
          body: {
            to: adminEmails,
            subject: `Quote ${quote.quote_number} ${body.action === 'accept' ? 'accepted' : 'rejected'}`,
            html: adminHtml,
          },
        });
      }
    } catch (emailErr) {
      console.error('Email notification failed (non-fatal):', emailErr);
    }

    return new Response(
      JSON.stringify({ success: true, action: body.action, invoice }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (err) {
    console.error('quote-sign error:', err);
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
