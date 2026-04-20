import { logger } from '@/lib/logger';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { updateLeadStatus, addLeadActivity } from '@/lib/lead-utils';
import { notifyDealWon } from '@/lib/slack-notify';
import type { Product } from './useProducts';

export type DealStage = 'lead' | 'qualified' | 'proposal' | 'negotiation' | 'closed_won' | 'closed_lost';

/** Win probability per stage — used for weighted forecast */
export const STAGE_PROBABILITY: Record<DealStage, number> = {
  lead: 0.10,
  qualified: 0.25,
  proposal: 0.50,
  negotiation: 0.75,
  closed_won: 1.0,
  closed_lost: 0,
};

export const ACTIVE_STAGES: DealStage[] = ['lead', 'qualified', 'proposal', 'negotiation'];

export interface Deal {
  id: string;
  lead_id: string;
  product_id: string | null;
  product?: Product;
  lead?: {
    id: string;
    name: string | null;
    email: string;
    company_id: string | null;
    company?: { id: string; name: string } | null;
  } | null;
  stage: DealStage;
  value_cents: number;
  currency: string;
  expected_close: string | null;
  notes: string | null;
  closed_at: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export function useDeals(leadId?: string) {
  return useQuery({
    queryKey: ['deals', leadId],
    queryFn: async () => {
      let query = supabase
        .from('deals')
        .select('*, product:products(*), lead:leads(id, name, email, company_id, company:companies(id, name))')
        .order('created_at', { ascending: false });

      if (leadId) {
        query = query.eq('lead_id', leadId);
      }

      const { data, error } = await query;

      if (error) throw error;
      return data as unknown as Deal[];
    },
  });
}

export function useDeal(id: string | undefined) {
  return useQuery({
    queryKey: ['deal', id],
    queryFn: async () => {
      if (!id) return null;

      const { data, error } = await supabase
        .from('deals')
        .select('*, product:products(*), lead:leads(id, name, email, company_id, company:companies(id, name))')
        .eq('id', id)
        .single();

      if (error) throw error;
      return data as unknown as Deal;
    },
    enabled: !!id,
  });
}

export function useCreateDeal() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (deal: {
      lead_id: string;
      product_id?: string | null;
      stage?: DealStage;
      value_cents: number;
      currency?: string;
      expected_close?: string | null;
      notes?: string | null;
    }) => {
      const { data, error } = await supabase
        .from('deals')
        .insert({
          ...deal,
          stage: deal.stage || 'proposal',
          currency: deal.currency || 'USD',
        })
        .select('*, product:products(*)')
        .single();

      if (error) throw error;

      // Auto-bump contact: lead → opportunity (Pipedrive/HubSpot pattern)
      // Only bumps if currently 'lead' so we don't downgrade customers
      try {
        await updateLeadStatus(data.lead_id, 'opportunity', { onlyIfCurrentStatus: 'lead' });
        await addLeadActivity({
          leadId: data.lead_id,
          type: 'deal_created',
          metadata: { deal_id: data.id, value_cents: data.value_cents, stage: data.stage },
        });
      } catch (bumpError) {
        logger.warn('Auto-bump on deal create failed:', bumpError);
      }

      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['deals'] });
      queryClient.invalidateQueries({ queryKey: ['deals', data.lead_id] });
      queryClient.invalidateQueries({ queryKey: ['leads'] });
      queryClient.invalidateQueries({ queryKey: ['lead', data.lead_id] });
      queryClient.invalidateQueries({ queryKey: ['lead-activities', data.lead_id] });
      toast.success('Deal created');
    },
    onError: (error) => {
      logger.error('Create deal error:', error);
      toast.error('Could not create deal');
    },
  });
}

export function useUpdateDeal() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, ...updates }: Partial<Deal> & { id: string }) => {
      // If closing the deal, set closed_at
      const updateData: Record<string, unknown> = { ...updates };
      if (updates.stage === 'closed_won' || updates.stage === 'closed_lost') {
        updateData.closed_at = new Date().toISOString();
      }

      const { data, error } = await supabase
        .from('deals')
        .update(updateData)
        .eq('id', id)
        .select('*, product:products(*)')
        .single();

      if (error) throw error;

      // If closed_won, update lead status to customer via contract
      if (updates.stage === 'closed_won' && data) {
        await updateLeadStatus(data.lead_id, 'customer', { convertedAt: true });
        await addLeadActivity({
          leadId: data.lead_id,
          type: 'deal_closed_won',
          metadata: { deal_id: data.id, value_cents: data.value_cents },
        });
        // Slack notification (fire-and-forget)
        notifyDealWon({
          dealName: data.product?.name || `Deal ${data.id.slice(0, 8)}`,
          contactName: data.lead_id,
          valueCents: data.value_cents || 0,
          leadId: data.lead_id,
        });
      }

      // If closed_lost, add activity via contract
      if (updates.stage === 'closed_lost' && data) {
        await addLeadActivity({
          leadId: data.lead_id,
          type: 'deal_closed_lost',
          metadata: { deal_id: data.id, value_cents: data.value_cents },
        });
      }

      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['deals'] });
      queryClient.invalidateQueries({ queryKey: ['deal', data.id] });
      queryClient.invalidateQueries({ queryKey: ['leads'] });
      queryClient.invalidateQueries({ queryKey: ['lead', data.lead_id] });
      queryClient.invalidateQueries({ queryKey: ['lead-activities', data.lead_id] });
      toast.success('Deal updated');
    },
    onError: (error) => {
      logger.error('Update deal error:', error);
      toast.error('Could not update deal');
    },
  });
}

export function useDealStats() {
  return useQuery({
    queryKey: ['deal-stats'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('deals')
        .select('stage, value_cents, closed_at');

      if (error) throw error;

      const stats = {
        lead: { count: 0, value: 0 },
        qualified: { count: 0, value: 0 },
        proposal: { count: 0, value: 0 },
        negotiation: { count: 0, value: 0 },
        closed_won: { count: 0, value: 0 },
        closed_lost: { count: 0, value: 0 },
        totalPipeline: 0,
        weightedForecast: 0,
        wonThisMonth: 0,
      };

      const startOfMonth = new Date();
      startOfMonth.setDate(1);
      startOfMonth.setHours(0, 0, 0, 0);

      data.forEach((deal) => {
        const stage = deal.stage as DealStage;
        if (!stats[stage]) return;
        stats[stage].count++;
        stats[stage].value += deal.value_cents;

        if (ACTIVE_STAGES.includes(stage)) {
          stats.totalPipeline += deal.value_cents;
          stats.weightedForecast += deal.value_cents * STAGE_PROBABILITY[stage];
        }

        if (stage === 'closed_won' && deal.closed_at && new Date(deal.closed_at) >= startOfMonth) {
          stats.wonThisMonth += deal.value_cents;
        }
      });

      return stats;
    },
  });
}

export function getDealStageInfo(stage: DealStage): { label: string; color: string } {
  const stages: Record<DealStage, { label: string; color: string }> = {
    lead: { label: 'Lead', color: 'bg-slate-100 text-slate-800 dark:bg-slate-900 dark:text-slate-300' },
    qualified: { label: 'Qualified', color: 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-300' },
    proposal: { label: 'Proposal', color: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300' },
    negotiation: { label: 'Negotiation', color: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300' },
    closed_won: { label: 'Won', color: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300' },
    closed_lost: { label: 'Lost', color: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300' },
  };
  return stages[stage];
}
