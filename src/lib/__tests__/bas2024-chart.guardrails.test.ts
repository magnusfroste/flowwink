import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import official from '../../data/locale-sources/bas-2024-official.json';
import { BAS_2024_ACCOUNTS } from '../../data/bas2024-accounts';

/**
 * The chart of accounts must agree with the standard it is named after.
 *
 * src/data/bas2024-accounts.ts was headed "BAS 2024 Chart of Accounts" and was
 * written by hand: 269 accounts, no import, no source link, and nothing in the
 * repo that could disagree with it. Compared against the official workbook on
 * 2026-08-09:
 *
 *     63 correct · 166 wrong names · 40 account numbers not in BAS at all
 *
 * Not typos. Whole ranges are shifted by one position (1020–1070 each carry
 * their neighbour's name), 7510 "Avskrivning inventarier" is BAS's
 * "Arbetsgivaravgifter 31,42 %", and 1130 "Inventarier, verktyg och
 * installationer" is BAS's "Mark". That is the signature of writing a
 * plausible-looking chart from memory rather than transcribing one.
 *
 * It did damage before anyone compared: 2611 carrying 2614's name routed
 * ordinary VAT through a reverse-charge account in four expense templates, and
 * misled a careful reader into "correcting" a mapping that was right.
 *
 * THE DEVIATION LISTS BELOW MUST ONLY SHRINK. An account that newly disagrees
 * with BAS fails this test; fixing a listed one means deleting its code from the
 * list. Same shrinking-pending-list shape that carried the platform-format sweep
 * from 77 to 0 — it makes a large known problem bounded and impossible to
 * worsen, without demanding it be fixed in one sitting.
 */

type OfficialAccount = { name: string; core: boolean };
const BAS = official.accounts as Record<string, OfficialAccount>;

/** Names differ only in spacing, case and comma placement — BAS writes "25 %". */
const norm = (s: string) => s.toLowerCase().replace(/%/g, ' % ').replace(/[\s,]+/g, ' ').trim();

const ours = new Map(BAS_2024_ACCOUNTS.map((a) => [a.account_code, a.account_name]));

/** Accounts whose NAME still disagrees with BAS 2024. Only ever remove entries. */
const KNOWN_WRONG_NAME: string[] = [

];

/** Account numbers we ship that do not exist in BAS 2024. Only ever remove. */
const KNOWN_NOT_IN_BAS: string[] = [
  '1139', '1190', '1200', '1209', '1430', '1540', '2720', '3010', '3011', '3012', '3013', '3020',
  '3030', '3040', '3041', '3050', '3060', '3090', '3310', '3380', '4010', '4020', '4030', '4050',
  '4060', '4080', '4100', '4990', '5850', '5860', '7020', '7040', '7050', '7070', '7100', '7340',
  '7399', '7788', '8710', '8750',
];

describe('the artifact is the standard, not a copy of it', () => {
  it('carries its provenance — source, publisher and checksum', () => {
    expect(official._source).toContain('bas.se');
    expect(official._publisher).toBe('BAS-intressenternas Förening');
    expect(official._sha256).toMatch(/^[0-9a-f]{64}$/);
  });

  it('has the full standard, not a selection of it', () => {
    expect(official._count).toBe(1222);
    // BAS's own ■ marking: the accounts it says suffice for basic bookkeeping.
    expect(official._core_count).toBe(341);
  });

  it('says never to hand-edit it', () => {
    expect(official._note).toMatch(/never hand-edit/);
  });
});

describe('every account we ship exists in BAS 2024', () => {
  const absent = BAS_2024_ACCOUNTS
    .map((a) => a.account_code)
    .filter((c) => !(c in BAS))
    .filter((c) => !KNOWN_NOT_IN_BAS.includes(c));

  it('no NEW invented account numbers', () => {
    expect(absent, 'Account codes not in BAS 2024: ' + absent.join(', ')).toEqual([]);
  });

  it('the known-invented list only shrinks', () => {
    expect(KNOWN_NOT_IN_BAS.length).toBeLessThanOrEqual(40);
  });

  it('a listed code that now exists in BAS must be removed from the list', () => {
    const stale = KNOWN_NOT_IN_BAS.filter((c) => c in BAS);
    expect(stale, 'Now in BAS — delete from KNOWN_NOT_IN_BAS: ' + stale.join(', ')).toEqual([]);
  });
});

describe('every account name matches BAS 2024', () => {
  const mismatched = BAS_2024_ACCOUNTS
    .filter((a) => a.account_code in BAS)
    .filter((a) => norm(a.account_name) !== norm(BAS[a.account_code].name))
    .map((a) => a.account_code)
    .filter((c) => !KNOWN_WRONG_NAME.includes(c));

  it('no NEW divergent names', () => {
    const detail = mismatched
      .map((c) => c + ': ours "' + ours.get(c) + '" vs BAS "' + BAS[c].name + '"')
      .join('\n  ');
    expect(mismatched, 'Names disagreeing with BAS 2024:\n  ' + detail).toEqual([]);
  });

  it('the known-wrong list only shrinks', () => {
    expect(KNOWN_WRONG_NAME.length).toBeLessThanOrEqual(0);
  });

  it('a listed account that has been corrected must be removed from the list', () => {
    const stale = KNOWN_WRONG_NAME.filter((c) => {
      const mine = ours.get(c);
      return mine && c in BAS && norm(mine) === norm(BAS[c].name);
    });
    expect(stale, 'Fixed — delete from KNOWN_WRONG_NAME: ' + stale.join(', ')).toEqual([]);
  });
});

describe('the accounts the engine actually posts to are correct', () => {
  // Resolved through account_roles and reached by every invoice. Deliberately
  // outside the deviation lists: a wrong name here is not a cosmetic backlog
  // item, it is a misposting.
  const LOAD_BEARING = ['1510', '1930', '2611', '2614', '2615', '3001', '2641', '2440'];

  it.each(LOAD_BEARING)('%s matches BAS exactly', (code) => {
    expect(code in BAS, code + ' is not a BAS 2024 account').toBe(true);
    expect(norm(ours.get(code) ?? ''), code).toBe(norm(BAS[code].name));
  });

  it('2611 is domestic sales VAT and 2614 is reverse charge — never the other way round', () => {
    expect(BAS['2611'].name).toMatch(/försäljning inom Sverige/i);
    expect(BAS['2614'].name).toMatch(/omvänd skattskyldighet/i);
  });

  it('BAS splits 30xx by VAT RATE, not by goods vs services', () => {
    // The fabricated "Försäljning varor 25% moms" invented a distinction the
    // standard does not make — and that invention drove a wrong config change
    // before anyone checked.
    expect(BAS['3001'].name).toBe('Försäljning inom Sverige, 25 % moms');
    expect(BAS['3002'].name).toBe('Försäljning inom Sverige, 12 % moms');
    expect('3010' in BAS).toBe(false);
    expect('3041' in BAS).toBe(false);
  });
});

describe('the generator is reproducible', () => {
  it('exists and reads the committed workbook', () => {
    const gen = readFileSync(resolve(__dirname, '../../../scripts/bas-xlsx-to-json.py'), 'utf-8');
    expect(gen).toContain('Kontoplan-BAS-2024.xlsx');
    expect(gen).toContain('sha256');
    // A parse that silently returns too little must fail loudly rather than
    // write a truncated artifact over a good one.
    expect(gen).toMatch(/if len\(accounts\) < 1000/);
  });
});

describe('we ship the whole standard, and is_active says who uses it', () => {
  const shipped = new Map(BAS_2024_ACCOUNTS.map((a) => [a.account_code, a]));

  it('every BAS 2024 account is present — a missing one is a wall a migration hits', () => {
    // LiteIT's own history needed six perfectly ordinary BAS accounts we simply
    // had not shipped (1351, 1640, 2081, 2086, 2098, 8314). Reference data
    // should be complete; what varies per company is which accounts they USE.
    const missing = Object.keys(BAS).filter((c) => !shipped.has(c));
    expect(missing, `Not shipped: ${missing.slice(0, 20).join(', ')}`).toEqual([]);
    expect(shipped.size).toBe(Object.keys(BAS).length + KNOWN_NOT_IN_BAS.length);
  });

  it('is_active is "this company uses it", not "it exists"', () => {
    const active = BAS_2024_ACCOUNTS.filter((a) => (a as { is_active?: boolean }).is_active);
    // Every account BAS marks ■ starts active; the long tail ships dormant.
    const coreInactive = Object.entries(BAS)
      .filter(([c, v]) => (v as { core?: boolean }).core && !(shipped.get(c) as { is_active?: boolean })?.is_active)
      .map(([c]) => c);
    expect(coreInactive, `BAS core accounts shipped dormant: ${coreInactive.join(', ')}`).toEqual([]);
    expect(active.length).toBeGreaterThan(400);
    expect(active.length).toBeLessThan(shipped.size);   // a dormant tail must exist
  });

  it('is generated, so nobody hand-edits 1 262 rows back into drift', () => {
    const src = readFileSync(
      resolve(__dirname, '../../data/bas2024-accounts.ts'), 'utf-8');
    expect(src).toMatch(/GENERATED\. Do not hand-edit/);
    expect(src).toMatch(/scripts\/generate-bas2024-chart\.ts/);
  });

  it('posting to a dormant account activates it — otherwise it holds a balance nobody can see', () => {
    const handler = readFileSync(
      resolve(__dirname, '../../../supabase/functions/agent-execute/index.ts'), 'utf-8');
    expect(handler).toMatch(/Posting to an account activates it/);
    expect(handler).toMatch(/\.update\(\{ is_active: true \}\)\s*\n\s*\.in\('account_code', touched\)/);
  });

  it('the seeders carry the flag instead of forcing everything visible', () => {
    const sync = readFileSync(resolve(__dirname, '../../../scripts/sync-skills.ts'), 'utf-8');
    expect(sync).toMatch(/a\.is_active !== false/);
    const edge = readFileSync(
      resolve(__dirname, '../../../supabase/functions/agent-execute/index.ts'), 'utf-8');
    expect(edge).toMatch(/is_active: acc\.is_active !== false/);
  });
});
