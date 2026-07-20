import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Guardrail: the declared-skills snapshot must stay current, and must cover
 * every place skills are declared.
 *
 * Live finding (2026-07-20, platform test on the rebuilt demo): the test
 * "every DB skill is declared in a module manifest" reported 150 orphans —
 * every one a FALSE POSITIVE. Two causes:
 *
 *   1. The snapshot artifact was 17 days stale (354 names vs 496 declared).
 *      Nothing forced it to be regenerated when a module gained a skill.
 *   2. The generator scanned only src/lib/modules, but platform primitives
 *      (search_web, scrape_url, manage_site_settings, run_daily_briefing, …)
 *      live in src/lib/platform-seeds.ts BY POLICY — they must seed regardless
 *      of module toggles, so they can never hide behind a module manifest.
 *
 * A test that cries wolf is worse than no test: it trains the operator to
 * ignore a real orphan later. This suite fails the moment the artifact drifts
 * from the source, so the platform test only ever reports genuine orphans.
 *
 * Regenerate: bun run scripts/snapshot-declared-skills.ts
 */

const root = process.cwd();
const snapshot = new Set<string>(
  JSON.parse(readFileSync(join(root, 'supabase/functions/run-platform-tests/_declared-skills.json'), 'utf8')).declared,
);

/** Mirrors scripts/snapshot-declared-skills.ts — same sources, same patterns. */
function declaredInSource(): Set<string> {
  const modulesDir = join(root, 'src/lib/modules');
  const files = [
    ...readdirSync(modulesDir).filter((f) => f.endsWith('.ts')).map((f) => join(modulesDir, f)),
    join(root, 'src/lib/platform-seeds.ts'),
  ];
  const out = new Set<string>();
  for (const path of files) {
    const src = readFileSync(path, 'utf8');
    for (const m of src.matchAll(/name:\s*'([a-z_][a-z0-9_]*)'/g)) {
      const win = src.slice(m.index! + m[0].length, m.index! + m[0].length + 3000);
      if (win.includes('tool_definition') && win.includes('handler')) out.add(m[1]);
    }
    for (const s of src.matchAll(/skills:\s*\[([\s\S]*?)\]/g)) {
      for (const n of s[1].matchAll(/'([a-z_][a-z0-9_]*)'/g)) out.add(n[1]);
    }
  }
  return out;
}

describe('declared-skills snapshot', () => {
  it('is current — every skill declared in source is in the artifact', () => {
    const missing = [...declaredInSource()].filter((n) => !snapshot.has(n)).sort();
    expect(
      missing,
      `${missing.length} skill(s) declared in source but absent from the snapshot. ` +
      'Run: bun run scripts/snapshot-declared-skills.ts',
    ).toEqual([]);
  });

  it('covers platform-seeds, not just module manifests', () => {
    // These are platform primitives by policy — outside src/lib/modules.
    // If the generator ever stops scanning platform-seeds.ts they all turn
    // into phantom orphans, exactly as they did on 2026-07-20.
    for (const name of ['search_web', 'scrape_url', 'manage_site_settings', 'run_daily_briefing']) {
      expect(snapshot, `${name} missing — is platform-seeds.ts still scanned?`).toContain(name);
    }
  });

  it('the generator scans every source of skill declarations', () => {
    const gen = readFileSync(join(root, 'scripts/snapshot-declared-skills.ts'), 'utf8');
    expect(gen).toContain('src/lib/modules');
    expect(gen).toContain('platform-seeds.ts');
  });
});
