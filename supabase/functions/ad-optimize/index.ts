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

    const { campaign_id, action = 'analyze', threshold_ctr = 0.5, threshold_cpc_cents = 5000 } = await req.json();

    // Fetch campaigns
    let query = supabase.from('ad_campaigns').select('*').in('status', ['active', 'draft']);
    if (campaign_id) query = query.eq('id', campaign_id);
    const { data: campaigns, error: campErr } = await query;
    if (campErr) throw campErr;

    // Fetch all creatives
    const campaignIds = (campaigns || []).map((c: any) => c.id);
    const { data: creatives } = campaignIds.length > 0
      ? await supabase.from('ad_creatives').select('*').in('campaign_id', campaignIds)
      : { data: [] };

    const recommendations: any[] = [];

    for (const campaign of campaigns || []) {
      const metrics = campaign.metrics || {};
      const impressions = metrics.impressions || 0;
      const clicks = metrics.clicks || 0;
      const ctr = impressions > 0 ? (clicks / impressions) * 100 : 0;
      const cpcCents = clicks > 0 ? Math.round(campaign.spent_cents / clicks) : 0;
      const campaignCreatives = (creatives || []).filter((cr: any) => cr.campaign_id === campaign.id);

      if (action === 'analyze' || action === 'pause_underperformers') {
        if (ctr < threshold_ctr && impressions > 100) {
          recommendations.push({
            campaign_id: campaign.id,
            campaign_name: campaign.name,
            action: 'pause',
            reason: `CTR (${ctr.toFixed(2)}%) below threshold (${threshold_ctr}%)`,
            current_metrics: { impressions, clicks, ctr: ctr.toFixed(2) + '%', cpc_cents: cpcCents },
          });
        }
        if (cpcCents > threshold_cpc_cents && clicks > 5) {
          recommendations.push({
            campaign_id: campaign.id,
            campaign_name: campaign.name,
            action: 'reduce_budget',
            reason: `CPC (${(cpcCents / 100).toFixed(2)}) exceeds threshold (${(threshold_cpc_cents / 100).toFixed(2)})`,
            current_metrics: { impressions, clicks, ctr: ctr.toFixed(2) + '%', cpc_cents: cpcCents },
          });
        }

        // Check individual creative performance
        for (const creative of campaignCreatives) {
          const perf = creative.performance || {};
          const crCtr = (perf.impressions || 0) > 0 ? ((perf.clicks || 0) / perf.impressions) * 100 : 0;
          if (crCtr < threshold_ctr / 2 && (perf.impressions || 0) > 50) {
            recommendations.push({
              campaign_id: campaign.id,
              creative_id: creative.id,
              action: 'pause_creative',
              reason: `Creative CTR (${crCtr.toFixed(2)}%) well below threshold`,
            });
          }
        }
      }

      if (action === 'scale_winners') {
        if (ctr > threshold_ctr * 2 && cpcCents < threshold_cpc_cents / 2) {
          recommendations.push({
            campaign_id: campaign.id,
            campaign_name: campaign.name,
            action: 'increase_budget',
            reason: `High CTR (${ctr.toFixed(2)}%) and low CPC — scaling recommended`,
            suggested_budget_cents: Math.round(campaign.budget_cents * 1.5),
          });
        }
      }
    }

    // Apply changes if action is not just analyze
    if (action === 'pause_underperformers') {
      for (const rec of recommendations.filter(r => r.action === 'pause')) {
        await supabase.from('ad_campaigns').update({ status: 'paused' }).eq('id', rec.campaign_id);
      }
      for (const rec of recommendations.filter(r => r.action === 'pause_creative')) {
        await supabase.from('ad_creatives').update({ status: 'paused' }).eq('id', rec.creative_id);
      }
    }

    if (action === 'scale_winners') {
      for (const rec of recommendations.filter(r => r.action === 'increase_budget')) {
        await supabase.from('ad_campaigns').update({ budget_cents: rec.suggested_budget_cents }).eq('id', rec.campaign_id);
      }
    }

    return new Response(JSON.stringify({
      status: 'success',
      action,
      recommendations,
      applied: action !== 'analyze',
      message: recommendations.length === 0
        ? 'All campaigns performing within thresholds.'
        : `Found ${recommendations.length} optimization${recommendations.length > 1 ? 's' : ''}.`,
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
