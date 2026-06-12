import { useEffect, useRef, useState } from 'react';

interface UseScrollAnimationOptions {
  threshold?: number;
  rootMargin?: string;
  triggerOnce?: boolean;
}

/**
 * Reveal-on-scroll hook.
 *
 * Respects two global signals:
 *  - `prefers-reduced-motion: reduce` → skip animation, show immediately.
 *  - `<html data-scroll-animations="...">` set by BrandingProvider:
 *      'off'   → skip animation, show immediately.
 *      'eager' → use rootMargin '0px 0px 200px 0px' so reveals pre-trigger
 *                before the block enters view (recommended for fast scroll).
 *      'on'    → default rootMargin '0px 0px -50px 0px'.
 */
export function useScrollAnimation<T extends HTMLElement = HTMLDivElement>(
  options: UseScrollAnimationOptions = {}
) {
  const { threshold = 0.1, rootMargin, triggerOnce = true } = options;
  const ref = useRef<T>(null);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;

    // Honor reduced motion + global off switch — render immediately.
    const reduced =
      typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    const mode =
      typeof document !== 'undefined'
        ? document.documentElement.dataset.scrollAnimations
        : undefined;

    if (reduced || mode === 'off') {
      setIsVisible(true);
      return;
    }

    const effectiveRootMargin =
      rootMargin ??
      (mode === 'eager' ? '0px 0px 200px 0px' : '0px 0px -50px 0px');

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true);
          if (triggerOnce) {
            observer.unobserve(element);
          }
        } else if (!triggerOnce) {
          setIsVisible(false);
        }
      },
      { threshold, rootMargin: effectiveRootMargin }
    );

    observer.observe(element);

    return () => {
      observer.unobserve(element);
    };
  }, [threshold, rootMargin, triggerOnce]);

  return { ref, isVisible };
}
