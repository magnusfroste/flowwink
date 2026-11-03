/**
 * A purchase order's header is summed after its lines are priced. It was
 * summed before, so a line priced by lookup (vendor price or cost price)
 * counted as 0: PO-00022 and PO-00015 on Nordbrygg carried a 0,00 header —
 * and an amount-based approval rule never saw them (2026-10-31). A product
 * CODE sent as product_id is answered with the product it matches, not with
 * "has no cost price".
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

const exec = readFileSync('supabase/functions/agent-execute/index.ts', 'utf8');
const create = exec.slice(exec.indexOf("if (action === 'create' || skillName === 'create_purchase_order') {"));
const block = create.slice(0, create.indexOf('const poInsert'));

describe('create_purchase_order', () => {
  it('prices the lines, then sums the header', () => {
    const pricing = block.indexOf("supabase.rpc('pick_vendor_price'");
    const summing = block.indexOf('subtotalCents += lineSubtotal');
    expect(pricing).toBeGreaterThan(-1);
    expect(summing).toBeGreaterThan(pricing);
  });
  it('a non-uuid product_id names the product it matches', () => {
    expect(block).toMatch(/!isUuid\(String\(l\.product_id\)\)/);
    expect(block).toMatch(/is not a product id \(a uuid\)/);
  });
  it('the headers the old order wrote are repaired', () => {
    const sql = readFileSync('supabase/migrations/20261031091000_po-headers-count-their-lines.sql', 'utf8');
    expect(sql).toMatch(/COALESCE\(po\.subtotal_cents, 0\) = 0\s+AND s\.subtotal > 0/);
  });
});
