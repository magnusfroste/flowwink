/**
 * The view sweep (npm run qa:views) discovers its routes from src/App.tsx.
 * Two things can quietly shrink what it covers, and both are offline-checkable:
 *
 *   1. the route table stops being a literal the parser can read — discovery
 *      throws, which this test turns into a red PR instead of a red nightly;
 *   2. someone adds `/admin/things/:id` and nothing says which row fills `:id`
 *      — the sweep would announce "skipped: no resolver" forever.
 */
import { describe, expect, it } from 'vitest';
import { join, resolve } from 'node:path';
import { discoverRoutes } from '../../../scripts/view-sweep/routes';
import { hasResolver } from '../../../scripts/view-sweep/params';

const ROOT = resolve(__dirname, '../../..');
const routes = discoverRoutes(join(ROOT, 'src/App.tsx'), ROOT);

describe('view sweep route discovery', () => {
  it('reads the whole route table, in all three areas', () => {
    expect(routes.length).toBeGreaterThan(150);
    for (const area of ['public', 'admin', 'portal'] as const) {
      expect(routes.some((r) => r.area === area), `no ${area} routes discovered`).toBe(true);
    }
    // The nested portal layout is the one non-flat part of the table.
    expect(routes.some((r) => r.pattern === '/account/profile' && r.area === 'portal')).toBe(true);
    expect(routes.some((r) => r.pattern === '/account' && r.area === 'portal')).toBe(true);
  });

  it('every parameterised route has a param resolver', () => {
    const missing = routes.filter((r) => r.params.length > 0 && !hasResolver(r.pattern)).map((r) => `${r.pattern} (${r.source})`);
    expect(missing, 'add a resolver in scripts/view-sweep/params.ts').toEqual([]);
  });
});
