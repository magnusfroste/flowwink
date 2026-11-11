import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * A change to the database or the edge layer is proved before it is merged
 * (2026-11-11).
 *
 * PR CI is offline; a migration or a trigger first RAN in the night's fresh
 * install, after the merge. pr-process-battery.yml runs that same install on
 * the pull request's merge ref — and must never stamp or push: only main is
 * stamped.
 */
const root = join(__dirname, '../../..');
const pr = readFileSync(join(root, '.github/workflows/pr-process-battery.yml'), 'utf-8');
const install = readFileSync(join(root, '.github/workflows/fresh-install-nightly.yml'), 'utf-8');

describe('the process battery runs on the pull request that needs it', () => {
  it('it is the fresh install itself, on main with the change applied', () => {
    expect(pr).toMatch(/uses: \.\/\.github\/workflows\/fresh-install-nightly\.yml/);
    expect(pr).toMatch(/ref: refs\/pull\/\$\{\{ github\.event\.pull_request\.number \}\}\/merge/);
    expect(install).toMatch(/ref: \$\{\{ inputs\.ref \|\| 'main' \}\}/);
  });

  it('it watches what the battery exercises', () => {
    for (const path of ['supabase/migrations/**', 'supabase/functions/**', 'scripts/process-battery/**', 'src/lib/modules/**']) {
      expect(pr, path).toContain(`- '${path}'`);
    }
  });

  it('a pull request is never stamped, and its ref never reaches main', () => {
    expect(pr).toMatch(/stamp: false/);
    const step = install.slice(install.indexOf('- name: Commit the stamp to main'));
    // The one step that pushes to main runs for main alone, whatever the caller passes.
    expect(step.slice(0, step.indexOf('run: |'))).toMatch(/\(inputs\.ref \|\| 'main'\) == 'main'/);
    expect(install.match(/git push origin HEAD:main/g)).toHaveLength(1);
  });

  it('a pull request builds its own artifacts; main must already carry them', () => {
    expect(install).toMatch(/if: \(inputs\.ref \|\| 'main'\) == 'main'\s+run: npx -y bun run scripts\/generated-artifacts\.ts --check-fresh/);
    expect(install).toMatch(/if: \(inputs\.ref \|\| 'main'\) != 'main'\s+run: npx -y bun run scripts\/generated-artifacts\.ts --build/);
  });

  it("a pull request's run never stands in main's queue", () => {
    expect(install).toMatch(/group: fresh-install-\$\{\{ inputs\.ref \|\| 'main' \}\}/);
  });
});
