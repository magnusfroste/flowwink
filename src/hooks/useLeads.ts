import { logger } from '@/lib/logger';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import type { Lead, LeadStatus, LeadActivity } from '@/lib/lead-utils';

// Extended Lead type with company relation
export interface LeadWithCompany extends Lead {
  companies: {
    id: string;
    name: string;
    domain: string | null;
  } | null;
}

export function useLeads(options?: { status?: LeadStatus; needsReview?: boolean }) {
  return useQuery({
    queryKey: ['leads', options],
    queryFn: async () => {
      let query = supabase
        .from('leads')
        .select(`
          *,
          companies (
            id,
            name,
            domain
          )
        `)
        .order('score', { ascending: false });

      if (options?.status) {
        query = query.eq('status', options.status);
      }

      if (options?.needsReview !== undefined) {
        query = query.eq('needs_review', options.needsReview);
      }

      const { data, error } = await query;

      if (error) throw error;
      return data as LeadWithCompany[];
    },
  });
}

export function useLead(id: string | undefined) {
  return useQuery({
    queryKey: ['lead', id],
    queryFn: async () => {
      if (!id) return null;

      const { data, error } = await supabase
        .from('leads')
        .select(`
          *,
          companies (
            id,
            name,
            domain
          )
        `)
        .eq('id', id)
        .single();

      if (error) throw error;
      return data as LeadWithCompany;
    },
    enabled: !!id,
  });
}

export function useLeadActivities(leadId: string | undefined) {
  return useQuery({
    queryKey: ['lead-activities', leadId],
    queryFn: async () => {
      if (!leadId) return [];

      const { data, error } = await supabase
        .from('lead_activities')
        .select('*')
        .eq('lead_id', leadId)
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data as LeadActivity[];
    },
    enabled: !!leadId,
  });
}

export function useUpdateLead() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, ...updates }: Partial<Lead> & { id: string }) => {
      const { data, error } = await supabase
        .from('leads')
        .update(updates)
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['leads'] });
      queryClient.invalidateQueries({ queryKey: ['lead', data.id] });
      toast.success('Contact updated');
    },
    onError: (error) => {
      logger.error('Update lead error:', error);
      toast.error('Could not update contact');
    },
  });
}

export function useAddLeadNote() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ leadId, note }: { leadId: string; note: string }) => {
      const { error } = await supabase
        .from('lead_activities')
        .insert({
          lead_id: leadId,
          type: 'note',
          metadata: { note },
          points: 0,
        });

      if (error) throw error;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['lead-activities', variables.leadId] });
      toast.success('Note saved');
    },
    onError: (error) => {
      logger.error('Add note error:', error);
      toast.error('Could not save note');
    },
  });
}

export function useQualifyLead() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (leadId: string) => {
      const { data, error } = await supabase.functions.invoke('qualify-lead', {
        body: { leadId },
      });

      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['leads'] });
      queryClient.invalidateQueries({ queryKey: ['lead', data?.lead_id] });
      toast.success('Contact qualified with AI');
    },
    onError: (error) => {
      logger.error('Qualify lead error:', error);
      toast.error('Could not qualify contact');
    },
  });
}

export function useLeadStats() {
  return useQuery({
    queryKey: ['lead-stats'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('leads')
        .select('status, needs_review');

      if (error) throw error;

      const stats = {
        total: data.length,
        leads: data.filter(l => l.status === 'lead').length,
        opportunities: data.filter(l => l.status === 'opportunity').length,
        customers: data.filter(l => l.status === 'customer').length,
        lost: data.filter(l => l.status === 'lost').length,
        needsReview: data.filter(l => l.needs_review).length,
      };

      return stats;
    },
  });
}
