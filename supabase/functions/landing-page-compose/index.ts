import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const AVAILABLE_BLOCKS = [
  'hero', 'text', 'cta', 'features', 'stats', 'testimonials', 'pricing',
  'accordion', 'form', 'newsletter', 'quote', 'two-column', 'info-box',
  'logos', 'comparison', 'social-proof', 'countdown', 'chat-launcher', 'separator',
];

function generateBlockId(): string {
  return crypto.randomUUID();
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[åä]/g, 'a')
    .replace(/ö/g, 'o')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .substring(0, 60);
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    const { goal, target_audience, campaign_id, page_title, tone = 'professional', include_blocks = [] } = await req.json();

    if (!goal || !target_audience || !page_title) {
      return new Response(JSON.stringify({ error: 'goal, target_audience, and page_title are required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // If campaign_id is provided, fetch campaign context
    let campaignContext = '';
    if (campaign_id) {
      const { data: campaign } = await supabase
        .from('ad_campaigns')
        .select('name, objective, platform, target_audience, metrics')
        .eq('id', campaign_id)
        .single();
      if (campaign) {
        campaignContext = `\n\nLinked Campaign: "${campaign.name}"
Objective: ${campaign.objective || 'Not specified'}
Platform: ${campaign.platform}
Campaign target audience: ${JSON.stringify(campaign.target_audience)}`;
      }
    }

    // Build AI prompt
    const systemPrompt = `You are a landing page architect. You compose high-converting landing pages by selecting and configuring blocks from a predefined library.

Available block types: ${AVAILABLE_BLOCKS.join(', ')}

You MUST return a JSON array of content blocks. Each block has this structure:
{
  "id": "<uuid>",
  "type": "<block_type>",
  "data": { ... block-specific data ... }
}

## Block data schemas (use ONLY these fields):

**hero**: { "title": string, "subtitle": string, "buttonText": string, "buttonLink": string, "backgroundImage": string (optional), "alignment": "left"|"center" }
**text**: { "content": string (HTML allowed), "alignment": "left"|"center"|"right" }
**cta**: { "title": string, "subtitle": string, "buttonText": string, "buttonLink": string, "variant": "default"|"outline"|"gradient" }
**features**: { "title": string, "subtitle": string, "features": [{ "title": string, "description": string, "icon": string }] }
**stats**: { "title": string, "stats": [{ "value": string, "label": string }] }
**testimonials**: { "title": string, "testimonials": [{ "quote": string, "author": string, "role": string, "company": string }] }
**pricing**: { "title": string, "subtitle": string, "plans": [{ "name": string, "price": string, "features": string[], "buttonText": string, "highlighted": boolean }] }
**accordion**: { "title": string, "items": [{ "question": string, "answer": string }] }
**form**: { "title": string, "subtitle": string, "fields": [{ "name": string, "label": string, "type": "text"|"email"|"textarea", "required": boolean }], "submitText": string }
**newsletter**: { "title": string, "subtitle": string, "buttonText": string }
**quote**: { "quote": string, "author": string, "role": string }
**two-column**: { "leftTitle": string, "leftContent": string, "rightTitle": string, "rightContent": string }
**info-box**: { "title": string, "content": string, "variant": "info"|"success"|"warning" }
**logos**: { "title": string }
**comparison**: { "title": string, "items": [{ "feature": string, "us": string, "them": string }] }
**social-proof**: { "metric": string, "label": string }
**countdown**: { "title": string, "targetDate": string }
**chat-launcher**: { "title": string, "subtitle": string, "buttonText": string }
**separator**: { "style": "line"|"dots"|"space" }

## Rules:
1. Start with hero block
2. Use 5-10 blocks total
3. Include at least one conversion block (cta, form, newsletter, chat-launcher)
4. End with a CTA
5. Return ONLY the JSON array — no markdown, no explanation`;

    const userPrompt = `Create a landing page for:
Goal: ${goal}
Target audience: ${target_audience}
Tone: ${tone}
${include_blocks.length > 0 ? `Must include these blocks: ${include_blocks.join(', ')}` : ''}${campaignContext}

Return ONLY a valid JSON array of blocks.`;

    // Call AI via Gemini
    const geminiKey = Deno.env.get('GEMINI_API_KEY');
    if (!geminiKey) {
      return new Response(JSON.stringify({ error: 'GEMINI_API_KEY is not configured' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const aiResponse = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [
            { role: 'user', parts: [{ text: systemPrompt + '\n\n' + userPrompt }] },
          ],
          generationConfig: {
            responseMimeType: 'application/json',
            temperature: 0.7,
          },
        }),
      },
    );

    if (!aiResponse.ok) {
      const errText = await aiResponse.text();
      throw new Error(`Gemini API error: ${aiResponse.status} — ${errText}`);
    }

    const aiData = await aiResponse.json();
    const rawText = aiData.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!rawText) {
      throw new Error('No content returned from AI');
    }

    // Parse the JSON blocks
    let blocks: Array<{ id?: string; type: string; data: Record<string, unknown> }>;
    try {
      blocks = JSON.parse(rawText);
    } catch {
      // Try to extract JSON array from response
      const match = rawText.match(/\[[\s\S]*\]/);
      if (match) {
        blocks = JSON.parse(match[0]);
      } else {
        throw new Error('Failed to parse AI response as JSON');
      }
    }

    // Validate and normalize blocks
    const contentJson = blocks
      .filter((b) => AVAILABLE_BLOCKS.includes(b.type))
      .map((b) => ({
        id: b.id || generateBlockId(),
        type: b.type,
        data: b.data || {},
      }));

    if (contentJson.length === 0) {
      throw new Error('AI generated no valid blocks');
    }

    // Create the page as draft
    const slug = slugify(page_title);
    const { data: page, error: pageError } = await supabase
      .from('pages')
      .insert({
        title: page_title,
        slug,
        status: 'draft',
        content_json: contentJson,
        meta_json: {
          description: `Landing page: ${goal}`,
          campaign_id: campaign_id || null,
          composed_by: 'landing_page_compose',
          target_audience,
          tone,
        },
      })
      .select('id, slug, title')
      .single();

    if (pageError) throw pageError;

    return new Response(JSON.stringify({
      status: 'success',
      page: {
        id: page.id,
        slug: page.slug,
        title: page.title,
        blocks_count: contentJson.length,
        block_types: contentJson.map((b) => b.type),
      },
      message: `Landing page "${page_title}" created as draft with ${contentJson.length} blocks. Review at /admin/pages/${page.id}.`,
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
