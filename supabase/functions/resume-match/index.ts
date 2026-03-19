import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface MatchRequest {
  job_description: string;
  max_results?: number;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { job_description, max_results = 3 }: MatchRequest = await req.json();

    if (!job_description || job_description.length < 10) {
      return new Response(
        JSON.stringify({ success: false, error: 'Job description is required (min 10 chars)' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, serviceKey);

    // 1. Fetch all active consultant profiles
    const { data: profiles, error: profileError } = await supabase
      .from('consultant_profiles')
      .select('*')
      .eq('is_active', true);

    if (profileError) throw new Error(`Failed to fetch profiles: ${profileError.message}`);
    if (!profiles?.length) {
      return new Response(
        JSON.stringify({ success: true, matches: [], message: 'No consultant profiles available' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 2. Resolve AI config from site settings (same pattern as generate-text)
    const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY');
    const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY');

    const { data: systemAiRow } = await supabase
      .from('site_settings')
      .select('value')
      .eq('key', 'system_ai')
      .maybeSingle();

    const systemAi = systemAiRow?.value as any || {};
    const configuredProvider = systemAi.provider;

    let useGemini = false;
    if (configuredProvider === 'gemini' && GEMINI_API_KEY) {
      useGemini = true;
    } else if (configuredProvider === 'openai' && OPENAI_API_KEY) {
      useGemini = false;
    } else {
      useGemini = !OPENAI_API_KEY && !!GEMINI_API_KEY;
    }

    const openaiModel = systemAi.openaiModel || 'gpt-4.1-mini';
    const geminiModel = systemAi.geminiModel || 'gemini-2.0-flash-exp';

    if (!OPENAI_API_KEY && !GEMINI_API_KEY) {
      // No AI available — use keyword fallback
      return new Response(
        JSON.stringify(keywordMatch(profiles, job_description, max_results)),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 3. Build profile summaries for AI matching
    const profileSummaries = profiles.map(p => ({
      id: p.id,
      name: p.name,
      title: p.title || '',
      skills: (p.skills || []).join(', '),
      experience_years: p.experience_years || 0,
      certifications: (p.certifications || []).join(', '),
      languages: (p.languages || []).join(', '),
      summary: p.summary || p.bio || '',
      experience: JSON.stringify(p.experience_json || []),
      education: JSON.stringify(p.education || []),
    }));

    const systemPrompt = `You are an expert recruitment consultant. Analyze a job description against consultant profiles and produce a ranked match result.

For each matching consultant, provide:
1. A match score (0-100)
2. A reasoning explaining why they match
3. A tailored summary highlighting relevant experience
4. A professional cover letter (2-3 paragraphs) explaining why this consultant is the best fit
5. List of matching skills and missing skills

Return ONLY valid JSON using this exact structure:
{
  "matches": [
    {
      "consultant_id": "uuid",
      "score": 85,
      "reasoning": "...",
      "tailored_summary": "...",
      "cover_letter": "...",
      "matching_skills": ["skill1", "skill2"],
      "missing_skills": ["skill3"]
    }
  ]
}

Rank by score descending. Return at most ${max_results} matches. Only include consultants scoring 30+.`;

    const userPrompt = `## Job Description
${job_description}

## Available Consultants
${profileSummaries.map((p, i) => `### Consultant ${i + 1} (ID: ${p.id})
- Name: ${p.name}
- Title: ${p.title}
- Skills: ${p.skills}
- Experience: ${p.experience_years} years
- Certifications: ${p.certifications}
- Languages: ${p.languages}
- Summary: ${p.summary}
- Work History: ${p.experience}
- Education: ${p.education}`).join('\n\n')}`;

    // 4. Call AI
    let aiResponse: Response;

    if (useGemini) {
      aiResponse = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${geminiModel}:generateContent?key=${GEMINI_API_KEY}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ role: 'user', parts: [{ text: `${systemPrompt}\n\n${userPrompt}` }] }],
            generationConfig: { temperature: 0.3, maxOutputTokens: 4096 },
          }),
        }
      );
    } else {
      aiResponse = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${OPENAI_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: openaiModel,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt },
          ],
          temperature: 0.3,
        }),
      });
    }

    if (!aiResponse.ok) {
      const errText = await aiResponse.text();
      console.error('AI error:', aiResponse.status, errText);
      return new Response(
        JSON.stringify(keywordMatch(profiles, job_description, max_results)),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const aiData = await aiResponse.json();
    let content: string;

    if (useGemini) {
      content = aiData.candidates?.[0]?.content?.parts?.[0]?.text || '';
    } else {
      content = aiData.choices?.[0]?.message?.content || '';
    }

    // Parse JSON from response (handle markdown code blocks)
    let parsed: any;
    try {
      const jsonStr = content.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      parsed = JSON.parse(jsonStr);
    } catch {
      console.error('Failed to parse AI response:', content);
      return new Response(
        JSON.stringify(keywordMatch(profiles, job_description, max_results)),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Enrich with profile names
    const matches = (parsed.matches || []).map((m: any) => {
      const profile = profiles.find(p => p.id === m.consultant_id);
      return {
        ...m,
        name: profile?.name || 'Unknown',
        title: profile?.title || '',
        avatar_url: profile?.avatar_url || null,
      };
    });

    return new Response(
      JSON.stringify({ success: true, matches }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (err) {
    console.error('resume-match error:', err);
    return new Response(
      JSON.stringify({ success: false, error: (err as Error).message || 'Internal error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

// Keyword-based fallback matching — searches title, summary, bio and skills
function keywordMatch(profiles: any[], jobDescription: string, maxResults: number) {
  const jobWords = new Set(
    jobDescription.toLowerCase().split(/[\s,;.!?]+/).filter(w => w.length >= 2)
  );

  const scored = profiles.map(p => {
    const skills = (p.skills || []) as string[];
    const titleWords = (p.title || '').toLowerCase().split(/\s+/);
    const summaryWords = (p.summary || p.bio || '').toLowerCase().split(/\s+/);

    const allProfileWords = new Set([
      ...skills.map(s => s.toLowerCase()),
      ...titleWords,
      ...summaryWords,
    ]);

    const matchingSkills = skills.filter(s =>
      s.toLowerCase().split(/\s+/).some(w => jobWords.has(w)) ||
      jobWords.has(s.toLowerCase())
    );

    // Count how many job words appear in any profile field
    const wordHits = [...jobWords].filter(w => allProfileWords.has(w) ||
      [...allProfileWords].some(pw => pw.includes(w) || w.includes(pw))
    ).length;

    const score = Math.min(100, Math.round((wordHits / Math.max(jobWords.size, 1)) * 100));

    return {
      consultant_id: p.id,
      name: p.name,
      title: p.title || '',
      score,
      reasoning: `Matched ${wordHits} keyword${wordHits !== 1 ? 's' : ''} from the job description`,
      tailored_summary: p.summary || p.bio || '',
      cover_letter: '',
      matching_skills: matchingSkills,
      missing_skills: skills.filter(s => !matchingSkills.includes(s)),
    };
  }).filter(m => m.score > 0).sort((a, b) => b.score - a.score).slice(0, maxResults);

  return { success: true, matches: scored };
}
