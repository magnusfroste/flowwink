import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export interface Company {
  id: string;
  name: string;
  domain: string | null;
  industry: string | null;
  size: string | null;
  address: string | null;
  phone: string | null;
  website: string | null;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export function useCompanies() {
  return useQuery({
    queryKey: ['companies'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('companies')
        .select('*')
        .order('name', { ascending: true });

      if (error) throw error;
      return data as Company[];
    },
  });
}

export function useCompany(id: string | undefined) {
  return useQuery({
    queryKey: ['companies', id],
    queryFn: async () => {
      if (!id) return null;
      const { data, error } = await supabase
        .from('companies')
        .select('*')
        .eq('id', id)
        .single();

      if (error) throw error;
      return data as Company;
    },
    enabled: !!id,
  });
}

export function useCompanyLeads(companyId: string | undefined) {
  return useQuery({
    queryKey: ['companies', companyId, 'leads'],
    queryFn: async () => {
      if (!companyId) return [];
      const { data, error } = await supabase
        .from('leads')
        .select('*')
        .eq('company_id', companyId)
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data;
    },
    enabled: !!companyId,
  });
}

export function useCreateCompany() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (company: Omit<Company, 'id' | 'created_at' | 'updated_at'>) => {
      const { data, error } = await supabase
        .from('companies')
        .insert(company)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['companies'] });
      toast.success('Företag skapat');
    },
    onError: (error) => {
      toast.error('Kunde inte skapa företag: ' + error.message);
    },
  });
}

export function useUpdateCompany() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, ...updates }: Partial<Company> & { id: string }) => {
      const { data, error } = await supabase
        .from('companies')
        .update(updates)
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['companies'] });
      queryClient.invalidateQueries({ queryKey: ['companies', data.id] });
      toast.success('Företag uppdaterat');
    },
    onError: (error) => {
      toast.error('Kunde inte uppdatera företag: ' + error.message);
    },
  });
}

export function useDeleteCompany() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('companies')
        .delete()
        .eq('id', id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['companies'] });
      toast.success('Företag borttaget');
    },
    onError: (error) => {
      toast.error('Kunde inte ta bort företag: ' + error.message);
    },
  });
}

export function useCompanyStats() {
  return useQuery({
    queryKey: ['companies', 'stats'],
    queryFn: async () => {
      const { data: companies, error: companiesError } = await supabase
        .from('companies')
        .select('id');

      if (companiesError) throw companiesError;

      const { data: leads, error: leadsError } = await supabase
        .from('leads')
        .select('company_id')
        .not('company_id', 'is', null);

      if (leadsError) throw leadsError;

      const companiesWithLeads = new Set(leads?.map(l => l.company_id) || []);

      return {
        total: companies?.length || 0,
        withContacts: companiesWithLeads.size,
        withoutContacts: (companies?.length || 0) - companiesWithLeads.size,
      };
    },
  });
}
