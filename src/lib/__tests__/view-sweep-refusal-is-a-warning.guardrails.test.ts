/**
 * The view sweep tells a role refusal from a page bug (2026-11-05 nightly):
 * /admin/payroll visited as the projects role answered the gate's own
 * "Requires the payroll module" — a 400 with P0001 — and the night went red
 * because the browser navigated away before the body arrived, so the sweep saw
 * a bare 400. Two rules keep that from happening again:
 *
 *   1. an API refusal by the role matrix (403, 42501, or the definer's
 *      "Requires the <module> module" / "not granted the") is a WARNING — a
 *      page SERVED to a role it refuses is still an error, by the outcome;
 *   2. a body the browser could not read is retry-worthy, and if it stays
 *      unreadable the signature says so instead of guessing.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const crawl = readFileSync('scripts/view-sweep/crawl.ts', 'utf8');

describe('the view sweep and a role refusal', () => {
  it('a role-matrix refusal is a warning, by its shape — not by an allowlist of routes', () => {
    expect(crawl).toMatch(/const roleRefusal = isApi && \(status === 403 \|\| pg\.code === '42501' \|\| \/Requires the \\w\+ module\|not granted the\/i\.test\(pg\.message \?\? ''\)\);/);
    expect(crawl).toMatch(/severity: roleRefusal \? 'warn' : 'error',/);
    // The outcome still catches a page served to a role it refuses.
    expect(crawl).toMatch(/kind: 'access-granted-unexpected',\s+severity: 'error'/);
  });

  it('an unreadable body is retried, and named when it stays unreadable', () => {
    expect(crawl).toMatch(/let bodyUnreadable = false;[\s\S]*catch \{[\s\S]*bodyUnreadable = true;\s+stackFlake = true;/);
    expect(crawl).toMatch(/\$\{bodyUnreadable \? ' \(body unreadable — navigated away\)' : ''\}/);
    expect(crawl).toMatch(/\.\.\.\(bodyUnreadable \? \{ body: 'unreadable' \} : \{\}\)/);
  });
});
