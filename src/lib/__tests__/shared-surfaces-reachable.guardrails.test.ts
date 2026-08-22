import { describe, expect, it } from 'vitest';
import { navigationGroups } from '@/components/admin/adminNavigation';
import { isRouteAllowed } from '@/lib/admin-route-access';
import type { AppRole } from '@/types/cms';

/**
 * Guardrail: surfaces everyone needs stay reachable by everyone.
 *
 * Access is decided by TWO gates, and only one of them is data:
 *   1. the nav group's hardcoded `adminOnly` / `allowedRoles`
 *   2. the module matrix (role_module_access), via `item.moduleId`
 *
 * The route guard runs the same rules as the sidebar, so an item in the wrong
 * group is not merely hidden — the page is refused. Two of those shipped:
 *
 *   • Profile sat in the adminOnly "Admin" group, so every non-admin was denied
 *     THEIR OWN PROFILE PAGE, on every instance. The guard's first line is
 *     `if (group.adminOnly) return false`; the matrix was never consulted.
 *   • FlowWork — everyone's workroom — sat in the support-only group, a second
 *     gate on top of the matrix, so granting workspaceChat alone did nothing.
 *
 * Neither was catchable by the module matrix work, because neither was a matrix
 * problem. This test asserts the group placement directly: a personal or shared
 * surface must resolve to "allowed" for a role that has been granted its module
 * — and, for surfaces with no module at all, for every role unconditionally.
 */

const ROLES: AppRole[] = [
  'sales', 'support', 'accounting', 'hr', 'marketing', 'warehouse', 'purchasing', 'projects',
] as AppRole[];

/** Everything the matrix could ever grant — the module gate is not what we test here. */
const everythingGranted = (): Partial<Record<AppRole, Set<string>>> => {
  const all = new Set<string>();
  for (const g of navigationGroups) for (const i of g.items) if (i.moduleId) all.add(i.moduleId);
  return Object.fromEntries(ROLES.map((r) => [r, all]));
};

describe('shared and personal surfaces are reachable by every role', () => {
  const accessMap = everythingGranted();

  /** Reachable for a non-admin whose matrix grants the module. */
  const reachableByAll = (path: string) =>
    ROLES.filter((r) => !isRouteAllowed(path, { isAdmin: false, roles: [r], accessMap }));

  it.each([
    ['/admin/profile', 'your own profile is not an administrative act'],
    ['/admin/flowwork', "everyone's workroom, not a support tool"],
    ['/admin/wiki', 'shared knowledge'],
    ['/admin/knowledge-base', 'shared knowledge'],
    ['/admin/docs', 'shared knowledge'],
    ['/admin/handbook', 'shared knowledge'],
    ['/admin/documents', 'shared knowledge'],
    ['/admin/flowtable', 'the data layer any role records into'],
    ['/admin/river', 'the company stream'],
  ])('%s is reachable by every role (%s)', (path, why) => {
    expect(reachableByAll(path), `${path} is denied to: ${reachableByAll(path).join(', ')} — ${why}`).toEqual([]);
  });

  it('profile needs no module grant at all', () => {
    // The one surface that must survive even an empty matrix: a user with no
    // module grants whatsoever still reaches their own profile.
    const empty = Object.fromEntries(ROLES.map((r) => [r, new Set<string>()]));
    const denied = ROLES.filter(
      (r) => !isRouteAllowed('/admin/profile', { isAdmin: false, roles: [r], accessMap: empty }),
    );
    expect(denied, `denied to: ${denied.join(', ')}`).toEqual([]);
  });

  it('no shared surface sits in an admin-only group', () => {
    // adminOnly is the ONE group-level gate that also silences module-bearing
    // items: the sidebar drops the whole group before it looks at any item, and
    // the route guard returns false on its first line. `allowedRoles`, by
    // contrast, only gates items WITHOUT a moduleId — which is why FlowWork,
    // despite sitting in the support-only group, was blocked by the matrix
    // alone. Placement still matters, but this is the part that can lock a
    // surface away no matter what the matrix says.
    const SHARED = ['/admin/profile', '/admin/flowwork', '/admin/wiki', '/admin/knowledge-base',
                    '/admin/docs', '/admin/handbook', '/admin/documents'];
    const trapped: string[] = [];
    for (const group of navigationGroups) {
      if (!group.adminOnly) continue;
      for (const item of group.items) if (SHARED.includes(item.href)) trapped.push(`${item.name} in "${group.label}"`);
    }
    expect(trapped, `admin-only group hides these from everyone: ${trapped.join(', ')}`).toEqual([]);
  });

  it('federation stays ungranted — zero matrix rows IS the admin-only state', () => {
    // Deliberate (Magnus 2026-08-13): peer keys and agent invitations are
    // instance infrastructure. With an EMPTY matrix no role may reach it; the
    // transparency panel announces the state instead of hiding it.
    const empty = Object.fromEntries(ROLES.map((r) => [r, new Set<string>()]));
    const anyoneIn = ROLES.some(
      (r) => isRouteAllowed('/admin/federation', { isAdmin: false, roles: [r], accessMap: empty }),
    );
    expect(anyoneIn, 'federation must not be reachable without a matrix grant').toBe(false);
  });

  it('admin-only surfaces stay admin-only', () => {
    // The counterweight: this test must not become a licence to open everything.
    for (const path of ['/admin/settings', '/admin/users', '/admin/roles', '/admin/modules']) {
      const allowedToSomeone = ROLES.some(
        (r) => isRouteAllowed(path, { isAdmin: false, roles: [r], accessMap }),
      );
      expect(allowedToSomeone, `${path} must remain admin-only`).toBe(false);
    }
  });
});

describe('roles live in data, not in the nav', () => {
  // 2026-08-13: every group- and item-level allowedRoles was removed — access
  // is the matrix's job, and hardcoded role lists in code were the source of
  // every misplacement bug this file guards against. One deliberate exception:
  // FlowChat is admin-gated because its backend (agent-operate) runs skills
  // with the service role and enforces has_role(admin) itself — the nav states
  // what the engine enforces.
  it('no nav entry carries allowedRoles except FlowChat', () => {
    const offenders: string[] = [];
    for (const group of navigationGroups) {
      if ((group as { allowedRoles?: unknown[] }).allowedRoles?.length) offenders.push(`group "${group.label}"`);
      for (const item of group.items) {
        if (item.allowedRoles?.length && item.name !== 'FlowChat') offenders.push(`${item.name} in "${group.label}"`);
      }
    }
    expect(offenders, `hardcoded role lists found: ${offenders.join(', ')}`).toEqual([]);
  });

  it('every non-universal item is module-gated instead', () => {
    // Items without moduleId must be the universal set — reachable by all.
    // Automations is platform-level (agent_automations has no owning module),
    // and was reachable by everyone before this cleanup; listing it here keeps
    // that behavior a stated fact instead of an accident.
    // Trash spans wiki/KB/pages, so no single moduleId could gate it honestly —
    // picking one would hide the bin from everyone holding the others. Its
    // trash_bin RPC filters row by row through can_access_module, so the link
    // is universal and the CONTENT is matrix-gated. Stated, not accidental.
    const universal = new Set(['Dashboard', 'FlowChat', 'Profile', 'Automations', 'Trash']);
    const naked: string[] = [];
    for (const group of navigationGroups) {
      if (group.adminOnly) continue;
      for (const item of group.items) {
        if (!item.moduleId && !universal.has(item.name)) naked.push(`${item.name} in "${group.label}"`);
      }
    }
    expect(naked, `items with neither moduleId nor universal status: ${naked.join(', ')}`).toEqual([]);
  });
});
