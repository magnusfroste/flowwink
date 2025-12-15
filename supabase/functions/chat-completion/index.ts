import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

interface ChatRequest {
  messages: ChatMessage[];
  conversationId?: string;
  sessionId?: string;
  settings?: {
    aiProvider: 'lovable' | 'local' | 'n8n';
    lovableModel?: string;
    localEndpoint?: string;
    localModel?: string;
    localApiKey?: string;
    n8nWebhookUrl?: string;
    systemPrompt?: string;
  };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { messages, conversationId, sessionId, settings } = await req.json() as ChatRequest;
    
    console.log('Chat request received:', { 
      messageCount: messages.length, 
      provider: settings?.aiProvider,
      conversationId,
      sessionId
    });

    const aiProvider = settings?.aiProvider || 'lovable';
    const systemPrompt = settings?.systemPrompt || 'Du är en hjälpsam AI-assistent.';

    // Prepare messages with system prompt
    const fullMessages: ChatMessage[] = [
      { role: 'system', content: systemPrompt },
      ...messages,
    ];

    let response: Response;

    if (aiProvider === 'lovable') {
      // Use Lovable AI Gateway
      const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
      if (!LOVABLE_API_KEY) {
        throw new Error('LOVABLE_API_KEY is not configured');
      }

      response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${LOVABLE_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: settings?.lovableModel || 'google/gemini-2.5-flash',
          messages: fullMessages,
          stream: true,
        }),
      });
    } else if (aiProvider === 'local') {
      // Use local/self-hosted LLM (OpenAI-compatible API)
      const endpoint = settings?.localEndpoint;
      if (!endpoint) {
        throw new Error('Local endpoint is not configured');
      }

      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };
      
      if (settings?.localApiKey) {
        headers['Authorization'] = `Bearer ${settings.localApiKey}`;
      }

      response = await fetch(`${endpoint}/v1/chat/completions`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          model: settings?.localModel || 'llama3',
          messages: fullMessages,
          stream: true,
        }),
      });
    } else if (aiProvider === 'n8n') {
      // Use N8N webhook for agentic workflows
      const webhookUrl = settings?.n8nWebhookUrl;
      if (!webhookUrl) {
        throw new Error('N8N webhook URL is not configured');
      }

      const n8nResponse = await fetch(webhookUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messages: fullMessages,
          conversationId,
          sessionId,
        }),
      });

      if (!n8nResponse.ok) {
        const errorText = await n8nResponse.text();
        console.error('N8N webhook error:', n8nResponse.status, errorText);
        throw new Error('N8N webhook failed');
      }

      // N8N returns a structured response, convert to SSE format
      const n8nData = await n8nResponse.json();
      const responseContent = n8nData.message || n8nData.response || 'Jag kunde inte behandla din förfrågan.';
      
      // Create a simple SSE stream for N8N response
      const encoder = new TextEncoder();
      const stream = new ReadableStream({
        start(controller) {
          const data = JSON.stringify({
            choices: [{
              delta: { content: responseContent },
              finish_reason: 'stop'
            }]
          });
          controller.enqueue(encoder.encode(`data: ${data}\n\n`));
          controller.enqueue(encoder.encode('data: [DONE]\n\n'));
          controller.close();
        }
      });

      return new Response(stream, {
        headers: { ...corsHeaders, 'Content-Type': 'text/event-stream' },
      });
    } else {
      throw new Error(`Unknown AI provider: ${aiProvider}`);
    }

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: 'För många förfrågningar. Vänta en stund och försök igen.' }), {
          status: 429,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: 'Krediter slut. Kontakta administratören.' }), {
          status: 402,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      const errorText = await response.text();
      console.error('AI provider error:', response.status, errorText);
      return new Response(JSON.stringify({ error: 'AI-tjänsten svarade inte korrekt.' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Stream the response
    return new Response(response.body, {
      headers: { ...corsHeaders, 'Content-Type': 'text/event-stream' },
    });

  } catch (error) {
    console.error('Chat completion error:', error);
    return new Response(JSON.stringify({ 
      error: error instanceof Error ? error.message : 'Ett oväntat fel uppstod.' 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
