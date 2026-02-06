import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';

/**
 * Hook to handle smooth scrolling to anchor targets.
 * - Scrolls to hash target on initial page load
 * - Listens for hash changes during navigation
 */
export function useAnchorScroll() {
  const location = useLocation();

  useEffect(() => {
    const hash = location.hash;
    if (!hash) return;

    // Remove the # prefix
    const targetId = hash.slice(1);
    if (!targetId) return;

    // Small delay to ensure the page content is rendered
    const scrollToTarget = () => {
      const element = document.getElementById(targetId);
      if (element) {
        element.scrollIntoView({
          behavior: 'smooth',
          block: 'start',
        });
      }
    };

    // Try immediately, then with a delay for dynamic content
    scrollToTarget();
    const timeoutId = setTimeout(scrollToTarget, 100);

    return () => clearTimeout(timeoutId);
  }, [location.hash]);
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
