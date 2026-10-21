import { useEffect, useRef } from 'react';
import { paintDitherEdge, parseRgb, type Rgb } from '@/lib/pixel-gradient';

/**
 * A picture's edge dissolved into the page ground as GRAIN — the brand's
 * pixel gradient laid over one edge (Synclair's manual: "the gradient as an
 * overlap on pictures"; the agency's build: a dithered PNG tile over the
 * hero). Drawn on a canvas at 1 CSS px from the --background token where it
 * sits, so it is the dark ground on a dark page and the light one on a
 * light band. Absolute, inset-0, pointer-events none; repaints on resize
 * and theme change.
 */
export function DitherEdge({ edge }: { edge: 'left' | 'right' | 'top' | 'bottom' }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const host = canvas.parentElement;
    const doc = canvas.ownerDocument;
    if (!host) return;
    const draw = () => {
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      const probe = doc.createElement('span');
      probe.style.color = 'hsl(var(--background))';
      host.appendChild(probe);
      const ground: Rgb = parseRgb(doc.defaultView?.getComputedStyle(probe).color) ?? [0, 0, 0];
      probe.remove();
      const w = Math.max(1, Math.round(host.clientWidth));
      const h = Math.max(1, Math.round(host.clientHeight));
      canvas.width = w;
      canvas.height = h;
      const img = ctx.createImageData(w, h);
      paintDitherEdge(img.data, w, h, edge, ground);
      ctx.putImageData(img, 0, 0);
    };
    draw();
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(draw) : null;
    ro?.observe(host);
    const mo = typeof MutationObserver !== 'undefined' ? new MutationObserver(draw) : null;
    mo?.observe(doc.documentElement, { attributes: true, attributeFilter: ['class', 'style'] });
    return () => { ro?.disconnect(); mo?.disconnect(); };
  }, [edge]);
  return <canvas ref={ref} aria-hidden="true" className="pointer-events-none absolute inset-0 h-full w-full [image-rendering:pixelated]" data-image-edge-overlay data-image-edge-dither={edge} />;
}
