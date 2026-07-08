import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

export interface TicketTimeEntry {
  id: string;
  ticket_id: string;
  user_id: string | null;
  user_name: string | null;
  minutes: number;
  note: string | null;
  billable: boolean;
  started_at: string | null;
  created_at: string;
}

export function useTicketTimeEntries(ticketId?: string) {
  return useQuery({
    queryKey: ['ticket-time-entries', ticketId],
    enabled: !!ticketId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('ticket_time_entries' as never)
        .select('*')
        .eq('ticket_id', ticketId!)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as TicketTimeEntry[];
    },
  });
}

export function useAddTicketTimeEntry() {
  const qc = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: async (input: {
      ticket_id: string;
      minutes: number;
      note?: string;
      billable?: boolean;
      user_name?: string;
      started_at?: string;
    }) => {
      const { data: userRes } = await supabase.auth.getUser();
      const { error } = await supabase.from('ticket_time_entries' as never).insert([
        {
          ticket_id: input.ticket_id,
          minutes: input.minutes,
          note: input.note ?? null,
          billable: input.billable ?? true,
          user_id: userRes.user?.id ?? null,
          user_name: input.user_name ?? userRes.user?.email ?? null,
          started_at: input.started_at ?? null,
        },
      ] as never);
      if (error) throw error;
    },
    onSuccess: (_d, v) => {
      qc.invalidateQueries({ queryKey: ['ticket-time-entries', v.ticket_id] });
      toast({ title: 'Time logged' });
    },
    onError: (err: Error) =>
      toast({ title: 'Could not log time', description: err.message, variant: 'destructive' }),
  });
}

export function useDeleteTicketTimeEntry() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ticket_id: _t }: { id: string; ticket_id: string }) => {
      const { error } = await supabase.from('ticket_time_entries' as never).delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: (_d, v) =>
      qc.invalidateQueries({ queryKey: ['ticket-time-entries', v.ticket_id] }),
  });
}
