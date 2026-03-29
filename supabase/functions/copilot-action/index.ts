import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { BLOCK_CREATION_TOOLS, toolNameToBlockType } from '../_shared/block-tools.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const COPILOT_SYSTEM_PROMPT = `You are FlowPilot, an AI migration agent that TAKES ACTION, not just describes actions. You help users migrate their ENTIRE website automatically.

CORE BEHAVIOR:
- You ARE the interface. Never tell users to "click a button" or "look at a panel".
- When you create a block, you show it and ask for quick feedback.
- Take action immediately, then ask for approval.
- Be confident: "Here's your hero section" not "Would you like me to create..."

CONVERSATION COMMANDS (users speak naturally, you act):
- "yes" / "looks good" / "keep it" → You approve and move to next
- "skip" / "next" / "pass" → You skip current block, continue
- "make it shorter" / feedback → You regenerate with that feedback
- "stop" / "pause" → You pause migration
- "skip blog" / "just pages" → You skip entire phase

MIGRATION FLOW (you drive it):
1. User pastes URL → You analyze and start migrating IMMEDIATELY
2. EXTRACT CONTACT INFO: Look for phone, email, address, opening hours in the page content
3. If you find contact info → Call update_footer ONCE with all the info you found
4. You create first block → "Here's your hero section. Does this look right?"
5. User says "yes" → "Done! Here's the features section..."
6. Continue until page complete → "Page ready! Moving to About Us..."
7. After all pages → "Pages done! Migrating your X blog posts..."
8. After blog → "Now your knowledge base..."
9. Final → "🎉 Complete! Here's your summary..."

FOOTER EXTRACTION (do this ONCE per site):
- When you scrape the homepage or contact page, look for:
  * Phone numbers (e.g., "08-123 45 67", "+46 8 123 45 67")
  * Email addresses (e.g., "info@example.com")
  * Street addresses (e.g., "Main Street 123")
  * Postal codes and cities (e.g., "123 45 Stockholm")
  * Opening hours (weekdays and weekends)
- Call update_footer with the extracted information
- Only extract the MAIN contact info (not department-specific numbers)
- If hours are complex, simplify to weekday/weekend format

RESPONSE STYLE:
- One sentence max before showing a block
- "Here's your [section]. [Quick question or statement]"
- "Done! Next up: [what's happening]"
- Celebrate: "Perfect! ✨" "Added! 🎉"
- Never explain what buttons to click
- Never mention "the panel on the right" or "Site Overview"

BLOCK TYPES: hero, text, features, cta, testimonials, stats, team, logos, timeline, accordion, gallery, separator, contact, quote, pricing, booking, newsletter, products, chat, form, image, two-column, info-box, article-grid, youtube, map, popup, cart, kb-featured, kb-hub, kb-search, kb-accordion, announcement-bar, tabs, marquee, embed, lottie, table, countdown, progress, badge, social-proof, notification-toast, floating-cta, chat-launcher, webinar, parallax-section, bento-grid, section-divider, featured-carousel, resume-matcher, featured-product, trust-bar, category-nav, shipping-info, ai-assistant, quick-links, link-grid, comparison

RULES:
- Modules auto-enable - don't mention them
- One block at a time
- After creating block, ask for quick yes/no feedback
- Track progress, avoid duplicates
- Extract footer info ONCE when you first see contact details
- If stuck, ask ONE specific question`;

// Helper to get AI configuration from settings
async function getAIConfiguration(): Promise<{
  apiKey: string;
  apiUrl: string;
  model: string;
  provider: string;
}> {
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabase = createClient(supabaseUrl, supabaseKey);
  
  // Try to read AI provider from site_settings
  const { data: integrations } = await supabase
    .from('site_settings')
    .select('value')
    .eq('key', 'integrations')
    .maybeSingle();

  const aiSettings = (integrations?.value as Record<string, any>) || {};
  
  // Check which AI provider is enabled in settings
  if (aiSettings?.openai?.enabled && Deno.env.get('OPENAI_API_KEY')) {
    const config = aiSettings.openai.config || {};
    return {
      apiKey: Deno.env.get('OPENAI_API_KEY')!,
      apiUrl: 'https://api.openai.com/v1/chat/completions',
      model: config.model || 'gpt-4o-mini',
      provider: 'openai'
    };
  }
  
  if (aiSettings?.gemini?.enabled && Deno.env.get('GEMINI_API_KEY')) {
    const config = aiSettings.gemini.config || {};
    return {
      apiKey: Deno.env.get('GEMINI_API_KEY')!,
      apiUrl: 'https://generativelanguage.googleapis.com/v1beta/models',
      model: config.model || 'gemini-2.0-flash-exp',
      provider: 'gemini'
    };
  }
  
  if (aiSettings?.local_llm?.enabled) {
    const config = aiSettings.local_llm.config || {};
    const apiKey = Deno.env.get('LOCAL_LLM_API_KEY') || '';
    if (config.endpoint) {
      return {
        apiKey,
        apiUrl: config.endpoint,
        model: config.model || 'llama3',
        provider: 'local'
      };
    }
  }
  
  // Fallback: Lovable AI > OpenAI > error
  const lovableApiKey = Deno.env.get('LOVABLE_API_KEY');
  if (lovableApiKey) {
    return {
      apiKey: lovableApiKey,
      apiUrl: 'https://ai.gateway.lovable.dev/v1/chat/completions',
      model: 'google/gemini-2.5-flash',
      provider: 'lovable'
    };
  }
  
  const openaiApiKey = Deno.env.get('OPENAI_API_KEY');
  if (openaiApiKey) {
    return {
      apiKey: openaiApiKey,
      apiUrl: 'https://api.openai.com/v1/chat/completions',
      model: 'gpt-4o-mini',
      provider: 'openai'
    };
  }
  
  throw new Error('No AI provider configured');
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { messages, currentModules, continueAfterToolCall } = await req.json();

    // Get AI configuration from settings or environment
    let aiConfig;
    try {
      aiConfig = await getAIConfiguration();
    } catch (e) {
      return new Response(
        JSON.stringify({ error: 'AI not configured. Please add LOVABLE_API_KEY or OPENAI_API_KEY, or configure an AI provider in Chat Settings.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const tools = [
      // Migration-specific tools (manual)
      {
        type: "function",
        function: {
          name: "migrate_url",
          description: "Scrape and analyze a URL to migrate its content into CMS blocks. Use when user wants to migrate an existing website.",
          parameters: {
            type: "object",
            properties: {
              url: { type: "string", description: "The full URL to migrate (e.g., https://example.com)" },
              pageType: { type: "string", enum: ["landing", "about", "contact", "services", "pricing", "blog", "other"], description: "Type of page being migrated" }
            },
            required: ["url"]
          }
        }
      },
      {
        type: "function",
        function: {
          name: "update_footer",
          description: "Update footer with contact information extracted from the migrated site. Use when you find contact details like phone, email, address, or opening hours on the site.",
          parameters: {
            type: "object",
            properties: {
              phone: { type: "string", description: "Phone number" },
              email: { type: "string", description: "Email address" },
              address: { type: "string", description: "Street address" },
              postalCode: { type: "string", description: "Postal code and city" },
              weekdayHours: { type: "string", description: "Weekday opening hours" },
              weekendHours: { type: "string", description: "Weekend opening hours" }
            }
          }
        }
      },
      // Block creation tools — auto-generated from block-reference.ts
      ...BLOCK_CREATION_TOOLS,
    ];

    console.log('Copilot request:', { 
      messageCount: messages.length, 
      continueAfterToolCall,
      provider: aiConfig.provider,
      model: aiConfig.model
    });

    // Call AI
    const response = await fetch(aiConfig.apiUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${aiConfig.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: aiConfig.model,
        messages: [
          { role: 'system', content: COPILOT_SYSTEM_PROMPT },
          ...messages
        ],
        tools,
        tool_choice: 'auto',
        ...(aiConfig.provider === 'lovable' ? {} : { temperature: 0.7 }),
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      console.error('AI error:', response.status, error);
      
      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: 'Rate limit exceeded. Please try again in a moment.' }),
          { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      if (response.status === 402) {
        return new Response(
          JSON.stringify({ error: 'AI credits depleted. Please add credits to continue.' }),
          { status: 402, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      
      throw new Error('Failed to get AI response');
    }

    const data = await response.json();
    const choice = data.choices[0];
    const assistantMessage = choice.message;

    console.log('AI response:', { 
      hasContent: !!assistantMessage.content,
      hasToolCalls: !!assistantMessage.tool_calls?.length 
    });

    // Process tool calls if any
    let toolCall = null;
    let responseMessage = assistantMessage.content || '';

    if (assistantMessage.tool_calls && assistantMessage.tool_calls.length > 0) {
      const tc = assistantMessage.tool_calls[0];
      toolCall = {
        name: tc.function.name,
        arguments: JSON.parse(tc.function.arguments),
      };

      // If there's no message but there's a tool call, generate a contextual message
      if (!responseMessage) {
        if (toolCall.name === 'activate_modules') {
          responseMessage = `Based on your business, I recommend activating some modules that will help you get started. ${toolCall.arguments.reason}`;
        } else if (toolCall.name === 'migrate_url') {
          responseMessage = `I'll analyze ${toolCall.arguments.url} and help you migrate the content. Give me a moment to scan the page...`;
        } else if (toolCall.name.startsWith('create_')) {
          const blockType = toolCall.name.replace('create_', '').replace('_block', '');
          responseMessage = `Creating a ${blockType} section for your page.`;
        }
      }
    }

    // Handle empty responses - ask for clarification
    if (!responseMessage && !toolCall) {
      responseMessage = "I'd love to help you build your website! Could you tell me a bit more about your business? For example:\n\n• What type of business is it? (restaurant, salon, agency, etc.)\n• What's the main goal of your website?\n• Any specific features you need?\n\nOr if you have an existing website, share the URL and I'll help you migrate it!";
    }

    return new Response(
      JSON.stringify({
        message: responseMessage,
        toolCall,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Copilot error:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
