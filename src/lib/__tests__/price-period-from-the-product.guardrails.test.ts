/**
 * A recurring price carries its own period (2026-11-07, #941).
 *
 * `products.billing_interval` says whether a recurring price is per month or
 * per year. Every visitor surface printed "/mo" or "/month" for every
 * recurring product, and Stripe checkout created every recurring price with
 * interval "month" — a service contract at 14 900 kr per year read
 * "14 900 kr/mo" on the site and, bought online, was charged 14 900 kr every
 * month. The rule lives in src/lib/price-period.ts (the storefront) and
 * stripeInterval() in create-checkout; this guard keeps the assumption out of
 * every other file, by shape.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { pricePeriod } from '@/lib/price-period';

const root = process.cwd();
function walk(dir: string, out: string[] = []): string[] {
  for (const e of readdirSync(dir)) {
    if (e === 'node_modules' || e === '__tests__') continue;
    const p = join(dir, e);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(ts|tsx)$/.test(e)) out.push(p);
  }
  return out;
}

describe('the period of a recurring price comes from the product', () => {
  it('the rule: recurring is monthly unless it says year; one-time has no period', () => {
    expect(pricePeriod({ type: 'recurring', billing_interval: 'year' })).toBe('year');
    expect(pricePeriod({ type: 'recurring', billing_interval: 'month' })).toBe('month');
    expect(pricePeriod({ type: 'recurring', billing_interval: null })).toBe('month');
    expect(pricePeriod({ type: 'recurring' })).toBe('month');
    expect(pricePeriod({ type: 'one_time', billing_interval: 'year' })).toBeNull();
  });

  it("no file prints a period because a product is recurring", () => {
    // The shape that bit: `type === 'recurring'` beside a hard-coded month.
    const SHAPE = /type\s*===\s*['"]recurring['"][\s\S]{0,240}?(?:['"`]\/mo['"`]|['"`]\/month|perMonth|\/mo\b|>\/month<)/g;
    const hits: string[] = [];
    for (const f of walk(join(root, 'src'))) {
      const rel = relative(root, f);
      if (rel === 'src/lib/price-period.ts' || rel === 'src/lib/price-period-text.ts') continue;
      const src = readFileSync(f, 'utf8');
      for (const m of src.matchAll(SHAPE)) hits.push(`${rel}:${src.slice(0, m.index).split('\n').length}`);
    }
    expect(hits, 'read the period with pricePeriod() / usePricePeriodText() from src/lib/price-period*.ts').toEqual([]);
  });

  it('checkout bills a recurring line on the product\'s period, and replaces a stored price on the wrong one', () => {
    const co = readFileSync(join(root, 'supabase/functions/create-checkout/index.ts'), 'utf8');
    expect(co).not.toMatch(/interval:\s*["']month["']/);
    expect((co.match(/recurring = \{ interval: stripeInterval\(product\) \}/g) ?? []).length).toBe(2);
    expect(co).toMatch(/select\("id, name, description, type, billing_interval,/);
    expect(co).toMatch(/stored\.recurring\?\.interval !== stripeInterval\(product\)/);
  });

  it('the visitor texts exist for both periods, long and short', () => {
    const cat = JSON.parse(readFileSync(join(root, 'src/data/ui-text-catalog.json'), 'utf8')) as { keys: Array<{ key: string; fallback: string }> };
    const by = new Map(cat.keys.map((k) => [k.key, k.fallback]));
    expect(by.get('shop.perMonth')).toBe('/month');
    expect(by.get('shop.perMonthShort')).toBe('/mo');
    expect(by.get('shop.perYear')).toBe('/year');
    expect(by.get('shop.perYearShort')).toBe('/yr');
  });
});
