import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';

/**
 * The event rail died fleet-wide because the database needed a value only the
 * edge layer knows (the project URL), and nothing carried it across the gap.
 * These guard the two halves of the fix — the seeder call and the resolver —
 * so a future refactor can't quietly re-open it.
 */

const ROOT = join(__dirname, '../../..');
const DISPATCHER = join(ROOT, 'supabase/functions/automation-dispatcher/index.ts');
const MIGRATIONS = join(ROOT, 'supabase/migrations');

const migrationSources = () =>
  readdirSync(MIGRATIONS)
    .filter((f) => f.endsWith('.sql'))
    .map((f) => readFileSync(join(MIGRATIONS, f), 'utf8'));

describe('event rail config', () => {
  it('automation-dispatcher pushes the project URL into the vault', () => {
    const src = readFileSync(DISPATCHER, 'utf8');
    expect(src).toMatch(/ensure_platform_secret/);
    expect(src).toMatch(/SUPABASE_URL/);
  });

  it('dispatch_automation_event resolves its URL and does not require a service key', () => {
    // The newest definition wins — find the last migration that defines it.
    const defs = migrationSources().filter((s) =>
      /CREATE OR REPLACE FUNCTION public\.dispatch_automation_event/.test(s),
    );
    expect(defs.length).toBeGreaterThan(0);
    const latest = defs[defs.length - 1];

    // Resolves through the helper rather than reading vault inline...
    expect(latest).toMatch(/_platform_base_url\(\)/);
    // ...and a missing service key must not abort the dispatch. The old body
    // bailed on `service_key IS NULL`; nothing may reintroduce that gate.
    expect(latest).not.toMatch(/service_key IS NULL/);
    // A skipped emit has to leave a trace — silence is what hid this for months.
    expect(latest).toMatch(/platform_dispatch_failures/);
  });

  it('ensure_platform_secret is not reachable anonymously', () => {
    const def = migrationSources().find((s) =>
      /CREATE OR REPLACE FUNCTION public\.ensure_platform_secret/.test(s),
    );
    expect(def).toBeDefined();
    expect(def!).toMatch(/REVOKE ALL ON FUNCTION public\.ensure_platform_secret[^;]*anon/);
    expect(def!).not.toMatch(/GRANT EXECUTE ON FUNCTION public\.ensure_platform_secret[^;]*anon/);
  });
});
