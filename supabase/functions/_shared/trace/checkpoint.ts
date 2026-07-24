// Resumption Phase 1 — the run checkpoint (agent-resumption.md §2.2).
//
// One upsert on agent_runs keyed by trace_id. The reason loop calls it at run
// START (running) and, from its finally, at run END (completed / failed).
// Phase 2 adds paused states + cursor advance; Phase 1 is the durable lifecycle.
//
// CONTRACT: checkpointing is BOOKKEEPING. It must never break a run — every
// caller wraps it so a checkpoint failure is swallowed. A run's success can't
// depend on whether we recorded that it succeeded.

import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';

export interface CheckpointInput {
  traceId: string;
  agent?: string;
  objectiveId?: string | null;
  status: 'running' | 'paused' | 'completed' | 'failed';
  cursor?: number;
  plan?: unknown;
  pausedReason?: 'window_ended' | 'rate_limited' | 'awaiting_approval' | 'error';
  resumeAfter?: string;
}

export async function checkpointRun(supabase: SupabaseClient, c: CheckpointInput): Promise<void> {
  if (!c.traceId) return;
  const row: Record<string, unknown> = {
    trace_id: c.traceId,
    status: c.status,
    updated_at: new Date().toISOString(),
  };
  if (c.agent) row.agent = c.agent;
  if (c.objectiveId !== undefined) row.objective_id = c.objectiveId;
  if (c.cursor !== undefined) row.cursor = c.cursor;
  if (c.plan !== undefined) row.plan = c.plan;
  if (c.pausedReason !== undefined) row.paused_reason = c.pausedReason;
  if (c.resumeAfter !== undefined) row.resume_after = c.resumeAfter;

  const { error } = await supabase
    .from('agent_runs')
    .upsert(row, { onConflict: 'trace_id' });
  // Never throw — see CONTRACT above. Surface for logs only.
  if (error) console.warn(`[checkpoint] trace=${c.traceId} ${c.status}: ${error.message}`);
}
