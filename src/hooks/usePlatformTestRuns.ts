import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface PlatformTestRun {
  suite_id: string;
  suite_title: string | null;
  scope: string;
  category: string | null;
  module: string | null;
  status: 'pass' | 'fail' | 'error' | 'skip';
  total: number;
  passed: number;
  failed: number;
  skipped: number;
  duration_ms: number;
  error: string | null;
  triggered_by: string;
  started_at: string;
}

/**
 * Returns the latest run per suite_id, keyed by suite_id for O(1) lookup.
 * Updated whenever the Platform Tests page mounts or after a manual run.
 */
export function useLatestTestRuns() {
  return useQuery({
    queryKey: ['platform-test-runs-latest'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('platform_test_runs_latest' as never)
        .select('*');
      if (error) throw error;
      const map = new Map<string, PlatformTestRun>();
      for (const row of (data ?? []) as PlatformTestRun[]) {
        map.set(row.suite_id, row);
      }
      return map;
    },
    staleTime: 30_000,
  });
}

/**
 * Returns the last N runs for a single suite (for history modal).
 */
export function useSuiteRunHistory(suiteId: string | null, limit = 10) {
  return useQuery({
    queryKey: ['platform-test-runs-history', suiteId, limit],
    enabled: !!suiteId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('platform_test_runs' as never)
        .select('*')
        .eq('suite_id', suiteId!)
        .order('started_at', { ascending: false })
        .limit(limit);
      if (error) throw error;
      return (data ?? []) as PlatformTestRun[];
    },
  });
}

export function formatRelativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const min = Math.floor(diff / 60_000);
  if (min < 1) return 'just now';
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const days = Math.floor(hr / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}
