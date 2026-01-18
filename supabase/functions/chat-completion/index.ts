import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface ChatMessage {
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string;
  tool_call_id?: string;
  tool_calls?: ToolCall[];
}

interface ToolCall {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string;
  };
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
  // Tool calling settings
  toolCallingEnabled?: boolean;
  firecrawlSearchEnabled?: boolean;
  humanHandoffEnabled?: boolean;
  sentimentDetectionEnabled?: boolean;
  sentimentThreshold?: number;
  localSupportsToolCalling?: boolean; // Whether local AI supports OpenAI-compatible tool calling (e.g., vLLM/Qwen3)
  // General knowledge
  allowGeneralKnowledge?: boolean; // Allow AI to use its own knowledge beyond page content
}

interface ChatRequest {
  messages: ChatMessage[];
  conversationId?: string;
  sessionId?: string;
  settings?: ChatSettings;
  customerEmail?: string;
  customerName?: string;
}

// Tool definitions for function calling
const AVAILABLE_TOOLS = {
  firecrawl_search: {
    type: "function",
    function: {
      name: "firecrawl_search",
      description: "Search the web for current information when the user asks about topics not in your knowledge base, or when they need up-to-date information.",
      parameters: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description: "The search query to find information about"
          }
        },
        required: ["query"]
      }
    }
  },
  handoff_to_human: {
    type: "function",
    function: {
      name: "handoff_to_human",
      description: "Transfer the conversation to a human support agent. Use this when: 1) The user explicitly asks to speak to a human, 2) The user is very frustrated or upset, 3) You cannot help with their specific request, 4) The issue is complex and requires human judgment.",
      parameters: {
        type: "object",
        properties: {
          reason: {
            type: "string",
            description: "Brief description of why handoff is needed"
          },
          urgency: {
            type: "string",
            enum: ["low", "normal", "high", "urgent"],
            description: "How urgent is this handoff"
          }
        },
        required: ["reason", "urgency"]
      }
    }
  },
  create_escalation: {
    type: "function",
    function: {
      name: "create_escalation",
      description: "Create a support ticket when no human agents are available. This saves the conversation for follow-up.",
      parameters: {
        type: "object",
        properties: {
          summary: {
            type: "string",
            description: "Brief summary of the issue"
          },
          priority: {
            type: "string",
            enum: ["low", "normal", "high", "urgent"],
            description: "Priority level for the ticket"
          }
        },
        required: ["summary", "priority"]
      }
    }
  }
};

// Extract text from Tiptap JSON content
function extractTextFromTiptap(content: any): string {
  if (!content) return '';
  
  if (typeof content === 'string') {
    return content.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
  }
  
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
      if (data.phone) texts.push(`Phone: ${data.phone}`);
      if (data.email) texts.push(`Email: ${data.email}`);
      if (data.address) texts.push(`Address: ${data.address}`);
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
        sections.push(`\n## FAQ\n${faqSection.join('\n\n')}`);
        console.log(`Added ${faqSection.length} KB articles to knowledge base`);
      }
    }
  }

  if (sections.length === 0) return '';

  console.log(`Built knowledge base: ~${estimatedTokens} tokens`);
  
  return `\n\n## Website Content (Knowledge Base)\n${sections.join('\n\n')}`;
}

// Execute tool calls
async function executeToolCall(
  toolName: string, 
  args: Record<string, any>,
  conversationId: string | undefined,
  customerEmail: string | undefined,
  customerName: string | undefined
): Promise<string> {
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

  console.log(`Executing tool: ${toolName}`, args);

  switch (toolName) {
    case 'firecrawl_search': {
      try {
        const response = await fetch(`${supabaseUrl}/functions/v1/firecrawl-search`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${supabaseKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ query: args.query, limit: 3 }),
        });

        const data = await response.json();
        
        if (!data.success) {
          return `Search failed: ${data.error}`;
        }

        const results = (data.results || []).map((r: any) => 
          `**${r.title}** (${r.url})\n${r.description || r.content?.substring(0, 300) || ''}`
        ).join('\n\n');

        return results || 'No results found.';
      } catch (error) {
        console.error('Firecrawl search error:', error);
        return `Search error: ${error instanceof Error ? error.message : 'Unknown error'}`;
      }
    }

    case 'handoff_to_human':
    case 'create_escalation': {
      if (!conversationId) {
        return 'Cannot create handoff without a conversation ID.';
      }

      try {
        const response = await fetch(`${supabaseUrl}/functions/v1/support-router`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${supabaseKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            conversationId,
            sentiment: {
              frustrationLevel: toolName === 'handoff_to_human' ? 8 : 5,
              urgency: args.urgency || args.priority || 'normal',
              humanNeeded: true,
              trigger: args.reason || args.summary || 'User requested',
            },
            customerEmail,
            customerName,
          }),
        });

        const data = await response.json();
        
        if (data.action === 'handoff_to_agent') {
          return `HANDOFF_SUCCESS: ${data.message}`;
        } else if (data.action === 'create_escalation') {
          return `ESCALATION_CREATED: ${data.message}`;
        }
        
        return data.message || 'Handoff processed.';
      } catch (error) {
        console.error('Support router error:', error);
        return `Handoff error: ${error instanceof Error ? error.message : 'Unknown error'}`;
      }
    }

    default:
      return `Unknown tool: ${toolName}`;
  }
}

// Build sentiment detection prompt
function buildSentimentPrompt(threshold: number): string {
  return `

## Sentiment Analysis
Analyze each user message for emotional state. Look for:
- Frustration indicators: repeated questions, caps, exclamation marks, negative words
- Urgency: time-sensitive language, deadlines, emergency words
- Explicit requests: "speak to human", "talk to person", "real person"

If frustration level exceeds ${threshold}/10 OR user explicitly requests human help:
- Call the handoff_to_human tool with appropriate reason and urgency

Be empathetic and acknowledge frustration before attempting handoff.`;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { messages, conversationId, sessionId, settings, customerEmail, customerName } = await req.json() as ChatRequest;
    
    console.log('Chat request received:', { 
      messageCount: messages.length, 
      provider: settings?.aiProvider,
      toolCallingEnabled: settings?.toolCallingEnabled,
      allowGeneralKnowledge: settings?.allowGeneralKnowledge,
      includeContentAsContext: settings?.includeContentAsContext,
      conversationId,
    });

    const aiProvider = settings?.aiProvider || 'openai';

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Check if conversation is handled by a live agent - AI should not respond
    if (conversationId) {
      const { data: conversation } = await supabase
        .from('chat_conversations')
        .select('conversation_status, assigned_agent_id')
        .eq('id', conversationId)
        .single();
      
      if (conversation?.assigned_agent_id && 
          (conversation.conversation_status === 'with_agent' || conversation.conversation_status === 'waiting_agent')) {
        console.log('Conversation is handled by live agent, AI will not respond:', conversationId);
        return new Response(
          JSON.stringify({ 
            skipped: true, 
            reason: 'Conversation is being handled by a live support agent.' 
          }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    const { data: integrationSettings } = await supabase
      .from('site_settings')
      .select('value')
      .eq('key', 'integrations')
      .maybeSingle();

    const aiIntegrations = integrationSettings?.value as any;
    
    // Check if provider is enabled
    if (aiProvider === 'openai') {
      const openaiEnabled = aiIntegrations?.openai?.enabled ?? false;
      if (!openaiEnabled) {
        return new Response(
          JSON.stringify({ error: 'OpenAI integration is disabled.' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    } else if (aiProvider === 'gemini') {
      const geminiEnabled = aiIntegrations?.gemini?.enabled ?? false;
      if (!geminiEnabled) {
        return new Response(
          JSON.stringify({ error: 'Gemini integration is disabled.' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    let systemPrompt = settings?.systemPrompt || 'You are a helpful AI assistant.';

    // Add knowledge base restriction or allowance
    // IMPORTANT: allowGeneralKnowledge takes precedence - if true, AI can use its own knowledge
    if (settings?.allowGeneralKnowledge) {
      console.log('General knowledge ENABLED - AI may use its own knowledge');
      systemPrompt += '\n\nYou have access to general knowledge and can answer questions on any topic. When the user asks about the website or its services, prioritize the website content provided below. For other topics (like math, science, history, etc.), feel free to use your general knowledge.';
    } else if (settings?.includeContentAsContext || settings?.includeKbArticles) {
      console.log('General knowledge DISABLED - AI restricted to website content only');
      systemPrompt += '\n\nIMPORTANT: Only answer questions based on the website content provided below. If the answer is not in the content, politely say you can only help with questions about this website.';
    }

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

    // Add sentiment detection if enabled
    if (settings?.sentimentDetectionEnabled && settings?.humanHandoffEnabled) {
      systemPrompt += buildSentimentPrompt(settings?.sentimentThreshold || 7);
    }

    // Build tools array based on settings
    const tools: any[] = [];
    // OpenAI always supports tool calling; local providers support it if explicitly enabled (e.g., vLLM/Qwen3)
    const toolCallingSupported = aiProvider === 'openai' || 
      (aiProvider === 'local' && settings?.localSupportsToolCalling);
    
    if (settings?.toolCallingEnabled && toolCallingSupported) {
      if (settings?.firecrawlSearchEnabled && aiIntegrations?.firecrawl?.enabled) {
        tools.push(AVAILABLE_TOOLS.firecrawl_search);
      }
      if (settings?.humanHandoffEnabled) {
        tools.push(AVAILABLE_TOOLS.handoff_to_human);
        tools.push(AVAILABLE_TOOLS.create_escalation);
      }
    }

    // Fallback: Keyword-based handoff detection for non-OpenAI providers
    if (settings?.humanHandoffEnabled && !toolCallingSupported) {
      const lastUserMessage = messages.filter(m => m.role === 'user').pop()?.content?.toLowerCase() || '';
      const handoffKeywords = [
        'talk to a person', 'speak to a human', 'real person', 'human agent',
        'talk to human', 'speak to person', 'want a person', 'need a human',
        'customer service', 'support agent', 'live agent', 'not helpful',
        'prata med människa', 'riktig person', 'mänsklig support'
      ];
      
      const shouldHandoff = handoffKeywords.some(kw => lastUserMessage.includes(kw));
      
      if (shouldHandoff && conversationId) {
        console.log('Keyword-based handoff triggered for conversation:', conversationId);
        
        // Call support router
        try {
          const routerResponse = await fetch(`${supabaseUrl}/functions/v1/support-router`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${supabaseKey}`,
            },
            body: JSON.stringify({
              conversationId,
              sentiment: {
                frustrationLevel: 8,
                urgency: 'high',
                humanNeeded: true,
                trigger: 'User explicitly requested human support',
              },
              customerEmail,
              customerName,
            }),
          });

          const routerResult = await routerResponse.json();
          console.log('Support router result:', routerResult);
          
          // Return handoff message to user
          const handoffMessage = routerResult.message || 'Connecting you to a support agent...';
          const encoder = new TextEncoder();
          const stream = new ReadableStream({
            start(controller) {
              const data = JSON.stringify({
                choices: [{
                  delta: { content: handoffMessage },
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
        } catch (error) {
          console.error('Fallback handoff error:', error);
        }
      }
    }

    // Prepare messages with system prompt
    const fullMessages: ChatMessage[] = [
      { role: 'system', content: systemPrompt },
      ...messages,
    ];

    let response: Response;

    if (aiProvider === 'openai') {
      const apiKey = settings?.openaiApiKey || Deno.env.get('OPENAI_API_KEY');
      if (!apiKey) {
        throw new Error('OpenAI API key is not configured');
      }

      const baseUrl = settings?.openaiBaseUrl || 'https://api.openai.com/v1';
      const model = settings?.openaiModel || 'gpt-4o-mini';

      const requestBody: any = {
        model,
        messages: fullMessages,
        stream: true,
      };

      // Add tools if any are enabled
      if (tools.length > 0) {
        requestBody.tools = tools;
        requestBody.tool_choice = 'auto';
      }

      response = await fetch(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
      });

      // Handle tool calls (non-streaming for tool execution)
      if (tools.length > 0) {
        const clonedResponse = response.clone();
        const reader = clonedResponse.body?.getReader();
        const decoder = new TextDecoder();
        let fullContent = '';
        let toolCalls: ToolCall[] = [];

        if (reader) {
          let buffer = '';
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            
            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop() || '';

            for (const line of lines) {
              if (!line.startsWith('data: ') || line === 'data: [DONE]') continue;
              try {
                const parsed = JSON.parse(line.slice(6));
                const delta = parsed.choices?.[0]?.delta;
                
                if (delta?.content) {
                  fullContent += delta.content;
                }
                
                if (delta?.tool_calls) {
                  for (const tc of delta.tool_calls) {
                    if (tc.index !== undefined) {
                      if (!toolCalls[tc.index]) {
                        toolCalls[tc.index] = {
                          id: tc.id || '',
                          type: 'function',
                          function: { name: '', arguments: '' }
                        };
                      }
                      if (tc.id) toolCalls[tc.index].id = tc.id;
                      if (tc.function?.name) toolCalls[tc.index].function.name = tc.function.name;
                      if (tc.function?.arguments) toolCalls[tc.index].function.arguments += tc.function.arguments;
                    }
                  }
                }
              } catch (e) {
                // Ignore parse errors
              }
            }
          }
        }

        // If there are tool calls, execute them and make another request
        if (toolCalls.length > 0 && toolCalls[0]?.function?.name) {
          console.log('Tool calls detected:', toolCalls);
          
          // Execute each tool call
          const toolResults: ChatMessage[] = [];
          for (const tc of toolCalls) {
            try {
              const args = JSON.parse(tc.function.arguments);
              const result = await executeToolCall(
                tc.function.name, 
                args, 
                conversationId,
                customerEmail,
                customerName
              );
              
              toolResults.push({
                role: 'tool',
                tool_call_id: tc.id,
                content: result,
              });
            } catch (error) {
              console.error('Tool execution error:', error);
              toolResults.push({
                role: 'tool',
                tool_call_id: tc.id,
                content: `Error: ${error instanceof Error ? error.message : 'Unknown error'}`,
              });
            }
          }

          // Add assistant message with tool calls and tool results
          const assistantMessage: ChatMessage = {
            role: 'assistant',
            content: fullContent || '',
            tool_calls: toolCalls,
          };

          const followUpMessages = [
            ...fullMessages,
            assistantMessage,
            ...toolResults,
          ];

          // Make follow-up request
          const followUpResponse = await fetch(`${baseUrl}/chat/completions`, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${apiKey}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              model,
              messages: followUpMessages,
              stream: true,
            }),
          });

          return new Response(followUpResponse.body, {
            headers: { ...corsHeaders, 'Content-Type': 'text/event-stream' },
          });
        }
      }

    } else if (aiProvider === 'gemini') {
      const apiKey = settings?.geminiApiKey || Deno.env.get('GEMINI_API_KEY');
      if (!apiKey) {
        throw new Error('Gemini API key is not configured');
      }

      const model = settings?.geminiModel || 'gemini-2.0-flash-exp';

      const geminiMessages = fullMessages
        .filter(m => m.role !== 'system')
        .map(m => ({
          role: m.role === 'assistant' ? 'model' : 'user',
          parts: [{ text: m.content }]
        }));

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
      const localConfig = aiIntegrations?.local_llm?.config || {};
      const chatEndpoint = settings?.localEndpoint;
      const isPlaceholder = !chatEndpoint || chatEndpoint.includes('your-local-llm') || chatEndpoint.includes('placeholder');
      const endpoint = isPlaceholder ? localConfig?.endpoint : chatEndpoint;
      
      if (!endpoint) {
        throw new Error('Local endpoint is not configured.');
      }

      const supabaseLocalKey = Deno.env.get('LOCAL_LLM_API_KEY');
      const configLocalKey = localConfig?.apiKey;
      const localApiKey = supabaseLocalKey || configLocalKey || settings?.localApiKey;

      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };
      
      if (localApiKey) {
        headers['Authorization'] = `Bearer ${localApiKey}`;
      }

      const baseEndpoint = endpoint.replace(/\/+$/, '');
      const apiPath = baseEndpoint.endsWith('/v1') ? '/chat/completions' : '/v1/chat/completions';
      const fullUrl = `${baseEndpoint}${apiPath}`;
      
      const chatModel = settings?.localModel;
      const model = localConfig?.model || (chatModel && chatModel !== 'llama3' ? chatModel : null) || 'llama3';

      const localRequestBody: any = {
        model,
        messages: fullMessages,
        stream: true,
      };

      // Add tools if any are enabled (requires OpenAI-compatible local LLM)
      if (tools.length > 0) {
        localRequestBody.tools = tools;
        localRequestBody.tool_choice = 'auto';
      }

      response = await fetch(fullUrl, {
        method: 'POST',
        headers,
        body: JSON.stringify(localRequestBody),
      });
    } else if (aiProvider === 'n8n') {
      const n8nConfig = aiIntegrations?.n8n?.config || {};
      const webhookUrl = settings?.n8nWebhookUrl || n8nConfig?.webhookUrl;
      if (!webhookUrl) {
        throw new Error('N8N webhook URL is not configured.');
      }

      const supabaseN8nKey = Deno.env.get('N8N_API_KEY');
      const configN8nKey = n8nConfig?.apiKey;
      const n8nApiKey = supabaseN8nKey || configN8nKey;

      const n8nWebhookType = settings?.n8nWebhookType || n8nConfig?.webhookType || 'chat';
      const lastUserMessage = messages.filter(m => m.role === 'user').pop();
      
      let n8nPayload: Record<string, unknown>;
      
      if (n8nWebhookType === 'chat') {
        n8nPayload = {
          chatInput: lastUserMessage?.content || '',
          sessionId: sessionId || conversationId,
          systemPrompt,
        };
      } else {
        n8nPayload = {
          messages: fullMessages,
          model: 'gpt-4',
          conversationId,
          sessionId,
        };
      }

      const n8nHeaders: Record<string, string> = {
        'Content-Type': 'application/json',
      };
      
      if (n8nApiKey) {
        n8nHeaders['Authorization'] = n8nApiKey.startsWith('Bearer ') ? n8nApiKey : `Bearer ${n8nApiKey}`;
      }

      const n8nResponse = await fetch(webhookUrl, {
        method: 'POST',
        headers: n8nHeaders,
        body: JSON.stringify(n8nPayload),
      });

      if (!n8nResponse.ok) {
        const errorText = await n8nResponse.text();
        console.error('N8N webhook error:', n8nResponse.status, errorText);
        throw new Error('N8N webhook failed');
      }

      const n8nData = await n8nResponse.json();
      
      let responseContent = 'I could not process your request.';
      
      if (Array.isArray(n8nData) && n8nData.length > 0) {
        responseContent = n8nData[0].output || n8nData[0].message || n8nData[0].response || responseContent;
      } else if (typeof n8nData === 'object' && n8nData !== null) {
        responseContent = n8nData.output || n8nData.message || n8nData.response || responseContent;
      }
      
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
        return new Response(JSON.stringify({ error: 'Too many requests. Please wait and try again.' }), {
          status: 429,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: 'Credits exhausted. Contact administrator.' }), {
          status: 402,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      const errorText = await response.text();
      console.error('AI provider error:', response.status, errorText);
      return new Response(JSON.stringify({ error: 'AI service error.' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(response.body, {
      headers: { ...corsHeaders, 'Content-Type': 'text/event-stream' },
    });

  } catch (error) {
    console.error('Chat completion error:', error);
    return new Response(JSON.stringify({ 
      error: error instanceof Error ? error.message : 'An unexpected error occurred.' 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
