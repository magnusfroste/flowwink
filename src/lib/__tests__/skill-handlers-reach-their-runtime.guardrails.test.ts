import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * A skill's handler must point at something that can run it (process sweep
 * 2026-09-17, agent surface):
 *
 *  - `edge:ai-task` forwards the raw args to ai-task, which wants
 *    {task, input}: generate_blog_from_webinar failed "task is required" on
 *    every call. The form is `ai-task:<task>`, and the task must be registered.
 *  - `edge:chat-completion` forwards raw args to a chat endpoint that wants
 *    `messages`: draft_candidate_outreach could never run.
 *  - three custom update handlers spread the whole args object into
 *    `.update()`, and the runtime stamps `_effective_agent` onto args —
 *    "Could not find the '_effective_agent' column of 'webinars'".
 *  - the generic update's stamp-column retry removed only the column Postgres
 *    named, then died on the other: no table without both stamps could be
 *    updated by any agent.
 *
 * These scan the seed artifact and the runtime source for the SHAPES, not the
 * four names.
 */

const root = join(__dirname, '../../..');
const artifact = JSON.parse(readFileSync(join(root, 'supabase/seed/module-skills.json'), 'utf8')) as {
  modules: Array<{ moduleId: string; skills: Array<{ name: string; handler?: string }> }>;
};
const seeds = artifact.modules.flatMap((m) => m.skills.map((s) => ({ ...s, module: m.moduleId })));
const tasksSrc = readFileSync(join(root, 'supabase/functions/ai-task/tasks.ts'), 'utf8');
const agentExecute = readFileSync(join(root, 'supabase/functions/agent-execute/index.ts'), 'utf8');

describe('skill handlers reach their runtime', () => {
  it('no seed routes to ai-task or chat-completion through the raw edge: form', () => {
    const wrong = seeds.filter((s) => /^edge:(ai-task|chat-completion)$/.test(s.handler ?? ''));
    expect(wrong.map((s) => `${s.module}/${s.name} → ${s.handler}`)).toEqual([]);
  });

  it('every ai-task:<task> handler names a registered task', () => {
    const registry = tasksSrc.slice(tasksSrc.indexOf('export const TASKS'));
    const registered = new Set([...registry.matchAll(/^\s{2}([a-z_]+):\s+\w+Task,/gm)].map((m) => m[1]));
    expect(registered.size).toBeGreaterThan(8);
    const missing = seeds
      .filter((s) => (s.handler ?? '').startsWith('ai-task:'))
      .map((s) => ({ skill: s.name, task: s.handler!.slice('ai-task:'.length) }))
      .filter(({ task }) => !registered.has(task));
    expect(missing).toEqual([]);
  });

  it('no custom handler spreads the raw args object into an update', () => {
    // `const { <id>, ...updateData } = args` followed by `.update({ ...updateData`
    // is the leak: args carries the server-stamped _effective_agent/_caller_user_id.
    const leaks = [...agentExecute.matchAll(/\.update\(\{\s*\.\.\.updateData\b/g)]
      .filter((m) => {
        // …unless updateData was already passed through stripInternalFields just above.
        const before = agentExecute.slice(Math.max(0, m.index! - 900), m.index);
        return !/updateData = stripInternalFields\(/.test(before);
      })
      .map((m) => `agent-execute/index.ts:${agentExecute.slice(0, m.index).split('\n').length}`);
    expect(leaks, 'wrap it: { ...stripInternalFields(updateData), ... }').toEqual([]);
  });

  it('the generic update drops BOTH stamp columns when a table has neither', () => {
    const i = agentExecute.indexOf("const missing = ['updated_by_agent', 'updated_at'].filter");
    expect(i).toBeGreaterThan(-1);
    const retry = agentExecute.slice(i, i + 600);
    expect(retry).toMatch(/delete cleanUpdate\.updated_by_agent;\s*delete cleanUpdate\.updated_at;/);
    expect(retry).not.toMatch(/for \(const c of missing\) delete cleanUpdate\[c\]/);
  });
});
