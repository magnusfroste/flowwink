import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { GENERATED_ARTIFACTS, GENERATORS } from '../../../scripts/generated-artifacts';

/**
 * Generated artifacts are the bot's, not the PR's.
 *
 * Eight files are pure functions of the source and must exist in the repo (the
 * Supabase GitHub integration deploys supabase/functions as-is; agent-execute
 * imports its JSON at runtime). Carried by PRs they conflicted in every pair of
 * parallel merges — the manifest alone changed in 96 commits in 30 days. The
 * rule since 2026-10-02: CI rebuilds them, a PR must not commit them, main gets
 * them from refresh-generated-artifacts.yml, the nightly proves main is fresh.
 * Four readers of one list; this pins that they stay wired.
 */
const root = join(__dirname, '../../..');
const read = (p: string) => readFileSync(join(root, p), 'utf-8');

describe('the generated artifacts', () => {
  it('every listed artifact exists and is written by a generator', () => {
    const generatorSources = GENERATORS.map(read).join('\n');
    for (const p of GENERATED_ARTIFACTS) {
      expect(existsSync(join(root, p)), `${p} missing`).toBe(true);
      const base = p.split('/').pop()!;
      expect(generatorSources, `${base} is not written by any generator in GENERATORS`).toContain(base);
    }
  });

  it('PR CI refuses them, rebuilds them before the tests and before the build', () => {
    const ci = read('.github/workflows/ci.yml');
    expect(ci).toContain('generated-artifacts.ts --check-untouched');
    const build = ci.indexOf('generated-artifacts.ts --build');
    const tests = ci.indexOf('npx vitest run');
    expect(build).toBeGreaterThan(-1);
    expect(build, 'the rebuild must run BEFORE the tests that read the artifacts').toBeLessThan(tests);
    expect(ci.lastIndexOf('generated-artifacts.ts --build')).toBeLessThan(ci.indexOf('npm run build'));
  });

  it('main gets them from a fleet-only job that deploys (no [skip ci])', () => {
    const wf = read('.github/workflows/refresh-generated-artifacts.yml');
    expect(wf).toMatch(/branches: \[main\]/);
    expect(wf).toContain('npm run artifacts:build');
    expect(wf).toMatch(/git push origin HEAD:main/);
    expect(wf).toMatch(/github\.repository == 'magnusfroste\/flowwink'/);
    const commitLine = wf.match(/git commit -m "[^"]*"/)?.[0] ?? '';
    expect(commitLine, 'no commit line found').not.toBe('');
    expect(commitLine, 'Vercel and the Supabase integration must deploy the refreshed artifacts').not.toMatch(/\[skip ci\]/);
  });

  it('the nightly proves main is fresh, and the pre-commit hook keeps them out of commits', () => {
    expect(read('.github/workflows/fresh-install-nightly.yml')).toContain('generated-artifacts.ts --check-fresh');
    const hook = read('.githooks/pre-commit');
    expect(hook).toContain('git restore --staged');
    expect(hook, 'the hook must not regenerate-and-stage again').not.toMatch(/git add supabase\/seed/);
  });
});
