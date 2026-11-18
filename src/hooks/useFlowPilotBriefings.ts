import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface BriefingMetrics {
  health_score: number;
  traffic_today: number;
  traffic_week: number;
  /** null when last week is too small a base for a percentage (morning-news.ts). */
  traffic_trend: number | null;
  leads_today: number;
  leads_week: number;
  revenue_week: number;
  revenue_trend: number;
  subscribers: number;
  bookings_week: number;
  content_published: number;
  content_drafts: number;
  flowpilot_actions: number;
  flowpilot_success_rate: number;
}

export interface BriefingSection {
  title: string;
  type: string;
  items: Array<{
    label: string;
    value: string | number;
    trend?: number | string | null;
    unit?: string;
    format?: string;
  }>;
}

export interface BriefingActionItem {
  priority: 'high' | 'medium' | 'low';
  text: string;
  link: string;
}

export interface Briefing {
  id: string;
  type: string;
  title: string;
  summary: string;
  sections: BriefingSection[];
  metrics: BriefingMetrics;
  action_items: BriefingActionItem[];
  read_at: string | null;
  created_at: string;
}

export function useLatestBriefing() {
  return useQuery({
    queryKey: ['flowpilot-briefing', 'latest'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('flowpilot_briefings' as any)
        .select('*')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data as unknown as Briefing | null;
    },
    staleTime: 5 * 60 * 1000,
  });
}

export function useUnreadBriefings() {
  return useQuery({
    queryKey: ['flowpilot-briefings', 'unread'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('flowpilot_briefings' as any)
        .select('id, title, summary, metrics, action_items, created_at')
        .is('read_at', null)
        .order('created_at', { ascending: false })
        .limit(5);
      if (error) throw error;
      return (data || []) as unknown as Briefing[];
    },
    staleTime: 60 * 1000,
  });
}

export function useMarkBriefingRead() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (briefingId: string) => {
      const { error } = await supabase
        .from('flowpilot_briefings' as any)
        .update({ read_at: new Date().toISOString() } as any)
        .eq('id', briefingId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['flowpilot-briefings'] });
      queryClient.invalidateQueries({ queryKey: ['flowpilot-briefing'] });
    },
  });
}

export function useBriefingHistory() {
  return useQuery({
    queryKey: ['flowpilot-briefings', 'history'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('flowpilot_briefings' as any)
        .select('*')
        .order('created_at', { ascending: false })
        .limit(14);
      if (error) throw error;
      return (data || []) as unknown as Briefing[];
    },
  });
}
