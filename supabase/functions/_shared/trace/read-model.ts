// Trace read model (H10 → product) — the derived, read-only view over the
// harness's own logs. See docs/architecture/agent-harness.md §4.
//
// A "run" is one harness execution: a heartbeat, a chat turn, a cron fire, or a
// gateway session. Its steps all share agent_activity.trace_id. This module
// turns that flat table into structured runs the Trace surface can render —
// and nothing else: it adds no writes, no control path, no new instrumentation.
// It renders what the harness already emits (the safe way to ship observability).
//
// Placed in _shared/ deliberately: an external operator's runs (agent_type
// 'mcp'/'openclaw') are as traceable as FlowPilot's. The harness serves both.

import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';

export interface TraceStep {
  id: string;
  skill_name: string | null;
  status: string;                    // success | failed
  /** Verbatim arguments the caller sent — verify-don't-trust: this is ground truth. */
  input: Record<string, unknown> | null;
  /** Handler result, or the error surfaced to the caller. */
  output: Record<string, unknown> | null;
  error_message: string | null;
  duration_ms: number | null;
  /** Post-hoc outcome verdict from evaluate_outcomes, when evaluated. */
  outcome_status: string | null;
  /** Set when this step was gated to the approval queue (H8). */
  approval_request_id: string | null;
  created_at: string;
}

export interface TraceRun {
  trace_id: string;
  /** heartbeat | cron | chat | mcp | flowpilot | automation — who drove the run. */
  agent: string;
  started_at: string;
  ended_at: string;
  duration_ms: number;
  step_count: number;
  failed_count: number;
  /** ok when every step succeeded; degraded when some failed; failed when all did. */
  health: 'ok' | 'degraded' | 'failed';
  /** Distinct skills touched, in first-seen order — the shape of the run at a glance. */
  skills: string[];
  /**
   * Lifecycle from agent_runs when the run was checkpointed (Phase 1), else
   * derived from the steps. running | paused | completed | failed.
   */
  lifecycle: string;
  /** Present when the run is/was paused: why, and how many steps in. */
  paused_reason?: string | null;
  cursor?: number | null;
  steps?: TraceStep[];               // present only in getRun()
}

const RUN_COLUMNS =
  'id, trace_id, agent, skill_name, status, input, output, error_message, duration_ms, outcome_status, approval_request_id, created_at';

function summariseRun(traceId: string, rows: any[]): TraceRun {
  // rows are ascending by created_at
  const failed = rows.filter((r) => r.status === 'failed').length;
  const skills: string[] = [];
  for (const r of rows) if (r.skill_name && !skills.includes(r.skill_name)) skills.push(r.skill_name);
  const first = rows[0];
  const last = rows[rows.length - 1];
  const started = new Date(first.created_at).getTime();
  const ended = new Date(last.created_at).getTime();
  return {
    trace_id: traceId,
    agent: first.agent,
    started_at: first.created_at,
    ended_at: last.created_at,
    duration_ms: Math.max(0, ended - started),
    step_count: rows.length,
    failed_count: failed,
    health: failed === 0 ? 'ok' : failed === rows.length ? 'failed' : 'degraded',
    skills,
    // Default lifecycle derived from the steps; overwritten from agent_runs
    // when a checkpoint exists (attachLifecycle).
    lifecycle: failed === rows.length && rows.length > 0 ? 'failed' : 'completed',
  };
}

/** Overlay durable lifecycle (agent_runs) onto derived run summaries. */
async function attachLifecycle(supabase: SupabaseClient, runs: TraceRun[]): Promise<void> {
  if (!runs.length) return;
  const ids = runs.map((r) => r.trace_id);
  const { data } = await supabase
    .from('agent_runs')
    .select('trace_id, status, paused_reason, cursor')
    .in('trace_id', ids);
  const byId = new Map<string, any>((data ?? []).map((r: any) => [r.trace_id, r]));
  for (const run of runs) {
    const rec = byId.get(run.trace_id);
    if (rec) {
      run.lifecycle = rec.status;
      run.paused_reason = rec.paused_reason;
      run.cursor = rec.cursor;
    }
  }
}

/**
 * List recent harness runs, newest first. One row per trace_id, summarised.
 * Optional filters: agent (heartbeat/chat/mcp/…) and health.
 */
export async function listRuns(
  supabase: SupabaseClient,
  opts: { limit?: number; agent?: string; sinceHours?: number } = {},
): Promise<{ runs: TraceRun[] }> {
  const limit = Math.min(Math.max(opts.limit ?? 40, 1), 200);
  const sinceHours = Math.min(Math.max(opts.sinceHours ?? 72, 1), 24 * 30);
  const since = new Date(Date.now() - sinceHours * 3_600_000).toISOString();

  let q = supabase
    .from('agent_activity')
    .select(RUN_COLUMNS)
    .not('trace_id', 'is', null)
    .gte('created_at', since)
    .order('created_at', { ascending: true })
    .limit(4000); // cap the scan; grouped down to `limit` runs below
  if (opts.agent) q = q.eq('agent', opts.agent);

  const { data, error } = await q;
  if (error) throw new Error(`Trace listRuns failed: ${error.message}`);

  // Group into runs, then take the newest `limit` by start time.
  const byRun = new Map<string, any[]>();
  for (const r of data ?? []) {
    const arr = byRun.get(r.trace_id) ?? [];
    arr.push(r);
    byRun.set(r.trace_id, arr);
  }
  const runs = [...byRun.entries()]
    .map(([id, rows]) => summariseRun(id, rows))
    .sort((a, b) => b.started_at.localeCompare(a.started_at))
    .slice(0, limit);
  await attachLifecycle(supabase, runs);
  return { runs };
}

/**
 * One run in full: summary + every ordered step. The step's verbatim `input`
 * is the debugging payload — the thing the proof-week method reads instead of
 * asking the agent what it did.
 */
export async function getRun(
  supabase: SupabaseClient,
  traceId: string,
): Promise<{ run: TraceRun | null }> {
  if (!traceId || typeof traceId !== 'string') {
    throw new Error('trace_id is required');
  }
  const { data, error } = await supabase
    .from('agent_activity')
    .select(RUN_COLUMNS)
    .eq('trace_id', traceId)
    .order('created_at', { ascending: true });
  if (error) throw new Error(`Trace getRun failed: ${error.message}`);
  if (!data || !data.length) return { run: null };

  const run = summariseRun(traceId, data);
  await attachLifecycle(supabase, [run]);
  run.steps = data.map((r: any): TraceStep => ({
    id: r.id,
    skill_name: r.skill_name,
    status: r.status,
    input: r.input ?? null,
    output: r.output ?? null,
    error_message: r.error_message,
    duration_ms: r.duration_ms,
    outcome_status: r.outcome_status,
    approval_request_id: r.approval_request_id,
    created_at: r.created_at,
  }));
  return { run };
}
