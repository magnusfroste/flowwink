import { useEffect, useRef, useState } from 'react';
import { useChat } from '@/hooks/useChat';
import { useChatSettings } from '@/hooks/useSiteSettings';
import { UnifiedChat } from './UnifiedChat';
import { LiveAgentIndicator } from './LiveAgentIndicator';
import { ChatLeadCapture } from './ChatLeadCapture';
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
  checkinId?: string;
  /** Hide the chat's internal title (use when the parent already renders a heading) */
  hideInternalTitle?: boolean;
  /** Authenticated portal chat — send the user's JWT so the assistant grounds on their account (rung 2). */
  authenticated?: boolean;
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
  checkinId,
  hideInternalTitle = false,
  authenticated = false,
}: ChatConversationProps) {
  const initialMessageSentRef = useRef(false);
  const { data: settings } = useChatSettings();
  const [visitorSkills, setVisitorSkills] = useState<AgentSkill[]>([]);
  
  const {
    messages,
    isLoading,
    error,
    conversationId: activeConversationId,
    isWithLiveAgent,
    isClosed,
    agentInfo,
    sendMessage,
    cancelRequest,
    clearMessages,
  } = useChat({ conversationId, onNewConversation, skipRestore, checkinId, authenticated });

  // Load visitor-scoped skills for /commands
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

  // Lead capture: optional, settings-gated, only after the visitor has sent a
  // message, never in check-in mode. Dismissal/submission handled internally.
  const showLeadCapture =
    (settings?.leadCaptureEnabled ?? false) &&
    !checkinId &&
    messages.some((m) => m.role === 'user');

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

      {showLeadCapture && <ChatLeadCapture conversationId={activeConversationId} />}

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
          isClosed,
          onStartNew: clearMessages,
        }}
        visitorSettings={{
          title: hideInternalTitle ? '' : (checkinId ? 'Profile Check-in' : settings?.title),
          welcomeMessage: checkinId
            ? 'Hi! Tell me about your latest project and I\'ll update your profile. You can also use voice input 🎙️'
            : settings?.welcomeMessage,
          suggestedPrompts: checkinId
            ? ['Tell me about my latest project', 'I want to update my availability', 'What information do you need?']
            : suggestedPrompts,
          placeholder: checkinId ? 'Tell me about your latest project...' : settings?.placeholder,
          enabled: true,
          feedbackEnabled: checkinId ? false : (settings?.feedbackEnabled ?? true),
          showIcons: settings?.showChatIcons ?? true,
        }}
        conversationId={conversationId}
        compact={compact}
      />
    </div>
  );
}
