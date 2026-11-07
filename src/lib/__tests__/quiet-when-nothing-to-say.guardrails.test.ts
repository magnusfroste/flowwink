/**
 * Quiet when there is nothing to say (2026-11-06). A fresh instance with
 * pages and blog was alarmed every morning: the briefing mailed "Quiet day"
 * with a yellow 50/100, counted leads, revenue, bookings and chat for modules
 * that were off, the operations check judged quotes, tickets and visits for
 * modules that were off, the books check accused the business of VAT returns
 * for periods before its books began, and the heartbeat carried an always-
 * active "weekly digest" objective that kept the idle short-circuit from ever
 * firing. Four rules keep that from coming back:
 *
 *   1. the briefing asks which modules are on before every section and
 *      action item, scores nothing without a signal, and on a day with no
 *      action item and no figure writes its row and sends nothing;
 *   2. check_operations judges an area only when its module is on
 *      (automations always) and says which areas it judged;
 *   3. check_books accuses nothing before books_started_on();
 *   4. the weekly digest is an automation, not a starter objective.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { FLOWPILOT_STARTER_OBJECTIVES } from '../../../supabase/functions/_shared/pilot/soul-defaults';

const read = (p: string) => readFileSync(p, 'utf8');
const briefing = read('supabase/functions/flowpilot-lifecycle/briefing.ts');
const migration = read('supabase/migrations/20261106150000_tyst-nar-det-inte-finns-nagot-att-saga.sql');

describe('the briefing', () => {
  it('reads the modules once and asks before every section and action item', () => {
    expect(read('supabase/functions/_shared/modules.ts')).toMatch(/export async function loadEnabledModules\(client: any\): Promise<\(moduleName: string\) => boolean>/);
    expect(briefing).toMatch(/const on = await loadEnabledModules\(supabase\);/);
    for (const m of ['analytics', 'leads', 'ecommerce', 'bookings', 'chat', 'newsletter', 'blog', 'paidGrowth', 'subscriptions']) {
      expect(briefing, m).toMatch(new RegExp(`on\\("${m}"\\)`));
    }
    expect(briefing).toMatch(/if \(pulseItems\.length > 0\) \{/);
    expect(briefing).toMatch(/if \(on\("leads"\) && newLeadsToday > 0\)/);
    expect(briefing).toMatch(/if \(on\("blog"\) && draftsReady > 0\)/);
    expect(briefing).toMatch(/if \(on\("subscriptions"\) && activeDunning\.length > 0\)/);
  });

  it('scores nothing without a signal, and the mail and chat say so instead of 50/100', () => {
    expect(briefing).toMatch(/let healthScore: number \| null = null;/);
    expect(briefing).toMatch(/const hasSignal = trafficWeek > 0 \|\| newLeadsWeek > 0/);
    expect(briefing).not.toMatch(/let healthScore = 50; \/\/ base/);
    expect(briefing.match(/healthScore === null \? "⚪"/g)?.length).toBe(2);
    expect(briefing).toMatch(/\$\{healthScore === null \? "" : ` — Health \$\{healthScore\}\/100`\}/);
  });

  it('writes the row and sends nothing on a day with nothing to tell', () => {
    expect(briefing).toMatch(/const worthTelling = actionItems\.length > 0 \|\| summaryParts\.length > 0;/);
    const after = briefing.slice(briefing.indexOf('if (!worthTelling) {'));
    expect(after).toMatch(/reason: "nothing_to_tell"/);
    // The quiet return comes after the row insert and before the report, the chat and the mail.
    expect(briefing.indexOf('.from("flowpilot_briefings")')).toBeLessThan(briefing.indexOf('if (!worthTelling) {'));
    expect(briefing.indexOf('if (!worthTelling) {')).toBeLessThan(briefing.indexOf("supabase.rpc('report_publish'"));
    expect(briefing.indexOf('if (!worthTelling) {')).toBeLessThan(briefing.indexOf('.from("chat_messages")'));
    expect(briefing.indexOf('if (!worthTelling) {')).toBeLessThan(briefing.indexOf('functions/v1/email-send'));
    // No admin yet: nothing to post to.
    expect(briefing).toMatch(/if \(!conversationId && !adminUserId\) \{/);
  });
});

describe('the operations and books checks', () => {
  it('check_operations judges an area only when its module is on, automations always, and says which', () => {
    for (const [mod] of [['quotes'], ['deals'], ['invoicing'], ['subscriptions'], ['contracts'], ['tickets'], ['fieldService'], ['chat']]) {
      expect(migration, mod).toMatch(new RegExp(`IF COALESCE\\(\\(v_modules -> '${mod}' ->> 'enabled'\\)::boolean, false\\)`));
    }
    expect(migration).toMatch(/-- ── Automations: judged by their schedule, never by the calendar — always ─\s+v_areas := array_append\(v_areas, 'automations'\);/);
    expect(migration).toMatch(/'areas', to_jsonb\(v_areas\),/);
    // Assignable people are only a finding where work is assigned.
    expect(migration).toMatch(/IF 'support' = ANY \(v_areas\) OR 'field_service' = ANY \(v_areas\) THEN/);
  });

  it('check_books accuses nothing before the books began', () => {
    expect(migration).toMatch(/CREATE OR REPLACE FUNCTION public\.books_started_on\(\)/);
    expect(migration).toMatch(/RETURN LEAST\(v_fy, v_je\);/);
    expect(migration).toMatch(/v_started date := public\.books_started_on\(\);/);
    expect(migration).toMatch(/WHERE x ->> 'status' = 'overdue' AND v_started IS NOT NULL AND \(x ->> 'period_to'\)::date >= v_started LOOP/);
    expect(migration).toMatch(/'No books yet — the filing calendar starts with the first fiscal year/);
    expect(migration).toMatch(/'books_started_on', v_started,/);
    // Proof, rolled back.
    expect(migration).toMatch(/proof: tickets off, yet a ticket finding/);
    expect(migration).toMatch(/proof: start should read the earliest fiscal year/);
  });
});

describe('the heartbeat', () => {
  it('has no starter objective for the weekly digest — it is an automation — so the idle short-circuit can fire', () => {
    expect(FLOWPILOT_STARTER_OBJECTIVES.some((o) => /weekly digest/i.test(o.goal))).toBe(false);
    expect(read('src/data/flowpilotDefaults.ts')).not.toMatch(/weekly_digest_active/);
    expect(migration).toMatch(/UPDATE public\.agent_objectives\s+SET status = 'completed'\s+WHERE goal = 'Set up weekly digest/);
    // The automations that carry the digest exist.
    expect(read('src/lib/modules/reports-module.ts')).toMatch(/name: 'Weekly digest report'/);
    expect(read('src/lib/modules/flowpilot-module.ts') + read('src/data/flowpilotDefaults.ts')).toMatch(/Weekly Business Digest/);
  });
});
