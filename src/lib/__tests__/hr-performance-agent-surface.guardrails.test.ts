import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { hrModule } from '@/lib/modules/hr-module';

/**
 * Every capability has two surfaces: the admin panel AND a skill.
 *
 * performance_goals, one_on_ones and performance_reviews had a panel since July
 * and stood as "done" in the parity file on the evidence "exist" — but no skill,
 * so the agent could neither set a goal nor write a review, and the process
 * battery never ran the layer. Found on the HR sweep 2026-10-06, together with
 * an RLS policy that compared an employee row with itself and so hid a
 * manager's own 1:1s. These guards keep both surfaces and the proof in place.
 */

const root = join(__dirname, '../../..');
const read = (p: string) => readFileSync(join(root, p), 'utf8');
const migration = read('supabase/migrations/20261005090000_prestationen-far-en-agentyta.sql');

describe('the performance layer has a skill surface', () => {
  const skills = new Map(hrModule.skillSeeds?.map((s) => [s.name, s]) ?? []);

  it('manage_performance and org_chart ride RPCs, in the HR module', () => {
    expect(skills.get('manage_performance')?.handler).toBe('rpc:manage_performance');
    expect(skills.get('org_chart')?.handler).toBe('rpc:org_chart');
    const props = (skills.get('manage_performance')?.tool_definition as { function: { parameters: { properties: { p_action: { enum: string[] } } } } }).function.parameters.properties.p_action.enum;
    for (const a of ['create_goal', 'update_goal', 'schedule_one_on_one', 'complete_one_on_one', 'start_review', 'submit_review', 'acknowledge_review']) expect(props).toContain(a);
  });

  it('the RPC writes the same tables the panel reads, gated on the HR module', () => {
    expect(migration).toMatch(/INSERT INTO performance_goals/);
    expect(migration).toMatch(/INSERT INTO one_on_ones/);
    expect(migration).toMatch(/INSERT INTO performance_reviews/);
    expect(migration).toMatch(/auth\.role\(\) = 'service_role' OR can_access_module\(auth\.uid\(\), 'hr'\)/);
    const panel = read('src/hooks/usePerformance.ts');
    for (const t of ['performance_goals', 'one_on_ones', 'performance_reviews']) expect(panel).toContain(t);
  });

  it('a review runs draft → completed → acknowledged, with a rating 1–5', () => {
    expect(migration).toMatch(/Only a draft review can be submitted/);
    expect(migration).toMatch(/Only a completed review can be acknowledged/);
    expect(migration).toMatch(/p_overall_rating NOT BETWEEN 1 AND 5/);
  });

  it('a manager sees their own 1:1s — the policy compares the row, not itself', () => {
    expect(migration).toMatch(/e\.id = one_on_ones\.employee_id OR e\.id = one_on_ones\.manager_id/);
    // the body that hid them must not come back in a later migration
    const later = readdirSync(join(root, 'supabase/migrations')).filter((f) => f.endsWith('.sql') && f > '20261005090000').map((f) => read(`supabase/migrations/${f}`)).join('\n');
    expect(later).not.toMatch(/\(e\.id = e\.manager_id\)/);
  });

  it('the process battery runs the layer', () => {
    const scenario = read('scripts/process-battery/scenarios/hire-to-retire.ts');
    for (const a of ['create_goal', 'schedule_one_on_one', 'complete_one_on_one', 'start_review', 'submit_review', 'acknowledge_review']) expect(scenario).toContain(`p_action: '${a}'`);
    expect(scenario).toMatch(/'org_chart'/);
  });
});
