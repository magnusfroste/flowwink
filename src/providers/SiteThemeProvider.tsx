import type { ReactNode } from 'react';
import { ThemeProvider } from 'next-themes';
import { useQuery } from '@tanstack/react-query';
import { useWindowPathname } from '@/hooks/useWindowPathname';
import { brandingQuery } from '@/lib/branding-query';

/**
 * The public site's theme dial, applied without touching the person's own
 * choice.
 *
 * With the visitor toggle off, the operator's default theme is authoritative
 * on the public site. It used to be enforced with setTheme(), which WRITES
 * the one shared "theme" key — so every public page an admin opened saved
 * "light" over their dark choice, and the admin came back light (MJP,
 * 2026-09-28). A forcedTheme is applied to the page and stored nowhere; the
 * admin never gets one.
 */
export function SiteThemeProvider({ children }: { children: ReactNode }) {
  const pathname = useWindowPathname();
  const { data: branding } = useQuery(brandingQuery);
  const isAdmin = pathname.startsWith('/admin');
  const forced = !isAdmin && branding?.allowThemeToggle === false
    && (branding.defaultTheme === 'light' || branding.defaultTheme === 'dark')
    ? branding.defaultTheme
    : undefined;
  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange forcedTheme={forced}>
      {children}
    </ThemeProvider>
  );
}
