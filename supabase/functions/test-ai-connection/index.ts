import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { AI_MODELS } from '../shared/ai-models.ts';

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
    const { provider, config } = await req.json();
    
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
        model: data.model || AI_MODELS.openai.default
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
        `https://generativelanguage.googleapis.com/v1beta/models/${AI_MODELS.gemini.default}:generateContent?key=${apiKey}`,
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
        model: AI_MODELS.gemini.default
      };

    } else if (provider === 'local_llm') {
      // Test local LLM connection using config from request
      const endpoint = config?.endpoint;
      const model = config?.model || 'llama3';
      const apiKey = config?.apiKey;

      if (!endpoint) {
        return new Response(
          JSON.stringify({ success: false, provider: 'local_llm', error: 'Endpoint URL is required' }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      try {
        // Try OpenAI-compatible endpoint format
        const headers: Record<string, string> = {
          'Content-Type': 'application/json',
        };
        if (apiKey) {
          headers['Authorization'] = `Bearer ${apiKey}`;
        }

        const baseUrl = endpoint.replace(/\/$/, '');
        const chatEndpoint = baseUrl.includes('/v1') ? `${baseUrl}/chat/completions` : `${baseUrl}/v1/chat/completions`;

        const response = await fetch(chatEndpoint, {
          method: 'POST',
          headers,
          body: JSON.stringify({
            model,
            messages: [{ role: 'user', content: 'Say "OK"' }],
            max_tokens: 5,
          }),
        });

        if (!response.ok) {
          const errorData = await response.text();
          console.error('Local LLM API error:', response.status, errorData);
          return new Response(
            JSON.stringify({ 
              success: false, 
              provider: 'local_llm', 
              error: `API returned ${response.status}: ${response.statusText}` 
            }),
            { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        const data = await response.json();
        result = { 
          success: true, 
          provider: 'local_llm', 
          model: data.model || model
        };
      } catch (fetchError) {
        console.error('Local LLM connection error:', fetchError);
        return new Response(
          JSON.stringify({ 
            success: false, 
            provider: 'local_llm', 
            error: `Connection failed: ${fetchError instanceof Error ? fetchError.message : 'Unknown error'}` 
          }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

    } else if (provider === 'n8n') {
      // Test n8n webhook connection
      const webhookUrl = config?.webhookUrl;
      const apiKey = config?.apiKey;
      const webhookType = config?.webhookType || 'chat';

      if (!webhookUrl) {
        return new Response(
          JSON.stringify({ success: false, provider: 'n8n', error: 'Webhook URL is required' }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      try {
        const headers: Record<string, string> = {
          'Content-Type': 'application/json',
        };
        if (apiKey) {
          headers['Authorization'] = apiKey.startsWith('Bearer ') ? apiKey : `Bearer ${apiKey}`;
        }

        // For n8n webhooks, we do a test ping
        // Chat webhooks expect { action: 'sendMessage', ... }
        // Generic webhooks expect OpenAI-compatible format
        const testBody = webhookType === 'chat' 
          ? { action: 'sendMessage', chatInput: 'test', sessionId: 'test-connection' }
          : { messages: [{ role: 'user', content: 'test' }], model: 'test' };

        const response = await fetch(webhookUrl, {
          method: 'POST',
          headers,
          body: JSON.stringify(testBody),
        });

        if (!response.ok) {
          const errorData = await response.text();
          console.error('N8N webhook error:', response.status, errorData);
          return new Response(
            JSON.stringify({ 
              success: false, 
              provider: 'n8n', 
              error: `Webhook returned ${response.status}: ${response.statusText}` 
            }),
            { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        result = { 
          success: true, 
          provider: 'n8n', 
          model: `${webhookType} webhook`
        };
      } catch (fetchError) {
        console.error('N8N connection error:', fetchError);
        return new Response(
          JSON.stringify({ 
            success: false, 
            provider: 'n8n', 
            error: `Connection failed: ${fetchError instanceof Error ? fetchError.message : 'Unknown error'}` 
          }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

    } else {
      return new Response(
        JSON.stringify({ success: false, error: 'Invalid provider. Use "openai", "gemini", "local_llm", or "n8n".' }),
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
