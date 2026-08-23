import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * The stock chain: receipt → quant → products.stock_quantity → reorder → order.
 *
 * A goods receipt of 100 units returned success while the balance stayed at 0.
 * Every link had its own way of doing nothing quietly: a seed lost in the
 * baseline squash, a write to an empty legacy table, a NULL location shrugged
 * off, a lookup joined to the wrong id, a clamp that erased an oversell. These
 * pin the fixes so the chain cannot go silent again.
 */

const migrationsDir = resolve(__dirname, '../../../supabase/migrations');
const read = (f: string) => readFileSync(resolve(migrationsDir, f), 'utf-8');

const seedLocations = read('20260820210001_stock-locations-are-platform-config.sql');
const receipts = read('20260820210002_receipts-reach-the-quants.sql');
const inboundCost = read('20260820210003_inbound-cost-follows-the-receipt.sql');
const stockEvents = read('20260820210004_stock-events-mirror-without-a-location.sql');
const oversell = read('20260820210005_overselling-is-refused.sql');
const reorder = read('20260820210006_reorder-reads-the-products-table.sql');

const agentExecute = readFileSync(
  resolve(__dirname, '../../../supabase/functions/agent-execute/index.ts'),
  'utf-8',
);
const productsModule = readFileSync(
  resolve(__dirname, '../modules/products-module.ts'),
  'utf-8',
);

describe('stock locations are seeded, not assumed', () => {
  it('ships a re-assertable seed FUNCTION, not a one-shot INSERT', () => {
    expect(seedLocations).toMatch(/CREATE OR REPLACE FUNCTION public\.seed_stock_locations\(\)/);
    expect(seedLocations).toMatch(/SELECT public\.seed_stock_locations\(\);/);
  });

  it('carries the canonical set the archived April migration seeded', () => {
    for (const code of ['WH/MAIN', 'WH/TRANSIT', 'WH/SCRAP', 'WH/VENDORS', 'WH/CUSTOMERS', 'WH/PRODUCTION']) {
      expect(seedLocations).toContain(code);
    }
  });

  it('leaves an operated instance alone — it only tops up a missing type', () => {
    // The rule from the role-defaults seed: defaults are asserted, live data is
    // filled only where it is absent, so operator customisation survives.
    expect(seedLocations).toMatch(/CONTINUE WHEN v_had_any AND EXISTS/);
    // Never overwrite an existing row's code/name/type — the only thing a
    // re-run may change is bringing a deactivated canonical row back.
    expect(seedLocations).toMatch(/ON CONFLICT \(code\) DO UPDATE SET is_active = true[\s\S]{0,120}WHERE stock_locations\.is_active = false/);
  });
});

describe('a receipt reaches the balance', () => {
  it('receive_purchase_order books a quant, not just a move', () => {
    const fn = receipts.slice(receipts.indexOf('FUNCTION public.receive_purchase_order'));
    expect(fn).toMatch(/apply_goods_receipt_stock/);
  });

  it('receive_purchase_order no longer writes the empty legacy table', () => {
    const fn = receipts.slice(receipts.indexOf('FUNCTION public.receive_purchase_order'));
    const code = fn.split('\n').filter((l) => !l.trim().startsWith('--')).join('\n');
    expect(code).not.toMatch(/UPDATE\s+product_stock/i);
  });

  it('receiving without a warehouse raises instead of succeeding emptily', () => {
    const fn = receipts.slice(receipts.indexOf('FUNCTION public.receive_purchase_order'));
    expect(fn).toMatch(/IF v_to_loc IS NULL OR v_vendor_loc IS NULL THEN[\s\S]{0,400}RAISE EXCEPTION/);
    expect(receipts).toMatch(/RAISE EXCEPTION 'No active internal stock location exists/);
  });

  it('apply_goods_receipt_stock moves the products.stock_quantity mirror', () => {
    const fn = receipts.slice(receipts.indexOf('FUNCTION public.apply_goods_receipt_stock'));
    expect(fn).toMatch(/upsert_stock_quant/);
    expect(fn).toMatch(/UPDATE public\.products[\s\S]{0,200}stock_quantity = COALESCE\(stock_quantity, 0\) \+ p_quantity/);
  });

  it('the quant upsert has an index to conflict on', () => {
    // ON CONFLICT (…) WHERE lot_id IS NULL needs a matching PARTIAL UNIQUE
    // index. Without it the statement raises — which is what silently killed
    // the stock.movement path.
    expect(receipts).toMatch(/CREATE UNIQUE INDEX IF NOT EXISTS stock_quants_product_location_nolot_uq[\s\S]{0,200}WHERE lot_id IS NULL/);
    expect(receipts).toMatch(/CREATE UNIQUE INDEX IF NOT EXISTS stock_quants_product_location_lot_uq[\s\S]{0,200}WHERE lot_id IS NOT NULL/);
  });
});

describe('the inbound cost lookup follows the right id', () => {
  it("a goods_receipt reference joins through goods_receipts to the PO", () => {
    expect(inboundCost).toMatch(/FROM goods_receipts gr[\s\S]{0,300}JOIN purchase_order_lines pol[\s\S]{0,200}pol\.purchase_order_id = gr\.purchase_order_id/);
    expect(inboundCost).toMatch(/WHERE gr\.id = v_ref/);
  });

  it('stops swallowing the failure that hid it', () => {
    const body = inboundCost.slice(inboundCost.indexOf('FUNCTION public.resolve_inbound_unit_cost'));
    expect(body).not.toMatch(/EXCEPTION WHEN others THEN v_cost := NULL/);
    expect(body).toMatch(/RAISE WARNING 'resolve_inbound_unit_cost:/);
  });
});

describe('a stock event mirrors even without a location', () => {
  it('the products mirror runs before the location is required', () => {
    const fn = stockEvents.slice(stockEvents.indexOf('FUNCTION public.apply_stock_movement_event'));
    const mirror = fn.indexOf('UPDATE public.products');
    const bail = fn.indexOf('IF v_location_id IS NULL THEN\n    RAISE WARNING');
    expect(mirror).toBeGreaterThan(-1);
    expect(bail).toBeGreaterThan(-1);
    expect(mirror).toBeLessThan(bail); // mirror first, THEN give up on the quant
  });

  it('the traceability move uses the columns stock_moves actually has', () => {
    const fn = stockEvents.slice(stockEvents.indexOf('FUNCTION public.apply_stock_movement_event'));
    expect(fn).toMatch(/from_location_id, to_location_id/);
    expect(fn).not.toMatch(/source_location_id|destination_location_id/);
  });

  it('a failed stock event lands on agent_events.last_error, not in a NOTICE', () => {
    const fn = stockEvents.slice(stockEvents.indexOf('FUNCTION public.handle_stock_movement_event'));
    expect(fn).toMatch(/UPDATE public\.agent_events[\s\S]{0,200}SET last_error/);
  });
});

describe('overselling is refused, backorders are honest', () => {
  it('a BEFORE INSERT guard covers every order_items writer', () => {
    expect(oversell).toMatch(/CREATE TRIGGER trg_order_item_stock_guard\s+BEFORE INSERT ON public\.order_items/);
  });

  it('the refusal names the available quantity', () => {
    expect(oversell).toMatch(/RAISE EXCEPTION 'Insufficient stock for "%": % requested, % available/);
  });

  it('only non-backorderable tracked products are refused', () => {
    const fn = oversell.slice(oversell.indexOf('FUNCTION public.trigger_order_item_stock_guard'));
    expect(fn).toMatch(/IF NOT v_p\.track_inventory OR v_p\.stock_quantity IS NULL OR v_p\.allow_backorder THEN\s+RETURN NEW;/);
  });

  it('the decrement no longer erases the shortfall with GREATEST(…, 0)', () => {
    const fn = oversell
      .slice(oversell.indexOf('FUNCTION public.trigger_order_item_stock_decrement'))
      .split('\n').filter((l) => !l.trim().startsWith('--')).join('\n');
    expect(fn).not.toMatch(/GREATEST\(/);
    expect(fn).toMatch(/stock_quantity = COALESCE\(stock_quantity, 0\) - NEW\.quantity/);
    expect(fn).toMatch(/upsert_stock_quant/);
  });

  it('the decrement drops the empty legacy table', () => {
    const fn = oversell.slice(oversell.indexOf('FUNCTION public.trigger_order_item_stock_decrement'));
    expect(fn).not.toMatch(/product_stock/);
  });
});

describe('the reorder loop reads the table that has the numbers', () => {
  it('the 2026-08-20 fix moved candidates off the empty product_stock', () => {
    // Historical: this is what that migration did. Superseded by
    // 20260827400000, where on-hand stops being the whole answer — see
    // replenishment-one-engine.guardrails.test.ts.
    expect(reorder).toMatch(/FROM public\.products p\s+LEFT JOIN public\.product_stock ps/);
    expect(reorder).toMatch(/COALESCE\(ps\.quantity_on_hand, p\.stock_quantity, 0\)/);
  });

  it('purchase_reorder_check no longer skips every product without a legacy row', () => {
    const handler = agentExecute.slice(agentExecute.indexOf("if (skillName === 'purchase_reorder_check')"));
    const body = handler.slice(0, handler.indexOf('low_stock_items: []'));
    expect(body).not.toMatch(/if \(!stock\) continue;/);
    // It no longer reads any stock table itself — it asks the one engine,
    // which reads the quants and counts what is already on order.
    expect(body).toMatch(/supabase\.rpc\('list_reorder_candidates'/);
    expect(body).not.toMatch(/from\('product_stock'\)/);
  });
});

describe('an agent can move stock without leaving a hole in the ledger', () => {
  it('update_stock writes an adjustment move for the difference', () => {
    const handler = agentExecute.slice(agentExecute.indexOf("if (action === 'update_stock' && product_id)"));
    const body = handler.slice(0, handler.indexOf("if (action === 'low_stock_alerts')"));
    expect(body).toMatch(/move_type: 'adjustment'/);
    expect(body).toMatch(/adjustment = Number\(quantity\) - Number\(before\.stock_quantity \?\? 0\)/);
    expect(body).toMatch(/manual adjustment via agent/);
  });

  it('a product can be born stocked', () => {
    const handler = agentExecute.slice(agentExecute.indexOf('// manage_product — original CRUD'));
    const body = handler.slice(
      handler.indexOf("if (action === 'create')"),
      handler.indexOf("if (action === 'update')"),
    );
    for (const field of ['track_inventory', 'low_stock_threshold', 'allow_backorder', 'stock_quantity', 'barcode', 'cost_cents', 'category_id']) {
      expect(body).toContain(field);
    }
  });

  it('manage_product declares the inventory fields it now accepts', () => {
    const seed = productsModule.slice(
      productsModule.indexOf("name: 'manage_product'"),
      productsModule.indexOf("name: 'manage_variant'"),
    );
    for (const field of ['track_inventory', 'low_stock_threshold', 'allow_backorder', 'stock_quantity', 'cost_cents', 'category_id']) {
      expect(seed).toContain(`${field}:`);
    }
  });

  it('manage_inventory declares the adjustment reason', () => {
    const seed = productsModule.slice(
      productsModule.indexOf("name: 'manage_inventory'"),
      productsModule.indexOf("name: 'inventory_report'"),
    );
    expect(seed).toMatch(/reason: \{/);
  });
});

describe('no new migration re-learns the legacy table', () => {
  it('the stock-chain migrations write products/quants, never product_stock', () => {
    const ours = readdirSync(migrationsDir).filter((f) => /^202608202100\d\d_/.test(f));
    expect(ours.length).toBeGreaterThanOrEqual(6);
    for (const f of ours) {
      const sql = read(f).split('\n').filter((l) => !l.trim().startsWith('--')).join('\n');
      // Reading product_stock as an optional override is fine; writing on-hand
      // back into it is the no-op that started all of this.
      expect(sql, f).not.toMatch(/(INSERT INTO|UPDATE)\s+(public\.)?product_stock\b/i);
    }
  });
});
