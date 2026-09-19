import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Order-to-delivery, process battery 2026-09-19: an order reserved its goods
 * twice (so its own picking came back short), a repeated allocation doubled the
 * lines, a line of three took a pick of five, a picking nobody picked shipped
 * (and booked COGS), an oversold place_order answered success and left an order
 * head with no lines, a product "born stocked" had no stock in the warehouse,
 * and event-driven stock moves dropped the reference their event carried.
 *
 * The migration patches four long functions IN PLACE and proves the behaviour on
 * itself; these pin the shapes that must not quietly disappear.
 */

const root = join(__dirname, '../../..');
const migration = readFileSync(join(root, 'supabase/migrations/20260919170000_lagret-foljer-ordern.sql'), 'utf8');
const agentExecute = readFileSync(join(root, 'supabase/functions/agent-execute/index.ts'), 'utf8');

describe('the in-place patches fail closed', () => {
  it('every patched function has an anchor check that aborts the migration', () => {
    for (const fn of ['confirm_pick', 'ship_picking', 'allocate_picking', 'apply_stock_movement_event']) {
      expect(migration, fn).toMatch(new RegExp(`anchor missing in ${fn}`));
    }
  });

  it('the proof asserts the marker in the LIVE body of all four', () => {
    expect(migration).toMatch(/does not carry the 20260919170000 change/);
    for (const sig of ['confirm_pick(uuid,numeric,uuid)', 'ship_picking(uuid,text,text)', 'allocate_picking(uuid,uuid)', 'apply_stock_movement_event(jsonb)']) {
      expect(migration).toContain(`'${sig}'`);
    }
  });

  it('the picking adopts the order\'s reservation, ships only what was picked, and a move carries its reference', () => {
    expect(migration).toMatch(/PERFORM public\.release_order_auto_reservation\(p_order_id, v_item\.product_id\);/);
    expect(migration).toMatch(/IF v_po\.status <> ''picked'' THEN/);
    expect(migration).toMatch(/p_qty_picked > v_line\.qty_requested/);
    expect(migration).toMatch(/state, notes, reference_type, reference_id\)/);
  });
});

describe('the order handlers', () => {
  it('place_order writes all lines in ONE statement and removes the head when a line is refused', () => {
    const start = agentExecute.indexOf('// ONE statement for all lines');
    expect(start).toBeGreaterThan(-1);
    const block = agentExecute.slice(start, start + 900);
    expect(block).toMatch(/\.insert\(resolvedItems\.map\(/);
    expect(block).toMatch(/from\('orders'\)\.delete\(\)\.eq\('id', order\.id\)/);
    expect(block).toMatch(/throw new Error\(`Order not placed:/);
    // the old shape: a loop that awaited each insert and never read its error
    expect(agentExecute).not.toMatch(/for \(const ri of resolvedItems\) \{\s*await supabase\.from\('order_items'\)\.insert\(/);
  });

  it('a product born stocked receives its opening stock through adjust_quant', () => {
    const start = agentExecute.indexOf('const bornStocked = track_inventory === true && openingQty > 0;');
    expect(start).toBeGreaterThan(-1);
    const block = agentExecute.slice(start, start + 1800);
    expect(block).toMatch(/if \(bornStocked\) insertData\.stock_quantity = 0;/);
    expect(block).toMatch(/rpc\('adjust_quant', \{/);
  });
});
