import { useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';
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

// ===== Agent voice config =====

export interface SupportAgentVoice {
  id: string;
  user_id: string;
  status: string;
  voice_enabled: boolean | null;
  voice_sip_username: string | null;
  voice_sip_password: string | null;
  voice_sip_uri: string | null;
  voice_mobile_number: string | null;
  voice_provider: string | null;
}

export function useMyAgentVoice() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['support-agent-voice', user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      if (!user?.id) return null;
      const { data, error } = await supabase
        .from('support_agents')
        .select('id,user_id,status,voice_enabled,voice_sip_username,voice_sip_password,voice_sip_uri,voice_mobile_number,voice_provider')
        .eq('user_id', user.id)
        .maybeSingle();
      if (error) throw error;
      return (data ?? null) as SupportAgentVoice | null;
    },
  });
}

export function useUpdateMyAgentVoice() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: async (patch: Partial<SupportAgentVoice>) => {
      if (!user?.id) throw new Error('not signed in');
      // Upsert if missing
      const { data: existing } = await supabase
        .from('support_agents')
        .select('id')
        .eq('user_id', user.id)
        .maybeSingle();
      const patchObj = (patch ?? {}) as Record<string, unknown>;
      if (!existing) {
        const { error } = await supabase
          .from('support_agents')
          .insert({ user_id: user.id, status: 'offline', ...patchObj } as never);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('support_agents')
          .update({ ...patchObj, updated_at: new Date().toISOString() } as never)
          .eq('user_id', user.id);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['support-agent-voice', user?.id] });
      toast({ title: 'Saved', description: 'Your voice settings were updated.' });
    },
    onError: (err) => {
      logger.error('agent voice update failed', err);
      toast({ title: 'Error', description: 'Could not save.', variant: 'destructive' });
    },
  });
}

/** Realtime: listen for new inbound voice_calls (status=ringing) targeting the current site. */
export function useRingingCallSubscription(onRinging: (call: VoiceCallRow) => void) {
  useEffect(() => {
    const channel = supabase
      .channel('voice-calls-ringing')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'voice_calls', filter: 'status=eq.ringing' },
        (payload) => onRinging(payload.new as unknown as VoiceCallRow),
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [onRinging]);
}
