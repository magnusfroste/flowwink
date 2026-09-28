import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

/**
 * MJP (2026-09-28): "dark theme doesn't work in admin". The public site has
 * the visitor toggle off with light as default, and enforced it with
 * setTheme() — which writes the one shared "theme" key. Every public page the
 * admin opened saved "light" over their dark choice. Now the public default is
 * a forcedTheme: applied to the page, stored nowhere.
 */
vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { value: { allowThemeToggle: false, defaultTheme: 'light' } }, error: null }) }) }) }),
  },
}));

import { SiteThemeProvider } from '../SiteThemeProvider';
import { useEffectiveTheme } from '@/hooks/useEffectiveTheme';

function Probe() {
  return <span data-testid="theme">{useEffectiveTheme() ?? 'none'}</span>;
}

const renderAt = async (path: string) => {
  window.history.pushState({}, '', path);
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={qc}><SiteThemeProvider><Probe /></SiteThemeProvider></QueryClientProvider>);
  await act(async () => { await new Promise((r) => setTimeout(r, 20)); });
};

// This rig's jsdom exposes no localStorage (see consent-follows-the-banner).
class MemoryStorage {
  private m = new Map<string, string>();
  getItem(k: string) { return this.m.has(k) ? this.m.get(k)! : null; }
  setItem(k: string, v: string) { this.m.set(k, String(v)); }
  removeItem(k: string) { this.m.delete(k); }
  clear() { this.m.clear(); }
}

describe('the public theme dial does not overwrite the admin choice', () => {
  beforeEach(() => {
    Object.defineProperty(globalThis, 'localStorage', { value: new MemoryStorage(), configurable: true, writable: true });
    window.matchMedia = window.matchMedia || ((q: string) => ({ matches: false, media: q, addListener() {}, removeListener() {} }) as unknown as MediaQueryList);
    localStorage.setItem('theme', 'dark');
    document.documentElement.className = '';
  });

  it('a public page shows the forced light theme and leaves the stored choice alone', async () => {
    await renderAt('/waterjets');
    expect(document.documentElement.classList.contains('light')).toBe(true);
    expect(screen.getByTestId('theme').textContent).toBe('light');
    expect(localStorage.getItem('theme')).toBe('dark');
  });

  it('the admin shows the person\'s own dark choice', async () => {
    await renderAt('/admin/pages');
    expect(document.documentElement.classList.contains('dark')).toBe(true);
    expect(screen.getByTestId('theme').textContent).toBe('dark');
  });
});
