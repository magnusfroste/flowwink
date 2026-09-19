import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { isRouteAllowed, findNavMatch, findRouteOwner, ROUTE_OWNERS } from '../admin-route-access';
import { discoverRoutes } from '../../../scripts/view-sweep/routes';
import type { AppRole } from '@/types/cms';

/**
 * A salesperson typed /admin/settings and got the page. The sidebar hid the
 * link — nothing guarded the route. Hiding is not gating. The guard resolves
 * routes against the SAME navigationGroups the sidebar renders from, so
 * these tests run against the real navigation data: if someone moves Site
 * Settings out of an admin-only group, this suite says so.
 */

const salesAccess = {
  isAdmin: false,
  roles: ['sales'] as AppRole[],
  accessMap: { sales: new Set(['deals', 'quotes', 'contracts', 'blog']) } as never,
};

describe('admin-only surfaces are gated, not just hidden', () => {
  it.each(['/admin/settings', '/admin/branding', '/admin/users', '/admin/roles', '/admin/modules'])(
    'sales is denied %s',
    (path) => {
      expect(isRouteAllowed(path, salesAccess)).toBe(false);
    },
  );

  it('admin passes everything', () => {
    expect(isRouteAllowed('/admin/settings', { ...salesAccess, isAdmin: true })).toBe(true);
  });
});

describe('granted modules stay reachable', () => {
  it('sales reaches the modules their roles grant', () => {
    expect(isRouteAllowed('/admin/deals', salesAccess)).toBe(true);
  });

  it('documents the quotes/invoicing vocabulary split', () => {
    // The Quotes nav item is gated by moduleId 'invoicing', NOT 'quotes' —
    // so a matrix grant of 'quotes' does not open /admin/quotes. The sidebar
    // and the route guard share this reading (same source), so there is no
    // drift between them — but the matrix key and the nav key disagree, and
    // this test pins the current behaviour until that is deliberately fixed.
    expect(isRouteAllowed('/admin/quotes', salesAccess)).toBe(false);
    expect(isRouteAllowed('/admin/quotes', {
      ...salesAccess,
      accessMap: { sales: new Set(['invoicing']) } as never,
    })).toBe(true);
  });

  it('sales is denied modules outside the grant', () => {
    // Accounting is a nav item with a moduleId not in the sales grant.
    expect(isRouteAllowed('/admin/accounting', salesAccess)).toBe(false);
  });

  it('sub-paths inherit the parent item verdict', () => {
    expect(isRouteAllowed('/admin/users/login-activity', salesAccess)).toBe(false);
  });

  it('the dashboard stays open to any staff role', () => {
    expect(isRouteAllowed('/admin', salesAccess)).toBe(true);
  });
});

describe('resolution mechanics', () => {
  it('longest href wins, not first hit', () => {
    const m = findNavMatch('/admin/users/login-activity');
    expect(m?.item.href).toBe('/admin/users');
  });

  it('a path nobody owns is denied — the gate fails closed', () => {
    // It used to return true ("the page's own guard decides") and no such page
    // had a guard: the view sweep was served /admin/leads, /admin/skills and
    // six more as the most restricted staff role (2026-09-19).
    expect(isRouteAllowed('/admin/some-detail-page/42', salesAccess)).toBe(false);
  });

  it('an empty access map fails closed for module items', () => {
    expect(isRouteAllowed('/admin/deals', { ...salesAccess, accessMap: undefined })).toBe(false);
  });
});

describe('FlowChat is admin-only in nav, matching its backend', () => {
  // agent-operate runs skills with the SERVICE ROLE and gates on
  // has_role(admin) — a non-admin got the page and a 401 per message.
  // Nav and engine must agree, or the UI lies about what it can do.
  it('sales cannot reach /admin/flowchat', () => {
    expect(isRouteAllowed('/admin/flowchat', salesAccess)).toBe(false);
  });

  it('admin can', () => {
    expect(isRouteAllowed('/admin/flowchat', { ...salesAccess, isAdmin: true })).toBe(true);
  });

  it('FlowWork stays open to non-admins — it reads with the caller\'s own eyes', () => {
    // workspace-chat retrieves under RLS as the caller, so it cannot surface
    // anything the user may not see. Different authority, different gate.
    expect(isRouteAllowed('/admin/flowwork', {
      ...salesAccess,
      accessMap: { sales: new Set(['workspaceChat']) } as never,
    })).toBe(true);
  });
});

describe('every /admin route has an owner', () => {
  // Discovered from the route table, not listed: a new admin page that no nav
  // item claims and nobody put in ROUTE_OWNERS fails here instead of being
  // served to every staff role.
  const ROOT = resolve(__dirname, '../../..');
  const appSrc = readFileSync(join(ROOT, 'src/App.tsx'), 'utf8');
  const adminRoutes = discoverRoutes(join(ROOT, 'src/App.tsx'), ROOT).filter((r) => r.area === 'admin');
  const concrete = (pattern: string) => pattern.replace(/:\w+/g, 'x');

  it('reads the route table', () => {
    expect(adminRoutes.length).toBeGreaterThan(100);
  });

  it('a nav item or ROUTE_OWNERS claims each one', () => {
    const orphans = adminRoutes
      .filter((r) => !findNavMatch(concrete(r.pattern)) && !findRouteOwner(concrete(r.pattern)))
      .map((r) => r.pattern);
    expect(orphans, 'add the route to ROUTE_OWNERS in src/lib/admin-route-access.ts').toEqual([]);
  });

  it('an owner marked redirect really is a bare <Navigate> in App.tsx', () => {
    // `redirect` lets the path through ungated because the destination is
    // gated on arrival. A real page hiding behind that flag would be open.
    const lying = Object.entries(ROUTE_OWNERS)
      .filter(([, o]) => 'redirect' in o)
      .map(([href]) => href)
      .filter((href) => {
        const line = appSrc.split('\n').find((l) => l.includes(`path: "${href}"`)) ?? '';
        return !/element:\s*<(Navigate|\w+Redirect)\b/.test(line);
      });
    expect(lying).toEqual([]);
  });

  it('the restricted role is denied the pages the sweep was served', () => {
    for (const path of ['/admin/leads', '/admin/leads/42', '/admin/skills', '/admin/platform-tests', '/admin/autonomy-tests',
      '/admin/migration-audit', '/admin/process-coverage', '/admin/template-live-preview']) {
      expect(isRouteAllowed(path, salesAccess), path).toBe(false);
    }
    expect(isRouteAllowed('/admin/leads/42', { ...salesAccess, accessMap: { sales: new Set(['leads']) } as never })).toBe(true);
  });
});
