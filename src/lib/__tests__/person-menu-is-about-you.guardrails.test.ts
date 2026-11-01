/**
 * The person menu is about YOU (2026-11-01). It existed twice (the avatar and
 * the sidebar's user card opened two copies), Profile a third time in the
 * sidebar, and its "Settings" pointed at Site Settings — an admin page every
 * other role was refused. One menu now, every link opens for every role, no
 * organisation settings; an employee reaches their own pages in /account;
 * and the update notice says what "update" means for this deployment.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { isRouteAllowed } from '@/lib/admin-route-access';
import { navigationGroups } from '@/components/admin/adminNavigation';
import { PERSON_MENU_LINKS } from '@/lib/person-menu';
import { isStaffSelfService } from '@/lib/staff-self-service';
import { decideUpdate, STALE_AFTER_MS } from '@/lib/update-check';
import type { AppRole } from '@/types/cms';

const ROLES = ['sales', 'support', 'accounting', 'hr', 'marketing', 'warehouse', 'purchasing', 'projects', 'employee', 'writer'] as AppRole[];
const empty = Object.fromEntries(ROLES.map((r) => [r, new Set<string>()]));

describe('the person menu is about you', () => {
  it('every link in it opens for every role, with no module granted', () => {
    for (const { to } of PERSON_MENU_LINKS) {
      const path = to.split('#')[0];
      const denied = ROLES.filter((r) => !isRouteAllowed(path, { isAdmin: false, roles: [r], accessMap: empty }));
      expect(denied, `${to} is refused to ${denied.join(', ')}`).toEqual([]);
    }
  });

  it('it carries no organisation settings', () => {
    const adminOnly = navigationGroups.filter((g) => g.adminOnly).flatMap((g) => g.items.map((i) => i.href));
    for (const { to } of PERSON_MENU_LINKS) expect(adminOnly, to).not.toContain(to.split('#')[0]);
    const menu = readFileSync('src/components/admin/PersonMenu.tsx', 'utf8');
    expect(menu).not.toMatch(/\/admin\/settings/);
  });

  it('there is one person menu: the header renders it, the sidebar does not copy it', () => {
    expect(readFileSync('src/components/admin/AdminContentHeader.tsx', 'utf8')).toContain('<PersonMenu />');
    const sidebar = readFileSync('src/components/admin/AdminSidebar.tsx', 'utf8');
    expect(sidebar).not.toMatch(/to="\/admin\/profile"/);
    expect(sidebar).not.toMatch(/DropdownMenuTrigger/);
    const inNav = navigationGroups.flatMap((g) => g.items).filter((i) => i.href === '/admin/profile');
    expect(inNav, 'Profile is in the person menu, not the sidebar').toEqual([]);
  });

  it('an employee reaches their own pages in /account, and nothing else there', () => {
    for (const p of ['/account/leave', '/account/payslips', '/account/contracts', '/account/expenses', '/account/agents']) {
      expect(isStaffSelfService(p), p).toBe(true);
    }
    for (const p of ['/account', '/account/orders', '/account/wishlist', '/account/addresses', '/account/leavex']) {
      expect(isStaffSelfService(p), p).toBe(false);
    }
  });
});

describe('the update notice says what update means here', () => {
  const day = 24 * 60 * 60 * 1000;
  const base = {
    kind: 'vercel', sourceRepo: 'someone/flowwink', currentVersion: '4.0.0',
    buildCommitDate: new Date(Date.UTC(2026, 9, 1)).toISOString(), behindBy: 40,
    upstreamHeadDate: new Date(Date.UTC(2026, 9, 1) + 5 * day).toISOString(), latestRelease: null,
  };
  it('a fork days behind main is told', () => {
    expect(decideUpdate(base)).toMatchObject({ show: true, kind: 'vercel', behindBy: 40 });
  });
  it('a fork the nightly sync keeps current is not nagged', () => {
    expect(decideUpdate({ ...base, upstreamHeadDate: new Date(Date.parse(base.buildCommitDate) + STALE_AFTER_MS - day).toISOString() }).show).toBe(false);
    expect(decideUpdate({ ...base, behindBy: 0 }).show).toBe(false);
  });
  it('upstream itself never shows it', () => {
    expect(decideUpdate({ ...base, sourceRepo: 'magnusfroste/flowwink' }).show).toBe(false);
  });
  it('a Docker image follows releases, not commits', () => {
    expect(decideUpdate({ ...base, kind: 'docker', latestRelease: '4.1.0' }).show).toBe(true);
    expect(decideUpdate({ ...base, kind: 'docker', latestRelease: '4.0.0' }).show).toBe(false);
  });
  it('the image declares itself, so its admin is told to pull, not to sync a fork', () => {
    expect(readFileSync('Dockerfile', 'utf8')).toMatch(/ENV FLOWWINK_DEPLOY_KIND=docker\s+RUN npm run build/);
  });
});
