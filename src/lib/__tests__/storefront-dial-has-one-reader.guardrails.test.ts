import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';

/**
 * The storefront dial decides whether a site SELLS. It used to hide only the
 * header's cart icon: /shop, the product page and both product blocks still
 * printed a price and an Add button, so a B2B catalog (MJP's waterjets, no
 * public price) would have sold for 0 kr. The same sweep found the blocks'
 * product links pointing at /products/:id — a route that does not exist.
 *
 * The guard scans every non-admin component (.tsx — what a visitor can see)
 * for the two shapes of selling —
 * a cart action (`addItem({`) and a printed catalog price
 * (`product.price_cents`) — and requires each such file to read the dial
 * through useStorefront. A new surface is caught without being listed.
 */
const root = join(__dirname, '../../..');
const SELLING = /addItem\(\{|\bproduct\.price_cents\b|effectivePriceCents/;

function walk(dir: string, out: string[] = []): string[] {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) {
      if (!['node_modules', '__tests__', 'admin'].includes(e.name)) walk(p, out);
    } else if (/\.tsx$/.test(e.name) && !/\.test\.tsx$/.test(e.name)) out.push(p);
  }
  return out;
}

describe('the storefront dial has one reader', () => {
  const files = walk(join(root, 'src'));

  it('the scanner sees the shapes it exists for', () => {
    expect(SELLING.test('addItem({ productId: product.id })')).toBe(true);
    expect(SELLING.test('{formatPrice(product.price_cents, product.currency)}')).toBe(true);
    expect(SELLING.test('const total = order.total_cents')).toBe(false);
    expect(files.some((f) => f.endsWith('src/pages/ShopPage.tsx'))).toBe(true);
  });

  it('every surface that sells reads useStorefront', () => {
    const offenders = files
      .filter((f) => SELLING.test(readFileSync(f, 'utf8')))
      .filter((f) => !/\buseStorefront\(\)/.test(readFileSync(f, 'utf8')))
      .map((f) => relative(root, f));
    expect(offenders, 'these print a price or add to the cart without asking whether the site sells').toEqual([]);
  });

  it('no link points at the missing /products/:id route', () => {
    const offenders = files
      .filter((f) => /[`'"]\/products\/\$\{/.test(readFileSync(f, 'utf8')))
      .map((f) => relative(root, f));
    expect(offenders).toEqual([]);
  });
});
