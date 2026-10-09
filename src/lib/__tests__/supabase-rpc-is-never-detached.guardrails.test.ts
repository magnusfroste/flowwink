import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

/**
 * `supabase.rpc` is a method that reads `this.rest`. Taking it off the client —
 * `const rpcCall = supabase.rpc as unknown as (…)` — and calling it loses
 * `this`, and every call throws "Cannot read properties of undefined (reading
 * 'rest')" in the browser before any request leaves. Six places did it:
 * booking (submit + waitlist), webinar sign-up, stock alerts and the form→lead
 * path, whose try/catch hid it behind a fallback. The booking block's toast
 * said "Failed to submit booking" for three weeks (synclair, 2026-10-09).
 *
 * The guard scans every file under src/ for the shape: a supabase client
 * method assigned to a name without .bind(…).
 */
const ROOT = join(__dirname, '../../..');
const walk = (dir: string): string[] =>
  readdirSync(join(ROOT, dir)).flatMap((n) => {
    const p = join(dir, n);
    if (n === 'node_modules' || n === '__tests__') return [];
    return statSync(join(ROOT, p)).isDirectory() ? walk(p) : /\.(ts|tsx)$/.test(n) ? [p] : [];
  });

const DETACHED = /=\s*supabase\.(rpc|from|schema|channel)\s*(?:as\b|;|\)|,)/;

describe('a supabase client method is never called detached from the client', () => {
  it('no file assigns supabase.rpc (or from/schema/channel) without .bind', () => {
    const offenders = walk('src').flatMap((p) =>
      readFileSync(join(ROOT, p), 'utf8')
        .split('\n')
        .map((line, i) => ({ line, i }))
        .filter(({ line }) => DETACHED.test(line) && !/\.bind\(/.test(line))
        .map(({ i, line }) => `${relative(ROOT, join(ROOT, p))}:${i + 1}  ${line.trim()}`),
    );
    expect(offenders, 'use supabase.rpc.bind(supabase) (it reads this.rest)').toEqual([]);
  });

  it('the shape is recognised (the scan is not blind)', () => {
    expect(DETACHED.test('const rpcCall = supabase.rpc as unknown as (fn: string) => void;')).toBe(true);
    expect(DETACHED.test('const rpcCall = supabase.rpc.bind(supabase) as unknown as (fn: string) => void;')).toBe(false);
  });

  it('request_booking keeps the visitor\'s intake answers for the trigger that reads them', () => {
    const sql = readFileSync(join(ROOT, 'supabase/migrations/20261009120000_besokarens-svar-foljer-med-bokningen.sql'), 'utf8');
    expect(sql).toMatch(/'intake', CASE WHEN jsonb_typeof\(p_metadata->'intake'\) = 'object' THEN p_metadata->'intake' END/);
    expect(sql).toMatch(/GRANT EXECUTE ON FUNCTION public\.request_booking\([^)]*\) TO anon, authenticated, service_role/);
  });
});
