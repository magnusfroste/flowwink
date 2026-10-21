import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { TwoColumnBlock } from '../TwoColumnBlock';
import { ImageTreatment } from '@/components/public/ImageTreatment';
import { hasImageTreatment } from '@/lib/image-treatment';
import { BLOCK_REFERENCE } from '@/lib/block-reference';
import type { TwoColumnBlockData } from '@/types/cms';

/**
 * Guardrail: a picture's treatment is three dials, not a stylesheet.
 *
 * Synclair's brand manual: photos are real and often black-and-white, the
 * pixel gradient overlaps one edge so the picture dissolves into the ground,
 * and the design reference frames each picture with HUD corner brackets and a
 * small label. No block could say any of it; the agent left the pictures
 * plain. ImageTreatment is the shared dial set, used by two-column and the
 * hero's split layout; every colour in it is a token (page ground, accent).
 */
const doc = (text: string) => ({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text }] }] });
const base: TwoColumnBlockData = { title: 'Interceptor', content: doc('Vision onboard.') as never, imageSrc: '/i.jpg', imageAlt: 'Interceptor', imagePosition: 'right' };
const mount = (data: TwoColumnBlockData) => render(<MemoryRouter><TwoColumnBlock data={data} /></MemoryRouter>);

describe('image treatment', () => {
  it('two-column: grayscale filters the image, the edge dissolves from the page ground, the HUD frames it with a label', () => {
    const { container } = mount({ ...base, imageTreatment: 'grayscale', imageEdge: 'left', imageFrame: 'hud', imageLabel: 'Interceptor', imageMeta: 'IR · 640×512' });
    const wrap = container.querySelector('[data-image-treatment]')!;
    expect(wrap).not.toBeNull();
    expect(wrap.getAttribute('data-image-edge')).toBe('left');
    expect(container.querySelector('img')!.className).toMatch(/grayscale/);
    const overlay = container.querySelector('[data-image-edge-overlay]') as HTMLElement;
    expect(overlay.style.background).toMatch(/to right/);
    expect(overlay.style.background).toMatch(/hsl\(var\(--background\)\)/);
    const hud = container.querySelector('[data-image-hud]')!;
    expect(hud.querySelectorAll('span.border-l, span.border-r').length).toBeGreaterThanOrEqual(4);
    expect(container.querySelector('[data-image-label]')!.textContent).toBe('Interceptor');
    expect(hud.textContent).toMatch(/IR · 640×512/);
  });

  it('with every dial off the image renders exactly as before — no wrapper, no overlay', () => {
    const { container } = mount(base);
    expect(container.querySelector('[data-image-treatment]')).toBeNull();
    expect(container.querySelector('img')!.className).not.toMatch(/grayscale/);
    expect(hasImageTreatment({})).toBe(false);
    expect(hasImageTreatment({ edge: 'bottom' })).toBe(true);
  });

  it('the edge takes the page ground in every direction, and the frame never invents a readout', () => {
    for (const edge of ['top', 'bottom', 'right'] as const) {
      const { container } = render(<ImageTreatment edge={edge}><img src="/x.jpg" alt="" /></ImageTreatment>);
      const o = container.querySelector('[data-image-edge-overlay]') as HTMLElement;
      expect(o.style.background).toMatch(/hsl\(var\(--background\)\)/);
    }
    const { container } = render(<ImageTreatment frame="hud"><img src="/x.jpg" alt="" /></ImageTreatment>);
    expect(container.querySelector('[data-image-hud]')!.textContent).toBe('');
  });

  it('the catalogue carries the dials on two-column and hero, with the no-invented-telemetry rule', () => {
    for (const type of ['two-column', 'hero']) {
      const ref = BLOCK_REFERENCE.find((b) => b.type === type)!;
      const f = (n: string) => ref.fields.find((x) => x.name === n)!;
      expect(f('imageTreatment').options).toEqual(['none', 'grayscale']);
      expect(f('imageEdge').options).toEqual(['none', 'left', 'right', 'top', 'bottom']);
      expect(f('imageFrame').options).toEqual(['none', 'hud']);
      expect(f('imageLabel')).toBeTruthy();
      expect(f('imageMeta').description).toMatch(/never invented telemetry/);
    }
  });
});
