import type { AppRole } from '@/types/cms';

/**
 * Dashboard widget catalog.
 *
 * `roles` = the functional roles the widget is relevant for. `undefined` means
 * "relevant for everyone". Admin always sees everything (same rule as the
 * sidebar / role_module_access matrix).
 */
export interface DashboardWidgetMeta {
  id: string;
  title: string;
  description: string;
  moduleId?: string;
  roles?: AppRole[];
}

export const DASHBOARD_WIDGETS: DashboardWidgetMeta[] = [
  { id: 'my-day', title: 'My Day', description: 'Everything assigned to or waiting on you' },
  { id: 'business-pulse', title: 'Business Pulse', description: 'Health score, key metrics & daily briefing' },
  { id: 'needs-attention', title: 'Needs Attention', description: 'Action items requiring your attention' },
  { id: 'content-overview', title: 'Content Overview', description: 'Page statistics overview', roles: ['marketing'] },
  { id: 'leads', title: 'Leads', description: 'Recent leads and stats', moduleId: 'leads', roles: ['sales', 'marketing'] },
  { id: 'live-support', title: 'Live Support', description: 'Support conversations', moduleId: 'liveSupport', roles: ['support'] },
  { id: 'chat-analytics', title: 'Chat Analytics', description: 'AI chat usage statistics', moduleId: 'chat', roles: ['support', 'marketing'] },
  { id: 'chat-feedback', title: 'Chat Feedback', description: 'User feedback on AI chat', moduleId: 'chat', roles: ['support', 'marketing'] },
  { id: 'finance', title: 'Receivables', description: 'Outstanding, overdue & draft invoices', moduleId: 'invoicing', roles: ['accounting', 'sales'] },
  { id: 'tickets', title: 'Support Queue', description: 'Open, unassigned & SLA-breached tickets', moduleId: 'tickets', roles: ['support'] },
  { id: 'approvals', title: 'Approvals', description: 'Pending approval requests and amount at stake', moduleId: 'approvals', roles: ['accounting', 'purchasing', 'hr'] },
  { id: 'inventory', title: 'Inventory', description: 'Low stock, out of stock & open stock moves', moduleId: 'inventory', roles: ['warehouse'] },
  { id: 'purchasing', title: 'Purchasing', description: 'Draft POs, late deliveries & committed spend', moduleId: 'purchasing', roles: ['purchasing'] },
  { id: 'hr', title: 'People', description: 'Headcount, leave to approve & open roles', moduleId: 'hr', roles: ['hr'] },
  { id: 'projects', title: 'Projects', description: 'Active projects, overdue & unassigned tasks', moduleId: 'projects', roles: ['projects'] },
  { id: 'aeo', title: 'AEO Insights', description: 'Answer Engine Optimization', roles: ['marketing'] },
  { id: 'automation-health', title: 'Automation Health', description: 'Automation run counts and error rates' },
  { id: 'flowpilot', title: 'FlowPilot', description: 'AI agent activity and goals' },
  { id: 'recent-pages', title: 'Recent Pages', description: 'Recently updated pages', roles: ['marketing'] },
  // Wire id kept ('quick-actions' lives in stored layouts); the ungated
  // shortcut card it once named was removed — the top bar's QuickCreateMenu is
  // the one quick-action surface, role- and module-gated. What remains under
  // this id is the approver's Pending Review card.
  { id: 'quick-actions', title: 'Pending Review', description: 'Pages awaiting approval (approvers)' },
];

export const WIDGET_META: Record<string, DashboardWidgetMeta> = Object.fromEntries(
  DASHBOARD_WIDGETS.map((w) => [w.id, w]),
);

/** Full order used as the base for every layout. */
export const DEFAULT_WIDGET_ORDER = DASHBOARD_WIDGETS.map((w) => w.id);

/**
 * Role presets — the order a given role most likely wants. Widgets not listed
 * are still available (togglable in Customize) but start hidden.
 */
export const ROLE_PRESETS: Partial<Record<AppRole | 'admin', string[]>> = {
  admin: ['my-day', 'business-pulse', 'needs-attention', 'finance', 'tickets', 'approvals', 'content-overview', 'leads', 'live-support', 'flowpilot', 'automation-health', 'chat-analytics', 'chat-feedback', 'aeo', 'recent-pages', 'quick-actions'],
  sales: ['my-day', 'needs-attention', 'leads', 'finance', 'business-pulse'],
  marketing: ['my-day', 'content-overview', 'aeo', 'leads', 'chat-analytics', 'chat-feedback', 'recent-pages'],
  support: ['my-day', 'needs-attention', 'tickets', 'live-support', 'chat-analytics', 'chat-feedback'],
  accounting: ['my-day', 'needs-attention', 'finance', 'approvals', 'business-pulse'],
  hr: ['my-day', 'needs-attention', 'hr', 'approvals'],
  warehouse: ['my-day', 'needs-attention', 'inventory'],
  purchasing: ['my-day', 'needs-attention', 'purchasing', 'approvals', 'inventory'],
  projects: ['my-day', 'needs-attention', 'projects'],
};

/** Roles that may see a widget, taking admin's super-role into account. */
export function isWidgetRoleRelevant(
  widgetId: string,
  roles: AppRole[],
  isAdmin: boolean,
): boolean {
  if (isAdmin) return true;
  const meta = WIDGET_META[widgetId];
  if (!meta || !meta.roles) return true;
  return meta.roles.some((r) => roles.includes(r));
}

/** Preset key for a user's role set: admin wins, else first functional role. */
export function presetKeyForRoles(roles: AppRole[], isAdmin: boolean): AppRole | 'admin' {
  if (isAdmin) return 'admin';
  const match = (Object.keys(ROLE_PRESETS) as (AppRole | 'admin')[]).find(
    (k) => k !== 'admin' && roles.includes(k as AppRole),
  );
  return (match as AppRole) ?? 'admin';
}

/** Builds a full widget list (all ids) with visibility from the preset. */
export function buildPresetLayout(key: AppRole | 'admin') {
  const visible = new Set(ROLE_PRESETS[key] ?? ROLE_PRESETS.admin ?? DEFAULT_WIDGET_ORDER);
  const ordered = [
    ...(ROLE_PRESETS[key] ?? DEFAULT_WIDGET_ORDER),
    ...DEFAULT_WIDGET_ORDER.filter((id) => !visible.has(id)),
  ];
  return ordered.map((id) => ({ id, visible: visible.has(id) }));
}
