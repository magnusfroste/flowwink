import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8');

/**
 * Hermes on Nordbrygg (2026-10-25, a Sunday) reported three "stalled sweeps":
 * weekday jobs whose last run was Friday — exactly on schedule. The listing
 * handed an agent nothing but last_triggered_at, so the agent judged by the
 * calendar. A job's verdict is read against ITS schedule, in the answer.
 */
describe('manage_automations list — a job is judged by its schedule, not the calendar', () => {
  const src = read('supabase/functions/agent-execute/index.ts');
  it('returns the run evidence and a state per automation', () => {
    expect(src).toMatch(/select\('id, name, description, trigger_type, trigger_config, skill_name, enabled, executor, created_at, last_triggered_at, next_run_at, last_work_at, run_count, idle_run_count, last_error'\)/);
    expect(src).toMatch(/const state = !r\.enabled \? 'disabled'/);
    expect(src).toMatch(/next < now - 15 \* 60 \* 1000 \? 'overdue'/);
    expect(src).toMatch(/state_legend:/);
  });
  it('the seed tells an agent to judge by state', () => {
    const seed = read('src/lib/modules/flowpilot-module.ts');
    expect(seed.match(/judge a job by state, never by how old its last run looks/g)!.length).toBe(2);
  });
  it('FlowBox names every channel it carries, texts included', () => {
    expect(read('src/pages/admin/FlowBoxPage.tsx')).toMatch(/email, chat, tickets, forms, texts, calls/);
  });
});
