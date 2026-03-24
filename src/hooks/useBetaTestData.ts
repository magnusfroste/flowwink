import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface BetaTestSession {
  id: string;
  peer_name: string;
  scenario: string;
  status: 'running' | 'completed' | 'failed';
  started_at: string;
  completed_at: string | null;
  duration_ms: number | null;
  summary: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
}

export interface BetaTestFinding {
  id: string;
  session_id: string;
  type: 'bug' | 'ux_issue' | 'suggestion' | 'positive' | 'performance' | 'missing_feature';
  severity: 'low' | 'medium' | 'high' | 'critical';
  title: string;
  description: string | null;
  context: Record<string, unknown>;
  resolved_at: string | null;
  created_at: string;
}

export interface BetaTestExchange {
  id: string;
  session_id: string | null;
  direction: 'openclaw_to_flowpilot' | 'flowpilot_to_openclaw';
  message_type: 'observation' | 'instruction' | 'feedback' | 'learning' | 'action_request' | 'action_result';
  content: string;
  payload: Record<string, unknown>;
  created_at: string;
}

export function useBetaTestSessions() {
  return useQuery({
    queryKey: ['beta-test-sessions'],
    queryFn: async () => {
      const { data, error } = await (supabase
        .from('beta_test_sessions') as any)
        .select('*')
        .order('created_at', { ascending: false })
        .limit(50);
      if (error) throw error;
      return (data || []) as BetaTestSession[];
    },
  });
}

export function useBetaTestFindings(sessionId?: string) {
  return useQuery({
    queryKey: ['beta-test-findings', sessionId],
    queryFn: async () => {
      let query = supabase
        .from('beta_test_findings')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(100);
      if (sessionId) {
        query = query.eq('session_id', sessionId);
      }
      const { data, error } = await query;
      if (error) throw error;
      return (data || []) as BetaTestFinding[];
    },
  });
}

export function useBetaTestExchanges(sessionId?: string) {
  return useQuery({
    queryKey: ['beta-test-exchanges', sessionId],
    queryFn: async () => {
      let query = supabase
        .from('beta_test_exchanges')
        .select('*')
        .order('created_at', { ascending: true })
        .limit(200);
      if (sessionId) {
        query = query.eq('session_id', sessionId);
      }
      const { data, error } = await query;
      if (error) throw error;
      return (data || []) as BetaTestExchange[];
    },
  });
}
