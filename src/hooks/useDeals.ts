import { logger } from '@/lib/logger';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { updateLeadStatus, addLeadActivity } from '@/lib/lead-utils';
import { notifyDealWon } from '@/lib/slack-notify';
import { useSalesPipelineSettings } from '@/hooks/useSiteSettings';
import { usePipelineStages } from '@/hooks/usePipelineStages';
import { dealHeadline, type DealProductFacts } from '@/lib/recurring-value';
import type { Product } from './useProducts';

// The full DB enum. 'prospecting' was missing here for months — the kanban
// (which reads pipeline_stages) showed the column while every hardcoded list
// couldn't select it and the stats silently dropped deals sitting in it.
export type DealStage = 'lead' | 'prospecting' | 'qualified' | 'proposal' | 'negotiation' | 'closed_won' | 'closed_lost';

/** FALLBACK win probability per stage. The pipeline_stages table (admin-
 *  configured, /admin/pipelines/stages) is the source of truth — these values
 *  mirror its seed and are used only until the config has loaded or for a
 *  stage the config doesn't know. */
export const STAGE_PROBABILITY: Record<DealStage, number> = {
  lead: 0.10,
  prospecting: 0.20,
  qualified: 0.40,
  proposal: 0.60,
  negotiation: 0.80,
  closed_won: 1.0,
  closed_lost: 0,
};

/** FALLBACK open-stage list — same caveat as STAGE_PROBABILITY: the truth is
 *  pipeline_stages rows where neither is_won nor is_lost. */
export const ACTIVE_STAGES: DealStage[] = ['lead', 'prospecting', 'qualified', 'proposal', 'negotiation'];

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
  /** Configurable stage from pipeline_stages (entity_type='deal'). Synced with `stage` via DB trigger. */
  stage_id?: string | null;
  value_cents: number;
  currency: string;
  expected_close: string | null;
  notes: string | null;
  closed_at: string | null;
  /** Why the deal was lost (price/timing/competitor/no_response/other). Set on closed_lost, cleared on re-open. */
  lost_reason: string | null;
  lost_note: string | null;
  /** Optional deal team assignment. */
  team_id?: string | null;
  /** Optional owner (user id). */
  owner_id?: string | null;
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

export function useActiveDealCount() {
  // "Active" is defined by the configured pipeline (neither won nor lost),
  // falling back to the hardcoded list until the config loads.
  const { data: stageConfig = [] } = usePipelineStages('deal');
  const activeKeys = stageConfig.length
    ? stageConfig.filter((s) => !s.is_won && !s.is_lost).map((s) => s.key)
    : ACTIVE_STAGES;
  return useQuery({
    queryKey: ['deals-active-count', activeKeys.join(',')],
    queryFn: async () => {
      const { count, error } = await supabase
        .from('deals')
        .select('*', { count: 'exact', head: true })
        .in('stage', activeKeys as DealStage[]);
      if (error) throw error;
      return count ?? 0;
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
          // No client-side currency fallback: the column default is the
          // instance's own currency. `|| 'USD'` here used to override it —
          // every deal on a Swedish instance was born in dollars.
          currency: deal.currency || undefined,
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
      // Won deals never carry a lost reason.
      if (updates.stage === 'closed_won') {
        updateData.lost_reason = null;
        updateData.lost_note = null;
      }
      // Re-open: moving back to an active stage clears closed_at and the
      // lost reason/note, so win-rate reporting stays honest (Odoo Restore).
      if (updates.stage && ACTIVE_STAGES.includes(updates.stage)) {
        updateData.closed_at = null;
        updateData.lost_reason = null;
        updateData.lost_note = null;
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
          currency: data.currency,
          leadId: data.lead_id,
        });
      }

      // If closed_lost, add activity via contract (reason included for the timeline)
      if (updates.stage === 'closed_lost' && data) {
        await addLeadActivity({
          leadId: data.lead_id,
          type: 'deal_closed_lost',
          metadata: {
            deal_id: data.id,
            value_cents: data.value_cents,
            ...(updates.lost_reason ? { lost_reason: updates.lost_reason } : {}),
            ...(updates.lost_note ? { note: updates.lost_note } : {}),
          },
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

/**
 * Hard delete — for test and training data only. A real lost deal is moved to
 * closed_lost so the funnel keeps its history; deleting rewrites win-rate.
 * RLS restricts this to admins ("Admins can manage deals"), and the agent
 * surface deliberately refuses the verb — this is a considered human action.
 */
export function useDeleteDeal() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (deal: { id: string; lead_id: string }) => {
      // RLS-denied deletes return success with 0 rows — count them, or the
      // toast below promises a deletion the database refused to perform.
      const { data, error } = await supabase.from('deals').delete().eq('id', deal.id).select('id');
      if (error) throw error;
      if (!data?.length) throw new Error('Nothing was deleted — you may not have permission, or it is already gone.');
      return deal;
    },
    onSuccess: (deal) => {
      queryClient.invalidateQueries({ queryKey: ['deals'] });
      queryClient.invalidateQueries({ queryKey: ['deal-stats'] });
      queryClient.invalidateQueries({ queryKey: ['leads'] });
      queryClient.invalidateQueries({ queryKey: ['lead', deal.lead_id] });
      toast.success('Deal deleted');
    },
    onError: (error) => {
      logger.error('Delete deal error:', error);
      toast.error('Could not delete deal — only admins can delete deals');
    },
  });
}

export interface DealStageStats { count: number; value: number }

export interface DealStats {
  totalPipeline: number;
  weightedForecast: number;
  wonThisMonth: number;
  // Every enum stage is always present so consumers can read
  // stats.negotiation.value without guards, whatever the admin configures.
  lead: DealStageStats;
  prospecting: DealStageStats;
  qualified: DealStageStats;
  proposal: DealStageStats;
  negotiation: DealStageStats;
  closed_won: DealStageStats;
  closed_lost: DealStageStats;
  // …and any extra admin-configured stage lands here instead of vanishing.
  [stageKey: string]: DealStageStats | number;
}

const ENUM_STAGES: DealStage[] = ['lead', 'prospecting', 'qualified', 'proposal', 'negotiation', 'closed_won', 'closed_lost'];

export function useDealStats() {
  // The pipeline totals must sum ONE dimension. A recurring deal's value_cents
  // is a per-period price; summing it raw against one-time totals mixes
  // dimensions. Every deal is normalised through dealHeadline to the configured
  // basis (ARR by default) before it enters a sum.
  const { data: pipelineSettings } = useSalesPipelineSettings();
  const basis = pipelineSettings?.deal_value_basis ?? 'arr';
  // pipeline_stages is the ONE truth for which stages exist, which are open,
  // and each stage's win probability. The hardcoded lists are fallbacks for
  // the moment before this loads (or an instance with no config rows).
  const { data: stageConfig = [] } = usePipelineStages('deal');
  const configSignature = stageConfig.map((s) => `${s.key}:${s.probability ?? ''}:${s.is_won}:${s.is_lost}`).join('|');

  return useQuery({
    queryKey: ['deal-stats', basis, configSignature],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('deals')
        .select('stage, value_cents, closed_at, product:products(type, billing_interval, default_term_months)');

      if (error) throw error;

      const openStages = new Set<string>(
        stageConfig.length
          ? stageConfig.filter((s) => !s.is_won && !s.is_lost).map((s) => s.key)
          : ACTIVE_STAGES,
      );
      const wonStages = new Set<string>(
        stageConfig.length ? stageConfig.filter((s) => s.is_won).map((s) => s.key) : ['closed_won'],
      );
      const probabilityOf = (stage: string): number => {
        const cfg = stageConfig.find((s) => s.key === stage);
        if (cfg?.probability != null) return cfg.probability / 100;
        return STAGE_PROBABILITY[stage as DealStage] ?? 0;
      };

      const stats = {
        totalPipeline: 0,
        weightedForecast: 0,
        wonThisMonth: 0,
      } as DealStats;
      // Seed every enum stage AND every configured stage — a bucket always
      // exists before counting, so nothing can be silently dropped.
      for (const key of [...ENUM_STAGES, ...stageConfig.map((s) => s.key)]) {
        if (!(key in stats)) stats[key] = { count: 0, value: 0 };
      }

      const startOfMonth = new Date();
      startOfMonth.setDate(1);
      startOfMonth.setHours(0, 0, 0, 0);

      data.forEach((deal) => {
        const stage = deal.stage as string;
        // A stage unknown to both the enum list and the config still gets
        // counted — a deal must never vanish from the totals. (The old code
        // returned early here; a deal in 'prospecting' was silently dropped.)
        if (!(stage in stats)) stats[stage] = { count: 0, value: 0 };
        const bucket = stats[stage] as DealStageStats;
        // One-time deals pass through unchanged (headline = value_cents).
        const value = dealHeadline(
          deal.product as DealProductFacts | null, deal.value_cents, basis,
        ).cents;
        bucket.count++;
        bucket.value += value;

        if (openStages.has(stage)) {
          stats.totalPipeline += value;
          stats.weightedForecast += value * probabilityOf(stage);
        }

        if (wonStages.has(stage) && deal.closed_at && new Date(deal.closed_at) >= startOfMonth) {
          stats.wonThisMonth += value;
        }
      });

      return stats;
    },
  });
}

export function getDealStageInfo(stage: DealStage): { label: string; color: string } {
  const stages: Record<DealStage, { label: string; color: string }> = {
    lead: { label: 'Lead', color: 'bg-slate-100 text-slate-800 dark:bg-slate-900 dark:text-slate-300' },
    prospecting: { label: 'Prospecting', color: 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900 dark:text-indigo-300' },
    qualified: { label: 'Qualified', color: 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-300' },
    proposal: { label: 'Proposal', color: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300' },
    negotiation: { label: 'Negotiation', color: 'bg-warning/10 text-warning' },
    closed_won: { label: 'Won', color: 'bg-success/10 text-success' },
    closed_lost: { label: 'Lost', color: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300' },
  };
  return stages[stage];
}
