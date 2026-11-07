/**
 * A module that is off is off for visitors too (2026-11-07). /feedback took
 * posts with the feedback module off, /shop listed products with e-commerce
 * off, /jobs took applications with recruitment off: only the Knowledge Base
 * page and the navigation asked the modules row. PublicModuleGate, in the
 * router's root layout, answers 404 for a route of a module that is off —
 * and this guard reads every public route out of App.tsx so a new public
 * page is either mapped to its module or declared module-less here.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { PUBLIC_ROUTE_MODULES, publicModuleOff, publicRouteModule } from '../public-route-modules';
import { discoverRoutes } from '../../../scripts/view-sweep/routes';

const ROOT = resolve(__dirname, '../../..');

/** Public routes that belong to no module: the site itself, sign-in, the portal's doors, the preview, CMS pages. */
const MODULE_LESS = new Set(['/', '/auth', '/priser', '/account/login', '/account/activate', '/preview/:id', '/:slug', '/:lang/:slug']);

describe('public routes follow the modules row', () => {
  it('maps a route to its module, with or without a language prefix, on a segment boundary', () => {
    expect(publicRouteModule('/shop')).toBe('ecommerce');
    expect(publicRouteModule('/shop/abc?x=1')).toBe('ecommerce');
    expect(publicRouteModule('/sv/shop/abc')).toBe('ecommerce');
    expect(publicRouteModule('/feedback/42')).toBe('feedback');
    expect(publicRouteModule('/kb/slug')).toBe('knowledgeBase');
    expect(publicRouteModule('/sv/kb/slug')).toBe('knowledgeBase');
    expect(publicRouteModule('/s/token')).toBe('surveys');
    expect(publicRouteModule('/shopping')).toBeNull(); // a CMS page, not the shop
    expect(publicRouteModule('/sv')).toBeNull();
    expect(publicRouteModule('/')).toBeNull();
    expect(publicRouteModule('/admin/shop')).toBeNull();
  });

  it('a disabled module answers its id; enabled, module-less or no row answers null', () => {
    const row = { ecommerce: { enabled: false }, feedback: { enabled: true } };
    expect(publicModuleOff('/shop', row)).toBe('ecommerce');
    expect(publicModuleOff('/sv/cart', row)).toBe('ecommerce');
    expect(publicModuleOff('/feedback', row)).toBeNull();
    expect(publicModuleOff('/blog', row)).toBe('blog'); // absent from the row = not enabled, as the sidebar reads it
    expect(publicModuleOff('/', row)).toBeNull();
    expect(publicModuleOff('/shop', undefined)).toBeNull();
    expect(publicModuleOff('/shop', {})).toBeNull();
  });

  it('every public route in App.tsx is mapped to a module or declared module-less', () => {
    const routes = discoverRoutes(resolve(ROOT, 'src/App.tsx'), ROOT).filter((r) => r.area === 'public');
    expect(routes.length).toBeGreaterThan(30);
    const unmapped = routes
      .filter((r) => !MODULE_LESS.has(r.pattern))
      .map((r) => r.pattern)
      .filter((pattern) => publicRouteModule(pattern.replace(':lang', 'sv').replace(/:[A-Za-z0-9_]+/g, 'x')) === null);
    expect(unmapped, 'map these in PUBLIC_ROUTE_MODULES or declare them module-less in this test').toEqual([]);
  });

  it('every mapped module exists in the modules settings', () => {
    const src = readFileSync(resolve(ROOT, 'src/hooks/useModules.tsx'), 'utf8');
    const start = src.indexOf('export interface ModulesSettings');
    const body = src.slice(start, src.indexOf('\n}', start));
    for (const { moduleId } of PUBLIC_ROUTE_MODULES) expect(body, moduleId).toMatch(new RegExp(`\\b${moduleId}: ModuleConfig`));
  });

  it('the gate sits in the root layout, around the Outlet, and waits for the row on a mapped route', () => {
    const app = readFileSync(resolve(ROOT, 'src/App.tsx'), 'utf8');
    expect(app).toMatch(/<PublicModuleGate>\s*<Outlet \/>\s*<\/PublicModuleGate>/);
    const gate = readFileSync(resolve(ROOT, 'src/components/public/PublicModuleGate.tsx'), 'utf8');
    expect(gate).toMatch(/if \(owner && isLoading && !modules\)/);
    expect(gate).toMatch(/if \(owner && publicModuleOff\(pathname, modules\)\) return <NotFound \/>;/);
  });
});
