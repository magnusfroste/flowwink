/**
 * One version, one migration.
 *
 * 2026-08-24: PR #261 and PR #265 were cut from the same fork point and each
 * added `20260828120000_*.sql`. Both went green. The forward-dating guard could
 * not see it — it compares a branch against its own MERGE-BASE, deliberately, so
 * that a migration landing on main in parallel does not false-flag the branch.
 * At that fork point the sibling does not exist yet.
 *
 * Why a shared timestamp is not cosmetic: `supabase_migrations.schema_migrations`
 * keys on `version`. Two files claiming one version are ONE migration to the
 * ledger — whichever applies second looks already-applied and is silently
 * skipped. The same outcome as back-dating, reached from the other direction.
 *
 * And the sensor built to catch unfinished installs cannot report it, which is
 * the part that makes this worth a test rather than a comment. `schemaRow()`
 * matches an expected migration when `versions.has(version) || names.has(name)`
 * — so ONE applied file satisfies BOTH expected entries and the instance says
 * "all migrations applied" while one of them never ran.
 *
 * Two locks, both pinned here:
 *   1. `scripts/check-migration-forward-dated.ts` rejects a version shared by
 *      two filenames in the post-merge state (CI, blocking).
 *   2. `scripts/generate-instance-manifest.ts` refuses to emit a duplicate, so
 *      a collision cannot reach the artifact instances measure themselves by.
 *
 * See also: docs — the "silent half-success" class, of which this is a textbook
 * member: every individual check is green and the outcome is still wrong.
 */
import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { evaluateInstanceReadiness, type ReadinessInput } from '@/lib/instance-readiness';

const ROOT = join(__dirname, '..', '..', '..');
const MIGRATIONS_DIR = join(ROOT, 'supabase', 'migrations');

function migrationFiles(): string[] {
  return readdirSync(MIGRATIONS_DIR).filter((f) => /^\d{14}.*\.sql$/.test(f)).sort();
}

describe('one version, one migration', () => {
  it('no two migration files claim the same 14-digit version', () => {
    const byVersion = new Map<string, string[]>();
    for (const f of migrationFiles()) {
      const version = f.slice(0, 14);
      byVersion.set(version, [...(byVersion.get(version) ?? []), f]);
    }

    const collisions = [...byVersion.entries()].filter(([, files]) => files.length > 1);

    expect(
      collisions,
      collisions.length === 0
        ? ''
        : `Migration version collision — the version is the ledger's primary key, so the\n` +
          `second file to apply is silently skipped:\n` +
          collisions.map(([v, fs]) => `  ${v}\n${fs.map((f) => `    ${f}`).join('\n')}`).join('\n'),
    ).toEqual([]);
  });

  it('the manifest carries one entry per version — no duplicates reach the artifact', () => {
    const manifest = JSON.parse(
      readFileSync(join(ROOT, 'supabase', 'seed', 'instance-manifest.json'), 'utf-8'),
    );
    const versions: string[] = manifest.layers.schema.migrations.map(
      (m: { version: string }) => m.version,
    );
    expect(new Set(versions).size).toBe(versions.length);
  });

  it('DEMONSTRATES the blind spot: a duplicate version hides a migration that never ran', () => {
    // Two migrations the build expects, sharing one version — the exact #261/#265
    // shape. Only the first was actually applied; the ledger skipped the second.
    const expected = [
      { version: '20260828120000', name: 'a-vendor-term-is-a-word-not-a-number' },
      { version: '20260828120000', name: 'the-sweep-is-fixed-now-prove-it-keeps-running' },
    ];
    const applied = [expected[0]]; // the second never ran

    const input = {
      schema: { applied, expected },
    } as unknown as ReadinessInput;

    const schema = evaluateInstanceReadiness({
      ...input,
      skills: { total: 1, enabled: 1, stampHash: 'h', expectedHash: 'h', expectedCount: 1, platformFloor: 0 },
      edge: { deployed: [], expected: [], reportedAt: null },
      cron: { jobs: [] },
      ai: { configured: true },
      siteUrl: { value: 'https://example.com' },
      modules: { settings: null },
    } as unknown as ReadinessInput).find((r) => r.id === 'schema')!;

    // This is the bug, asserted as it behaves TODAY — one applied file satisfies
    // both expected entries. If a future change makes readiness see through a
    // duplicate version, this expectation flips and that is good news: update it.
    expect(schema.status).toBe('ok');
    expect(schema.detail).toContain('are applied');

    // CONTROL — without it the assertion above proves nothing. Give the second
    // migration its OWN version, change nothing else, and the same "one applied,
    // one skipped" state is correctly reported as blocked. So the `ok` above is
    // caused by the shared version and by nothing else.
    const distinct = [
      { version: '20260828120000', name: 'a-vendor-term-is-a-word-not-a-number' },
      { version: '20260828120001', name: 'the-sweep-is-fixed-now-prove-it-keeps-running' },
    ];
    const control = evaluateInstanceReadiness({
      schema: { applied: [distinct[0]], expected: distinct },
      skills: { total: 1, enabled: 1, stampHash: 'h', expectedHash: 'h', expectedCount: 1, platformFloor: 0 },
      edge: { deployed: [], expected: [], reportedAt: null },
      cron: { jobs: [] },
      ai: { configured: true },
      siteUrl: { value: 'https://example.com' },
      modules: { settings: null },
    } as unknown as ReadinessInput).find((r) => r.id === 'schema')!;

    expect(control.status).not.toBe('ok');
  });
});
