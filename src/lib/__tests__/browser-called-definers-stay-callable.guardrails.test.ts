/**
 * A function the browser calls must stay callable by the browser — and must
 * guard itself (2026-11-02).
 *
 * 20261029120000 revoked EXECUTE from authenticated on 112 SECURITY DEFINER
 * functions judged "never called by the browser". Two were: the Newsletter
 * page's list totals (newsletter_list_summary) and the Docs editor's save
 * (manage_docs_page) — both answered "permission denied" for everyone, admin
 * included. The role sweep found the first; a scan for the cast-call shape
 * `(supabase.rpc as …)('name')` found the second.
 *
 * Discover, don't enumerate: every RPC name the src/ tree calls (both call
 * shapes) that a migration revoked from authenticated must be granted back to
 * authenticated by a LATER migration, whose newest definition of the function
 * guards its body (service_role / can_access_module / has_role / is_staff /
 * auth.uid() =).
 */
import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) return f === '__tests__' ? [] : walk(p);
    return /\.tsx?$/.test(f) && !f.endsWith('types.ts') ? [p] : [];
  });
}

const called = new Set<string>();
for (const f of walk('src')) {
  const src = readFileSync(f, 'utf8');
  for (const m of src.matchAll(/\.rpc\(\s*['"]([a-z_0-9]+)['"]/g)) called.add(m[1]);
  // The cast shape: (supabase.rpc as any)('x') and (supabase.rpc as unknown as (fn: string) => …)('x').
  for (const m of src.matchAll(/\.rpc as [\s\S]{0,240}?\)\(\s*['"]([a-z_0-9]+)['"]/g)) called.add(m[1]);
}

const migrations = readdirSync('supabase/migrations').filter((f) => f.endsWith('.sql')).sort();
const sql = new Map(migrations.map((f) => [f, readFileSync(`supabase/migrations/${f}`, 'utf8')]));

/** The last migration that revokes `fn` from authenticated (by name or in a revoke array), if any. */
function lastRevoke(fn: string): string | null {
  let last: string | null = null;
  for (const f of migrations) {
    const s = sql.get(f)!;
    const byName = new RegExp(`REVOKE[^;]*ON FUNCTION public\\.${fn}\\([^;]*FROM[^;]*\\bauthenticated\\b`, 'i').test(s);
    // A revoke loop: FOR r IN SELECT … proname = ANY (ARRAY[…]) LOOP EXECUTE
    // format('REVOKE … %s FROM … authenticated') — only THAT array counts.
    const inArray = [...s.matchAll(/ARRAY\[([^\]]*)\]\)\s*LOOP\s*EXECUTE format\('REVOKE EXECUTE ON FUNCTION %s FROM [^']*authenticated/gi)]
      .some((m) => m[1].includes(`'${fn}'`));
    if (byName || inArray) last = f;
  }
  return last;
}

function lastGrant(fn: string): string | null {
  let last: string | null = null;
  for (const f of migrations) {
    if (new RegExp(`GRANT EXECUTE ON FUNCTION public\\.${fn}\\([^;]*TO[^;]*\\bauthenticated\\b`, 'i').test(sql.get(f)!)) last = f;
  }
  return last;
}

function newestBody(fn: string): string | null {
  for (const f of [...migrations].reverse()) {
    const m = sql.get(f)!.match(new RegExp(`CREATE OR REPLACE FUNCTION public\\.${fn}\\([\\s\\S]*?(\\$\\$|\\$function\\$);`));
    if (m) return m[0];
  }
  return null;
}

describe('functions the browser calls stay callable and guard themselves', () => {
  it('finds the browser\'s RPC calls in both call shapes', () => {
    expect(called.size).toBeGreaterThan(200);
    expect(called).toContain('newsletter_list_summary');
    expect(called).toContain('manage_docs_page');
  });

  const revoked = [...called].filter((fn) => lastRevoke(fn) !== null);
  for (const fn of revoked) {
    it(`${fn}: revoked from authenticated, so granted back later and guarded`, () => {
      const r = lastRevoke(fn)!;
      const g = lastGrant(fn);
      expect(g !== null && g > r, `${fn} was revoked in ${r} and never granted back — the browser calls it`).toBe(true);
      const body = newestBody(fn) ?? '';
      expect(body, `${fn} must guard its own body`).toMatch(/service_role|can_access_module\(|has_role\(|is_staff\(|auth\.uid\(\)\s*=/);
    });
  }
});
