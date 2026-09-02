import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { scanHandRolledRolePolicies } from '../../../scripts/lib/scan-hand-rolled-role-policies.mjs';

const ROOT = resolve(__dirname, '../../..');
const BASELINE: Record<string, number> = JSON.parse(
  readFileSync(resolve(ROOT, 'src/lib/__tests__/fixtures/hand-rolled-role-policies-baseline.json'), 'utf-8'),
);

/**
 * Matrisen är enda ratten — så en policy får inte räkna upp roller för hand.
 *
 * `has_role(auth.uid(), 'sales')` i en policy är en andra ratt bredvid
 * role_module_access. Vrider operatören matrisen (sales får analytics) öppnas
 * navet men datan förblir stängd, utan felrad någonstans — klassen
 * "frånvarande effekt" (analytics, 2026-09-02). Talet får bara sjunka; en ny
 * migration som räknar upp roller fäller grinden med filnamnet. Admin räknas
 * inte — det är matrisens egen flyktväg. Discover, don't enumerate.
 */
describe('inga nya handrullade rollistor i policies', () => {
  const current = scanHandRolledRolePolicies(ROOT) as Record<string, number>;

  it('ingen migration har fler handrullade rollreferenser än sin baslinje', () => {
    const grown = Object.entries(current)
      .filter(([file, n]) => n > (BASELINE[file] ?? 0))
      .map(([file, n]) => `${file}: ${n}, baslinjen tillåter ${BASELINE[file] ?? 0}`);
    expect(
      grown,
      "En ny policy namnger roller för hand. Gata på public.can_access_module(auth.uid(), '<modul>') "
      + 'i stället — då följer datan matrisen precis som navet.\n'
      + 'Har du i stället FÄRRE: uppdatera fixtures/hand-rolled-role-policies-baseline.json.',
    ).toEqual([]);
  });
});
