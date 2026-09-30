import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * page_conversion_report capped its page list to p_limit BEFORE any ordering,
 * so once more than 25 pages had traffic, which pages appeared was the
 * planner's choice — the process battery got the pricing page in one run and
 * not the next (2026-09-30). A cap without an order is a random absence
 * (#599 was the same class on invoices). The latest definition must order
 * inside the capped subquery, and say when the list is capped.
 */
const dir = join(__dirname, '../../../supabase/migrations');
const defining = readdirSync(dir).filter((f) => readFileSync(join(dir, f), 'utf8').includes('FUNCTION public.page_conversion_report(')).sort();
const latest = readFileSync(join(dir, defining[defining.length - 1]), 'utf8');

describe('page_conversion_report', () => {
  it('the latest definition orders before it caps, and admits the cap', () => {
    expect(defining.length).toBeGreaterThanOrEqual(2);
    const body = latest.slice(latest.indexOf('GROUP BY pv.page_slug'));
    const order = body.indexOf('ORDER BY count(DISTINCT pv.lead_id) DESC, count(*) DESC, pv.page_slug');
    const limit = body.indexOf('LIMIT v_limit');
    expect(order).toBeGreaterThan(-1);
    expect(limit).toBeGreaterThan(order);
    expect(latest).toMatch(/'truncated', v_total > v_limit/);
  });
});
