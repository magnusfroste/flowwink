import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { footerLogoFor } from '@/lib/footer-logo';

const LIGHT = 'logo-black.svg'; // for light backgrounds
const DARK = 'logo-white.svg';  // for dark backgrounds

describe('the footer logo follows the surface it sits on', () => {
  it('ground in dark theme shows the dark-surface logo (synclair: black mark on black footer)', () => {
    expect(footerLogoFor('ground', 'dark', LIGHT, DARK)).toBe(DARK);
    expect(footerLogoFor('muted', 'dark', LIGHT, DARK)).toBe(DARK);
  });

  it('ground in light theme shows the light-surface logo', () => {
    expect(footerLogoFor('ground', 'light', LIGHT, DARK)).toBe(LIGHT);
  });

  it('inverse is the opposite surface', () => {
    expect(footerLogoFor('inverse', 'dark', LIGHT, DARK)).toBe(LIGHT);
    expect(footerLogoFor('inverse', 'light', LIGHT, DARK)).toBe(DARK);
  });

  it('primary (and an unset surface) keeps the old rule', () => {
    expect(footerLogoFor('primary', 'dark', LIGHT, DARK)).toBe(LIGHT);
    expect(footerLogoFor(undefined, 'light', LIGHT, DARK)).toBe(DARK);
  });

  it('one logo is used everywhere; none is null', () => {
    expect(footerLogoFor('ground', 'dark', LIGHT, null)).toBe(LIGHT);
    expect(footerLogoFor('ground', 'dark', null, null)).toBeNull();
  });

  it('the footer reads the rule, not a theme-only ternary', () => {
    const src = readFileSync(join(process.cwd(), 'src/components/public/PublicFooter.tsx'), 'utf8');
    expect(src).toMatch(/footerLogoFor\(settings\?\.surface, resolvedTheme, branding\?\.logo, branding\?\.logoDark\)/);
  });
});
