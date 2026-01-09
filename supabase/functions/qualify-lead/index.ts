import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface LeadActivity {
  type: string;
  metadata: Record<string, unknown>;
  points: number;
  created_at: string;
}

interface Lead {
  id: string;
  email: string;
  name: string | null;
  company: string | null;
  status: string;
  score: number;
  source: string;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { leadId } = await req.json();
    
    if (!leadId) {
      return new Response(
        JSON.stringify({ error: 'Lead ID is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const openaiKey = Deno.env.get('OPENAI_API_KEY');
    const geminiKey = Deno.env.get('GEMINI_API_KEY');
    const useGemini = !openaiKey && geminiKey;

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Fetch lead with activities
    const { data: lead, error: leadError } = await supabase
      .from('leads')
      .select('*')
      .eq('id', leadId)
      .single();

    if (leadError || !lead) {
      console.error('Lead not found:', leadError);
      return new Response(
        JSON.stringify({ error: 'Lead not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { data: activities, error: activitiesError } = await supabase
      .from('lead_activities')
      .select('*')
      .eq('lead_id', leadId)
      .order('created_at', { ascending: false })
      .limit(50);

    if (activitiesError) {
      console.error('Failed to fetch activities:', activitiesError);
    }

    // Calculate score from activities
    const activityList = (activities || []) as LeadActivity[];
    const totalScore = activityList.reduce((sum, a) => sum + (a.points || 0), 0);

    // Prepare activity summary for AI
    const activitySummary = activityList.map(a => ({
      type: a.type,
      date: a.created_at,
      details: a.metadata
    }));

    // Use AI to qualify lead
    let aiSummary = '';
    let suggestedStatus = lead.status;
    let needsReview = false;
    let confidence = 0;

    if (openaiKey || geminiKey) {
      try {
        const prompt = `Du är en säljassistent som analyserar leads. Analysera denna lead och ge en kort sammanfattning samt rekommendation.

Lead-information:
- Email: ${lead.email}
- Namn: ${lead.name || 'Okänt'}
- Företag: ${lead.company || 'Okänt'}
- Källa: ${lead.source}
- Nuvarande status: ${lead.status}
- Total poäng: ${totalScore}

Aktiviteter (senaste ${activityList.length} st):
${JSON.stringify(activitySummary, null, 2)}

Poängsystem referens:
- form_submit: 10p
- email_open: 3p
- link_click: 5p
- page_visit: 2p

Svara ENDAST med JSON i detta format:
{
  "summary": "En mening som sammanfattar lead:en och dess engagemang",
  "status": "lead" | "opportunity" | "customer",
  "confidence": 0-100,
  "reasoning": "Kort förklaring av varför"
}`;

        let response: Response;

        if (useGemini) {
          // Use Google Gemini API
          const model = 'gemini-2.0-flash-exp';
          response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${geminiKey}`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              contents: [
                {
                  role: 'user',
                  parts: [{ text: prompt }]
                }
              ],
              generationConfig: {
                temperature: 0.3,
                maxOutputTokens: 1024,
              }
            }),
          });
        } else {
          // Use OpenAI API
          const model = 'gpt-4o-mini';
          response = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${openaiKey}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              model,
              messages: [
                { role: 'user', content: prompt }
              ],
              response_format: { type: 'json_object' }
            }),
          });
        }

        if (response.ok) {
          const data = await response.json();
          
          // Parse response based on provider
          let content = '';
          if (useGemini) {
            content = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
          } else {
            content = data.choices?.[0]?.message?.content || '';
          }
          
          // Parse JSON from response
          const jsonMatch = content.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            try {
              const parsed = JSON.parse(jsonMatch[0]);
              aiSummary = parsed.summary || '';
              confidence = parsed.confidence || 0;
              
              // Only auto-update status if confidence is high
              if (confidence >= 75 && parsed.status !== lead.status) {
                suggestedStatus = parsed.status;
              } else if (confidence < 50) {
                needsReview = true;
              }
            } catch (parseError) {
              console.error('Failed to parse AI response:', parseError);
              aiSummary = content;
            }
          } else {
            aiSummary = content;
          }
        } else {
          console.error('AI API error:', response.status, await response.text());
        }
      } catch (aiError) {
        console.error('AI qualification error:', aiError);
      }
    }

    // Update lead with AI results
    const updates: Record<string, unknown> = {
      score: totalScore,
      ai_summary: aiSummary || null,
      ai_qualified_at: new Date().toISOString(),
      needs_review: needsReview,
    };

    // Only update status if AI is confident
    if (suggestedStatus !== lead.status && confidence >= 75) {
      updates.status = suggestedStatus;
      
      // Log status change as activity
      await supabase.from('lead_activities').insert({
        lead_id: leadId,
        type: 'status_change',
        metadata: {
          from: lead.status,
          to: suggestedStatus,
          automated: true,
          confidence,
        },
        points: 0,
      });
    }

    const { error: updateError } = await supabase
      .from('leads')
      .update(updates)
      .eq('id', leadId);

    if (updateError) {
      console.error('Failed to update lead:', updateError);
      return new Response(
        JSON.stringify({ error: 'Failed to update lead' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Lead ${leadId} qualified: score=${totalScore}, status=${suggestedStatus}, needs_review=${needsReview}`);

    return new Response(
      JSON.stringify({
        success: true,
        lead_id: leadId,
        score: totalScore,
        status: suggestedStatus,
        ai_summary: aiSummary,
        needs_review: needsReview,
        confidence,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Qualify lead error:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
