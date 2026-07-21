import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { BAS_2024_ACCOUNTS } from '@/data/bas2024-accounts';

/**
 * Guardrail: an install must never run with a chart of accounts that the
 * bookkeeping RPCs post outside of.
 *
 * Live finding (demo clean install, 2026-07-20): chart_of_accounts held FIVE
 * rows — exactly the ones two migrations happen to INSERT ad hoc for their own
 * needs. Meanwhile mark_expense_report_paid, dispose_fixed_asset and the
 * payroll bank posting hardcode 1930/2890/3970/7970 as defaults. Account 1930
 * was present in journal_entry_lines (from fixed_asset_register) but absent
 * from the chart, so the balance sheet could not classify it and reported
 * balanced:false.
 *
 * The data was never missing — src/data/bas2024-accounts.ts has ~250 accounts
 * and the SE pack points at them. The SEEDING was unreachable:
 * topUpLocalePackSeeds() runs from useTenantLocalePack(), which was mounted
 * only on Accounting → Settings and the Locale Packs page. "Boot-time top-up"
 * in practice meant "if an admin happens to open one of two pages".
 *
 * Two properties are locked here. Both are cheap; neither was checked before.
 */

const root = process.cwd();

/** Every account code a migration hardcodes as an RPC parameter DEFAULT. */
function hardcodedDefaultAccounts(): Map<string, string[]> {
  const dir = join(root, 'supabase/migrations');
  const found = new Map<string, string[]>();
  for (const f of readdirSync(dir).filter((x) => x.endsWith('.sql'))) {
    // The frozen historical dump is not ours to police.
    if (f === '00000000000000_baseline.sql') continue;
    const sql = readFileSync(join(dir, f), 'utf8');
    // p_bank_account text DEFAULT '1930'  /  DEFAULT '1930'::text
    for (const m of sql.matchAll(/DEFAULT\s+'(\d{4})'(?:::text)?/g)) {
      const code = m[1];
      found.set(code, [...(found.get(code) ?? []), f]);
    }
  }
  return found;
}

describe('chart of accounts', () => {
  const codes = new Set(BAS_2024_ACCOUNTS.map((a) => a.account_code));

  it('the SE pack ships a real chart, not a handful of accounts', () => {
    // 5 rows on a fresh install is the failure this test exists for.
    expect(BAS_2024_ACCOUNTS.length).toBeGreaterThan(100);
  });

  it('every account an RPC defaults to exists in the seeded chart', () => {
    const missing: string[] = [];
    for (const [code, files] of hardcodedDefaultAccounts()) {
      if (!codes.has(code)) missing.push(`${code} (${files.join(', ')})`);
    }
    expect(
      missing,
      'these RPC default accounts are not in BAS_2024_ACCOUNTS — bookkeeping ' +
        'would post to an account the balance sheet cannot classify',
    ).toEqual([]);
  });

  it('the seed runs for every admin session, not just the accounting pages', () => {
    // The bug was reachability, so pin the mount point rather than the seeding
    // logic (which was correct all along).
    const layout = readFileSync(join(root, 'src/components/admin/AdminLayout.tsx'), 'utf8');
    expect(layout).toContain('useLocalePackBootstrap');

    const hook = readFileSync(join(root, 'src/hooks/useTenantLocalePack.ts'), 'utf8');
    expect(hook).toMatch(/export function useLocalePackBootstrap/);
    // A swallowed warn is invisible in production; this failure must not be.
    expect(hook).toMatch(/logger\.error\('\[locale-pack\] boot top-up failed'/);
  });

  it('chart rows carry the fields the balance sheet classifies on', () => {
    // A row without account_type is what produced balanced:false.
    const bad = BAS_2024_ACCOUNTS.filter(
      (a) => !a.account_code || !a.account_type || !a.normal_balance,
    );
    expect(bad.map((a) => a.account_code)).toEqual([]);
  });
});
