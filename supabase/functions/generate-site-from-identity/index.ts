import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

const AVAILABLE_BLOCKS = [
  'hero', 'text', 'cta', 'features', 'stats', 'testimonials', 'pricing',
  'accordion', 'form', 'newsletter', 'quote', 'two-column', 'info-box',
  'logos', 'comparison', 'social-proof', 'countdown', 'chat-launcher', 'separator',
];

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

    const body = await req.json().catch(() => ({}));
    const overrideTitle = body.page_title || null;
    const includeHeader = body.include_header !== false;
    const includeFooter = body.include_footer !== false;
    const includeLandingPage = body.include_landing_page !== false;

    // ── 1. Read Business Identity ──────────────────────────────
    const { data: setting } = await supabase
      .from('site_settings')
      .select('value')
      .eq('key', 'company_profile')
      .maybeSingle();

    const profile = (setting?.value ?? {}) as Record<string, unknown>;

    // Also read branding for visual context
    const { data: brandingSetting } = await supabase
      .from('site_settings')
      .select('value')
      .eq('key', 'branding')
      .maybeSingle();

    const branding = (brandingSetting?.value ?? {}) as Record<string, unknown>;

    // Build a summary of what data is actually available
    const availableData: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(profile)) {
      if (val && String(val).trim() && val !== '[]' && val !== '{}') {
        if (Array.isArray(val) && val.length === 0) continue;
        if (typeof val === 'object' && !Array.isArray(val) && Object.keys(val as object).length === 0) continue;
        availableData[key] = val;
      }
    }

    if (Object.keys(availableData).length < 2) {
      return new Response(JSON.stringify({
        error: 'Business Identity is too sparse. Please fill in at least company name, about, and services before generating a site.',
        available_fields: Object.keys(availableData),
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const geminiKey = Deno.env.get('GEMINI_API_KEY');
    if (!geminiKey) {
      return new Response(JSON.stringify({ error: 'GEMINI_API_KEY is not configured' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const companyName = String(availableData.company_name || 'Our Company');
    const pageTitle = overrideTitle || companyName;

    // ── 2. Single AI call to generate everything ───────────────
    const systemPrompt = `You are a senior web architect. You receive a Business Identity profile and must generate a complete website structure: a header, a footer, and landing page blocks.

You must REASON about the data: use ONLY information that actually exists in the profile. Do NOT invent services, stats, testimonials, or details that aren't provided. If a field is missing, skip blocks that would need it.

## Your output format (strict JSON):
{
  "header": {
    "type": "header",
    "data": {
      "logo_text": string,
      "nav_items": [{ "label": string, "href": string }],
      "cta_text": string (optional),
      "cta_href": string (optional)
    }
  },
  "footer": {
    "type": "footer",
    "data": {
      "company_name": string,
      "description": string (short tagline),
      "columns": [{ "title": string, "links": [{ "label": string, "href": string }] }],
      "contact_email": string (if available),
      "contact_phone": string (if available),
      "address": string (if available),
      "copyright_text": string
    }
  },
  "page_blocks": [
    { "id": "<uuid>", "type": "<block_type>", "data": { ... } }
  ]
}

## Available block types for page_blocks:
${AVAILABLE_BLOCKS.join(', ')}

## Block data schemas:
**hero**: { "title": string, "subtitle": string, "buttonText": string, "buttonLink": string, "alignment": "left"|"center" }
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
**chat-launcher**: { "title": string, "subtitle": string, "buttonText": string }
**separator**: { "style": "line"|"dots"|"space" }

## Critical Rules:
1. ONLY use data that exists in the profile — never fabricate
2. If profile has services → use features block with real service names
3. If profile has client_testimonials → use testimonials block with real quotes
4. If profile has differentiators → highlight them in hero or two-column
5. If profile has revenue/employees/stats → use stats block with real numbers
6. If profile has competitors → consider comparison block
7. If profile has value_proposition → use it as hero subtitle
8. If profile has pricing_notes → consider pricing block
9. Start page with hero, end with CTA
10. Use 5-10 blocks for the page
11. Header nav should link to logical sections using anchor IDs (#services, #about, etc.)
12. Footer should use real contact info if available
13. Return ONLY valid JSON — no markdown, no explanation`;

    const userPrompt = `Generate a complete website from this Business Identity:

${JSON.stringify(availableData, null, 2)}

${branding && Object.keys(branding).length > 0 ? `\nBranding context: ${JSON.stringify(branding)}` : ''}

Available data fields: ${Object.keys(availableData).join(', ')}
Missing data fields: ${['company_name', 'about_us', 'services', 'value_proposition', 'differentiators', 'target_industries', 'icp', 'competitors', 'pricing_notes', 'clients', 'client_testimonials', 'contact_email', 'contact_phone', 'address', 'revenue', 'employees'].filter(k => !availableData[k]).join(', ')}

Think carefully: which blocks make sense given ONLY the available data? Do not invent content for missing fields.`;

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
    if (!rawText) throw new Error('No content returned from AI');

    let result: { header?: Record<string, unknown>; footer?: Record<string, unknown>; page_blocks?: Array<{ id?: string; type: string; data: Record<string, unknown> }> };
    try {
      result = JSON.parse(rawText);
    } catch {
      const match = rawText.match(/\{[\s\S]*\}/);
      if (match) result = JSON.parse(match[0]);
      else throw new Error('Failed to parse AI response');
    }

    const created: { header?: string; footer?: string; page?: { id: string; slug: string; title: string; blocks_count: number } } = {};

    // ── 3. Create header global block ──────────────────────────
    if (includeHeader && result.header) {
      // Deactivate existing headers first
      await supabase.from('global_blocks').update({ is_active: false }).eq('slot', 'header');

      const { data: headerBlock, error: headerErr } = await supabase
        .from('global_blocks')
        .insert({
          slot: 'header',
          type: result.header.type || 'header',
          data: result.header.data || result.header,
          is_active: true,
        })
        .select('id')
        .single();

      if (headerErr) console.error('Header insert error:', headerErr);
      else created.header = headerBlock.id;
    }

    // ── 4. Create footer global block ──────────────────────────
    if (includeFooter && result.footer) {
      await supabase.from('global_blocks').update({ is_active: false }).eq('slot', 'footer');

      const { data: footerBlock, error: footerErr } = await supabase
        .from('global_blocks')
        .insert({
          slot: 'footer',
          type: result.footer.type || 'footer',
          data: result.footer.data || result.footer,
          is_active: true,
        })
        .select('id')
        .single();

      if (footerErr) console.error('Footer insert error:', footerErr);
      else created.footer = footerBlock.id;
    }

    // ── 5. Create landing page ─────────────────────────────────
    if (includeLandingPage && result.page_blocks && result.page_blocks.length > 0) {
      const contentJson = result.page_blocks
        .filter((b) => AVAILABLE_BLOCKS.includes(b.type))
        .map((b) => ({
          id: b.id || crypto.randomUUID(),
          type: b.type,
          data: b.data || {},
        }));

      if (contentJson.length > 0) {
        const slug = slugify(pageTitle);
        const { data: page, error: pageErr } = await supabase
          .from('pages')
          .insert({
            title: pageTitle,
            slug,
            status: 'draft',
            content_json: contentJson,
            meta_json: {
              description: String(availableData.value_proposition || availableData.about_us || `Website for ${companyName}`).substring(0, 160),
              composed_by: 'generate_site_from_identity',
              source_fields: Object.keys(availableData),
            },
          })
          .select('id, slug, title')
          .single();

        if (pageErr) console.error('Page insert error:', pageErr);
        else created.page = { id: page.id, slug: page.slug, title: page.title, blocks_count: contentJson.length };
      }
    }

    return new Response(JSON.stringify({
      status: 'success',
      created,
      profile_fields_used: Object.keys(availableData),
      message: `Site generated from Business Identity with ${Object.keys(availableData).length} data fields. ${created.header ? 'Header created. ' : ''}${created.footer ? 'Footer created. ' : ''}${created.page ? `Landing page "${created.page.title}" created as draft with ${created.page.blocks_count} blocks.` : ''}`,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('generate-site-from-identity error:', err);
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
