import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

export interface TicketTeam {
  id: string;
  name: string;
  description: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface TicketTeamMember {
  id: string;
  team_id: string;
  user_id: string;
  is_lead: boolean;
  created_at: string;
}

export function useTicketTeams() {
  return useQuery({
    queryKey: ['ticket-teams'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('ticket_teams' as never)
        .select('*')
        .order('name');
      if (error) throw error;
      return (data ?? []) as unknown as TicketTeam[];
    },
  });
}

export function useTicketTeamMembers(teamId?: string) {
  return useQuery({
    queryKey: ['ticket-team-members', teamId],
    enabled: !!teamId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('ticket_team_members' as never)
        .select('*')
        .eq('team_id', teamId!);
      if (error) throw error;
      return (data ?? []) as unknown as TicketTeamMember[];
    },
  });
}

export function useCreateTicketTeam() {
  const qc = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: async (input: { name: string; description?: string }) => {
      const { data, error } = await supabase
        .from('ticket_teams' as never)
        .insert([{ name: input.name, description: input.description ?? null }] as never)
        .select('id')
        .single();
      if (error) throw error;
      return data as unknown as { id: string };
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['ticket-teams'] });
      toast({ title: 'Team created' });
    },
    onError: (err: Error) =>
      toast({ title: 'Could not create team', description: err.message, variant: 'destructive' }),
  });
}

export function useUpdateTicketTeam() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...updates }: Partial<TicketTeam> & { id: string }) => {
      const { error } = await supabase
        .from('ticket_teams' as never)
        .update({ ...updates, updated_at: new Date().toISOString() } as never)
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['ticket-teams'] }),
  });
}

export function useDeleteTicketTeam() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('ticket_teams' as never).delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['ticket-teams'] }),
  });
}

export function useAddTeamMember() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { team_id: string; user_id: string; is_lead?: boolean }) => {
      const { error } = await supabase
        .from('ticket_team_members' as never)
        .insert([{ team_id: input.team_id, user_id: input.user_id, is_lead: input.is_lead ?? false }] as never);
      if (error) throw error;
    },
    onSuccess: (_d, v) => qc.invalidateQueries({ queryKey: ['ticket-team-members', v.team_id] }),
  });
}

export function useRemoveTeamMember() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, team_id: _team }: { id: string; team_id: string }) => {
      const { error } = await supabase.from('ticket_team_members' as never).delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: (_d, v) => qc.invalidateQueries({ queryKey: ['ticket-team-members', v.team_id] }),
  });
}
