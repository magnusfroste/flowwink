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

    // 2. Build profile summaries for AI matching
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

    // 3. Call AI for matching + scoring + cover letter
    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) {
      // Fallback: keyword-based matching without AI
      return new Response(
        JSON.stringify(keywordMatch(profiles, job_description, max_results)),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

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

    const aiResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        temperature: 0.3,
      }),
    });

    if (!aiResponse.ok) {
      const errText = await aiResponse.text();
      console.error('AI gateway error:', aiResponse.status, errText);

      if (aiResponse.status === 429) {
        return new Response(
          JSON.stringify({ success: false, error: 'Rate limit exceeded. Please try again shortly.' }),
          { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      if (aiResponse.status === 402) {
        return new Response(
          JSON.stringify({ success: false, error: 'AI credits exhausted.' }),
          { status: 402, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Fallback to keyword matching
      return new Response(
        JSON.stringify(keywordMatch(profiles, job_description, max_results)),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const aiData = await aiResponse.json();
    const content = aiData.choices?.[0]?.message?.content || '';

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
      JSON.stringify({ success: false, error: err.message || 'Internal error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

// Keyword-based fallback matching
function keywordMatch(profiles: any[], jobDescription: string, maxResults: number) {
  const jobWords = new Set(
    jobDescription.toLowerCase().split(/[\s,;.!?]+/).filter(w => w.length > 3)
  );

  const scored = profiles.map(p => {
    const skills = (p.skills || []) as string[];
    const matching = skills.filter(s => 
      s.toLowerCase().split(/\s+/).some(w => jobWords.has(w))
    );
    const score = Math.min(100, Math.round((matching.length / Math.max(skills.length, 1)) * 100));
    return {
      consultant_id: p.id,
      name: p.name,
      title: p.title || '',
      score,
      reasoning: `Matched ${matching.length} of ${skills.length} skills based on keywords`,
      tailored_summary: p.summary || p.bio || '',
      cover_letter: '',
      matching_skills: matching,
      missing_skills: skills.filter(s => !matching.includes(s)),
    };
  }).filter(m => m.score > 0).sort((a, b) => b.score - a.score).slice(0, maxResults);

  return { success: true, matches: scored };
}
