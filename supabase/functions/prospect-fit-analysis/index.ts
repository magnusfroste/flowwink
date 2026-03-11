import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.87.1";
import { loadSalesContext } from "../_shared/sales-context.ts";

/**
 * Prospect Fit Analysis — Orchestrator
 * 
 * Uses contact-finder (modular skill) instead of inline Hunter.io.
 * Chains: load context → load company → contact-finder → AI analysis → persist
 */

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface FitAnalysisInput {
  company_id?: string;
  company_name?: string;
  decision_maker_first_name?: string;
  decision_maker_last_name?: string;
  user_id?: string;
}

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
    console.warn(`[prospect-fit] Skill ${functionName} returned ${res.status}`);
    return { success: false };
  }
  return await res.json();
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const input = await req.json() as FitAnalysisInput;
    if (!input.company_id && !input.company_name) {
      return new Response(JSON.stringify({ error: 'company_id or company_name is required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const openaiKey = Deno.env.get('OPENAI_API_KEY');
    const geminiKey = Deno.env.get('GEMINI_API_KEY');

    if (!openaiKey && !geminiKey) {
      return new Response(JSON.stringify({ error: 'No AI provider configured.' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Load rich sales context
    const salesContext = await loadSalesContext({
      userId: input.user_id,
      includePages: true,
      maxPageTokens: 6000,
    });
    console.log('[prospect-fit] Sales context loaded:', salesContext.formatted.length, 'chars');

    // Load prospect company
    let prospectCompany: any = null;
    let companyId = input.company_id;

    if (companyId) {
      const { data } = await supabase.from('companies').select('*').eq('id', companyId).single();
      prospectCompany = data;
    } else if (input.company_name) {
      const { data } = await supabase.from('companies').select('*')
        .ilike('name', `%${input.company_name}%`).limit(1).maybeSingle();
      prospectCompany = data;
      companyId = data?.id;
    }

    if (!prospectCompany) {
      return new Response(JSON.stringify({ error: 'Company not found. Run prospect-research first.' }), {
        status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Load previous research
    let researchData: any = {};
    if (companyId) {
      const { data: memory } = await supabase.from('agent_memory').select('value')
        .eq('key', `prospect_research_${companyId}`).maybeSingle();
      researchData = memory?.value || {};
    }

    // Load existing leads
    const { data: leads } = await supabase.from('leads')
      .select('id, name, email, phone, ai_summary, score')
      .eq('company_id', companyId).limit(20);

    // --- Contact Finder: decision-maker email ---
    let decisionMakerEmail: any = null;
    const domain = prospectCompany.domain;

    if (domain && input.decision_maker_first_name && input.decision_maker_last_name) {
      console.log('[prospect-fit] → contact-finder (email_finder)');
      const contactResult = await callSkill('contact-finder', {
        action: 'email_finder',
        domain,
        first_name: input.decision_maker_first_name,
        last_name: input.decision_maker_last_name,
      });
      decisionMakerEmail = contactResult.contact || null;
    }

    // --- AI Fit Analysis ---
    const useGemini = !openaiKey && !!geminiKey;

    const systemPrompt = `You are a B2B sales strategist. Given your client's full business context and a prospect's research data, perform these tasks:

1. Evaluate the fit between client and prospect (score 0-100)
2. Map the prospect's potential problems to the client's services
3. Draft a personalized, professional introduction letter
4. Generate an email subject line

Your client's business context:
${salesContext.formatted || '(No company profile configured yet)'}

Return a JSON object:
{
  "fit_score": 0-100,
  "fit_advice": "string explaining why this score",
  "problem_mapping": [
    { "prospect_problem": "string", "our_solution": "string" }
  ],
  "introduction_letter": "string (professional, warm, personalized)",
  "email_subject": "string"
}

Only return the JSON object, no other text.`;

    const userPrompt = `Prospect Company: ${prospectCompany.name}
Industry: ${prospectCompany.industry || 'Unknown'}
Size: ${prospectCompany.size || 'Unknown'}
Website: ${prospectCompany.website || 'Unknown'}
Notes: ${prospectCompany.notes || 'None'}

Previous Research:
${JSON.stringify(researchData.qualifying_questions || [], null, 2)}

Known Contacts:
${JSON.stringify((leads || []).map(l => ({ name: l.name, role: l.ai_summary })), null, 2)}

${decisionMakerEmail ? `Decision Maker Found: ${decisionMakerEmail.first_name} ${decisionMakerEmail.last_name} (${decisionMakerEmail.email}) - ${decisionMakerEmail.position || 'Unknown role'}` : ''}`;

    let aiResult: any = {};

    if (useGemini) {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ role: 'user', parts: [{ text: `${systemPrompt}\n\n${userPrompt}` }] }],
            generationConfig: { temperature: 0.4, maxOutputTokens: 4096 },
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

    console.log('[prospect-fit] AI analysis complete, fit_score:', aiResult.fit_score);

    // Update lead scores
    const fitScore = aiResult.fit_score || 0;
    if (leads && leads.length > 0) {
      for (const lead of leads) {
        await supabase.from('leads').update({
          score: fitScore,
          ai_summary: lead.ai_summary
            ? `${lead.ai_summary} | Fit: ${fitScore}/100`
            : `Fit: ${fitScore}/100`,
        }).eq('id', lead.id);
      }
    }

    // Save to agent_memory
    if (companyId && aiResult.introduction_letter) {
      const primaryLead = leads?.[0];
      const memoryKey = primaryLead
        ? `intro_letter_${primaryLead.id}`
        : `intro_letter_company_${companyId}`;

      await supabase.from('agent_memory').upsert({
        key: memoryKey,
        value: {
          company_id: companyId,
          company_name: prospectCompany.name,
          fit_score: fitScore,
          email_subject: aiResult.email_subject,
          introduction_letter: aiResult.introduction_letter,
          problem_mapping: aiResult.problem_mapping,
          decision_maker: decisionMakerEmail,
          generated_at: new Date().toISOString(),
        },
        category: 'context',
        created_by: 'flowpilot',
      }, { onConflict: 'key' });
    }

    return new Response(JSON.stringify({
      success: true,
      fit_score: fitScore,
      fit_advice: aiResult.fit_advice || '',
      problem_mapping: aiResult.problem_mapping || [],
      introduction_letter: aiResult.introduction_letter || '',
      email_subject: aiResult.email_subject || '',
      decision_maker: decisionMakerEmail,
      leads_updated: leads?.length || 0,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('[prospect-fit] Error:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
