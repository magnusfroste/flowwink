import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import type { Product } from './useProducts';

export type DealStage = 'proposal' | 'negotiation' | 'closed_won' | 'closed_lost';

export interface Deal {
  id: string;
  lead_id: string;
  product_id: string | null;
  product?: Product;
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
        .select('*, product:products(*)')
        .order('created_at', { ascending: false });

      if (leadId) {
        query = query.eq('lead_id', leadId);
      }

      const { data, error } = await query;

      if (error) throw error;
      return data as Deal[];
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
        .select('*, product:products(*)')
        .eq('id', id)
        .single();

      if (error) throw error;
      return data as Deal;
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
          currency: deal.currency || 'SEK',
        })
        .select('*, product:products(*)')
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['deals'] });
      queryClient.invalidateQueries({ queryKey: ['deals', data.lead_id] });
      toast.success('Deal created');
    },
    onError: (error) => {
      console.error('Create deal error:', error);
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

      // If closed_won, update lead status to customer
      if (updates.stage === 'closed_won' && data) {
        await supabase
          .from('leads')
          .update({ 
            status: 'customer',
            converted_at: new Date().toISOString()
          })
          .eq('id', data.lead_id);

        // Add activity
        await supabase
          .from('lead_activities')
          .insert({
            lead_id: data.lead_id,
            type: 'deal_closed_won',
            points: 50,
            metadata: { deal_id: data.id, value_cents: data.value_cents }
          });
      }

      // If closed_lost, add activity
      if (updates.stage === 'closed_lost' && data) {
        await supabase
          .from('lead_activities')
          .insert({
            lead_id: data.lead_id,
            type: 'deal_closed_lost',
            points: 0,
            metadata: { deal_id: data.id, value_cents: data.value_cents }
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
      console.error('Update deal error:', error);
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
        .select('stage, value_cents');

      if (error) throw error;

      const stats = {
        proposal: { count: 0, value: 0 },
        negotiation: { count: 0, value: 0 },
        closed_won: { count: 0, value: 0 },
        closed_lost: { count: 0, value: 0 },
        totalPipeline: 0,
      };

      data.forEach((deal) => {
        const stage = deal.stage as DealStage;
        stats[stage].count++;
        stats[stage].value += deal.value_cents;
        
        if (stage === 'proposal' || stage === 'negotiation') {
          stats.totalPipeline += deal.value_cents;
        }
      });

      return stats;
    },
  });
}

export function getDealStageInfo(stage: DealStage): { label: string; color: string } {
  const stages: Record<DealStage, { label: string; color: string }> = {
    proposal: { label: 'Proposal', color: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300' },
    negotiation: { label: 'Negotiation', color: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300' },
    closed_won: { label: 'Won', color: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300' },
    closed_lost: { label: 'Lost', color: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300' },
  };
  return stages[stage];
}
