import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Skill Curator guardrails — FlowPilot 2.0 Phase 3 (2026-07-12).
 *
 * The Hermes learning loop: observe how skills fail → AI-draft better
 * instructions → stage for human review → followthrough applies on approval.
 * Live-proven locally: 5 seeded slug-failures on manage_wiki_page → curator
 * drafted "slug is ALWAYS required, find it via search_wiki" → staged in
 * /admin/approvals → approved → followthrough applied it to the catalog →
 * cooldown blocked re-proposal.
 *
 * Invariants that must never regress:
 * 1. The Curator NEVER writes a skill directly — it stages through the trust
 *    machinery (update_skill_instructions, trust 'approve').
 * 2. Skill self-modification stays human-gated EVEN IN PROVING POSTURE —
 *    an agent_trust_policies row pins it (policy always beats posture).
 * 3. Bounded: cooldown + per-run cap + evidence threshold (no proposal spam).
 * 4. Audit-before-overwrite: the previous text is returned + logged.
 */

const root = join(__dirname, '..', '..', '..');
const read = (p: string) => readFileSync(join(root, p), 'utf8');

describe('skill curator guardrails', () => {
  const curator = read('supabase/functions/flowpilot-lifecycle/curator.ts');
  const agentExecute = read('supabase/functions/agent-execute/index.ts');
  const seeds = read('src/lib/platform-seeds.ts');
  const migration = read('supabase/migrations/20260712150000_curator-trust-policy.sql');

  it('curator stages via agent-execute, never writes agent_skills directly', () => {
    expect(curator).toContain('update_skill_instructions');
    expect(curator).toMatch(/functions\/v1\/agent-execute/);
    // no direct UPDATE of skill text from the curator (only the pulse row + reads)
    expect(curator).not.toMatch(/from\(["']agent_skills["']\)\s*\.update/);
  });

  it('update_skill_instructions is seeded trust=approve and policy-pinned', () => {
    // seed side
    const seedBlock = seeds.slice(
      seeds.indexOf("name: 'update_skill_instructions'"),
      seeds.indexOf("name: 'run_skill_curator'"),
    );
    expect(seedBlock).toContain("trust_level: 'approve'");
    // policy side: survives proving posture
    expect(migration).toContain('agent_trust_policies');
    expect(migration).toContain("'update_skill_instructions', 'approve'");
  });

  it('the write-path handler exists and audits before overwriting', () => {
    expect(agentExecute).toContain("handler === 'internal:update_skill_instructions'");
    const fn = agentExecute.slice(
      agentExecute.indexOf('async function executeUpdateSkillInstructions'),
      agentExecute.indexOf('async function executeLintSkill'),
    );
    expect(fn).toMatch(/previous:\s*\{/);
    expect(fn).toMatch(/skill "?.*not found/i);
  });

  it('curator is bounded: cooldown, per-run cap, evidence threshold', () => {
    expect(curator).toMatch(/COOLDOWN_DAYS = \d+/);
    expect(curator).toMatch(/MAX_PROPOSALS_PER_RUN = \d+/);
    expect(curator).toMatch(/MIN_FAILURES = \d+/);
    expect(curator).toContain('inCooldown');
  });

  it('curator excludes engine plumbing from evidence', () => {
    expect(curator).toMatch(/ENGINE = new Set/);
    expect(curator).toContain('followthrough_sweep');
    expect(curator).toContain('heartbeat');
  });

  it('curator is seeded as a platform skill with a daily automation', () => {
    expect(seeds).toContain("name: 'run_skill_curator'");
    // B5: curator lives in flowpilot-lifecycle; the seed carries the _skill
    // that the dispatcher maps to task=curator.
    expect(seeds).toContain("handler: 'edge:flowpilot-lifecycle'");
    expect(seeds).toContain("name: 'Skill Curator'");
    expect(seeds).toMatch(/'0 4 \* \* \*'/);
  });
});
