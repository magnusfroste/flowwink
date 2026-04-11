import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

export interface Contract {
  id: string;
  title: string;
  contract_type: 'service' | 'nda' | 'employment' | 'lease' | 'other';
  status: 'draft' | 'pending_signature' | 'active' | 'expired' | 'terminated';
  counterparty_name: string;
  counterparty_email: string | null;
  start_date: string | null;
  end_date: string | null;
  renewal_type: 'none' | 'auto' | 'manual';
  renewal_notice_days: number | null;
  value_cents: number;
  currency: string;
  file_url: string | null;
  notes: string | null;
  signed_at: string | null;
  terminated_at: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface ContractDocument {
  id: string;
  contract_id: string;
  file_name: string;
  file_url: string;
  file_type: string;
  version: number;
  uploaded_by: string | null;
  created_at: string;
}

export function useContracts(statusFilter?: string) {
  return useQuery({
    queryKey: ['contracts', statusFilter],
    queryFn: async () => {
      let query = supabase
        .from('contracts')
        .select('*')
        .order('updated_at', { ascending: false });
      if (statusFilter && statusFilter !== 'all') {
        query = query.eq('status', statusFilter);
      }
      const { data, error } = await query;
      if (error) throw error;
      return data as unknown as Contract[];
    },
  });
}

export function useCreateContract() {
  const qc = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (input: Partial<Contract>) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const { data, error } = await supabase
        .from('contracts')
        .insert([{
          title: input.title || 'New Contract',
          contract_type: input.contract_type || 'service',
          status: input.status || 'draft',
          counterparty_name: input.counterparty_name || '',
          counterparty_email: input.counterparty_email || null,
          start_date: input.start_date || null,
          end_date: input.end_date || null,
          renewal_type: input.renewal_type || 'none',
          renewal_notice_days: input.renewal_notice_days ?? 30,
          value_cents: input.value_cents || 0,
          currency: input.currency || 'SEK',
          notes: input.notes || null,
          created_by: user.id,
        }])
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['contracts'] });
      toast({ title: 'Contract created' });
    },
    onError: (err: Error) => {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    },
  });
}

export function useUpdateContract() {
  const qc = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({ id, ...updates }: Partial<Contract> & { id: string }) => {
      const { data, error } = await supabase
        .from('contracts')
        .update(updates)
        .eq('id', id)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['contracts'] });
      toast({ title: 'Contract updated' });
    },
    onError: (err: Error) => {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    },
  });
}

export function useDeleteContract() {
  const qc = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('contracts').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['contracts'] });
      toast({ title: 'Contract deleted' });
    },
    onError: (err: Error) => {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    },
  });
}

// Contracts expiring within N days
export function useExpiringContracts(days = 30) {
  return useQuery({
    queryKey: ['contracts-expiring', days],
    queryFn: async () => {
      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + days);
      const { data, error } = await supabase
        .from('contracts')
        .select('*')
        .eq('status', 'active')
        .not('end_date', 'is', null)
        .lte('end_date', futureDate.toISOString().slice(0, 10))
        .order('end_date');
      if (error) throw error;
      return data as unknown as Contract[];
    },
  });
}
