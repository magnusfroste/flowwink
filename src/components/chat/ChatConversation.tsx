import { useEffect, useRef, useState } from 'react';
import { useChat } from '@/hooks/useChat';
import { useChatSettings } from '@/hooks/useSiteSettings';
import { UnifiedChat } from './UnifiedChat';
import { LiveAgentIndicator } from './LiveAgentIndicator';
import { ChatLeadCapture } from './ChatLeadCapture';
import { supabase } from '@/integrations/supabase/client';
import { cn } from '@/lib/utils';
import { operatorText, operatorPrompts } from '@/lib/operator-text';
import { useUiText, useUiTextLanguage } from '@/lib/ui-text';

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

  const t = useUiText();
  const { lang, siteLang } = useUiTextLanguage();

  // Operatörens förslag är skrivna på sajtens eget språk — på andra språk
  // vinner packet. Delad regel (operatorPrompts) med ChatLauncherBlock.
  const localizedPrompts = operatorPrompts(settings?.suggestedPrompts, [
    t('chat.suggestion1', 'What can you help me with?'),
    t('chat.suggestion2', 'Tell me about your services'),
    t('chat.suggestion3', 'How do I book an appointment?'),
    t('chat.suggestion4', 'How do I get in touch?'),
  ], lang, siteLang);
  // Limit prompts if needed
  const suggestedPrompts = maxPrompts
    ? localizedPrompts.slice(0, maxPrompts)
    : localizedPrompts;

  return (
    <div className={cn(
      'flex flex-col h-full bg-background',
      mode === 'widget' && 'rounded-t-xl',
      className
    )}>
      {showLiveAgentBanner && <LiveAgentIndicator />}

      {showLeadCapture && <ChatLeadCapture conversationId={activeConversationId} />}

      {/* UnifiedChat är h-full = 100 % av FÖRÄLDERN — med bannern som syskon
          ovanför blir det 100 % + bannerhöjd och inputraden trycks under
          widgetkanten. flex-1 min-h-0 ger den resterande höjd i stället. */}
      <div className="flex-1 min-h-0">
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
          title: hideInternalTitle ? '' : (checkinId ? 'Profile Check-in' : operatorText(settings?.title, t('chat.assistantTitle', 'AI Assistant'), lang, siteLang)),
          welcomeMessage: checkinId
            ? 'Hi! Tell me about your latest project and I\'ll update your profile. You can also use voice input 🎙️'
            : operatorText(settings?.welcomeMessage, t('chat.welcome', 'Hi! How can I help you today?'), lang, siteLang),
          suggestedPrompts: checkinId
            ? ['Tell me about my latest project', 'I want to update my availability', 'What information do you need?']
            : suggestedPrompts,
          placeholder: checkinId ? 'Tell me about your latest project...' : operatorText(settings?.placeholder, t('chat.placeholder', 'Type your message...'), lang, siteLang),
          enabled: true,
          feedbackEnabled: checkinId ? false : (settings?.feedbackEnabled ?? true),
          showIcons: settings?.showChatIcons ?? true,
        }}
        conversationId={conversationId}
        compact={compact}
      />
      </div>
    </div>
  );
}
