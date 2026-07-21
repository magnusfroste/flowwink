import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Guardrail: a status-transition skill must not ride the generic db:<table>
 * CRUD handler.
 *
 * agent-execute infers the action from the skill-name verb. create/update/delete
 * are inferable; a transition verb names a TARGET STATE that nothing in the
 * name reveals, so the handler guesses — and the guess is wrong in two
 * different ways, one of them silent:
 *
 *   schedule_voice_callback     'schedule' is in CREATE_VERBS → INSERT → fell
 *                               over on voice_calls' NOT NULL columns. Loud.
 *   mark_voice_callback_done    'mark' matches nothing → falls through to LIST
 *                               → returns {items: []} and reports SUCCESS
 *                               without touching a row. Silent, so it survived
 *                               far longer.
 *   support_assign_conversation 'support' matches nothing → same silent list.
 *
 * All three were found by the skill linter on 2026-07-21 and given dedicated
 * RPCs. agent-execute's own comment already stated the rule ("send_/move_/
 * mark_/approve_ … need a specific target state"); nothing enforced it.
 */

const root = process.cwd();

/** Verbs that name a target state the generic handler cannot infer. */
const TRANSITION_VERBS = [
  'mark', 'move', 'send', 'approve', 'reject', 'assign', 'schedule',
  'cancel', 'complete', 'close', 'escalate', 'resolve', 'publish',
];

const MODULE_FILES = import.meta.glob('../modules/*-module.ts');
const PLATFORM_SEEDS = import.meta.glob('../platform-seeds.ts');

async function allSkills(): Promise<{ name: string; handler: string }[]> {
  const out: { name: string; handler: string }[] = [];
  for (const load of [...Object.values(MODULE_FILES), ...Object.values(PLATFORM_SEEDS)]) {
    const mod = (await load()) as Record<string, unknown>;
    for (const exported of Object.values(mod)) {
      const skills = (exported as any)?.skillSeeds ?? exported;
      if (!Array.isArray(skills)) continue;
      for (const s of skills) {
        if (typeof s?.name === 'string' && typeof s?.handler === 'string') {
          out.push({ name: s.name, handler: s.handler });
        }
      }
    }
  }
  return out;
}

describe('status-transition skills', () => {
  /**
   * A transition VERB is not itself the bug — the bug is a transition verb on
   * a skill that mutates an EXISTING row through generic CRUD. Two shapes are
   * legitimately exempt, and both are checked rather than assumed:
   *   - the skill has its own branch in agent-execute, so it never reaches the
   *     verb inference at all (send_contract_for_signature);
   *   - the skill genuinely inserts a new row, which CREATE_VERBS gets right
   *     (schedule_social_post creates the post it schedules).
   */
  const GENUINE_CREATES = new Set([
    'schedule_social_post', // inserts into social_posts; the post IS the new row
  ]);

  it('never use the generic db: CRUD handler', async () => {
    const skills = await allSkills();
    expect(skills.length, 'no skills found — the seed shape changed').toBeGreaterThan(200);

    const agentExecute = readFileSync(
      join(root, 'supabase/functions/agent-execute/index.ts'),
      'utf8',
    );
    const hasOwnBranch = (name: string) =>
      agentExecute.includes(`skillName === '${name}'`) ||
      agentExecute.includes(`skillName === "${name}"`);

    const offenders = skills
      .filter((s) => s.handler.startsWith('db:'))
      .filter((s) => TRANSITION_VERBS.includes(s.name.split('_')[0]))
      .filter((s) => !GENUINE_CREATES.has(s.name) && !hasOwnBranch(s.name))
      .map((s) => `${s.name} → ${s.handler}`);

    expect(
      offenders,
      'the generic handler cannot infer a target state — give these a dedicated ' +
        'rpc: handler, or justify them in GENUINE_CREATES:\n' +
        offenders.join('\n'),
    ).toEqual([]);
  });

  it('the three fixed skills point at their RPCs', async () => {
    // Pin the specific repairs: each was verified live to mutate a row, and
    // mark_voice_callback_done to be idempotent on a repeat call.
    const byName = new Map((await allSkills()).map((s) => [s.name, s.handler]));
    expect(byName.get('schedule_voice_callback')).toBe('rpc:schedule_voice_callback');
    expect(byName.get('mark_voice_callback_done')).toBe('rpc:mark_voice_callback_done');
    expect(byName.get('support_assign_conversation')).toBe('rpc:support_assign_conversation');
  });

  it('each RPC exists, escapes service_role, and the retryable one is idempotent', () => {
    const dir = join(root, 'supabase/migrations');
    const file = readdirSync(dir).find((f) => f.includes('status-transition-rpcs'));
    expect(file, 'the status-transition RPC migration is gone').toBeTruthy();
    const sql = readFileSync(join(dir, file!), 'utf8');

    for (const fn of [
      'schedule_voice_callback',
      'mark_voice_callback_done',
      'support_assign_conversation',
    ]) {
      expect(sql, `${fn} is not defined`).toContain(`FUNCTION public.${fn}(`);
    }
    // The MCP gateway runs as service_role, where auth.uid() is NULL.
    expect(sql.match(/auth\.role\(\) = 'service_role'/g)?.length).toBe(3);
    // Agents retry; completing an already-completed callback must be a no-op.
    expect(sql).toMatch(/'idempotent', true/);
  });

  it('the linter reads the dispatcher mapping instead of mirroring it', () => {
    // A hand-copied UNDERSCORE_PARAM_RPCS drifted and made the linter report
    // seven working skills as broken — which is why nobody trusted it.
    const linter = readFileSync(join(root, 'scripts/skill-linter.ts'), 'utf8');
    expect(linter).toMatch(/UNDERSCORE_PARAM_RPCS = new Set<string>/);
    expect(linter).toContain('supabase/functions/agent-execute/index.ts');
    expect(linter, 'the linter re-introduced a hardcoded list').not.toMatch(
      /const UNDERSCORE_PARAM_RPCS = new Set\(\[/,
    );
  });
});
