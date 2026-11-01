/**
 * What FlowPilot needs a person for — one place the cockpit, the approvals
 * page and the notification bell read from.
 *
 * - Staged operations (pending_operations, status pending): a write proposed
 *   and held. They were only listed on the Accounting page, so a staged write
 *   from anywhere else had no visible approval surface (2026-10-29 review).
 * - Notify runs (agent_activity, log_type 'notify', not acknowledged): a skill
 *   on trust level 'notify' — or 'approve' under posture 'proving' — ran on its
 *   own. 'notify' used to mean nothing at all.
 */
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

const POLL_MS = 120_000;

export function useStagedOperationCount() {
  const { isAdmin } = useAuth();
  return useQuery({
    queryKey: ['agent-attention', 'staged-count', isAdmin],
    enabled: isAdmin,
    refetchInterval: POLL_MS,
    queryFn: async () => {
      const { count, error } = await supabase
        .from('pending_operations')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'pending');
      if (error) return 0;
      return count ?? 0;
    },
  });
}

export interface NotifiedAction {
  id: string;
  skill_name: string | null;
  agent: string;
  created_at: string;
  output: Record<string, unknown> | null;
}

export function useNotifiedActions(limit = 20) {
  const { isAdmin } = useAuth();
  return useQuery({
    queryKey: ['agent-attention', 'notified', isAdmin, limit],
    enabled: isAdmin,
    refetchInterval: POLL_MS,
    queryFn: async () => {
      const { data, error, count } = await supabase
        .from('agent_activity')
        .select('id, skill_name, agent, created_at, output', { count: 'exact' })
        .eq('log_type', 'notify')
        .is('acknowledged_at' as never, null)
        .order('created_at', { ascending: false })
        .limit(limit);
      if (error) return { rows: [] as NotifiedAction[], total: 0 };
      return { rows: (data ?? []) as unknown as NotifiedAction[], total: count ?? 0 };
    },
  });
}

/** Acknowledge notify runs: the given ids, or every unacknowledged one. */
export function useAcknowledgeNotifiedActions() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (ids?: string[]) => {
      let q = supabase
        .from('agent_activity')
        .update({ acknowledged_at: new Date().toISOString() } as never)
        .eq('log_type', 'notify')
        .is('acknowledged_at' as never, null);
      if (ids && ids.length) q = q.in('id', ids);
      const { error } = await q;
      if (error) throw error;
    },
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['agent-attention'] }); },
  });
}
