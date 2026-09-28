import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';

/**
 * The public site's forced theme is a forcedTheme (SiteThemeProvider), never a
 * setTheme() — setTheme writes the one shared "theme" key, and MJP's admin came
 * back light after every public page (2026-09-28). And while a theme is forced,
 * next-themes' resolvedTheme still reports the STORED choice, so the public
 * code reads the screen's theme through useEffectiveTheme.
 */
const root = join(__dirname, '../../..');
const read = (p: string) => readFileSync(join(root, p), 'utf8');

function walk(dir: string, out: string[] = []): string[] {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) { if (!['node_modules', '__tests__', 'admin'].includes(e.name)) walk(p, out); }
    else if (/\.tsx?$/.test(e.name) && !/\.test\.tsx?$/.test(e.name)) out.push(p);
  }
  return out;
}

describe('the public theme is forced, not stored', () => {
  it('the branding provider never writes the theme when the visitor toggle is off', () => {
    const src = read('src/providers/BrandingProvider.tsx');
    const SHAPE = /allowThemeToggle === false\)\s*\{\s*setTheme\(/;
    expect(SHAPE.test('if (branding.allowThemeToggle === false) {\n  setTheme(branding.defaultTheme);')).toBe(true);
    expect(SHAPE.test(src)).toBe(false);
    expect(src).toMatch(/branding\.defaultTheme && branding\.allowThemeToggle !== false/);
    expect(read('src/providers/SiteThemeProvider.tsx')).toMatch(/forcedTheme=\{forced\}/);
    expect(read('src/App.tsx')).toMatch(/<SiteThemeProvider>/);
  });

  it('outside admin, nothing reads resolvedTheme except useEffectiveTheme', () => {
    const offenders = walk(join(root, 'src'))
      .filter((f) => !f.endsWith('useEffectiveTheme.ts'))
      .filter((f) => /\{[^}]*\bresolvedTheme\b[^}]*\}\s*=\s*useTheme\(\)/.test(readFileSync(f, 'utf8')))
      .map((f) => relative(root, f));
    expect(offenders).toEqual([]);
  });
});
