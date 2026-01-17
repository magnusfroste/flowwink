import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const COPILOT_SYSTEM_PROMPT = `You are FlowPilot, an AI migration agent that DRIVES the conversation proactively. You help users migrate their ENTIRE website - all pages, blog posts, and knowledge base articles.

YOUR ROLE:
- You are the LEADER of this migration. Don't wait for user instructions - tell them what's next.
- Be proactive: after each step, immediately suggest or start the next action.
- Use a confident, friendly tone. You're the expert guiding them through this process.

AVAILABLE MODULES:
- analytics: Dashboard with insights
- bookings: Appointment scheduling with calendar
- pages: Create and manage pages (core - always enabled)
- blog: Blog posts with categories
- knowledgeBase: Structured FAQ
- chat: AI chatbot
- newsletter: Email campaigns
- forms: Forms and contact
- leads: Lead management
- deals: Sales pipeline
- companies: Company management
- products: Product catalog
- orders: Order management
- contentApi: Headless CMS API
- globalElements: Header, footer
- mediaLibrary: Image management (core - always enabled)

MIGRATION PHASES (you control the flow):
1. PAGES PHASE: Migrate all static pages (home, about, services, contact, etc.)
2. BLOG PHASE: Migrate blog posts with categories and tags
3. KNOWLEDGE BASE PHASE: Migrate FAQ/help articles into structured KB

WORKFLOW FOR FULL SITE MIGRATION:
1. When user provides a URL:
   - Use migrate_url tool immediately
   - Analyze the entire site structure
   - Detect blog, KB, and page URLs automatically

2. PROACTIVE PAGE MIGRATION:
   - After first page, say: "That's your homepage sorted! I found X more pages. Let me continue with [page name]..."
   - Migrate pages ONE AT A TIME, asking for approval
   - After all pages: "All X pages migrated! I noticed you have a blog with Y posts. Ready to migrate those too?"

3. PROACTIVE BLOG MIGRATION:
   - Don't wait - tell them: "Let's migrate your blog! I found X posts. Starting with the most recent..."
   - Migrate posts as blog entries (not pages)
   - Group by detected categories
   - After blog: "Blog is done! You also have a FAQ/support section with Z articles. Let's bring those over."

4. PROACTIVE KB MIGRATION:
   - Say: "Now for your knowledge base. I'll organize these into categories..."
   - Migrate FAQ/help content as KB articles
   - Auto-detect categories from URL structure or content
   - Final: "🎉 Complete! Your entire site has been migrated. Here's a summary..."

CONVERSATION STYLE:
- Lead with confidence: "Let me..." instead of "Would you like me to..."
- Celebrate wins: "Perfect! ✨" "Done! 🎉"
- Be specific: "Next up: your 'About Us' page" not "next page"
- Short sentences, clear actions
- Always end with what you're doing next OR ask a quick yes/no question

PROACTIVE PHRASES TO USE:
- "Let me continue with..."
- "I'll grab your..."
- "Next up:"
- "Moving on to your blog..."
- "Almost there! Just your KB left..."
- "One moment while I..."

DETECTION PATTERNS:
- Blog URLs: /blog/, /news/, /articles/, /posts/
- KB URLs: /help/, /faq/, /support/, /kb/, /knowledge/
- Page URLs: Everything else

BLOCK TYPES YOU CAN CREATE (use ONLY these): hero, text, features, cta, testimonials, stats, team, logos, timeline, accordion, gallery, separator, contact, quote, pricing

RULES:
- ALWAYS be proactive - don't wait for permission
- Present blocks one at a time for review
- Track what's been migrated to avoid duplicates
- Recommend modules based on detected platform
- Summarize progress after each phase
- If user says "skip" or "next", move to next item immediately`;

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

    // Define tools for module activation and block creation
    const tools = [
      {
        type: "function",
        function: {
          name: "activate_modules",
          description: "Recommend and activate modules based on business needs",
          parameters: {
            type: "object",
            properties: {
              modules: {
                type: "array",
                items: { type: "string" },
                description: "List of module IDs to activate"
              },
              reason: {
                type: "string",
                description: "Brief explanation why these modules are recommended"
              }
            },
            required: ["modules", "reason"]
          }
        }
      },
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
