import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Objectives are the wheel an operator steers FlowPilot with. Until 2026-09-17
 * the MCP surface could create one and nothing else — an external operator
 * could not see what FlowPilot was working on, pause a duplicate, or close a
 * finished goal (a second session had to ask the human to look in the panel).
 *
 * Two shapes are pinned: the read and the write exist, and `complete` goes
 * through the evidence-bound handler — an operator is held to the same rule
 * as the model (objective-evidence.guardrails.test.ts), never a bare status write.
 */

const root = join(__dirname, '../../..');
const artifact = JSON.parse(readFileSync(join(root, 'supabase/seed/module-skills.json'), 'utf8')) as {
  modules: Array<{ moduleId: string; skills: Array<{ name: string; handler?: string; trust_level?: string }> }>;
};
const skills = new Map(artifact.modules.flatMap((m) => m.skills).map((s) => [s.name, s]));
const agentExecute = readFileSync(join(root, 'supabase/functions/agent-execute/index.ts'), 'utf8');

describe('objectives on the agent surface', () => {
  it('read and write both exist, on the objectives handler', () => {
    for (const n of ['create_objective', 'list_objectives', 'manage_objective']) {
      expect(skills.get(n)?.handler, n).toBe('module:objectives');
    }
    expect(skills.get('list_objectives')?.trust_level).toBe('auto');
    expect(skills.get('manage_objective')?.trust_level).toBe('notify');
  });

  it('complete is the evidence-bound handler, never a status write', () => {
    const block = agentExecute.slice(agentExecute.indexOf("if (skillName === 'manage_objective')"), agentExecute.indexOf("throw new Error(`Unknown action \"${action}\" — use pause | resume | complete | update`)"));
    expect(block).toMatch(/return await handleObjectiveComplete\(supabase, \{ objective_id \}\)/);
    expect(block).not.toMatch(/status: 'completed'/);
    expect(agentExecute).toMatch(/import \{ handleObjectiveComplete \} from '\.\.\/_shared\/pilot\/handlers\.ts'/);
  });

  it('the list is bounded and defaults to what is live', () => {
    const block = agentExecute.slice(agentExecute.indexOf("if (skillName === 'list_objectives')"), agentExecute.indexOf("if (skillName === 'manage_objective')"));
    expect(block).toMatch(/Math\.min\(Math\.max\(Number\(limit\) \|\| 50, 1\), 200\)/);
    expect(block).toMatch(/\.in\('status', \['active', 'paused'\]\)/);
  });
});
