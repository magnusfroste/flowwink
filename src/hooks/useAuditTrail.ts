import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface AuditFilters {
  table_name?: string;
  agent_type?: string;
  from?: string; // ISO date
  to?: string;
  limit?: number;
}

export interface AuditRow {
  id: string;
  occurred_at: string;
  agent_type: string | null;
  caller_user_id: string | null;
  caller_api_key_id: string | null;
  conversation_id: string | null;
  trace_id: string | null;
  skill_name: string | null;
  table_name: string;
  crud_action: string;
  entity_id: string | null;
  request_payload: Record<string, unknown>;
  request_payload_sha256: string;
  before_snapshot: Record<string, unknown> | null;
  after_snapshot: Record<string, unknown> | null;
  diff: Record<string, { before: unknown; after: unknown }> | null;
  success: boolean;
  error_message: string | null;
  retention_until: string | null;
  exported_at: string | null;
}

export function useAuditTrail(filters: AuditFilters = {}) {
  return useQuery({
    queryKey: ['agent-audit-trail', filters],
    queryFn: async (): Promise<AuditRow[]> => {
      let q = (supabase.from as any)('agent_audit_trail')
        .select('*')
        .order('occurred_at', { ascending: false })
        .limit(filters.limit ?? 200);
      if (filters.table_name) q = q.eq('table_name', filters.table_name);
      if (filters.agent_type) q = q.eq('agent_type', filters.agent_type);
      if (filters.from) q = q.gte('occurred_at', filters.from);
      if (filters.to) q = q.lte('occurred_at', filters.to);
      const { data, error } = await q;
      if (error) throw error;
      return (data || []) as AuditRow[];
    },
  });
}

/** Build a CSV string from the loaded audit rows for retention export. */
export function auditRowsToCsv(rows: AuditRow[]): string {
  const cols = [
    'occurred_at', 'agent_type', 'skill_name', 'table_name', 'crud_action',
    'entity_id', 'success', 'error_message', 'request_payload_sha256',
    'caller_user_id', 'caller_api_key_id', 'conversation_id', 'trace_id',
    'retention_until',
  ];
  const escape = (v: unknown) => {
    if (v === null || v === undefined) return '';
    const s = typeof v === 'string' ? v : JSON.stringify(v);
    return `"${s.replace(/"/g, '""')}"`;
  };
  const header = cols.join(',');
  const body = rows.map((r) => cols.map((c) => escape((r as any)[c])).join(',')).join('\n');
  return `${header}\n${body}\n`;
}
