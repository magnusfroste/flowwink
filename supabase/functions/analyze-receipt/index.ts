import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const { image_url, locale = 'se' } = await req.json();
    if (!image_url) {
      return new Response(JSON.stringify({ error: 'image_url is required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Resolve AI provider — prefer Gemini (best vision), fallback to OpenAI
    const geminiKey = Deno.env.get('GEMINI_API_KEY');
    const openaiKey = Deno.env.get('OPENAI_API_KEY');

    if (!geminiKey && !openaiKey) {
      return new Response(JSON.stringify({ error: 'No AI provider configured for vision analysis' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const localeHint = locale === 'se' 
      ? 'Swedish receipt. VAT is called "Moms". Currency is SEK. Common VAT rates: 25%, 12%, 6%.'
      : locale === 'us' 
        ? 'US receipt. Currency is USD. Sales tax varies by state.'
        : 'International receipt. Detect the currency and tax system.';

    const systemPrompt = `You are a receipt analysis expert. Extract structured data from receipt images.
${localeHint}

You MUST call the extract_receipt_data tool with the extracted information. 
If you cannot read the receipt clearly, still provide your best estimates and set confidence to "low".`;

    const tools = [{
      type: "function",
      function: {
        name: "extract_receipt_data",
        description: "Return structured receipt data",
        parameters: {
          type: "object",
          properties: {
            vendor: { type: "string", description: "Store/vendor name" },
            date: { type: "string", description: "Receipt date in YYYY-MM-DD format" },
            total_cents: { type: "number", description: "Total amount in cents (öre/cents)" },
            vat_cents: { type: "number", description: "VAT/tax amount in cents" },
            vat_rate: { type: "number", description: "VAT rate as percentage (e.g. 25)" },
            currency: { type: "string", description: "ISO currency code (SEK, USD, EUR, etc.)" },
            category: { type: "string", enum: ["travel", "meals", "office", "software", "representation", "fuel", "accommodation", "other"] },
            items: { type: "array", items: { type: "object", properties: { description: { type: "string" }, amount_cents: { type: "number" } } } },
            suggested_account_code: { type: "string", description: "Suggested chart of accounts code based on category" },
            confidence: { type: "string", enum: ["high", "medium", "low"] },
          },
          required: ["vendor", "total_cents", "currency", "confidence"],
        },
      },
    }];

    const messages = [
      { role: "system", content: systemPrompt },
      {
        role: "user",
        content: [
          { type: "text", text: "Analyze this receipt and extract all data:" },
          { type: "image_url", image_url: { url: image_url } },
        ],
      },
    ];

    let apiUrl: string;
    let headers: Record<string, string>;
    const body: any = { messages, tools, tool_choice: { type: "function", function: { name: "extract_receipt_data" } } };

    if (geminiKey) {
      apiUrl = 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions';
      headers = { 'Authorization': `Bearer ${geminiKey}`, 'Content-Type': 'application/json' };
      body.model = 'gemini-2.5-flash';
    } else {
      apiUrl = 'https://api.openai.com/v1/chat/completions';
      headers = { 'Authorization': `Bearer ${openaiKey}`, 'Content-Type': 'application/json' };
      body.model = 'gpt-4.1-mini';
    }

    const response = await fetch(apiUrl, { method: 'POST', headers, body: JSON.stringify(body) });

    if (!response.ok) {
      const errText = await response.text();
      console.error('AI vision error:', response.status, errText);
      return new Response(JSON.stringify({ error: 'AI vision analysis failed', status: response.status }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const data = await response.json();
    const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];

    if (!toolCall) {
      return new Response(JSON.stringify({ error: 'AI did not return structured data', raw: data.choices?.[0]?.message?.content }), {
        status: 422, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    let receiptData: any;
    try {
      receiptData = JSON.parse(toolCall.function.arguments);
    } catch {
      return new Response(JSON.stringify({ error: 'Failed to parse AI response' }), {
        status: 422, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Enrich with account code suggestions based on category if not provided
    if (!receiptData.suggested_account_code && locale === 'se') {
      const accountMap: Record<string, string> = {
        travel: '5800', meals: '6072', office: '6110', software: '6540',
        representation: '7690', fuel: '5611', accommodation: '5810', other: '6992',
      };
      receiptData.suggested_account_code = accountMap[receiptData.category] || '6992';
    }

    return new Response(JSON.stringify({ receipt: receiptData, image_url }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (err: any) {
    console.error('analyze-receipt error:', err);
    return new Response(JSON.stringify({ error: err.message || 'Unknown error' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
