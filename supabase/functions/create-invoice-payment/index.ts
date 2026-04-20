// Create a Stripe Checkout session for an invoice. Public — uses public_token.
import Stripe from 'https://esm.sh/stripe@14.21.0?target=deno';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  try {
    const { public_token, return_url } = await req.json();
    if (!public_token) {
      return new Response(JSON.stringify({ error: 'public_token required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    const { data: invoice, error } = await supabase
      .from('invoices')
      .select('*')
      .eq('public_token', public_token)
      .single();
    if (error || !invoice) throw new Error('Invoice not found');

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
    if (!stripeKey) throw new Error('Stripe not configured');
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
          currency: (invoice.currency || 'SEK').toLowerCase(),
          product_data: {
            name: `Invoice ${invoice.invoice_number}`,
            description: invoice.notes || undefined,
          },
          unit_amount: invoice.total_cents,
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
