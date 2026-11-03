/**
 * An `.rpc('fn', { … })` call names arguments the function has. The purchase
 * order path called pick_vendor_price with p_qty (the function takes
 * p_quantity): PostgREST answered PGRST202, the error was never read, and
 * every line fell back to the product's cost price — vendor prices and their
 * quantity breaks never priced a PO (2026-10-31).
 *
 * Discover, don't enumerate: every call with a literal argument object in the
 * edge functions, the app and the scripts, against every overload the
 * migrations define — the names must be a subset of one overload's and cover
 * its required ones.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { rpcSignatures } from './fixtures/db-schema';

function walk(dir: string, out: string[] = []): string[] {
  for (const f of readdirSync(dir)) {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) {
      if (!/^(node_modules|tests|__tests__)$/.test(f)) walk(p, out);
    } else if (/\.tsx?$/.test(f) && !/\.test\.tsx?$/.test(f)) out.push(p);
  }
  return out;
}

describe('rpc calls name the arguments their function has', () => {
  it('the scanner sees the signatures it judges against', () => {
    expect(rpcSignatures.get('pick_vendor_price')?.[0].args).toEqual(['p_product_id', 'p_vendor_id', 'p_quantity', 'p_at']);
    expect(rpcSignatures.get('create_ticket_from_portal')).toBeDefined();
  });

  it('every literal argument object fits an overload', () => {
    const wrong: string[] = [];
    let judged = 0;
    for (const f of [...walk('supabase/functions'), ...walk('src'), ...walk('scripts')]) {
      const src = readFileSync(f, 'utf8');
      // .rpc('name', { flat object }) — a spread or nested value is not judged.
      for (const m of src.matchAll(/\.rpc\(\s*['"](\w+)['"]\s*,\s*\{([^{}]*)\}/g)) {
        const overloads = rpcSignatures.get(m[1]);
        if (!overloads || /\.\.\./.test(m[2])) continue;
        const keys = [...m[2].matchAll(/(?:^|,)\s*(\w+)\s*(?=[:,]|$)/g)].map((x) => x[1]);
        judged++;
        const fits = overloads.some((o) => keys.every((k) => o.args.includes(k)) && o.required.every((r) => keys.includes(r)));
        if (!fits) {
          const line = src.slice(0, m.index).split('\n').length;
          wrong.push(`${f}:${line} ${m[1]}(${keys.join(', ')}) vs ${overloads.map((o) => `(${o.args.join(', ')})`).join(' | ')}`);
        }
      }
    }
    expect(wrong).toEqual([]);
    expect(judged).toBeGreaterThan(150);
  });
});
