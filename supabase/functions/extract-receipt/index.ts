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
import { getServiceClient } from '../_shared/supabase-clients.ts';
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

function cleanBase64(base64String: string): string {
  let cleaned = String(base64String || '').trim();

  if (cleaned.startsWith('data:') && cleaned.includes(',')) {
    cleaned = cleaned.split(',')[1];
  }

  return cleaned.replace(/\s/g, '');
}

function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(cleanBase64(base64));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function bytesToBase64(bytes: Uint8Array): string {
  const CHUNK = 0x8000;
  let binary = '';
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode.apply(
      null,
      bytes.subarray(i, i + CHUNK) as unknown as number[],
    );
  }
  return btoa(binary);
}

async function extractPdfText(pdfBytes: Uint8Array, ai: Awaited<ReturnType<typeof resolveAiConfig>>): Promise<string> {
  const extractionPrompt = `Extract the readable text content from this receipt PDF.
- Preserve merchant name, dates, totals, VAT lines, line items, currency, and payment details.
- Skip decorative artifacts and repeated headers/footers.
- Return ONLY the extracted text. No commentary.`;

  if (ai.provider === 'gemini') {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${ai.model}:generateContent?key=${ai.apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{
            role: 'user',
            parts: [
              { inline_data: { mime_type: 'application/pdf', data: bytesToBase64(pdfBytes) } },
              { text: extractionPrompt },
            ],
          }],
          generationConfig: { temperature: 0.1, maxOutputTokens: 8192 },
        }),
      },
    );

    const text = await response.text();
    if (!response.ok) throw new Error(text || 'Gemini PDF extraction failed');

    const parsed = text ? JSON.parse(text) : null;
    return parsed?.candidates?.[0]?.content?.parts?.map((part: any) => part?.text || '').join('\n') || '';
  }

  if (ai.provider === 'openai') {
    const uploadForm = new FormData();
    uploadForm.append('purpose', 'user_data');
    uploadForm.append('file', new Blob([pdfBytes], { type: 'application/pdf' }), 'receipt.pdf');

    const uploadResp = await fetch('https://api.openai.com/v1/files', {
      method: 'POST',
      headers: { Authorization: `Bearer ${ai.apiKey}` },
      body: uploadForm,
    });

    const uploadText = await uploadResp.text();
    if (!uploadResp.ok) throw new Error(uploadText || 'OpenAI file upload failed');

    const uploaded = uploadText ? JSON.parse(uploadText) : null;
    const fileId = uploaded?.id;
    if (!fileId) throw new Error('OpenAI file upload failed');

    try {
      const response = await fetch(ai.apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${ai.apiKey}`,
        },
        body: JSON.stringify({
          model: ai.model,
          messages: [{
            role: 'user',
            content: [
              { type: 'text', text: extractionPrompt },
              { type: 'file', file: { file_id: fileId } },
            ],
          }],
          temperature: 0.1,
          max_tokens: 8192,
        }),
      });

      const text = await response.text();
      if (!response.ok) throw new Error(text || 'OpenAI PDF extraction failed');

      const parsed = text ? JSON.parse(text) : null;
      const content = parsed?.choices?.[0]?.message?.content;
      if (typeof content === 'string') return content;
      if (Array.isArray(content)) return content.map((item: any) => item?.text || '').join('\n');
      return '';
    } finally {
      fetch(`https://api.openai.com/v1/files/${fileId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${ai.apiKey}` },
      }).catch(() => {});
    }
  }

  if (ai.provider === 'anthropic') {
    const response = await fetch(ai.apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ai.apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: ai.model,
        max_tokens: 8192,
        messages: [{
          role: 'user',
          content: [
            { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: bytesToBase64(pdfBytes) } },
            { type: 'text', text: extractionPrompt },
          ],
        }],
      }),
    });

    const text = await response.text();
    if (!response.ok) throw new Error(text || 'Anthropic PDF extraction failed');

    const parsed = text ? JSON.parse(text) : null;
    return parsed?.content?.map((item: any) => item?.text || '').join('\n') || '';
  }

  throw new Error('PDF receipts are not supported by the configured AI provider yet.');
}

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

    const supabase = getServiceClient();

    // Get user (optional — utility works for any authenticated admin)
    let userId: string | null = null;
    const auth = req.headers.get('Authorization');
    if (auth?.startsWith('Bearer ')) {
      const { data } = await supabase.auth.getUser(auth.slice(7));
      userId = data.user?.id ?? null;
    }

    const cleanedBase64 = cleanBase64(file_base64);
    const ai = await resolveAiConfig(supabase, 'multimodal');

    const isImage = mime_type.startsWith('image/');
    const isPdf = mime_type === 'application/pdf';
    if (!isImage && !isPdf) {
      return new Response(
        JSON.stringify({ error: `Unsupported file type "${mime_type}". Use an image (JPG/PNG/HEIC) or PDF.` }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }
    const messages = isPdf
      ? [
          {
            role: 'system',
            content: `${SYSTEM_PROMPT}\n\nYou will receive OCR text extracted from a receipt PDF instead of an image. Base your output only on that text.`,
          },
          {
            role: 'user',
            content: `Extract the expense fields from this receipt OCR text:\n\n${await extractPdfText(base64ToBytes(cleanedBase64), ai)}`,
          },
        ]
      : [
          { role: 'system', content: SYSTEM_PROMPT },
          {
            role: 'user',
            content: [
              { type: 'text', text: 'Extract the expense fields from this receipt.' },
              { type: 'image_url', image_url: { url: `data:${mime_type};base64,${cleanedBase64}` } },
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
