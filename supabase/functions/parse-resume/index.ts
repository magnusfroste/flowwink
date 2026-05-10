import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getServiceClient } from '../_shared/supabase-clients.ts';
import { resolveAiConfig, isAnthropicProvider } from "../_shared/ai-config.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { resume_text } = await req.json();

    if (!resume_text || resume_text.length < 20) {
      return new Response(
        JSON.stringify({ success: false, error: 'Resume text is required (min 20 chars)' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabase = getServiceClient();

    let ai;
    try {
      ai = await resolveAiConfig(supabase, 'fast');
    } catch (err: any) {
      return new Response(
        JSON.stringify({ success: false, error: err.message || 'AI service not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const systemPrompt = `You are an expert resume parser. Extract structured profile data from the resume text provided.

Return ONLY valid JSON with this exact structure (use null for fields you cannot determine):
{
  "name": "Full Name",
  "title": "Job Title / Professional Title",
  "email": "email@example.com",
  "phone": "+46...",
  "skills": ["Skill1", "Skill2", "Skill3"],
  "experience_years": 5,
  "summary": "A 2-3 sentence professional summary based on the resume",
  "bio": "A longer paragraph about the person's background",
  "languages": ["English", "Swedish"],
  "certifications": ["AWS Certified", "PMP"],
  "linkedin_url": "https://linkedin.com/in/...",
  "portfolio_url": "https://...",
  "experience_json": [
    {
      "company": "Company Name",
      "role": "Job Title",
      "period": "2020-2023",
      "description": "Brief description of role"
    }
  ],
  "education": [
    {
      "institution": "University Name",
      "degree": "BSc Computer Science",
      "year": "2018"
    }
  ]
}

Rules:
- Extract ALL skills mentioned (technologies, tools, methodologies, soft skills)
- Calculate experience_years from the earliest work experience to now
- Write the summary yourself based on the resume content - do NOT copy verbatim
- If a field is not found in the resume, use null (for strings) or empty array (for arrays)
- For experience_json, include the most recent 5-10 positions
- Return ONLY the JSON, no markdown or explanation`;

    const userMessage = `${systemPrompt}\n\n## Resume Text\n${resume_text.slice(0, 30000)}`;

    let rawText = '';

    if (isAnthropicProvider(ai.apiUrl)) {
      const response = await fetch(ai.apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': ai.apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: ai.model,
          max_tokens: 4096,
          temperature: 0.2,
          messages: [{ role: 'user', content: userMessage }],
        }),
      });
      if (!response.ok) {
        console.error('parse-resume Anthropic error:', await response.text());
        return new Response(JSON.stringify({ success: false, error: 'AI parsing failed' }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
      const result = await response.json();
      rawText = result.content?.[0]?.text || '';
    } else {
      // OpenAI-compatible (OpenAI, Gemini OpenAI-compat, Local LLM)
      const response = await fetch(ai.apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${ai.apiKey}`,
        },
        body: JSON.stringify({
          model: ai.model,
          messages: [{ role: 'user', content: userMessage }],
          temperature: 0.2,
          max_tokens: 4096,
          response_format: { type: 'json_object' },
        }),
      });
      if (!response.ok) {
        console.error('parse-resume AI error:', await response.text());
        return new Response(JSON.stringify({ success: false, error: 'AI parsing failed' }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
      const result = await response.json();
      rawText = result.choices?.[0]?.message?.content || '';
    }

    if (!rawText) {
      return new Response(
        JSON.stringify({ success: false, error: 'No response from AI' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const cleaned = rawText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    const parsed = JSON.parse(cleaned);

    return new Response(
      JSON.stringify({ success: true, profile: parsed, provider_used: ai.provider }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('parse-resume error:', error);
    return new Response(
      JSON.stringify({ success: false, error: (error as Error).message || 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
