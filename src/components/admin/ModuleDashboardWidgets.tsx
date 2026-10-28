import { useQuery } from '@tanstack/react-query';
import { Receipt, LifeBuoy, CheckSquare, Boxes, ShoppingCart, Users, FolderKanban } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { usePlatformFormat } from '@/hooks/usePlatformFormat';
import { WidgetShell, MetricTile } from '@/components/admin/DashboardWidgetShell';
import { businessToday } from '@/lib/platform-fallbacks';

/**
 * Module dashboard widgets — one small KPI card per business domain so every
 * functional role gets a dashboard that answers "what is my module's state?"
 * without opening the module.
 *
 * All counts are read-only aggregates over existing tables; nothing here owns
 * business logic. Each tile deep-links into the module using the same
 * query-param conventions as the rest of the admin.
 */

const STALE = 60_000;

/* ------------------------------ Receivables ------------------------------ */

export function FinanceDashboardWidget() {
  const { formatCurrency } = usePlatformFormat();
  const { data, isLoading } = useQuery({
    queryKey: ['dashboard', 'finance'],
    staleTime: STALE,
    queryFn: async () => {
      const today = businessToday();
      const { data: rows, error } = await supabase
        .from('invoices')
        .select('status,total_cents,paid_amount_cents,currency,due_date')
        .in('status', ['draft', 'sent', 'partially_paid', 'overdue'])
        .limit(1000);
      if (error) throw error;

      let outstanding = 0;
      let overdueAmount = 0;
      let overdueCount = 0;
      let draft = 0;
      let currency: string | null = null;
      for (const r of rows ?? []) {
        if (r.status === 'draft') { draft++; continue; }
        const open = (r.total_cents ?? 0) - (r.paid_amount_cents ?? 0);
        outstanding += open;
        currency = currency ?? r.currency;
        if (r.due_date && r.due_date < today) {
          overdueAmount += open;
          overdueCount++;
        }
      }
      return { outstanding, overdueAmount, overdueCount, draft, currency };
    },
  });

  return (
    <WidgetShell title="Receivables" icon={Receipt} href="/admin/invoices" isLoading={isLoading} tileCount={4}>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <MetricTile
          label="Outstanding"
          value={formatCurrency(data?.outstanding ?? 0, data?.currency, { maximumFractionDigits: 0 })}
          href="/admin/invoices"
        />
        <MetricTile
          label="Overdue"
          value={formatCurrency(data?.overdueAmount ?? 0, data?.currency, { maximumFractionDigits: 0 })}
          tone={(data?.overdueAmount ?? 0) > 0 ? 'destructive' : 'default'}
          href="/admin/invoices"
        />
        <MetricTile
          label="Overdue invoices"
          value={data?.overdueCount ?? 0}
          tone={(data?.overdueCount ?? 0) > 0 ? 'warning' : 'default'}
          href="/admin/invoices"
        />
        <MetricTile label="Drafts" value={data?.draft ?? 0} href="/admin/invoices" />
      </div>
    </WidgetShell>
  );
}

/* -------------------------------- Tickets -------------------------------- */

export function TicketsDashboardWidget() {
  const { data, isLoading } = useQuery({
    queryKey: ['dashboard', 'tickets'],
    staleTime: STALE,
    queryFn: async () => {
      const nowIso = new Date().toISOString();
      const openFilter = ['new', 'open', 'in_progress', 'waiting'] as const;
      const [open, unassigned, breached, urgent] = await Promise.all([
        supabase.from('tickets').select('id', { count: 'exact', head: true }).in('status', openFilter),
        supabase.from('tickets').select('id', { count: 'exact', head: true }).in('status', openFilter).is('assigned_to', null),
        supabase.from('tickets').select('id', { count: 'exact', head: true }).in('status', openFilter).not('sla_deadline', 'is', null).lt('sla_deadline', nowIso),
        supabase.from('tickets').select('id', { count: 'exact', head: true }).in('status', openFilter).eq('priority', 'urgent'),
      ]);
      return {
        open: open.count ?? 0,
        unassigned: unassigned.count ?? 0,
        breached: breached.count ?? 0,
        urgent: urgent.count ?? 0,
      };
    },
  });

  return (
    <WidgetShell title="Support Queue" icon={LifeBuoy} href="/admin/tickets" isLoading={isLoading} tileCount={4}>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <MetricTile label="Open" value={data?.open ?? 0} href="/admin/tickets" />
        <MetricTile
          label="Unassigned"
          value={data?.unassigned ?? 0}
          tone={(data?.unassigned ?? 0) > 0 ? 'warning' : 'default'}
          href="/admin/tickets?assignee=unassigned"
        />
        <MetricTile
          label="SLA breached"
          value={data?.breached ?? 0}
          tone={(data?.breached ?? 0) > 0 ? 'destructive' : 'success'}
          href="/admin/tickets?sla=breached"
        />
        <MetricTile
          label="Urgent"
          value={data?.urgent ?? 0}
          tone={(data?.urgent ?? 0) > 0 ? 'warning' : 'default'}
          href="/admin/tickets?priority=urgent"
        />
      </div>
    </WidgetShell>
  );
}

/* ------------------------------- Approvals ------------------------------- */

export function ApprovalsDashboardWidget() {
  const { formatCurrency } = usePlatformFormat();
  const { data, isLoading } = useQuery({
    queryKey: ['dashboard', 'approvals'],
    staleTime: STALE,
    queryFn: async () => {
      const { data: rows, error } = await supabase
        .from('approval_requests')
        .select('id,amount_cents,currency,created_at,entity_type')
        .eq('status', 'pending')
        .limit(500);
      if (error) throw error;
      const dayMs = 86_400_000;
      const now = Date.now();
      let amount = 0;
      let stale = 0;
      const kinds = new Set<string>();
      for (const r of rows ?? []) {
        amount += r.amount_cents ?? 0;
        if (now - new Date(r.created_at).getTime() > 3 * dayMs) stale++;
        if (r.entity_type) kinds.add(r.entity_type);
      }
      return {
        pending: rows?.length ?? 0,
        amount,
        currency: rows?.[0]?.currency ?? null,
        stale,
        kinds: kinds.size,
      };
    },
  });

  return (
    <WidgetShell title="Approvals" icon={CheckSquare} href="/admin/approvals" isLoading={isLoading} tileCount={4}>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <MetricTile
          label="Pending"
          value={data?.pending ?? 0}
          tone={(data?.pending ?? 0) > 0 ? 'warning' : 'success'}
          href="/admin/approvals"
        />
        <MetricTile
          label="Waiting > 3 days"
          value={data?.stale ?? 0}
          tone={(data?.stale ?? 0) > 0 ? 'destructive' : 'default'}
          href="/admin/approvals"
        />
        <MetricTile
          label="Amount at stake"
          value={formatCurrency(data?.amount ?? 0, data?.currency, { maximumFractionDigits: 0 })}
        />
        <MetricTile label="Request types" value={data?.kinds ?? 0} />
      </div>
    </WidgetShell>
  );
}

/* ------------------------------- Inventory ------------------------------- */

export function InventoryDashboardWidget() {
  const { data, isLoading } = useQuery({
    queryKey: ['dashboard', 'inventory'],
    staleTime: STALE,
    queryFn: async () => {
      const [tracked, receipts, transfers] = await Promise.all([
        supabase
          .from('products')
          .select('id,stock_quantity,low_stock_threshold')
          .eq('track_inventory', true)
          .eq('is_active', true)
          .limit(1000),
        supabase.from('inventory_receipts').select('id', { count: 'exact', head: true }).neq('status', 'done'),
        supabase.from('inventory_transfers').select('id', { count: 'exact', head: true }).neq('status', 'done'),
      ]);
      let low = 0;
      let out = 0;
      for (const p of tracked.data ?? []) {
        const qty = p.stock_quantity ?? 0;
        if (qty <= 0) out++;
        else if (qty <= (p.low_stock_threshold ?? 0)) low++;
      }
      return {
        tracked: tracked.data?.length ?? 0,
        low,
        out,
        openMoves: (receipts.count ?? 0) + (transfers.count ?? 0),
      };
    },
  });

  return (
    <WidgetShell title="Inventory" icon={Boxes} href="/admin/inventory" isLoading={isLoading} tileCount={4}>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <MetricTile label="Tracked products" value={data?.tracked ?? 0} href="/admin/inventory" />
        <MetricTile
          label="Low stock"
          value={data?.low ?? 0}
          tone={(data?.low ?? 0) > 0 ? 'warning' : 'default'}
          href="/admin/inventory"
        />
        <MetricTile
          label="Out of stock"
          value={data?.out ?? 0}
          tone={(data?.out ?? 0) > 0 ? 'destructive' : 'success'}
          href="/admin/inventory"
        />
        <MetricTile label="Open receipts & transfers" value={data?.openMoves ?? 0} href="/admin/inventory" />
      </div>
    </WidgetShell>
  );
}

/* ------------------------------- Purchasing ------------------------------ */

export function PurchasingDashboardWidget() {
  const { formatCurrency } = usePlatformFormat();
  const { data, isLoading } = useQuery({
    queryKey: ['dashboard', 'purchasing'],
    staleTime: STALE,
    queryFn: async () => {
      const today = businessToday();
      const { data: rows, error } = await supabase
        .from('purchase_orders')
        .select('status,total_cents,currency,expected_delivery')
        .not('status', 'in', '(received,cancelled)')
        .limit(500);
      if (error) throw error;
      let draft = 0;
      let awaiting = 0;
      let late = 0;
      let committed = 0;
      for (const r of rows ?? []) {
        if (r.status === 'draft') draft++;
        else awaiting++;
        committed += r.total_cents ?? 0;
        if (r.expected_delivery && r.expected_delivery < today && r.status !== 'draft') late++;
      }
      return { draft, awaiting, late, committed, currency: rows?.[0]?.currency ?? null };
    },
  });

  return (
    <WidgetShell title="Purchasing" icon={ShoppingCart} href="/admin/purchasing" isLoading={isLoading} tileCount={4}>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <MetricTile label="Draft POs" value={data?.draft ?? 0} href="/admin/purchasing" />
        <MetricTile label="Awaiting delivery" value={data?.awaiting ?? 0} href="/admin/purchasing" />
        <MetricTile
          label="Late deliveries"
          value={data?.late ?? 0}
          tone={(data?.late ?? 0) > 0 ? 'destructive' : 'success'}
          href="/admin/purchasing"
        />
        <MetricTile
          label="Committed spend"
          value={formatCurrency(data?.committed ?? 0, data?.currency, { maximumFractionDigits: 0 })}
        />
      </div>
    </WidgetShell>
  );
}

/* ----------------------------------- HR ---------------------------------- */

export function HrDashboardWidget() {
  const { data, isLoading } = useQuery({
    queryKey: ['dashboard', 'hr'],
    staleTime: STALE,
    queryFn: async () => {
      const today = businessToday();
      const [employees, pendingLeave, onLeave, openRoles] = await Promise.all([
        supabase.from('employees').select('id', { count: 'exact', head: true }).eq('status', 'active'),
        supabase.from('leave_requests').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
        supabase
          .from('leave_requests')
          .select('id', { count: 'exact', head: true })
          .eq('status', 'approved')
          .lte('start_date', today)
          .gte('end_date', today),
        supabase.from('job_postings').select('id', { count: 'exact', head: true }).eq('status', 'published'),
      ]);
      return {
        employees: employees.count ?? 0,
        pendingLeave: pendingLeave.count ?? 0,
        onLeave: onLeave.count ?? 0,
        openRoles: openRoles.count ?? 0,
      };
    },
  });

  return (
    <WidgetShell title="People" icon={Users} href="/admin/hr" isLoading={isLoading} tileCount={4}>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <MetricTile label="Active employees" value={data?.employees ?? 0} href="/admin/hr" />
        <MetricTile
          label="Leave to approve"
          value={data?.pendingLeave ?? 0}
          tone={(data?.pendingLeave ?? 0) > 0 ? 'warning' : 'default'}
          href="/admin/hr?tab=leave"
        />
        <MetricTile label="Out today" value={data?.onLeave ?? 0} href="/admin/hr?tab=leave" />
        <MetricTile label="Open roles" value={data?.openRoles ?? 0} href="/admin/recruitment" />
      </div>
    </WidgetShell>
  );
}

/* -------------------------------- Projects ------------------------------- */

export function ProjectsDashboardWidget() {
  const { data, isLoading } = useQuery({
    queryKey: ['dashboard', 'projects'],
    staleTime: STALE,
    queryFn: async () => {
      const today = businessToday();
      const [projects, openTasks, overdue, unassigned] = await Promise.all([
        supabase.from('projects').select('id', { count: 'exact', head: true }).eq('is_active', true),
        supabase.from('project_tasks').select('id', { count: 'exact', head: true }).neq('status', 'done'),
        supabase
          .from('project_tasks')
          .select('id', { count: 'exact', head: true })
          .neq('status', 'done')
          .not('due_date', 'is', null)
          .lt('due_date', today),
        supabase.from('project_tasks').select('id', { count: 'exact', head: true }).neq('status', 'done').is('assigned_to', null),
      ]);
      return {
        projects: projects.count ?? 0,
        openTasks: openTasks.count ?? 0,
        overdue: overdue.count ?? 0,
        unassigned: unassigned.count ?? 0,
      };
    },
  });

  return (
    <WidgetShell title="Projects" icon={FolderKanban} href="/admin/projects" isLoading={isLoading} tileCount={4}>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <MetricTile label="Active projects" value={data?.projects ?? 0} href="/admin/projects" />
        <MetricTile label="Open tasks" value={data?.openTasks ?? 0} href="/admin/projects" />
        <MetricTile
          label="Overdue tasks"
          value={data?.overdue ?? 0}
          tone={(data?.overdue ?? 0) > 0 ? 'destructive' : 'success'}
          href="/admin/projects"
        />
        <MetricTile
          label="Unassigned"
          value={data?.unassigned ?? 0}
          tone={(data?.unassigned ?? 0) > 0 ? 'warning' : 'default'}
          href="/admin/projects"
        />
      </div>
    </WidgetShell>
  );
}
