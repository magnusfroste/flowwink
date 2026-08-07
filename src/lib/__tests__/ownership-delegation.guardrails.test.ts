/**
 * Coverage is a statement about people, not an edit of a thousand rows.
 *
 * "Anna täcker för Björn, 1–15 aug" is ONE row. The lens includes covered
 * owners' records for the duration; ownership columns never move; "active" is
 * a date predicate so nothing expires anything. HubSpot and Odoo both answer
 * this with mass reassignment — move the records, remember to move them back,
 * discover in September what was forgotten.
 *
 * Proven live on optic in a rolled-back transaction: an active window matches,
 * an expired one does not, self-coverage is rejected by CHECK, and the
 * covering colleague cannot grant themselves coverage (RLS, 42501) — reach is
 * taken from no one and given by the owner.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { applyLens } from '@/lib/ownership';

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf-8');
const sql = read('supabase/migrations/20260808330000_ownership-delegations.sql');
const hook = read('src/hooks/useOwnershipLens.ts');
const chip = read('src/components/admin/OwnerChip.tsx');
const dialog = read('src/components/admin/CoverageDialog.tsx');

describe('the arrangement is time-boxed by predicate, not by machinery', () => {
  it('has a window CHECK and no cron anywhere', () => {
    expect(sql).toMatch(/CONSTRAINT ownership_delegations_window CHECK \(ends_on >= starts_on\)/);
    // The moment a scheduled job appears in this feature, "ends by itself"
    // has become "ends when the job runs" — a different, worse promise.
    expect(sql).not.toMatch(/cron\.schedule/i);
  });

  it('the active query is a date-range predicate', () => {
    expect(hook).toMatch(/\.lte\('starts_on', today\)/);
    expect(hook).toMatch(/\.gte\('ends_on', today\)/);
  });

  it('rejects covering yourself', () => {
    expect(sql).toMatch(/CONSTRAINT ownership_delegations_not_self CHECK \(from_user <> to_user\)/);
  });
});

describe('coverage is given, never taken', () => {
  it('only the covered person or an admin writes', () => {
    // Verified live: the covering colleague inserting their own coverage was
    // rejected with 42501. Without this, coverage would be a self-service
    // reach-expander.
    const policy = sql.slice(sql.indexOf('CREATE POLICY "The covered person or an admin manages coverage"'));
    const body = policy.slice(0, policy.indexOf(';')).replace(/--[^\n]*/g, '');
    expect(body).toMatch(/from_user = auth\.uid\(\) OR public\.has_role\(auth\.uid\(\), 'admin'/);
    expect(body).toMatch(/WITH CHECK/);
    // The first negative test slipped through here: sabotaging only USING left
    // WITH CHECK matching the positive pattern. The property that must hold is
    // stronger — to_user grants nothing, in either clause.
    expect(body).not.toMatch(/to_user\s*=\s*auth\.uid\(\)/);
  });

  it('is readable by every colleague — who covers whom is office-level truth', () => {
    const policy = sql.slice(sql.indexOf('CREATE POLICY "Coverage is visible to colleagues"'));
    expect(policy.slice(0, policy.indexOf(';'))).toMatch(/FOR SELECT\s*\n?\s*TO authenticated\s*\n?\s*USING \(true\)/);
  });

  it('cascades with its people — a delegation is a pointer, not history', () => {
    // The 20260808290000 distinction: CASCADE for personal artifacts, SET
    // NULL/detach for business records. A contract outlives its author; an
    // arrangement between two people does not outlive either of them.
    expect(sql).toMatch(/from_user uuid NOT NULL REFERENCES auth\.users\(id\) ON DELETE CASCADE/);
    expect(sql).toMatch(/to_user uuid NOT NULL REFERENCES auth\.users\(id\) ON DELETE CASCADE/);
  });
});

describe('the lens grows and shrinks, ownership never moves', () => {
  const rows = [
    { id: '1', assigned_to: 'anna' },
    { id: '2', assigned_to: 'bjorn' },
    { id: '3', assigned_to: 'cesar' },
  ];

  it('mine includes owners I cover', () => {
    expect(applyLens(rows, 'leads', 'mine', 'anna', ['bjorn']).map((r) => r.id)).toEqual(['1', '2']);
  });

  it('mine shrinks back when the coverage list empties', () => {
    // The exact moment ends_on passes, the active query stops returning the
    // row and this becomes the call — no cleanup made that happen.
    expect(applyLens(rows, 'leads', 'mine', 'anna', []).map((r) => r.id)).toEqual(['1']);
  });

  it('all is unaffected by coverage', () => {
    expect(applyLens(rows, 'leads', 'all', 'anna', ['bjorn'])).toHaveLength(3);
  });

  it('all four pages pass coveredUids through', () => {
    for (const [page, call] of [
      ['src/pages/admin/LeadsPage.tsx', /applyLens\(rawLeads, 'leads', lens, uid, coveredUids\)/],
      ['src/pages/admin/DealsPage.tsx', /applyLens\(teamDeals, 'deals', lens, uid, coveredUids\)/],
      ['src/pages/admin/CompaniesPage.tsx', /applyLens\(companies, 'companies', lens, uid, coveredUids\)/],
      ['src/pages/admin/QuotesPage.tsx', /applyLens\(rawQuotes, 'quotes', lens, uid, coveredUids\)/],
    ] as const) {
      expect(read(page), page).toMatch(call);
    }
  });
});

describe('transparency over substitution', () => {
  it('the chip keeps showing the owner, with a coverage hint', () => {
    // A silently swapped name would hide exactly the fact colleagues need —
    // who actually holds the account.
    expect(chip).toMatch(/covered by \$\{coverer\.full_name \|\| coverer\.email\}/);
    expect(chip).toMatch(/d\.from_user === ownerId/);
  });

  it('the dialog deletes only own or admin coverage in the UI', () => {
    // RLS enforces it regardless; the UI must not offer buttons that always
    // fail — that is how people learn not to trust the controls.
    expect(dialog).toMatch(/d\.from_user === user\?\.id \|\| isAdmin/);
  });

  it('the toggle announces how many colleagues I carry', () => {
    expect(read('src/components/admin/LensToggle.tsx')).toMatch(/Mine\{coveredUids\.length > 0 \? ` \(\+\$\{coveredUids\.length\}\)` : ''\}/);
  });
});
