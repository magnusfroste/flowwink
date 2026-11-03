import { useEffect, useRef } from 'react';
import { cn } from '@/lib/utils';
import { DOT_SIZE, buildChain, paintPixelGradient, parseRgb, type PixelGradientDirection, type PixelGradientDot, type Rgb } from '@/lib/pixel-gradient';

/**
 * The pixel gradient painted on a canvas, colours from the tokens where it
 * sits: `from` is this surface's ground (--background here), `to` is the
 * inverse ground (--background inside .surface-inverse), `mid` the light
 * theme's primary — the brand's deep colour, never the dark theme's lifted
 * one — and `highlight` the --gradient-highlight token (branding
 * gradientHighlight) when set. Props override each. Repaints on resize and
 * when the document's theme or inline branding changes. See lib/pixel-gradient.
 */
export interface PixelGradientProps {
  direction?: PixelGradientDirection;
  /** Band height in px. Omitted: the band fills its parent (size it with className) and measures itself. */
  height?: number;
  dot?: PixelGradientDot;
  /** CSS colour; default the light theme's primary. */
  midColor?: string;
  /** CSS colour; default the --gradient-highlight token, none when unset. */
  highlightColor?: string;
  /** CSS colour the band reaches; default the inverse ground. A band that ends on the brand (BlogCover) names it here. */
  toColor?: string;
  seed?: number;
  className?: string;
}

export function PixelGradient({ direction = 'in', height, dot = 'medium', midColor, highlightColor, toColor, seed = 7, className }: PixelGradientProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const host = hostRef.current;
    const canvas = canvasRef.current;
    if (!host || !canvas) return;
    const doc = host.ownerDocument;

    const resolve = (css: string, inverse: boolean): Rgb | null => {
      const probe = doc.createElement('span');
      if (inverse) probe.className = 'surface-inverse';
      probe.style.color = css;
      host.appendChild(probe);
      const rgb = parseRgb(doc.defaultView?.getComputedStyle(probe).color);
      probe.remove();
      return rgb;
    };

    const draw = () => {
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      const isDark = doc.documentElement.classList.contains('dark');
      const from = resolve('hsl(var(--background))', false) ?? [0, 0, 0];
      const to = (toColor ? resolve(toColor, false) : resolve('hsl(var(--background))', true)) ?? [255, 255, 255];
      const mid = midColor ? resolve(midColor, false) : resolve('hsl(var(--primary))', isDark);
      const tokenHighlight = doc.defaultView?.getComputedStyle(doc.documentElement).getPropertyValue('--gradient-highlight').trim();
      const highlight = highlightColor ? resolve(highlightColor, false) : tokenHighlight ? resolve(`hsl(${tokenHighlight})`, false) : null;
      const chain = buildChain<Rgb>(direction, { from, to, mid: mid ?? undefined, highlight: highlight ?? undefined });
      const px = DOT_SIZE[dot] ?? DOT_SIZE.medium;
      const w = Math.max(1, Math.ceil(host.clientWidth / px));
      const h = Math.max(1, Math.ceil((height ?? host.clientHeight) / px));
      canvas.width = w;
      canvas.height = h;
      const img = ctx.createImageData(w, h);
      paintPixelGradient(img.data, w, h, chain, seed);
      ctx.putImageData(img, 0, 0);
    };

    draw();
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(draw) : null;
    ro?.observe(host);
    const mo = typeof MutationObserver !== 'undefined' ? new MutationObserver(draw) : null;
    mo?.observe(doc.documentElement, { attributes: true, attributeFilter: ['class', 'style'] });
    return () => { ro?.disconnect(); mo?.disconnect(); };
  }, [direction, height, dot, midColor, highlightColor, toColor, seed]);

  return (
    <div
      ref={hostRef}
      className={cn('relative w-full overflow-hidden leading-[0]', className)}
      style={height !== undefined ? { height: `${height}px` } : undefined}
      aria-hidden="true"
      data-pixel-gradient={direction}
      data-pixel-dot={dot}
    >
      <canvas ref={canvasRef} className="block h-full w-full [image-rendering:pixelated]" />
    </div>
  );
}
