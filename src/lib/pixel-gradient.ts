/**
 * The PIXEL GRADIENT — a brand manual's transition element drawn by the
 * platform instead of uploaded as an image.
 *
 * Synclair's manual (v1.0, Oct 2026) names one graphic element: a dithered
 * gradient black → deep blue → frost blue → white, used as a background, as
 * the transition between sections and as the overlap edge of pictures. Until
 * 2026-10-21 the only way onto a page was a texture image: the agency's
 * 8014×4500 PNG (7 MB), then the connected agent's own 3200 px webp
 * re-uploads (0.4–2.9 MB each, 26 dividers) — and a page-wide copy of it
 * painted on `main` from custom_scripts. This module is the element itself:
 * a deterministic ordered dither over a colour chain, zero bytes to load,
 * identical on every page, every colour a token.
 *
 * Pure functions here (testable without a canvas); the <PixelGradient>
 * component resolves the tokens and paints.
 */
export type PixelGradientDirection = 'in' | 'out' | 'band';
export type PixelGradientDot = 'pixel' | 'fine' | 'medium' | 'coarse';
export type Rgb = [number, number, number];

/**
 * Dot size in CSS px. "pixel" (1 px) is the grain of a dithered PNG drawn at
 * image resolution — Synclair's SH draft and the agency's Next.js build both
 * read that fine; 3 px reads as pixel art. Measured 2026-10-21 against
 * synclair-website.vercel.app's 616×195 tile: 1 px dots, repeat-x.
 */
export const DOT_SIZE: Record<PixelGradientDot, number> = { pixel: 1, fine: 2, medium: 3, coarse: 4 };

export interface ChainStops<T> {
  /** The surface the band leaves: this section's ground. */
  from: T;
  /** The surface it reaches: the inverse ground. */
  to: T;
  /** The brand's deep tone between them (default: the light theme's primary). */
  mid?: T;
  /** The brand's light tone before `to` (the manual's frost blue); optional. */
  highlight?: T;
}

/**
 * The colour chain the dither walks top → bottom.
 *  in    from → mid → highlight → to          (page ground into the inverse band)
 *  out   to → highlight → mid → from          (the inverse band back to the page)
 *  band  from → mid → highlight → mid → from  (a decorative band, same ground both sides)
 */
export function buildChain<T>(direction: PixelGradientDirection, s: ChainStops<T>): T[] {
  const up = [s.from, s.mid, s.highlight].filter((c): c is T => c !== undefined && c !== null);
  if (direction === 'band') {
    const inner = up.slice(1);
    if (inner.length === 0) return [s.from, s.to, s.from];
    return [s.from, ...inner, ...inner.slice(0, -1).reverse(), s.from];
  }
  const chain = [...up, s.to];
  return direction === 'out' ? chain.reverse() : chain;
}

/** Deterministic hash → [0, 1). Same (x, y, seed) gives the same dot on every device and visit. */
export function hash01(x: number, y: number, seed: number): number {
  let h = (Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(seed, 982451653)) >>> 0;
  h = (h ^ (h >>> 13)) >>> 0;
  h = Math.imul(h, 1274126177) >>> 0;
  h = (h ^ (h >>> 16)) >>> 0;
  return h / 4294967296;
}

/** "rgb(r, g, b)" / "rgba(r, g, b, a)" / "#rrggbb" → [r, g, b]; null when unreadable. */
export function parseRgb(css: string | null | undefined): Rgb | null {
  if (!css) return null;
  const m = css.match(/rgba?\(\s*(\d+)[\s,]+(\d+)[\s,]+(\d+)/i);
  if (m) return [Number(m[1]), Number(m[2]), Number(m[3])];
  const h = css.trim().match(/^#([0-9a-f]{6})$/i);
  if (h) { const n = parseInt(h[1], 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
  return null;
}

/**
 * The brand gradient as the OVERLAP EDGE of a picture — the manual's third
 * use of the element, and what the agency's build draws with a 331×346 PNG
 * tile over the hero photo. One colour (the page ground) at full alpha where
 * dots fall, transparent elsewhere; density 1 at the edge → 0 at `extent`
 * of the picture's width (or height). The picture shows through between the
 * dots, so it dissolves into the ground as grain, not as a fade.
 */
export function paintDitherEdge(data: Uint8ClampedArray, w: number, h: number, edge: 'left' | 'right' | 'top' | 'bottom', ground: Rgb, extent = 0.42, seed = 11): void {
  const span = (edge === 'left' || edge === 'right' ? w : h) * extent;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const dist = edge === 'left' ? x : edge === 'right' ? w - 1 - x : edge === 'top' ? y : h - 1 - y;
      const t = span > 0 ? Math.max(0, 1 - dist / span) : 0;
      const on = t > 0 && hash01(x, y, seed) < t * t; // squared: a short solid rim, then a long grain tail
      const i = (y * w + x) * 4;
      data[i] = ground[0]; data[i + 1] = ground[1]; data[i + 2] = ground[2]; data[i + 3] = on ? 255 : 0;
    }
  }
}

/**
 * Fill `data` (RGBA, w×h, one entry per DOT) with the dithered chain: at row
 * y the chain is at stage s = floor(t·n) with progress u, and a dot shows the
 * next colour when its hash is below u — so density, not opacity, carries the
 * gradient, which is what "pixelated" means.
 */
export function paintPixelGradient(data: Uint8ClampedArray, w: number, h: number, chain: Rgb[], seed = 7): void {
  const n = chain.length - 1;
  if (n < 1) {
    const c = chain[0] ?? [0, 0, 0];
    for (let i = 0; i < w * h; i++) { data[i * 4] = c[0]; data[i * 4 + 1] = c[1]; data[i * 4 + 2] = c[2]; data[i * 4 + 3] = 255; }
    return;
  }
  for (let y = 0; y < h; y++) {
    const t = (y + 0.5) / h;
    const s = Math.min(n - 1, Math.floor(t * n));
    const u = t * n - s;
    for (let x = 0; x < w; x++) {
      const c = hash01(x, y, seed) < u ? chain[s + 1] : chain[s];
      const i = (y * w + x) * 4;
      data[i] = c[0]; data[i + 1] = c[1]; data[i + 2] = c[2]; data[i + 3] = 255;
    }
  }
}
