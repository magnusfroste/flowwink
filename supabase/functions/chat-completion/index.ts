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
    n8nWebhookType?: 'chat' | 'generic';
    systemPrompt?: string;
    includeContentAsContext?: boolean;
    contentContextMaxTokens?: number;
    includedPageSlugs?: string[];
  };
}

// Extract text from Tiptap JSON content
function extractTextFromTiptap(content: any): string {
  if (!content) return '';
  
  // If it's a string (HTML or plain text), strip tags
  if (typeof content === 'string') {
    return content.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
  }
  
  // If it's Tiptap JSON, recursively extract text
  if (typeof content === 'object') {
    const texts: string[] = [];
    
    if (content.text) {
      texts.push(content.text);
    }
    
    if (content.content && Array.isArray(content.content)) {
      for (const node of content.content) {
        const nodeText = extractTextFromTiptap(node);
        if (nodeText) texts.push(nodeText);
      }
    }
    
    return texts.join(' ').replace(/\s+/g, ' ').trim();
  }
  
  return '';
}

// Extract text from block content
function extractTextFromBlock(block: any): string {
  if (!block) return '';
  
  const texts: string[] = [];
  const type = block.type;
  const data = block.data || block;

  switch (type) {
    case 'text':
      // Handle both HTML strings and Tiptap JSON
      if (data.content) {
        texts.push(extractTextFromTiptap(data.content));
      }
      break;
    case 'hero':
      if (data.title) texts.push(data.title);
      if (data.subtitle) texts.push(data.subtitle);
      if (data.ctaText) texts.push(data.ctaText);
      break;
    case 'cta':
      if (data.title) texts.push(data.title);
      if (data.subtitle) texts.push(data.subtitle);
      if (data.buttonText) texts.push(data.buttonText);
      break;
    case 'accordion':
      if (data.items && Array.isArray(data.items)) {
        data.items.forEach((item: any) => {
          if (item.question) texts.push(item.question);
          if (item.answer) texts.push(extractTextFromTiptap(item.answer));
        });
      }
      break;
    case 'contact':
      if (data.phone) texts.push(`Telefon: ${data.phone}`);
      if (data.email) texts.push(`E-post: ${data.email}`);
      if (data.address) texts.push(`Adress: ${data.address}`);
      break;
    case 'quote':
      if (data.quote) texts.push(data.quote);
      if (data.author) texts.push(`- ${data.author}`);
      break;
    case 'info-box':
    case 'infoBox':
      if (data.title) texts.push(data.title);
      if (data.content) texts.push(extractTextFromTiptap(data.content));
      break;
    case 'two-column':
    case 'twoColumn':
      if (data.leftContent) texts.push(extractTextFromTiptap(data.leftContent));
      if (data.rightContent) texts.push(extractTextFromTiptap(data.rightContent));
      break;
    case 'stats':
      if (data.items && Array.isArray(data.items)) {
        data.items.forEach((item: any) => {
          if (item.value && item.label) texts.push(`${item.value} ${item.label}`);
        });
      }
      break;
    case 'article-grid':
    case 'articleGrid':
      if (data.items && Array.isArray(data.items)) {
        data.items.forEach((item: any) => {
          if (item.title) texts.push(item.title);
          if (item.excerpt) texts.push(item.excerpt);
        });
      }
      break;
    case 'link-grid':
    case 'linkGrid':
      if (data.items && Array.isArray(data.items)) {
        data.items.forEach((item: any) => {
          if (item.title) texts.push(item.title);
          if (item.description) texts.push(item.description);
        });
      }
      break;
  }

  return texts.join(' ');
}

// Build knowledge base from pages
async function buildKnowledgeBase(maxTokens: number, includedSlugs: string[] = []): Promise<string> {
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabase = createClient(supabaseUrl, supabaseKey);

  let query = supabase
    .from('pages')
    .select('title, slug, content_json')
    .eq('status', 'published');

  // Filter by included slugs if specified
  if (includedSlugs.length > 0) {
    query = query.in('slug', includedSlugs);
  }

  const { data: pages, error } = await query;

  if (error || !pages) {
    console.error('Failed to fetch pages for knowledge base:', error);
    return '';
  }

  const sections: string[] = [];
  let estimatedTokens = 0;

  for (const page of pages) {
    const pageTexts: string[] = [];
    
    if (page.content_json && Array.isArray(page.content_json)) {
      for (const block of page.content_json) {
        const text = extractTextFromBlock(block);
        if (text) pageTexts.push(text);
      }
    }

    if (pageTexts.length > 0) {
      const pageContent = `### ${page.title} (/${page.slug})\n${pageTexts.join('\n')}`;
      const contentTokens = Math.ceil(pageContent.length / 4); // Rough estimate: 4 chars per token
      
      if (estimatedTokens + contentTokens > maxTokens) {
        console.log(`Knowledge base truncated at ${estimatedTokens} tokens (max: ${maxTokens})`);
        break;
      }
      
      sections.push(pageContent);
      estimatedTokens += contentTokens;
    }
  }

  if (sections.length === 0) return '';

  console.log(`Built knowledge base: ${pages.length} pages, ~${estimatedTokens} tokens`);
  
  return `\n\n## Webbplatsens innehåll (kunskapsbas)\nAnvänd följande information för att svara på frågor om verksamheten:\n\n${sections.join('\n\n')}`;
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
      includeContent: settings?.includeContentAsContext,
      conversationId,
      sessionId
    });

    const aiProvider = settings?.aiProvider || 'lovable';
    let systemPrompt = settings?.systemPrompt || 'Du är en hjälpsam AI-assistent.';

    // Add knowledge base if enabled
    if (settings?.includeContentAsContext) {
      const maxTokens = settings?.contentContextMaxTokens || 50000;
      const includedSlugs = settings?.includedPageSlugs || [];
      const knowledgeBase = await buildKnowledgeBase(maxTokens, includedSlugs);
      if (knowledgeBase) {
        systemPrompt += knowledgeBase;
      }
    }

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

      const n8nWebhookType = settings?.n8nWebhookType || 'chat';
      const lastUserMessage = messages.filter(m => m.role === 'user').pop();
      
      // Build payload based on webhook type
      let n8nPayload: Record<string, unknown>;
      
      if (n8nWebhookType === 'chat') {
        // Chat Webhook: N8N Chat node handles session memory
        // Only send the latest message + session info
        n8nPayload = {
          chatInput: lastUserMessage?.content || '',
          sessionId: sessionId || conversationId,
          systemPrompt,
        };
        console.log('Sending to N8N Chat Webhook:', { 
          webhookUrl, 
          chatInput: lastUserMessage?.content?.substring(0, 50),
          sessionId: sessionId || conversationId
        });
      } else {
        // Generic Webhook: OpenAI-compatible format with full history
        // Suitable for Ollama, LM Studio, or custom AI logic
        n8nPayload = {
          messages: fullMessages,
          model: 'gpt-4', // Hint for downstream processing
          conversationId,
          sessionId,
        };
        console.log('Sending to N8N Generic Webhook:', { 
          webhookUrl, 
          messageCount: fullMessages.length
        });
      }

      const n8nResponse = await fetch(webhookUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(n8nPayload),
      });

      if (!n8nResponse.ok) {
        const errorText = await n8nResponse.text();
        console.error('N8N webhook error:', n8nResponse.status, errorText);
        throw new Error('N8N webhook failed');
      }

      // N8N returns a structured response, convert to SSE format
      const n8nData = await n8nResponse.json();
      console.log('N8N response data:', JSON.stringify(n8nData));
      
      // Handle various N8N response formats:
      // - Array with output: [{ "output": "..." }]
      // - Object with message/response: { "message": "..." } or { "response": "..." }
      // - Object with output: { "output": "..." }
      let responseContent = 'Jag kunde inte behandla din förfrågan.';
      
      if (Array.isArray(n8nData) && n8nData.length > 0) {
        responseContent = n8nData[0].output || n8nData[0].message || n8nData[0].response || responseContent;
      } else if (typeof n8nData === 'object' && n8nData !== null) {
        responseContent = n8nData.output || n8nData.message || n8nData.response || responseContent;
      }
      
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
