import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * The fleet is named twice: the forks sync-forks.sh loops over, and the
 * secrets/variables the nightly workflow hands it. A fork added to one list
 * only is skipped every night — the script prints SKIPPAD into a log nobody
 * reads (MJP, 2026-09-29: synced by hand because no list knew it). The
 * script's list is the one truth; the workflow must map every name in it.
 */
const root = join(__dirname, '../../..');
const script = readFileSync(join(root, 'scripts/sync-forks.sh'), 'utf8');
const workflow = readFileSync(join(root, '.github/workflows/nightly-fork-sync.yml'), 'utf8');
const forks = (script.match(/^FORKS="([^"]+)"/m)?.[1] ?? '').split(/\s+/).filter(Boolean);

describe('the fork lists agree', () => {
  it('the scanner reads the fleet', () => {
    expect(forks).toEqual(expect.arrayContaining(['WWW', 'OPTIC', 'MJP']));
  });

  it.each(forks)('%s: the workflow maps its token and repo, and counts it', (name) => {
    expect(workflow).toContain(`FORK_TOKEN_${name}: \${{ secrets.FORK_TOKEN_${name} }}`);
    expect(workflow).toContain(`FORK_REPO_${name}: \${{ vars.FORK_REPO_${name} }}`);
    expect(workflow).toMatch(new RegExp(`if \\[ -z "[^"]*\\$FORK_TOKEN_${name}[^"]*" \\]`));
  });

  it('the workflow names no fork the script does not know', () => {
    const mapped = [...workflow.matchAll(/FORK_TOKEN_([A-Z0-9]+): \$\{\{/g)].map((m) => m[1]);
    expect(mapped.filter((n) => !forks.includes(n))).toEqual([]);
  });
});
