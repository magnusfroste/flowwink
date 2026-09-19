import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Acquire-to-retire, procure-to-pay and plan-to-produce, process battery
 * 2026-09-19: the year-end depreciation proposal always proposed twelve months
 * of plan; straight-line never placed the öre integer division left over; a
 * residual value or a revaluation above cost was accepted; a vendor bill that
 * came before the last delivery became a false price variance and left the
 * interim account open; manufacturing labor raised the stock value but never
 * reached the ledger; and components bought for a confirmed MO were not held for it.
 */

const root = join(__dirname, '../../..');
const dir = join(root, 'supabase/migrations');
const read = (f: string) => readFileSync(join(dir, f), 'utf8');
const migrations = readdirSync(dir).filter((f) => f.endsWith('.sql')).sort().map(read).join('\n');

function latestFunctionBody(fnName: string): string {
  const re = new RegExp(`CREATE OR REPLACE FUNCTION public\\.${fnName}\\(`, 'g');
  let start = -1; let m: RegExpExecArray | null;
  while ((m = re.exec(migrations))) start = m.index;
  expect(start, `no migration defines ${fnName}`).toBeGreaterThan(-1);
  const ends = ['$function$;', '$fn$;'].map((e) => migrations.indexOf(e, start)).filter((x) => x > -1);
  return migrations.slice(start, Math.min(...ends));
}

describe('depreciation counts months', () => {
  it('the last month of a straight-line life takes what integer division left over', () => {
    const b = migrations.slice(migrations.lastIndexOf('CREATE OR REPLACE FUNCTION public.compute_monthly_depreciation(p_asset fixed_assets, p_period_date date)'));
    expect(b.slice(0, 2600)).toMatch(/v_elapsed_months \+ 1 >= GREATEST\(p_asset\.useful_life_months, 1\) THEN v_amount := v_remaining/);
  });
  it('the annual proposal is the plan for the months in service, minus what is already booked', () => {
    const b = latestFunctionBody('propose_annual_depreciation');
    expect(b).toMatch(/months_in_year/);
    expect(b).toMatch(/FROM public\.depreciation_entries de/);
    expect(b).toMatch(/planned_for_year - c\.booked_in_year, c\.remaining_cents/);
    expect(b).not.toMatch(/useful_life_months \* 12/); // the old "always twelve months"
  });
  it('a residual value or a revaluation above cost is refused', () => {
    const m = read('20260919210000_avskrivningen-raknar-manader.sql');
    expect(m).toMatch(/salvage_cents % must be between 0 and the cost/);
    expect(m).toMatch(/Cannot revalue above original cost/);
    expect(m).toMatch(/anchor missing in register_fixed_asset/);
    expect(m).toMatch(/anchor missing in revalue_fixed_asset/);
  });
});

describe('a bill clears against the ORDER, not against what happened to arrive first', () => {
  it('the room is the order\'s net value minus what earlier bills already took', () => {
    const m = read('20260919220000_fakturan-fore-leveransen.sql');
    expect(m).toMatch(/po\.subtotal_cents FROM public\.purchase_orders po/);
    expect(m).toMatch(/e2\.source = ''vendor_invoice'' AND l2\.account_code = v_grni/);
    expect(m).toMatch(/anchor missing in book_vendor_invoice/);
  });
});

describe('manufacturing reaches the books and keeps what it bought', () => {
  const m = read('20260919230000_tillverkningens-arbete-nar-bockerna.sql');
  it('labor is booked through roles, once per MO, and never fails the completion', () => {
    const b = latestFunctionBody('book_mo_labor');
    expect(b).toMatch(/source = 'mo_labor' AND reference_number = p_mo_id::text/);
    expect(b).toMatch(/account_for\('inventory'\)/);
    expect(b).toMatch(/account_for_or\('production_absorption', 'cogs'\)/);
    expect(b).not.toMatch(/'[0-9]{4}'/);
    expect(m).toMatch(/PERFORM public\.book_mo_labor\(p_mo_id, v_labor\);[\s\S]*EXCEPTION WHEN OTHERS THEN/);
  });
  it('a receipt on a PO raised for an MO reserves for that MO', () => {
    expect(m).toMatch(/source_type IN \(''manufacturing'', ''manufacturing_order''\)/);
    expect(latestFunctionBody('mo_reserve_missing')).toMatch(/v_mo\.status NOT IN \('confirmed', 'in_progress'\)/);
    expect(m).toMatch(/anchor missing in receive_purchase_order/);
    expect(m).toMatch(/anchor missing in complete_mo/);
  });
  it('the new role is seeded for the Swedish pack and left alone where it exists', () => {
    expect(m).toMatch(/'se-bas2024', 'production_absorption'[\s\S]*ON CONFLICT \(locale, role\) DO NOTHING/);
  });
});
