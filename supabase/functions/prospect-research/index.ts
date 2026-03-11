import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.87.1";
import { loadSalesContext } from "../_shared/sales-context.ts";

/**
 * Prospect Research — Orchestrator
 * 
 * Chains modular skills: web-search → web-scrape → contact-finder → AI analysis
 * Each integration is a separate edge function that FlowPilot can also call directly.
 */

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface ProspectResearchInput {
  company_name: string;
  company_url?: string;
}

// Internal call to another edge function
async function callSkill(functionName: string, body: Record<string, unknown>): Promise<any> {
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

  const res = await fetch(`${supabaseUrl}/functions/v1/${functionName}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${serviceKey}`,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    console.warn(`[prospect-research] Skill ${functionName} returned ${res.status}`);
    return { success: false, error: `${functionName} failed: ${res.status}` };
  }

  return await res.json();
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { company_name, company_url } = await req.json() as ProspectResearchInput;
    if (!company_name) {
      return new Response(JSON.stringify({ error: 'company_name is required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const openaiKey = Deno.env.get('OPENAI_API_KEY');
    const geminiKey = Deno.env.get('GEMINI_API_KEY');

    if (!openaiKey && !geminiKey) {
      return new Response(JSON.stringify({ error: 'No AI provider configured. Add OPENAI_API_KEY or GEMINI_API_KEY.' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Load rich sales context
    const salesContext = await loadSalesContext({ includePages: true, maxPageTokens: 4000 });
    console.log('[prospect-research] Sales context loaded:', salesContext.formatted.length, 'chars');

    // --- Step 1: Web Search ---
    console.log('[prospect-research] → web-search');
    const searchResult = await callSkill('web-search', { query: company_name, limit: 5 });
    const searchResults = searchResult.results || [];

    const searchContext = searchResults.map((r: any) =>
      `## ${r.title}\n${r.description || ''}\nURL: ${r.url}`
    ).join('\n\n');

    // --- Step 2: Resolve URL + Web Scrape ---
    let resolvedUrl = company_url;
    if (!resolvedUrl && searchResults.length > 0) {
      resolvedUrl = searchResults[0]?.url;
    }

    let scrapedContent = '';
    if (resolvedUrl) {
      console.log('[prospect-research] → web-scrape:', resolvedUrl);
      const scrapeResult = await callSkill('web-scrape', { url: resolvedUrl, max_length: 10000 });
      scrapedContent = scrapeResult.content || '';
    }

    // --- Step 3: Contact Finder ---
    let prospectDomain = '';
    if (resolvedUrl) {
      try {
        prospectDomain = new URL(resolvedUrl).hostname.replace('www.', '');
      } catch { /* skip */ }
    }

    let hunterContacts: any[] = [];
    if (prospectDomain) {
      console.log('[prospect-research] → contact-finder:', prospectDomain);
      const contactResult = await callSkill('contact-finder', { domain: prospectDomain, limit: 10 });
      hunterContacts = contactResult.contacts || [];
    }

    // --- Step 4: AI Analysis ---
    const useGemini = !openaiKey && !!geminiKey;

    const systemPrompt = `You are a B2B sales research analyst. Given information about a prospect company and your client's full business context, perform two tasks:

1. Generate 5 qualifying questions that evaluate whether this prospect is a good fit for your client's services
2. Answer each question using the research data provided

Your client's business context:
${salesContext.formatted || '(No company profile configured yet)'}

Return a JSON object with:
{
  "company_summary": {
    "name": "string",
    "industry": "string",
    "size_estimate": "string",
    "main_offerings": ["string"],
    "potential_pain_points": ["string"]
  },
  "qualifying_questions": [
    { "question": "string", "answer": "string", "relevance_score": 1-10 }
  ]
}

Only return the JSON object, no other text.`;

    const userPrompt = `Research data for: ${company_name}
${resolvedUrl ? `Website: ${resolvedUrl}` : ''}

--- Scraped Website Content ---
${scrapedContent || '(No website content available)'}

--- Search Results ---
${searchContext || '(No search results)'}

--- Contacts Found ---
${hunterContacts.length > 0 ? JSON.stringify(hunterContacts.slice(0, 5), null, 2) : '(No contacts found)'}`;

    let aiResult: any = {};

    if (useGemini) {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ role: 'user', parts: [{ text: `${systemPrompt}\n\n${userPrompt}` }] }],
            generationConfig: { temperature: 0.3, maxOutputTokens: 4096 },
          }),
        }
      );
      if (!res.ok) throw new Error(`Gemini API error: ${res.status}`);
      const data = await res.json();
      const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (jsonMatch) aiResult = JSON.parse(jsonMatch[0]);
    } else {
      const res = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${openaiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'gpt-4o-mini',
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt },
          ],
          response_format: { type: 'json_object' },
        }),
      });
      if (!res.ok) throw new Error(`OpenAI API error: ${res.status}`);
      const data = await res.json();
      aiResult = JSON.parse(data.choices?.[0]?.message?.content || '{}');
    }

    console.log('[prospect-research] AI analysis complete');

    // --- Step 5: Insert or find company ---
    const summary = aiResult.company_summary || {};

    let companyRecord: any = null;
    if (prospectDomain) {
      const { data: existing } = await supabase
        .from('companies').select('id, name, domain')
        .eq('domain', prospectDomain).maybeSingle();

      if (existing) {
        await supabase.from('companies').update({
          industry: summary.industry || null,
          size: summary.size_estimate || null,
          website: resolvedUrl || null,
          notes: summary.potential_pain_points?.join('; ') || null,
          enriched_at: new Date().toISOString(),
        }).eq('id', existing.id);
        companyRecord = existing;
      }
    }

    if (!companyRecord) {
      const { data: inserted } = await supabase
        .from('companies').insert({
          name: company_name,
          domain: prospectDomain || null,
          website: resolvedUrl || null,
          industry: summary.industry || null,
          size: summary.size_estimate || null,
          notes: summary.potential_pain_points?.join('; ') || null,
          enriched_at: new Date().toISOString(),
        }).select('id, name, domain').single();
      companyRecord = inserted;
    }

    const companyId = companyRecord?.id;

    // --- Step 6: Create leads from contacts ---
    const createdLeads: any[] = [];
    if (companyId && hunterContacts.length > 0) {
      for (const contact of hunterContacts.slice(0, 10)) {
        const leadName = [contact.first_name, contact.last_name].filter(Boolean).join(' ') || null;

        const { data: existing } = await supabase
          .from('leads').select('id, email, name')
          .eq('email', contact.email).maybeSingle();

        if (existing) { createdLeads.push(existing); continue; }

        const { data: lead, error: leadError } = await supabase
          .from('leads').insert({
            email: contact.email,
            name: leadName,
            phone: contact.phone_number || null,
            source: 'prospect_research',
            company_id: companyId,
            ai_summary: contact.position ? `${contact.position}${contact.department ? ` (${contact.department})` : ''}` : null,
          }).select('id, email, name').maybeSingle();

        if (lead) createdLeads.push(lead);
        if (leadError) console.warn('[prospect-research] Lead insert error:', leadError.message);
      }
    }

    // --- Step 7: Save research to agent_memory ---
    if (companyId) {
      await supabase.from('agent_memory').upsert({
        key: `prospect_research_${companyId}`,
        value: {
          company_name,
          company_url: resolvedUrl,
          company_summary: aiResult.company_summary,
          qualifying_questions: aiResult.qualifying_questions,
          contacts_found: hunterContacts.length,
          search_provider: searchResult.provider,
          researched_at: new Date().toISOString(),
        },
        category: 'context',
        created_by: 'flowpilot',
      }, { onConflict: 'key' });
    }

    const result = {
      success: true,
      company: companyRecord || { name: company_name },
      contacts: createdLeads,
      hunter_contacts_found: hunterContacts.length,
      questions_and_answers: aiResult.qualifying_questions || [],
      company_summary: aiResult.company_summary || {},
    };

    console.log('[prospect-research] Complete:', {
      company: company_name,
      contacts: createdLeads.length,
      questions: (aiResult.qualifying_questions || []).length,
    });

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('[prospect-research] Error:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
