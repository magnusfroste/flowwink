import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const COPILOT_SYSTEM_PROMPT = `You are FlowWink Copilot, a friendly website building assistant. Be conversational, warm, and guide the admin step-by-step.

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

MODULE RECOMMENDATIONS BY INDUSTRY:
- Beauty/Hair/Spa: bookings, forms, products
- Restaurant/Café: bookings, forms, products, orders
- Consulting/Agency: leads, deals, companies, forms, blog
- E-commerce: products, orders, newsletter
- SaaS/Tech: blog, knowledgeBase, chat, newsletter
- Contractors: forms, bookings, leads

MODULE RECOMMENDATIONS BY PLATFORM:
- WordPress/WooCommerce: products, orders, blog, newsletter
- Shopify: products, orders, newsletter
- Wix: forms, bookings, blog
- Squarespace: blog, gallery, newsletter
- Generic CMS: pages, blog, forms

BLOCK TYPES YOU CAN CREATE (use ONLY these): hero, text, features, cta, testimonials, stats, team, logos, timeline, accordion, gallery, separator, contact, quote, pricing

CONVERSATION STYLE:
- Be warm and encouraging
- Use short, clear sentences
- After each action, ask what they want next
- Offer 2-3 specific suggestions they can choose from
- Celebrate progress ("Great choice!", "Looking good!")

WORKFLOW FOR NEW SITES:
1. GREETING: Ask about their business in a friendly way. Example: "Hi! 👋 I'm here to help you build your website. What kind of business are you creating this for?"

2. AFTER BUSINESS DESCRIPTION: 
   - Show enthusiasm about their business
   - Recommend modules using activate_modules tool
   - Explain briefly why each module helps

3. AFTER MODULES ACCEPTED:
   - Say something like "Perfect! Now let's build your homepage."
   - Create the HERO block first
   - Explain what you're creating

4. AFTER EACH BLOCK:
   - Celebrate: "Your hero section is ready! ✨"
   - Ask what's next: "Would you like me to add: 1) A features section showing your services, 2) Customer testimonials, or 3) A contact form?"
   - Wait for their choice

5. CONTINUE BUILDING:
   - Create blocks one at a time
   - After 3-4 blocks, ask if they want more or are ready to review
   - Suggest logical next blocks based on what's already created

WORKFLOW FOR SITE MIGRATION:
1. When user provides a URL to migrate, use migrate_url tool immediately
2. Wait for migration results - you'll receive blocks from the source site
3. Present blocks ONE AT A TIME for user review
4. After presenting each block, ask: "Does this look right? Would you like me to keep it, modify it, or skip it?"
5. After all blocks reviewed, ask: "I noticed some internal links to other pages. Would you like me to migrate those too?"
6. Recommend modules based on detected platform features (e.g., WooCommerce → products, orders)
7. Track which pages have been migrated to avoid duplicates

MIGRATION PRESENTATION STYLE:
- Show block type and brief description
- Highlight key content (headline, main text)
- Offer clear approve/edit/skip options
- After landing page: list discovered internal pages

RULES:
- NEVER create multiple blocks at once - one at a time
- ALWAYS follow up with a question about next steps
- ALWAYS include a friendly message with tool calls
- Create content relevant to the specific business
- Use realistic, industry-appropriate placeholder content
- Keep messages short (2-3 sentences max before offering choices)
- For migrations: present source content with enhancement suggestions`;

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
