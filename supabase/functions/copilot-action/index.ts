import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

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
2. You create first block → "Here's your hero section. Does this look right?"
3. User says "yes" → "Done! Here's the features section..."
4. Continue until page complete → "Page ready! Moving to About Us..."
5. After all pages → "Pages done! Migrating your X blog posts..."
6. After blog → "Now your knowledge base..."
7. Final → "🎉 Complete! Here's your summary..."

RESPONSE STYLE:
- One sentence max before showing a block
- "Here's your [section]. [Quick question or statement]"
- "Done! Next up: [what's happening]"
- Celebrate: "Perfect! ✨" "Added! 🎉"
- Never explain what buttons to click
- Never mention "the panel on the right" or "Site Overview"

BLOCK TYPES: hero, text, features, cta, testimonials, stats, team, logos, timeline, accordion, gallery, separator, contact, quote, pricing, booking, newsletter, products, chat, form

RULES:
- Modules auto-enable - don't mention them
- One block at a time
- After creating block, ask for quick yes/no feedback
- Track progress, avoid duplicates
- If stuck, ask ONE specific question`;

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { messages, currentModules, continueAfterToolCall } = await req.json();

    // Get API key from environment - prefer Lovable AI
    const lovableApiKey = Deno.env.get('LOVABLE_API_KEY');
    const openaiApiKey = Deno.env.get('OPENAI_API_KEY');
    
    const apiKey = lovableApiKey || openaiApiKey;
    const apiUrl = lovableApiKey 
      ? 'https://ai.gateway.lovable.dev/v1/chat/completions'
      : 'https://api.openai.com/v1/chat/completions';
    const model = lovableApiKey ? 'google/gemini-2.5-flash' : 'gpt-4o-mini';

    if (!apiKey) {
      return new Response(
        JSON.stringify({ error: 'AI not configured. Please add LOVABLE_API_KEY or OPENAI_API_KEY.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const tools = [
      {
        type: "function",
        function: {
          name: "migrate_url",
          description: "Scrape and analyze a URL to migrate its content into CMS blocks. Use when user wants to migrate an existing website.",
          parameters: {
            type: "object",
            properties: {
              url: { 
                type: "string", 
                description: "The full URL to migrate (e.g., https://example.com)" 
              },
              pageType: { 
                type: "string", 
                enum: ["landing", "about", "contact", "services", "pricing", "blog", "other"],
                description: "Type of page being migrated"
              }
            },
            required: ["url"]
          }
        }
      },
      {
        type: "function",
        function: {
          name: "create_hero_block",
          description: "Create a Hero section with title, subtitle, and optional call-to-action button",
          parameters: {
            type: "object",
            properties: {
              title: { type: "string", description: "Main headline" },
              subtitle: { type: "string", description: "Supporting text" },
              primaryButtonText: { type: "string", description: "Button text" },
              primaryButtonUrl: { type: "string", description: "Button URL" }
            },
            required: ["title"]
          }
        }
      },
      {
        type: "function",
        function: {
          name: "create_features_block",
          description: "Create a Features section showcasing services or benefits",
          parameters: {
            type: "object",
            properties: {
              title: { type: "string" },
              subtitle: { type: "string" },
              features: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    title: { type: "string" },
                    description: { type: "string" },
                    icon: { type: "string" }
                  }
                }
              }
            },
            required: ["features"]
          }
        }
      },
      {
        type: "function",
        function: {
          name: "create_cta_block",
          description: "Create a Call-to-Action section",
          parameters: {
            type: "object",
            properties: {
              title: { type: "string" },
              subtitle: { type: "string" },
              buttonText: { type: "string" },
              buttonUrl: { type: "string" }
            },
            required: ["title", "buttonText"]
          }
        }
      },
      {
        type: "function",
        function: {
          name: "create_contact_block",
          description: "Create a contact form",
          parameters: {
            type: "object",
            properties: {
              title: { type: "string" },
              subtitle: { type: "string" },
              submitButtonText: { type: "string" }
            }
          }
        }
      },
      {
        type: "function",
        function: {
          name: "create_testimonials_block",
          description: "Create a testimonials section with customer quotes",
          parameters: {
            type: "object",
            properties: {
              title: { type: "string" },
              testimonials: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    quote: { type: "string" },
                    author: { type: "string" },
                    role: { type: "string" }
                  }
                }
              }
            },
            required: ["testimonials"]
          }
        }
      },
      {
        type: "function",
        function: {
          name: "create_text_block",
          description: "Create a text/content section with rich text",
          parameters: {
            type: "object",
            properties: {
              content: { type: "string", description: "HTML content or plain text" }
            },
            required: ["content"]
          }
        }
      },
      {
        type: "function",
        function: {
          name: "create_stats_block",
          description: "Create a statistics section with numbers and labels",
          parameters: {
            type: "object",
            properties: {
              title: { type: "string" },
              stats: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    value: { type: "string", description: "The number or value" },
                    label: { type: "string", description: "Description of the stat" }
                  }
                }
              }
            },
            required: ["stats"]
          }
        }
      },
      {
        type: "function",
        function: {
          name: "create_team_block",
          description: "Create a team section showcasing team members",
          parameters: {
            type: "object",
            properties: {
              title: { type: "string" },
              members: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    name: { type: "string" },
                    role: { type: "string" },
                    bio: { type: "string" }
                  }
                }
              }
            },
            required: ["members"]
          }
        }
      },
      {
        type: "function",
        function: {
          name: "create_logos_block",
          description: "Create a logos section showing partner or client logos",
          parameters: {
            type: "object",
            properties: {
              title: { type: "string" },
              logos: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    name: { type: "string" },
                    url: { type: "string" }
                  }
                }
              }
            }
          }
        }
      },
      {
        type: "function",
        function: {
          name: "create_timeline_block",
          description: "Create a timeline section showing history or process steps",
          parameters: {
            type: "object",
            properties: {
              title: { type: "string" },
              items: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    title: { type: "string" },
                    description: { type: "string" },
                    date: { type: "string" }
                  }
                }
              }
            },
            required: ["items"]
          }
        }
      },
      {
        type: "function",
        function: {
          name: "create_accordion_block",
          description: "Create an FAQ/accordion section with expandable items",
          parameters: {
            type: "object",
            properties: {
              title: { type: "string" },
              items: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    question: { type: "string" },
                    answer: { type: "string" }
                  }
                }
              }
            },
            required: ["items"]
          }
        }
      },
      {
        type: "function",
        function: {
          name: "create_gallery_block",
          description: "Create an image gallery section",
          parameters: {
            type: "object",
            properties: {
              layout: { type: "string", enum: ["grid", "masonry"], description: "Gallery layout style" },
              columns: { type: "number", enum: [2, 3, 4], description: "Number of columns" }
            }
          }
        }
      },
      {
        type: "function",
        function: {
          name: "create_separator_block",
          description: "Create a visual separator between sections",
          parameters: {
            type: "object",
            properties: {
              style: { type: "string", enum: ["line", "dots", "ornament", "space"] },
              spacing: { type: "string", enum: ["sm", "md", "lg"] }
            }
          }
        }
      },
      {
        type: "function",
        function: {
          name: "create_quote_block",
          description: "Create a quote/testimonial highlight block",
          parameters: {
            type: "object",
            properties: {
              text: { type: "string", description: "The quote text" },
              author: { type: "string" },
              source: { type: "string" }
            },
            required: ["text"]
          }
        }
      },
      {
        type: "function",
        function: {
          name: "create_pricing_block",
          description: "Create a pricing table section",
          parameters: {
            type: "object",
            properties: {
              title: { type: "string" },
              plans: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    name: { type: "string" },
                    price: { type: "string" },
                    period: { type: "string" },
                    features: { type: "array", items: { type: "string" } },
                    highlighted: { type: "boolean" }
                  }
                }
              }
            },
            required: ["plans"]
          }
        }
      }
    ];

    console.log('Copilot request:', { 
      messageCount: messages.length, 
      continueAfterToolCall,
      usingLovableAI: !!lovableApiKey 
    });

    // Call AI
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: COPILOT_SYSTEM_PROMPT },
          ...messages
        ],
        tools,
        tool_choice: 'auto',
        ...(lovableApiKey ? {} : { temperature: 0.7 }),
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
