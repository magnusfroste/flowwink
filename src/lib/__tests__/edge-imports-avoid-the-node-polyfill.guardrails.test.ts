import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

/**
 * No edge function may import through esm.sh's `?target=deno` build.
 *
 * That target swaps Node built-ins for Deno std 0.177.1's node polyfill, which
 * registers a `beforeunload` listener calling Deno.core.runMicrotasks() — not
 * supported by the Supabase edge runtime. Every isolate that loaded it threw
 * "event loop error: Deno.core.runMicrotasks() is not supported" on shutdown.
 * On Nordbrygg (2026-10-29) it took agent-execute's background runs with it:
 * an inbound mail's reply skill started, never finished, never logged.
 * reconciliation.ts imported Stripe that way, so EVERY agent-execute isolate
 * carried it. Use esm.sh `?target=denonext` (Deno's own node: built-ins) or
 * `npm:<pkg>@<version>`. The Stripe imports took denonext: `npm:stripe` brings
 * strict types that reject the apiVersion pins the payment flows use, and
 * changing those is a behaviour change of its own.
 *
 * Scans every file under supabase/functions — not a list of known importers.
 */
const root = join(__dirname, '../../../supabase/functions');

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry.startsWith('.')) continue;
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(ts|js|mjs)$/.test(entry)) out.push(p);
  }
  return out;
}

describe('edge imports avoid the Deno std node polyfill', () => {
  it('no esm.sh import uses ?target=deno', () => {
    const offenders: string[] = [];
    for (const file of walk(root)) {
      const src = readFileSync(file, 'utf8');
      for (const m of src.matchAll(/['"](https:\/\/esm\.sh\/[^'"]*[?&]target=deno)(?:&[^'"]*)?['"]/g)) {
        offenders.push(`${relative(root, file)}: ${m[1]}`);
      }
    }
    expect(offenders, 'use ?target=denonext or npm:<pkg>@<version> instead').toEqual([]);
  });

  it('no file imports the deno.land std node compat layer directly', () => {
    const offenders = walk(root)
      .filter((f) => /deno\.land\/std@[^/'"]+\/node\//.test(readFileSync(f, 'utf8')))
      .map((f) => relative(root, f));
    expect(offenders).toEqual([]);
  });
});

describe('a mail reply never rides a background handoff', () => {
  it('the event dispatcher runs email.received automations inline', () => {
    const src = readFileSync(join(root, 'event-dispatcher/index.ts'), 'utf8');
    expect(src).toMatch(/INLINE_EVENTS = new Set<string>\(\[[^\]]*"email\.received"/);
    expect(src).toMatch(/async: !runInline/);
  });
});
