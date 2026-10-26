/**
 * Arithmetic on date-only values (YYYY-MM-DD) without a clock in the way.
 *
 * `new Date('2026-03-15')` is UTC midnight; `setMonth` then moves it on the
 * browser's local calendar and `toISOString()` reads it back in UTC — across a
 * DST change that loses a day (a 15 March start got a 14 September probation
 * end). Everything here works on the Y-M-D parts in UTC, so no zone can shift
 * the answer. "Today" comes from the business (`businessToday()` /
 * `useBusinessClock().today()`), never from here.
 */

function parts(ymd: string): [number, number, number] {
  const [y, m, d] = ymd.slice(0, 10).split('-').map(Number);
  return [y, m, d];
}

function fmt(dt: Date): string {
  return dt.toISOString().slice(0, 10);
}

/** ymd + n days. */
export function addDaysYmd(ymd: string, n: number): string {
  const [y, m, d] = parts(ymd);
  return fmt(new Date(Date.UTC(y, m - 1, d + n)));
}

/** ymd + n months, clamped to the target month's last day (31 Jan + 1 → 28/29 Feb). */
export function addMonthsYmd(ymd: string, n: number): string {
  const [y, m, d] = parts(ymd);
  const lastOfTarget = new Date(Date.UTC(y, m - 1 + n + 1, 0)).getUTCDate();
  return fmt(new Date(Date.UTC(y, m - 1 + n, Math.min(d, lastOfTarget))));
}

/** First and last day of the month that contains ymd. */
export function monthBoundsYmd(ymd: string): { first: string; last: string } {
  const [y, m] = parts(ymd);
  return { first: fmt(new Date(Date.UTC(y, m - 1, 1))), last: fmt(new Date(Date.UTC(y, m, 0))) };
}

/** A Date's own calendar day in the zone it was built in (a date picker's or a calendar view's local midnight). */
export function localYmd(dt: Date): string {
  const mm = String(dt.getMonth() + 1).padStart(2, '0');
  const dd = String(dt.getDate()).padStart(2, '0');
  return `${dt.getFullYear()}-${mm}-${dd}`;
}
