/**
 * The fiscal year, as the database defines it — a twin of fiscal_year_of /
 * fiscal_year_range / fiscal_year_label in 20261026120000, for the admin's
 * year picker and report headers (the same cases are pinned in
 * fiscal-year.test.ts and in the migration's proof).
 *
 * The KEY of a fiscal year is the calendar year it ENDS in (Skatteverket's
 * "beskattningsår", BFN's "2025/26"): a calendar year keeps its own number.
 * An explicit year (a row in fiscal_years — a short first year) wins; the
 * rest are derived from the start month in Accounting → Settings.
 */
export interface ExplicitFiscalYear {
  key: number;
  label?: string | null;
  date_from: string;
  date_to: string;
}

export interface FiscalYearRange {
  key: number;
  label: string;
  fromDate: string;
  toDate: string;
  /** Calendar months the year spans — 12, or fewer for a short year. */
  months: number;
}

const pad = (n: number) => String(n).padStart(2, '0');
const ymd = (y: number, m: number, d: number) => `${y}-${pad(m)}-${pad(d)}`;
/** Last day of month m (1–12) of year y, in UTC arithmetic. */
const lastDay = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).getUTCDate();

function monthsBetween(from: string, to: string): number {
  const [fy, fm] = from.split('-').map(Number);
  const [ty, tm] = to.split('-').map(Number);
  return (ty - fy) * 12 + tm - fm + 1;
}

/** The fiscal year (key) a date belongs to. */
export function fiscalYearOf(date: string, startMonth: number, explicit: readonly ExplicitFiscalYear[] = []): number {
  const d = date.slice(0, 10);
  const hit = explicit.find((f) => d >= f.date_from && d <= f.date_to);
  if (hit) return hit.key;
  const [y, m] = d.split('-').map(Number);
  if (!(startMonth > 1)) return y;
  return m >= startMonth ? y + 1 : y;
}

/** The dates of a fiscal year by key — the explicit row, else derived (clipped around explicit rows). */
export function fiscalYearRange(key: number, startMonth: number, explicit: readonly ExplicitFiscalYear[] = []): FiscalYearRange {
  const row = explicit.find((f) => f.key === key);
  if (row) {
    return {
      key, fromDate: row.date_from, toDate: row.date_to,
      label: row.label?.trim() || deriveLabel(key, row.date_from),
      months: monthsBetween(row.date_from, row.date_to),
    };
  }
  let fromDate: string;
  let toDate: string;
  if (!(startMonth > 1)) {
    fromDate = ymd(key, 1, 1);
    toDate = ymd(key, 12, 31);
  } else {
    fromDate = ymd(key - 1, startMonth, 1);
    const endMonth = startMonth - 1;
    toDate = ymd(key, endMonth, lastDay(key, endMonth));
  }
  // A derived year starts after the latest explicit year that ends inside it,
  // and ends before the earliest that starts inside it.
  const endsInside = explicit.filter((f) => f.date_to >= fromDate && f.date_to < toDate).map((f) => f.date_to).sort();
  if (endsInside.length) fromDate = addDays(endsInside[endsInside.length - 1], 1);
  const startsInside = explicit.filter((f) => f.date_from > fromDate && f.date_from <= toDate).map((f) => f.date_from).sort();
  if (startsInside.length) toDate = addDays(startsInside[0], -1);
  return { key, fromDate, toDate, label: deriveLabel(key, fromDate), months: monthsBetween(fromDate, toDate) };
}

function deriveLabel(key: number, fromDate: string): string {
  const startYear = Number(fromDate.slice(0, 4));
  return startYear === key ? String(key) : `${startYear}/${String(key).slice(-2)}`;
}

function addDays(date: string, n: number): string {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}
