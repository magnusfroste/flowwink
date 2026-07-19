import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { logger } from '@/lib/logger';

export interface SurveyTemplate {
  id: string;
  name: string;
  kind: 'nps' | 'csat' | 'ces' | 'custom';
  description: string | null;
  questions: Array<{ id: string; type: string; label: string; required?: boolean }>;
  is_active: boolean;
  created_at: string;
}

export interface SurveyCampaign {
  id: string;
  name: string;
  template_id: string;
  trigger: string;
  delay_hours: number;
  is_active: boolean;
  email_subject: string;
  email_intro: string;
  created_at: string;
  survey_templates?: SurveyTemplate;
}

export interface SurveyResponse {
  id: string;
  campaign_id: string;
  send_id: string;
  template_id: string;
  score: number | null;
  category: 'detractor' | 'passive' | 'promoter' | null;
  comment: string | null;
  recipient_email: string;
  lead_id: string | null;
  created_at: string;
}

export interface NpsStats {
  campaign_id: string;
  campaign_name: string;
  total_responses: number;
  promoters: number;
  passives: number;
  detractors: number;
  nps_score: number | null;
  avg_score: number | null;
}

export function useSurveyTemplates() {
  return useQuery({
    queryKey: ['survey-templates'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('survey_templates' as never)
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as SurveyTemplate[];
    },
  });
}

export function useSurveyCampaigns() {
  return useQuery({
    queryKey: ['survey-campaigns'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('survey_campaigns' as never)
        .select('*, survey_templates(*)')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as SurveyCampaign[];
    },
  });
}

export function useSurveyResponses(campaignId?: string) {
  return useQuery({
    queryKey: ['survey-responses', campaignId ?? null],
    queryFn: async () => {
      let q = supabase.from('survey_responses' as never).select('*').order('created_at', { ascending: false }).limit(200);
      if (campaignId) q = q.eq('campaign_id', campaignId);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as unknown as SurveyResponse[];
    },
  });
}

export interface SurveyQuestionAnalytics {
  id: string;
  label: string;
  type: string;
  response_count: number;
  distribution: Record<string, number>;
}

export interface SurveyCampaignAnalytics {
  campaign_id: string;
  campaign_name: string;
  kind: string | null;
  total_responses: number;
  promoters: number;
  passives: number;
  detractors: number;
  nps_score: number | null;
  avg_score: number | null;
  avg_points: number | null;
  passed_count: number;
  failed_count: number;
  per_question: SurveyQuestionAnalytics[];
}

export function useSurveyAnalytics(campaignId?: string) {
  return useQuery({
    queryKey: ['survey-analytics', campaignId ?? null],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_survey_analytics' as never, {
        p_campaign_id: campaignId ?? null,
      } as never);
      if (error) throw error;
      const r = data as unknown as { success: boolean; campaigns?: SurveyCampaignAnalytics[]; error?: string };
      if (!r?.success) throw new Error(r?.error || 'analytics_failed');
      return r.campaigns ?? [];
    },
  });
}

export async function exportSurveyResponsesCsv(input: { campaign_id?: string; category?: string; since?: string }) {
  const { data, error } = await supabase.rpc('export_survey_responses' as never, {
    p_campaign_id: input.campaign_id ?? null,
    p_category: input.category ?? null,
    p_since: input.since ?? null,
  } as never);
  if (error) throw error;
  const r = data as unknown as { success: boolean; csv?: string; row_count?: number; error?: string };
  if (!r?.success) throw new Error(r?.error || 'export_failed');
  return r;
}

export function useNpsStats() {
  return useQuery({
    queryKey: ['survey-nps-stats'],
    queryFn: async () => {
      const { data, error } = await supabase.from('survey_nps_stats' as never).select('*');
      if (error) throw error;
      return (data ?? []) as unknown as NpsStats[];
    },
  });
}

export function useCreateCampaign() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: Partial<SurveyCampaign> & { name: string; template_id: string }) => {
      const { data, error } = await supabase.from('survey_campaigns' as never).insert(input as never).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['survey-campaigns'] });
      toast.success('Campaign created');
    },
    onError: (e: Error) => {
      logger.error('Create campaign error:', e);
      toast.error(e.message);
    },
  });
}

export function useSaveTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: Partial<SurveyTemplate> & { name: string; kind: SurveyTemplate['kind']; questions: SurveyTemplate['questions'] }) => {
      const { id, ...rest } = input as SurveyTemplate;
      if (id) {
        const { data, error } = await supabase.from('survey_templates' as never).update(rest as never).eq('id', id).select().single();
        if (error) throw error;
        return data;
      }
      const { data, error } = await supabase.from('survey_templates' as never).insert(rest as never).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['survey-templates'] });
      toast.success('Template saved');
    },
    onError: (e: Error) => {
      logger.error('Save template error:', e);
      toast.error(e.message);
    },
  });
}

export function useDeleteTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('survey_templates' as never).delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['survey-templates'] });
      toast.success('Template deleted');
    },
    onError: (e: Error) => {
      logger.error('Delete template error:', e);
      toast.error(e.message);
    },
  });
}

export function useSendSurvey() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      campaign_id: string;
      recipients: Array<{ email: string; name?: string; lead_id?: string; related_entity_type?: string; related_entity_id?: string }>;
    }) => {
      const { data, error } = await supabase.functions.invoke('comms-send', { body: { kind: 'survey_send', ...input } });
      if (error) throw error;
      return data;
    },
    onSuccess: (data: any) => {
      qc.invalidateQueries({ queryKey: ['survey-campaigns'] });
      qc.invalidateQueries({ queryKey: ['survey-responses'] });
      const sent = data?.sends?.length ?? 0;
      const failed = data?.errors?.length ?? 0;
      if (sent > 0) toast.success(`Sent ${sent} survey${sent === 1 ? '' : 's'}${failed > 0 ? ` (${failed} failed)` : ''}`);
      if (sent === 0 && failed > 0) toast.error(`Failed to send (${failed})`);
    },
    onError: (e: Error) => {
      logger.error('Send survey error:', e);
      toast.error(e.message);
    },
  });
}
