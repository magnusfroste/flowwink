import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { provider } = await req.json();
    
    let result: { success: boolean; provider: string; model?: string; error?: string };

    if (provider === 'openai') {
      const apiKey = Deno.env.get('OPENAI_API_KEY');
      if (!apiKey) {
        return new Response(
          JSON.stringify({ success: false, provider: 'openai', error: 'OPENAI_API_KEY not configured' }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Make a minimal request to OpenAI to verify the key works
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'gpt-4o-mini',
          messages: [{ role: 'user', content: 'Say "OK"' }],
          max_tokens: 5,
        }),
      });

      if (!response.ok) {
        const errorData = await response.text();
        console.error('OpenAI API error:', response.status, errorData);
        return new Response(
          JSON.stringify({ 
            success: false, 
            provider: 'openai', 
            error: `API returned ${response.status}: ${response.statusText}` 
          }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const data = await response.json();
      result = { 
        success: true, 
        provider: 'openai', 
        model: data.model || 'gpt-4o-mini'
      };

    } else if (provider === 'gemini') {
      const apiKey = Deno.env.get('GEMINI_API_KEY');
      if (!apiKey) {
        return new Response(
          JSON.stringify({ success: false, provider: 'gemini', error: 'GEMINI_API_KEY not configured' }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Make a minimal request to Gemini to verify the key works
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            contents: [{ parts: [{ text: 'Say "OK"' }] }],
            generationConfig: { maxOutputTokens: 5 },
          }),
        }
      );

      if (!response.ok) {
        const errorData = await response.text();
        console.error('Gemini API error:', response.status, errorData);
        return new Response(
          JSON.stringify({ 
            success: false, 
            provider: 'gemini', 
            error: `API returned ${response.status}: ${response.statusText}` 
          }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      result = { 
        success: true, 
        provider: 'gemini', 
        model: 'gemini-1.5-flash'
      };

    } else {
      return new Response(
        JSON.stringify({ success: false, error: 'Invalid provider. Use "openai" or "gemini".' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('AI connection test result:', result);
    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Test AI connection error:', error);
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
