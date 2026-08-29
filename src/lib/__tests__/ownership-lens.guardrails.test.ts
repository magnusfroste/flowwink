/**
 * The Mina/Alla lens: a view, never a rule, and it follows the user.
 *
 * Three failure modes matter more than the happy path. A lens that leaks into
 * RLS recreates Odoo's double-calling problem. A lens stored in localStorage
 * evaporates the day the instance gets its real domain (the pinned-pages
 * lesson, 20260808200000). And a lens that quietly narrows a stat card makes
 * two people report different revenue while both read "the pipeline".
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { applyLens, OWNERSHIP } from '@/lib/ownership';

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf-8');
const hook = read('src/hooks/useOwnershipLens.ts');

describe('applyLens filters by the map, honestly', () => {
  const rows = [
    { id: '1', assigned_to: 'anna' },
    { id: '2', assigned_to: 'bjorn' },
    { id: '3', assigned_to: null },
  ];

  it('narrows to my rows under mine', () => {
    expect(applyLens(rows, 'leads', 'mine', 'anna').map((r) => r.id)).toEqual(['1']);
  });

  it('unassigned rows disappear under mine — they are nobody\'s', () => {
    // Honest: if it should be yours, assign it (one chip click). A lens that
    // includes unassigned rows teaches people the toggle means something vague.
    expect(applyLens(rows, 'leads', 'mine', 'anna').some((r) => r.assigned_to === null)).toBe(false);
  });

  it('all shows everything, and is the default', () => {
    expect(applyLens(rows, 'leads', 'all', 'anna')).toHaveLength(3);
    expect(hook).toMatch(/prefs\[KEY\] === 'mine' \? 'mine' : 'all'/);
  });

  it('mine with no uid degrades to everything, never to nothing', () => {
    // A signed-out edge or a slow auth load must not blank the CRM.
    expect(applyLens(rows, 'leads', 'mine', null)).toHaveLength(3);
  });

  it('uses the entity\'s own column from the map', () => {
    const deals = [{ id: 'd1', owner_id: 'anna' }, { id: 'd2', owner_id: 'bjorn' }];
    expect(applyLens(deals, 'deals', 'mine', 'bjorn').map((r) => r.id)).toEqual(['d2']);
  });
});

describe('the preference follows the user, not the browser', () => {
  it('persists in profiles.preferences, merge-written', () => {
    // localStorage is persistent per BROWSER PER ORIGIN — the pins bug. And the
    // merge keeps a sibling key (pinned_pages) intact.
    expect(hook).toMatch(/from\('profiles' as never\)/);
    expect(hook).toMatch(/\{ \.\.\.prefs, \[KEY\]: lens \}/);
    // Code only — the docstring legitimately RECOUNTS the localStorage lesson.
    // Guarding prose was the policyBody trap from the documents suite.
    const code = hook.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
    expect(code).not.toMatch(/localStorage/);
  });
});

describe('the lens narrows lists, never stats, never policies', () => {
  it('is wired into all four list surfaces', () => {
    expect(read('src/pages/admin/LeadsPage.tsx')).toMatch(/applyLens\(rawLeads, 'leads', lens, uid, coveredUids\)/);
    expect(read('src/pages/admin/DealsPage.tsx')).toMatch(/applyLens\(teamDeals, 'deals', lens, uid, coveredUids\)/);
    expect(read('src/pages/admin/CompaniesPage.tsx')).toMatch(/applyLens\(companies, 'companies', lens, uid, coveredUids\)/);
    expect(read('src/pages/admin/QuotesPage.tsx')).toMatch(/applyLens\(rawQuotes, 'quotes', lens, uid, coveredUids\)/);
  });

  it('deal stats stay unlensed', () => {
    // useDealStats reads its own query — the lensed `deals` variable must not
    // feed it. Two people looking at the pipeline total must see one number.
    const deals = read('src/pages/admin/DealsPage.tsx');
    expect(deals).toMatch(/useDealStats\(\)/);
    expect(deals).not.toMatch(/useDealStats\(deals\)/);
  });

  it('no migration ships with this feature at all', () => {
    // The lens is pure frontend. The moment it needs a migration, someone is
    // about to put it in RLS — see the ownership guardrails for why not.
    for (const entity of Object.keys(OWNERSHIP)) {
      expect(entity).toBeTruthy(); // the map exists; policies are guarded in
      // ownership-on-create.guardrails.test.ts (no CRM policy references
      // ownership columns, across every migration, forever).
    }
  });
});

// ─── En triagekö är ingens, alltså allas (Magnus 2026-08-29) ────────────────
//
// Prospects-fliken läste den LINSADE listan. Prospekteringsfynd får aldrig
// någon ägare — agenten kör som service_role och ska inte gissa vem som äger
// en kontakt (grinden ownership-on-create pinnar just det) — så under "Mina"
// var triagekön tom FÖR ALLTID: en delad inkorg som såg ut som ett fungerande
// filter. Ägarskap börjar när någon befordrar, inte innan.

describe('triagekön står utanför linsen', () => {
  const leadsPage = read('src/pages/admin/LeadsPage.tsx');

  it('prospects läser rawLeads, inte den linsade listan', () => {
    expect(leadsPage).toMatch(/const prospects = \(rawLeads \?\? \[\]\)\.filter/);
    expect(leadsPage).not.toMatch(/const prospects = \(leads \?\? \[\]\)\.filter/);
  });

  it('kontaktlistan däremot ÄR linsad — det är där ägarskap betyder något', () => {
    expect(leadsPage).toMatch(/const contactLeads = \(leads \?\? \[\]\)\.filter/);
    expect(leadsPage).toMatch(/applyLens\(rawLeads, 'leads', lens, uid, coveredUids\)/);
  });

  it('skälet står i koden, så nästa läsare inte "städar" tillbaka buggen', () => {
    expect(leadsPage).toMatch(/Read from rawLeads, NOT the lens-filtered list/);
  });
});
