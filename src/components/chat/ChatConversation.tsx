import { useEffect, useRef, useState } from 'react';
import { useChat } from '@/hooks/useChat';
import { useChatSettings } from '@/hooks/useSiteSettings';
import { UnifiedChat } from './UnifiedChat';
import { LiveAgentIndicator } from './LiveAgentIndicator';
import { supabase } from '@/integrations/supabase/client';
import { cn } from '@/lib/utils';
import type { AgentSkill } from '@/types/agent';

interface ChatConversationProps {
  mode?: 'landing' | 'block' | 'widget';
  className?: string;
  conversationId?: string;
  onNewConversation?: (id: string) => void;
  maxPrompts?: number;
  compact?: boolean;
  skipRestore?: boolean;
  initialMessage?: string;
  onInitialMessageSent?: () => void;
}

export function ChatConversation({ 
  mode = 'block', 
  className,
  conversationId,
  onNewConversation,
  maxPrompts,
  compact = false,
  skipRestore = false,
  initialMessage,
  onInitialMessageSent,
}: ChatConversationProps) {
  const initialMessageSentRef = useRef(false);
  const { data: settings } = useChatSettings();
  const [visitorSkills, setVisitorSkills] = useState<AgentSkill[]>([]);
  
  const {
    messages,
    isLoading,
    error,
    isWithLiveAgent,
    agentInfo,
    sendMessage,
    cancelRequest,
  } = useChat({ conversationId, onNewConversation, skipRestore });

  // Load visitor-scoped skills for @-commands
  useEffect(() => {
    const loadSkills = async () => {
      const { data } = await supabase
        .from('agent_skills')
        .select('*')
        .eq('enabled', true)
        .in('scope', ['external', 'both']);
      if (data) setVisitorSkills(data as unknown as AgentSkill[]);
    };
    loadSkills();
  }, []);

  // Auto-send initial message
  useEffect(() => {
    if (initialMessage && !initialMessageSentRef.current && !isLoading && messages.length === 0) {
      initialMessageSentRef.current = true;
      sendMessage(initialMessage);
      onInitialMessageSent?.();
    }
  }, [initialMessage, isLoading, messages.length, sendMessage, onInitialMessageSent]);

  const showLiveAgentBanner = (settings?.showLiveAgentBanner ?? true) && isWithLiveAgent;

  // Limit prompts if needed
  const suggestedPrompts = maxPrompts 
    ? settings?.suggestedPrompts?.slice(0, maxPrompts) 
    : settings?.suggestedPrompts;

  return (
    <div className={cn(
      'flex flex-col h-full bg-background',
      mode === 'widget' && 'rounded-t-xl',
      className
    )}>
      {showLiveAgentBanner && <LiveAgentIndicator />}
      
      <UnifiedChat
        scope="visitor"
        skills={visitorSkills}
        visitorChat={{
          messages: messages.map(m => ({
            id: m.id,
            role: m.role,
            content: m.content,
            createdAt: m.createdAt,
            isFromAgent: m.isFromAgent,
          })),
          isLoading,
          error,
          sendMessage,
          cancelRequest,
        }}
        visitorSettings={{
          title: settings?.title,
          welcomeMessage: settings?.welcomeMessage,
          suggestedPrompts,
          placeholder: settings?.placeholder,
          enabled: settings?.enabled,
          feedbackEnabled: settings?.feedbackEnabled ?? true,
        }}
        conversationId={conversationId}
        compact={compact}
      />
    </div>
  );
}
