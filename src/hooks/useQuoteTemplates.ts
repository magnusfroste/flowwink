import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useAuth } from '@/hooks/useAuth';

export interface QuoteTemplateItem {
  description: string;
  qty: number;
  unit_price_cents: number;
  unit?: string;
}

export interface QuoteTemplate {
  id: string;
  name: string;
  description: string | null;
  currency: string;
  default_valid_days: number | null;
  terms_text: string | null;
  intro_text: string | null;
  items: QuoteTemplateItem[];
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export function useQuoteTemplates() {
  return useQuery({
    queryKey: ['quote-templates'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('quote_templates')
        .select('*')
        .order('name', { ascending: true });
      if (error) throw error;
      return (data || []) as unknown as QuoteTemplate[];
    },
  });
}

export function useUpsertQuoteTemplate() {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (input: Partial<QuoteTemplate> & { id?: string }) => {
      const { id, ...rest } = input;
      if (id) {
        const { data, error } = await supabase
          .from('quote_templates')
          .update(rest as never)
          .eq('id', id)
          .select('*')
          .single();
        if (error) throw error;
        return data;
      }
      const { data, error } = await supabase
        .from('quote_templates')
        .insert({ ...rest, created_by: user?.id ?? null } as never)
        .select('*')
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['quote-templates'] });
      toast.success('Template saved');
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useDeleteQuoteTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('quote_templates').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['quote-templates'] });
      toast.success('Template deleted');
    },
    onError: (e: Error) => toast.error(e.message),
  });
}
