import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { topSurfaceIsDark } from '../top-surface';
import type { ContentBlock } from '@/types/cms';

const block = (type: string, data: Record<string, unknown> = {}): ContentBlock =>
  ({ id: 'b', type, data } as unknown as ContentBlock);

describe('topSurfaceIsDark — the page tells the overlay header what it floats over', () => {
  it('an image hero with the default dark overlay is dark', () => {
    expect(topSurfaceIsDark(block('hero', { backgroundType: 'image', backgroundImage: '/x.jpg' }))).toBe(true);
    expect(topSurfaceIsDark(block('hero', { overlayColor: 'dark' }))).toBe(true);
    expect(topSurfaceIsDark(block('hero', { overlayColor: 'primary' }))).toBe(true);
  });
  it("a light overlay is the hero's dark-text case, so not dark", () => {
    expect(topSurfaceIsDark(block('hero', { overlayColor: 'light' }))).toBe(false);
  });
  it('textTheme overrides the overlay, exactly as HeroBlock ranks them', () => {
    expect(topSurfaceIsDark(block('hero', { overlayColor: 'light', textTheme: 'light' }))).toBe(true);
    expect(topSurfaceIsDark(block('hero', { overlayColor: 'dark', textTheme: 'dark' }))).toBe(false);
  });
  it('a parallax band is light-text unless told otherwise', () => {
    expect(topSurfaceIsDark(block('parallax-section', {}))).toBe(true);
    expect(topSurfaceIsDark(block('parallax-section', { textColor: 'dark' }))).toBe(false);
  });
  it('any other first block — or none — starts on the page background', () => {
    expect(topSurfaceIsDark(block('text', {}))).toBe(false);
    expect(topSurfaceIsDark(block('announcement-bar', { variant: 'gradient' }))).toBe(false);
    expect(topSurfaceIsDark(undefined)).toBe(false);
  });
});

describe('the fact travels: PublicPage computes it, the header honours it only as an overlay', () => {
  const read = (p: string) => readFileSync(join(__dirname, '..', '..', p), 'utf-8');
  it('PublicPage passes onDarkSurface from the first block', () => {
    const src = read('pages/PublicPage.tsx');
    expect(src).toContain('onDarkSurface={topSurfaceIsDark(pageData.content_json?.[0])}');
  });
  it('PublicNavigation gates light text on being an overlay', () => {
    const src = read('components/public/PublicNavigation.tsx');
    expect(src).toContain('const lightOnDark = headerIsOverlay && !!onDarkSurface;');
  });
});
