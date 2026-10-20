import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { hasImageTreatment } from '@/lib/image-treatment';

/**
 * The image TREATMENT dials, shared by every block that shows a content image
 * (two-column, hero split layout): what a brand manual says about pictures
 * and what a block could not say until 2026-10-21.
 *
 * Synclair's manual: photos are real and often black-and-white, the pixel
 * gradient overlaps one edge so the picture dissolves into the ground, and
 * the design reference frames each picture with HUD corner brackets and a
 * small label ("INTERCEPTOR", "TARGET LOCK"). The connected ChatGPT, with no
 * dial for any of it, left the pictures plain. Three dials, all tokens:
 *
 *  treatment  none | grayscale          — a CSS filter, the source stays colour
 *  edge       none | left | right |     — a gradient from the page GROUND
 *             top | bottom                (hsl(var(--background))) over ~40 %
 *                                          of that edge; on a dark page a dark
 *                                          dissolve, on a light band a light one
 *  frame      none | hud                — four corner brackets in the accent
 *                                          colour, an optional label badge
 *                                          (bottom-left) and two small
 *                                          monospace readouts (top corners)
 *
 * The wrapper is position:relative and takes the image's rounding so the
 * overlays clip with it. It renders nothing extra when every dial is off.
 */
export type ImageTreatmentKind = 'none' | 'grayscale';
export type ImageEdge = 'none' | 'left' | 'right' | 'top' | 'bottom';
export type ImageFrame = 'none' | 'hud';

export interface ImageTreatmentProps {
  treatment?: ImageTreatmentKind;
  edge?: ImageEdge;
  frame?: ImageFrame;
  /** HUD label badge, bottom-left ("INTERCEPTOR"). Printed uppercase. */
  label?: string;
  /** HUD readout, top-left ("ALT 1.2M · AR 24"). Monospace, muted. */
  meta?: string;
  /** HUD readout, top-right. */
  metaRight?: string;
  /** Rounding class of the image, so overlays clip with it. */
  roundedClassName?: string;
  className?: string;
  children: ReactNode;
}

const EDGE_GRADIENT: Record<Exclude<ImageEdge, 'none'>, string> = {
  left: 'linear-gradient(to right, hsl(var(--background)) 0%, hsl(var(--background) / 0.6) 18%, transparent 42%)',
  right: 'linear-gradient(to left, hsl(var(--background)) 0%, hsl(var(--background) / 0.6) 18%, transparent 42%)',
  top: 'linear-gradient(to bottom, hsl(var(--background)) 0%, hsl(var(--background) / 0.6) 18%, transparent 42%)',
  bottom: 'linear-gradient(to top, hsl(var(--background)) 0%, hsl(var(--background) / 0.6) 18%, transparent 42%)',
};

const corner = 'absolute h-5 w-5 border-[hsl(var(--accent))]';

export function ImageTreatment({ treatment, edge, frame, label, meta, metaRight, roundedClassName, className, children }: ImageTreatmentProps) {
  if (!hasImageTreatment({ treatment, edge, frame })) return <>{children}</>;
  const edgeOn = edge && edge !== 'none' ? edge : null;
  const hud = frame === 'hud';
  return (
    <div className={cn('relative overflow-hidden', roundedClassName, className)} data-image-treatment={treatment ?? 'none'} data-image-edge={edgeOn ?? 'none'} data-image-frame={frame ?? 'none'}>
      {children}
      {edgeOn && (
        <div aria-hidden="true" className="pointer-events-none absolute inset-0" style={{ background: EDGE_GRADIENT[edgeOn] }} data-image-edge-overlay />
      )}
      {hud && (
        <div aria-hidden="true" className="pointer-events-none absolute inset-3 text-[hsl(var(--accent))]" data-image-hud>
          <span className={cn(corner, 'left-0 top-0 border-l border-t')} />
          <span className={cn(corner, 'right-0 top-0 border-r border-t')} />
          <span className={cn(corner, 'left-0 bottom-0 border-l border-b')} />
          <span className={cn(corner, 'right-0 bottom-0 border-r border-b')} />
          {meta && <span className="absolute left-7 top-0 font-mono text-[10px] uppercase tracking-widest text-white/70">{meta}</span>}
          {metaRight && <span className="absolute right-7 top-0 font-mono text-[10px] uppercase tracking-widest text-white/70">{metaRight}</span>}
          {label && (
            <span className="absolute left-7 bottom-0 border border-current px-2 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-widest" data-image-label>
              {label}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
