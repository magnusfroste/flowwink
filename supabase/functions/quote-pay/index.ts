// Public quote payment endpoint (sign-and-pay, Odoo portal parity).
// Creates a Stripe Checkout session for the invoice that quote-sign auto-created
// when the customer accepted the quote. Auth is by accept_token ONLY — the
// invoice is resolved server-side from the quote row; a client can never point
// this at an arbitrary invoice id.
//
// Amount rules (mirrors get_quote_payment_status in migration 20260704140000):
//   - nothing paid yet AND quotes.prepayment_pct set → deposit share
//     (round(total × pct / 100), clamped to the remaining balance)
//   - otherwise → remaining balance (total_cents − paid_amount_cents)
// Confirmation lands in stripe-webhook (checkout.session.completed →
// record_invoice_payment), never here.
//
// Unconfigured instances (no STRIPE_SECRET_KEY) get HTTP 200 with
// { configured: false } so the public page can degrade gracefully instead of
// hard-failing — same fail-forward stance as create-checkout's sandbox check.
import Stripe from 'https://esm.sh/stripe@14.21.0?target=deno';
import { getServiceClient } from '../_shared/supabase-clients.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const { accept_token, return_url } = (await req.json()) as {
      accept_token?: string;
      return_url?: string;
    };
    if (!accept_token) return json({ error: 'accept_token required' }, 400);

    const supabase = getServiceClient();

    // 1) Resolve quote by accept_token (the only trust anchor).
    const { data: quote, error: qErr } = await supabase
      .from('quotes')
      .select('id, quote_number, status, invoice_id, prepayment_pct, customer_email')
      .eq('accept_token', accept_token)
      .maybeSingle();
    if (qErr || !quote) return json({ error: 'Quote not found' }, 404);

    if (quote.status !== 'accepted') {
      return json({ error: 'Quote must be accepted before payment' }, 409);
    }
    if (!quote.invoice_id) {
      return json({ error: 'No invoice exists for this quote yet' }, 409);
    }

    // 2) Resolve the linked invoice server-side.
    const { data: invoice, error: iErr } = await supabase
      .from('invoices')
      .select('id, invoice_number, status, total_cents, paid_amount_cents, currency, customer_email, notes')
      .eq('id', quote.invoice_id)
      .maybeSingle();
    if (iErr || !invoice) return json({ error: 'Invoice not found' }, 404);
    if (invoice.status === 'cancelled') return json({ error: 'Invoice cancelled' }, 409);

    const paid = invoice.paid_amount_cents ?? 0;
    const remaining = Math.max(0, invoice.total_cents - paid);
    if (remaining <= 0 || invoice.status === 'paid') {
      return json({ already_paid: true, invoice_number: invoice.invoice_number });
    }

    // 3) Amount: prepayment share on the first payment, remainder afterwards.
    const pct = quote.prepayment_pct != null ? Number(quote.prepayment_pct) : null;
    const isDeposit = paid === 0 && pct != null && pct >= 1 && pct <= 100;
    const amountCents = isDeposit
      ? Math.min(remaining, Math.max(1, Math.round((invoice.total_cents * pct) / 100)))
      : remaining;

    // 4) Graceful degrade when Stripe isn't configured (Law 4: key present = works).
    const stripeKey = Deno.env.get('STRIPE_SECRET_KEY');
    if (!stripeKey) {
      return json({
        configured: false,
        message: 'Online payment is not configured on this site — the invoice will be sent separately.',
      });
    }
    const stripe = new Stripe(stripeKey, { apiVersion: '2024-11-20.acacia' });

    const origin = (req.headers.get('origin') || return_url || '').replace(/\/+$/, '');
    const successUrl = `${origin}/quote/${accept_token}?payment=success`;
    const cancelUrl = `${origin}/quote/${accept_token}?payment=cancelled`;

    const label = isDeposit
      ? `Invoice ${invoice.invoice_number} — ${pct}% prepayment (quote ${quote.quote_number})`
      : `Invoice ${invoice.invoice_number} (quote ${quote.quote_number})`;

    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      payment_method_types: ['card'],
      customer_email: invoice.customer_email || quote.customer_email || undefined,
      line_items: [{
        price_data: {
          currency: (invoice.currency || 'SEK').toLowerCase(),
          product_data: { name: label, description: invoice.notes || undefined },
          unit_amount: amountCents,
        },
        quantity: 1,
      }],
      // stripe-webhook's checkout.session.completed branch keys on invoice_id;
      // quote_id lets it stamp quotes.paid_at (sign-and-pay confirmation).
      metadata: {
        invoice_id: invoice.id,
        invoice_number: invoice.invoice_number,
        quote_id: quote.id,
        quote_number: quote.quote_number,
      },
      success_url: successUrl,
      cancel_url: cancelUrl,
    });

    // Store the session URL for resending, same as create-invoice-payment.
    await supabase.from('invoices').update({ payment_url: session.url }).eq('id', invoice.id);

    return json({
      url: session.url,
      amount_cents: amountCents,
      currency: invoice.currency || 'SEK',
      prepayment: isDeposit,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Unknown error';
    console.error('[quote-pay]', msg);
    return json({ error: msg }, 500);
  }
});
