import { logger } from '@/lib/logger';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { createLeadFromWebinar } from '@/lib/lead-utils';

export type WebinarStatus = 'draft' | 'published' | 'live' | 'completed' | 'cancelled';
export type WebinarPlatform = 'google_meet' | 'zoom' | 'teams' | 'custom';

export interface Webinar {
  id: string;
  title: string;
  description: string | null;
  agenda: string | null;
  date: string;
  duration_minutes: number;
  max_attendees: number | null;
  platform: WebinarPlatform;
  meeting_url: string | null;
  recording_url: string | null;
  status: WebinarStatus;
  cover_image: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface WebinarRegistration {
  id: string;
  webinar_id: string;
  name: string;
  email: string;
  phone: string | null;
  lead_id: string | null;
  registered_at: string;
  attended: boolean;
  follow_up_sent: boolean;
}

export interface CreateWebinarInput {
  title: string;
  description?: string;
  agenda?: string;
  date: string;
  duration_minutes: number;
  max_attendees?: number;
  platform: WebinarPlatform;
  meeting_url?: string;
  cover_image?: string;
  status?: WebinarStatus;
}

export interface UpdateWebinarInput extends Partial<CreateWebinarInput> {
  id: string;
  recording_url?: string;
}

// ─── Webinar CRUD ────────────────────────────────────────────

export function useWebinars(options?: { status?: WebinarStatus }) {
  return useQuery({
    queryKey: ['webinars', options?.status],
    queryFn: async () => {
      let query = supabase
        .from('webinars')
        .select('*')
        .order('date', { ascending: false });

      if (options?.status) {
        query = query.eq('status', options.status);
      }

      const { data, error } = await query;
      if (error) throw error;
      return (data || []) as Webinar[];
    },
  });
}

export function useWebinar(id: string | undefined) {
  return useQuery({
    queryKey: ['webinars', id],
    queryFn: async () => {
      if (!id) return null;
      const { data, error } = await supabase
        .from('webinars')
        .select('*')
        .eq('id', id)
        .single();
      if (error) throw error;
      return data as Webinar;
    },
    enabled: !!id,
  });
}

export function useCreateWebinar() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (input: CreateWebinarInput) => {
      const { data, error } = await supabase
        .from('webinars')
        .insert({
          title: input.title,
          description: input.description || null,
          agenda: input.agenda || null,
          date: input.date,
          duration_minutes: input.duration_minutes,
          max_attendees: input.max_attendees || null,
          platform: input.platform,
          meeting_url: input.meeting_url || null,
          cover_image: input.cover_image || null,
          status: input.status || 'draft',
        })
        .select()
        .single();
      if (error) throw error;
      return data as Webinar;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['webinars'] });
      toast({ title: 'Webinar created' });
    },
    onError: (error) => {
      toast({ title: 'Error', description: 'Could not create webinar.', variant: 'destructive' });
      logger.error('Create webinar error:', error);
    },
  });
}

export function useUpdateWebinar() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (input: UpdateWebinarInput) => {
      const { id, ...updates } = input;
      const { data, error } = await supabase
        .from('webinars')
        .update({ ...updates, updated_at: new Date().toISOString() })
        .eq('id', id)
        .select()
        .single();
      if (error) throw error;
      return data as Webinar;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['webinars'] });
      queryClient.setQueryData(['webinars', data.id], data);
      toast({ title: 'Webinar updated' });
    },
    onError: (error) => {
      toast({ title: 'Error', description: 'Could not update webinar.', variant: 'destructive' });
      logger.error('Update webinar error:', error);
    },
  });
}

export function useDeleteWebinar() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('webinars').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['webinars'] });
      toast({ title: 'Webinar deleted' });
    },
    onError: (error) => {
      toast({ title: 'Error', description: 'Could not delete webinar.', variant: 'destructive' });
      logger.error('Delete webinar error:', error);
    },
  });
}

// ─── Registrations ───────────────────────────────────────────

export function useWebinarRegistrations(webinarId: string | undefined) {
  return useQuery({
    queryKey: ['webinar-registrations', webinarId],
    queryFn: async () => {
      if (!webinarId) return [];
      const { data, error } = await supabase
        .from('webinar_registrations')
        .select('*')
        .eq('webinar_id', webinarId)
        .order('registered_at', { ascending: false });
      if (error) throw error;
      return (data || []) as WebinarRegistration[];
    },
    enabled: !!webinarId,
  });
}

export function useRegisterForWebinar() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (input: { webinar_id: string; name: string; email: string; phone?: string }) => {
      // SECURITY DEFINER RPC handles dedup, lead-link/create, score boost and event emission.
      const { data, error } = await (supabase.rpc as any)('register_for_webinar', {
        p_webinar_id: input.webinar_id,
        p_name: input.name,
        p_email: input.email,
        p_phone: input.phone ?? null,
      });
      if (error) throw error;
      return data as { success: boolean; registration_id: string; lead_id: string };
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['webinar-registrations', variables.webinar_id] });
      toast({ title: 'Registered!', description: 'You have been registered for this webinar.' });
    },
    onError: (error) => {
      const message = error instanceof Error ? error.message : 'Could not register.';
      toast({ title: 'Error', description: message, variant: 'destructive' });
    },
  });
}

// ─── Stats ───────────────────────────────────────────────────

export function useWebinarStats() {
  return useQuery({
    queryKey: ['webinar-stats'],
    queryFn: async () => {
      const now = new Date().toISOString();

      const { data: all } = await supabase
        .from('webinars')
        .select('id, status, date');

      const webinars = all || [];
      const upcoming = webinars.filter(w => w.status === 'published' && w.date > now).length;
      const completed = webinars.filter(w => w.status === 'completed').length;
      const draft = webinars.filter(w => w.status === 'draft').length;

      const { count: totalRegistrations } = await supabase
        .from('webinar_registrations')
        .select('id', { count: 'exact', head: true });

      return {
        total: webinars.length,
        upcoming,
        completed,
        draft,
        totalRegistrations: totalRegistrations || 0,
      };
    },
  });
}

// ─── Lifecycle (RPC-backed) ──────────────────────────────────

type LifecycleAction =
  | { kind: 'publish'; webinarId: string }
  | { kind: 'start'; webinarId: string }
  | { kind: 'complete'; webinarId: string; recordingUrl?: string }
  | { kind: 'cancel'; webinarId: string; reason?: string };

export function useWebinarLifecycle() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (action: LifecycleAction) => {
      let result;
      switch (action.kind) {
        case 'publish':
          result = await (supabase.rpc as any)('publish_webinar', { p_webinar_id: action.webinarId });
          break;
        case 'start':
          result = await (supabase.rpc as any)('start_webinar', { p_webinar_id: action.webinarId });
          break;
        case 'complete':
          result = await (supabase.rpc as any)('complete_webinar', {
            p_webinar_id: action.webinarId,
            p_recording_url: action.recordingUrl ?? null,
          });
          break;
        case 'cancel':
          result = await (supabase.rpc as any)('cancel_webinar', {
            p_webinar_id: action.webinarId,
            p_reason: action.reason ?? null,
          });
          break;
      }
      if (result?.error) throw result.error;
      return result?.data;
    },
    onSuccess: (_d, action) => {
      queryClient.invalidateQueries({ queryKey: ['webinars'] });
      queryClient.invalidateQueries({ queryKey: ['webinar-stats'] });
      toast({ title: `Webinar ${action.kind}ed` });
    },
    onError: (e) => {
      logger.error('webinar lifecycle error', e);
      toast({
        title: 'Error',
        description: e instanceof Error ? e.message : 'Lifecycle action failed',
        variant: 'destructive',
      });
    },
  });
}

export function useMarkAttendance() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: async ({ registrationId, attended }: { registrationId: string; attended: boolean }) => {
      const { error, data } = await (supabase.rpc as any)('mark_webinar_attendance', {
        p_registration_id: registrationId,
        p_attended: attended,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['webinar-registrations'] });
      toast({ title: 'Attendance updated' });
    },
    onError: (e) =>
      toast({
        title: 'Error',
        description: e instanceof Error ? e.message : 'Failed to update attendance',
        variant: 'destructive',
      }),
  });
}
