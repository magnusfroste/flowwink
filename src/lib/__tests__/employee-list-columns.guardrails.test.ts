import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Den utfällda raden måste spänna över alla kolumner.
 *
 * En ny kolumn läggs till i rubrikraden och i cellraden — colSpan:et längre ned
 * glöms, och den utfällda panelen slutar en kolumn för tidigt. Det syns bara
 * som en tom ruta i kanten, alltså precis den sorts fel ingen rapporterar.
 * Vakten räknar rubrikerna i stället för att lita på minnet.
 */
describe('personallistans kolumner', () => {
  it('colSpan matchar antalet kolumner', () => {
    const src = readFileSync(
      resolve(__dirname, '../../components/admin/hr/EmployeeList.tsx'),
      'utf8',
    );
    const heads = src.match(/<TableHead[\s>]/g) ?? [];
    const span = src.match(/colSpan=\{(\d+)\}/);
    expect(heads.length, 'hittade inga kolumnrubriker').toBeGreaterThan(3);
    expect(span, 'hittade inget colSpan').not.toBeNull();
    expect(
      Number(span![1]),
      `colSpan är ${span![1]} men tabellen har ${heads.length} kolumner`,
    ).toBe(heads.length);
  });
});
