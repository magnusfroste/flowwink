// get_agent_trace — internal skill handler (read-only sensor).
//
// The gateway/skill face of the Trace read model. Two shapes:
//   { }                      → list recent runs (summaries)
//   { trace_id: "hb_…" }     → one run in full, with ordered steps
//
// Read-only and derived — no writes, no control path. Harness-level, so an
// external operator can read its OWN runs through the gateway too, not just
// FlowPilot's. See docs/architecture/agent-harness.md §4.

import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { listRuns, getRun } from '../trace/read-model.ts';

export async function executeAgentTrace(
  supabase: SupabaseClient,
  args: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const traceId = typeof args?.trace_id === 'string' ? args.trace_id.trim() : '';
  if (traceId) {
    const { run } = await getRun(supabase, traceId);
    if (!run) {
      return { error: `No run found for trace_id "${traceId}". Call get_agent_trace with no arguments to list recent runs.` };
    }
    return { run };
  }

  const { runs } = await listRuns(supabase, {
    limit: typeof args?.limit === 'number' ? args.limit : undefined,
    agent: typeof args?.agent === 'string' ? args.agent : undefined,
    sinceHours: typeof args?.since_hours === 'number' ? args.since_hours : undefined,
  });
  return {
    runs,
    count: runs.length,
    note: runs.length
      ? 'Pass a run\'s trace_id back to get_agent_trace for its full ordered steps.'
      : 'No traced runs in the window. Runs are created by the reason loop, cron, chat and gateway sessions.',
  };
}
