import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const COPILOT_SYSTEM_PROMPT = `Du är FlowWink Copilot, en expert på att bygga webbplatser.

TILLGÄNGLIGA MODULER:
- analytics: Dashboard med insikter
- bookings: Tidsbokning med kalender
- pages: Skapa och hantera sidor (core)
- blog: Blogginlägg med kategorier
- knowledgeBase: Strukturerad FAQ
- chat: AI-chatbot
- newsletter: E-postkampanjer
- forms: Formulär och kontakt
- leads: Lead-hantering
- deals: Pipeline för affärer
- companies: Företagshantering
- products: Produktkatalog
- orders: Orderhantering
- contentApi: Headless CMS API
- globalElements: Header, footer
- mediaLibrary: Bildhantering (core)

MODUL-REKOMMENDATIONER PER BRANSCH:
- Skönhet/Frisör/Spa: bookings, forms, products
- Restaurang/Café: bookings, forms, products, orders
- Konsult/Byrå: leads, deals, companies, forms, blog
- E-handel: products, orders, newsletter
- SaaS/Tech: blog, knowledgeBase, chat, newsletter
- Hantverkare: forms, bookings, leads

BLOCK-TYPER: hero, text, features, cta, testimonials, stats, team, logos, timeline, accordion, image, gallery, youtube, two-column, separator, form, chat, newsletter, map, booking, pricing, products, contact

REGLER:
1. Börja med att fråga om verksamhetstyp och namn
2. Baserat på svar, REKOMMENDERA lämpliga moduler med activate_modules
3. Vänta på bekräftelse innan nästa steg
4. Skapa ETT block i taget
5. Använd ENDAST befintliga block-typer

Använd tool calling för att aktivera moduler eller skapa block.`;

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { messages, currentModules } = await req.json();

    // Get API key from environment
    const apiKey = Deno.env.get('OPENAI_API_KEY');
    if (!apiKey) {
      return new Response(
        JSON.stringify({ error: 'AI not configured. Please add OPENAI_API_KEY.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Define tools for module activation and block creation
    const tools = [
      {
        type: "function",
        function: {
          name: "activate_modules",
          description: "Aktivera moduler baserat på verksamhetsbehov",
          parameters: {
            type: "object",
            properties: {
              modules: {
                type: "array",
                items: { type: "string" },
                description: "Lista med modul-ID:n att aktivera"
              },
              reason: {
                type: "string",
                description: "Kort förklaring varför dessa moduler rekommenderas"
              }
            },
            required: ["modules", "reason"]
          }
        }
      },
      {
        type: "function",
        function: {
          name: "create_hero_block",
          description: "Skapa en Hero-sektion",
          parameters: {
            type: "object",
            properties: {
              title: { type: "string", description: "Huvudrubrik" },
              subtitle: { type: "string", description: "Underrubrik" },
              primaryButton: {
                type: "object",
                properties: {
                  text: { type: "string" },
                  url: { type: "string" }
                }
              }
            },
            required: ["title"]
          }
        }
      },
      {
        type: "function",
        function: {
          name: "create_features_block",
          description: "Skapa en Features-sektion med tjänster/fördelar",
          parameters: {
            type: "object",
            properties: {
              title: { type: "string" },
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
          description: "Skapa en Call-to-Action sektion",
          parameters: {
            type: "object",
            properties: {
              title: { type: "string" },
              subtitle: { type: "string" },
              buttonText: { type: "string" },
              buttonUrl: { type: "string" }
            },
            required: ["title", "buttonText", "buttonUrl"]
          }
        }
      },
      {
        type: "function",
        function: {
          name: "create_contact_block",
          description: "Skapa ett kontaktformulär",
          parameters: {
            type: "object",
            properties: {
              title: { type: "string" },
              submitButtonText: { type: "string" },
              fields: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    type: { type: "string" },
                    label: { type: "string" },
                    required: { type: "boolean" }
                  }
                }
              }
            }
          }
        }
      }
    ];

    // Call OpenAI
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: COPILOT_SYSTEM_PROMPT },
          ...messages
        ],
        tools,
        tool_choice: 'auto',
        temperature: 0.7,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      console.error('OpenAI error:', error);
      throw new Error('Failed to get AI response');
    }

    const data = await response.json();
    const choice = data.choices[0];
    const assistantMessage = choice.message;

    // Process tool calls if any
    let toolCall = null;
    if (assistantMessage.tool_calls && assistantMessage.tool_calls.length > 0) {
      const tc = assistantMessage.tool_calls[0];
      toolCall = {
        name: tc.function.name,
        arguments: JSON.parse(tc.function.arguments),
      };
    }

    return new Response(
      JSON.stringify({
        message: assistantMessage.content || '',
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
