import { useEffect, useState, type ElementType } from 'react';
import { cn } from '@/lib/utils';

/**
 * A 3D model on the page — the product, the mark, the part — rendered by
 * Google's <model-viewer> web component (Apache-2.0), loaded only on pages
 * that carry this block. Declarative: an agent writes { src } and the dials;
 * no three.js, no scene code. The agency's MOSS page (2026-10-22) draws its
 * aperture model with a hand-written three.js canvas; this is the same
 * picture as a block.
 *
 * The model must be the customer's own .glb/.gltf (media_browse imports it
 * like an image; ≤ MAX_MODEL_BYTES). The poster is what shows before the
 * model loads and where motion is reduced; autoRotate stops for
 * prefers-reduced-motion.
 */
export interface ModelViewerBlockData {
  /** The .glb / .gltf URL (the url media_browse returns). */
  src: string;
  /** A still shown before the model loads and where motion is reduced. */
  poster?: string;
  /** Accessible description of the model. */
  alt?: string;
  /** Turn slowly by itself (default true; off under prefers-reduced-motion). */
  autoRotate?: boolean;
  /** Let the visitor drag to turn and pinch to zoom (default true). */
  cameraControls?: boolean;
  /** Stage height: sm 280 / md 380 / lg 480 / xl 600 px. */
  height?: 'sm' | 'md' | 'lg' | 'xl';
  /** Lighting exposure 0.5–2 (default 1). */
  exposure?: number;
  /** Shadow under the model 0–1 (default 0.6). */
  shadowIntensity?: number;
  caption?: string;
}

const HEIGHT = { sm: 280, md: 380, lg: 480, xl: 600 } as const;
// The element is a custom element; React renders it by tag name.
const ModelViewerTag = 'model-viewer' as unknown as ElementType;

export function ModelViewerBlock({ data }: { data: ModelViewerBlockData }) {
  const [ready, setReady] = useState(false);
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    let alive = true;
    // Lazy: the component (and its wasm) joins the page only here.
    import('@google/model-viewer').then(() => { if (alive) setReady(true); }).catch(() => {});
    const mq = typeof window !== 'undefined' && window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;
    if (mq) { setReduced(mq.matches); const on = () => setReduced(mq.matches); mq.addEventListener?.('change', on); return () => { alive = false; mq.removeEventListener?.('change', on); }; }
    return () => { alive = false; };
  }, []);
  if (!data.src) return null;
  const height = HEIGHT[data.height ?? 'md'] ?? HEIGHT.md;
  const autoRotate = data.autoRotate !== false && !reduced;
  return (
    <figure className="w-full" data-model-viewer={ready ? 'ready' : 'loading'}>
      <div className={cn('relative w-full overflow-hidden rounded-[var(--radius-block,1rem)]')} style={{ height }}>
        {data.poster && !ready && (
          <img src={data.poster} alt={data.alt || ''} className="absolute inset-0 h-full w-full object-contain" />
        )}
        <ModelViewerTag
          src={data.src}
          poster={data.poster || undefined}
          alt={data.alt || ''}
          auto-rotate={autoRotate ? '' : undefined}
          camera-controls={data.cameraControls !== false ? '' : undefined}
          exposure={String(data.exposure ?? 1)}
          shadow-intensity={String(data.shadowIntensity ?? 0.6)}
          loading="lazy"
          reveal="auto"
          style={{ width: '100%', height: '100%', backgroundColor: 'transparent' }}
          data-auto-rotate={autoRotate ? 'on' : 'off'}
        />
      </div>
      {data.caption && <figcaption className="mt-3 text-center text-sm text-muted-foreground">{data.caption}</figcaption>}
    </figure>
  );
}
