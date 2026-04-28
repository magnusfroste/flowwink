import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface AiUsageRow {
  id: string;
  created_at: string;
  source: string;
  provider: string | null;
  model: string | null;
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
  latency_ms: number | null;
  status: string;
  error: string | null;
  user_id: string | null;
  conversation_id: string | null;
  request_id: string | null;
  metadata: Record<string, any>;
}

export interface AiUsageFilters {
  from?: string; // ISO
  to?: string;
  sources?: string[];
  models?: string[];
  status?: string;
  limit?: number;
}

export function useAiUsageLogs(filters: AiUsageFilters = {}) {
  return useQuery({
    queryKey: ['ai_usage_logs', filters],
    queryFn: async (): Promise<AiUsageRow[]> => {
      let q = supabase
        .from('ai_usage_logs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(filters.limit ?? 200);

      if (filters.from) q = q.gte('created_at', filters.from);
      if (filters.to) q = q.lte('created_at', filters.to);
      if (filters.sources?.length) q = q.in('source', filters.sources);
      if (filters.models?.length) q = q.in('model', filters.models);
      if (filters.status) q = q.eq('status', filters.status);

      const { data, error } = await q;
      if (error) throw error;
      return (data as AiUsageRow[]) || [];
    },
  });
}

export interface AiUsageSummary {
  totalRequests: number;
  totalTokens: number;
  promptTokens: number;
  completionTokens: number;
  byModel: Array<{ model: string; tokens: number; requests: number }>;
  bySource: Array<{ source: string; tokens: number; requests: number }>;
  byDay: Array<{ day: string; tokens: number; requests: number }>;
  errorRate: number;
}

export function useAiUsageSummary(days = 30) {
  return useQuery({
    queryKey: ['ai_usage_summary', days],
    queryFn: async (): Promise<AiUsageSummary> => {
      const from = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
      const { data, error } = await supabase
        .from('ai_usage_logs')
        .select('created_at,source,model,prompt_tokens,completion_tokens,total_tokens,status')
        .gte('created_at', from)
        .order('created_at', { ascending: false })
        .limit(5000);
      if (error) throw error;

      const rows = (data || []) as Array<Pick<AiUsageRow, 'created_at' | 'source' | 'model' | 'prompt_tokens' | 'completion_tokens' | 'total_tokens' | 'status'>>;

      const byModelMap = new Map<string, { tokens: number; requests: number }>();
      const bySourceMap = new Map<string, { tokens: number; requests: number }>();
      const byDayMap = new Map<string, { tokens: number; requests: number }>();
      let errors = 0;
      let totalTokens = 0;
      let promptTokens = 0;
      let completionTokens = 0;

      for (const r of rows) {
        const m = r.model || 'unknown';
        const s = r.source || 'unknown';
        const day = r.created_at.slice(0, 10);
        const t = r.total_tokens || 0;
        totalTokens += t;
        promptTokens += r.prompt_tokens || 0;
        completionTokens += r.completion_tokens || 0;
        if (r.status !== 'success') errors++;

        const mEntry = byModelMap.get(m) || { tokens: 0, requests: 0 };
        mEntry.tokens += t; mEntry.requests++; byModelMap.set(m, mEntry);

        const sEntry = bySourceMap.get(s) || { tokens: 0, requests: 0 };
        sEntry.tokens += t; sEntry.requests++; bySourceMap.set(s, sEntry);

        const dEntry = byDayMap.get(day) || { tokens: 0, requests: 0 };
        dEntry.tokens += t; dEntry.requests++; byDayMap.set(day, dEntry);
      }

      return {
        totalRequests: rows.length,
        totalTokens,
        promptTokens,
        completionTokens,
        byModel: [...byModelMap.entries()]
          .map(([model, v]) => ({ model, ...v }))
          .sort((a, b) => b.tokens - a.tokens),
        bySource: [...bySourceMap.entries()]
          .map(([source, v]) => ({ source, ...v }))
          .sort((a, b) => b.tokens - a.tokens),
        byDay: [...byDayMap.entries()]
          .map(([day, v]) => ({ day, ...v }))
          .sort((a, b) => a.day.localeCompare(b.day)),
        errorRate: rows.length ? errors / rows.length : 0,
      };
    },
  });
}
