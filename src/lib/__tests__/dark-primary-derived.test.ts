import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { darkModePrimary, effectiveDarkPrimary, contrastForeground, DARK_PRIMARY_MIN_LIGHTNESS } from '@/lib/brand-color';

/**
 * The dark theme never inherits an invisible primary.
 *
 * The light primary was applied inline in both themes, beating the dark
 * theme's own CSS default: a black brand made the chat launcher, the user's
 * bubbles and every primary button vanish in dark mode (synclairvision,
 * 2026-10-02). Without an explicit dark primary, one is derived — same hue
 * and saturation, lightness lifted to a floor. An explicit value always wins.
 */
describe('darkModePrimary', () => {
  it('lifts a dark primary to the floor, keeping hue and saturation', () => {
    expect(darkModePrimary('0 0% 0%')).toBe(`0 0% ${DARK_PRIMARY_MIN_LIGHTNESS}%`);
    expect(darkModePrimary('220 50% 20%')).toBe(`220 50% ${DARK_PRIMARY_MIN_LIGHTNESS}%`);
    expect(darkModePrimary('220 100% 26%')).toBe(`220 100% ${DARK_PRIMARY_MIN_LIGHTNESS}%`);
  });

  it('leaves an already-light primary alone', () => {
    expect(darkModePrimary('217 91% 60%')).toBe('217 91% 60%');
    expect(darkModePrimary('45 100% 80%')).toBe('45 100% 80%');
  });

  it('passes malformed input through rather than inventing a colour', () => {
    expect(darkModePrimary('#000000')).toBe('#000000');
    expect(darkModePrimary('')).toBe('');
  });

  it('the derived surface takes dark text, never black-on-black', () => {
    expect(contrastForeground(darkModePrimary('0 0% 0%'))).toBe('0 0% 9%');
  });
});

describe('effectiveDarkPrimary', () => {
  it('an explicit dark primary always wins', () => {
    expect(effectiveDarkPrimary('0 0% 0%', '200 80% 70%')).toBe('200 80% 70%');
  });
  it('derives when none is set, and stays undefined with no primary at all', () => {
    expect(effectiveDarkPrimary('0 0% 0%', undefined)).toBe(`0 0% ${DARK_PRIMARY_MIN_LIGHTNESS}%`);
    expect(effectiveDarkPrimary(undefined, undefined)).toBeUndefined();
  });
});

describe('one rule, two readers', () => {
  const root = join(__dirname, '../../..');
  it('the provider and the Branding page both read lib/brand-color, and neither re-rolls the lightness rule', () => {
    for (const p of ['src/providers/BrandingProvider.tsx', 'src/pages/admin/BrandingSettingsPage.tsx']) {
      const src = readFileSync(join(root, p), 'utf-8');
      expect(src, p).toContain("from '@/lib/brand-color'");
      expect(src, `${p} re-rolls the foreground rule`).not.toMatch(/< 40 \? '0 0% 98%'/);
    }
    expect(readFileSync(join(root, 'src/providers/BrandingProvider.tsx'), 'utf-8')).toContain('effectiveDarkPrimary(');
  });
});
