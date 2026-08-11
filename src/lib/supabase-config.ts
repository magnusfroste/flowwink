/**
 * Is this instance configured to reach a Supabase backend?
 *
 * The Supabase client calls createClient(url, key) at module load, and
 * createClient THROWS on an empty url — before React renders. So a fresh
 * Vercel/Docker deploy with the env vars still unset shows a white screen and
 * no error: the operator concludes FlowWink is broken when it is merely
 * unconfigured. This module lets main.tsx detect that state and show a
 * "configure your environment" page instead — and, crucially, imports nothing
 * from supabase-js, so it can run before the throwing client is ever loaded.
 */

/** A value counts as unset if it is empty or still the build-time placeholder. */
function isPlaceholder(v: string | undefined): boolean {
  if (!v) return true;
  const t = v.trim();
  // Vite leaves %VITE_*% / __BAKED_*__ literals when the env var is absent.
  return t === '' || t.startsWith('__BAKED_') || t.startsWith('%VITE_') || t === 'undefined';
}

export const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string | undefined;
export const SUPABASE_PUBLISHABLE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined;

/** The env vars an operator must set, for the configuration page to list them. */
export const REQUIRED_ENV = [
  {
    name: 'VITE_SUPABASE_URL',
    present: !isPlaceholder(SUPABASE_URL),
    hint: 'https://<your-project-ref>.supabase.co',
  },
  {
    name: 'VITE_SUPABASE_PUBLISHABLE_KEY',
    present: !isPlaceholder(SUPABASE_PUBLISHABLE_KEY),
    hint: 'the project’s publishable (anon) key',
  },
] as const;

export function isSupabaseConfigured(): boolean {
  return !isPlaceholder(SUPABASE_URL) && !isPlaceholder(SUPABASE_PUBLISHABLE_KEY);
}
