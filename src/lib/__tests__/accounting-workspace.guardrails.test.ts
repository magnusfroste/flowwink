/**
 * Accounting is a workspace (2026-11-01): a bookkeeper spends an hour there,
 * so it gets its own left menu and the FlowWink sidebar folds (src/lib/workspaces.ts).
 * Employees who hand in expenses or report time never see it.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  ACCOUNTING_WORKSPACE as W, activeItem, canUseWorkspace, entryTabs, resolveWorkspace, visibleSections, workspaceItems,
  type WorkspaceAccess,
} from '../workspaces';
import { isRouteAllowed } from '../admin-route-access';
import type { AppRole } from '@/types/cms';

const app = readFileSync('src/App.tsx', 'utf8');
const page = readFileSync('src/pages/admin/AccountingPage.tsx', 'utf8');
const all: WorkspaceAccess = { moduleEnabled: () => true, routeAllowed: () => true };

function accessFor(granted: string[]): WorkspaceAccess {
  const roles = ['writer'] as AppRole[];
  const accessMap = { writer: new Set(granted) } as Partial<Record<AppRole, Set<string>>>;
  return { moduleEnabled: () => true, routeAllowed: (p) => isRouteAllowed(p, { isAdmin: false, roles, accessMap }) };
}

describe('the accounting workspace', () => {
  it('every entry points at a route that exists, and every accounting tab is in the menu', () => {
    for (const i of workspaceItems(W)) {
      const path = i.href.split('?')[0];
      expect(app, `${i.label} → ${path}`).toContain(`path: "${path}"`);
    }
    const tabIds = [...page.matchAll(/^\s{4}(\w+): </gm)].map((m) => m[1]);
    expect(tabIds.length).toBeGreaterThan(20);
    expect(new Set(entryTabs(W))).toEqual(new Set(tabIds));
  });

  it('only someone the role matrix lets into accounting gets the workspace', () => {
    expect(canUseWorkspace(W, accessFor(['expenses', 'timesheets']))).toBe(false);
    expect(canUseWorkspace(W, accessFor(['accounting']))).toBe(true);
    expect(canUseWorkspace(W, { ...all, moduleEnabled: (m) => m !== 'accounting' })).toBe(false);
  });

  it('the panel shows only pages the person may open and modules that are on', () => {
    const ids = visibleSections(W, accessFor(['accounting', 'invoicing'])).flatMap((s) => s.items.map((i) => i.id));
    expect(ids).toContain('journal');
    expect(ids).toContain('invoices');
    expect(ids).not.toContain('payroll');
    const noPayroll = visibleSections(W, { ...all, moduleEnabled: (m) => m !== 'payroll' }).flatMap((s) => s.items.map((i) => i.id));
    expect(noPayroll).not.toContain('payroll');
  });

  it('entering accounting starts the session; its finance pages keep it; any other page ends it', () => {
    expect(resolveWorkspace('/admin/accounting', null)).toMatchObject({ nextActiveId: 'accounting' });
    expect(resolveWorkspace('/admin/expenses', 'accounting').def?.id).toBe('accounting');
    // An employee arriving at expenses from the everyday menu: no panel.
    expect(resolveWorkspace('/admin/expenses', null)).toEqual({ def: null, nextActiveId: null });
    expect(resolveWorkspace('/admin/contacts', 'accounting')).toEqual({ def: null, nextActiveId: null });
  });

  it('the active entry follows the address', () => {
    expect(activeItem(W, '/admin/accounting', '')?.id).toBe('overview');
    expect(activeItem(W, '/admin/accounting', '?tab=pnl')?.id).toBe('pnl');
    expect(activeItem(W, '/admin/purchase-orders', '?tab=invoices')?.id).toBe('vendor_invoices');
    expect(activeItem(W, '/admin/invoices', '?tab=aging')?.id).toBe('invoices');
  });

  it('the layout folds the FlowWink sidebar on a workspace page and mounts the panel', () => {
    const layout = readFileSync('src/components/admin/AdminLayout.tsx', 'utf8');
    expect(layout).toMatch(/<SidebarProvider defaultOpen=\{!workspace\}>/);
    expect(layout).toMatch(/<WorkspacePanel /);
    expect(layout).toMatch(/<WorkspaceMobileNav /);
  });

  it('no finance link points at /admin/purchasing (there is no such route)', () => {
    for (const f of ['src/components/admin/accounting/dashboard/BooksAttentionCard.tsx', 'src/components/admin/accounting/MonthCloseTab.tsx', 'src/components/admin/ModuleDashboardWidgets.tsx']) {
      expect(readFileSync(f, 'utf8'), f).not.toMatch(/['"]\/admin\/purchasing['"]/);
    }
  });
});
