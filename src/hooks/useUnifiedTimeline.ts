import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface TimelineEvent {
  id: string;
  type: 'activity' | 'booking' | 'form' | 'chat' | 'newsletter_open' | 'newsletter_click' | 'order' | 'task';
  title: string;
  description?: string;
  metadata?: Record<string, unknown>;
  created_at: string;
  icon: string;
  color: string;
  points?: number;
}

/**
 * Aggregates cross-module interactions for a contact by email + lead_id
 */
export function useUnifiedTimeline(leadId: string | undefined, email: string | undefined) {
  return useQuery({
    queryKey: ['unified-timeline', leadId, email],
    queryFn: async () => {
      const events: TimelineEvent[] = [];

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
            events.push({
              id: `activity-${a.id}`,
              type: 'activity',
              title: getActivityTitle(a.type, meta),
              description: meta?.note as string || meta?.description as string || undefined,
              metadata: meta || undefined,
              created_at: a.created_at,
              icon: getActivityIcon(a.type),
              color: getActivityColor(a.type),
              points: a.points || undefined,
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
  };
  return colors[type] || 'text-muted-foreground';
}
