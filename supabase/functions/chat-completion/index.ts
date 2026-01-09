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

interface ChatSettings {
  aiProvider: 'openai' | 'gemini' | 'local' | 'n8n';
  openaiApiKey?: string;
  openaiModel?: string;
  openaiBaseUrl?: string;
  geminiApiKey?: string;
  geminiModel?: string;
  localEndpoint?: string;
  localModel?: string;
  localApiKey?: string;
  n8nWebhookUrl?: string;
  n8nWebhookType?: 'chat' | 'generic';
  systemPrompt?: string;
  includeContentAsContext?: boolean;
  contentContextMaxTokens?: number;
  includedPageSlugs?: string[];
  includeKbArticles?: boolean;
}

interface ChatRequest {
  messages: ChatMessage[];
  conversationId?: string;
  sessionId?: string;
  settings?: ChatSettings;
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
async function buildKnowledgeBase(
  maxTokens: number, 
  includedSlugs: string[] = [],
  includeKbArticles: boolean = false
): Promise<string> {
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabase = createClient(supabaseUrl, supabaseKey);

  const sections: string[] = [];
  let estimatedTokens = 0;

  // Fetch CMS pages
  let query = supabase
    .from('pages')
    .select('title, slug, content_json')
    .eq('status', 'published');

  if (includedSlugs.length > 0) {
    query = query.in('slug', includedSlugs);
  }

  const { data: pages, error: pagesError } = await query;

  if (pagesError) {
    console.error('Failed to fetch pages for knowledge base:', pagesError);
  }

  // Process pages
  if (pages) {
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
        const contentTokens = Math.ceil(pageContent.length / 4);
        
        if (estimatedTokens + contentTokens > maxTokens) {
          console.log(`Knowledge base truncated at ${estimatedTokens} tokens (max: ${maxTokens})`);
          break;
        }
        
        sections.push(pageContent);
        estimatedTokens += contentTokens;
      }
    }
  }

  // Fetch KB articles if enabled
  if (includeKbArticles) {
    const { data: kbArticles, error: kbError } = await supabase
      .from('kb_articles')
      .select('title, question, answer_json, answer_text')
      .eq('include_in_chat', true)
      .eq('is_published', true);

    if (kbError) {
      console.error('Failed to fetch KB articles:', kbError);
    }

    if (kbArticles && kbArticles.length > 0) {
      const faqSection: string[] = [];
      
      for (const article of kbArticles) {
        // Extract answer text
        let answerText = article.answer_text || '';
        if (!answerText && article.answer_json) {
          answerText = extractTextFromTiptap(article.answer_json);
        }
        
        if (answerText) {
          const faqEntry = `Q: ${article.question}\nA: ${answerText}`;
          const entryTokens = Math.ceil(faqEntry.length / 4);
          
          if (estimatedTokens + entryTokens > maxTokens) {
            console.log(`KB articles truncated at ${estimatedTokens} tokens`);
            break;
          }
          
          faqSection.push(faqEntry);
          estimatedTokens += entryTokens;
        }
      }

      if (faqSection.length > 0) {
        sections.push(`\n## Vanliga frågor (FAQ)\n${faqSection.join('\n\n')}`);
        console.log(`Added ${faqSection.length} KB articles to knowledge base`);
      }
    }
  }

  if (sections.length === 0) return '';

  console.log(`Built knowledge base: ~${estimatedTokens} tokens`);
  
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

    const aiProvider = settings?.aiProvider || 'openai';
    let systemPrompt = settings?.systemPrompt || 'Du är en hjälpsam AI-assistent.';

    // Add knowledge base if enabled
    if (settings?.includeContentAsContext || settings?.includeKbArticles) {
      const maxTokens = settings?.contentContextMaxTokens || 50000;
      const includedSlugs = settings?.includedPageSlugs || [];
      const includeKb = settings?.includeKbArticles || false;
      const knowledgeBase = await buildKnowledgeBase(
        maxTokens, 
        settings?.includeContentAsContext ? includedSlugs : [],
        includeKb
      );
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

    if (aiProvider === 'openai') {
      // Use OpenAI API
      const apiKey = settings?.openaiApiKey || Deno.env.get('OPENAI_API_KEY');
      if (!apiKey) {
        throw new Error('OpenAI API key is not configured');
      }

      const baseUrl = settings?.openaiBaseUrl || 'https://api.openai.com/v1';
      const model = settings?.openaiModel || 'gpt-4o-mini';

      response = await fetch(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model,
          messages: fullMessages,
          stream: true,
        }),
      });
    } else if (aiProvider === 'gemini') {
      // Use Google Gemini API
      const apiKey = settings?.geminiApiKey || Deno.env.get('GEMINI_API_KEY');
      if (!apiKey) {
        throw new Error('Gemini API key is not configured');
      }

      const model = settings?.geminiModel || 'gemini-2.0-flash-exp';

      // Convert messages to Gemini format
      const geminiMessages = fullMessages
        .filter(m => m.role !== 'system')
        .map(m => ({
          role: m.role === 'assistant' ? 'model' : 'user',
          parts: [{ text: m.content }]
        }));

      // Add system prompt as first user message if exists
      const systemMsg = fullMessages.find(m => m.role === 'system');
      if (systemMsg) {
        geminiMessages.unshift({
          role: 'user',
          parts: [{ text: `System instructions: ${systemMsg.content}` }]
        });
      }

      response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent?key=${apiKey}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          contents: geminiMessages,
          generationConfig: {
            temperature: 0.7,
            maxOutputTokens: 2048,
          }
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

      // Handle endpoints that already include /v1 path
      const baseEndpoint = endpoint.replace(/\/+$/, ''); // Remove trailing slashes
      const apiPath = baseEndpoint.endsWith('/v1') ? '/chat/completions' : '/v1/chat/completions';
      const fullUrl = `${baseEndpoint}${apiPath}`;
      
      console.log('Calling local AI endpoint:', { fullUrl, model: settings?.localModel });

      response = await fetch(fullUrl, {
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
