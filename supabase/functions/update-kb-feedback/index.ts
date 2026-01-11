import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { articleSlugs, rating } = await req.json();

    if (!articleSlugs || !Array.isArray(articleSlugs) || articleSlugs.length === 0) {
      return new Response(
        JSON.stringify({ error: 'articleSlugs is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Updating feedback for ${articleSlugs.length} articles, rating: ${rating}`);

    // Update each article's feedback count
    for (const slug of articleSlugs) {
      const column = rating === 'positive' ? 'positive_feedback_count' : 'negative_feedback_count';
      
      // Get current count
      const { data: article, error: fetchError } = await supabase
        .from('kb_articles')
        .select('id, positive_feedback_count, negative_feedback_count')
        .eq('slug', slug)
        .single();

      if (fetchError || !article) {
        console.log(`Article not found: ${slug}`);
        continue;
      }

      const currentPositive = article.positive_feedback_count || 0;
      const currentNegative = article.negative_feedback_count || 0;
      
      const newPositive = rating === 'positive' ? currentPositive + 1 : currentPositive;
      const newNegative = rating === 'negative' ? currentNegative + 1 : currentNegative;
      
      // Flag as needs improvement if negative feedback exceeds threshold
      // (more than 3 negative OR negative ratio > 30% with at least 5 total)
      const total = newPositive + newNegative;
      const needsImprovement = newNegative >= 3 || 
        (total >= 5 && (newNegative / total) > 0.3);

      const { error: updateError } = await supabase
        .from('kb_articles')
        .update({
          positive_feedback_count: newPositive,
          negative_feedback_count: newNegative,
          needs_improvement: needsImprovement,
        })
        .eq('id', article.id);

      if (updateError) {
        console.error(`Failed to update article ${slug}:`, updateError);
      } else {
        console.log(`Updated ${slug}: +${newPositive}/-${newNegative}, needs_improvement: ${needsImprovement}`);
      }
    }

    return new Response(
      JSON.stringify({ success: true }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('Error in update-kb-feedback:', errorMessage);
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
