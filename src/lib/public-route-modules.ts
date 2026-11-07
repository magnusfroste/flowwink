/**
 * Which module a PUBLIC route belongs to — so a module that is off is off
 * for visitors too (2026-11-07).
 *
 * The admin side had the rule twice over (the sidebar, then the route gate);
 * the public side had it once, in the Knowledge Base page and the
 * navigation. Everything else was served whatever the modules row said:
 * /feedback took posts on a site that had switched the feedback module off,
 * /shop listed products with e-commerce off, /jobs took applications with
 * recruitment off. One map, read in the router's root layout
 * (PublicModuleGate): a route of a module that is off answers 404, the page
 * the site's own NotFound draws — to a visitor, those pages do not exist.
 *
 * Module-less public routes (the start page, CMS pages, the customer portal,
 * sign-in, the preview) are not listed and never block. A guard reads every
 * public route out of App.tsx and requires each one to be mapped here or
 * declared module-less there, so a new public page cannot ship ungated by
 * accident.
 */
import type { ModulesSettings } from '@/hooks/useModules';

export type PublicModuleId = keyof ModulesSettings;

/** Route prefix (matched on a segment boundary, after an optional `/:lang`) → owning module. */
export const PUBLIC_ROUTE_MODULES: ReadonlyArray<{ prefix: string; moduleId: PublicModuleId }> = [
  { prefix: '/shop', moduleId: 'ecommerce' },
  { prefix: '/cart', moduleId: 'ecommerce' },
  { prefix: '/checkout', moduleId: 'ecommerce' },
  { prefix: '/track', moduleId: 'ecommerce' },
  { prefix: '/feedback', moduleId: 'feedback' },
  { prefix: '/blog', moduleId: 'blog' },
  { prefix: '/kb', moduleId: 'knowledgeBase' },
  { prefix: '/jobs', moduleId: 'recruitment' },
  { prefix: '/interview', moduleId: 'recruitment' },
  { prefix: '/docs', moduleId: 'docs' },
  { prefix: '/newsletter', moduleId: 'newsletter' },
  { prefix: '/chat', moduleId: 'chat' },
  { prefix: '/meet', moduleId: 'webmeet' },
  { prefix: '/quote', moduleId: 'quotes' },
  { prefix: '/invoice', moduleId: 'invoicing' },
  { prefix: '/sign', moduleId: 'documents' },
  { prefix: '/room', moduleId: 'documents' },
  { prefix: '/s', moduleId: 'surveys' },
  { prefix: '/poll', moduleId: 'meetingPolls' },
  { prefix: '/contract', moduleId: 'contracts' },
];

const LANG_PREFIX = /^\/[a-z]{2}(?:-[a-z]{2})?(?=\/|$)/i;

function matchPrefix(pathname: string): PublicModuleId | null {
  for (const { prefix, moduleId } of PUBLIC_ROUTE_MODULES) {
    if (pathname === prefix || pathname.startsWith(prefix + '/')) return moduleId;
  }
  return null;
}

/** The module a public pathname belongs to, or null for a module-less route. `/sv/shop` is `/shop`. */
export function publicRouteModule(pathname: string): PublicModuleId | null {
  const path = pathname.split('?')[0].split('#')[0] || '/';
  return matchPrefix(path) ?? (LANG_PREFIX.test(path) ? matchPrefix(path.replace(LANG_PREFIX, '') || '/') : null);
}

/**
 * The module that is OFF for this public pathname, or null. A modules row that
 * is present and does not carry the module as enabled means off; no row yet
 * (loading) is the caller's to wait on — `publicRouteModule` says whether it
 * must.
 */
export function publicModuleOff(pathname: string, modules: object | null | undefined): PublicModuleId | null {
  const row = (modules ?? {}) as Partial<Record<string, { enabled?: boolean } | undefined>>;
  if (!Object.keys(row).length) return null;
  const id = publicRouteModule(pathname);
  if (!id) return null;
  return row[id]?.enabled ? null : id;
}
