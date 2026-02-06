import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.87.1";

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
    const { domain, companyId } = await req.json();
    
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Resolve domain from companyId if needed
    let enrichDomain = domain;
    let targetCompanyId = companyId;

    if (!enrichDomain && companyId) {
      // Fetch company's domain from database
      const { data: company, error: companyError } = await supabase
        .from('companies')
        .select('id, domain, enriched_at')
        .eq('id', companyId)
        .single();

      if (companyError || !company) {
        console.error('Company not found:', companyError);
        return new Response(
          JSON.stringify({ error: 'Company not found' }),
          { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      if (!company.domain) {
        return new Response(
          JSON.stringify({ error: 'Company has no domain to enrich' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Skip if already enriched
      if (company.enriched_at) {
        console.log(`Company ${companyId} already enriched at ${company.enriched_at}`);
        return new Response(
          JSON.stringify({ success: true, message: 'Already enriched', skipped: true }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      enrichDomain = company.domain;
      targetCompanyId = company.id;
    }
    
    if (!enrichDomain) {
      return new Response(
        JSON.stringify({ error: 'Domain or companyId is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const firecrawlApiKey = Deno.env.get('FIRECRAWL_API_KEY');
    const openaiKey = Deno.env.get('OPENAI_API_KEY');
    const geminiKey = Deno.env.get('GEMINI_API_KEY');

    if (!firecrawlApiKey) {
      console.error('Missing Firecrawl API key');
      return new Response(
        JSON.stringify({ error: 'FIRECRAWL_API_KEY not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!openaiKey && !geminiKey) {
      console.error('Missing AI API key');
      return new Response(
        JSON.stringify({ error: 'AI API key not configured. Add OPENAI_API_KEY or GEMINI_API_KEY to Supabase Secrets.' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const useGemini = !openaiKey && geminiKey;

    // Normalize domain to URL
    const url = enrichDomain.startsWith('http') ? enrichDomain : `https://${enrichDomain}`;
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

    // Use AI to extract structured company info
    let aiResponse: Response;

    if (useGemini) {
      // Use Google Gemini API
      const model = 'gemini-2.0-flash-exp';
      const systemContent = `You are a company data extraction expert. Extract structured company information from website content.
            
Return a JSON object with these fields (use null if not found):
- industry: The company's industry/sector (map to one of: Teknik, Finans, Hälsovård, Tillverkning, Detaljhandel, Konsulting, Utbildning, Media, Fastigheter, Transport, Övrigt)
- size: Estimate company size based on content (use one of: 1-10, 11-50, 51-200, 201-500, 501-1000, 1000+)
- phone: Company phone number
- address: Company address or location
- description: A brief 1-2 sentence description of what the company does

Only return the JSON object, no other text.`;
      
      const userContent = `Extract company information from this website content:\n\nURL: ${url}\nTitle: ${metadata.title || 'Unknown'}\nDescription: ${metadata.description || 'None'}\n\nContent:\n${pageContent.substring(0, 8000)}`;

      aiResponse = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${geminiKey}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          contents: [
            {
              role: 'user',
              parts: [{ text: `${systemContent}\n\n${userContent}` }]
            }
          ],
          generationConfig: {
            temperature: 0.1,
            maxOutputTokens: 2048,
          }
        }),
      });
    } else {
      // Use OpenAI API
      const model = 'gpt-4o-mini';
      aiResponse = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${openaiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model,
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
        response_format: { type: 'json_object' }
        }),
      });
    }

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

    // Parse response based on provider
    let enrichment: EnrichmentResult = {};
    
    if (useGemini) {
      // Gemini response format
      const aiContent = aiData.candidates?.[0]?.content?.parts?.[0]?.text || '';
      try {
        enrichment = JSON.parse(aiContent);
      } catch (e) {
        console.error('Failed to parse Gemini response:', e);
      }
    } else {
      // OpenAI response format with JSON mode
      const aiContent = aiData.choices?.[0]?.message?.content || '';
      try {
        enrichment = JSON.parse(aiContent);
      } catch (e) {
        console.error('Failed to parse OpenAI response:', e);
      }
    }

    // Add website URL
    enrichment.website = url;

    console.log('Enrichment result:', JSON.stringify(enrichment));

    // Update company record with enrichment data if we have a companyId
    if (targetCompanyId) {
      const { error: updateError } = await supabase
        .from('companies')
        .update({
          industry: enrichment.industry || null,
          size: enrichment.size || null,
          website: enrichment.website || null,
          phone: enrichment.phone || null,
          address: enrichment.address || null,
          notes: enrichment.description || null,
          enriched_at: new Date().toISOString(),
        })
        .eq('id', targetCompanyId);

      if (updateError) {
        console.error('Failed to update company with enrichment:', updateError);
      } else {
        console.log(`Company ${targetCompanyId} enriched successfully`);
      }
    }

    return new Response(
      JSON.stringify({ success: true, data: enrichment, companyId: targetCompanyId }),
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
