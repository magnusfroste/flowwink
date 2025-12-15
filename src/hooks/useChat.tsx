import { useState, useCallback, useRef } from 'react';
import { useChatSettings } from './useSiteSettings';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  createdAt: Date;
}

interface UseChatOptions {
  conversationId?: string;
  onNewConversation?: (id: string) => void;
}

export function useChat(options?: UseChatOptions) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [conversationId, setConversationId] = useState<string | undefined>(options?.conversationId);
  const abortControllerRef = useRef<AbortController | null>(null);
  
  const { data: settings } = useChatSettings();
  const { user } = useAuth();

  const getSessionId = useCallback(() => {
    let sessionId = localStorage.getItem('chat-session-id');
    if (!sessionId) {
      sessionId = crypto.randomUUID();
      localStorage.setItem('chat-session-id', sessionId);
    }
    return sessionId;
  }, []);

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
        title: 'Ny konversation',
      })
      .select('id')
      .single();

    if (error) {
      console.error('Failed to create conversation:', error);
      return null;
    }

    setConversationId(data.id);
    options?.onNewConversation?.(data.id);
    return data.id;
  }, [user?.id, getSessionId, options]);

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
    if (!convId && settings?.saveConversations) {
      convId = await createConversation();
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
            sessionId: user?.id ? null : getSessionId(),
            settings: {
              aiProvider: settings?.aiProvider || 'lovable',
              lovableModel: settings?.lovableModel,
              localEndpoint: settings?.localEndpoint,
              localModel: settings?.localModel,
              localApiKey: settings?.localApiKey,
              n8nWebhookUrl: settings?.n8nWebhookUrl,
              systemPrompt: settings?.systemPrompt,
            },
          }),
          signal: abortControllerRef.current.signal,
        }
      );

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Kunde inte skicka meddelande');
      }

      if (!response.body) {
        throw new Error('Inget svar från servern');
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
      setError(err instanceof Error ? err.message : 'Ett fel uppstod');
      // Remove empty assistant message on error
      setMessages(prev => prev.filter(m => m.id !== assistantMessageId));
    } finally {
      setIsLoading(false);
      abortControllerRef.current = null;
    }
  }, [messages, conversationId, settings, user?.id, getSessionId, createConversation, saveMessage]);

  const cancelRequest = useCallback(() => {
    abortControllerRef.current?.abort();
    setIsLoading(false);
  }, []);

  const clearMessages = useCallback(() => {
    setMessages([]);
    setConversationId(undefined);
    setError(null);
  }, []);

  return {
    messages,
    isLoading,
    error,
    conversationId,
    sendMessage,
    cancelRequest,
    clearMessages,
  };
}
