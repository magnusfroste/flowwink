import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { logger } from '@/lib/logger';
import type { PerformanceMode, PerformanceModeStatus } from '@/lib/performance-mode';

const KEY = ['performance-mode'];

export function usePerformanceModeStatus() {
  return useQuery({
    queryKey: KEY,
    queryFn: async (): Promise<PerformanceModeStatus> => {
      const { data, error } = await supabase.rpc('performance_mode_status' as never);
      if (error) throw error;
      return data as unknown as PerformanceModeStatus;
    },
    staleTime: 30_000,
    refetchInterval: 120_000,
  });
}

export function useApplyPerformanceMode() {
  const qc = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: async ({ mode, reason }: { mode: PerformanceMode; reason?: string }) => {
      // The RPC is newer than the generated types; the shape is the DB's.
      const { data, error } = await supabase.rpc(
        'apply_performance_mode' as never,
        { p_mode: mode, p_reason: reason ?? 'set in Observability' } as never,
      );
      if (error) throw error;
      return data as { mode: PerformanceMode; changed: Array<{ job: string; from: string | null; to: string }>; not_scheduled_yet?: string[] };
    },
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: KEY });
      qc.invalidateQueries({ queryKey: ['cron-health'] });
      const n = res.changed?.length ?? 0;
      toast({
        title: `Performance mode: ${res.mode}`,
        description: n === 0 ? 'Schedules already matched; nothing changed.' : `${n} schedule${n === 1 ? '' : 's'} retuned.`,
      });
    },
    onError: (e: Error) => {
      logger.error('apply_performance_mode failed', e);
      toast({ title: 'Could not change performance mode', description: e.message, variant: 'destructive' });
    },
  });
}
