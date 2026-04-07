import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

// ============================================================
// Types
// ============================================================

export interface Project {
  id: string;
  name: string;
  client_name: string | null;
  description: string | null;
  color: string;
  hourly_rate_cents: number;
  currency: string;
  is_billable: boolean;
  is_active: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface TimeEntry {
  id: string;
  user_id: string;
  project_id: string;
  entry_date: string;
  hours: number;
  description: string | null;
  is_billable: boolean;
  is_invoiced: boolean;
  invoice_id: string | null;
  created_at: string;
  updated_at: string;
  // Joined
  projects?: Pick<Project, 'name' | 'color' | 'client_name'>;
}

// ============================================================
// Projects
// ============================================================

export function useProjects(activeOnly = true) {
  return useQuery({
    queryKey: ['projects', activeOnly],
    queryFn: async () => {
      let query = supabase
        .from('projects')
        .select('*')
        .order('name');
      if (activeOnly) query = query.eq('is_active', true);
      const { data, error } = await query;
      if (error) throw error;
      return data as unknown as Project[];
    },
  });
}

export function useCreateProject() {
  const qc = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (input: Partial<Project>) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const { data, error } = await supabase
        .from('projects')
        .insert([{
          name: input.name || 'New Project',
          client_name: input.client_name || null,
          description: input.description || null,
          color: input.color || '#6366f1',
          hourly_rate_cents: input.hourly_rate_cents || 0,
          currency: input.currency || 'SEK',
          is_billable: input.is_billable ?? true,
          created_by: user.id,
        }])
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['projects'] });
      toast({ title: 'Project created' });
    },
    onError: (err: Error) => {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    },
  });
}

// ============================================================
// Time Entries
// ============================================================

export function useTimeEntries(weekStart?: string, weekEnd?: string) {
  return useQuery({
    queryKey: ['time-entries', weekStart, weekEnd],
    queryFn: async () => {
      let query = supabase
        .from('time_entries')
        .select('*, projects(name, color, client_name)')
        .order('entry_date', { ascending: false });

      if (weekStart && weekEnd) {
        query = query.gte('entry_date', weekStart).lte('entry_date', weekEnd);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data as unknown as TimeEntry[];
    },
  });
}

export function useCreateTimeEntry() {
  const qc = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (input: { project_id: string; entry_date: string; hours: number; description?: string; is_billable?: boolean }) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const { data, error } = await supabase
        .from('time_entries')
        .insert([{
          user_id: user.id,
          project_id: input.project_id,
          entry_date: input.entry_date,
          hours: input.hours,
          description: input.description || null,
          is_billable: input.is_billable ?? true,
        }])
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['time-entries'] });
      toast({ title: 'Time logged' });
    },
    onError: (err: Error) => {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    },
  });
}

export function useDeleteTimeEntry() {
  const qc = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('time_entries')
        .delete()
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['time-entries'] });
      toast({ title: 'Entry deleted' });
    },
    onError: (err: Error) => {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    },
  });
}

// ============================================================
// Project Members
// ============================================================

export interface ProjectMember {
  id: string;
  project_id: string;
  user_id: string;
  role: string;
  hourly_rate_override_cents: number | null;
  tracks_time: boolean;
  created_at: string;
  profiles?: { full_name: string | null; email: string | null };
}

export function useProjectMembers(projectId?: string) {
  return useQuery({
    queryKey: ['project-members', projectId],
    enabled: !!projectId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('project_members')
        .select('*, profiles(full_name, email)')
        .eq('project_id', projectId!);
      if (error) throw error;
      return data as unknown as ProjectMember[];
    },
  });
}

export function useAddProjectMember() {
  const qc = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (input: { project_id: string; user_id: string; role?: string }) => {
      const { data, error } = await supabase
        .from('project_members')
        .insert([{
          project_id: input.project_id,
          user_id: input.user_id,
          role: input.role || 'member',
        }])
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ['project-members', vars.project_id] });
      toast({ title: 'Member added' });
    },
    onError: (err: Error) => {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    },
  });
}

export function useRemoveProjectMember() {
  const qc = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (input: { id: string; project_id: string }) => {
      const { error } = await supabase
        .from('project_members')
        .delete()
        .eq('id', input.id);
      if (error) throw error;
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ['project-members', vars.project_id] });
      toast({ title: 'Member removed' });
    },
    onError: (err: Error) => {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    },
  });
}

// ============================================================
// Weekly summary helper
// ============================================================

export function getWeekDates(offset = 0) {
  const now = new Date();
  const day = now.getDay();
  const monday = new Date(now);
  monday.setDate(now.getDate() - (day === 0 ? 6 : day - 1) + offset * 7);
  monday.setHours(0, 0, 0, 0);

  const days: string[] = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    days.push(d.toISOString().slice(0, 10));
  }

  return { weekStart: days[0], weekEnd: days[6], days };
}
