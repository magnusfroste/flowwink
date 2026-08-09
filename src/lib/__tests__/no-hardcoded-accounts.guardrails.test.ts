import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { resolve, join, relative } from 'node:path';

/**
 * The lines in the ice must be drawn in roles, not in account numbers.
 *
 * FlowWink posts through account_for(role) — the engine never names an account
 * when it books. That was the first half. The second half was classification:
 * the VAT return carried 55 BAS account numbers in SE_VAT_BOXES_2026 and summed
 * by matching against them, so a company arriving with its own chart had its VAT
 * silently missing from a statutory filing. That map is now data
 * (account_tax_boxes), seeded verbatim from the pack.
 *
 * This test is what stops the next one appearing. A hardcoded account number in
 * engine code is not a bug on the day it is written — it works perfectly for
 * every instance that happens to use the standard chart, and fails silently for
 * the ones that do not. That is precisely the shape that survives review.
 *
 * DATA is allowed to name accounts. The chart, the locale pack, the seeded box
 * map, the posting templates — all of those ARE account numbers, and saying so
 * is their job. ENGINE code is not.
 */

const ROOT = resolve(__dirname, '../../..');

/** Files whose whole purpose is to carry account numbers as data. */
const DATA_FILES = [
  'src/data/bas2024-accounts.ts',
  'src/data/templates-bas2024.ts',
  'src/data/locale-sources/',
  'src/lib/locale-packs/',
  'supabase/functions/_shared/locale/se-vat-boxes.ts',
  'supabase/functions/agent-execute/_locale-packs.json',
  'supabase/functions/agent-execute/_templates.json',
];

/**
 * Migrations are how DATA gets in. A migration naming account numbers is
 * seeding, which is the correct place. The engine is the runtime.
 */
const ENGINE_DIRS = [
  'supabase/functions/_shared/handlers',
  'supabase/functions/_shared/pilot',
  'src/hooks',
  'src/lib/reconciliation',
];

/** Known remaining offenders. This list may only SHRINK. */
const KNOWN: Record<string, string> = {
  // None. The VAT box map was the last one, and it moved to account_tax_boxes
  // on 2026-08-09. A new entry here needs a reason a reviewer would accept.
};

function walk(dir: string, out: string[] = []): string[] {
  let entries: string[];
  try { entries = readdirSync(dir); } catch { return out; }
  for (const e of entries) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.tsx?$/.test(p) && !/\.test\.tsx?$/.test(p)) out.push(p);
  }
  return out;
}

/**
 * A 4-digit BAS-shaped literal in quotes. Deliberately narrow: bare numbers,
 * years, cents amounts and ids are not account codes, and a matcher that flags
 * them would be turned off within a week.
 */
const ACCOUNT_LITERAL = /['"`](1[0-9]{3}|2[0-9]{3}|[3-8][0-9]{3})['"`]/g;

/** Lines a reviewer would not call a hardcoded account. */
function isExempt(line: string): boolean {
  const t = line.trim();
  if (t.startsWith('//') || t.startsWith('*') || t.startsWith('/*')) return true;
  // A trailing comment is prose too — "// e.g. '1930'" is documentation, and
  // flagging it teaches people to stop documenting.
  const code = line.split('//')[0];
  if (!/['"`]/.test(code)) return true;
  // Status codes, ports, timeouts, years, versions and pixel sizes read the
  // same as an account number. A matcher that flags them gets switched off.
  if (/status|port|timeout|Duration|width|height|year|Year|version|\bms\b|px/i.test(code)) return true;
  return false;
}

describe('engine code never names an account number', () => {
  const offenders: Array<{ file: string; line: number; text: string }> = [];

  for (const dir of ENGINE_DIRS) {
    for (const file of walk(join(ROOT, dir))) {
      const rel = relative(ROOT, file);
      if (DATA_FILES.some((d) => rel.startsWith(d))) continue;
      const lines = readFileSync(file, 'utf-8').split('\n');
      lines.forEach((line, i) => {
        if (isExempt(line)) return;
        ACCOUNT_LITERAL.lastIndex = 0;
        if (ACCOUNT_LITERAL.test(line.split('//')[0])) {
          offenders.push({ file: rel, line: i + 1, text: line.trim().slice(0, 110) });
        }
      });
    }
  }

  it('finds none that are not already known', () => {
    const fresh = offenders.filter((o) => !KNOWN[`${o.file}:${o.line}`]);
    const detail = fresh.map((o) => `  ${o.file}:${o.line}\n    ${o.text}`).join('\n');
    expect(fresh, fresh.length
      ? `Hardcoded account number(s) in engine code:\n${detail}\n\n` +
        'Resolve it through account_for(role) for posting, or account_tax_boxes ' +
        'for classification. A hardcoded account works for every instance on the ' +
        'standard chart and silently fails for every migrated one.'
      : '').toEqual([]);
  });

  it('the known-offender list may only shrink', () => {
    expect(Object.keys(KNOWN).length).toBeLessThanOrEqual(0);
  });

  it('the detector actually detects — a matcher that finds nothing proves nothing', () => {
    // Negative control: the box map file, which legitimately IS account data.
    const boxMap = readFileSync(join(ROOT, 'supabase/functions/_shared/locale/se-vat-boxes.ts'), 'utf-8');
    ACCOUNT_LITERAL.lastIndex = 0;
    expect(ACCOUNT_LITERAL.test(boxMap)).toBe(true);
  });
});

describe('the VAT box map is read from the instance, not from the engine', () => {
  const handler = readFileSync(
    join(ROOT, 'supabase/functions/_shared/handlers/accounting-vat-return-se.ts'), 'utf-8');
  const migration = readFileSync(
    join(ROOT, 'supabase/migrations/20260809190000_vat-box-map-as-account-property.sql'), 'utf-8');

  it('the handler queries account_tax_boxes', () => {
    expect(handler).toMatch(/\.from\('account_tax_boxes'\)/);
    expect(handler).toMatch(/const accountsFor = \(b: BoxDef\)/);
  });

  it('and falls back to the pack rather than filing zeroes mid-deploy', () => {
    expect(handler).toMatch(/mapSource = 'locale pack \(account_tax_boxes not seeded on this instance\)'/);
    expect(handler).toMatch(/keeps filing correctly rather\s+\/\/ than filing zeroes/);
  });

  it('the response says which map it used — a filing must not hide its own basis', () => {
    expect(handler).toMatch(/box_map_source: mapSource/);
  });

  it('the seed is verbatim from the pack, so day one behaves identically', () => {
    // Not a spot-check. A spot-check is exactly what let boxes 30/31/32 fall out
    // of the first seed: the extractor's pattern required code, label and kind
    // on one line, those three wrap, and 2614-2635 ended up in no box at all —
    // reverse-charge VAT silently absent from a statutory filing. Comparing the
    // whole pack against the whole seed is the only version that cannot miss.
    const pack = readFileSync(
      join(ROOT, 'supabase/functions/_shared/locale/se-vat-boxes.ts'), 'utf-8');

    // One segment per box, ending where the next box begins — box 05 is derived
    // and lists no accounts, and a pattern that runs past it would silently
    // credit it with box 20's.
    const expected = new Set<string>();
    const segments = pack.split(/(?=\bcode:\s*'\d+')/).slice(1);
    for (const seg of segments) {
      const box = seg.match(/^code:\s*'(\d+)'/)![1];
      const accounts = seg.match(/accounts:\s*\[([^\]]*)\]/);
      if (!accounts) continue;
      for (const acc of accounts[1].matchAll(/'(\d{4})'/g)) expected.add(`${box}:${acc[1]}`);
    }
    // The negative control for the extractor itself — a pattern that matches
    // nothing would make this test pass vacuously.
    expect(expected.size).toBeGreaterThan(50);

    const seeded = new Set<string>();
    for (const row of migration.matchAll(/\('se-bas2024', '(\d+)', '(\d{4})'\)/g)) {
      seeded.add(`${row[1]}:${row[2]}`);
    }

    const missing = [...expected].filter((k) => !seeded.has(k)).sort();
    const extra = [...seeded].filter((k) => !expected.has(k)).sort();
    expect({ missing, extra }).toEqual({ missing: [], extra: [] });
  });

  it('derived and computed boxes stay in the form, not in per-instance data', () => {
    // Box 05 derives from 10/11/12 and box 49 is arithmetic over boxes. Those
    // are the FORM, not properties of any account.
    expect(migration).toMatch(/Derived boxes \(05 from 10\/11\/12\) and the\s*--\s*computed box 49 stay in the box definition/);
    expect(migration).not.toMatch(/'se-bas2024', '05',/);
    expect(migration).not.toMatch(/'se-bas2024', '49',/);
  });
});

describe('an account carrying money and belonging to no box is reported, not dropped', () => {
  const migration = readFileSync(
    join(ROOT, 'supabase/migrations/20260809190000_vat-box-map-as-account-property.sql'), 'utf-8');
  const refined = readFileSync(
    join(ROOT, 'supabase/migrations/20260809200000_vat-coverage-prefixes-from-the-map.sql'), 'utf-8');
  const statusFix = readFileSync(
    join(ROOT, 'supabase/migrations/20260809230000_vat-coverage-counts-what-the-return-counts.sql'), 'utf-8');

  it('vat_box_coverage names the gap in the operator\'s own words', () => {
    expect(migration).toMatch(/CREATE OR REPLACE FUNCTION public\.vat_box_coverage/);
    expect(migration).toMatch(/belong to NO box on the return/);
    expect(migration).toMatch(/simply absent from the filing, with no error anywhere/);
  });

  it('only flags accounts that could plausibly belong on the return', () => {
    // A wage account with no VAT box is correct, not a gap. Listing it would
    // train the reader to ignore the list.
    expect(migration).toMatch(/A wage account\s*--\s*with no box is correct, not a gap/);
  });

  it('and reads WHICH accounts those are from the map, not from a hardcoded range', () => {
    // Running the chain against optic flagged 3001 (revenue) as a gap. True as
    // a fact, wrong as a warning: SKV 4700 derives the sales base from the VAT
    // boxes and never sums revenue accounts. A warning that fires on a correct
    // book teaches the reader to skip the list — and the real gap arrives in a
    // list nobody reads any more.
    expect(refined).toMatch(/SELECT array_agg\(DISTINCT left\(account_code, 2\)\)/);
    expect(refined).toMatch(/left\(m\.account_code, 2\) = ANY\(v_groups\)/);
    // Body only — the header quotes the old filter to explain what changed.
    const body = refined.slice(refined.indexOf('AS $function$'));
    expect(body).not.toMatch(/account_code LIKE/);
    // Same principle as the box map itself: the engine does not know what BAS is.
    expect(refined).toMatch(/the engine does not know what BAS is/);
  });

  it('an instance with no map says coverage is UNCHECKED rather than complete', () => {
    // Empty map + "complete: true" would be the worst answer available: a clean
    // bill of health computed from nothing.
    expect(refined).toMatch(/'checked', false/);
    expect(refined).toMatch(/every account is equally unclassified/);
  });

  it('counts the same entries the return counts', () => {
    // Found end-to-end on dev: the filter said status <> 'void', and this
    // platform writes 'voided'. The comparison was therefore always true and
    // excluded nothing, while the return sums status = 'posted' only — so an
    // account whose only movement was on a REVERSED entry was reported as a gap
    // on books that are correct.
    //
    // A near-miss literal fails open and silently: no error, no type mismatch,
    // just a filter that quietly matches everything. Stated positively, the two
    // halves of the filing can only agree.
    const handler = readFileSync(
      join(ROOT, 'supabase/functions/_shared/handlers/accounting-vat-return-se.ts'), 'utf-8');
    expect(handler).toMatch(/\.eq\('journal_entries\.status', 'posted'\)/);
    expect(statusFix).toMatch(/AND e\.status = 'posted'/);
    const body = statusFix.slice(statusFix.indexOf('AS $function$'));
    expect(body).not.toMatch(/<> 'void'/);
  });

  it('and says so plainly when coverage is complete', () => {
    expect(migration).toMatch(/Every account that moved and could belong on the return is in a box/);
  });
});
