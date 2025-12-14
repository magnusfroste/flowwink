import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const BLOCK_TYPES_SCHEMA = `
Available CMS block types:
1. hero - Hero section with title, subtitle, background image, optional CTA button
   Data: { title: string, subtitle?: string, backgroundImage?: string, primaryButton?: { text: string, url: string } }

2. text - Rich text content block
   Data: { content: string } // HTML content

3. image - Single image block
   Data: { src: string, alt?: string, caption?: string }

4. two-column - Two column layout with text and image
   Data: { content: string, imageSrc?: string, imageAlt?: string, imagePosition: 'left' | 'right' }

5. cta - Call to action block
   Data: { title: string, subtitle?: string, buttonText: string, buttonUrl: string }

6. link-grid - Grid of link cards with icons
   Data: { links: [{ title: string, description?: string, url: string, icon?: string }], columns: 2 | 3 | 4 }

7. article-grid - Grid of article cards
   Data: { title?: string, articles: [{ title: string, excerpt?: string, url: string, image?: string }], columns: 2 | 3 | 4 }

8. accordion - FAQ/Accordion sections
   Data: { title?: string, items: [{ question: string, answer: string }] }

9. info-box - Highlighted info box
   Data: { title?: string, content: string, variant: 'info' | 'warning' | 'success' | 'error' }

10. quote - Blockquote with attribution
    Data: { quote: string, author?: string, role?: string }

11. stats - Statistics display
    Data: { title?: string, stats: [{ value: string, label: string }] }

12. contact - Contact information block
    Data: { title?: string, phone?: string, email?: string, address?: string, hours?: string }

13. separator - Visual separator
    Data: { style: 'line' | 'dots' | 'space' }

14. youtube - YouTube video embed
    Data: { videoId: string, title?: string }

15. gallery - Image gallery
    Data: { images: [{ src: string, alt?: string, caption?: string }], columns: 2 | 3 | 4 }
`;

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { url } = await req.json();

    if (!url) {
      return new Response(
        JSON.stringify({ success: false, error: 'URL krävs' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const firecrawlKey = Deno.env.get('FIRECRAWL_API_KEY');
    const lovableKey = Deno.env.get('LOVABLE_API_KEY');

    if (!firecrawlKey) {
      return new Response(
        JSON.stringify({ success: false, error: 'FIRECRAWL_API_KEY saknas' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!lovableKey) {
      return new Response(
        JSON.stringify({ success: false, error: 'LOVABLE_API_KEY saknas' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Format URL
    let formattedUrl = url.trim();
    if (!formattedUrl.startsWith('http://') && !formattedUrl.startsWith('https://')) {
      formattedUrl = `https://${formattedUrl}`;
    }

    console.log('Step 1: Scraping URL with Firecrawl:', formattedUrl);

    // Step 1: Scrape with Firecrawl
    const scrapeResponse = await fetch('https://api.firecrawl.dev/v1/scrape', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${firecrawlKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        url: formattedUrl,
        formats: ['markdown', 'html'],
        onlyMainContent: true,
      }),
    });

    const scrapeData = await scrapeResponse.json();

    if (!scrapeResponse.ok) {
      console.error('Firecrawl error:', scrapeData);
      return new Response(
        JSON.stringify({ success: false, error: `Kunde inte scrapa sidan: ${scrapeData.error || scrapeResponse.status}` }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const markdown = scrapeData.data?.markdown || scrapeData.markdown || '';
    const html = scrapeData.data?.html || scrapeData.html || '';
    const metadata = scrapeData.data?.metadata || scrapeData.metadata || {};

    console.log('Step 2: Scraped content length:', markdown.length, 'chars');
    console.log('Metadata:', JSON.stringify(metadata));

    // Step 2: Use AI to map content to blocks
    console.log('Step 3: Mapping content to CMS blocks with AI...');

    const aiResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${lovableKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [
          {
            role: 'system',
            content: `Du är en expert på att analysera webbsidor och mappa innehåll till CMS-block.
Din uppgift är att ta innehåll från en scrapad webbsida och omvandla det till strukturerade CMS-block.

${BLOCK_TYPES_SCHEMA}

VIKTIGA REGLER:
1. Analysera innehållets struktur och välj lämpliga block-typer
2. Behåll all viktig text och bilder
3. Om sidan har en tydlig hero-sektion, använd "hero" block
4. Gruppera relaterat innehåll logiskt
5. Använd "text" block för vanlig text/artikelinnehåll
6. Extrahera bilder till "image" block eller inkludera i andra block
7. Identifiera FAQ-sektioner och använd "accordion"
8. Identifiera statistik och använd "stats" block
9. Behåll länkar i texten

YOUTUBE-VIDEOR - MYCKET VIKTIGT:
10. Leta efter YouTube-länkar i innehållet (youtube.com/watch?v=, youtu.be/, youtube.com/embed/)
11. Extrahera videoId från YouTube-URL:er:
    - youtube.com/watch?v=VIDEO_ID -> videoId = VIDEO_ID
    - youtu.be/VIDEO_ID -> videoId = VIDEO_ID  
    - youtube.com/embed/VIDEO_ID -> videoId = VIDEO_ID
12. Skapa "youtube" block för varje YouTube-video du hittar
13. Om det finns iframe-embeds med YouTube, extrahera videoId från src-attributet

Svara ENDAST med valid JSON, ingen annan text

Svara med ett JSON-objekt:
{
  "title": "Sidans titel",
  "blocks": [
    { "id": "block-1", "type": "hero", "data": { ... } },
    { "id": "block-2", "type": "text", "data": { ... } },
    { "id": "block-3", "type": "youtube", "data": { "videoId": "dQw4w9WgXcQ", "title": "Video titel" } }
  ]
}`
          },
          {
            role: 'user',
            content: `Analysera denna webbsida och skapa CMS-block:

URL: ${formattedUrl}
Titel: ${metadata.title || 'Okänd'}
Beskrivning: ${metadata.description || 'Ingen'}

INNEHÅLL (Markdown):
${markdown.substring(0, 15000)}

${markdown.length > 15000 ? '... (innehållet är trunkerat)' : ''}

HTML (för att hitta YouTube-iframes och embeds):
${html.substring(0, 5000)}

VIKTIGT: Leta specifikt efter YouTube-videor (youtube.com, youtu.be) och skapa "youtube" block för dem.

Skapa lämpliga CMS-block för detta innehåll. Svara endast med JSON.`
          }
        ],
      }),
    });

    if (!aiResponse.ok) {
      const aiError = await aiResponse.text();
      console.error('AI Gateway error:', aiResponse.status, aiError);
      
      if (aiResponse.status === 429) {
        return new Response(
          JSON.stringify({ success: false, error: 'Rate limit överskriden. Försök igen om en stund.' }),
          { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      if (aiResponse.status === 402) {
        return new Response(
          JSON.stringify({ success: false, error: 'AI-krediter slut. Lägg till mer i Lovable Settings.' }),
          { status: 402, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      
      return new Response(
        JSON.stringify({ success: false, error: 'AI-analys misslyckades' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const aiData = await aiResponse.json();
    const aiContent = aiData.choices?.[0]?.message?.content || '';
    
    console.log('Step 4: AI response received, parsing...');

    // Parse AI response - extract JSON from possible markdown code blocks
    let parsedBlocks;
    try {
      // Try to extract JSON from code blocks first
      const jsonMatch = aiContent.match(/```(?:json)?\s*([\s\S]*?)```/);
      const jsonString = jsonMatch ? jsonMatch[1].trim() : aiContent.trim();
      parsedBlocks = JSON.parse(jsonString);
    } catch (parseError) {
      console.error('Failed to parse AI response:', aiContent.substring(0, 500));
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'Kunde inte tolka AI-svaret',
          rawResponse: aiContent.substring(0, 1000)
        }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Ensure blocks have unique IDs
    const blocks = (parsedBlocks.blocks || []).map((block: any, index: number) => ({
      ...block,
      id: block.id || `block-${Date.now()}-${index}`,
    }));

    console.log('Step 5: Successfully mapped', blocks.length, 'blocks');

    return new Response(
      JSON.stringify({
        success: true,
        sourceUrl: formattedUrl,
        title: parsedBlocks.title || metadata.title || 'Importerad sida',
        blocks,
        metadata: {
          originalTitle: metadata.title,
          originalDescription: metadata.description,
          scrapedAt: new Date().toISOString(),
        }
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Migration error:', error);
    return new Response(
      JSON.stringify({ success: false, error: error instanceof Error ? error.message : 'Ett oväntat fel uppstod' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
