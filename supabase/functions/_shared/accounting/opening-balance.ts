/**
 * The opening balance of a report window — one rule for every reader.
 *
 * UB blir IB: an account's opening balance is the bridge (the opening balances
 * of the FIRST year the books carry, stored once in `opening_balances`) plus
 * everything posted after it, as `opening_balances_for_year()` derives it. A
 * later year's balance is never stored and never read from the table.
 *
 * The admin views went over to that rule in August (20260810230000). The agent
 * report kept reading `opening_balances` for the selected year, so a year with
 * no stored row opened at zero: on a live instance (2026-11-08) the agent saw
 * the bank account at the year's movement alone, concluded the opening balance
 * was missing, and booked the whole of the previous year's closing balance as a
 * voucher on the first day of the year — every balance-sheet account twice.
 */

import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { readAllRows } from '../read-all-rows.ts';

type Db = SupabaseClient;

export interface FiscalYearOf {
  fiscal_year: number;
  /** First day of that fiscal year, YYYY-MM-DD. */
  date_from: string;
}

/** First day of fiscal year `year` (the key: the calendar year it ends in). */
export async function fiscalYearStart(supabase: Db, year: number): Promise<string> {
  const { data: range, error } = await supabase.rpc('fiscal_year_range', { p_key: year });
  if (error) throw new Error(`Fiscal year ${year} could not be resolved: ${error.message}`);
  const row = Array.isArray(range) ? range[0] : range;
  return String(row?.date_from ?? `${year}-01-01`).slice(0, 10);
}

export async function fiscalYearOf(supabase: Db, date: string): Promise<FiscalYearOf> {
  const day = date.slice(0, 10);
  const { data: fy, error } = await supabase.rpc('fiscal_year_of', { p_date: day });
  const fiscal_year = Number(!error && fy != null ? fy : day.slice(0, 4));
  return { fiscal_year, date_from: await fiscalYearStart(supabase, fiscal_year) };
}

/**
 * Each account's balance at the START of `windowStart` (YYYY-MM-DD), signed
 * against the debit side: the derived opening balance of its fiscal year plus
 * what was posted between the year's first day and the window. Only
 * balance-sheet accounts carry one; the caller applies it to those.
 */
export async function openingBalancesAt(supabase: Db, windowStart: string): Promise<Map<string, number>> {
  const start = windowStart.slice(0, 10);
  const { fiscal_year, date_from } = await fiscalYearOf(supabase, start);
  const out = new Map<string, number>();

  const { data: ib, error } = await supabase.rpc('opening_balances_for_year', { p_year: fiscal_year });
  if (error) throw new Error(`Opening balances for ${fiscal_year} could not be derived: ${error.message}`);
  for (const r of (ib ?? []) as Array<{ account_code: string; net_cents: number }>) {
    out.set(r.account_code, Number(r.net_cents || 0));
  }

  // A window that starts inside the year opens at the year's opening balance
  // plus the year so far.
  if (start > date_from) {
    type Line = { account_code: string; debit_cents: number | null; credit_cents: number | null };
    type Filterable<Q> = { eq: (c: string, v: unknown) => Q; gte: (c: string, v: unknown) => Q; lt: (c: string, v: unknown) => Q };
    const read = await readAllRows<Line>(supabase, 'journal_entry_lines', {
      columns: 'id, account_code, debit_cents, credit_cents, journal_entries!inner(entry_date, status)',
      orderBy: 'id',
      pageSize: 1000,
      maxPages: 500,
      filter: <Q extends Filterable<Q>>(q: Q) => q
        .eq('journal_entries.status', 'posted')
        .gte('journal_entries.entry_date', date_from)
        .lt('journal_entries.entry_date', start),
    });
    if (read.error || read.truncated) {
      throw new Error(`Opening balances at ${start} could not be derived: ${read.error ?? 'the year so far is longer than one read'}`);
    }
    for (const l of read.rows) {
      out.set(l.account_code, (out.get(l.account_code) ?? 0) + Number(l.debit_cents || 0) - Number(l.credit_cents || 0));
    }
  }
  return out;
}
