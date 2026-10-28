import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

/**
 * What a customer reads — the webshop, public quote / invoice / contract pages,
 * the portal, the chat — is written by useCustomerFormat: the reader's
 * language in the business's region, the business's clock, exact amounts.
 * Before (2026-10-25): the shop's formatPrice was always sv-SE, the public
 * quote and contract printed sv-SE, portal orders and chat times en-US, blog
 * dates followed the visitor's browser, and the admin's "whole units" rounded
 * the cart. docs/architecture/locale-and-formatting.md §3c.
 *
 * Discover, don't enumerate: every file under the customer surfaces is
 * scanned, so a new page is covered the day it is added.
 */
const ROOTS = ['src/components/public', 'src/pages/account', 'src/components/account', 'src/contexts'];
const TOP_LEVEL_PAGES = 'src/pages'; // its .tsx files, not admin/

function files(): string[] {
  const out: string[] = [];
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const p = join(dir, name);
      if (statSync(p).isDirectory()) { if (!/__tests__/.test(p)) walk(p); continue; }
      if (/\.tsx?$/.test(p) && !/\.test\./.test(p)) out.push(p);
    }
  };
  for (const r of ROOTS) walk(join(process.cwd(), r));
  for (const name of readdirSync(join(process.cwd(), TOP_LEVEL_PAGES))) {
    if (name.endsWith('.tsx')) out.push(join(process.cwd(), TOP_LEVEL_PAGES, name));
  }
  out.push(join(process.cwd(), 'src/components/chat/ChatMessage.tsx'));
  return out;
}

describe('customer surfaces write the business\'s way, in the reader\'s language', () => {
  const all = files().map((f) => ({ f: f.slice(process.cwd().length + 1), src: readFileSync(f, 'utf8') }));

  it('the scan is not empty', () => {
    expect(all.length).toBeGreaterThan(50);
  });

  it('no admin formatter (its decimals setting would round a customer\'s price)', () => {
    expect(all.filter(({ src }) => /\busePlatformFormat\b/.test(src)).map(({ f }) => f)).toEqual([]);
  });

  it('no hard-coded or browser locale in a formatter', () => {
    const SHAPE = /(toLocale(Date|Time)?String|Intl\.(NumberFormat|DateTimeFormat))\(\s*(\)|['"][a-z]{2}|undefined)/;
    expect(all.filter(({ src }) => SHAPE.test(src)).map(({ f }) => f)).toEqual([]);
  });

  it('the shop\'s old sv-SE formatPrice is gone', () => {
    const products = readFileSync(join(process.cwd(), 'src/hooks/useProducts.ts'), 'utf8');
    expect(products).not.toMatch(/export function formatPrice/);
  });
});
