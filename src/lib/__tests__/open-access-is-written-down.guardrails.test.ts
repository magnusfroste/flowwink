/**
 * Everything an anonymous visitor can reach is a written decision (2026-11-09).
 * scripts/open-access.ts reads the open policies and public buckets from a
 * fresh install's database and fails on one without a reason; this keeps the
 * check wired into the night and the list honest.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { OPEN_BY_DESIGN } from '../../../scripts/open-access-allowlist';

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8');

describe('open access is written down', () => {
  it('the nightly fresh install runs the open-access check', () => {
    expect(read('.github/workflows/fresh-install-nightly.yml')).toContain('npm run qa:open-access');
  });

  it('every entry carries a reason a reviewer can weigh', () => {
    for (const [k, why] of Object.entries(OPEN_BY_DESIGN)) expect(why.trim().length, k).toBeGreaterThan(8);
  });

  it("River's media is not listable by anyone (the finding that built the check)", () => {
    expect(OPEN_BY_DESIGN).not.toHaveProperty('storage.objects SELECT river-media');
  });
});
