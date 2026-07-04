import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface TimelineEvent {
  id: string;
  at: string;
  kind: 'page_view' | 'signal' | 'newsletter_open' | 'newsletter_click';
  title: string;
  detail?: string;
  score_delta?: number;
}

/**
 * Aggregated behavioral timeline for a single lead — used by the CRM
 * lead-drawer widget. Pulls page_views, visitor_signals and newsletter
 * engagement into one sorted stream.
 */
export function useVisitorTimeline(leadId: string | null | undefined, limit = 50) {
  return useQuery({
    queryKey: ['visitor-timeline', leadId, limit],
    enabled: Boolean(leadId),
    queryFn: async (): Promise<TimelineEvent[]> => {
      if (!leadId) return [];

      const [pv, sig] = await Promise.all([
        supabase
          .from('page_views')
          .select('id, page_slug, page_title, referrer, created_at')
          .eq('lead_id', leadId)
          .order('created_at', { ascending: false })
          .limit(limit),
        supabase
          .from('visitor_signals')
          .select('id, signal_name, reason, score_delta, fired_at, evidence')
          .eq('lead_id', leadId)
          .order('fired_at', { ascending: false })
          .limit(limit),
      ]);

      const events: TimelineEvent[] = [];
      for (const v of pv.data || []) {
        events.push({
          id: `pv-${v.id}`,
          at: v.created_at,
          kind: 'page_view',
          title: v.page_title || v.page_slug,
          detail: v.referrer ? `from ${v.referrer}` : undefined,
        });
      }
      for (const s of sig.data || []) {
        events.push({
          id: `sig-${s.id}`,
          at: s.fired_at,
          kind: 'signal',
          title: s.signal_name,
          detail: s.reason ?? undefined,
          score_delta: s.score_delta,
        });
      }

      events.sort((a, b) => (a.at < b.at ? 1 : -1));
      return events.slice(0, limit);
    },
    staleTime: 30_000,
  });
}
