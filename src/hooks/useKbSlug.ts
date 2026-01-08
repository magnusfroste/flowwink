import { useLocation } from 'react-router-dom';

/**
 * Resolves the KB page slug for article/search links.
 * Uses the configured slug if provided, otherwise derives from current URL.
 * 
 * @param configuredSlug - Optional slug configured in block settings
 * @param fallback - Default fallback slug (defaults to 'help')
 * @returns The resolved KB slug
 */
export function useKbSlug(configuredSlug?: string, fallback = 'help'): string {
  const location = useLocation();
  
  if (configuredSlug) {
    return configuredSlug;
  }
  
  // Derive from current page URL (e.g., /help -> help)
  const pathSlug = location.pathname.split('/')[1];
  return pathSlug || fallback;
}
