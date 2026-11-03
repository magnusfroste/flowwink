/**
 * A deny in the admin shell has a way out.
 *
 * Found on optic, 2026-10-26 and again 2026-10-29: a sales + marketing user
 * reported "I cannot log in" and was made admin to get past it. He was signed
 * in the whole time; Safari had reopened the tab where it was closed, on a page
 * his roles do not include, and the "Access Denied" screen there had no link,
 * no path and no name of who could change it. A dead end at the front door
 * reads as a login failure, and the fix people reach for is the admin role.
 *
 * Three rules, read out of the source so no gate can regress them quietly:
 *  1. ONE deny screen. No file under src/ draws its own "Access Denied"
 *     heading — every gate renders <AccessDenied>. Discover, don't enumerate:
 *     the scan walks every .tsx file, not a list of known gates.
 *  2. The screen names the refused path, says who grants it, and links to the
 *     dashboard (or the portal for a non-staff account).
 *  3. Both admin gates (AdminLayout, AdminRouteGate) pass the pathname and a
 *     sign-out door, so the two surfaces cannot drift apart.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const SRC = join(__dirname, '..', '..');
const COMPONENT = join(SRC, 'components', 'admin', 'AccessDenied.tsx');

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (name === 'node_modules' || name === '__tests__') continue;
    if (statSync(p).isDirectory()) walk(p, out);
    else if (p.endsWith('.tsx')) out.push(p);
  }
  return out;
}

describe('access denied has a way out', () => {
  it('one deny screen: no .tsx under src/ draws its own "Access Denied" heading', () => {
    const offenders = walk(SRC)
      .filter((p) => p !== COMPONENT)
      .filter((p) => />\s*Access Denied\s*</.test(readFileSync(p, 'utf8')))
      .map((p) => relative(SRC, p));
    expect(offenders, 'render <AccessDenied> instead of a bare heading').toEqual([]);
  });

  it('the screen names the path, who grants it, and links out', () => {
    const src = readFileSync(COMPONENT, 'utf8');
    expect(src).toMatch(/\{pathname/);
    expect(src).toMatch(/Users → Roles/);
    expect(src).toMatch(/to=\{route \? '\/admin' : '\/account'\}/);
    expect(src).toMatch(/Switch account/);
  });

  it('both admin gates pass the pathname and a sign-out door', () => {
    for (const file of ['AdminLayout.tsx', 'AdminRouteGate.tsx']) {
      const src = readFileSync(join(SRC, 'components', 'admin', file), 'utf8');
      expect(src, file).toMatch(/<AccessDenied reason="route" pathname=\{location\.pathname\} onSignOut=\{/);
    }
    const layout = readFileSync(join(SRC, 'components', 'admin', 'AdminLayout.tsx'), 'utf8');
    expect(layout).toMatch(/<AccessDenied reason="not-staff" onSignOut=\{/);
  });
});
