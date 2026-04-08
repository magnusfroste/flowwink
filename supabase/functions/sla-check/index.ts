import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

/**
 * SLA Check — Evaluates all enabled SLA policies against current data.
 * 
 * Called by FlowPilot via skill or by pg_cron on a schedule.
 * For each policy, checks if any entities have exceeded the threshold.
 * Creates sla_violations for any breaches found.
 */
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const url = Deno.env.get('SUPABASE_URL')!;
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabase = createClient(url, serviceKey);

  try {
    // Load enabled policies
    const { data: policies, error: polErr } = await supabase
      .from('sla_policies')
      .select('*')
      .eq('enabled', true);

    if (polErr) throw polErr;
    if (!policies?.length) {
      return new Response(JSON.stringify({ checked: 0, violations: 0, message: 'No active policies' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const now = Date.now();
    let totalChecked = 0;
    let newViolations = 0;

    for (const policy of policies) {
      const { entity_type, metric, threshold_minutes, priority } = policy;
      const thresholdMs = threshold_minutes * 60_000;
      let entities: { id: string; created_at: string; resolved_at?: string }[] = [];

      // ── Fetch open entities per type ──────────────────────────────
      if (entity_type === 'ticket') {
        let query = supabase
          .from('support_tickets')
          .select('id, created_at, resolved_at')
          .is('resolved_at', null);
        if (priority !== 'all') query = query.eq('priority', priority);
        const { data } = await query;
        entities = (data || []) as any;
      } else if (entity_type === 'order') {
        const { data } = await supabase
          .from('orders')
          .select('id, created_at')
          .in('status', ['pending', 'confirmed']);
        entities = (data || []).map((o: any) => ({ id: o.id, created_at: o.created_at }));
      } else if (entity_type === 'lead') {
        const { data } = await supabase
          .from('leads')
          .select('id, created_at')
          .eq('status', 'new');
        entities = (data || []).map((l: any) => ({ id: l.id, created_at: l.created_at }));
      } else if (entity_type === 'chat') {
        const { data } = await supabase
          .from('chat_conversations')
          .select('id, created_at')
          .eq('conversation_status', 'open');
        entities = (data || []).map((c: any) => ({ id: c.id, created_at: c.created_at }));
      } else if (entity_type === 'booking') {
        const { data } = await supabase
          .from('bookings')
          .select('id, created_at')
          .eq('status', 'pending');
        entities = (data || []).map((b: any) => ({ id: b.id, created_at: b.created_at }));
      }

      // ── Check each entity against threshold ─────────────────────
      for (const entity of entities) {
        totalChecked++;
        const ageMs = now - new Date(entity.created_at).getTime();
        const ageMinutes = Math.round(ageMs / 60_000);

        if (ageMs > thresholdMs) {
          // Determine severity
          const ratio = ageMs / thresholdMs;
          let severity = 'warning';
          if (ratio >= 3) severity = 'critical';
          else if (ratio >= 1.5) severity = 'breach';

          // Check if we already logged this violation (avoid duplicates)
          const { data: existing } = await supabase
            .from('sla_violations')
            .select('id')
            .eq('policy_id', policy.id)
            .eq('entity_id', entity.id)
            .is('resolved_at', null)
            .maybeSingle();

          if (!existing) {
            await supabase.from('sla_violations').insert({
              policy_id: policy.id,
              entity_type,
              entity_id: entity.id,
              metric,
              threshold_minutes,
              actual_minutes: ageMinutes,
              severity,
            });
            newViolations++;
          } else {
            // Update severity if it escalated
            await supabase.from('sla_violations')
              .update({ actual_minutes: ageMinutes, severity })
              .eq('id', existing.id);
          }
        }
      }
    }

    // Auto-resolve violations for entities that have been handled
    const { data: openViolations } = await supabase
      .from('sla_violations')
      .select('id, entity_type, entity_id')
      .is('resolved_at', null);

    let autoResolved = 0;
    for (const v of (openViolations || [])) {
      let stillOpen = true;

      if (v.entity_type === 'ticket') {
        const { data } = await supabase.from('support_tickets').select('resolved_at').eq('id', v.entity_id).maybeSingle();
        if (data?.resolved_at) stillOpen = false;
      } else if (v.entity_type === 'order') {
        const { data } = await supabase.from('orders').select('status').eq('id', v.entity_id).maybeSingle();
        if (data && !['pending', 'confirmed'].includes(data.status)) stillOpen = false;
      } else if (v.entity_type === 'lead') {
        const { data } = await supabase.from('leads').select('status').eq('id', v.entity_id).maybeSingle();
        if (data && data.status !== 'new') stillOpen = false;
      } else if (v.entity_type === 'chat') {
        const { data } = await supabase.from('chat_conversations').select('conversation_status').eq('id', v.entity_id).maybeSingle();
        if (data && data.conversation_status !== 'open') stillOpen = false;
      } else if (v.entity_type === 'booking') {
        const { data } = await supabase.from('bookings').select('status').eq('id', v.entity_id).maybeSingle();
        if (data && data.status !== 'pending') stillOpen = false;
      }

      if (!stillOpen) {
        await supabase.from('sla_violations')
          .update({ resolved_at: new Date().toISOString(), resolved_by: 'auto' })
          .eq('id', v.id);
        autoResolved++;
      }
    }

    const result = {
      checked: totalChecked,
      policies_evaluated: policies.length,
      new_violations: newViolations,
      auto_resolved: autoResolved,
      timestamp: new Date().toISOString(),
    };

    // Log to agent_activity
    try {
      await supabase.from('agent_activity').insert({
        agent: 'flowpilot',
        skill_name: 'sla_check',
        input: { trigger: 'scheduled' },
        output: result,
        status: newViolations > 0 ? 'success' : 'success',
        duration_ms: Date.now() - now,
      });
    } catch { /* non-fatal */ }

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err: any) {
    console.error('[sla-check] Error:', err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
