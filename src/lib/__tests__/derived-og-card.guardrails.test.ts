import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ogCardModel, resolveOgImage, firstBlockPicture, wrapTitle, fitTitle, TITLE_WIDTH } from '@/lib/og-card';

/**
 * Guardrail: a page without an uploaded social image gets a card DERIVED
 * from the brand dials and its own title and picture — never a bare photo,
 * never the platform's logo as a thumbnail, never an off-brand upload a
 * connected agent generated because nothing else existed (synclair 2026-10-21).
 */
const root = join(__dirname, '../../..');

describe('the derived social card', () => {
  it('explicit beats derived; derived beats nothing', () => {
    expect(resolveOgImage('https://x/og.png', 'https://site.se', '/isr')).toBe('https://x/og.png');
    expect(resolveOgImage('', 'https://site.se/', '/isr')).toBe('https://site.se/api/og?path=%2Fisr');
    expect(resolveOgImage(null, 'https://site.se', '/')).toBe('https://site.se/api/og?path=%2F');
  });

  it('the model follows the brand dials: dark ground, the dark logo, uppercase headings, accent eyebrow', () => {
    const m = ogCardModel({ title: 'Bättre vision. Starkare förmåga.', description: 'Modulär vidvinkelvision.', siteName: 'Synclair Vision',
      picture: 'https://x/hero.jpg', branding: { defaultTheme: 'dark', backgroundColorDark: '0 0% 0%', primaryColor: '216 41% 21%', primaryColorDark: '44 100% 50%', accentColor: '44 100% 50%', logo: 'https://x/black.svg', logoDark: 'https://x/white.svg', headingTransform: 'uppercase' } });
    expect(m.dark).toBe(true);
    expect(m.ground).toBe('hsl(0 0% 0%)');
    expect(m.logo).toBe('https://x/white.svg');
    expect(m.accent).toBe('hsl(44 100% 50%)');
    expect(m.titleLines.join(' ')).toBe('BÄTTRE VISION. STARKARE FÖRMÅGA.');
    expect(m.titleLines.length).toBeLessThanOrEqual(3);
    expect(m.picture).toBe('https://x/hero.jpg');
    expect(m.eyebrow).toBe('Synclair Vision');
  });

  it('a light site keeps the light logo and ground; a data: picture is dropped; a long description is clamped', () => {
    const m = ogCardModel({ title: 'Hello', description: 'x'.repeat(400), branding: { logo: 'https://x/black.svg', logoDark: 'https://x/white.svg' }, picture: 'data:image/png;base64,AAA' });
    expect(m.dark).toBe(false);
    expect(m.logo).toBe('https://x/black.svg');
    expect(m.picture).toBeNull();
    expect(m.description.length).toBeLessThanOrEqual(150);
    expect(m.description.endsWith('…')).toBe(true);
  });

  it('titles wrap on words into at most three lines, the last one shortened with an ellipsis', () => {
    expect(wrapTitle('one two three four five six seven eight nine ten eleven twelve', 12, 3)).toHaveLength(3);
    expect(wrapTitle('one two three four five six seven eight nine ten eleven twelve', 12, 3)[2].endsWith('…')).toBe(true);
    expect(wrapTitle('Short', 12, 3)).toEqual(['Short']);
  });

  it('the title takes the largest size that fits its column in three lines — no clipping beside a picture', () => {
    const beside = fitTitle('VISION FÖR OBEMANNADE PLATTFORMAR', TITLE_WIDTH.withPicture, true);
    expect(beside.lines.length).toBeLessThanOrEqual(3);
    expect(beside.lines.every((l) => l.length * beside.size * 0.72 <= TITLE_WIDTH.withPicture)).toBe(true);
    const full = fitTitle('VISION FÖR OBEMANNADE PLATTFORMAR', TITLE_WIDTH.full, true);
    expect(full.size).toBeGreaterThanOrEqual(beside.size);
    expect(fitTitle('Hej', TITLE_WIDTH.withPicture, false)).toEqual({ lines: ['Hej'], size: 76 });
  });

  it('the page picture is the first http(s) image a block carries — never a data URI or an SVG', () => {
    expect(firstBlockPicture([{ type: 'hero', data: { imageSrc: 'data:image/svg+xml;base64,AAA' } }, { type: 'two-column', data: { imageSrc: 'https://x/a.jpg' } }])).toBe('https://x/a.jpg');
    expect(firstBlockPicture([{ type: 'logos', data: { image: 'https://x/mark.svg' } }])).toBeNull();
    expect(firstBlockPicture('nope')).toBeNull();
  });

  it('the shell falls back to the derived card before the logo thumbnail, and the renderer exists under /api', () => {
    const html = readFileSync(join(root, 'api/html.ts'), 'utf8');
    expect(html).toMatch(/if \(!image && origin\) image = resolveOgImage\(null, origin, path\);/);
    expect(html.indexOf('resolveOgImage(null, origin, path)')).toBeLessThan(html.indexOf('const usingLogo'));
    const og = readFileSync(join(root, 'api/og.ts'), 'utf8');
    expect(og).toMatch(/new ImageResponse\(/);
    expect(og).toMatch(/x-flowwink-og/);
  });
});
