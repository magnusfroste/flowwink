/**
 * PendingApprovalsBadge — count chip on the Approvals nav item.
 *
 * This IS the approver notification surface: the queue announces itself in
 * the navigation instead of posting into chat channels (the old
 * "Notify approvers in cowork chat" automation targeted cowork_messages,
 * which the Flowwork UI no longer renders). Realtime on INSERT/UPDATE with
 * a slow poll fallback; renders nothing when the queue is empty or the
 * table is unreachable.
 */
import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

const POLL_MS = 120_000;

export function usePendingApprovalCount() {
  return useQuery({
    queryKey: ['approvals', 'pending-count'],
    refetchInterval: POLL_MS,
    queryFn: async () => {
      const { count, error } = await supabase
        .from('approval_requests')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'pending');
      if (error) return 0;
      return count ?? 0;
    },
  });
}

export function PendingApprovalsBadge() {
  const { data: count = 0 } = usePendingApprovalCount();
  const qc = useQueryClient();

  useEffect(() => {
    const channel = supabase
      .channel('approval_requests_badge')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'approval_requests' },
        () => void qc.invalidateQueries({ queryKey: ['approvals', 'pending-count'] }),
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [qc]);

  if (!count) return null;
  return (
    <span className="ml-auto inline-flex items-center justify-center rounded-full bg-primary text-primary-foreground text-[10px] font-medium h-4 min-w-4 px-1">
      {count > 99 ? '99+' : count}
    </span>
  );
}
