import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

// ---------- Teams ----------
export interface DealTeam {
  id: string;
  name: string;
  description: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export function useDealTeams() {
  return useQuery({
    queryKey: ['deal_teams'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('deal_teams')
        .select('*')
        .order('name');
      if (error) throw error;
      return (data || []) as unknown as DealTeam[];
    },
  });
}

export function useUpsertDealTeam() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: Partial<DealTeam> & { name: string }) => {
      const { data, error } = await supabase.from('deal_teams').upsert(input as any).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['deal_teams'] });
      toast.success('Team saved');
    },
    onError: (e: Error) => toast.error(`Save failed: ${e.message}`),
  });
}

export function useDeleteDealTeam() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('deal_teams').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['deal_teams'] }),
    onError: (e: Error) => toast.error(`Delete failed: ${e.message}`),
  });
}

// ---------- History ----------
export interface DealHistoryEntry {
  id: string;
  deal_id: string;
  field: string;
  old_value: string | null;
  new_value: string | null;
  changed_by: string | null;
  changed_at: string;
}

export function useDealHistory(dealId: string | undefined) {
  return useQuery({
    queryKey: ['deal_history', dealId],
    enabled: !!dealId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('deal_history')
        .select('*')
        .eq('deal_id', dealId!)
        .order('changed_at', { ascending: false })
        .limit(100);
      if (error) throw error;
      return (data || []) as unknown as DealHistoryEntry[];
    },
  });
}

// ---------- Templates ----------
export interface DealTemplate {
  id: string;
  name: string;
  description: string | null;
  default_product_id: string | null;
  default_stage_id: string | null;
  default_stage: string | null;
  default_value_cents: number;
  default_currency: string;
  default_notes: string | null;
  default_team_id: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export function useDealTemplates() {
  return useQuery({
    queryKey: ['deal_templates'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('deal_templates')
        .select('*')
        .order('name');
      if (error) throw error;
      return (data || []) as unknown as DealTemplate[];
    },
  });
}

export function useUpsertDealTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: Partial<DealTemplate> & { name: string }) => {
      const { data, error } = await supabase.from('deal_templates').upsert(input as any).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['deal_templates'] });
      toast.success('Template saved');
    },
    onError: (e: Error) => toast.error(`Save failed: ${e.message}`),
  });
}

export function useDeleteDealTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('deal_templates').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['deal_templates'] }),
    onError: (e: Error) => toast.error(`Delete failed: ${e.message}`),
  });
}

export function useCreateDealFromTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      template_id: string;
      lead_id: string;
      value_cents?: number;
      currency?: string;
      expected_close?: string;
    }) => {
      const { data, error } = await supabase.rpc('create_deal_from_template', {
        p_template_id: input.template_id,
        p_lead_id: input.lead_id,
        p_override_value_cents: input.value_cents ?? null,
        p_override_currency: input.currency ?? null,
        p_expected_close: input.expected_close ?? null,
      } as any);
      if (error) throw error;
      return data as unknown as string;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['deals'] });
      toast.success('Deal created from template');
    },
    onError: (e: Error) => toast.error(`Create failed: ${e.message}`),
  });
}

// ---------- FX conversion ----------
export interface ExchangeRate {
  base_currency: string;
  quote_currency: string;
  rate: number;
  rate_date: string;
}

/** Fetches the full recent FX table and computes conversions client-side. */
export function useLatestExchangeRates() {
  return useQuery({
    queryKey: ['latest_exchange_rates'],
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('exchange_rates')
        .select('base_currency, quote_currency, rate, rate_date')
        .order('rate_date', { ascending: false })
        .limit(500);
      if (error) throw error;
      return (data || []) as unknown as ExchangeRate[];
    },
  });
}

export function useBaseCurrency() {
  return useQuery({
    queryKey: ['base_currency'],
    staleTime: 60 * 60_000,
    queryFn: async () => {
      const { data } = await supabase
        .from('currencies')
        .select('code')
        .eq('is_base', true)
        .maybeSingle();
      return (data?.code as string | undefined) || 'SEK';
    },
  });
}

/**
 * Convert an amount using in-memory FX rows (latest per pair). Returns null
 * when no direct/inverse rate is available.
 */
export function convertAmount(
  amountCents: number,
  from: string,
  to: string,
  rates: ExchangeRate[],
): number | null {
  if (!from || !to || from.toUpperCase() === to.toUpperCase()) return amountCents;
  const upFrom = from.toUpperCase();
  const upTo = to.toUpperCase();
  // Sorted DESC by rate_date already; take first match
  const direct = rates.find(
    (r) => r.base_currency.toUpperCase() === upFrom && r.quote_currency.toUpperCase() === upTo,
  );
  if (direct) return Math.round(amountCents * Number(direct.rate));
  const inverse = rates.find(
    (r) => r.base_currency.toUpperCase() === upTo && r.quote_currency.toUpperCase() === upFrom,
  );
  if (inverse && Number(inverse.rate) !== 0) return Math.round(amountCents / Number(inverse.rate));
  return null;
}
