import { logger } from '@/lib/logger';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useEffect, useRef } from 'react';
import { playNotificationSound } from '@/lib/notification-sound';

interface SupportConversation {
  id: string;
  user_id: string | null;
  session_id: string | null;
  title: string | null;
  conversation_status: string | null;
  priority: string | null;
  sentiment_score: number | null;
  assigned_agent_id: string | null;
  customer_email: string | null;
  customer_name: string | null;
  escalation_reason: string | null;
  escalated_at: string | null;
  created_at: string;
  updated_at: string;
  // Omnichannel contract — may not yet exist on every row; treated as optional.
  channel?: string | null;
  channel_thread_id?: string | null;
  contact_phone?: string | null;
  contact_id?: string | null;
  visitor_profile?: any;
}

interface ChatMessage {
  id: string;
  conversation_id: string;
  role: string;
  content: string;
  created_at: string;
}

export function useSupportConversations() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  // Get agent's assigned conversations
  const { data: assignedConversations, isLoading: assignedLoading } = useQuery({
    queryKey: ['support-assigned-conversations', user?.id],
    queryFn: async () => {
      if (!user?.id) return [];

      // First get the agent record
      const { data: agent } = await supabase
        .from('support_agents')
        .select('id')
        .eq('user_id', user.id)
        .maybeSingle();

      if (!agent) return [];

      const { data, error } = await supabase
        .from('chat_conversations')
        .select('*')
        .eq('assigned_agent_id', agent.id)
        .eq('scope', 'visitor')
        .in('conversation_status', ['with_agent', 'waiting_agent'])
        .order('updated_at', { ascending: false });

      if (error) throw error;
      return data as SupportConversation[];
    },
    enabled: !!user?.id,
  });

  // Get all waiting conversations (not assigned).
  // STRICT: only explicit 'waiting_agent' — never 'active' (which is the default
  // status for every AI-handled visitor chat and would flood the queue with
  // sessions where the visitor never actually asked for a human).
  const { data: waitingConversations, isLoading: waitingLoading } = useQuery({
    queryKey: ['support-waiting-conversations'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('chat_conversations')
        .select('*')
        .eq('scope', 'visitor')
        .eq('conversation_status', 'waiting_agent')
        .is('assigned_agent_id', null)
        .order('priority', { ascending: false })
        .order('updated_at', { ascending: false });

      if (error) throw error;
      return data as SupportConversation[];
    },
  });

  // Get escalated conversations
  const { data: escalatedConversations, isLoading: escalatedLoading } = useQuery({
    queryKey: ['support-escalated-conversations'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('chat_conversations')
        .select('*')
        .eq('scope', 'visitor')
        .eq('conversation_status', 'escalated')
        .order('escalated_at', { ascending: false });

      if (error) throw error;
      return data as SupportConversation[];
    },
  });

  // Realtime subscription — invalidates list queries on any conversation OR new message.
  // Also plays a global notification sound whenever a visitor user-message arrives in
  // a conversation that's either waiting OR assigned to this operator, so the agent
  // gets pinged even when the thread isn't currently open in the right pane.
  useEffect(() => {
    const invalidate = () => {
      queryClient.invalidateQueries({ queryKey: ['support-assigned-conversations'] });
      queryClient.invalidateQueries({ queryKey: ['support-waiting-conversations'] });
      queryClient.invalidateQueries({ queryKey: ['support-escalated-conversations'] });
    };

    const channel = supabase
      .channel('support-realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'chat_conversations' },
        invalidate,
      )
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'chat_messages' },
        async (payload) => {
          invalidate();
          const msg = payload.new as { role?: string; conversation_id?: string };
          if (msg?.role !== 'user' || !msg.conversation_id) return;

          // Only ping for support-relevant conversations (waiting OR assigned to me).
          try {
            const { data: conv } = await supabase
              .from('chat_conversations')
              .select('conversation_status, assigned_agent_id, scope')
              .eq('id', msg.conversation_id)
              .maybeSingle();
            if (!conv) return;
            if ((conv as any).scope === 'internal') return;

            const isWaiting =
              conv.conversation_status === 'waiting_agent' && !conv.assigned_agent_id;
            let isMine = false;
            if (conv.assigned_agent_id && user?.id) {
              const { data: agent } = await supabase
                .from('support_agents')
                .select('id')
                .eq('user_id', user.id)
                .maybeSingle();
              isMine = !!agent && agent.id === conv.assigned_agent_id;
            }
            if (isWaiting || isMine) {
              playNotificationSound();
            }
          } catch (err) {
            logger.error('support-realtime ping check failed', err);
          }
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient, user?.id]);

  // Claim a conversation
  const claimConversation = useMutation({
    mutationFn: async (conversationId: string) => {
      if (!user?.id) throw new Error('No user');

      // Get agent record
      const { data: agent, error: agentError } = await supabase
        .from('support_agents')
        .select('id, current_conversations')
        .eq('user_id', user.id)
        .maybeSingle();

      if (agentError) throw agentError;
      if (!agent) throw new Error('No agent record found');

      // Update conversation
      const { error: convError } = await supabase
        .from('chat_conversations')
        .update({
          assigned_agent_id: agent.id,
          conversation_status: 'with_agent',
          updated_at: new Date().toISOString(),
        })
        .eq('id', conversationId);

      if (convError) throw convError;

      // Increment agent's current conversations
      const { error: updateError } = await supabase
        .from('support_agents')
        .update({
          current_conversations: agent.current_conversations + 1,
          updated_at: new Date().toISOString(),
        })
        .eq('id', agent.id);

      if (updateError) throw updateError;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['support-assigned-conversations'] });
      queryClient.invalidateQueries({ queryKey: ['support-waiting-conversations'] });
      queryClient.invalidateQueries({ queryKey: ['support-agent'] });
    },
  });

  // Close a conversation
  const closeConversation = useMutation({
    mutationFn: async (conversationId: string) => {
      if (!user?.id) throw new Error('No user');

      // Get agent record
      const { data: agent, error: agentError } = await supabase
        .from('support_agents')
        .select('id, current_conversations')
        .eq('user_id', user.id)
        .maybeSingle();

      if (agentError) throw agentError;
      if (!agent) throw new Error('No agent record found');

      // Update conversation
      const { error: convError } = await supabase
        .from('chat_conversations')
        .update({
          conversation_status: 'closed',
          updated_at: new Date().toISOString(),
        })
        .eq('id', conversationId);

      if (convError) throw convError;

      // Decrement agent's current conversations
      if (agent.current_conversations > 0) {
        const { error: updateError } = await supabase
          .from('support_agents')
          .update({
            current_conversations: agent.current_conversations - 1,
            updated_at: new Date().toISOString(),
          })
          .eq('id', agent.id);

        if (updateError) throw updateError;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['support-assigned-conversations'] });
      queryClient.invalidateQueries({ queryKey: ['support-agent'] });
    },
  });

  // Other agents available as transfer targets (everyone but me, any status —
  // the picker shows status/load so the human makes the call).
  const { data: transferTargets } = useQuery({
    queryKey: ['support-transfer-targets', user?.id],
    queryFn: async () => {
      if (!user?.id) return [];
      const { data, error } = await supabase
        .from('support_agents')
        .select('id, user_id, status, current_conversations, max_conversations')
        .neq('user_id', user.id)
        .order('status');
      if (error) throw error;
      return data || [];
    },
    enabled: !!user?.id,
  });

  // Transfer a conversation to another agent (the reassign path the
  // support_assign_conversation skill uses — same columns, human surface).
  const transferConversation = useMutation({
    mutationFn: async ({ conversationId, agentId }: { conversationId: string; agentId: string }) => {
      if (!user?.id) throw new Error('No user');

      const { data: target, error: targetError } = await supabase
        .from('support_agents')
        .select('id, current_conversations')
        .eq('id', agentId)
        .maybeSingle();
      if (targetError) throw targetError;
      if (!target) throw new Error('Target agent not found');

      // Was it assigned to me? Then my counter should go down.
      const { data: conv, error: convFetchError } = await supabase
        .from('chat_conversations')
        .select('assigned_agent_id')
        .eq('id', conversationId)
        .maybeSingle();
      if (convFetchError) throw convFetchError;

      const { error: convError } = await supabase
        .from('chat_conversations')
        .update({
          assigned_agent_id: target.id,
          conversation_status: 'with_agent',
          updated_at: new Date().toISOString(),
        })
        .eq('id', conversationId);
      if (convError) throw convError;

      await supabase
        .from('support_agents')
        .update({
          current_conversations: target.current_conversations + 1,
          updated_at: new Date().toISOString(),
        })
        .eq('id', target.id);

      if (conv?.assigned_agent_id && conv.assigned_agent_id !== target.id) {
        const { data: prev } = await supabase
          .from('support_agents')
          .select('id, current_conversations')
          .eq('id', conv.assigned_agent_id)
          .maybeSingle();
        if (prev && prev.current_conversations > 0) {
          await supabase
            .from('support_agents')
            .update({
              current_conversations: prev.current_conversations - 1,
              updated_at: new Date().toISOString(),
            })
            .eq('id', prev.id);
        }
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['support-assigned-conversations'] });
      queryClient.invalidateQueries({ queryKey: ['support-waiting-conversations'] });
      queryClient.invalidateQueries({ queryKey: ['support-agent'] });
      queryClient.invalidateQueries({ queryKey: ['support-transfer-targets'] });
    },
  });

  // Reopen a previously-closed conversation → back to waiting queue, unassigned.
  const reopenConversation = useMutation({
    mutationFn: async (conversationId: string) => {
      const { error } = await supabase
        .from('chat_conversations')
        .update({
          conversation_status: 'waiting_agent',
          assigned_agent_id: null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', conversationId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['support-assigned-conversations'] });
      queryClient.invalidateQueries({ queryKey: ['support-waiting-conversations'] });
      queryClient.invalidateQueries({ queryKey: ['support-closed-conversations'] });
    },
  });

  return {
    assignedConversations: assignedConversations || [],
    waitingConversations: waitingConversations || [],
    escalatedConversations: escalatedConversations || [],
    isLoading: assignedLoading || waitingLoading || escalatedLoading,
    claimConversation,
    closeConversation,
    reopenConversation,
    transferConversation,
    transferTargets: transferTargets || [],
  };
}

// Closed/archived conversations with search.
export function useClosedConversations(search: string) {
  return useQuery({
    queryKey: ['support-closed-conversations', search],
    queryFn: async () => {
      let q = supabase
        .from('chat_conversations')
        .select('*')
        .eq('scope', 'visitor')
        .eq('conversation_status', 'closed')
        .order('updated_at', { ascending: false })
        .limit(100);

      const term = search.trim();
      if (term.length > 0) {
        const like = `%${term.replace(/[%_]/g, '\\$&')}%`;
        q = q.or(
          `customer_name.ilike.${like},customer_email.ilike.${like},title.ilike.${like},contact_phone.ilike.${like}`,
        );
      }

      const { data, error } = await q;
      if (error) throw error;
      return (data || []) as any[];
    },
  });
}


// Hook to get messages for a conversation
export function useConversationMessages(conversationId: string | null) {
  const queryClient = useQueryClient();
  const previousMessagesCountRef = useRef<number>(0);
  const isInitialLoadRef = useRef<boolean>(true);

  const { data: messages, isLoading } = useQuery({
    queryKey: ['conversation-messages', conversationId],
    queryFn: async () => {
      if (!conversationId) return [];

      const { data, error } = await supabase
        .from('chat_messages')
        .select('*')
        .eq('conversation_id', conversationId)
        .order('created_at', { ascending: true });

      if (error) throw error;
      return data as ChatMessage[];
    },
    enabled: !!conversationId,
  });

  // Track message count changes to play sound for new messages
  useEffect(() => {
    if (!messages) return;
    
    // Skip initial load
    if (isInitialLoadRef.current) {
      previousMessagesCountRef.current = messages.length;
      isInitialLoadRef.current = false;
      return;
    }
    
    // Check if new messages arrived (not from agent)
    if (messages.length > previousMessagesCountRef.current) {
      const newMessages = messages.slice(previousMessagesCountRef.current);
      const hasUserMessage = newMessages.some(m => m.role === 'user');
      
      if (hasUserMessage) {
        playNotificationSound();
      }
    }
    
    previousMessagesCountRef.current = messages.length;
  }, [messages]);

  // Reset refs when conversation changes
  useEffect(() => {
    isInitialLoadRef.current = true;
    previousMessagesCountRef.current = 0;
  }, [conversationId]);

  // Realtime subscription for new messages
  useEffect(() => {
    if (!conversationId) return;

    const channel = supabase
      .channel(`conversation-messages-${conversationId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'chat_messages',
          filter: `conversation_id=eq.${conversationId}`,
        },
        () => {
          queryClient.invalidateQueries({ queryKey: ['conversation-messages', conversationId] });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [conversationId, queryClient]);

  // Send a message as agent
  const sendMessage = useMutation({
    mutationFn: async (content: string) => {
      if (!conversationId) {
        logger.error('sendMessage: No conversation ID');
        throw new Error('No conversation selected');
      }

      logger.log('sendMessage: Sending to conversation', conversationId, 'content:', content);

      const { data, error } = await supabase.from('chat_messages').insert({
        conversation_id: conversationId,
        role: 'agent',
        content,
      }).select();

      if (error) {
        logger.error('sendMessage: Error inserting message', error);
        throw error;
      }

      logger.log('sendMessage: Message sent successfully', data);

      // Broadcast to the visitor widget. Realtime postgres_changes can't deliver
      // to anonymous visitors (RLS SELECT requires x-chat-session header, which
      // realtime doesn't carry), so we push via broadcast which bypasses RLS.
      try {
        const inserted = data?.[0];
        if (inserted) {
          const broadcastChannel = supabase.channel(`chat-broadcast-${conversationId}`, {
            config: { broadcast: { ack: true, self: false } },
          });
          await new Promise<void>((resolve, reject) => {
            const timer = setTimeout(() => reject(new Error('subscribe timeout')), 5000);
            broadcastChannel.subscribe((status) => {
              if (status === 'SUBSCRIBED') {
                clearTimeout(timer);
                resolve();
              } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
                clearTimeout(timer);
                reject(new Error(`subscribe ${status}`));
              }
            });
          });
          const sendResult = await broadcastChannel.send({
            type: 'broadcast',
            event: 'agent_message',
            payload: {
              id: inserted.id,
              role: 'agent',
              content,
              created_at: inserted.created_at,
            },
          });
          logger.log('sendMessage: broadcast result', sendResult);
          setTimeout(() => supabase.removeChannel(broadcastChannel), 1000);
        }
      } catch (e) {
        logger.error('sendMessage: broadcast failed', e);
      }


      // If this conversation lives on an external channel (e.g. Telegram, SMS), relay the
      // agent's reply back to that channel so the visitor actually receives it.
      try {
        const { data: conv } = await supabase
          .from('chat_conversations')
          .select('channel, visitor_profile')
          .eq('id', conversationId)
          .maybeSingle();
        const { data: { session } } = await supabase.auth.getSession();
        const token = session?.access_token ?? '';
        const apiKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
        const baseUrl = import.meta.env.VITE_SUPABASE_URL;

        if (conv?.channel === 'telegram') {
          const relayResp = await fetch(
            `${baseUrl}/functions/v1/telegram-ingest?action=send`,
            {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`,
                'apikey': apiKey,
              },
              body: JSON.stringify({
                conversation_id: conversationId,
                message_id: data?.[0]?.id,
                content,
              }),
            },
          );
          if (!relayResp.ok) {
            logger.error('sendMessage: telegram relay failed', await relayResp.text());
          }
        }

        if (conv?.channel === 'sms') {
          // Determine which SMS provider to use based on conversation visitor_profile.
          // Default = 46elks (Twilio kept as fallback for legacy threads tagged 'twilio').
          const smsProvider = (conv?.visitor_profile as any)?.sms_provider ?? 'elks46';
          const functionName =
            smsProvider === 'gatewayapi' ? 'gatewayapi-ingest'
            : smsProvider === 'twilio' ? 'twilio-ingest'
            : 'elks46-ingest';
          const relayResp = await fetch(
            `${baseUrl}/functions/v1/${functionName}?action=send`,
            {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`,
                'apikey': apiKey,
              },
              body: JSON.stringify({
                conversation_id: conversationId,
                message_id: data?.[0]?.id,
                content,
              }),
            },
          );
          if (!relayResp.ok) {
            logger.error(`sendMessage: ${smsProvider} relay failed`, await relayResp.text());
          }
        }

        // Voice / voicemail threads: an agent's reply goes out as an SMS to the
        // caller (e.g. "I'll call you back at 10:30"). The edge function gates
        // this on the Voice setting + a landline guard. When it declines, we drop
        // a visible system note into the thread so the agent is never misled into
        // thinking an undeliverable reply was sent.
        if (conv?.channel === 'voice') {
          const relayResp = await fetch(
            `${baseUrl}/functions/v1/elks46-ingest?action=send`,
            {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`,
                'apikey': apiKey,
              },
              body: JSON.stringify({
                conversation_id: conversationId,
                message_id: data?.[0]?.id,
                content,
              }),
            },
          );
          let notice: string | null = null;
          if (relayResp.ok) {
            const result = await relayResp.json().catch(() => ({} as any));
            if (result?.sms_sent === false) {
              notice = result.reason === 'landline'
                ? '⚠️ SMS-svaret skickades inte: uppringaren ringde från ett fast nummer som inte kan ta emot SMS. Ring upp istället.'
                : result.reason === 'sms_reply_disabled'
                  ? 'ℹ️ SMS-svar på röstmeddelanden är avstängt. Slå på det i Voice-inställningarna för att kunna svara via SMS.'
                  : '⚠️ SMS-svaret kunde inte skickas.';
            }
          } else {
            logger.error('sendMessage: voice SMS relay failed', await relayResp.text());
            notice = '⚠️ SMS-svaret kunde inte skickas (tekniskt fel).';
          }
          if (notice) {
            await supabase.from('chat_messages').insert({
              conversation_id: conversationId,
              role: 'system',
              content: notice,
            });
            queryClient.invalidateQueries({ queryKey: ['conversation-messages', conversationId] });
          }
        }
      } catch (relayErr) {
        logger.error('sendMessage: channel relay error', relayErr);
      }

      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['conversation-messages', conversationId] });
    },
    onError: (error) => {
      logger.error('sendMessage mutation error:', error);
    },
  });

  return {
    messages: messages || [],
    isLoading,
    sendMessage,
  };
}
