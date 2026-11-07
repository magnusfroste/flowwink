/**
 * Route-level access for /admin pages — same source of truth as the sidebar.
 *
 * The sidebar HID pages the user's roles did not grant, but nothing guarded
 * the ROUTES: a salesperson could type /admin/settings and get the page.
 * Hiding is not gating. This resolves a pathname against the same
 * navigationGroups the sidebar renders from, so the two surfaces cannot
 * disagree: if the sidebar would not show the link, the route does not serve
 * the page.
 *
 * Resolution: longest matching href wins (so /admin/users/login-activity
 * matches the Users item, not the dashboard). A pathname that matches no nav
 * item is resolved against ROUTE_OWNERS, and a route with NO owner is denied.
 *
 * It used to be "left to the page's own guard" — and none of those pages had
 * one. The view sweep (2026-09-19) was served /admin/leads, /admin/skills,
 * /admin/platform-tests and five more as the most restricted staff role, while
 * the sibling /admin/contacts was correctly denied. A gate that lets through
 * what it does not recognise guards only what someone remembered to list; this
 * one fails closed, and a guardrail test reads every /admin route out of
 * App.tsx so a new page cannot ship without an owner.
 */
import { navigationGroups, type NavGroup, type NavItem } from '@/components/admin/adminNavigation';
import type { AppRole } from '@/types/cms';

export interface RouteAccessInput {
  isAdmin: boolean;
  roles: AppRole[];
  /** role → Set of granted moduleIds, from role_module_access. */
  accessMap: Partial<Record<AppRole, Set<string>>> | undefined;
}

interface Match {
  group: NavGroup;
  item: NavItem;
}

/**
 * Owners for /admin routes that no nav item claims. `moduleId` follows the role
 * matrix exactly like a nav item; `adminOnly` is for operator tooling;
 * `redirect` is a bare <Navigate> whose DESTINATION is gated on arrival;
 * `personal` is your own page — every signed-in staff member, no module grant
 * (it is reached from the person menu, not the sidebar).
 */
type RouteOwner = { moduleId: string } | { adminOnly: true } | { redirect: true } | { personal: true };

export const ROUTE_OWNERS: Record<string, RouteOwner> = {
  // Your own profile lives in the person menu (top right), not the sidebar.
  '/admin/profile': { personal: true },
  // /admin/federation redirects to /admin/agents (the A2A page went 2026-10-08).
  '/admin/federation': { redirect: true },
  '/admin/leads': { moduleId: 'leads' },
  '/admin/template-live-preview': { moduleId: 'templates' },
  '/admin/skills': { adminOnly: true },
  '/admin/platform-tests': { adminOnly: true },
  '/admin/autonomy-tests': { adminOnly: true },
  '/admin/migration-audit': { adminOnly: true },
  '/admin/process-coverage': { adminOnly: true },
  '/admin/security/logins': { redirect: true },
  '/admin/content-api': { redirect: true },
  '/admin/quick-start': { redirect: true },
  '/admin/global-blocks': { redirect: true },
  '/admin/communications': { redirect: true },
  '/admin/inbox': { redirect: true },
  '/admin/routing': { redirect: true },
  '/admin/pipelines': { redirect: true },
  '/admin/webhooks': { redirect: true },
  '/admin/smoke-test': { redirect: true },
  '/admin/skill-hub': { redirect: true },
  '/admin/live-support': { redirect: true },
  '/admin/template-export': { redirect: true },
  '/admin/developer-tools': { redirect: true },
  '/admin/api-keys': { redirect: true },
};

export function findRouteOwner(pathname: string): RouteOwner | null {
  let best: RouteOwner | null = null;
  let bestLen = 0;
  for (const [href, owner] of Object.entries(ROUTE_OWNERS)) {
    // A redirect owns its exact path only; a page owns its detail routes too.
    const hit = pathname === href || (!('redirect' in owner) && pathname.startsWith(href + '/'));
    if (hit && href.length > bestLen) { best = owner; bestLen = href.length; }
  }
  return best;
}

function grantedModules(input: RouteAccessInput): Set<string> {
  const allowed = new Set<string>();
  input.roles.forEach((r) => {
    const set = input.accessMap?.[r];
    if (set) set.forEach((id) => allowed.add(id));
  });
  return allowed;
}

export function findNavMatch(pathname: string): Match | null {
  let best: Match | null = null;
  let bestLen = 0;
  for (const group of navigationGroups) {
    for (const item of group.items) {
      const href = item.href;
      const hit =
        pathname === href ||
        (href !== '/admin' && pathname.startsWith(href + '/')) ||
        (href !== '/admin' && pathname === href);
      if (hit && href.length > bestLen) {
        best = { group, item };
        bestLen = href.length;
      }
    }
  }
  return best;
}

/** The module a /admin route belongs to — the nav item's, else the owner's; null for the dashboard, operator tooling and redirects. */
export function routeModuleId(pathname: string): string | null {
  const match = findNavMatch(pathname);
  if (match) return match.item.moduleId ?? null;
  const owner = findRouteOwner(pathname);
  return owner && 'moduleId' in owner ? owner.moduleId : null;
}

/**
 * The module that is switched OFF for this route, or null (2026-11-07).
 *
 * The sidebar hid a disabled module's pages (`!mod?.enabled` → no link), but
 * the route gate asked only the role matrix — so an admin who typed
 * /admin/webinars with Webinars off was served the page, and the first write
 * there woke the module (`autoActivateModule`) behind the operator's back.
 * Hiding is not gating, the second time. Same rule as the sidebar: a modules
 * row that is present and does not carry the module as enabled means off; no
 * row yet (loading, or an instance before the row) fails open, as the sidebar
 * does. Everyone is gated, admins included — the admin gets a door to Modules.
 */
export function moduleOffForRoute(
  pathname: string,
  modules: object | null | undefined,
): string | null {
  // ModulesSettings is a closed interface; the row is read as a plain map here.
  const row = (modules ?? {}) as Record<string, { enabled?: boolean } | undefined>;
  if (!Object.keys(row).length) return null;
  const id = routeModuleId(pathname);
  if (!id) return null;
  return row[id]?.enabled ? null : id;
}

export function isRouteAllowed(pathname: string, input: RouteAccessInput): boolean {
  if (input.isAdmin) return true;

  const match = findNavMatch(pathname);
  if (!match) {
    const owner = findRouteOwner(pathname);
    if (!owner) return false; // no owner → denied; add one to ROUTE_OWNERS
    if ('redirect' in owner || 'personal' in owner) return true;
    if ('adminOnly' in owner) return false;
    return grantedModules(input).has(owner.moduleId);
  }

  const { group, item } = match;

  // Same rules, same order, as the sidebar's item filter.
  if (group.adminOnly) return false;

  if (item.moduleId) {
    return grantedModules(input).has(item.moduleId);
  }

  if (group.allowedRoles && group.allowedRoles.length > 0) {
    return input.roles.some((r) => group.allowedRoles!.includes(r));
  }
  if (item.allowedRoles && item.allowedRoles.length > 0) {
    return input.roles.some((r) => item.allowedRoles!.includes(r));
  }
  return true;
}
