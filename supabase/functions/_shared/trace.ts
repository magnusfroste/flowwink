/**
 * Trace — Correlation IDs for FlowPilot autonomy runs.
 * 
 * A single `traceId` flows through:
 *   heartbeat → reason loop → tool calls → agent-execute → activity logs
 * 
 * This enables full observability: "show me everything that happened in heartbeat run X".
 */

/**
 * Generate a short, unique trace ID for a single autonomy run.
 * Format: fp_{timestamp}_{random} — human-readable and sortable.
 */
export function generateTraceId(prefix = 'fp'): string {
  const ts = Date.now().toString(36);
  const rand = Math.random().toString(36).slice(2, 8);
  return `${prefix}_${ts}_${rand}`;
}
