import { describe, expect, it } from 'vitest';
import { calculateNextRun } from '../../../supabase/functions/_shared/cron/next-run';
import { isDueLocalHour } from '../../../supabase/functions/_shared/locale/local-hour-gate';

/**
 * Schedules run on the business's clock, not the runtime's UTC — and not on
 * the offset of whichever day the schedule was saved.
 */
describe('automation cron on the business clock', () => {
  it('reads "0 8 * * 1-5" as 08:00 Stockholm, summer and winter', () => {
    // Friday 2026-07-17 05:00Z → next 08:00 CEST is 06:00Z the same day.
    expect(calculateNextRun('0 8 * * 1-5', new Date('2026-07-17T05:00:00Z'), 'Europe/Stockholm')).toBe('2026-07-17T06:00:00.000Z');
    // After 08:00 local on a Friday → Monday 08:00 CEST.
    expect(calculateNextRun('0 8 * * 1-5', new Date('2026-07-17T07:00:00Z'), 'Europe/Stockholm')).toBe('2026-07-20T06:00:00.000Z');
    // Winter: 08:00 CET is 07:00Z.
    expect(calculateNextRun('0 8 * * *', new Date('2026-12-01T00:00:00Z'), 'Europe/Stockholm')).toBe('2026-12-01T07:00:00.000Z');
  });
  it('crosses a DST change on the new offset', () => {
    // Sat 24 Oct 2026 (CEST) 08:00 already passed → Sun 25 Oct is CET: 07:00Z.
    expect(calculateNextRun('0 8 * * *', new Date('2026-10-24T07:00:00Z'), 'Europe/Stockholm')).toBe('2026-10-25T07:00:00.000Z');
  });
  it('monthly on a local day', () => {
    expect(calculateNextRun('0 5 1 * *', new Date('2026-10-26T00:00:00Z'), 'Europe/Stockholm')).toBe('2026-11-01T04:00:00.000Z');
  });
  it('UTC or no zone keeps the old reading', () => {
    expect(calculateNextRun('0 7 * * *', new Date('2026-07-17T05:00:00Z'), 'UTC')).toBe('2026-07-17T07:00:00.000Z');
    expect(calculateNextRun('0 7 * * *', new Date('2026-07-17T05:00:00Z'))).toBe('2026-07-17T07:00:00.000Z');
  });
});

describe('local-hour gate for pg_cron jobs', () => {
  it('fires once per wanted local hour, whole- and half-hour zones alike', () => {
    // 22:00Z in July = 00:00 Stockholm.
    expect(isDueLocalHour([0, 12], 'Europe/Stockholm', new Date('2026-07-17T22:00:00Z'))).toBe(true);
    expect(isDueLocalHour([0, 12], 'Europe/Stockholm', new Date('2026-07-17T22:30:00Z'))).toBe(false);
    // Winter: 00:00 Stockholm is 23:00Z.
    expect(isDueLocalHour([0, 12], 'Europe/Stockholm', new Date('2026-12-01T23:00:00Z'))).toBe(true);
    expect(isDueLocalHour([0, 12], 'Europe/Stockholm', new Date('2026-12-01T22:00:00Z'))).toBe(false);
    // Kolkata (+05:30): 03:00 local is 21:30Z.
    expect(isDueLocalHour([3], 'Asia/Kolkata', new Date('2026-07-17T21:30:00Z'))).toBe(true);
    expect(isDueLocalHour([3], 'Asia/Kolkata', new Date('2026-07-17T22:00:00Z'))).toBe(false);
  });
});
