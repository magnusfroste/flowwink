/**
 * A skill FlowPilot writes reaches no further than the platform does (2026-11-24).
 *
 * skill_create and skill_update took any handler. The executor runs skills as
 * the service role, so `db:user_roles`, `edge:<fn>` or `rpc:<fn>` from a
 * conversation was a new reach into the data, and skill_update could rewrite a
 * platform skill's handler. The model reads text strangers wrote; one sentence
 * could ask for such a skill.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { agentSkillScope, judgeAgentSkillHandler } from '../../../supabase/functions/_shared/skills/agent-made-skills';

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8');
const platform = new Set(['db:leads', 'rpc:find_in_content']);

describe('an agent-made skill reaches no further than the platform', () => {
  it('a prompt is allowed', () => {
    expect(judgeAgentSkillHandler('ai-task:summarize_week', platform).ok).toBe(true);
  });

  it('a handler a platform skill already uses is allowed', () => {
    expect(judgeAgentSkillHandler('db:leads', platform).ok).toBe(true);
  });

  it('a new reach is refused, with a way forward', () => {
    for (const h of ['db:user_roles', 'edge:setup-database', 'rpc:admin_reset_mfa', 'webhook:any', 'ai-task:', '', null]) {
      const v = judgeAgentSkillHandler(h, platform);
      expect(v.ok, String(h)).toBe(false);
      expect(v.code).toBe('HANDLER_NOT_ALLOWED');
      expect(v.hint).toMatch(/ai-task:/);
    }
  });

  it('only a prompt leaves the inside', () => {
    expect(agentSkillScope('ai-task:x', 'both')).toBe('both');
    expect(agentSkillScope('ai-task:x', 'external')).toBe('external');
    expect(agentSkillScope('db:leads', 'both')).toBe('internal');
    expect(agentSkillScope('db:leads', 'external')).toBe('internal');
    expect(agentSkillScope('ai-task:x', undefined)).toBe('internal');
  });

  it('skill_create and skill_update ask the rule; a platform handler is never rewritten', () => {
    const h = read('supabase/functions/_shared/pilot/handlers.ts');
    const create = h.slice(h.indexOf('export async function handleSkillCreate'), h.indexOf('export async function handleSkillUpdate'));
    expect(create).toMatch(/judgeAgentSkillHandler\(args\.handler/);
    expect(create).toMatch(/scope: agentSkillScope\(args\.handler, args\.scope\)/);
    expect(create.indexOf('judgeAgentSkillHandler')).toBeLessThan(create.indexOf(".insert("));
    const update = h.slice(h.indexOf('export async function handleSkillUpdate'), h.indexOf('export async function handleSkillList'));
    expect(update).toMatch(/target\.origin !== 'agent'/);
    expect(update).toMatch(/judgeAgentSkillHandler\(filtered\.handler/);
    expect(update.indexOf('judgeAgentSkillHandler')).toBeLessThan(update.indexOf('.update(filtered)'));
  });

  it('the webhook: handler is retired — nothing posts unsigned to the first webhook', () => {
    const core = read('supabase/functions/_shared/execute/core.ts');
    expect(core).not.toMatch(/async function executeWebhook/);
    expect(core).toMatch(/HANDLER_RETIRED/);
  });
});
