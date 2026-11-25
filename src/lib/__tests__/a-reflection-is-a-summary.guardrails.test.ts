/**
 * A reflection is a summary, not the registry (2026-11-25).
 *
 * prompt_sizes on www and nordbrygg: `reflect` answered ~80 000 characters —
 * every registered skill, automation and objective whole — on the step that
 * writes the heartbeat's summary, where folding never reaches it. It was the
 * last step's doubling, about 20 000 tokens of a 120 000 budget.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { handleReflect, REFLECT_LIST_LIMIT } from '../../../supabase/functions/_shared/pilot/handlers';

function fakeDb(rows: Record<string, unknown[]>) {
  const chain = (table: string) => {
    const result = { data: rows[table] ?? [], error: null };
    const q: Record<string, unknown> = {};
    for (const m of ['select', 'gte', 'order', 'limit', 'eq']) q[m] = () => q;
    q.then = (res: (v: unknown) => unknown) => Promise.resolve(result).then(res);
    q.upsert = () => Promise.resolve({ error: null });
    return q;
  };
  return { from: chain };
}

const skills = Array.from({ length: 650 }, (_, i) => ({ name: `skill_number_${i}`, category: 'crm', handler: `db:table_${i}`, enabled: i % 3 !== 0 }));
const automations = Array.from({ length: 30 }, (_, i) => ({ name: `Automation ${i}`, trigger_type: 'cron', skill_name: `skill_number_${i}`, enabled: true, run_count: i, trigger_config: { cron: '*/5 * * * *', long: 'x'.repeat(400) } }));
const objectives = Array.from({ length: 20 }, (_, i) => ({ goal: `Goal ${i} `.repeat(40), status: 'active', progress: { notes: 'y'.repeat(2000) } }));
const activity = Array.from({ length: 100 }, (_, i) => ({ skill_name: `skill_number_${i % 12}`, status: i % 7 === 0 ? 'failed' : 'success', duration_ms: 100, error_message: i % 7 === 0 ? 'e'.repeat(3000) : null, created_at: new Date().toISOString() }));

describe('a reflection is a summary', () => {
  const db = fakeDb({ agent_activity: activity, agent_skills: skills, agent_automations: automations, agent_objectives: objectives });

  it('answers counts and short lists — not the registry', async () => {
    const r = await handleReflect(db, {}) as Record<string, unknown>;
    const size = JSON.stringify(r).length;
    expect(size, `reflect answered ${size} characters`).toBeLessThan(12_000);
    expect(r.registered_skills).toBe(650);
    expect(r.skills).toBeUndefined();
    expect((r.automations as unknown[]).length).toBe(REFLECT_LIST_LIMIT);
    expect((r.objectives as unknown[]).length).toBe(REFLECT_LIST_LIMIT);
    expect(r.note).toMatch(/full: true/);
  });

  it('full: true is the way to every list', async () => {
    const r = await handleReflect(db, { full: true }) as Record<string, unknown>;
    expect((r.skills as unknown[]).length).toBe(650);
    expect((r.automations as unknown[]).length).toBe(30);
  });

  it('a failing skill\'s last error is a line, not a page', async () => {
    const r = await handleReflect(db, {}) as { skill_usage: Record<string, { last_error?: string }> };
    for (const s of Object.values(r.skill_usage)) expect((s.last_error ?? '').length).toBeLessThanOrEqual(200);
  });
});

describe('a reflection judges faults, not misses', () => {
  it('a NOT_FOUND or a refusal is not "fails frequently"', async () => {
    const rows = Array.from({ length: 6 }, () => ({ skill_name: 'comment_on_task', status: 'failed', code: 'NOT_FOUND', error_message: 'no task a498a636-8f75-4687-92f1-e5c14a3e218c', duration_ms: 50, created_at: new Date().toISOString() }));
    const real = Array.from({ length: 4 }, () => ({ skill_name: 'send_email', status: 'failed', code: 'HANDLER_ERROR', error_message: 'smtp 550', duration_ms: 50, created_at: new Date().toISOString() }));
    const db = fakeDb({ agent_activity: [...rows, ...real], agent_skills: [], agent_automations: [], agent_objectives: [] });
    const r = await handleReflect(db, {}) as { skill_usage: Record<string, { errors: number }>; suggestions: string[] };
    expect(r.skill_usage.comment_on_task.errors).toBe(0);
    expect(r.skill_usage.send_email.errors).toBe(4);
    expect(r.suggestions.join(' ')).not.toMatch(/comment_on_task" has \d+ failures/);
  });
});

describe('the heartbeat says what its instructions are made of', () => {
  it('its journal row carries the size of each part', () => {
    const src = readFileSync(join(process.cwd(), 'supabase/functions/flowpilot-heartbeat/index.ts'), 'utf8');
    expect(src).toMatch(/prompt_parts: promptParts/);
    for (const part of ['workspace', 'business_identity', 'memory', 'objectives', 'stats', 'protocol']) expect(src, part).toMatch(new RegExp(`${part}: len\\(`));
  });
});
