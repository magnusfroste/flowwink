import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

/**
 * A workflow that commits must sign as GitHub's own Actions bot. An address of
 * the form "<name>@users.noreply.github.com" is attributed by GitHub to the
 * REAL account <name>: our artifacts and nightly-stamp commits showed two
 * strangers ("artifacts", "nightly") as authors — on GitHub and in every
 * fork's Vercel deployment (2026-10-09). Scans every workflow, so a new
 * committing workflow is held to the same rule.
 */
const DIR = join(__dirname, '../../../.github/workflows');
const ACTIONS_BOT = '41898282+github-actions[bot]@users.noreply.github.com';

describe('bot commits carry the GitHub Actions identity', () => {
  const lines = readdirSync(DIR)
    .filter((f) => /\.ya?ml$/.test(f))
    .flatMap((f) =>
      readFileSync(join(DIR, f), 'utf8')
        .split('\n')
        .filter((l) => /git config user\.email/.test(l))
        .map((l) => ({ f, l: l.trim() })),
    );

  it('at least the two committing workflows are found', () => {
    expect(lines.map((x) => x.f)).toEqual(expect.arrayContaining(['refresh-generated-artifacts.yml', 'fresh-install-nightly.yml']));
  });

  it('every committer email is the Actions bot, never a bare <name>@users.noreply.github.com', () => {
    const wrong = lines.filter(({ l }) => !l.includes(ACTIONS_BOT)).map(({ f, l }) => `${f}: ${l}`);
    expect(wrong).toEqual([]);
  });
});
