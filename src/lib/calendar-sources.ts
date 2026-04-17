/**
 * Calendar Source Registry
 *
 * Aggregator pattern: Calendar module owns no event data. Each domain module
 * registers a CalendarSource that knows how to fetch events from its own table
 * and map them to the unified CalendarEvent shape.
 *
 * Adding a new source:
 *   import { registerCalendarSource } from '@/lib/calendar-sources';
 *   registerCalendarSource({ id: 'my_source', ... });
 *
 * Sources are auto-filtered by enabled modules in the UI.
 */

import { supabase } from '@/integrations/supabase/client';
import { logger } from '@/lib/logger';
import type { LucideIcon } from 'lucide-react';
import {
  CalendarDays,
  CheckSquare,
  Plane,
  FolderKanban,
  FileSignature,
  RefreshCw,
} from 'lucide-react';
import type { ModulesSettings } from '@/hooks/useModules';

export interface CalendarEvent {
  id: string;
  sourceId: string;
  title: string;
  start: string; // ISO
  end?: string;  // ISO
  allDay?: boolean;
  url?: string;  // deep-link in admin
  color?: string; // hex/css color (overrides source default)
  meta?: Record<string, unknown>;
}

export interface DateRange {
  start: Date;
  end: Date;
}

export interface CalendarSource {
  id: string;
  label: string;
  /** Tailwind/CSS color (hex preferred — FullCalendar consumes it directly) */
  color: string;
  icon: LucideIcon;
  /** Required module — source is hidden when module is disabled */
  moduleId: keyof ModulesSettings;
  fetch: (range: DateRange) => Promise<CalendarEvent[]>;
}

const sources = new Map<string, CalendarSource>();

export function registerCalendarSource(source: CalendarSource) {
  sources.set(source.id, source);
}

export function getCalendarSources(): CalendarSource[] {
  return Array.from(sources.values());
}

export function getEnabledCalendarSources(modules: ModulesSettings | undefined): CalendarSource[] {
  if (!modules) return [];
  return getCalendarSources().filter((s) => modules[s.moduleId]?.enabled);
}

// =============================================================================
// Built-in sources
// =============================================================================

const COLORS = {
  bookings: '#3b82f6',     // blue
  crmTasks: '#10b981',     // emerald
  leave: '#f59e0b',        // amber
  projectTasks: '#8b5cf6', // violet
  contracts: '#ef4444',    // red
  renewals: '#06b6d4',     // cyan
};

registerCalendarSource({
  id: 'bookings',
  label: 'Bookings',
  color: COLORS.bookings,
  icon: CalendarDays,
  moduleId: 'bookings',
  async fetch({ start, end }) {
    const { data, error } = await supabase
      .from('bookings')
      .select('id, customer_name, start_time, end_time, status, service_id, booking_services(name)')
      .gte('start_time', start.toISOString())
      .lte('start_time', end.toISOString())
      .neq('status', 'cancelled')
      .limit(500);
    if (error) {
      logger.error('[calendar:bookings]', error);
      return [];
    }
    return (data ?? []).map((b: any): CalendarEvent => ({
      id: `booking:${b.id}`,
      sourceId: 'bookings',
      title: `${b.customer_name}${b.booking_services?.name ? ` — ${b.booking_services.name}` : ''}`,
      start: b.start_time,
      end: b.end_time,
      url: '/admin/bookings',
      meta: { status: b.status },
    }));
  },
});

registerCalendarSource({
  id: 'crm_tasks',
  label: 'CRM Tasks',
  color: COLORS.crmTasks,
  icon: CheckSquare,
  moduleId: 'leads',
  async fetch({ start, end }) {
    const { data, error } = await supabase
      .from('crm_tasks')
      .select('id, title, due_date, lead_id, deal_id, priority, completed_at')
      .not('due_date', 'is', null)
      .gte('due_date', start.toISOString())
      .lte('due_date', end.toISOString())
      .is('completed_at', null)
      .limit(500);
    if (error) {
      logger.error('[calendar:crm_tasks]', error);
      return [];
    }
    return (data ?? []).map((t: any): CalendarEvent => ({
      id: `crm_task:${t.id}`,
      sourceId: 'crm_tasks',
      title: t.title,
      start: t.due_date,
      allDay: true,
      url: t.lead_id
        ? `/admin/contacts/${t.lead_id}`
        : t.deal_id
        ? `/admin/deals/${t.deal_id}`
        : '/admin',
      meta: { priority: t.priority },
    }));
  },
});

registerCalendarSource({
  id: 'leave',
  label: 'Leave',
  color: COLORS.leave,
  icon: Plane,
  moduleId: 'hr',
  async fetch({ start, end }) {
    const { data, error } = await supabase
      .from('leave_requests')
      .select('id, leave_type, start_date, end_date, status, employees(name)')
      .gte('end_date', start.toISOString().slice(0, 10))
      .lte('start_date', end.toISOString().slice(0, 10))
      .in('status', ['approved', 'pending'])
      .limit(500);
    if (error) {
      logger.error('[calendar:leave]', error);
      return [];
    }
    return (data ?? []).map((l: any): CalendarEvent => {
      // FullCalendar treats end as exclusive → add 1 day so multi-day leave shows last day
      const endDate = new Date(l.end_date);
      endDate.setDate(endDate.getDate() + 1);
      return {
        id: `leave:${l.id}`,
        sourceId: 'leave',
        title: `${l.employees?.name ?? 'Employee'} — ${l.leave_type}`,
        start: l.start_date,
        end: endDate.toISOString().slice(0, 10),
        allDay: true,
        url: '/admin/hr',
        color: l.status === 'pending' ? '#fbbf24' : COLORS.leave,
        meta: { status: l.status },
      };
    });
  },
});

registerCalendarSource({
  id: 'project_tasks',
  label: 'Project Tasks',
  color: COLORS.projectTasks,
  icon: FolderKanban,
  moduleId: 'projects',
  async fetch({ start, end }) {
    const { data, error } = await supabase
      .from('project_tasks')
      .select('id, title, due_date, project_id, status, projects(name, color)')
      .not('due_date', 'is', null)
      .gte('due_date', start.toISOString().slice(0, 10))
      .lte('due_date', end.toISOString().slice(0, 10))
      .neq('status', 'done')
      .limit(500);
    if (error) {
      logger.error('[calendar:project_tasks]', error);
      return [];
    }
    return (data ?? []).map((t: any): CalendarEvent => ({
      id: `project_task:${t.id}`,
      sourceId: 'project_tasks',
      title: `${t.projects?.name ? `[${t.projects.name}] ` : ''}${t.title}`,
      start: t.due_date,
      allDay: true,
      url: '/admin/projects',
      color: t.projects?.color || COLORS.projectTasks,
      meta: { status: t.status },
    }));
  },
});

registerCalendarSource({
  id: 'contracts',
  label: 'Contract renewals',
  color: COLORS.contracts,
  icon: FileSignature,
  moduleId: 'contracts',
  async fetch({ start, end }) {
    const { data, error } = await supabase
      .from('contracts')
      .select('id, title, counterparty_name, end_date, status, renewal_type')
      .not('end_date', 'is', null)
      .gte('end_date', start.toISOString().slice(0, 10))
      .lte('end_date', end.toISOString().slice(0, 10))
      .neq('status', 'terminated')
      .limit(500);
    if (error) {
      logger.error('[calendar:contracts]', error);
      return [];
    }
    return (data ?? []).map((c: any): CalendarEvent => ({
      id: `contract:${c.id}`,
      sourceId: 'contracts',
      title: `Renewal: ${c.title} (${c.counterparty_name})`,
      start: c.end_date,
      allDay: true,
      url: '/admin/contracts',
      meta: { renewal_type: c.renewal_type, status: c.status },
    }));
  },
});

registerCalendarSource({
  id: 'subscription_renewals',
  label: 'Subscription renewals',
  color: COLORS.renewals,
  icon: RefreshCw,
  moduleId: 'subscriptions',
  async fetch({ start, end }) {
    const { data, error } = await supabase
      .from('subscriptions')
      .select('id, customer_name, customer_email, product_name, current_period_end, status, cancel_at_period_end')
      .in('status', ['active', 'trialing'])
      .not('current_period_end', 'is', null)
      .gte('current_period_end', start.toISOString())
      .lte('current_period_end', end.toISOString())
      .limit(500);
    if (error) {
      logger.error('[calendar:subscription_renewals]', error);
      return [];
    }
    return (data ?? []).map((s: any): CalendarEvent => ({
      id: `subscription:${s.id}`,
      sourceId: 'subscription_renewals',
      title: `${s.cancel_at_period_end ? 'Ends' : 'Renews'}: ${s.customer_name ?? s.customer_email ?? 'Customer'}${s.product_name ? ` — ${s.product_name}` : ''}`,
      start: s.current_period_end,
      allDay: true,
      url: '/admin/subscriptions',
      color: s.cancel_at_period_end ? '#ef4444' : COLORS.renewals,
      meta: { status: s.status },
    }));
  },
});
