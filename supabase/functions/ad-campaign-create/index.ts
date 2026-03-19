import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    const { name, platform = 'meta', objective, budget_cents, currency = 'SEK', target_audience = {}, start_date, end_date } = await req.json();

    if (!name || !objective || !budget_cents) {
      return new Response(JSON.stringify({ error: 'Missing required fields: name, objective, budget_cents' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { data, error } = await supabase
      .from('ad_campaigns')
      .insert({
        name,
        platform,
        objective,
        budget_cents,
        currency,
        target_audience,
        start_date: start_date || null,
        end_date: end_date || null,
        status: 'draft',
      })
      .select()
      .single();

    if (error) throw error;

    return new Response(JSON.stringify({
      status: 'success',
      campaign: data,
      message: `Campaign "${name}" created as draft on ${platform}. Budget: ${(budget_cents / 100).toFixed(2)} ${currency}/day.`,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
