import { describe, expect, it } from 'vitest';
import { fiscalYearOf, fiscalYearRange } from '@/lib/fiscal-year';

/** The same cases the migration's proof asserts in SQL (20261026120000). */
describe('fiscal year — the key is the calendar year it ends in', () => {
  it('calendar years keep their own number', () => {
    expect(fiscalYearOf('2028-07-15', 1)).toBe(2028);
    expect(fiscalYearRange(2028, 1)).toMatchObject({ fromDate: '2028-01-01', toDate: '2028-12-31', label: '2028', months: 12 });
  });

  it('a July–June business: 15 July 2026 belongs to 2026/27', () => {
    expect(fiscalYearOf('2026-07-15', 7)).toBe(2027);
    expect(fiscalYearOf('2027-06-30', 7)).toBe(2027);
    expect(fiscalYearOf('2026-06-30', 7)).toBe(2026);
    expect(fiscalYearRange(2027, 7)).toEqual({ key: 2027, fromDate: '2026-07-01', toDate: '2027-06-30', label: '2026/27', months: 12 });
  });

  it('a short first year is an explicit row and wins; the derived year is clipped around it', () => {
    const explicit = [{ key: 2026, label: 'Startår 2026', date_from: '2026-01-01', date_to: '2026-06-30' }];
    expect(fiscalYearOf('2026-03-01', 7, explicit)).toBe(2026);
    expect(fiscalYearRange(2026, 7, explicit)).toMatchObject({ fromDate: '2026-01-01', toDate: '2026-06-30', label: 'Startår 2026', months: 6 });
    // the derived 2027 (July 2026 – June 2027) is untouched by it
    expect(fiscalYearRange(2027, 7, explicit)).toMatchObject({ fromDate: '2026-07-01', toDate: '2027-06-30' });
    // a derived year that an explicit one ends inside starts the day after
    expect(fiscalYearRange(2026, 1, explicit)).toMatchObject({ fromDate: '2026-01-01', toDate: '2026-06-30' });
    expect(fiscalYearRange(2027, 1, [{ key: 2026, date_from: '2026-05-01', date_to: '2026-12-31' }])).toMatchObject({ fromDate: '2027-01-01', toDate: '2027-12-31' });
  });

  it('a February start ends on the right last day', () => {
    expect(fiscalYearRange(2028, 3)).toMatchObject({ fromDate: '2027-03-01', toDate: '2028-02-29', months: 12 });
  });
});
