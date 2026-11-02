/**
 * A language prefix is decided only once the site's languages are known.
 * Observed on optictunnels (2026-10-26 → 10-30): LinkedIn visitors to
 * /en/careers were recorded as `__no_such_page__`. Until `site_languages`
 * arrives, useSiteLanguages answers with its fallback (default English), so
 * `en` is no prefix and the two-segment route resolves to a 404 — and the page
 * view, recorded once per mount, froze that transient slug. The page itself
 * appeared a moment later; the statistics never knew.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const read = (p: string) => readFileSync(join(__dirname, '..', '..', p), 'utf8');
const PAGE = read('pages/PublicPage.tsx');
const TRACKER = read('hooks/usePageViewTracker.ts');

describe('the language prefix waits for the declared languages', () => {
  it('PublicPage knows when the languages are still pending', () => {
    expect(PAGE).toMatch(/isPending:\s*languagesPending[\s\S]*?=\s*useSiteLanguages\(\)/);
    expect(PAGE).toMatch(/const routeAwaitsLanguages = languagesPending/);
  });

  it('the page query does not run, and the spinner stays, while the route is undecided', () => {
    expect(PAGE).toMatch(/enabled:\s*!routeAwaitsLanguages/);
    expect(PAGE).toMatch(/if \(isLoading \|\| authLoading \|\| routeAwaitsLanguages\)/);
  });

  it('the page view is recorded only once the route has decided which page it is', () => {
    expect(PAGE).toMatch(/usePageViewTracker\(\{[\s\S]*?ready:\s*!routeAwaitsLanguages/);
    expect(TRACKER).toMatch(/if \(!ready\) return;/);
    expect(TRACKER).toMatch(/\[pageId, pageSlug, pageTitle, ready,/);
  });
});
