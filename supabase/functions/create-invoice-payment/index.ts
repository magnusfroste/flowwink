// Create a Stripe Checkout session for an invoice. Public — uses public_token.
import Stripe from 'https://esm.sh/stripe@14.21.0?target=denonext';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';
import { getServiceClient } from '../_shared/supabase-clients.ts';
import { toStripeAmount } from '../_shared/locale/home.ts';
import { loadHome } from '../_shared/locale/load-home.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  try {
    const { public_token, return_url, probe } = await req.json();
    // Can a card be taken here? The key lives in this runtime, so the invoice
    // page asks before it draws a button: a key, and an integration the
    // operator has not switched off (the rule the integrations page states).
    // Until 2026-11-17 the page drew "Pay" on every instance and the customer
    // of one without Stripe was answered "Failed to start payment".
    const cardAvailable = async (): Promise<boolean> => {
      if (!Deno.env.get('STRIPE_SECRET_KEY')) return false;
      const { data, error: readErr } = await getServiceClient().from('site_settings').select('value').eq('key', 'integrations').maybeSingle();
      if (readErr) console.warn('[create-invoice-payment] could not read the integrations row, taking the key as the answer:', readErr.message);
      return (data?.value as { stripe?: { enabled?: boolean } } | null)?.stripe?.enabled !== false;
    };
    if (probe === true) {
      return new Response(JSON.stringify({ available: await cardAvailable() }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    if (!public_token) {
      return new Response(JSON.stringify({ error: 'public_token required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabase = getServiceClient();

    const { data: invoice, error } = await supabase
      .from('invoices')
      .select('*')
      .eq('public_token', public_token)
      .single();
    if (error || !invoice) throw new Error('Invoice not found');
    // A legacy row without a currency is charged in the business's, never a literal SEK.
    const invoiceCurrency = String(invoice.currency || (await loadHome(supabase)).currency).toUpperCase();

    if (invoice.status === 'paid') {
      return new Response(JSON.stringify({ error: 'Invoice already paid' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    if (invoice.status === 'cancelled') {
      return new Response(JSON.stringify({ error: 'Invoice cancelled' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const stripeKey = Deno.env.get('STRIPE_SECRET_KEY');
    if (!stripeKey || !(await cardAvailable())) {
      return new Response(JSON.stringify({ error: 'Card payment is not available for this invoice', code: 'CARD_NOT_AVAILABLE' }), {
        status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const stripe = new Stripe(stripeKey, { apiVersion: '2024-11-20.acacia' });

    const origin = req.headers.get('origin') || return_url || '';
    const successUrl = `${origin}/invoice/${public_token}?paid=1`;
    const cancelUrl = `${origin}/invoice/${public_token}`;

    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      payment_method_types: ['card'],
      customer_email: invoice.customer_email || undefined,
      line_items: [{
        price_data: {
          currency: invoiceCurrency.toLowerCase(),
          product_data: {
            name: `Invoice ${invoice.invoice_number}`,
            description: invoice.notes || undefined,
          },
          unit_amount: toStripeAmount(invoice.total_cents, invoiceCurrency),
        },
        quantity: 1,
      }],
      metadata: {
        invoice_id: invoice.id,
        invoice_number: invoice.invoice_number,
      },
      success_url: successUrl,
      cancel_url: cancelUrl,
    });

    // Store URL on invoice for resending
    await supabase.from('invoices')
      .update({ payment_url: session.url })
      .eq('id', invoice.id);

    return new Response(JSON.stringify({ url: session.url }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Unknown error';
    console.error('[create-invoice-payment]', msg);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
