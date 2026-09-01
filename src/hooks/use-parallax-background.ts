import { useEffect, useRef } from 'react';

/**
 * True parallax for a section's background layer, shared by HeroBlock and
 * ParallaxSectionBlock.
 *
 * The technique: the background layer is rendered 30% taller than its section
 * (top: -15%, height: 130%) and translated at a fraction of the scroll delta,
 * so the image drifts slower than the page. This is the only implementation
 * that works everywhere — `background-attachment: fixed` renders BLANK in iOS
 * Safari together with bg-cover (found live on an iPhone, 2026-09-01), and
 * Chrome silently degrades it to a static background on composited layers.
 *
 * Respects prefers-reduced-motion: the layer simply stays put.
 */
export function useParallaxBackground(enabled: boolean) {
  const sectionRef = useRef<HTMLElement | null>(null);
  const bgRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const section = sectionRef.current;
    const bg = bgRef.current;
    if (!enabled || !section || !bg) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    let raf = 0;
    const update = () => {
      raf = 0;
      const rect = section.getBoundingClientRect();
      if (rect.bottom < 0 || rect.top > window.innerHeight) return;
      // -1 (section below viewport) … +1 (above); 0 when centered.
      const progress =
        (rect.top + rect.height / 2 - window.innerHeight / 2) /
        (window.innerHeight / 2 + rect.height / 2);
      // The layer is 30% taller, so ±15% of section height stays covered.
      const shift = -progress * rect.height * 0.15;
      bg.style.transform = `translate3d(0, ${shift}px, 0)`;
    };
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(update);
    };
    update();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll, { passive: true });
    return () => {
      if (raf) cancelAnimationFrame(raf);
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
    };
  }, [enabled]);

  return { sectionRef, bgRef };
}

/** Style for the oversized background layer the hook translates. */
export const parallaxLayerStyle = { top: '-15%', height: '130%' } as const;
