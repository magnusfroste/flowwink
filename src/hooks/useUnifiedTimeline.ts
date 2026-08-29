import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface TimelineEvent {
  id: string;
  type: 'activity' | 'booking' | 'form' | 'chat' | 'newsletter_open' | 'newsletter_click' | 'order' | 'task' | 'email';
  title: string;
  description?: string;
  metadata?: Record<string, unknown>;
  created_at: string;
  icon: string;
  color: string;
  points?: number;
  /** Set for `email` events — drives the inbound/outbound visual language. */
  direction?: 'inbound' | 'outbound';
  actor?: string;
  status?: string;
  /**
   * Set for rows in `lead_activities` — the ledger. Carries what the UI needs
   * to correct the TEXT of an entry it may correct: the row id, who wrote it
   * (null = written by the system, nobody may rewrite it), and whether it has
   * already been corrected. The entry itself is immutable; see the
   * lead_activity_ledger_guard trigger.
   */
  activityId?: string;
  activityType?: string;
  authorId?: string | null;
  editedAt?: string | null;
}


/**
 * Aggregates cross-module interactions for a contact by email + lead_id
 */
export function useUnifiedTimeline(leadId: string | undefined, email: string | undefined) {
  return useQuery({
    queryKey: ['unified-timeline', leadId, email],
    queryFn: async () => {
      const events: TimelineEvent[] = [];

      // 0. Communications (outbound_communications) — the actual emails,
      // inbound replies included. Loaded first so lead_activities rows that
      // describe the same message can be deduplicated away.
      const commMessageIds = new Set<string>();
      if (leadId) {
        const { data: comms } = await supabase
          .from('outbound_communications')
          .select('*')
          .eq('related_entity_type', 'lead')
          .eq('related_entity_id', leadId)
          .order('created_at', { ascending: false })
          .limit(100);

        for (const c of comms ?? []) {
          const meta = (c.metadata ?? {}) as Record<string, unknown>;
          const messageId =
            (meta.message_id as string | undefined) ??
            (meta.provider_message_id as string | undefined);
          if (messageId) commMessageIds.add(messageId);

          const isInbound = c.direction === 'inbound';
          const text =
            c.body_text ?? (c.body_html ? c.body_html.replace(/<[^>]+>/g, ' ') : '');
          events.push({
            id: `comm-${c.id}`,
            type: 'email',
            direction: isInbound ? 'inbound' : 'outbound',
            title: c.subject || (isInbound ? 'Email received' : 'Email sent'),
            description: text ? text.replace(/\s+/g, ' ').trim().slice(0, 160) : undefined,
            metadata: meta,
            created_at: c.created_at,
            icon: isInbound ? 'ArrowDownLeft' : 'ArrowUpRight',
            color: isInbound ? 'text-emerald-600' : 'text-blue-600',
            actor: deriveCommActor(c as Record<string, unknown>),
            status: c.status ?? undefined,
          });
        }
      }

      // 1. Lead activities (existing)
      if (leadId) {
        const { data: activities } = await supabase
          .from('lead_activities')
          .select('*')
          .eq('lead_id', leadId)
          .order('created_at', { ascending: false })
          .limit(100);

        if (activities) {
          for (const a of activities) {
            const meta = a.metadata as Record<string, unknown> | null;
            // Prefer the outbound_communications row for the same message —
            // it carries subject, provider and thread.
            const mid = meta?.message_id as string | undefined;
            if (mid && commMessageIds.has(mid)) continue;

            events.push({
              id: `activity-${a.id}`,
              type: 'activity',
              title: getActivityTitle(a.type, meta),
              // ONE key going forward: `note`. `description` and `text` are read
              // because live instances already hold rows written that way — the
              // contact-created entry used `text` and rendered bodiless for
              // months (measured 2026-08-29). A reader that only knows today's
              // key silently empties yesterday's log.
              description:
                (meta?.note as string) ||
                (meta?.description as string) ||
                (meta?.text as string) ||
                undefined,
              metadata: meta || undefined,
              created_at: a.created_at,
              icon: getActivityIcon(a.type),
              color: getActivityColor(a.type),
              points: a.points || undefined,
              activityId: a.id,
              activityType: a.type,
              authorId: (a as { created_by?: string | null }).created_by ?? null,
              editedAt: (a as { edited_at?: string | null }).edited_at ?? null,
            });
          }
        }
      }


      if (email) {
        // 2. Bookings
        const { data: bookings } = await supabase
          .from('bookings')
          .select('id, customer_name, start_time, status, service_id, created_at')
          .eq('customer_email', email)
          .order('created_at', { ascending: false })
          .limit(50);

        if (bookings) {
          for (const b of bookings) {
            events.push({
              id: `booking-${b.id}`,
              type: 'booking',
              title: `Booking ${b.status}`,
              description: `Scheduled: ${new Date(b.start_time).toLocaleDateString()}`,
              created_at: b.created_at,
              icon: 'Calendar',
              color: 'text-indigo-500',
            });
          }
        }

        // 3. Chat conversations
        const { data: conversations } = await supabase
          .from('chat_conversations')
          .select('id, title, created_at, conversation_status')
          .eq('customer_email', email)
          .order('created_at', { ascending: false })
          .limit(20);

        if (conversations) {
          for (const c of conversations) {
            events.push({
              id: `chat-${c.id}`,
              type: 'chat',
              title: c.title || 'Chat conversation',
              description: `Status: ${c.conversation_status || 'open'}`,
              created_at: c.created_at,
              icon: 'MessageSquare',
              color: 'text-violet-500',
            });
          }
        }

        // 4. Newsletter opens
        const { data: opens } = await supabase
          .from('newsletter_email_opens')
          .select('id, newsletter_id, opened_at, created_at')
          .eq('recipient_email', email)
          .order('created_at', { ascending: false })
          .limit(30);

        if (opens) {
          for (const o of opens) {
            events.push({
              id: `open-${o.id}`,
              type: 'newsletter_open',
              title: 'Email opened',
              created_at: o.opened_at || o.created_at,
              icon: 'MailOpen',
              color: 'text-blue-400',
            });
          }
        }

        // 5. Newsletter link clicks
        const { data: clicks } = await supabase
          .from('newsletter_link_clicks')
          .select('id, original_url, clicked_at, created_at')
          .eq('recipient_email', email)
          .order('created_at', { ascending: false })
          .limit(30);

        if (clicks) {
          for (const c of clicks) {
            events.push({
              id: `click-${c.id}`,
              type: 'newsletter_click',
              title: 'Link clicked',
              description: c.original_url,
              created_at: c.clicked_at || c.created_at,
              icon: 'MousePointer',
              color: 'text-cyan-500',
            });
          }
        }

        // 6. Orders
        const { data: orders } = await supabase
          .from('orders')
          .select('id, total_cents, currency, status, created_at')
          .eq('customer_email', email)
          .order('created_at', { ascending: false })
          .limit(20);

        if (orders) {
          for (const o of orders) {
            events.push({
              id: `order-${o.id}`,
              type: 'order',
              title: `Order ${o.status}`,
              description: `${(o.total_cents / 100).toFixed(2)} ${o.currency}`,
              created_at: o.created_at,
              icon: 'ShoppingCart',
              color: 'text-emerald-500',
            });
          }
        }
      }

      // Sort all events by date descending
      events.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
      return events;
    },
    enabled: !!(leadId || email),
  });
}

function getActivityTitle(type: string, meta: Record<string, unknown> | null): string {
  if (type === 'task_completed') {
    return meta?.task_title ? `Task done: ${meta.task_title}` : 'Task completed';
  }
  const titles: Record<string, string> = {
    call: 'Phone call',
    email: 'Email sent',
    meeting: 'Meeting',
    note: 'Note added',
    form_submit: `Form: ${meta?.form_name || 'submitted'}`,
    email_open: 'Email opened',
    link_click: 'Link clicked',
    status_change: `Status: ${meta?.from} → ${meta?.to}`,
    deal_closed_won: 'Deal won',
    deal_closed_lost: 'Deal lost',
    webinar_register: 'Webinar registration',
  };
  return meta?.title as string || titles[type] || type;
}

function getActivityIcon(type: string): string {
  const icons: Record<string, string> = {
    call: 'Phone',
    email: 'Mail',
    meeting: 'Users',
    note: 'MessageSquare',
    form_submit: 'FileText',
    email_open: 'MailOpen',
    link_click: 'MousePointer',
    status_change: 'RefreshCw',
    deal_closed_won: 'Trophy',
    deal_closed_lost: 'XCircle',
    webinar_register: 'Video',
    task_completed: 'CheckCircle2',
  };
  return icons[type] || 'Activity';
}

function getActivityColor(type: string): string {
  const colors: Record<string, string> = {
    call: 'text-green-500',
    email: 'text-blue-500',
    meeting: 'text-purple-500',
    note: 'text-muted-foreground',
    form_submit: 'text-orange-500',
    email_open: 'text-blue-400',
    link_click: 'text-cyan-500',
    status_change: 'text-yellow-500',
    deal_closed_won: 'text-green-500',
    deal_closed_lost: 'text-red-500',
    webinar_register: 'text-indigo-500',
    task_completed: 'text-green-500',
  };
  return colors[type] || 'text-muted-foreground';
}

/**
 * Same actor derivation as LeadCommunicationsCard — who acted: the agent,
 * a human, the system, or the counterpart (inbound).
 */
const AGENT_SOURCE = /^(agent|automation|flowpilot)|^send_email_to_lead$/;
const HUMAN_SOURCE = /^(send-contact-email|lead-compose)$/;

function deriveCommActor(comm: Record<string, unknown>): string {
  if (comm.direction === 'inbound') return (comm.sender as string) || 'Inbound';
  const source = String(comm.source ?? '').toLowerCase();
  const meta = (comm.metadata ?? {}) as Record<string, unknown>;
  const tags = (meta.tags ?? {}) as Record<string, unknown>;
  const sentBy = (tags.sent_by ?? meta.sent_by) as string | undefined;
  if (AGENT_SOURCE.test(source)) return 'Agent';
  if (sentBy) return `Manual · ${sentBy}`;
  if (HUMAN_SOURCE.test(source)) return 'Manual';
  return 'System';
}
