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

    const { campaign_id, period = 'all' } = await req.json();

    // Fetch campaigns
    let query = supabase.from('ad_campaigns').select('*');
    if (campaign_id) {
      query = query.eq('id', campaign_id);
    }
    const { data: campaigns, error: campErr } = await query;
    if (campErr) throw campErr;

    // Fetch creatives for each campaign
    const campaignIds = (campaigns || []).map((c: any) => c.id);
    const { data: creatives } = campaignIds.length > 0
      ? await supabase.from('ad_creatives').select('*').in('campaign_id', campaignIds)
      : { data: [] };

    // Build performance summary
    const summary = (campaigns || []).map((c: any) => {
      const campaignCreatives = (creatives || []).filter((cr: any) => cr.campaign_id === c.id);
      const metrics = c.metrics || {};
      return {
        campaign_id: c.id,
        name: c.name,
        platform: c.platform,
        status: c.status,
        budget_cents: c.budget_cents,
        spent_cents: c.spent_cents,
        currency: c.currency,
        metrics: {
          impressions: metrics.impressions || 0,
          clicks: metrics.clicks || 0,
          ctr: metrics.clicks && metrics.impressions
            ? ((metrics.clicks / metrics.impressions) * 100).toFixed(2) + '%'
            : '0%',
          cpc_cents: metrics.clicks
            ? Math.round(c.spent_cents / metrics.clicks)
            : 0,
          conversions: metrics.conversions || 0,
        },
        creatives_count: campaignCreatives.length,
        active_creatives: campaignCreatives.filter((cr: any) => cr.status === 'active').length,
      };
    });

    const totals = {
      total_campaigns: summary.length,
      active_campaigns: summary.filter((s: any) => s.status === 'active').length,
      total_budget_cents: summary.reduce((sum: number, s: any) => sum + s.budget_cents, 0),
      total_spent_cents: summary.reduce((sum: number, s: any) => sum + s.spent_cents, 0),
    };

    return new Response(JSON.stringify({
      status: 'success',
      totals,
      campaigns: summary,
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
