import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { buildChain, hash01, paintPixelGradient, parseRgb, DOT_SIZE, type Rgb } from '@/lib/pixel-gradient';
import { SectionDividerBlock } from '@/components/public/blocks/SectionDividerBlock';
import { FeaturesBlock } from '@/components/public/blocks/FeaturesBlock';
import { TwoColumnBlock } from '@/components/public/blocks/TwoColumnBlock';
import { applyBrandingToDocument } from '@/providers/BrandingProvider';
import { BLOCK_REFERENCE } from '@/lib/block-reference';

/**
 * Guardrail: the brand's pixel gradient is DRAWN, the page ground is a dial,
 * and a tile or a text column can take the opposite surface — by token.
 *
 * Synclair, 2026-10-21: the manual's one graphic element (a dithered gradient
 * black → deep blue → frost blue → white) could only reach a page as an
 * uploaded texture, so the connected agent uploaded 3200 px webps (0.4–2.9 MB)
 * onto 26 dividers and painted `main{background:#000}` plus the texture on
 * every light band from custom_scripts. Each of those is a dial here.
 */
const B: Rgb = [0, 0, 0], P: Rgb = [31, 48, 74], F: Rgb = [196, 222, 255], W: Rgb = [255, 255, 255];

describe('pixel gradient: the chain', () => {
  it('in / out / band walk the brand tones between the two grounds', () => {
    expect(buildChain('in', { from: B, to: W, mid: P, highlight: F })).toEqual([B, P, F, W]);
    expect(buildChain('out', { from: B, to: W, mid: P, highlight: F })).toEqual([W, F, P, B]);
    expect(buildChain('band', { from: B, to: W, mid: P, highlight: F })).toEqual([B, P, F, P, B]);
    expect(buildChain('in', { from: B, to: W })).toEqual([B, W]);
    expect(buildChain('band', { from: B, to: W })).toEqual([B, W, B]);
    expect(buildChain('band', { from: B, to: W, mid: P })).toEqual([B, P, B]);
  });

  it('the dither is deterministic and density carries the gradient: solid ground at the top, solid far ground at the bottom', () => {
    expect(hash01(3, 4, 7)).toBe(hash01(3, 4, 7));
    expect(hash01(3, 4, 7)).not.toBe(hash01(4, 3, 7));
    for (let i = 0; i < 200; i++) { const v = hash01(i, i * 7, 1); expect(v).toBeGreaterThanOrEqual(0); expect(v).toBeLessThan(1); }
    const w = 64, h = 40;
    const data = new Uint8ClampedArray(w * h * 4);
    paintPixelGradient(data, w, h, [B, W], 7);
    const whiteDots = (y: number) => { let n = 0; for (let x = 0; x < w; x++) if (data[(y * w + x) * 4] === 255) n++; return n; };
    expect(whiteDots(0)).toBeLessThan(w * 0.1);
    expect(whiteDots(h - 1)).toBeGreaterThan(w * 0.9);
    expect(whiteDots(h - 1)).toBeGreaterThan(whiteDots(Math.floor(h / 2)));
    expect(whiteDots(Math.floor(h / 2))).toBeGreaterThan(whiteDots(0));
    for (let i = 3; i < data.length; i += 4) expect(data[i]).toBe(255); // opaque — no alpha fade pretending to be density
    const again = new Uint8ClampedArray(w * h * 4);
    paintPixelGradient(again, w, h, [B, W], 7);
    expect(Array.from(again)).toEqual(Array.from(data));
  });

  it('reads the colours a probe hands back, and the dot sizes are 2/3/4 px', () => {
    expect(parseRgb('rgb(31, 48, 74)')).toEqual(P);
    expect(parseRgb('rgba(0, 0, 0, 0.5)')).toEqual(B);
    expect(parseRgb('#C4DEFF')).toEqual(F);
    expect(parseRgb('')).toBeNull();
    expect(DOT_SIZE).toEqual({ pixel: 1, fine: 2, medium: 3, coarse: 4 });
  });
});

describe('pixel gradient: the divider', () => {
  it('shape pixel-gradient renders the drawn band — a canvas, no image — and invert still means "in"', () => {
    const { container } = render(<SectionDividerBlock data={{ shape: 'pixel-gradient', height: 'xl', direction: 'band', dot: 'fine' }} />);
    const band = container.querySelector('[data-pixel-gradient]') as HTMLElement;
    expect(band.getAttribute('data-pixel-gradient')).toBe('band');
    expect(band.getAttribute('data-pixel-dot')).toBe('fine');
    expect(band.style.height).toBe('200px');
    expect(container.querySelector('canvas')).not.toBeNull();
    expect(container.querySelector('img')).toBeNull();
    const legacy = render(<SectionDividerBlock data={{ shape: 'pixel-gradient', invert: true }} />);
    expect(legacy.container.querySelector('[data-pixel-gradient]')!.getAttribute('data-pixel-gradient')).toBe('in');
  });
});

describe('the opposite surface, by token', () => {
  const items = ['Navigate', 'Acquire', 'Track', 'Guide'].map((t, i) => ({ id: `f${i}`, title: t, description: 'x', icon: 'ScanEye' }));
  it('features: numbered prints 01…04 in the accent, cardStyle inverse puts each tile on the other surface', () => {
    const { container } = render(<MemoryRouter><FeaturesBlock data={{ features: items, variant: 'cards', cardStyle: 'inverse', numbered: true, columns: 4 }} /></MemoryRouter>);
    expect([...container.querySelectorAll('[data-feature-number]')].map((e) => e.textContent)).toEqual(['01', '02', '03', '04']);
    expect(container.querySelectorAll('.surface-inverse.bg-background').length).toBe(4);
    const plain = render(<MemoryRouter><FeaturesBlock data={{ features: items, variant: 'cards' }} /></MemoryRouter>);
    expect(plain.container.querySelector('[data-feature-number]')).toBeNull();
    expect(plain.container.querySelector('.surface-inverse')).toBeNull();
  });

  it('two-column: panel inverse puts the text column on the other surface with the panel radius', () => {
    const doc = { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'A mission.' }] }] };
    const { container } = render(<MemoryRouter><TwoColumnBlock data={{ title: 'Interceptor', content: doc as never, imageSrc: '/i.jpg', imageAlt: 'i', imagePosition: 'right', panel: 'inverse' }} /></MemoryRouter>);
    const panel = container.querySelector('[data-text-panel="inverse"]')!;
    expect(panel.className).toMatch(/surface-inverse/);
    expect(panel.className).toMatch(/radius-block/);
    const none = render(<MemoryRouter><TwoColumnBlock data={{ title: 'Interceptor', content: doc as never, imageSrc: '/i.jpg', imageAlt: 'i', imagePosition: 'right' }} /></MemoryRouter>);
    expect(none.container.querySelector('[data-text-panel]')).toBeNull();
  });
});

describe('the page ground and the gradient highlight are branding dials', () => {
  it('a dark ground applies as --background in the dark theme and as --background-inverse in the light one; the highlight is a token', () => {
    const doc = document.implementation.createHTMLDocument('t');
    doc.documentElement.classList.add('dark');
    applyBrandingToDocument({ backgroundColorDark: '0 0% 0%', gradientHighlight: '213 100% 88%' }, doc);
    expect(doc.documentElement.style.getPropertyValue('--background')).toBe('0 0% 0%');
    expect(doc.documentElement.style.getPropertyValue('--background-inverse')).toBe('');
    expect(doc.documentElement.style.getPropertyValue('--gradient-highlight')).toBe('213 100% 88%');
    doc.documentElement.classList.remove('dark');
    applyBrandingToDocument({ backgroundColorDark: '0 0% 0%' }, doc);
    expect(doc.documentElement.style.getPropertyValue('--background')).toBe('');
    expect(doc.documentElement.style.getPropertyValue('--background-inverse')).toBe('0 0% 0%');
    expect(doc.documentElement.style.getPropertyValue('--gradient-highlight')).toBe('');
  });

  it('the theme the provider is told wins over the class it finds — the class is stamped one effect later', () => {
    // Child effects run before parent effects: BrandingProvider applies in the
    // same commit ThemeProvider stamps the forced class, so the class is not
    // there yet. Told 'dark', the dark values apply although the class says light.
    const doc = document.implementation.createHTMLDocument('t');
    applyBrandingToDocument({ primaryColor: '216 41% 21%', primaryColorDark: '44 100% 50%', backgroundColorDark: '0 0% 0%' }, doc, 'dark');
    expect(doc.documentElement.style.getPropertyValue('--primary')).toBe('44 100% 50%');
    expect(doc.documentElement.style.getPropertyValue('--background')).toBe('0 0% 0%');
    expect(doc.documentElement.style.getPropertyValue('--background-inverse')).toBe('');
    expect(doc.documentElement.style.getPropertyValue('--primary-inverse')).toBe('216 41% 21%');
    // Told 'light' on a document whose class says dark, light wins too.
    doc.documentElement.classList.add('dark');
    applyBrandingToDocument({ primaryColor: '216 41% 21%', primaryColorDark: '44 100% 50%', backgroundColorDark: '0 0% 0%' }, doc, 'light');
    expect(doc.documentElement.style.getPropertyValue('--primary')).toBe('216 41% 21%');
    expect(doc.documentElement.style.getPropertyValue('--background-inverse')).toBe('0 0% 0%');
  });

  it('the catalogue carries every new dial where an agent looks', () => {
    const ref = (t: string) => BLOCK_REFERENCE.find((b) => b.type === t)!;
    const f = (t: string, n: string) => ref(t).fields.find((x) => x.name === n);
    expect(f('section-divider', 'shape')!.options).toContain('pixel-gradient');
    expect(f('section-divider', 'direction')!.options).toEqual(['in', 'out', 'band']);
    expect(f('section-divider', 'dot')!.options).toEqual(['pixel', 'fine', 'medium', 'coarse']);
    expect(f('section-divider', 'highlightColor')!.description).toMatch(/gradient_highlight/);
    expect(ref('section-divider').description).toMatch(/no image, no upload/);
    expect(f('features', 'cardStyle')!.options).toContain('inverse');
    expect(f('features', 'numbered')).toBeTruthy();
    expect(f('two-column', 'panel')!.options).toEqual(['none', 'muted', 'card', 'inverse']);
  });
});
