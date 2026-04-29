import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export interface MoCancellationEvent {
  id: string;
  created_at: string;
  user_id: string | null;
  entity_id: string | null;
  metadata: {
    mo_number?: string;
    previous_status?: string;
    cancelled_at?: string;
    quantity?: number | string;
    notes_tail?: string;
    [k: string]: unknown;
  };
}

const PAGE_SIZE = 30;

/**
 * Live feed of `audit_logs` rows where action='mo.cancelled'.
 * Loads recent history and subscribes to realtime inserts.
 * Shows a toast when a new cancellation arrives.
 */
export function useMoCancellationFeed() {
  const [events, setEvents] = useState<MoCancellationEvent[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      const { data, error } = await supabase
        .from('audit_logs')
        .select('id, created_at, user_id, entity_id, metadata')
        .eq('action', 'mo.cancelled')
        .order('created_at', { ascending: false })
        .limit(PAGE_SIZE);

      if (cancelled) return;
      if (error) {
        setLoading(false);
        return;
      }
      setEvents((data as MoCancellationEvent[]) ?? []);
      setLoading(false);
    })();

    const channel = supabase
      .channel('mo_cancellation_feed')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'audit_logs',
          filter: 'action=eq.mo.cancelled',
        },
        (payload) => {
          const row = payload.new as MoCancellationEvent;
          setEvents((prev) => [row, ...prev].slice(0, PAGE_SIZE));
          const moNumber = row.metadata?.mo_number ?? row.entity_id ?? 'order';
          toast.warning(`MO ${moNumber} cancelled`, {
            description: row.metadata?.previous_status
              ? `was ${row.metadata.previous_status}`
              : undefined,
          });
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
