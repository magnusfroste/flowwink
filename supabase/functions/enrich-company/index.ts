import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface EnrichmentResult {
  industry?: string;
  size?: string;
  website?: string;
  phone?: string;
  address?: string;
  description?: string;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { domain } = await req.json();
    
    if (!domain) {
      return new Response(
        JSON.stringify({ error: 'Domain is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const firecrawlApiKey = Deno.env.get('FIRECRAWL_API_KEY');
    const lovableApiKey = Deno.env.get('LOVABLE_API_KEY');

    if (!firecrawlApiKey || !lovableApiKey) {
      console.error('Missing API keys');
      return new Response(
        JSON.stringify({ error: 'API keys not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Normalize domain to URL
    const url = domain.startsWith('http') ? domain : `https://${domain}`;
    console.log(`Scraping website: ${url}`);

    // Use Firecrawl to scrape the company website
    const scrapeResponse = await fetch('https://api.firecrawl.dev/v1/scrape', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${firecrawlApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        url,
        formats: ['markdown'],
        onlyMainContent: true,
      }),
    });

    if (!scrapeResponse.ok) {
      const errorText = await scrapeResponse.text();
      console.error('Firecrawl error:', errorText);
      return new Response(
        JSON.stringify({ error: 'Failed to scrape website', details: errorText }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const scrapeData = await scrapeResponse.json();
    const pageContent = scrapeData.data?.markdown || '';
    const metadata = scrapeData.data?.metadata || {};

    console.log('Scraped content length:', pageContent.length);
    console.log('Metadata:', JSON.stringify(metadata));

    // Use Lovable AI to extract structured company info
    const aiResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${lovableApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [
          {
            role: 'system',
            content: `You are a company data extraction expert. Extract structured company information from website content.
            
Return a JSON object with these fields (use null if not found):
- industry: The company's industry/sector (map to one of: Teknik, Finans, Hälsovård, Tillverkning, Detaljhandel, Konsulting, Utbildning, Media, Fastigheter, Transport, Övrigt)
- size: Estimate company size based on content (use one of: 1-10, 11-50, 51-200, 201-500, 501-1000, 1000+)
- phone: Company phone number
- address: Company address or location
- description: A brief 1-2 sentence description of what the company does

Only return the JSON object, no other text.`
          },
          {
            role: 'user',
            content: `Extract company information from this website content:\n\nURL: ${url}\nTitle: ${metadata.title || 'Unknown'}\nDescription: ${metadata.description || 'None'}\n\nContent:\n${pageContent.substring(0, 8000)}`
          }
        ],
        tools: [
          {
            type: 'function',
            function: {
              name: 'extract_company_info',
              description: 'Extract structured company information',
              parameters: {
                type: 'object',
                properties: {
                  industry: { 
                    type: 'string', 
                    enum: ['Teknik', 'Finans', 'Hälsovård', 'Tillverkning', 'Detaljhandel', 'Konsulting', 'Utbildning', 'Media', 'Fastigheter', 'Transport', 'Övrigt'],
                    description: 'Company industry' 
                  },
                  size: { 
                    type: 'string', 
                    enum: ['1-10', '11-50', '51-200', '201-500', '501-1000', '1000+'],
                    description: 'Estimated company size' 
                  },
                  phone: { type: 'string', description: 'Company phone number' },
                  address: { type: 'string', description: 'Company address' },
                  description: { type: 'string', description: 'Brief company description' }
                },
                required: []
              }
            }
          }
        ],
        tool_choice: { type: 'function', function: { name: 'extract_company_info' } }
      }),
    });

    if (!aiResponse.ok) {
      const errorText = await aiResponse.text();
      console.error('AI API error:', errorText);
      return new Response(
        JSON.stringify({ error: 'Failed to analyze website' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const aiData = await aiResponse.json();
    console.log('AI response:', JSON.stringify(aiData));

    // Extract the tool call result
    const toolCall = aiData.choices?.[0]?.message?.tool_calls?.[0];
    let enrichment: EnrichmentResult = {};

    if (toolCall?.function?.arguments) {
      try {
        enrichment = JSON.parse(toolCall.function.arguments);
      } catch (e) {
        console.error('Failed to parse tool call arguments:', e);
      }
    }

    // Add website URL
    enrichment.website = url;

    console.log('Enrichment result:', JSON.stringify(enrichment));

    return new Response(
      JSON.stringify({ success: true, data: enrichment }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in enrich-company function:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
