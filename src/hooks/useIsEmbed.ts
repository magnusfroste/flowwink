import { useLocation } from 'react-router-dom';

/** Returns true when URL has ?embed=1 — used to hide public chrome inside admin previews. */
export function useIsEmbed(): boolean {
  const { search } = useLocation();
  return new URLSearchParams(search).get('embed') === '1';
}

/** Append ?embed=1 to an internal path, preserving existing query. */
export function withEmbed(path: string): string {
  const [base, query = ''] = path.split('?');
  const params = new URLSearchParams(query);
  params.set('embed', '1');
  return `${base}?${params.toString()}`;
}
