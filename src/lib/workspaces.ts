/**
 * Workspaces — a place you spend time in, with its own menu (2026-11-01).
 *
 * A bookkeeper or a founder doing the books spends an hour in accounting, not
 * a minute. Fortnox, Bokio and Visma give that hour its own left menu; the
 * FlowWink sidebar (eighty entries across every module) is noise for it. A
 * workspace is that menu: entering it folds the FlowWink sidebar to icons and
 * shows the workspace's own panel; "← FlowWink" leaves it.
 *
 * Who sees it: only someone the role matrix lets into the workspace's entry
 * module (accounting). An employee who hands in an expense or reports time
 * never meets it — those pages stay in their everyday menu, and visiting
 * /admin/expenses from there shows no panel. Every entry is filtered by the
 * same gate as the route itself (isRouteAllowed) and by the module being on,
 * so the panel can never show a page the person would be refused.
 *
 * When it shows: always on the entry route; on the other finance pages it
 * names (invoices, supplier invoices, bank, payroll …) only while the session
 * is IN the workspace — arrived through it, not through the FlowWink menu. A
 * route outside the workspace ends that.
 *
 * Generic on purpose: HR is the second definition (HR_WORKSPACE), same shell.
 */
import {
  AlertTriangle, ArrowRightLeft, BarChart3, BookOpen, Briefcase, CalendarCheck, Calculator,
  ClipboardCheck, Coins, FileArchive, FileCheck2, FileSpreadsheet, FileText, Gauge, Inbox,
  Landmark, Layers, LayoutDashboard, LineChart, Package, PiggyBank, Receipt, RefreshCw,
  Scale, Settings, ShieldCheck, Truck, Wallet, Compass, Users, Network, FileSignature, UserPlus,
  CalendarOff, CalendarRange, Hourglass, Clock, CalendarClock, Timer, HandCoins, Download,
  TrendingUp, Award, GraduationCap, Gavel,
} from 'lucide-react';
import type { ComponentType } from 'react';

export type WorkspaceBadge = 'books_attention' | 'pending_expenses' | 'pending_approvals' | 'pending_leave' | 'new_applications';

export interface WorkspaceItem {
  /** Stable id; for an entry-route tab it is the tab id. */
  id: string;
  label: string;
  /** Path plus an optional ?tab= — the page's own address. */
  href: string;
  moduleId: string;
  icon: ComponentType<{ className?: string }>;
  badge?: WorkspaceBadge;
}

export interface WorkspaceSection {
  label: string;
  items: WorkspaceItem[];
}

export interface WorkspaceDef {
  id: string;
  label: string;
  /** The route that IS the workspace: entering it starts the session. */
  entryPath: string;
  /** Who may use the workspace at all. */
  entryModule: string;
  /** The tab the entry route shows without ?tab=. */
  defaultTab: string;
  sections: WorkspaceSection[];
}

const A = '/admin/accounting';
const tab = (id: string) => `${A}?tab=${id}`;

export const ACCOUNTING_WORKSPACE: WorkspaceDef = {
  id: 'accounting',
  label: 'Accounting',
  entryPath: A,
  entryModule: 'accounting',
  defaultTab: 'overview',
  sections: [
    {
      label: 'To do',
      items: [
        { id: 'overview', label: 'Overview', href: tab('overview'), moduleId: 'accounting', icon: LayoutDashboard, badge: 'books_attention' },
        { id: 'events_to_book', label: 'Events to book', href: tab('events_to_book'), moduleId: 'accounting', icon: Inbox },
        { id: 'pending', label: 'Pending operations', href: tab('pending'), moduleId: 'accounting', icon: ClipboardCheck },
        { id: 'approvals', label: 'Approvals', href: '/admin/approvals', moduleId: 'approvals', icon: ShieldCheck, badge: 'pending_approvals' },
      ],
    },
    {
      label: 'Day to day',
      items: [
        { id: 'journal', label: 'Journal', href: tab('journal'), moduleId: 'accounting', icon: BookOpen },
        { id: 'bank', label: 'Bank & reconciliation', href: '/admin/reconciliation', moduleId: 'reconciliation', icon: Landmark },
        { id: 'invoices', label: 'Customer invoices', href: '/admin/invoices', moduleId: 'invoicing', icon: Receipt },
        { id: 'vendor_invoices', label: 'Supplier invoices', href: '/admin/purchase-orders?tab=invoices', moduleId: 'purchasing', icon: Truck },
        { id: 'expenses', label: 'Expenses', href: '/admin/expenses', moduleId: 'expenses', icon: Wallet, badge: 'pending_expenses' },
        { id: 'payroll', label: 'Payroll', href: '/admin/payroll', moduleId: 'payroll', icon: Briefcase },
        { id: 'fixed_assets', label: 'Fixed assets', href: '/admin/fixed-assets', moduleId: 'fixedAssets', icon: Package },
      ],
    },
    {
      label: 'Month',
      items: [
        { id: 'close', label: 'Month close', href: tab('close'), moduleId: 'accounting', icon: CalendarCheck },
        { id: 'vat', label: 'VAT', href: tab('vat'), moduleId: 'accounting', icon: Calculator },
        { id: 'momsdekl', label: 'VAT declaration', href: tab('momsdekl'), moduleId: 'accounting', icon: FileCheck2 },
      ],
    },
    {
      label: 'Reports',
      items: [
        { id: 'ledger', label: 'General ledger', href: tab('ledger'), moduleId: 'accounting', icon: FileSpreadsheet },
        { id: 'pnl', label: 'Profit & loss', href: tab('pnl'), moduleId: 'accounting', icon: LineChart },
        { id: 'balance', label: 'Balance sheet', href: tab('balance'), moduleId: 'accounting', icon: Scale },
        { id: 'cashflow', label: 'Cash flow', href: tab('cashflow'), moduleId: 'accounting', icon: ArrowRightLeft },
        { id: 'budgets', label: 'Budgets', href: tab('budgets'), moduleId: 'accounting', icon: PiggyBank },
        { id: 'analytic', label: 'Analytic', href: tab('analytic'), moduleId: 'accounting', icon: BarChart3 },
        { id: 'consolidation', label: 'Consolidation', href: tab('consolidation'), moduleId: 'accounting', icon: Layers },
      ],
    },
    {
      label: 'Year & authorities',
      items: [
        { id: 'filings', label: 'Filings & deadlines', href: tab('filings'), moduleId: 'accounting', icon: AlertTriangle },
        { id: 'tax', label: 'Tax', href: tab('tax'), moduleId: 'accounting', icon: Gauge },
        { id: 'yearend', label: 'Year-end', href: tab('yearend'), moduleId: 'accounting', icon: CalendarCheck },
        { id: 'audit', label: 'Audit trail', href: tab('audit'), moduleId: 'accounting', icon: ShieldCheck },
        { id: 'voucher', label: 'Voucher archive', href: tab('voucher'), moduleId: 'accounting', icon: FileArchive },
        { id: 'export', label: 'Export (SIE)', href: tab('export'), moduleId: 'accounting', icon: FileText },
      ],
    },
    {
      label: 'Setup',
      items: [
        { id: 'opening', label: 'Opening balances', href: tab('opening'), moduleId: 'accounting', icon: Coins },
        { id: 'templates', label: 'Booking templates', href: tab('templates'), moduleId: 'accounting', icon: RefreshCw },
        { id: 'currencies', label: 'Currencies', href: '/admin/currencies', moduleId: 'multiCurrency', icon: Coins },
        { id: 'settings', label: 'Settings', href: tab('settings'), moduleId: 'accounting', icon: Settings },
      ],
    },
  ],
};

const H = '/admin/hr';
const hr = (id: string) => `${H}?tab=${id}`;

/**
 * HR. The guide (onboarding and offboarding, with the employment rules) is one
 * entry, not a gate: the page opens on it only while the company has no
 * employees, and on Employees after that (HRPage).
 */
export const HR_WORKSPACE: WorkspaceDef = {
  id: 'hr',
  label: 'HR',
  entryPath: H,
  entryModule: 'hr',
  defaultTab: 'employees',
  sections: [
    {
      label: 'To do',
      items: [
        { id: 'guide', label: 'Start here — guides', href: hr('guide'), moduleId: 'hr', icon: Compass },
        { id: 'leave', label: 'Leave requests', href: hr('leave'), moduleId: 'hr', icon: CalendarOff, badge: 'pending_leave' },
        { id: 'recruitment', label: 'Recruitment', href: '/admin/recruitment', moduleId: 'recruitment', icon: UserPlus, badge: 'new_applications' },
      ],
    },
    {
      label: 'People',
      items: [
        { id: 'employees', label: 'Employees', href: hr('employees'), moduleId: 'hr', icon: Users },
        { id: 'orgchart', label: 'Org chart', href: hr('orgchart'), moduleId: 'hr', icon: Network },
        { id: 'contracts', label: 'Employment contracts', href: hr('contracts'), moduleId: 'hr', icon: FileSignature },
      ],
    },
    {
      label: 'Time & leave',
      items: [
        { id: 'allocations', label: 'Leave allocations', href: hr('allocations'), moduleId: 'hr', icon: CalendarRange },
        { id: 'balances', label: 'Leave balances', href: hr('balances'), moduleId: 'hr', icon: Hourglass },
        { id: 'attendance', label: 'Attendance', href: hr('attendance'), moduleId: 'hr', icon: Clock },
        { id: 'shifts', label: 'Shifts', href: hr('shifts'), moduleId: 'hr', icon: CalendarClock },
        { id: 'timesheets', label: 'Timesheets', href: '/admin/timesheets', moduleId: 'timesheets', icon: Timer },
      ],
    },
    {
      label: 'Pay',
      items: [
        { id: 'payroll_runs', label: 'Payroll', href: '/admin/payroll', moduleId: 'payroll', icon: Wallet },
        { id: 'compensation', label: 'Compensation', href: hr('compensation'), moduleId: 'hr', icon: HandCoins },
        { id: 'payroll', label: 'Payroll export', href: hr('payroll'), moduleId: 'hr', icon: Download },
      ],
    },
    {
      label: 'Development',
      items: [
        { id: 'performance', label: 'Performance', href: hr('performance'), moduleId: 'hr', icon: TrendingUp },
        { id: 'skills', label: 'Skills & certificates', href: hr('skills'), moduleId: 'hr', icon: Award },
        { id: 'training', label: 'Training', href: hr('training'), moduleId: 'hr', icon: GraduationCap },
        { id: 'disciplinary', label: 'Disciplinary', href: hr('disciplinary'), moduleId: 'hr', icon: Gavel },
      ],
    },
  ],
};

export const WORKSPACES: WorkspaceDef[] = [ACCOUNTING_WORKSPACE, HR_WORKSPACE];

function splitHref(href: string): { path: string; tab: string | null } {
  const [path, query = ''] = href.split('?');
  return { path, tab: new URLSearchParams(query).get('tab') };
}

/** Every item, flat. */
export function workspaceItems(def: WorkspaceDef): WorkspaceItem[] {
  return def.sections.flatMap((s) => s.items);
}

/** The tab ids the entry route serves (items that point at it). */
export function entryTabs(def: WorkspaceDef): string[] {
  return workspaceItems(def)
    .map((i) => splitHref(i.href))
    .filter((h) => h.path === def.entryPath && h.tab)
    .map((h) => h.tab as string);
}

/** Does this pathname belong to the workspace (the entry route or a page it names)? */
export function isWorkspaceRoute(def: WorkspaceDef, pathname: string): boolean {
  if (pathname === def.entryPath || pathname.startsWith(`${def.entryPath}/`)) return true;
  return workspaceItems(def).some((i) => splitHref(i.href).path === pathname);
}

/**
 * Which workspace is showing for this location. `activeId` is the session's
 * workspace (set on the entry route, kept on its pages, cleared elsewhere).
 */
export function resolveWorkspace(pathname: string, activeId: string | null): { def: WorkspaceDef | null; nextActiveId: string | null } {
  const entered = WORKSPACES.find((w) => pathname === w.entryPath || pathname.startsWith(`${w.entryPath}/`));
  if (entered) return { def: entered, nextActiveId: entered.id };
  const active = WORKSPACES.find((w) => w.id === activeId);
  if (active && isWorkspaceRoute(active, pathname)) return { def: active, nextActiveId: active.id };
  return { def: null, nextActiveId: null };
}

/** The item for this location: the exact ?tab= match first, then the path alone. */
export function activeItem(def: WorkspaceDef, pathname: string, search: string): WorkspaceItem | null {
  const urlTab = new URLSearchParams(search).get('tab');
  const items = workspaceItems(def);
  const onPath = items.filter((i) => splitHref(i.href).path === pathname);
  if (pathname === def.entryPath) {
    const want = urlTab && entryTabs(def).includes(urlTab) ? urlTab : def.defaultTab;
    return onPath.find((i) => splitHref(i.href).tab === want) ?? null;
  }
  return onPath.find((i) => { const t = splitHref(i.href).tab; return t !== null && t === urlTab; })
    ?? onPath.find((i) => splitHref(i.href).tab === null)
    ?? onPath[0]
    ?? null;
}

export interface WorkspaceAccess {
  /** Module id → on. Undefined while loading (then nothing is hidden for it). */
  moduleEnabled: (moduleId: string) => boolean;
  /** The route gate (isRouteAllowed) for this person. */
  routeAllowed: (pathname: string) => boolean;
}

/** May this person use the workspace at all? */
export function canUseWorkspace(def: WorkspaceDef, access: WorkspaceAccess): boolean {
  return access.moduleEnabled(def.entryModule) && access.routeAllowed(def.entryPath);
}

/** The sections this person sees: module on and the route their roles allow. */
export function visibleSections(def: WorkspaceDef, access: WorkspaceAccess): WorkspaceSection[] {
  return def.sections
    .map((s) => ({
      ...s,
      items: s.items.filter((i) => access.moduleEnabled(i.moduleId) && access.routeAllowed(splitHref(i.href).path)),
    }))
    .filter((s) => s.items.length > 0);
}
