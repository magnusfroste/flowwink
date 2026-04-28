/**
 * extract-receipt — AI Utility (Klass 1)
 *
 * Pure transformation: receipt image/PDF (base64) → structured expense fields.
 * No business context, no skills, no FlowPilot reasoning. Always-on utility per
 * AI-Utility-vs-Skill classification.
 *
 * Input:  { file_base64, mime_type, filename? }
 * Output: { vendor, expense_date, total_cents, vat_cents, vat_rate,
 *           currency, category, description, line_items[] }
 *
 * Logged to ai_usage_logs with source='expense-receipt'.
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';
import { resolveAiConfig } from '../_shared/ai-config.ts';
import { callAiCompletion } from '../_shared/ai-usage-logger.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const SYSTEM_PROMPT = `You extract structured expense data from receipt images or PDFs.
Return ONLY a single tool call with the extracted fields. No prose.

Rules:
- Amounts in cents (integer). Total = gross incl. VAT.
- Date in YYYY-MM-DD. If unclear, use today.
- VAT rate: detect from receipt; common SE rates are 25, 12, 6, 0.
- Currency: ISO 4217 (SEK, EUR, USD, ...). Default SEK if unclear.
- Category: one of travel, meals, office, software, representation, other.
- Description: short human summary (e.g. "Lunch at Vapiano", "Taxi airport→office").
- Vendor: merchant name as printed.
- If a field is unreadable, return null (don't guess).`;

const TOOL_DEF = {
  type: 'function' as const,
  function: {
    name: 'extract_receipt',
    description: 'Return structured expense fields extracted from the receipt.',
    parameters: {
      type: 'object',
      properties: {
        vendor: { type: ['string', 'null'] },
        expense_date: { type: ['string', 'null'], description: 'YYYY-MM-DD' },
        total_cents: { type: ['integer', 'null'], description: 'Gross total incl. VAT in cents' },
        vat_cents: { type: ['integer', 'null'] },
        vat_rate: { type: ['number', 'null'], description: 'Percent, e.g. 25' },
        currency: { type: ['string', 'null'] },
        category: {
          type: ['string', 'null'],
          enum: ['travel', 'meals', 'office', 'software', 'representation', 'other', null],
        },
        description: { type: ['string', 'null'] },
        line_items: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              name: { type: 'string' },
              amount_cents: { type: 'integer' },
            },
          },
        },
      },
      required: ['vendor', 'expense_date', 'total_cents', 'currency', 'category', 'description'],
      additionalProperties: false,
    },
  },
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const { file_base64, mime_type, filename } = await req.json();
    if (!file_base64 || !mime_type) {
      return new Response(JSON.stringify({ error: 'file_base64 and mime_type required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    // Get user (optional — utility works for any authenticated admin)
    let userId: string | null = null;
    const auth = req.headers.get('Authorization');
    if (auth?.startsWith('Bearer ')) {
      const { data } = await supabase.auth.getUser(auth.slice(7));
      userId = data.user?.id ?? null;
    }

    const ai = await resolveAiConfig(supabase, 'multimodal');

    const isImage = mime_type.startsWith('image/');
    const isPdf = mime_type === 'application/pdf';
    if (!isImage && !isPdf) {
      return new Response(
        JSON.stringify({ error: `Unsupported file type "${mime_type}". Use an image (JPG/PNG/HEIC) or PDF.` }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }
    // PDF support varies across vision providers (Gemini's OpenAI-compat layer
    // rejects application/pdf on image_url). Until we render PDFs to images
    // server-side, ask the user to provide an image.
    if (isPdf && ai.provider !== 'openai') {
      return new Response(
        JSON.stringify({
          error:
            'PDF receipts are not yet supported on this AI provider. Please upload a photo of the receipt (JPG/PNG/HEIC), or take a screenshot of the PDF.',
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const dataUrl = `data:${mime_type};base64,${file_base64}`;
    const messages = [
      { role: 'system', content: SYSTEM_PROMPT },
      {
        role: 'user',
        content: [
          { type: 'text', text: 'Extract the expense fields from this receipt.' },
          { type: 'image_url', image_url: { url: dataUrl } },
        ],
      },
    ];

    const result = await callAiCompletion({
      supabase,
      source: 'expense-receipt',
      provider: ai.provider,
      model: ai.model,
      apiUrl: ai.apiUrl,
      apiKey: ai.apiKey,
      userId,
      metadata: { filename: filename || null, mime_type },
      body: {
        messages,
        tools: [TOOL_DEF],
        tool_choice: { type: 'function', function: { name: 'extract_receipt' } },
        temperature: 0.1,
      },
    });

    // Pull the structured args from the tool call
    const choice = result?.choices?.[0];
    const toolCall = choice?.message?.tool_calls?.[0];
    let extracted: any = null;
    if (toolCall?.function?.arguments) {
      try {
        extracted = JSON.parse(toolCall.function.arguments);
      } catch {
        extracted = null;
      }
    }
    // Fallback: some Gemini responses put JSON in content
    if (!extracted && choice?.message?.content) {
      const m = String(choice.message.content).match(/\{[\s\S]*\}/);
      if (m) {
        try { extracted = JSON.parse(m[0]); } catch { /* ignore */ }
      }
    }

    if (!extracted) {
      return new Response(
        JSON.stringify({ error: 'AI returned no structured data', raw: choice?.message }),
        { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    return new Response(JSON.stringify({ ok: true, data: extracted, provider: ai.provider, model: ai.model }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e: any) {
    const status = e?.status === 429 ? 429 : e?.status === 402 ? 402 : 500;
    const msg =
      status === 429
        ? 'Rate limit exceeded — try again shortly.'
        : status === 402
          ? 'AI credits exhausted — top up in workspace settings.'
          : e?.message || 'Receipt extraction failed';
    return new Response(JSON.stringify({ error: msg }), {
      status,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
