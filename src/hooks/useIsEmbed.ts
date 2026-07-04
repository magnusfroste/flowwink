import { useLocation } from 'react-router-dom';

const STORAGE_KEY = 'flowwink:embed';

/**
 * Returns true when URL has ?embed=1 OR when embed mode was previously set
 * in this browsing context (sessionStorage). This keeps public-site chrome
 * hidden even after clicking internal links inside an admin preview iframe.
 */
export function useIsEmbed(): boolean {
  const { search } = useLocation();
  const fromQuery = new URLSearchParams(search).get('embed') === '1';

  if (typeof window === 'undefined') return fromQuery;

  // Only enable sticky embed when we're actually inside an iframe — never on
  // the top-level public site.
  const inIframe = window.self !== window.top;
  if (!inIframe) return fromQuery;

  try {
    if (fromQuery) {
      window.sessionStorage.setItem(STORAGE_KEY, '1');
      return true;
    }
    return window.sessionStorage.getItem(STORAGE_KEY) === '1';
  } catch {
    return fromQuery;
  }
}

/** Append ?embed=1 to an internal path, preserving existing query. */
export function withEmbed(path: string): string {
  const [base, query = ''] = path.split('?');
  const params = new URLSearchParams(query);
  params.set('embed', '1');
  return `${base}?${params.toString()}`;
}
