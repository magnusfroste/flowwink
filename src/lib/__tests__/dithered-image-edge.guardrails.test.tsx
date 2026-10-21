import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { ImageTreatment } from '@/components/public/ImageTreatment';
import { paintDitherEdge } from '@/lib/pixel-gradient';
import { BLOCK_REFERENCE } from '@/lib/block-reference';

/**
 * Guardrail: a picture's dissolve can be the brand's pixel gradient as GRAIN
 * over one edge — the manual's "gradient as an overlap on pictures", what the
 * agency's build draws with a dithered PNG tile over the hero. Drawn from the
 * page ground, nothing to upload; the smooth CSS fade stays the default.
 */
describe('dithered image edge', () => {
  it('the mask is solid at the edge, transparent past the extent, and thins in between', () => {
    const w = 100, h = 10;
    const data = new Uint8ClampedArray(w * h * 4);
    paintDitherEdge(data, w, h, 'left', [0, 0, 0], 0.42, 11);
    const on = (x: number) => { let n = 0; for (let y = 0; y < h; y++) if (data[(y * w + x) * 4 + 3] === 255) n++; return n; };
    expect(on(0)).toBe(h);
    expect(on(99)).toBe(0);
    expect(on(60)).toBe(0); // past 42 %
    expect(on(8)).toBeGreaterThan(on(30));
    for (let i = 0; i < data.length; i += 4) { expect(data[i]).toBe(0); expect([0, 255]).toContain(data[i + 3]); }
    const right = new Uint8ClampedArray(w * h * 4);
    paintDitherEdge(right, w, h, 'right', [255, 255, 255], 0.42, 11);
    expect(right[(0 * w + 99) * 4 + 3]).toBe(255);
    expect(right[(0 * w + 0) * 4 + 3]).toBe(0);
  });

  it('edgeStyle dither renders the grain canvas instead of the fade; the default keeps the fade', () => {
    const d = render(<ImageTreatment edge="left" edgeStyle="dither"><img src="/x.jpg" alt="" /></ImageTreatment>);
    expect(d.container.querySelector('canvas[data-image-edge-dither="left"]')).not.toBeNull();
    expect(d.container.querySelector('div[data-image-edge-overlay]')).toBeNull();
    const s = render(<ImageTreatment edge="left"><img src="/x.jpg" alt="" /></ImageTreatment>);
    expect(s.container.querySelector('canvas')).toBeNull();
    expect((s.container.querySelector('div[data-image-edge-overlay]') as HTMLElement).style.background).toMatch(/to right/);
    const none = render(<ImageTreatment edgeStyle="dither"><img src="/x.jpg" alt="" /></ImageTreatment>);
    expect(none.container.querySelector('canvas')).toBeNull();
  });

  it('the catalogue carries the dial on hero and two-column', () => {
    for (const type of ['hero', 'two-column']) {
      const f = BLOCK_REFERENCE.find((b) => b.type === type)!.fields.find((x) => x.name === 'imageEdgeStyle')!;
      expect(f.options).toEqual(['smooth', 'dither']);
      expect(f.description).toMatch(/nothing to upload/);
    }
  });
});
