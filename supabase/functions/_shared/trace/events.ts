// Trace events — the decisions a run made, recorded next to its steps.
//
// agent_activity holds what a run DID (each skill call). This holds WHY: the
// skill searches and what they returned, every guard that stopped or redirected
// a call, a budget stop, and the model's closing account. The ReAct loop used to
// send all of it to console.log, so the Trace tab could show outcomes but never
// explain them (FlowPilot review, 2026-10-29).
//
// Buffered: `add` is synchronous and free; `flush` writes the run's events in
// one insert at the end. A failed flush is logged and swallowed — observability
// must never break the run it observes.

import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';

export type TraceEventKind =
  | 'run_started'
  | 'skill_search'
  | 'tool_refused'
  | 'circuit_broken'
  | 'cadence_refused'
  | 'loop_detected'
  | 'not_retried'
  | 'retried'
  | 'error_loop_stopped'
  | 'budget_stop'
  | 'auto_chained'
  | 'answer_returned'
  | 'final_answer';

export interface TraceEvent {
  seq: number;
  kind: TraceEventKind;
  summary: string;
  detail: Record<string, unknown>;
}

const MAX_EVENTS = 200;
const MAX_SUMMARY = 500;

export interface TraceRecorder {
  add(kind: TraceEventKind, summary: string, detail?: Record<string, unknown>): void;
  events(): TraceEvent[];
  flush(): Promise<void>;
}

export function createTraceRecorder(supabase: SupabaseClient | null, traceId: string | undefined): TraceRecorder {
  const buffer: TraceEvent[] = [];
  let flushed = false;
  return {
    add(kind, summary, detail = {}) {
      if (buffer.length >= MAX_EVENTS) return;
      buffer.push({ seq: buffer.length, kind, summary: String(summary).slice(0, MAX_SUMMARY), detail });
    },
    events() {
      return buffer.slice();
    },
    async flush() {
      if (flushed || !supabase || !traceId || buffer.length === 0) return;
      flushed = true;
      const { error } = await supabase.from('agent_trace_events').insert(
        buffer.map((e) => ({ trace_id: traceId, seq: e.seq, kind: e.kind, summary: e.summary, detail: e.detail })),
      );
      if (error) console.error(`[trace-events] trace=${traceId} flush failed: ${error.message}`);
    },
  };
}
