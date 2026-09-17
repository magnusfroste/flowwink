import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Manufacturing sees the stock (process sweep 2026-09-17).
 *
 * The MO functions read and wrote `product_stock` — a table nothing else
 * uses since the receiving path abandoned it. 100 screws on the shelf were
 * "0 on hand" for the MO, a completed MO moved no real stock, and the
 * finished good was valued at 0. Procurement crashed on a column that does
 * not exist. There is ONE stock model: stock_quants + stock_moves, with the
 * product mirror as fallback. This pins that no MO function reaches for the
 * dead table again, and the shapes that make a completed MO real.
 */

const repoRoot = resolve(__dirname, '../../..');
const migrationsDir = resolve(repoRoot, 'supabase/migrations');
const migrationSql = readdirSync(migrationsDir)
  .filter((f) => f.endsWith('.sql'))
  .sort()
  .map((f) => readFileSync(resolve(migrationsDir, f), 'utf-8'))
  .join('\n');

function latestFunctionBody(fnName: string): string {
  const marker = new RegExp(`CREATE OR REPLACE FUNCTION public\\.${fnName}\\(`, 'g');
  let start = -1;
  let m: RegExpExecArray | null;
  while ((m = marker.exec(migrationSql))) start = m.index;
  expect(start, `no migration defines ${fnName}`).toBeGreaterThan(-1);
  const ends = ['$function$;', '$fn$;'].map((e) => migrationSql.indexOf(e, start)).filter((x) => x > -1);
  return migrationSql.slice(start, Math.min(...ends));
}

const MO_FUNCTIONS = ['check_mo_availability', 'confirm_mo', 'complete_mo', 'cancel_mo', 'trigger_procurement_for_mo', 'mo_component_free'];

describe('manufacturing sees the stock', () => {
  it('no MO function reads or writes the dead product_stock table', () => {
    for (const fn of MO_FUNCTIONS) {
      expect(latestFunctionBody(fn), fn).not.toMatch(/product_stock\b/);
    }
  });

  it('availability comes from quants, less what others reserved', () => {
    const body = latestFunctionBody('mo_component_free');
    expect(body).toMatch(/FROM public\.stock_quants/);
    expect(body).toMatch(/stock_reservations/);
    expect(latestFunctionBody('check_mo_availability')).toMatch(/mo_component_free\(/);
  });

  it('confirm reserves, cancel releases, complete consumes the reservation', () => {
    expect(latestFunctionBody('confirm_mo')).toMatch(/reserve_stock\(/);
    expect(latestFunctionBody('cancel_mo')).toMatch(/mo_release_reservations\(p_mo_id, 'cancelled'\)/);
    expect(latestFunctionBody('complete_mo')).toMatch(/mo_release_reservations\(p_mo_id, 'consumed'\)/);
  });

  it('complete refuses open work orders and short components, consumes FEFO and values the finished good', () => {
    const body = latestFunctionBody('complete_mo');
    expect(body).toMatch(/work order\(s\) still open/);
    expect(body).toMatch(/Components short for MO/);
    expect(body).toMatch(/consume_stock_fefo\(/);
    expect(body).toMatch(/'mo_consumption'/);
    expect(body).toMatch(/'mo_production'/);
    expect(body).toMatch(/v_unit_cost := ROUND\(\(v_material \+ v_labor\) \/ v_qty\)/);
    expect(body).not.toMatch(/GREATEST\(quantity_on_hand/);
  });

  it('procurement joins the column that exists and reads the PO source', () => {
    const body = latestFunctionBody('trigger_procurement_for_mo');
    expect(body).toMatch(/pol\.purchase_order_id = po\.id/);
    expect(body).not.toMatch(/pol\.po_id/);
    expect(migrationSql).toMatch(/ALTER TABLE public\.purchase_orders ADD COLUMN IF NOT EXISTS source_type/);
  });

  it('work orders are never regenerated over recorded work', () => {
    const body = latestFunctionBody('generate_mo_work_orders');
    expect(body).toMatch(/regeneration would erase actual minutes/);
    expect(body).toMatch(/not regenerated/);
  });
});
