import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * The header's pin strip scrolls sideways with no visible scrollbar
 * (`scrollbar-none`), so a pin past the right edge was simply gone: nothing
 * said the row continued. With the limit raised from 8 to 12 (2026-10-04) that
 * silence would hide a third of a full row at laptop width. This wrapper
 * watches the strip and shows a fade plus a chevron on whichever side has
 * more; the chevron scrolls one viewport. Pointer events pass through the
 * fades so the pins underneath stay clickable and draggable.
 */
export function PinnedScroller({ children, className }: { children: ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [edges, setEdges] = useState({ left: false, right: false });

  const measure = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    const left = el.scrollLeft > 1;
    const right = el.scrollLeft + el.clientWidth < el.scrollWidth - 1;
    setEdges((prev) => (prev.left === left && prev.right === right ? prev : { left, right }));
  }, []);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    measure();
    el.addEventListener('scroll', measure, { passive: true });
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(measure) : null;
    ro?.observe(el);
    // The strip's content changes when a pin is added or removed.
    const mo = typeof MutationObserver !== 'undefined' ? new MutationObserver(measure) : null;
    mo?.observe(el, { childList: true, subtree: true });
    return () => {
      el.removeEventListener('scroll', measure);
      ro?.disconnect();
      mo?.disconnect();
    };
  }, [measure]);

  const nudge = (dir: -1 | 1) => {
    const el = ref.current;
    if (!el) return;
    el.scrollBy({ left: dir * Math.max(120, el.clientWidth * 0.8), behavior: 'smooth' });
  };

  return (
    <div className={cn('relative flex-1 min-w-0 ml-1', className)}>
      <div ref={ref} className="flex items-center gap-0.5 overflow-x-auto scrollbar-none min-w-0" data-pinned-scroller>
        {children}
      </div>
      {edges.left && (
        <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center bg-gradient-to-r from-background via-background/80 to-transparent pr-6">
          <button
            type="button"
            onClick={() => nudge(-1)}
            aria-label="Scroll pinned pages left"
            className="pointer-events-auto rounded p-0.5 text-muted-foreground hover:text-foreground"
          >
            <ChevronLeft className="h-3.5 w-3.5" />
          </button>
        </div>
      )}
      {edges.right && (
        <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center justify-end bg-gradient-to-l from-background via-background/80 to-transparent pl-6">
          <button
            type="button"
            onClick={() => nudge(1)}
            aria-label="Scroll pinned pages right"
            className="pointer-events-auto rounded p-0.5 text-muted-foreground hover:text-foreground"
          >
            <ChevronRight className="h-3.5 w-3.5" />
          </button>
        </div>
      )}
    </div>
  );
}
