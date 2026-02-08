import { useState, useCallback, useRef, useEffect } from 'react';
import { useChatSettings } from './useSiteSettings';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  createdAt: Date;
  isFromAgent?: boolean; // True if message is from live agent (not AI)
}

export interface AgentInfo {
  id: string;
  fullName: string | null;
  avatarUrl: string | null;
}

interface UseChatOptions {
  conversationId?: string;
  onNewConversation?: (id: string) => void;
  skipRestore?: boolean;
}

const CONVERSATION_STORAGE_KEY = 'chat-conversation-id';

export function useChat(options?: UseChatOptions) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [conversationId, setConversationId] = useState<string | undefined>(options?.conversationId);
  const [initialized, setInitialized] = useState(false);
  const [isWithLiveAgent, setIsWithLiveAgent] = useState(false);
  const [agentInfo, setAgentInfo] = useState<AgentInfo | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  
  const { data: settings } = useChatSettings();
  const { user } = useAuth();

  // Sync conversationId from options prop
  useEffect(() => {
    if (options?.conversationId !== conversationId) {
      setConversationId(options?.conversationId);
      // Clear messages when switching conversations
      setMessages([]);
      setError(null);
    }
  }, [options?.conversationId, conversationId]);

  const getSessionId = useCallback(() => {
    let sessionId = localStorage.getItem('chat-session-id');
    if (!sessionId) {
      sessionId = crypto.randomUUID();
      localStorage.setItem('chat-session-id', sessionId);
    }
    return sessionId;
  }, []);

  // Restore conversation from localStorage on mount
  useEffect(() => {
    if (initialized || options?.conversationId || options?.skipRestore) {
      if (options?.skipRestore && !initialized) setInitialized(true);
      return;
    }
    
    const restoreConversation = async () => {
      // First try to get stored conversation ID
      const storedConvId = localStorage.getItem(CONVERSATION_STORAGE_KEY);
      
      if (storedConvId) {
        // Verify conversation still exists and belongs to this user/session
        const sessionId = getSessionId();
        const { data } = await supabase
          .from('chat_conversations')
          .select('id')
          .eq('id', storedConvId)
          .or(`user_id.eq.${user?.id || 'null'},session_id.eq.${sessionId}`)
          .single();
        
        if (data) {
          setConversationId(storedConvId);
          setInitialized(true);
          return;
        }
      }
      
      // If no stored conversation, try to find the most recent one
      const sessionId = getSessionId();
      const query = supabase
        .from('chat_conversations')
        .select('id')
        .order('updated_at', { ascending: false })
        .limit(1);
      
      if (user?.id) {
        query.eq('user_id', user.id);
      } else {
        query.eq('session_id', sessionId);
      }
      
      const { data } = await query.single();
      
      if (data) {
        setConversationId(data.id);
        localStorage.setItem(CONVERSATION_STORAGE_KEY, data.id);
      }
      
      setInitialized(true);
    };
    
    if (settings?.saveConversations) {
      restoreConversation();
    } else {
      setInitialized(true);
    }
  }, [settings?.saveConversations, user?.id, getSessionId, options?.conversationId, options?.skipRestore, initialized]);

  // Load existing messages when conversationId is set
  useEffect(() => {
    if (!conversationId) return;

    const loadMessages = async () => {
      const { data, error } = await supabase
        .from('chat_messages')
        .select('*')
        .eq('conversation_id', conversationId)
        .order('created_at', { ascending: true });

      if (!error && data) {
        setMessages(data.map(m => ({
          id: m.id,
          // Treat 'agent' role as 'assistant' for display
          role: (m.role === 'user' ? 'user' : 'assistant') as 'user' | 'assistant',
          content: m.content,
          createdAt: new Date(m.created_at),
          isFromAgent: m.role === 'agent', // Track if message is from live agent
        })));
      }
    };

    loadMessages();
  }, [conversationId]);

  // Track conversation status for live agent indicator
  useEffect(() => {
    if (!conversationId) {
      setIsWithLiveAgent(false);
      setAgentInfo(null);
      return;
    }

    const checkStatus = async () => {
      const { data } = await supabase
        .from('chat_conversations')
        .select('conversation_status, assigned_agent_id')
        .eq('id', conversationId)
        .single();
      
      const isWithAgent = !!data?.assigned_agent_id && 
        (data.conversation_status === 'with_agent' || data.conversation_status === 'waiting_agent');
      
      setIsWithLiveAgent(isWithAgent);
      
      // Fetch agent info separately if agent is assigned
      if (isWithAgent && data?.assigned_agent_id) {
        // First get the user_id from support_agents
        const { data: agentData } = await supabase
          .from('support_agents')
          .select('user_id')
          .eq('id', data.assigned_agent_id)
          .single();
        
        if (agentData?.user_id) {
          // Then fetch profile from public view (accessible without auth)
          const { data: profileData } = await supabase
            .from('profiles_public')
            .select('full_name, avatar_url')
            .eq('id', agentData.user_id)
            .single();
          
          setAgentInfo({
            id: agentData.user_id,
            fullName: profileData?.full_name || null,
            avatarUrl: profileData?.avatar_url || null,
          });
        } else {
          setAgentInfo(null);
        }
      } else {
        setAgentInfo(null);
      }
    };

    checkStatus();

    // Subscribe to conversation status changes
    const channel = supabase
      .channel(`chat-status-${conversationId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'chat_conversations',
          filter: `id=eq.${conversationId}`,
        },
        async (payload) => {
          const updated = payload.new as {
            conversation_status: string;
            assigned_agent_id: string | null;
          };
          
          const isWithAgent = !!updated.assigned_agent_id && 
            (updated.conversation_status === 'with_agent' || updated.conversation_status === 'waiting_agent');
          
          setIsWithLiveAgent(isWithAgent);
          
          // Fetch agent info when agent is assigned
          if (isWithAgent && updated.assigned_agent_id) {
            const { data: agentData } = await supabase
              .from('support_agents')
              .select(`
                user_id,
                profiles!support_agents_user_id_fkey (
                  full_name,
                  avatar_url
                )
              `)
              .eq('id', updated.assigned_agent_id)
              .single();
            
            if (agentData?.profiles) {
              const profiles = agentData.profiles as { full_name: string | null; avatar_url: string | null };
              setAgentInfo({
                id: agentData.user_id,
                fullName: profiles.full_name || null,
                avatarUrl: profiles.avatar_url || null,
              });
            }
          } else {
            setAgentInfo(null);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [conversationId]);

  // Realtime subscription for agent messages
  useEffect(() => {
    if (!conversationId || !settings?.saveConversations) return;

    const channel = supabase
      .channel(`chat-${conversationId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'chat_messages',
          filter: `conversation_id=eq.${conversationId}`,
        },
        (payload) => {
          const newMessage = payload.new as {
            id: string;
            role: string;
            content: string;
            created_at: string;
          };

          // Only add messages from agent (not user or assistant - those are added locally)
          if (newMessage.role === 'agent') {
            setMessages(prev => {
              // Check if message already exists
              if (prev.some(m => m.id === newMessage.id)) return prev;
              
              return [...prev, {
                id: newMessage.id,
                role: 'assistant' as const,
                content: newMessage.content,
                createdAt: new Date(newMessage.created_at),
                isFromAgent: true, // This message is from live agent
              }];
            });
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [conversationId, settings?.saveConversations]);

  const saveMessage = useCallback(async (
    convId: string,
    role: 'user' | 'assistant',
    content: string
  ) => {
    if (!settings?.saveConversations) return;

    try {
      await supabase.from('chat_messages').insert({
        conversation_id: convId,
        role,
        content,
      });
    } catch (err) {
      console.error('Failed to save message:', err);
    }
  }, [settings?.saveConversations]);

  const createConversation = useCallback(async () => {
    const sessionId = getSessionId();
    
    const { data, error } = await supabase
      .from('chat_conversations')
      .insert({
        user_id: user?.id || null,
        session_id: user?.id ? null : sessionId,
        title: 'New conversation',
      })
      .select('id')
      .single();

    if (error) {
      console.error('Failed to create conversation:', error);
      return null;
    }

    setConversationId(data.id);
    // Persist conversation ID to localStorage
    localStorage.setItem(CONVERSATION_STORAGE_KEY, data.id);
    options?.onNewConversation?.(data.id);
    return data.id;
  }, [user?.id, getSessionId, options]);

  const updateConversationTitle = useCallback(async (convId: string, content: string) => {
    // Extract first few words from content
    const words = content.trim().split(/\s+/).slice(0, 5);
    let title = words.join(' ');
    
    // Truncate with ellipsis if too long
    if (content.length > 50) {
      title = content.substring(0, 47) + '...';
    }
    
    await supabase
      .from('chat_conversations')
      .update({ title })
      .eq('id', convId);
  }, []);

  const sendMessage = useCallback(async (content: string) => {
    if (!content.trim() || isLoading) return;
    
    setError(null);
    setIsLoading(true);

    // Create user message
    const userMessage: ChatMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      content: content.trim(),
      createdAt: new Date(),
    };

    setMessages(prev => [...prev, userMessage]);

    // Ensure we have a conversation
    let convId = conversationId;
    const isFirstMessage = messages.length === 0;
    if (!convId && settings?.saveConversations) {
      convId = await createConversation();
    }

    // Update conversation title on first message
    if (isFirstMessage && convId) {
      await updateConversationTitle(convId, content.trim());
    }

    // Save user message
    if (convId) {
      await saveMessage(convId, 'user', content.trim());
    }

    // Prepare assistant message placeholder
    const assistantMessageId = crypto.randomUUID();
    let assistantContent = '';

    try {
      abortControllerRef.current = new AbortController();

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/chat-completion`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
          },
          body: JSON.stringify({
            messages: [...messages, userMessage].map(m => ({
              role: m.role,
              content: m.content,
            })),
            conversationId: convId,
            sessionId: getSessionId(),
          settings: {
              aiProvider: settings?.aiProvider || 'openai',
              // Only send if actually configured (not empty string) - let edge function use Integration config
              localEndpoint: settings?.localEndpoint || undefined,
              localModel: settings?.localModel || undefined,
              n8nWebhookUrl: settings?.n8nWebhookUrl || undefined,
              n8nWebhookType: settings?.n8nWebhookType || 'chat',
              systemPrompt: settings?.systemPrompt,
              includeContentAsContext: settings?.includeContentAsContext,
              contentContextMaxTokens: settings?.contentContextMaxTokens,
              includedPageSlugs: settings?.includedPageSlugs || [],
              includeKbArticles: settings?.includeKbArticles || false,
              // Tool calling settings
              toolCallingEnabled: settings?.toolCallingEnabled || false,
              firecrawlSearchEnabled: settings?.firecrawlSearchEnabled || false,
              humanHandoffEnabled: settings?.humanHandoffEnabled || false,
              sentimentDetectionEnabled: settings?.sentimentDetectionEnabled || false,
              sentimentThreshold: settings?.sentimentThreshold || 7,
              localSupportsToolCalling: settings?.localSupportsToolCalling || false,
              // General knowledge
              allowGeneralKnowledge: settings?.allowGeneralKnowledge || false,
            },
          }),
          signal: abortControllerRef.current.signal,
        }
      );

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Could not send message');
      }

      // Check if AI skipped the response (e.g., live agent is handling)
      const contentType = response.headers.get('content-type');
      if (contentType?.includes('application/json')) {
        const jsonData = await response.json();
        if (jsonData.skipped) {
          console.log('AI response skipped:', jsonData.reason);
          // Don't add an assistant message - live agent will respond
          setIsLoading(false);
          return;
        }
      }

      if (!response.body) {
        throw new Error('No response from server');
      }

      // Stream the response
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let textBuffer = '';

      // Add empty assistant message
      setMessages(prev => [...prev, {
        id: assistantMessageId,
        role: 'assistant',
        content: '',
        createdAt: new Date(),
      }]);

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        textBuffer += decoder.decode(value, { stream: true });

        // Process line-by-line
        let newlineIndex: number;
        while ((newlineIndex = textBuffer.indexOf('\n')) !== -1) {
          let line = textBuffer.slice(0, newlineIndex);
          textBuffer = textBuffer.slice(newlineIndex + 1);

          if (line.endsWith('\r')) line = line.slice(0, -1);
          if (line.startsWith(':') || line.trim() === '') continue;
          if (!line.startsWith('data: ')) continue;

          const jsonStr = line.slice(6).trim();
          if (jsonStr === '[DONE]') break;

          try {
            const parsed = JSON.parse(jsonStr);
            const deltaContent = parsed.choices?.[0]?.delta?.content;
            if (deltaContent) {
              assistantContent += deltaContent;
              setMessages(prev => 
                prev.map(m => 
                  m.id === assistantMessageId 
                    ? { ...m, content: assistantContent }
                    : m
                )
              );
            }
          } catch {
            // Incomplete JSON, wait for more data
            textBuffer = line + '\n' + textBuffer;
            break;
          }
        }
      }

      // Save assistant message
      if (convId && assistantContent) {
        await saveMessage(convId, 'assistant', assistantContent);
      }

    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        // User cancelled
        return;
      }
      console.error('Chat error:', err);
      setError(err instanceof Error ? err.message : 'An error occurred');
      // Remove empty assistant message on error
      setMessages(prev => prev.filter(m => m.id !== assistantMessageId));
    } finally {
      setIsLoading(false);
      abortControllerRef.current = null;
    }
  }, [messages, conversationId, settings, getSessionId, createConversation, saveMessage, isLoading, updateConversationTitle]);

  const cancelRequest = useCallback(() => {
    abortControllerRef.current?.abort();
    setIsLoading(false);
  }, []);

  const clearMessages = useCallback(() => {
    setMessages([]);
    setConversationId(undefined);
    setError(null);
    // Clear stored conversation ID to start fresh
    localStorage.removeItem(CONVERSATION_STORAGE_KEY);
  }, []);

  return {
    messages,
    isLoading,
    error,
    conversationId,
    isWithLiveAgent,
    agentInfo,
    sendMessage,
    cancelRequest,
    clearMessages,
  };
}
