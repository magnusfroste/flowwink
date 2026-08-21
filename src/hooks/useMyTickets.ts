import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import type { Ticket, TicketCategory, TicketComment } from '@/hooks/useTickets';

/** Priorities a customer may pick — `urgent` is staff-side triage only. */
export type MySupportRequestPriority = 'low' | 'medium' | 'high';

export interface CreateMySupportRequestInput {
  subject: string;
  description?: string;
  priority?: MySupportRequestPriority;
  category?: TicketCategory;
}

/**
 * Tickets the signed-in customer is allowed to see. Visibility is enforced by
 * RLS (own tickets + active company-contact scope) — this hook adds no filters
 * of its own so the portal always mirrors the access rules.
 */
export function useMyTickets() {
  return useQuery({
    queryKey: ['my-tickets'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('tickets')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as Ticket[];
    },
  });
}

/** Public (non-internal) replies on one ticket. */
export function useMyTicketComments(ticketId: string | null) {
  return useQuery({
    queryKey: ['my-ticket-comments', ticketId],
    enabled: !!ticketId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('ticket_comments')
        .select('*')
        .eq('ticket_id', ticketId!)
        .eq('is_internal', false)
        .order('created_at', { ascending: true });
      if (error) throw error;
      return (data ?? []) as unknown as TicketComment[];
    },
  });
}

/**
 * Creates a ticket via the submit_support_request RPC — the portal's only
 * create path. Ownership (created_by, contact_email, company_id) is stamped
 * from the session server-side; the arguments carry content only.
 */
export function useCreateMySupportRequest() {
  const qc = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: async (input: CreateMySupportRequestInput) => {
      const { data, error } = await supabase.rpc('submit_support_request', {
        p_subject: input.subject,
        p_description: input.description || undefined,
        p_priority: input.priority || 'medium',
        p_category: input.category || 'other',
      });
      if (error) throw error;
      return data as string;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['my-tickets'] });
      toast({ title: 'Request submitted', description: 'Our team will get back to you.' });
    },
    onError: (err: Error) =>
      toast({ title: 'Could not submit request', description: err.message, variant: 'destructive' }),
  });
}

export function useAddMyTicketReply() {
  const qc = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: async ({ ticketId, content }: { ticketId: string; content: string }) => {
      const { data: { user } } = await supabase.auth.getUser();
      const { error } = await supabase.from('ticket_comments').insert([{
        ticket_id: ticketId,
        content,
        is_internal: false,
        author_type: 'customer',
        author_id: user?.id ?? null,
        author_name: user?.email ?? null,
      }] as never);
      if (error) throw error;
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ['my-ticket-comments', vars.ticketId] });
      toast({ title: 'Reply sent' });
    },
    onError: (err: Error) =>
      toast({ title: 'Could not send reply', description: err.message, variant: 'destructive' }),
  });
}
