import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Prove, then deploy (2026-11-11).
 *
 * A fork sync is a production deploy on six sites. It ran on its own clock,
 * and the fresh install that proves main ran hours later: on the night of
 * 2026-11-10 a change that let an invoice dated in a closed month be issued
 * reached every fork at 01:30 UTC and was found red at 10:17. The order is
 * the guard: the sync job cannot run before a green proof of the main it
 * hands out.
 */
const root = join(__dirname, '../../..');
const sync = readFileSync(join(root, '.github/workflows/nightly-fork-sync.yml'), 'utf-8');
const proof = readFileSync(join(root, '.github/workflows/fresh-install-nightly.yml'), 'utf-8');

/** One job's text: from its key to the next job key at the same indent. */
function job(wf: string, name: string): string {
  const start = wf.search(new RegExp(`^  ${name}:\\s*$`, 'm'));
  expect(start, `job ${name}`).toBeGreaterThan(-1);
  const rest = wf.slice(start + 1);
  const next = rest.search(/^ {2}[a-z][\w-]*:\s*$/m);
  return next === -1 ? rest : rest.slice(0, next);
}

describe('the fork sync waits for the proof', () => {
  it('the proof is the fresh install itself, called — not a copy of it', () => {
    expect(job(sync, 'proof')).toMatch(/uses: \.\/\.github\/workflows\/fresh-install-nightly\.yml/);
    expect(proof).toMatch(/^ {2}workflow_call:/m);
    expect(proof).toMatch(/proven_sha:[\s\S]*value: \$\{\{ jobs\.fresh-install\.outputs\.proven_sha \}\}/);
  });

  it('the sync needs the proof and runs only when it is green', () => {
    const s = job(sync, 'sync');
    expect(s).toMatch(/needs: \[gate, proof\]/);
    expect(s).toMatch(/needs\.proof\.result == 'success'/);
    // The one way around it is asked for by name, never a default.
    expect(s).toMatch(/needs\.proof\.result == 'skipped' && inputs\.unproven == true/);
    expect(sync).toMatch(/unproven:[\s\S]{0,200}default: false/);
  });

  it('only the proved commit is handed out', () => {
    const s = job(sync, 'sync');
    expect(s).toMatch(/PROVEN: \$\{\{ needs\.proof\.outputs\.proven_sha \}\}/);
    expect(s).toMatch(/git diff --name-only "\$\{PROVEN\}" HEAD/);
    // The check stands before the sync, and a moved main stops it.
    expect(s.indexOf('Is main still what was proved?')).toBeLessThan(s.indexOf('./scripts/sync-forks.sh'));
    expect(s).toMatch(/main moved during the proof[\s\S]*exit 1/);
  });

  it('a second arrival the same day spends no proof', () => {
    expect(job(sync, 'proof')).toMatch(/needs: gate[\s\S]*needs\.gate\.outputs\.skip != 'true'/);
  });
});
