/**
 * Recruitment's promise: AI assists, a person selects. An agent's stage move
 * (rejecting included) or hire waits for a person's approval — for an
 * external agent through the skill's trust level, for FlowPilot through a
 * policy that wins over the 'proving' posture (which otherwise downgrades
 * approve → notify). A flagged screening answer never rejects.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { recruitmentModule } from '@/lib/modules/recruitment-module';

const DECISIONS = ['move_application_stage', 'hire_application', 'hire_candidate'];

describe('a person selects', () => {
  it('the decision skills are approve in the seeds', () => {
    const seeds = (recruitmentModule.skillSeeds ?? []) as Array<{ name: string; trust_level?: string }>;
    for (const name of DECISIONS) {
      expect(seeds.find((s) => s.name === name)?.trust_level, name).toBe('approve');
    }
  });
  it('existing instances are raised and FlowPilot is pinned in every posture', () => {
    const sql = readFileSync('supabase/migrations/20261031130000_a-person-decides-who-is-hired.sql', 'utf8');
    expect(sql).toMatch(/SET trust_level = 'approve'[\s\S]*AND trust_level = 'notify'/);
    expect(sql).toMatch(/INSERT INTO public\.agent_trust_policies \(actor, skill_name, effective_trust_level, note\)\s+SELECT 'flowpilot', s, 'approve'/);
    for (const name of DECISIONS) expect(sql).toContain(`'${name}'`);
  });
  it('a flagged answer is recorded, never a rejection', () => {
    const fn = readFileSync('supabase/functions/process-job-application/index.ts', 'utf8');
    expect(fn).toContain("stage: 'applied'");
    expect(fn).not.toMatch(/stage: 'rejected'/);
  });
});
