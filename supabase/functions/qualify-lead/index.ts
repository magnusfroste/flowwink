import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

/**
 * Qualify Lead — Deterministic Scoring (No AI)
 * 
 * Calculates lead score from activities using a point-based system.
 * AI reasoning (summary, status suggestion) is now FlowPilot's job
 * via the qualify_lead skill (db: handler).
 * 
 * OpenClaw alignment: This function is a "hand" (data operation),
 * not a "brain" (no AI calls).
 */

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

// Deterministic scoring weights
const SCORE_WEIGHTS: Record<string, number> = {
  form_submit: 10,
  email_open: 3,
  link_click: 5,
  page_visit: 2,
  booking_made: 15,
  reply_received: 12,
  meeting_scheduled: 20,
  status_change: 0,
};

// Recency bonus: activities in last 7 days get 1.5x
const RECENCY_DAYS = 7;

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
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Fetch lead
    const { data: lead, error: leadError } = await supabase
      .from('leads')
      .select('*')
      .eq('id', leadId)
      .single();

    if (leadError || !lead) {
      return new Response(
        JSON.stringify({ error: 'Lead not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Fetch activities
    const { data: activities } = await supabase
      .from('lead_activities')
      .select('*')
      .eq('lead_id', leadId)
      .order('created_at', { ascending: false })
      .limit(100);

    const activityList = activities || [];
    const now = Date.now();
    const recencyCutoff = now - RECENCY_DAYS * 86400000;

    // Calculate deterministic score
    let totalScore = 0;
    for (const a of activityList) {
      const basePoints = a.points || SCORE_WEIGHTS[a.type] || 1;
      const isRecent = new Date(a.created_at).getTime() > recencyCutoff;
      totalScore += isRecent ? Math.round(basePoints * 1.5) : basePoints;
    }

    // Determine engagement level (deterministic)
    const activityCount = activityList.length;
    const recentCount = activityList.filter(a => new Date(a.created_at).getTime() > recencyCutoff).length;
    const engagementLevel = totalScore >= 50 ? 'hot' : totalScore >= 20 ? 'warm' : 'cold';

    // Update lead score
    const { error: updateError } = await supabase
      .from('leads')
      .update({
        score: totalScore,
        ai_qualified_at: new Date().toISOString(),
      })
      .eq('id', leadId);

    if (updateError) {
      console.error('Failed to update lead:', updateError);
      return new Response(
        JSON.stringify({ error: 'Failed to update lead' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Emit score signal for automations
    try {
      await fetch(`${supabaseUrl}/functions/v1/signal-dispatcher`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${supabaseServiceKey}` },
        body: JSON.stringify({
          signal: 'lead_score_updated',
          data: {
            score: totalScore,
            previous_score: lead.score || 0,
            status: lead.status,
            email: lead.email,
            name: lead.name,
            engagement_level: engagementLevel,
            activity_count: activityCount,
            recent_activity_count: recentCount,
          },
          context: { entity_type: 'lead', entity_id: leadId },
        }),
      });
    } catch (signalErr) {
      console.error('Signal dispatch error (non-blocking):', signalErr);
    }

    console.log(`Lead ${leadId} scored: ${totalScore} (${engagementLevel})`);

    return new Response(
      JSON.stringify({
        success: true,
        lead_id: leadId,
        score: totalScore,
        engagement_level: engagementLevel,
        activity_count: activityCount,
        recent_activity_count: recentCount,
        status: lead.status,
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
