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
        .in('conversation_status', ['with_agent', 'waiting_agent'])
        .order('updated_at', { ascending: false });

      if (error) throw error;
      return data as SupportConversation[];
    },
    enabled: !!user?.id,
  });

  // Get all waiting conversations (not assigned)
  const { data: waitingConversations, isLoading: waitingLoading } = useQuery({
    queryKey: ['support-waiting-conversations'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('chat_conversations')
        .select('*')
        .eq('conversation_status', 'waiting_agent')
        .is('assigned_agent_id', null)
        .order('priority', { ascending: false })
        .order('created_at', { ascending: true });

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
        .eq('conversation_status', 'escalated')
        .order('escalated_at', { ascending: false });

      if (error) throw error;
      return data as SupportConversation[];
    },
  });

  // Realtime subscription for conversation updates
  useEffect(() => {
    const channel = supabase
      .channel('support-conversations-realtime')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'chat_conversations',
        },
        () => {
          queryClient.invalidateQueries({ queryKey: ['support-assigned-conversations'] });
          queryClient.invalidateQueries({ queryKey: ['support-waiting-conversations'] });
          queryClient.invalidateQueries({ queryKey: ['support-escalated-conversations'] });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient]);

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

  return {
    assignedConversations: assignedConversations || [],
    waitingConversations: waitingConversations || [],
    escalatedConversations: escalatedConversations || [],
    isLoading: assignedLoading || waitingLoading || escalatedLoading,
    claimConversation,
    closeConversation,
  };
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
