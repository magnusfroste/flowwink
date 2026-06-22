import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { logger } from '@/lib/logger';
import type { Json } from '@/integrations/supabase/types';
import type { VoiceProviderId, VoiceSettings } from '@/lib/voice-providers/types';

const SETTINGS_KEY = 'voice';

export const defaultVoiceSettings: VoiceSettings = {
  provider: null,
  voicemailGreetingUrl: undefined,
  welcomeGreetingUrl: undefined,
  ringTimeoutSeconds: 20,
  bookingIvrEnabled: false,
  bookingServiceId: undefined,
};

export function useVoiceSettings() {
  return useQuery({
    queryKey: ['site-settings', SETTINGS_KEY],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('site_settings')
        .select('value')
        .eq('key', SETTINGS_KEY)
        .maybeSingle();
      if (error) throw error;
      if (!data?.value) return defaultVoiceSettings;
      return { ...defaultVoiceSettings, ...(data.value as unknown as VoiceSettings) };
    },
    staleTime: 1000 * 60 * 5,
  });
}

export function useUpdateVoiceSettings() {
  const qc = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: async (settings: VoiceSettings) => {
      const value = settings as unknown as Json;
      const { data: existing } = await supabase
        .from('site_settings')
        .select('id')
        .eq('key', SETTINGS_KEY)
        .maybeSingle();
      if (existing) {
        const { error } = await supabase
          .from('site_settings')
          .update({ value, updated_at: new Date().toISOString() })
          .eq('key', SETTINGS_KEY);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('site_settings').insert({ key: SETTINGS_KEY, value });
        if (error) throw error;
      }
      return settings;
    },
    onSuccess: (s) => {
      qc.setQueryData(['site-settings', SETTINGS_KEY], s);
      toast({ title: 'Saved', description: 'Voice settings updated.' });
    },
    onError: (err) => {
      logger.error('voice settings save failed', err);
      toast({ title: 'Error', description: 'Could not save voice settings.', variant: 'destructive' });
    },
  });
}

export type VoiceCallStatus =
  | 'ringing' | 'answered' | 'missed' | 'voicemail'
  | 'completed' | 'failed' | 'busy' | 'no_answer';
export type VoiceCallDirection = 'inbound' | 'outbound';
export type VoiceCallbackStatus = 'none' | 'pending' | 'scheduled' | 'completed' | 'failed';

export interface VoiceCallRow {
  id: string;
  provider: string;
  provider_call_id: string;
  direction: VoiceCallDirection;
  status: VoiceCallStatus;
  from_number: string;
  to_number: string;
  agent_id: string | null;
  started_at: string;
  answered_at: string | null;
  ended_at: string | null;
  duration_seconds: number | null;
  recording_url: string | null;
  recording_duration_seconds: number | null;
  transcript: string | null;
  voicemail: boolean;
  callback_status: VoiceCallbackStatus;
  callback_scheduled_at: string | null;
  callback_completed_at: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
}

export interface VoiceCallFilters {
  status?: VoiceCallStatus;
  direction?: VoiceCallDirection;
  callbackStatus?: VoiceCallbackStatus;
  limit?: number;
}

export function useVoiceCalls(filters: VoiceCallFilters = {}) {
  return useQuery({
    queryKey: ['voice-calls', filters],
    queryFn: async () => {
      let q = supabase.from('voice_calls').select('*').order('started_at', { ascending: false });
      if (filters.status) q = q.eq('status', filters.status);
      if (filters.direction) q = q.eq('direction', filters.direction);
      if (filters.callbackStatus) q = q.eq('callback_status', filters.callbackStatus);
      q = q.limit(filters.limit ?? 100);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as unknown as VoiceCallRow[];
    },
  });
}

export function useUpdateVoiceCall() {
  const qc = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: Partial<VoiceCallRow> }) => {
      const { error } = await supabase
        .from('voice_calls')
        .update({ ...patch, updated_at: new Date().toISOString() } as never)
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['voice-calls'] });
      toast({ title: 'Updated', description: 'Call updated.' });
    },
    onError: (err) => {
      logger.error('voice call update failed', err);
      toast({ title: 'Error', description: 'Could not update call.', variant: 'destructive' });
    },
  });
}

export function voiceProviderLabel(id: VoiceProviderId | string | null): string {
  switch (id) {
    case 'elks46': return '46elks (Nordics + UK)';
    case 'twilio': return 'Twilio (global)';
    case 'telnyx': return 'Telnyx (planned)';
    case 'vonage': return 'Vonage (planned)';
    default: return 'No provider selected';
  }
}
