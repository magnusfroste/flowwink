// sla-check — sweep all enabled SLA policies against current data, open new
// violations and auto-resolve ones whose entity has since been handled.
//
// Invoked by agent-execute for the `sla_check` skill (handler: edge:sla-check)
// and safe to call on a schedule / during heartbeat. Cheap and idempotent:
// each (policy, entity) has at most one open violation at a time.
//
// SLA clock starts at the entity's created_at. A policy is satisfied once the
// entity reaches its "handled" state (per ENTITY_CONFIG below); until then,
// once (now - created_at) exceeds threshold_minutes, a violation is opened.
//
// With zero policies (or zero matching entities) this is a no-op that returns
// empty counts — there is nothing to guess at.

import { getServiceClient } from '../_shared/supabase-clients.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface EntityConfig {
  table: string;
  /** Timestamp column the SLA clock starts from. */
  startColumn: string;
  /** Supabase filter that selects entities still considered OPEN (unhandled). */
  openFilter: (q: any) => any;
}

// Per-entity-type rules. An entity is "open" (SLA clock running) until it
// reaches the handled state; once handled it no longer breaches and any open
// violation auto-resolves. Column names verified against the live schema.
const ENTITY_CONFIG: Record<string, EntityConfig> = {
  ticket: {
    table: 'tickets',
    startColumn: 'created_at',
    openFilter: (q) => q.is('resolved_at', null).not('status', 'in', '("closed","resolved")'),
  },
  order: {
    table: 'orders',
    startColumn: 'created_at',
    openFilter: (q) => q.is('shipped_at', null).not('status', 'in', '("cancelled","refunded")'),
  },
  lead: {
    table: 'leads',
    startColumn: 'created_at',
    openFilter: (q) => q.is('ai_qualified_at', null).is('converted_at', null),
  },
  chat: {
    table: 'chat_conversations',
    startColumn: 'created_at',
    openFilter: (q) => q.not('conversation_status', 'in', '("closed","resolved")'),
  },
  booking: {
    table: 'bookings',
    startColumn: 'created_at',
    openFilter: (q) => q.is('confirmation_sent_at', null).not('status', 'in', '("cancelled","confirmed")'),
  },
};

interface Policy {
  id: string;
  entity_type: string;
  metric: string;
  threshold_minutes: number;
  priority: string | null;
}

interface FreshViolation {
  policy_id: string;
  entity_type: string;
  entity_id: string;
  metric: string;
  actual_minutes: number;
  severity: string;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const supabase = getServiceClient();
    const body = await req.json().catch(() => ({}));
    const entityFilter: string | undefined = body?.entity_type || undefined;

    let policyQuery = supabase.from('sla_policies').select('id, entity_type, metric, threshold_minutes, priority').eq('enabled', true);
    if (entityFilter) policyQuery = policyQuery.eq('entity_type', entityFilter);
    const { data: policies, error: polErr } = await policyQuery;
    if (polErr) throw new Error(`Failed to load SLA policies: ${polErr.message}`);

    // If a working-hours schedule is configured (any row in business_hours), the
    // SLA clock ticks on business minutes only — nights/weekends/holidays don't
    // count. With no schedule, fall back to wall-clock (fail-forward: don't
    // break instances that never configured business hours).
    const { count: bhCount } = await supabase
      .from('business_hours')
      .select('*', { count: 'exact', head: true });
    const useBusinessHours = (bhCount ?? 0) > 0;

    async function elapsedMinutes(startIso: string, nowIso: string): Promise<number> {
      if (!useBusinessHours) {
        return Math.floor((new Date(nowIso).getTime() - new Date(startIso).getTime()) / 60_000);
      }
      const { data, error } = await supabase.rpc('business_minutes_between', {
        p_start: startIso,
        p_end: nowIso,
      });
      if (error) {
        // Fail-forward: fall back to wall-clock on RPC failure rather than skip.
        return Math.floor((new Date(nowIso).getTime() - new Date(startIso).getTime()) / 60_000);
      }
      return Math.max(0, Math.floor(Number(data ?? 0)));
    }

    const now = Date.now();
    const nowIso = new Date(now).toISOString();
    const counts: Record<string, { checked: number; open_violations: number; resolved: number }> = {};
    const fresh: FreshViolation[] = [];

    for (const policy of (policies ?? []) as Policy[]) {
      const cfg = ENTITY_CONFIG[policy.entity_type];
      if (!cfg) continue; // unknown entity type — skip rather than guess
      const bucket = counts[policy.entity_type] ??= { checked: 0, open_violations: 0, resolved: 0 };

      const cutoffIso = new Date(now - policy.threshold_minutes * 60_000).toISOString();
      const severity = policy.priority || 'medium';

      // Wall-clock cutoff selects a superset of true breachers when business
      // hours are in effect (business minutes ≤ wall minutes); we then
      // re-verify each candidate against the business-hours clock below.
      let breachQuery = supabase.from(cfg.table).select(`id, ${cfg.startColumn}`).lt(cfg.startColumn, cutoffIso);
      breachQuery = cfg.openFilter(breachQuery);
      const { data: breaching, error: breachErr } = await breachQuery.limit(500);
      if (breachErr) { bucket.checked = -1; continue; } // surface but don't crash the sweep

      for (const ent of breaching ?? []) {
        bucket.checked++;
        const entityId = String((ent as any).id);
        const startedAtIso = (ent as any)[cfg.startColumn] as string;
        const actualMinutes = await elapsedMinutes(startedAtIso, nowIso);

        // With a business-hours schedule the wall-clock cutoff over-selects:
        // re-verify against the working-hours clock before opening a breach.
        if (actualMinutes < policy.threshold_minutes) continue;

        // Skip if an unresolved violation already exists for this (policy, entity).
        const { data: existing } = await supabase
          .from('sla_violations')
          .select('id')
          .eq('policy_id', policy.id)
          .eq('entity_id', entityId)
          .is('resolved_at', null)
          .maybeSingle();
        if (existing) continue;

        const { error: insErr } = await supabase.from('sla_violations').insert({
          policy_id: policy.id,
          entity_type: policy.entity_type,
          entity_id: entityId,
          metric: policy.metric,
          threshold_minutes: policy.threshold_minutes,
          actual_minutes: actualMinutes,
          severity,
        });
        if (!insErr) {
          bucket.open_violations++;
          fresh.push({
            policy_id: policy.id,
            entity_type: policy.entity_type,
            entity_id: entityId,
            metric: policy.metric,
            actual_minutes: actualMinutes,
            severity,
          });
        }
      }

      // 2) Auto-resolve open violations whose entity is no longer "open".
      const { data: openViolations } = await supabase
        .from('sla_violations')
        .select('id, entity_id')
        .eq('policy_id', policy.id)
        .is('resolved_at', null);

      for (const v of openViolations ?? []) {
        let stillOpenQuery = supabase.from(cfg.table).select('id').eq('id', (v as any).entity_id);
        stillOpenQuery = cfg.openFilter(stillOpenQuery);
        const { data: stillOpen } = await stillOpenQuery.maybeSingle();
        if (!stillOpen) {
          const { error: resErr } = await supabase
            .from('sla_violations')
            .update({ resolved_at: new Date().toISOString(), resolved_by: 'sla-check' })
            .eq('id', (v as any).id);
          if (!resErr) bucket.resolved++;
        }
      }
    }

    return new Response(
      JSON.stringify({
        status: 'success',
        policies_checked: policies?.length ?? 0,
        counts,
        fresh_violations: fresh,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ status: 'failed', error: err instanceof Error ? err.message : String(err) }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});
