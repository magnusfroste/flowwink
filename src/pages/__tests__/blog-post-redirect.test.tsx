import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { HelmetProvider } from 'react-helmet-async';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { resolveBlogRedirect, type RedirectHit } from '@/lib/blog-redirect';

/**
 * /blog/<slug> follows page_redirects when no post answers there.
 *
 * Before 2026-10-30 only PublicPage asked resolve_redirect; a renamed, drafted
 * or deleted post was a hard 404 (www lost 29 published URLs that way).
 */
const redirects: Record<string, RedirectHit> = {};
const asked: string[] = [];
vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    rpc: async (fn: string, args: { p_path: string }) => {
      if (fn !== 'resolve_redirect') return { data: null, error: { message: 'unexpected rpc' } };
      asked.push(args.p_path);
      return { data: redirects[args.p_path.replace(/^\/+/, '')] ?? { found: false }, error: null };
    },
  },
}));
vi.mock('@/hooks/useBlogPosts', () => ({
  // Nothing answers at any address the page is opened on.
  usePublicBlogPost: () => ({ data: { post: null, redirect: null, overlays: [] }, isLoading: false, error: null }),
  useBlogPosts: () => ({ data: { posts: [] } }),
}));
vi.mock('@/hooks/useSiteSettings', () => ({
  useSiteLanguages: () => ({ defaultLanguage: 'en', languages: ['en', 'sv'], isMultilingual: true, isLoading: false }),
  useBlogSettings: () => ({ data: {} }),
  useBlogCoverStyle: () => 'photo',
}));
vi.mock('@/hooks/useCustomerFormat', () => ({ useCustomerFormat: () => ({ formatDateTime: () => '' }) }));
vi.mock('@/hooks/usePageViewTracker', () => ({ usePageViewTracker: () => {} }));
vi.mock('@/lib/ui-text', () => ({ useUiText: () => (_k: string, f: string) => f, useSetUiTextLang: () => () => {} }));
vi.mock('@/components/public/PublicNavigation', () => ({ PublicNavigation: () => null }));
vi.mock('@/components/public/PublicFooter', () => ({ PublicFooter: () => null }));
vi.mock('../NotFound', () => ({ default: () => <p>not found</p> }));

import BlogPostPage from '../BlogPostPage';

const open = (path: string) => render(
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    <HelmetProvider>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/blog/new-topic" element={<p>arrived at /blog/new-topic</p>} />
          <Route path="/sv/blog/new-topic" element={<p>arrived at /sv/blog/new-topic</p>} />
          <Route path="/blog/:slug" element={<BlogPostPage />} />
          <Route path="/:lang/blog/:slug" element={<BlogPostPage />} />
        </Routes>
      </MemoryRouter>
    </HelmetProvider>
  </QueryClientProvider>,
);

describe('the blog post page follows a redirect on not-found', () => {
  beforeEach(() => {
    for (const k of Object.keys(redirects)) delete redirects[k];
    asked.length = 0;
  });

  it('/blog/<old> → /blog/<new> (manage_blog_posts new_slug wrote the row)', async () => {
    redirects['blog/old-topic'] = { found: true, to_path: '/blog/new-topic', external: false };
    open('/blog/old-topic');
    expect(await screen.findByText('arrived at /blog/new-topic')).toBeInTheDocument();
  });

  it('/sv/blog/<old> follows the site-language row and keeps its language', async () => {
    redirects['blog/old-topic'] = { found: true, to_path: '/blog/new-topic', external: false };
    open('/sv/blog/old-topic');
    expect(await screen.findByText('arrived at /sv/blog/new-topic')).toBeInTheDocument();
    expect(asked).toEqual(['/sv/blog/old-topic', '/blog/old-topic']);
  });

  it('no redirect is still a 404', async () => {
    open('/blog/gone');
    expect(await screen.findByText('not found')).toBeInTheDocument();
  });
});

describe('resolveBlogRedirect', () => {
  const via = (rows: Record<string, RedirectHit>) => async (p: string) => rows[p] ?? { found: false };

  it('an operator\'s redirect for the language address wins over the site-language row', async () => {
    const r = await resolveBlogRedirect(via({
      '/sv/blog/x': { found: true, to_path: '/sv/blog/egen', external: false },
      '/blog/x': { found: true, to_path: '/blog/y', external: false },
    }), 'x', 'sv', 'en');
    expect(r).toEqual({ to: '/sv/blog/egen', external: false });
  });

  it('a site-language redirect that leaves the blog is followed as is', async () => {
    expect(await resolveBlogRedirect(via({ '/blog/x': { found: true, to_path: '/tjanster', external: false } }), 'x', 'sv', 'en'))
      .toEqual({ to: '/tjanster', external: false });
    expect(await resolveBlogRedirect(via({ '/blog/x': { found: true, to_path: 'https://example.com/a', external: true } }), 'x', 'sv', 'en'))
      .toEqual({ to: 'https://example.com/a', external: true });
  });

  it('in the site language there is one lookup, and nothing found is null', async () => {
    const seen: string[] = [];
    expect(await resolveBlogRedirect(async (p) => { seen.push(p); return { found: false }; }, 'x', 'en', 'en')).toBeNull();
    expect(seen).toEqual(['/blog/x']);
  });
});
