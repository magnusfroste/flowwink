import { describe, expect, it, beforeEach } from 'vitest';
import { addDaysYmd, addMonthsYmd, localYmd, monthBoundsYmd } from '@/lib/calendar-date';
import { formatTotals, mergeTotals, sumByCurrency } from '@/lib/currency-totals';
import { setHomeCurrency } from '@/lib/platform-fallbacks';

describe('calendar-date — date-only arithmetic no zone can shift', () => {
  it('adds months across a DST change without losing a day', () => {
    // The HR bug: new Date('2026-03-15') + setMonth(+6) → toISOString → 2026-09-14.
    expect(addMonthsYmd('2026-03-15', 6)).toBe('2026-09-15');
  });
  it('clamps to the last day of a shorter month', () => {
    expect(addMonthsYmd('2026-01-31', 1)).toBe('2026-02-28');
    expect(addMonthsYmd('2028-01-31', 1)).toBe('2028-02-29');
    expect(addMonthsYmd('2026-03-31', -1)).toBe('2026-02-28');
  });
  it('adds days across month and year ends', () => {
    expect(addDaysYmd('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDaysYmd('2026-03-01', -1)).toBe('2026-02-28');
  });
  it('gives a month its first and last day', () => {
    expect(monthBoundsYmd('2026-02-14')).toEqual({ first: '2026-02-01', last: '2026-02-28' });
  });
  it('reads a local midnight as its own day, not the UTC one', () => {
    expect(localYmd(new Date(2026, 9, 1))).toBe('2026-10-01');
  });
});

describe('currency-totals — amounts in different currencies never add', () => {
  beforeEach(() => setHomeCurrency('SEK'));
  const fmt = (minor: number, cur?: string | null) => `${minor / 100} ${cur}`;

  it('keeps one sum per currency; a row without one is the business’s', () => {
    const t = sumByCurrency(
      [{ v: 100000, c: 'SEK' }, { v: 30000, c: 'EUR' }, { v: 50000, c: null }],
      (r) => r.v,
      (r) => r.c,
    );
    expect(Object.fromEntries(t)).toEqual({ SEK: 150000, EUR: 30000 });
    expect(formatTotals(t, fmt)).toBe('1500 SEK + 300 EUR');
  });
  it('prints the home currency first and zero when empty', () => {
    expect(formatTotals(new Map([['EUR', 100], ['SEK', 200]]), fmt)).toBe('2 SEK + 1 EUR');
    expect(formatTotals(new Map(), fmt)).toBe('0 SEK');
  });
  it('merges per-row totals', () => {
    const m = mergeTotals([new Map([['SEK', 1]]), new Map([['SEK', 2], ['NOK', 5]])]);
    expect(Object.fromEntries(m)).toEqual({ SEK: 3, NOK: 5 });
  });
});
