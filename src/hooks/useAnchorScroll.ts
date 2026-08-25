import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';

/**
 * Hook to handle smooth scrolling to anchor targets.
 * - Scrolls to hash target on initial page load
 * - Listens for hash changes during navigation
 */
/**
 * @param ready pass the page's data-loaded state. Cross-page links like
 *   /products#internet land BEFORE the async get-page fetch has rendered any
 *   blocks — the old two-shot retry (0ms + 100ms) lost that race on every cold
 *   load and gave up silently, and the effect never re-ran when the content
 *   finally arrived (deps carried only the hash). Same-page clicks always
 *   worked, which is why the gap survived: the broken case was the one you
 *   only hit arriving from ANOTHER page.
 */
export function useAnchorScroll(ready: boolean = true) {
  const location = useLocation();

  useEffect(() => {
    if (!ready) return; // re-runs when the content lands — ready is a dep
    const hash = location.hash;
    if (!hash) return;

    const targetId = hash.slice(1);
    if (!targetId) return;

    const scrollToTarget = () => {
      const element = document.getElementById(targetId);
      if (element) {
        element.scrollIntoView({ behavior: 'smooth', block: 'start' });
        return true;
      }
      return false;
    };

    // Bounded retry: blocks render a beat after the data flag flips (React
    // commit + lazy chunks), so poll briefly rather than trust one timeout.
    if (scrollToTarget()) return;
    let attempts = 0;
    const intervalId = setInterval(() => {
      attempts += 1;
      if (scrollToTarget() || attempts >= 30) clearInterval(intervalId); // ≤3s
    }, 100);

    return () => clearInterval(intervalId);
  }, [location.hash, ready]);
}

/**
 * Utility function to handle anchor link clicks with smooth scrolling.
 * Use this for links that start with # to enable smooth scrolling.
 */
export function handleAnchorClick(
  e: React.MouseEvent<HTMLAnchorElement>,
  href: string
) {
  // Only handle hash links
  if (!href.startsWith('#')) return;

  e.preventDefault();
  const targetId = href.slice(1);
  const element = document.getElementById(targetId);

  if (element) {
    element.scrollIntoView({
      behavior: 'smooth',
      block: 'start',
    });
    // Update URL hash without scrolling
    window.history.pushState(null, '', href);
  }
}

/**
 * Check if a URL is an anchor link (starts with #)
 */
export function isAnchorLink(url?: string): boolean {
  return !!url && url.startsWith('#');
}
