// qualify_lead — internal skill handler.
//
// Deterministic Scoring (No AI). Calculates lead score from activities using a
// point-based system. AI reasoning (summary, status suggestion) is FlowPilot's
// job. OpenClaw alignment: this is a "hand" (data operation), not a "brain".
//
// Moved from the standalone `qualify-lead` edge function (edge-surface
// refactor B1a, wave 1). Response objects unchanged; the signal-dispatcher
// emission keeps its HTTP hop (signal-dispatcher is kernel).

import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';

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

export interface HandlerCtx {
  supabaseUrl: string;
  serviceKey: string;
  callerUserId?: string | null;
}

export async function executeQualifyLead(
  supabase: SupabaseClient,
  args: Record<string, unknown>,
  ctx: HandlerCtx,
): Promise<Record<string, unknown>> {
  try {
    // Accept both camelCase (leadId) and snake_case (lead_id) — external MCP agents
    // naturally send snake_case, and dropping it silently looked like "Lead ID is required".
    const body = args as Record<string, any>;
    const leadId = body.leadId ?? body.lead_id;

    if (!leadId) {
      // Sweep mode: no id → qualify every pending lead. This is what the
      // scheduled automation calls. Qualification used to be fired from the
      // browser after form submit — which never worked for the people forms
      // exist for: qualify_lead is an internal skill, and a visitor holds the
      // anon key. Server-side sweep is the honest home for it.
      const { data: pending } = await supabase
        .from('leads')
        .select('id, email')
        .is('ai_qualified_at', null)
        .eq('status', 'lead')
        .order('created_at', { ascending: true })
        .limit(10);
      if (!pending || pending.length === 0) {
        // work_done: the work-done contract (_shared/activity/work-done.ts).
        // A scheduled sweep that found nothing says so in a number, so the
        // dispatcher can drop the journal row without anyone parsing this
        // sentence. swept stays for humans; work_done is what machines read.
        return { swept: 0, work_done: 0, message: 'No unqualified leads.' };
      }
      const results: Array<Record<string, unknown>> = [];
      for (const row of pending) {
        const one = await executeQualifyLead(supabase, { leadId: row.id }, ctx);
        results.push({ lead_id: row.id, email: row.email, ...one });
      }
      return { swept: results.length, work_done: results.length, results };
    }

    // Fetch lead
    const { data: lead, error: leadError } = await supabase
      .from('leads')
      .select('*')
      .eq('id', leadId)
      .single();

    if (leadError || !lead) {
      return { error: 'Lead not found' };
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
    const recentCount = activityList.filter((a: any) => new Date(a.created_at).getTime() > recencyCutoff).length;
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
      return { error: 'Failed to update lead' };
    }

    // Emit score signal for automations
    try {
      await fetch(`${ctx.supabaseUrl}/functions/v1/signal-dispatcher`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${ctx.serviceKey}` },
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

    return {
      success: true,
      work_done: 1,
      lead_id: leadId,
      score: totalScore,
      engagement_level: engagementLevel,
      activity_count: activityCount,
      recent_activity_count: recentCount,
      status: lead.status,
    };
  } catch (error) {
    console.error('Qualify lead error:', error);
    return { error: error instanceof Error ? error.message : 'Unknown error' };
  }
}
