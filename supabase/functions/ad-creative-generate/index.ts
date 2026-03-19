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

    const { campaign_id, type = 'text', tone = 'professional', key_message, cta } = await req.json();

    if (!campaign_id) {
      return new Response(JSON.stringify({ error: 'campaign_id is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Fetch campaign for context
    const { data: campaign, error: campErr } = await supabase
      .from('ad_campaigns')
      .select('*')
      .eq('id', campaign_id)
      .single();

    if (campErr || !campaign) {
      return new Response(JSON.stringify({ error: 'Campaign not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Generate ad copy using AI
    const aiPrompt = `Generate ad creative for a ${campaign.platform} ${campaign.objective} campaign.
Campaign: ${campaign.name}
Tone: ${tone}
Type: ${type}
${key_message ? `Key message: ${key_message}` : ''}
${cta ? `CTA: ${cta}` : ''}
Target audience: ${JSON.stringify(campaign.target_audience)}

Return JSON with: headline (max 40 chars), body (max 125 chars), cta_text (max 20 chars).`;

    // Use OpenAI or Gemini based on available keys
    const openaiKey = Deno.env.get('OPENAI_API_KEY');
    const geminiKey = Deno.env.get('GEMINI_API_KEY');

    let headline = `Discover ${campaign.name}`;
    let body = key_message || `Transform your business with our ${campaign.objective} solution.`;
    let ctaText = cta || 'Learn More';

    if (openaiKey) {
      try {
        const aiRes = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${openaiKey}` },
          body: JSON.stringify({
            model: 'gpt-4.1-mini',
            messages: [
              { role: 'system', content: 'You generate ad copy. Return valid JSON only.' },
              { role: 'user', content: aiPrompt },
            ],
            response_format: { type: 'json_object' },
          }),
        });
        const aiData = await aiRes.json();
        const parsed = JSON.parse(aiData.choices?.[0]?.message?.content || '{}');
        if (parsed.headline) headline = parsed.headline;
        if (parsed.body) body = parsed.body;
        if (parsed.cta_text) ctaText = parsed.cta_text;
      } catch { /* fallback to defaults */ }
    }

    // Save creative
    const { data: creative, error: createErr } = await supabase
      .from('ad_creatives')
      .insert({
        campaign_id,
        type,
        headline,
        body,
        cta_text: ctaText,
        status: 'draft',
      })
      .select()
      .single();

    if (createErr) throw createErr;

    return new Response(JSON.stringify({
      status: 'success',
      creative,
      message: `Generated ${type} creative: "${headline}"`,
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
