/**
 * A gate that cannot fail is a claim the repo does not keep.
 *
 * CI's type check was decorative in two ways at once: `continue-on-error: true`
 * meant it could never fail a build, and it ran against the ROOT tsconfig,
 * which skips the app sources. The step completed in under a second and stayed
 * green while `tsc -p tsconfig.app.json` reported real errors in
 * useAccounting.ts and NewJournalEntryDialog.tsx.
 *
 * That is the same failure shape as the lockfile and the stale manifest: a
 * signal that looks like coverage and is not. This guardrail keeps the escape
 * hatch from coming back quietly.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ci = readFileSync(join(process.cwd(), '.github/workflows/ci.yml'), 'utf-8');

/** The lines of one YAML step, from its `- name:` to the next one. */
function step(nameFragment: string): string {
  const lines = ci.split('\n');
  const start = lines.findIndex((l) => /^\s*- name:/.test(l) && l.includes(nameFragment));
  expect(start, `no CI step matching "${nameFragment}"`).toBeGreaterThan(-1);
  const rest = lines.slice(start + 1);
  const end = rest.findIndex((l) => /^\s*- name:/.test(l));
  return [lines[start], ...(end === -1 ? rest : rest.slice(0, end))].join('\n');
}

describe('the type check is a gate, not a decoration', () => {
  const typecheck = step('TypeScript type check');

  it('cannot be waved through', () => {
    expect(typecheck).not.toMatch(/continue-on-error:\s*true/);
  });

  it('checks the app sources, not just whatever the root config includes', () => {
    // `tsc --noEmit` against the root config returned in under a second and
    // missed every error the app config found.
    expect(typecheck).toMatch(/tsc -p tsconfig\.app\.json --noEmit/);
  });
});

describe('the steps that were already blocking stay blocking', () => {
  for (const name of [
    'Skill linter',
    'Parity matrix freshness',
    'Migration forward-dating guard',
  ]) {
    it(`${name} has no escape hatch`, () => {
      expect(step(name)).not.toMatch(/continue-on-error:\s*true/);
    });
  }
});
