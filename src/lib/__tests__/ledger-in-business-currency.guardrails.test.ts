import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = join(__dirname, '../../..');
const read = (p: string) => readFileSync(join(root, p), 'utf8');

/**
 * The sales side of the ledger converts to the business's currency
 * (docs/architecture/locale-and-formatting.md §3b). The SQL proof runs on every
 * install; these pin the shape so a later rewrite cannot drop it silently — the
 * way the June realised-FX booking was dropped by the partial-payment rewrite.
 */
describe('the ledger is in the business currency', () => {
  const sql = read('supabase/migrations/20261026100000_forsaljningen-bokfors-i-bolagets-valuta.sql');

  it('issue and payment multiply by the rate, and a missing rate is refused', () => {
    expect(sql).toMatch(/v_total := round\(v_total \* v_rate\)::bigint;/);
    expect(sql).toMatch(/v_bank := round\(v_amount \* v_rate_pay\)/);
    expect(sql).toMatch(/No exchange rate %s → %s/);
    // get_exchange_rate: no COALESCE(v_rate, 1) any more
    const getRate = sql.slice(sql.indexOf('FUNCTION public.get_exchange_rate'), sql.indexOf('-- ── 3.'));
    expect(getRate).not.toMatch(/COALESCE\(v_rate, 1\)/);
    expect(getRate).toMatch(/RAISE EXCEPTION 'No exchange rate/);
  });

  it('realised exchange difference goes to fx_gain / fx_loss', () => {
    expect(sql).toMatch(/account_for_or\('fx_gain', 'rounding_variance'\)/);
    expect(sql).toMatch(/account_for_or\('fx_loss', 'rounding_variance'\)/);
  });

  it('the calendar rewrite only touches a COLUMN, never a parameter like p_paid_at', () => {
    const cal = read('supabase/migrations/20261026020000_foretagets-kalender-i-databasen.sql');
    // \m before the optional alias: `p_paid_at::date` has no word start before paid_at
    expect(cal).toMatch(/\(\\m\(\?:\[A-Za-z_\]\+\\\.\)\?paid_at\)::date/);
    expect(cal).toMatch(/\(\\m\(\?:\[A-Za-z_\]\+\\\.\)\?\(\?:created_at\|updated_at\|closed_at\)\)::date/);
    // and the repair for instances that already took the broken one
    expect(sql).toMatch(/\(\\1_\\2 AT TIME ZONE public\.business_timezone\(\)\)::date/);
  });

  it('the purchase side converts the same way', () => {
    const ap = read('supabase/migrations/20261026110000_inkopen-bokfors-i-bolagets-valuta.sql');
    expect(ap).toMatch(/v_rate := public\.vendor_invoice_book_rate\(v_inv\);/);
    expect(ap).toMatch(/v_ap_b\s+:= round\(v_pay \* v_rate_issue\)/);
    expect(ap).toMatch(/v_bank_b := round\(v_pay \* v_rate_pay\)/);
    expect(ap).toMatch(/account_for_or\('fx_gain', 'rounding_variance'\)/);
    // silence about the currency means the order's, then the vendor's — not the business's
    expect(ap).toMatch(/ALTER COLUMN currency DROP DEFAULT/);
    expect(ap).toMatch(/SELECT currency INTO v_from FROM public\.vendors/);
  });

  it('the PDF states the VAT in the business currency on a foreign invoice', () => {
    expect(read('supabase/functions/generate-invoice-pdf/index.ts')).toMatch(/VAT in \$\{homeRow\.currency\}/);
  });
});
