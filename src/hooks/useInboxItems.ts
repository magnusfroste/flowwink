import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import {
  emailItems, chatItems, ticketItems, formItems, voiceItems, sortQueue, attachSteps,
  type InboxItem, type EmailThreadRow, type EmailMessageRow, type ChatConversationRow,
  type TicketRow, type FormSubmissionRow, type VoiceCallRow, type AgentActivityRow,
} from '@/lib/inbox-items';

const WINDOW_DAYS = 30;
const LIMIT = 200;

/**
 * Five bounded reads, merged in the client. Bounded twice: a time window and
 * a row cap per source, so the queue never becomes the 1000-row silent
 * truncation PostgREST hands out to an unbounded select. A source the role
 * cannot read comes back empty through RLS — that is the matrix speaking,
 * not an error, and the other channels still show.
 */
export function useInboxItems() {
  return useQuery({
    queryKey: ['inbox-items'],
    refetchInterval: 30_000,
    queryFn: async (): Promise<InboxItem[]> => {
      const since = new Date(Date.now() - WINDOW_DAYS * 86_400_000).toISOString();
      const [threads, messages, chats, tickets, forms, calls, activity] = await Promise.all([
        supabase.from('email_threads' as never).select('thread_key, subject, last_message_at, message_count, related_entity_type, related_entity_id').gte('last_message_at', since).order('last_message_at', { ascending: false }).limit(LIMIT),
        supabase.from('outbound_communications' as never).select('thread_id, direction, sender, recipient, body_text, created_at, status').eq('channel', 'email').not('thread_id', 'is', null).gte('created_at', since).order('created_at', { ascending: false }).limit(LIMIT * 3),
        supabase.from('chat_conversations' as never).select('id, title, conversation_status, priority, assigned_agent_id, customer_email, customer_name, escalation_reason, channel, updated_at').eq('scope', 'visitor').gte('updated_at', since).order('updated_at', { ascending: false }).limit(LIMIT),
        supabase.from('tickets' as never).select('id, ticket_number, subject, status, priority, assigned_to, contact_name, contact_email, source, updated_at').gte('updated_at', since).order('updated_at', { ascending: false }).limit(LIMIT),
        supabase.from('form_submissions' as never).select('id, form_name, data, created_at, handled_at, lead_id').gte('created_at', since).order('created_at', { ascending: false }).limit(LIMIT),
        supabase.from('voice_calls' as never).select('id, direction, status, from_number, to_number, started_at, voicemail, callback_status, ai_handled, ai_summary, conversation_id, created_at').gte('created_at', since).order('created_at', { ascending: false }).limit(LIMIT),
        // The operator's trail — the same ledger objectives close on. Skill
        // calls only (log rows carry no skill), newest first, bounded.
        supabase.from('agent_activity' as never).select('id, created_at, agent, skill_name, status, conversation_id, input, output, error_message, log_message').not('skill_name', 'is', null).gte('created_at', since).order('created_at', { ascending: false }).limit(LIMIT * 3),
      ]);
      // A source that errors (module off, table absent on an older instance)
      // is logged and skipped — the queue must not go blank because one
      // channel is not installed.
      const rows = <T,>(r: { data: unknown; error: { message: string } | null }, label: string): T[] => {
        if (r.error) { console.warn(`[inbox] ${label} unavailable: ${r.error.message}`); return []; }
        return (r.data ?? []) as T[];
      };
      const items = sortQueue([
        ...emailItems(rows<EmailThreadRow>(threads, 'email threads'), rows<EmailMessageRow>(messages, 'email messages')),
        ...chatItems(rows<ChatConversationRow>(chats, 'chat')),
        ...ticketItems(rows<TicketRow>(tickets, 'tickets')),
        ...formItems(rows<FormSubmissionRow>(forms, 'forms')),
        ...voiceItems(rows<VoiceCallRow>(calls, 'voice')),
      ]);
      return attachSteps(items, rows<AgentActivityRow>(activity, 'agent activity'));
    },
  });
}
