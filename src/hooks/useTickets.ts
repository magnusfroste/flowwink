import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

export type TicketStatus = 'new' | 'open' | 'in_progress' | 'waiting' | 'resolved' | 'closed';
export type TicketPriority = 'low' | 'medium' | 'high' | 'urgent';
export type TicketCategory = 'bug' | 'feature' | 'question' | 'billing' | 'other';

export interface Ticket {
  id: string;
  subject: string;
  description: string | null;
  status: TicketStatus;
  priority: TicketPriority;
  category: TicketCategory;
  assigned_to: string | null;
  lead_id: string | null;
  company_id: string | null;
  contact_email: string | null;
  contact_name: string | null;
  source: string;
  source_id: string | null;
  sla_deadline: string | null;
  resolved_at: string | null;
  closed_at: string | null;
  metadata: Record<string, unknown>;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  // Joined
  lead?: { id: string; name: string | null; email: string } | null;
  company?: { id: string; name: string } | null;
}

export interface TicketComment {
  id: string;
  ticket_id: string;
  content: string;
  is_internal: boolean;
  author_type: string;
  author_id: string | null;
  author_name: string | null;
  created_at: string;
}

export interface CreateTicketInput {
  subject: string;
  description?: string;
  priority?: TicketPriority;
  category?: TicketCategory;
  contact_email?: string;
  contact_name?: string;
  lead_id?: string;
  company_id?: string;
  source?: string;
  assigned_to?: string;
}

const TICKET_STATUSES: TicketStatus[] = ['new', 'open', 'in_progress', 'waiting', 'resolved', 'closed'];

export const TICKET_STATUS_LABELS: Record<TicketStatus, string> = {
  new: 'New',
  open: 'Open',
  in_progress: 'In Progress',
  waiting: 'Waiting',
  resolved: 'Resolved',
  closed: 'Closed',
};

export const TICKET_PRIORITY_LABELS: Record<TicketPriority, string> = {
  low: 'Low',
  medium: 'Medium',
  high: 'High',
  urgent: 'Urgent',
};

export const TICKET_CATEGORY_LABELS: Record<TicketCategory, string> = {
  bug: 'Bug',
  feature: 'Feature Request',
  question: 'Question',
  billing: 'Billing',
  other: 'Other',
};

export const TICKET_PRIORITY_COLORS: Record<TicketPriority, string> = {
  low: 'bg-muted text-muted-foreground',
  medium: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300',
  high: 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300',
  urgent: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300',
};

export const TICKET_STATUS_COLORS: Record<TicketStatus, string> = {
  new: 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300',
  open: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300',
  in_progress: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300',
  waiting: 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300',
  resolved: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300',
  closed: 'bg-muted text-muted-foreground',
};

export function useTickets(statusFilter?: TicketStatus[]) {
  return useQuery({
    queryKey: ['tickets', statusFilter],
    queryFn: async () => {
      let query = supabase
        .from('tickets')
        .select('*, leads(id, name, email), companies(id, name)')
        .order('created_at', { ascending: false });

      if (statusFilter && statusFilter.length > 0) {
        query = query.in('status', statusFilter);
      }

      const { data, error } = await query;
      if (error) throw error;

      return (data as unknown as Array<Record<string, unknown>>).map((t) => ({
        ...t,
        lead: (t.leads as Ticket['lead']) ?? null,
        company: (t.companies as Ticket['company']) ?? null,
      })) as Ticket[];
    },
  });
}

export function useTicket(id: string | undefined) {
  return useQuery({
    queryKey: ['tickets', id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('tickets')
        .select('*, leads(id, name, email), companies(id, name)')
        .eq('id', id!)
        .single();

      if (error) throw error;
      const t = data as unknown as Record<string, unknown>;
      return {
        ...t,
        lead: (t.leads as Ticket['lead']) ?? null,
        company: (t.companies as Ticket['company']) ?? null,
      } as Ticket;
    },
  });
}

export function useTicketComments(ticketId: string | undefined) {
  return useQuery({
    queryKey: ['ticket-comments', ticketId],
    enabled: !!ticketId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('ticket_comments')
        .select('*')
        .eq('ticket_id', ticketId!)
        .order('created_at', { ascending: true });

      if (error) throw error;
      return data as unknown as TicketComment[];
    },
  });
}

export function useCreateTicket() {
  const qc = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (input: CreateTicketInput) => {
      const { data, error } = await supabase
        .from('tickets')
        .insert([{
          subject: input.subject,
          description: input.description || null,
          priority: input.priority || 'medium',
          category: input.category || 'other',
          contact_email: input.contact_email || null,
          contact_name: input.contact_name || null,
          lead_id: input.lead_id || null,
          company_id: input.company_id || null,
          source: input.source || 'manual',
          assigned_to: input.assigned_to || null,
        }])
        .select('id')
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tickets'] });
      toast({ title: 'Ticket created' });
    },
    onError: (err: Error) => {
      toast({ title: 'Error creating ticket', description: err.message, variant: 'destructive' });
    },
  });
}

export function useUpdateTicket() {
  const qc = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({ id, ...updates }: Partial<Ticket> & { id: string }) => {
      const { error } = await supabase
        .from('tickets')
        .update({ ...updates, updated_at: new Date().toISOString() } as never)
        .eq('id', id);

      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tickets'] });
    },
    onError: (err: Error) => {
      toast({ title: 'Error updating ticket', description: err.message, variant: 'destructive' });
    },
  });
}

export function useAddTicketComment() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (input: {
      ticket_id: string;
      content: string;
      is_internal?: boolean;
      author_name?: string;
      author_id?: string;
    }) => {
      const { error } = await supabase
        .from('ticket_comments')
        .insert({
          ticket_id: input.ticket_id,
          content: input.content,
          is_internal: input.is_internal || false,
          author_type: 'agent',
          author_id: input.author_id || null,
          author_name: input.author_name || null,
        } as Record<string, unknown>);

      if (error) throw error;
    },
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ['ticket-comments', vars.ticket_id] });
    },
  });
}

export { TICKET_STATUSES };
