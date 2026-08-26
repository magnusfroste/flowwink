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

    // Resolve globals from the element's OWN document/window: inside the page
    // editor's device-preview iframe the relevant viewport (and the branding
    // data attribute) belong to the frame, not the top window. In the normal
    // case ownerDocument IS the top document, so this changes nothing.
    const doc = element.ownerDocument;
    const win = doc.defaultView ?? window;

    // Honor reduced motion + global off switch — render immediately.
    const reduced = win.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    const mode = doc.documentElement.dataset.scrollAnimations;

    if (reduced || mode === 'off') {
      setIsVisible(true);
      return;
    }

    const effectiveRootMargin =
      rootMargin ??
      (mode === 'eager' ? '0px 0px 200px 0px' : '0px 0px -50px 0px');

    const observer = new win.IntersectionObserver(
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
