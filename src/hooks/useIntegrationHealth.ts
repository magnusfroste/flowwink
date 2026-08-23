/**
 * Integration health — the STATE surface and its acknowledgeable notices.
 *
 * Reads `site_settings.integration_health`, the single self-replacing row the
 * daily sweep writes. It replaced a `role: 'assistant'` message in admin
 * FlowChat: nine of those piled up on optic, four word-for-word identical, none
 * of them resolvable, until the alarm read as wallpaper. A measurement is not a
 * conversational turn — see
 * supabase/functions/_shared/handlers/integration-health-state.ts.
 *
 *   the state  → Observability card (always current, replaces itself)
 *   a notice   → NotificationsBell (only on a transition, acknowledgeable once)
 *   a decision → chat (does not exist yet; see the KROKEN note in that file)
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { callSkill } from '@/lib/call-skill';

export const INTEGRATION_HEALTH_KEY = 'integration_health';

export type IntegrationHealthNoticeKind = 'degraded' | 'new_failure' | 'recovered';

export interface IntegrationHealthNotice {
  id: string;
  at: string;
  kind: IntegrationHealthNoticeKind;
  headline: string;
  integrations: string[];
  acknowledged_at: string | null;
}

export interface IntegrationProbeRow {
  name: string;
  status: 'ok' | 'fail' | 'skipped' | 'unused';
  detail: string;
  consumed?: boolean | 'unknown';
  latency_ms?: number;
}

export interface IntegrationHealthState {
  checked_at: string;
  source: string;
  healthy: boolean;
  summary: string;
  failing: string[];
  unused: string[];
  failing_since: Record<string, string>;
  integrations: IntegrationProbeRow[];
  notices: IntegrationHealthNotice[];
}

const QUERY_KEY = ['integration-health'] as const;

/**
 * `null` means "no sweep has ever run on this instance" — a real answer, and a
 * different one from "everything is fine". The card says so rather than
 * rendering an empty green.
 */
export function useIntegrationHealth() {
  return useQuery({
    queryKey: QUERY_KEY,
    queryFn: async (): Promise<IntegrationHealthState | null> => {
      const { data, error } = await supabase
        .from('site_settings')
        .select('value')
        .eq('key', INTEGRATION_HEALTH_KEY)
        .maybeSingle();
      if (error) throw error;
      const value = data?.value;
      if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
      return value as unknown as IntegrationHealthState;
    },
    staleTime: 60_000,
    refetchInterval: 120_000,
  });
}

/** The bell's signal: transitions nobody has acknowledged yet. */
export function useUnacknowledgedIntegrationNotices(enabled = true) {
  return useQuery({
    queryKey: [...QUERY_KEY, 'unacknowledged'],
    queryFn: async (): Promise<IntegrationHealthNotice[]> => {
      const { data, error } = await supabase
        .from('site_settings')
        .select('value')
        .eq('key', INTEGRATION_HEALTH_KEY)
        .maybeSingle();
      if (error) throw error;
      const value = data?.value as unknown as IntegrationHealthState | null;
      const notices = Array.isArray(value?.notices) ? value!.notices : [];
      return notices.filter((n) => !n.acknowledged_at);
    },
    enabled,
    staleTime: 60_000,
    refetchInterval: 120_000,
  });
}

/**
 * Acknowledge one notice, or every open one when called with no id.
 *
 * Goes through an RPC rather than a client-side read-modify-write: the daily
 * sweep writes the same jsonb row, and the whole point of a notice (as opposed
 * to a chat message) is that closing it actually closes it.
 */
export function useAcknowledgeIntegrationHealth() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (noticeId?: string) => {
      const { data, error } = await supabase.rpc(
        'acknowledge_integration_health' as never,
        (noticeId ? { p_notice_id: noticeId } : {}) as never,
      );
      if (error) throw error;
      return data as unknown as { acknowledged: number; remaining: number };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEY });
    },
  });
}

/**
 * Run the sweep on demand. Same skill, same return shape — the handler records
 * the state on every call, so pressing this both refreshes the tile and files a
 * notice if something actually changed since the last probe.
 */
export function useRunIntegrationCheck() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () =>
      // The admin UI's one rail into the skill layer — audited in
      // agent_activity, trust dial respected, same as every other caller.
      callSkill<{ healthy: boolean; summary: string; failing: string[] }>(
        'check_integrations',
        { source: 'manual' },
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEY });
    },
  });
}
