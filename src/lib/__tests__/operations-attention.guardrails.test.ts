import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PLATFORM_SKILLS } from '../platform-seeds';

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8');

/**
 * Hermes' first morning on Nordbrygg (2026-10-25) was seven reads and three
 * misjudgements. Operations gets the one read the books have had since
 * check_books: findings with fix.skill + args, and the people work can go to.
 */
describe('check_operations — the operations twin of check_books', () => {
  const sql = read('supabase/migrations/20261027170000_driften-far-sin-uppmarksamhetslista.sql');
  it('is a read-only definer with a declared audience and a fix pointer on every finding that has one', () => {
    expect(sql).toMatch(/CREATE OR REPLACE FUNCTION public\.check_operations\(p_as_of date DEFAULT public\.platform_today\(\)\)/);
    expect(sql).toMatch(/LANGUAGE plpgsql STABLE SECURITY DEFINER/);
    expect(sql).toMatch(/GRANT EXECUTE ON FUNCTION public\.check_operations\(date\) TO authenticated, service_role/);
    for (const id of ['quotes_without_expiry', 'invoices_without_due_date', 'contracts_awaiting_renewal_decision', 'urgent_tickets_unassigned', 'service_orders_unscheduled', 'automations_overdue', 'chat_cannot_act', 'no_assignable_staff']) {
      expect(sql, id).toContain(`'id', '${id}'`);
    }
    expect(sql.match(/'fix', jsonb_build_object\('skill', '/g)!.length).toBeGreaterThanOrEqual(12);
    expect(sql).toMatch(/'assignable', v_assignable/);
  });
  it('is seeded as a platform skill (module-independent), read-only, with instructions', () => {
    const seed = PLATFORM_SKILLS.find((s) => s.name === 'check_operations');
    expect(seed).toBeTruthy();
    expect(seed!.handler).toBe('rpc:check_operations');
    expect(seed!.tool_definition).toMatchObject({ risk: 'low' });
    expect(String(seed!.instructions)).toMatch(/assignable/);
    expect(String(seed!.description)).toMatch(/NOT for: the books \(check_books\)/);
  });
  it('the briefing carries the same list', () => {
    const b = read('supabase/functions/flowpilot-lifecycle/briefing.ts');
    expect(b).toMatch(/supabase\.rpc\("check_operations"\)/);
    expect(b).toMatch(/title: "🧭 Operations", type: "operations"/);
  });
});

describe('a renewal window has an answer', () => {
  it('manage_contract decide_renewal records it and the radar lists decided contracts apart', () => {
    const src = read('supabase/functions/agent-execute/index.ts');
    expect(src).toMatch(/action === 'decide_renewal'/);
    expect(src).toMatch(/\['renew', 'terminate', 'renegotiate'\]\.includes\(d\)/);
    expect(src).toMatch(/if \(c\.renewal_decision && !include_decided\) \{ decided\.push/);
    const seed = read('src/lib/modules/contracts-module.ts');
    expect(seed).toMatch(/enum: \['create', 'list', 'update', 'search', 'decide_renewal'\]/);
    expect(seed).toMatch(/include_decided/);
    const sql = read('supabase/migrations/20261027170000_driften-far-sin-uppmarksamhetslista.sql');
    expect(sql).toMatch(/ADD COLUMN IF NOT EXISTS renewal_decision text/);
    expect(sql).toMatch(/renewal_decision IS NULL OR renewal_decision IN \('renew', 'terminate', 'renegotiate'\)/);
  });
});

describe('manage_site_settings update merges', () => {
  it('flipping one flag never wipes the rest of an object setting', () => {
    const src = read('supabase/functions/agent-execute/index.ts');
    expect(src).toMatch(/nextValue = \{ \.\.\.\(cur\.value as Record<string, unknown>\), \.\.\.\(value as Record<string, unknown>\) \}/);
    expect(src).toMatch(/\.upsert\(\{ key, value: nextValue \}, \{ onConflict: 'key' \}\)/);
    const seed = PLATFORM_SKILLS.find((s) => s.name === 'manage_site_settings')!;
    expect(String(seed.description)).toMatch(/MERGES/);
    expect(JSON.stringify(seed.tool_definition)).toMatch(/"replace"/);
  });
});
