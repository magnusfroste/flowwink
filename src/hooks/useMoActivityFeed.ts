import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export type MoEventAction = 'mo.cancelled' | 'mo.completed';

export interface MoActivityEvent {
  id: string;
  action: MoEventAction;
  created_at: string;
  user_id: string | null;
  entity_id: string | null;
  metadata: {
    mo_number?: string;
    previous_status?: string;
    cancelled_at?: string;
    completed_at?: string;
    quantity?: number | string;
    notes_tail?: string;
    product_id?: string;
    [k: string]: unknown;
  };
}

const PAGE_SIZE = 60;
const TRACKED_ACTIONS: MoEventAction[] = ['mo.cancelled', 'mo.completed'];

/**
 * Live feed of mo.cancelled + mo.completed audit events.
 * Loads recent history, subscribes via realtime, and fires a toast on each new event.
 */
export function useMoActivityFeed() {
  const [events, setEvents] = useState<MoActivityEvent[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      const { data, error } = await supabase
        .from('audit_logs')
        .select('id, action, created_at, user_id, entity_id, metadata')
        .in('action', TRACKED_ACTIONS)
        .order('created_at', { ascending: false })
        .limit(PAGE_SIZE);

      if (cancelled) return;
      if (error) {
        setLoading(false);
        return;
      }
      setEvents((data as MoActivityEvent[]) ?? []);
      setLoading(false);
    })();

    const channel = supabase
      .channel('mo_activity_feed')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'audit_logs',
          // Realtime filter does not support 'in', so subscribe broadly and filter client-side.
        },
        (payload) => {
          const row = payload.new as MoActivityEvent;
          if (!TRACKED_ACTIONS.includes(row.action)) return;
          setEvents((prev) => [row, ...prev].slice(0, PAGE_SIZE));
          const moNumber = row.metadata?.mo_number ?? row.entity_id ?? 'order';
          if (row.action === 'mo.cancelled') {
            toast.warning(`MO ${moNumber} cancelled`, {
              description: row.metadata?.previous_status
                ? `was ${row.metadata.previous_status}`
                : undefined,
            });
          } else {
            toast.success(`MO ${moNumber} completed`, {
              description: row.metadata?.quantity
                ? `qty ${row.metadata.quantity}`
                : undefined,
            });
          }
        },
      )
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, []);

  return { events, loading };
}
