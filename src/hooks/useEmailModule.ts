import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export interface EmailTemplate {
  id: string;
  name: string;
  subject: string;
  html: string;
  text: string | null;
  category: string | null;
  variables: string[];
  active: boolean;
  created_at: string;
  updated_at: string;
}

export function useEmailTemplates() {
  return useQuery({
    queryKey: ['email-templates'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('email_templates' as any)
        .select('*')
        .order('name');
      if (error) throw error;
      return (data ?? []) as unknown as EmailTemplate[];
    },
  });
}

export function useUpsertEmailTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (t: Partial<EmailTemplate> & { name: string; subject: string; html: string }) => {
      const { data, error } = await supabase.rpc('upsert_email_template' as any, {
        p_name: t.name,
        p_subject: t.subject,
        p_html: t.html,
        p_text: t.text ?? null,
        p_category: t.category ?? null,
        p_variables: (t.variables ?? []) as any,
        p_active: t.active ?? true,
      });
      if (error) throw error;
      return data as EmailTemplate;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['email-templates'] });
      toast.success('Template saved');
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useDeleteEmailTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (name: string) => {
      const { error } = await supabase.rpc('delete_email_template' as any, { p_name: name });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['email-templates'] });
      toast.success('Template deleted');
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

export interface EmailSignature {
  id: string;
  user_id: string | null;
  from_address: string | null;
  html: string;
  is_default: boolean;
  created_at: string;
  updated_at: string;
}

export function useEmailSignatures() {
  return useQuery({
    queryKey: ['email-signatures'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('email_signatures' as any)
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as EmailSignature[];
    },
  });
}

export function useUpsertEmailSignature() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (s: { html: string; from_address?: string; is_default?: boolean }) => {
      const { data, error } = await supabase.rpc('upsert_email_signature' as any, {
        p_html: s.html,
        p_from_address: s.from_address ?? null,
        p_is_default: s.is_default ?? false,
      });
      if (error) throw error;
      return data as EmailSignature;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['email-signatures'] });
      toast.success('Signature saved');
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

export interface EmailThread {
  thread_key: string;
  subject: string | null;
  last_message_at: string;
  first_message_at: string;
  message_count: number;
  related_entity_type: string | null;
  related_entity_id: string | null;
}

export function useEmailThreads() {
  return useQuery({
    queryKey: ['email-threads'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('email_threads' as any)
        .select('*')
        .order('last_message_at', { ascending: false })
        .limit(200);
      if (error) throw error;
      return (data ?? []) as unknown as EmailThread[];
    },
  });
}

export function useThreadMessages(threadKey?: string) {
  return useQuery({
    queryKey: ['email-thread-messages', threadKey],
    enabled: !!threadKey,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('outbound_communications' as any)
        .select('id, subject, recipient, sender, direction, status, sent_at, body_html, body_text, created_at')
        .eq('channel', 'email')
        .eq('thread_id', threadKey!)
        .order('created_at', { ascending: true });
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });
}

export interface EmailSuppression {
  email: string;
  reason: string;
  created_at: string;
}

export function useEmailSuppressions() {
  return useQuery({
    queryKey: ['email-suppressions'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('email_suppressions' as any)
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as EmailSuppression[];
    },
  });
}

export function useAddSuppression() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: { email: string; reason?: string }) => {
      const { data, error } = await supabase.rpc('add_email_suppression' as any, {
        p_email: args.email, p_reason: args.reason ?? 'manual',
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['email-suppressions'] }); toast.success('Suppressed'); },
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useRemoveSuppression() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (email: string) => {
      const { error } = await supabase.rpc('remove_email_suppression' as any, { p_email: email });
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['email-suppressions'] }); toast.success('Removed from suppression list'); },
    onError: (e: Error) => toast.error(e.message),
  });
}

export interface EmailEvent {
  id: string;
  message_id: string | null;
  event_type: string;
  recipient: string | null;
  hard_bounce: boolean;
  created_at: string;
}

export function useEmailEvents(limit = 100) {
  return useQuery({
    queryKey: ['email-events', limit],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('email_events' as any)
        .select('*')
        .order('created_at', { ascending: false })
        .limit(limit);
      if (error) throw error;
      return (data ?? []) as unknown as EmailEvent[];
    },
  });
}
