import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export type RecurringInterval = 'weekly' | 'monthly' | 'quarterly' | 'yearly';

export interface RecurringQuoteTemplate {
  id: string;
  name: string;
  source_quote_id: string | null;
  interval: RecurringInterval;
  next_run_at: string;
  active: boolean;
  last_generated_at: string | null;
  last_generated_quote_id: string | null;
  generated_count: number;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export function useRecurringQuoteTemplates() {
  return useQuery({
    queryKey: ['recurring-quote-templates'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('recurring_quote_templates' as any)
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as RecurringQuoteTemplate[];
    },
  });
}

export function useCreateRecurringQuoteTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      name: string;
      source_quote_id: string;
      interval: RecurringInterval;
      next_run_at: string;
      notes?: string;
    }) => {
      const { data: userData } = await supabase.auth.getUser();
      const { data, error } = await supabase
        .from('recurring_quote_templates' as any)
        .insert({ ...input, active: true, created_by: userData.user?.id ?? null })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['recurring-quote-templates'] });
      toast.success('Recurring template created');
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useUpdateRecurringQuoteTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: Partial<RecurringQuoteTemplate> }) => {
      const { error } = await supabase
        .from('recurring_quote_templates' as any)
        .update(patch as any)
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['recurring-quote-templates'] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useDeleteRecurringQuoteTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('recurring_quote_templates' as any).delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['recurring-quote-templates'] });
      toast.success('Template deleted');
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useRunRecurringQuotesNow() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc('run_recurring_quotes' as any);
      if (error) throw error;
      return data as any;
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['recurring-quote-templates'] });
      qc.invalidateQueries({ queryKey: ['quotes'] });
      toast.success(`Generated ${data?.generated ?? 0} quote(s)`);
    },
    onError: (e: Error) => toast.error(e.message),
  });
}
