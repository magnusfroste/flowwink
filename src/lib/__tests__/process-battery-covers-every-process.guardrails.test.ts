import { describe, it, expect } from 'vitest';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * The parity matrix scored returns 100 %, payroll 100 % and pos 89 % the week
 * the process sweep (2026-09-17) found refunds above the order total, overtime
 * that never reached payroll and a till that never reached the books. A
 * scorecard says a capability exists; only a scenario that drives the process
 * end to end and reads the end state says it HOLDS.
 *
 * So every process doc carries a scenario in scripts/process-battery/. The list
 * is discovered from docs/processes/ — a new process doc without a scenario
 * fails here, and OWED may only shrink.
 */

const root = join(__dirname, '../../..');
const processes = readdirSync(join(root, 'docs/processes'))
  .filter((f) => f.endsWith('.md') && f !== 'README.md')
  .map((f) => f.replace(/\.md$/, ''))
  .sort();
const scenarioPath = (p: string) => join(root, 'scripts/process-battery/scenarios', `${p}.ts`);

/** Processes that still owe a scenario. Remove an entry when its scenario lands; never add one. */
const OWED: string[] = [];

describe('the process battery covers every process doc', () => {
  it('discovers the process docs', () => {
    expect(processes.length).toBeGreaterThanOrEqual(15);
  });

  it('every process has a scenario, or is owed by name', () => {
    const missing = processes.filter((p) => !existsSync(scenarioPath(p)));
    expect(missing.sort()).toEqual([...OWED].sort());
  });

  it('a scenario declares the process it drives and reads the end state back', () => {
    const thin: string[] = [];
    for (const p of processes.filter((x) => existsSync(scenarioPath(x)))) {
      const src = readFileSync(scenarioPath(p), 'utf8');
      if (!new RegExp(`process: '${p}'`).test(src)) thin.push(`${p}: does not declare process '${p}'`);
      // Reading the database back is the point: a scenario that only checks
      // that skills answered "success" is the scorecard again.
      if (!/\bs\.(sql|one|booksBalance)\s*(<[^>(]*>)?\(/.test(src)) thin.push(`${p}: never reads the end state from the database`);
    }
    expect(thin).toEqual([]);
  });

  it('the known-red list only shrinks', () => {
    // 99 on 2026-09-19, the day the battery first ran all fifteen processes.
    // Lower this number in the PR that fixes a finding; never raise it — a new
    // red check is a regression or a finding to fix, not a line to add.
    //   87 — security gates (webinar door, ticket clock, newsletter send gate)
    //   81 — contracts (signed content final, signing creates the service, send guard, quote link)
    //   67 — invoices + subscriptions (issued invoice final, payments booked as they arrive, proration)
    //   57 — orders + stock (one reservation per order, pick before ship, opening stock, move references)
    //   48 — books I (reports read the whole ledger, unknown accounts, repeated void, bank CSV)
    //   36 — booking (rules on the table: hours, blocked days, the past, overlap under a lock, status machine)
    //   26 — HR (vacation allocation, leave days + sick leave, hire guards + salary, payroll dates, HR verbs)
    //   11 — CRM + content (scheduled publishing, consent ⇄ subscriber, lead merge + letter case, deal lead, reply idempotency)
    //    3 — books II (depreciation months, bill before delivery, MO labor + reservation). Left: the mail rail.
    const known = JSON.parse(readFileSync(join(root, 'scripts/process-battery/known-red.json'), 'utf8')) as { checks: Record<string, string[]> };
    const total = Object.values(known.checks).flat().length;
    expect(total).toBeLessThanOrEqual(3);
    for (const p of Object.keys(known.checks)) expect(processes, `known-red names an unknown process: ${p}`).toContain(p);
  });

  it('the harness refuses a non-local target', () => {
    const lib = readFileSync(join(root, 'scripts/process-battery/lib.ts'), 'utf8');
    expect(lib).toMatch(/only runs against a local stack/);
    expect(lib).not.toMatch(/supabase\.co/);
  });
});
