import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

/**
 * An edge function must not call, on an anon client, an RPC anon has lost.
 *
 * #922 revoked feedback_record_ping from anon on the belief that content-api
 * called it with the service key. It did not (`const admin = supabase`, the
 * anon client under a misleading name), and every instance's daily ping
 * answered 500 from the next night, the board's writes with it.
 *
 * Scans every edge function rather than naming the one that bit: a client is
 * anon when it comes from getAnonClient() or is an alias of one, and a
 * function's standing is the LAST migration that grants or revokes it.
 */
const root = join(__dirname, '..', '..', '..');
const fnDir = join(root, 'supabase', 'functions');
const migDir = join(root, 'supabase', 'migrations');

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) return name === 'node_modules' ? [] : walk(p);
    return name.endsWith('.ts') ? [p] : [];
  });
}

/** The RPC names a source calls on a client derived from getAnonClient(). */
export function anonRpcCalls(src: string): string[] {
  const anon = new Set<string>();
  for (const m of src.matchAll(/\b(?:const|let)\s+(\w+)\s*(?::[^=]+)?=\s*getAnonClient\(\)/g)) anon.add(m[1]);
  // Aliases, to a fixed point: `const admin = supabase`.
  for (let grew = true; grew; ) {
    grew = false;
    for (const m of src.matchAll(/\b(?:const|let)\s+(\w+)\s*=\s*(\w+)\s*;/g)) {
      if (anon.has(m[2]) && !anon.has(m[1])) { anon.add(m[1]); grew = true; }
    }
  }
  const names = new Set<string>();
  for (const v of anon) {
    for (const m of src.matchAll(new RegExp(`\\b${v}\\s*\\.rpc\\(\\s*['"]([a-z0-9_]+)['"]`, 'g'))) names.add(m[1]);
  }
  return [...names];
}

/** Each function's last word on anon, in migration order. */
export function anonRevoked(migrations: string[]): Set<string> {
  const revoked = new Set<string>();
  const stmt = /\b(GRANT|REVOKE)\s+(?:EXECUTE|ALL)(?:\s+PRIVILEGES)?\s+ON\s+FUNCTION\s+(?:public\.)?([a-z0-9_]+)\s*\([^;]*?\b(?:TO|FROM)\s+([^;]+);/gi;
  for (const sql of migrations) {
    for (const m of sql.matchAll(stmt)) {
      if (!/\banon\b|\bPUBLIC\b/i.test(m[3])) continue;
      if (m[1].toUpperCase() === 'REVOKE') revoked.add(m[2]);
      else if (/\banon\b/i.test(m[3])) revoked.delete(m[2]);
    }
  }
  return revoked;
}

describe('an anon client only calls what anon may run', () => {
  const migrations = readdirSync(migDir).filter((f) => f.endsWith('.sql')).sort().map((f) => readFileSync(join(migDir, f), 'utf8'));
  const revoked = anonRevoked(migrations);

  it('the scan sees the shape that bit', () => {
    const shape = "let supabase = getAnonClient();\nconst admin = supabase;\nawait admin.rpc('feedback_record_ping', {});";
    expect(anonRpcCalls(shape)).toEqual(['feedback_record_ping']);
    expect(revoked.has('feedback_record_ping')).toBe(true);
    expect(anonRevoked(["GRANT EXECUTE ON FUNCTION public.f(uuid) TO anon;"]).has('f')).toBe(false);
    expect(anonRevoked(["GRANT EXECUTE ON FUNCTION public.f(uuid) TO anon;", "REVOKE ALL ON FUNCTION public.f(uuid) FROM PUBLIC, anon;"]).has('f')).toBe(true);
  });

  it('no edge function does it', () => {
    const offenders = walk(fnDir).flatMap((f) => {
      const src = readFileSync(f, 'utf8');
      if (!src.includes('getAnonClient(')) return [];
      return anonRpcCalls(src).filter((n) => revoked.has(n)).map((n) => `${f.slice(root.length + 1)}: ${n}`);
    });
    expect(offenders).toEqual([]);
  });

  it('the feedback board writes as the service role', () => {
    const src = readFileSync(join(fnDir, 'content-api', 'index.ts'), 'utf8');
    expect(src).toMatch(/const admin = getServiceClient\(\);/);
    expect(src).not.toMatch(/const admin = supabase;/);
  });
});
