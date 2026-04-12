import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

/**
 * Resume Match — Keyword-Based Matching (No AI)
 * 
 * Matches consultants to a job description using skill overlap scoring.
 * AI-powered reasoning is now FlowPilot's job via the match_consultant skill.
 * 
 * OpenClaw alignment: "hand" (data query + deterministic scoring).
 */

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { job_description, max_results = 5 } = await req.json();

    if (!job_description || job_description.length < 10) {
      return new Response(
        JSON.stringify({ success: false, error: 'Job description is required (min 10 chars)' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    // Fetch active consultants
    const { data: consultants, error } = await supabase
      .from('consultant_profiles')
      .select('id, name, title, skills, experience_years, summary, languages, certifications, availability')
      .eq('is_active', true);

    if (error) throw error;
    if (!consultants?.length) {
      return new Response(
        JSON.stringify({ success: true, matches: [], message: 'No active consultants found' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Tokenize job description
    const jobTokens = tokenize(job_description);

    // Score each consultant by skill overlap
    const scored = consultants.map(c => {
      const skillTokens = (c.skills || []).flatMap((s: string) => tokenize(s));
      const titleTokens = tokenize(c.title || '');
      const summaryTokens = tokenize(c.summary || '');
      const allTokens = new Set([...skillTokens, ...titleTokens, ...summaryTokens]);

      let overlap = 0;
      for (const token of jobTokens) {
        if (allTokens.has(token)) overlap++;
      }

      const score = jobTokens.length > 0 ? Math.round((overlap / jobTokens.length) * 100) : 0;

      return {
        id: c.id,
        name: c.name,
        title: c.title,
        skills: c.skills,
        experience_years: c.experience_years,
        availability: c.availability,
        match_score: score,
        matched_keywords: [...new Set(jobTokens.filter(t => allTokens.has(t)))],
      };
    });

    // Sort by score, return top N
    scored.sort((a, b) => b.match_score - a.match_score);
    const matches = scored.slice(0, max_results).filter(m => m.match_score > 0);

    return new Response(
      JSON.stringify({ success: true, matches, total_consultants: consultants.length }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Resume match error:', error);
    return new Response(
      JSON.stringify({ success: false, error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

/** Tokenize text into lowercase keywords, filtering common stop words */
function tokenize(text: string): string[] {
  const stops = new Set(['and', 'or', 'the', 'a', 'an', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'is', 'are', 'was', 'be', 'we', 'you', 'our', 'their', 'that', 'this', 'from', 'by', 'as', 'it', 'will', 'can', 'has', 'have', 'not', 'but', 'all', 'been', 'more', 'than', 'other', 'into', 'its', 'also', 'very', 'just', 'about', 'over', 'such', 'only', 'some', 'any', 'each', 'which', 'do', 'does', 'did', 'may', 'would', 'could', 'should', 'shall', 'must', 'need', 'och', 'i', 'att', 'en', 'ett', 'av', 'med', 'som', 'det', 'den', 'de', 'vi', 'du', 'eller', 'vara', 'har', 'till', 'om', 'kan', 'ska']);
  return text
    .toLowerCase()
    .replace(/[^a-zåäö0-9#+.]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 1 && !stops.has(w));
}
