import { describe, it, expect } from 'vitest';
import { parseBankCsv, parseAmountToCents, detectDelimiter, splitCsvLine } from '../../../supabase/functions/_shared/reconciliation/bank-csv';

/**
 * The bank CSV parser split every line on comma, semicolon and tab at once. A
 * Swedish export (semicolons, decimal comma) read `1234,50` as 1 234,00 kr with
 * the reference "50", and importing the same file twice doubled every line
 * because the row id carried the import batch (process battery, 2026-09-19).
 */

describe('amounts, in both conventions', () => {
  it.each([
    ['1234,50', 123450],
    ['1 234,50', 123450],
    ['1.234,50', 123450],
    ['1,234.50', 123450],
    ['1234.5', 123450],
    ['-500,00', -50000],
    ['(1 234,50)', -123450],
    ['500,00-', -50000],
    ['1 234,50 kr', 123450],
    ['12,345', 1234500], // three digits after the only comma: thousands, not decimals
    ['1.234.567', 123456700],
    ['0,05', 5],
    ['1362', 136200],
  ])('%s → %i', (raw, cents) => {
    expect(parseAmountToCents(raw)).toBe(cents);
  });

  it.each(['', 'abc', '12,34,56x', undefined])('%s is not an amount', (raw) => {
    expect(parseAmountToCents(raw as string | undefined)).toBeNull();
  });
});

describe('one delimiter per file', () => {
  it('a semicolon file keeps its decimal commas', () => {
    expect(detectDelimiter('Datum;Belopp;Referens')).toBe(';');
    const { transactions } = parseBankCsv('Datum;Belopp;Referens;Text\n2026-06-03;1234,50;SV-123;Kundbetalning\n2026-06-04;-500,00;LEV-9;Hyra');
    expect(transactions.map((t) => [t.transaction_date, t.amount_cents, t.reference, t.description])).toEqual([
      ['2026-06-03', 123450, 'SV-123', 'Kundbetalning'],
      ['2026-06-04', -50000, 'LEV-9', 'Hyra'],
    ]);
  });

  it('a comma file still works, and quoted fields may contain the delimiter', () => {
    expect(detectDelimiter('date,amount,reference')).toBe(',');
    expect(splitCsvLine('2026-06-03,"1,234.50","ACME, Inc."', ',')).toEqual(['2026-06-03', '1,234.50', 'ACME, Inc.']);
    const { transactions } = parseBankCsv('date,amount,reference,counterparty\n2026-06-03,"1,234.50",INV-1,"ACME, Inc."');
    expect(transactions[0]).toMatchObject({ amount_cents: 123450, reference: 'INV-1', counterparty: 'ACME, Inc.' });
  });

  it('a tab file is read as tabs', () => {
    const tab = String.fromCharCode(9);
    const { transactions } = parseBankCsv(`Datum${tab}Belopp${tab}Referens\n2026-06-03${tab}99,90${tab}R-1`);
    expect(transactions[0]).toMatchObject({ amount_cents: 9990, reference: 'R-1' });
  });

  it('needs a date and an amount column', () => {
    expect(() => parseBankCsv('foo;bar\n1;2')).toThrow(/date \+ amount/);
  });
});

describe('the same file imported twice is the same rows', () => {
  const file = 'Datum;Belopp;Referens\n2026-06-03;100,00;A\n2026-06-03;100,00;A\n2026-06-04;100,00;B';

  it('ids come from the row, never from the import', () => {
    const first = parseBankCsv(file).transactions.map((t) => t.external_id);
    const second = parseBankCsv(file).transactions.map((t) => t.external_id);
    expect(second).toEqual(first);
    for (const id of first) expect(id).toMatch(/^csv:[0-9a-f]{16}:\d+$/);
  });

  it('two identical payments on one day stay two', () => {
    const ids = parseBankCsv(file).transactions.map((t) => t.external_id);
    expect(new Set(ids).size).toBe(3);
    expect(ids[0].replace(/:\d+$/, '')).toBe(ids[1].replace(/:\d+$/, ''));
    expect(ids[0]).not.toBe(ids[1]);
  });

  it('the importer keeps the parser\'s id and lets the unique key skip the duplicate', async () => {
    const { readFileSync } = await import('node:fs');
    const { join } = await import('node:path');
    const handler = readFileSync(join(__dirname, '../../../supabase/functions/_shared/handlers/reconciliation.ts'), 'utf8');
    expect(handler).toMatch(/return parseBankCsv\(content\);/);
    expect(handler).toMatch(/external_id: tx\.external_id \|\|/);
    expect(handler).toMatch(/onConflict: "source,external_id", ignoreDuplicates: true/);
  });
});
