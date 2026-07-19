// copilot_action — internal skill handler.
//
// FlowPilot website-builder/migration copilot: one AI turn with the
// create_block / migrate_url / update_footer tool surface; returns
// { message, toolCall } for the frontend to act on.
//
// Moved from the standalone `copilot-action` edge function (edge-surface
// refactor B1a, wave 2). Response objects unchanged, including the
// rate-limit / credits error strings (the HTTP status distinctions collapse
// into the message text — agent-execute's edge: dispatch already parsed the
// body regardless of status, so no caller ever saw the codes).

import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { resolveAiConfig } from '../ai-config.ts';

const BLOCK_TYPES = [
  'hero', 'text', 'quote', 'cta', 'features', 'stats', 'testimonials', 'team',
  'logos', 'timeline', 'accordion', 'image', 'gallery', 'youtube', 'two-column',
  'separator', 'info-box', 'link-grid', 'form', 'chat', 'newsletter', 'map',
  'booking', 'popup', 'pricing', 'comparison', 'trust-bar', 'category-nav',
  'shipping-info', 'article-grid', 'announcement-bar', 'tabs', 'marquee',
  'embed', 'lottie', 'table', 'countdown', 'progress', 'badge', 'social-proof',
  'notification-toast', 'floating-cta', 'webinar', 'parallax-section',
  'bento-grid', 'section-divider', 'featured-carousel', 'consultant-matcher',
  'featured-product', 'ai-assistant', 'quick-links', 'kb-featured', 'kb-hub',
  'kb-search', 'kb-accordion', 'chat-launcher', 'cart', 'products', 'contact',
];

const COPILOT_SYSTEM_PROMPT = `You are FlowPilot, an AI website builder and migration agent. You help users create new websites or migrate existing ones.

CORE BEHAVIOR:
- You ARE the interface. Take action immediately, then ask for feedback.
- Be confident and concise: "Here's your hero section" not "Would you like me to..."
- One block at a time → show it → ask for quick yes/no feedback → continue.

HOW TO RESPOND TO USER INTENT:

1. USER PASTES A URL → They want to migrate. Call migrate_url to analyze the site, then recreate it block by block.
2. USER DESCRIBES A BUSINESS → They want a new site. Start building immediately with hero, then features, etc.
3. USER SAYS "yes" / "looks good" → Approve current block, create the next one.
4. USER GIVES FEEDBACK → Regenerate the current block with their feedback.
5. USER SAYS "skip" / "next" → Skip current block, move to next.

CREATING BLOCKS:
- Use create_block with the appropriate type and content data.
- Available types: ${BLOCK_TYPES.join(', ')}
- The data object should contain the block's content fields (title, subtitle, items, etc.)
- Match the content style to the user's business/brand.

MIGRATION FLOW:
1. User shares URL → call migrate_url to scrape and analyze
2. Extract contact info → call update_footer once with phone, email, address, hours
3. Recreate each section as a block, one at a time
4. Ask for approval between each block

FOOTER EXTRACTION (once per site):
- Look for phone, email, address, postal code, opening hours
- Call update_footer with all found contact details

RESPONSE STYLE:
- Max one sentence before showing a block
- "Here's your [section]. Look good?"
- "Done! ✨ Next up: [what's coming]"
- Never explain what buttons to click or mention UI panels`;

const TOOLS = [
  {
    type: "function",
    function: {
      name: "create_block",
      description: "Create a content block on the current page. Use the appropriate type for the content you want to add.",
      parameters: {
        type: "object",
        properties: {
          type: {
            type: "string",
            enum: BLOCK_TYPES,
            description: "The block type to create"
          },
          data: {
            type: "object",
            description: "Block content data. Common fields: title, subtitle, content, items[], buttonText, buttonLink, imageSrc, backgroundColor. Fields vary by block type."
          }
        },
        required: ["type", "data"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "migrate_url",
      description: "Scrape and analyze a URL to migrate its content into CMS blocks. Use when user pastes a URL or wants to migrate an existing website.",
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
      description: "Update footer with contact information extracted from a migrated site.",
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
];

export async function executeCopilotAction(
  supabase: SupabaseClient,
  args: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  try {
    const { messages, continueAfterToolCall } = args as { messages?: any[]; continueAfterToolCall?: boolean };

    // Validate input before touching it — an empty/missing `messages` would
    // otherwise throw "Cannot read properties of undefined (reading 'length')"
    // below. Fail fast with a clear contract error instead of a 500.
    if (!Array.isArray(messages) || messages.length === 0) {
      return { error: 'messages is required (a non-empty array of chat messages).' };
    }

    let aiConfig;
    try {
      aiConfig = await resolveAiConfig(supabase, 'fast');
    } catch {
      return { error: 'No AI provider configured. Add OPENAI_API_KEY, GEMINI_API_KEY, or configure AI in Settings.' };
    }

    console.log('Copilot request:', {
      messageCount: messages.length,
      continueAfterToolCall,
      model: aiConfig.model,
      toolCount: TOOLS.length,
    });

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
        tools: TOOLS,
        tool_choice: 'auto',
        temperature: 0.7,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      console.error('AI error:', response.status, error);

      if (response.status === 429) {
        return { error: 'Rate limit exceeded. Please try again in a moment.' };
      }
      if (response.status === 402) {
        return { error: 'AI credits depleted. Please add credits to continue.' };
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

    // Process tool calls
    let toolCall = null;
    let responseMessage = assistantMessage.content || '';

    if (assistantMessage.tool_calls?.length > 0) {
      const tc = assistantMessage.tool_calls[0];
      const tcArgs = JSON.parse(tc.function.arguments);

      if (tc.function.name === 'create_block') {
        // Map unified create_block back to the legacy create_*_block format
        // so the frontend handler continues to work
        const blockType = tcArgs.type;
        toolCall = {
          name: `create_${blockType.replace(/-/g, '_')}_block`,
          arguments: tcArgs.data || {},
        };
        if (!responseMessage) {
          responseMessage = `Creating a ${blockType} section for your page.`;
        }
      } else {
        toolCall = {
          name: tc.function.name,
          arguments: tcArgs,
        };
        if (!responseMessage) {
          if (tc.function.name === 'migrate_url') {
            responseMessage = `I'll analyze ${tcArgs.url} and start migrating. Give me a moment...`;
          }
        }
      }
    }

    // Fallback for empty responses
    if (!responseMessage && !toolCall) {
      responseMessage = "I'd love to help you build your website! You can:\n\n• **Paste a URL** to migrate an existing site\n• **Describe your business** and I'll create a site for you\n\nWhat would you like to do?";
    }

    return { message: responseMessage, toolCall };

  } catch (error) {
    console.error('Copilot error:', error);
    return { error: error instanceof Error ? error.message : 'Internal server error' };
  }
}
