import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { Json } from '@/integrations/supabase/types';

export type ActivityType = 'call' | 'email' | 'meeting' | 'note' | 'form_submit' | 'email_open' | 'link_click' | 'status_change';

export interface LeadActivity {
  id: string;
  lead_id: string;
  type: string;
  metadata: Record<string, unknown> | null;
  points: number | null;
  created_at: string;
}

export interface DealActivity {
  id: string;
  deal_id: string;
  type: string;
  title: string | null;
  description: string | null;
  scheduled_at: string | null;
  completed_at: string | null;
  metadata: Record<string, unknown> | null;
  created_by: string | null;
  created_at: string;
}

// Lead Activities
export function useLeadActivities(leadId: string | undefined) {
  return useQuery({
    queryKey: ['lead-activities', leadId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('lead_activities')
        .select('*')
        .eq('lead_id', leadId!)
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      return data as LeadActivity[];
    },
    enabled: !!leadId,
  });
}

export function useAddLeadActivity() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async ({ 
      leadId, 
      type, 
      metadata,
      points = 0,
    }: { 
      leadId: string; 
      type: ActivityType;
      metadata?: Record<string, unknown>;
      points?: number;
    }) => {
      const { data, error } = await supabase
        .from('lead_activities')
        .insert([{
          lead_id: leadId,
          type,
          metadata: (metadata || {}) as Json,
          points,
        }])
        .select()
        .single();
      
      if (error) throw error;
      
      // Update lead score by fetching current score and incrementing
      if (points > 0) {
        const { data: lead } = await supabase
          .from('leads')
          .select('score')
          .eq('id', leadId)
          .single();
        
        await supabase
          .from('leads')
          .update({ score: (lead?.score || 0) + points })
          .eq('id', leadId);
      }
      
      return data;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['lead-activities', variables.leadId] });
      queryClient.invalidateQueries({ queryKey: ['lead', variables.leadId] });
      queryClient.invalidateQueries({ queryKey: ['leads'] });
    },
  });
}

// Deal Activities
export function useDealActivities(dealId: string | undefined) {
  return useQuery({
    queryKey: ['deal-activities', dealId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('deal_activities')
        .select('*')
        .eq('deal_id', dealId!)
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      return data as DealActivity[];
    },
    enabled: !!dealId,
  });
}

export function useAddDealActivity() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async ({ 
      dealId, 
      type,
      title,
      description,
      scheduledAt,
      completedAt,
      metadata,
    }: { 
      dealId: string; 
      type: ActivityType;
      title?: string;
      description?: string;
      scheduledAt?: string;
      completedAt?: string;
      metadata?: Record<string, unknown>;
    }) => {
      const { data: userData } = await supabase.auth.getUser();
      
      const { data, error } = await supabase
        .from('deal_activities')
        .insert([{
          deal_id: dealId,
          type,
          title,
          description,
          scheduled_at: scheduledAt,
          completed_at: completedAt,
          metadata: (metadata || {}) as Json,
          created_by: userData.user?.id,
        }])
        .select()
        .single();
      
      if (error) throw error;
      return data;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['deal-activities', variables.dealId] });
    },
  });
}

export function useUpdateDealActivity() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async ({ 
      id,
      completedAt,
      ...updates
    }: { 
      id: string;
      dealId: string;
      completedAt?: string | null;
      title?: string;
      description?: string;
    }) => {
      const { data, error } = await supabase
        .from('deal_activities')
        .update({ 
          ...updates,
          completed_at: completedAt,
        })
        .eq('id', id)
        .select()
        .single();
      
      if (error) throw error;
      return data;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['deal-activities', variables.dealId] });
    },
  });
}

export function useDeleteDealActivity() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async ({ id }: { id: string; dealId: string }) => {
      const { error } = await supabase
        .from('deal_activities')
        .delete()
        .eq('id', id);
      
      if (error) throw error;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['deal-activities', variables.dealId] });
    },
  });
}

// Activity type helpers
export function getActivityTypeInfo(type: string): { label: string; icon: string; color: string } {
  const types: Record<string, { label: string; icon: string; color: string }> = {
    call: { label: 'Call', icon: 'Phone', color: 'text-green-500' },
    email: { label: 'Email', icon: 'Mail', color: 'text-blue-500' },
    meeting: { label: 'Meeting', icon: 'Users', color: 'text-purple-500' },
    note: { label: 'Note', icon: 'MessageSquare', color: 'text-muted-foreground' },
    form_submit: { label: 'Form Submitted', icon: 'FileText', color: 'text-orange-500' },
    email_open: { label: 'Email Opened', icon: 'MailOpen', color: 'text-blue-400' },
    link_click: { label: 'Link Clicked', icon: 'MousePointer', color: 'text-cyan-500' },
    status_change: { label: 'Status Changed', icon: 'RefreshCw', color: 'text-yellow-500' },
    deal_closed_won: { label: 'Deal Won', icon: 'Trophy', color: 'text-green-500' },
    deal_closed_lost: { label: 'Deal Lost', icon: 'XCircle', color: 'text-red-500' },
  };
  return types[type] || { label: type, icon: 'Activity', color: 'text-muted-foreground' };
}
