import { useEffect, useRef } from 'react';
import { useChat } from '@/hooks/useChat';
import { useChatSettings } from '@/hooks/useSiteSettings';
import { ChatMessage } from './ChatMessage';
import { ChatInput } from './ChatInput';
import { ChatEmptyState } from './ChatEmptyState';
import { ChatTypingIndicator } from './ChatTypingIndicator';
import { LiveAgentIndicator } from './LiveAgentIndicator';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ChatConversationProps {
  mode?: 'landing' | 'block' | 'widget';
  className?: string;
  conversationId?: string;
  onNewConversation?: (id: string) => void;
  maxPrompts?: number;
  compact?: boolean;
}

export function ChatConversation({ 
  mode = 'block', 
  className,
  conversationId,
  onNewConversation,
  maxPrompts,
  compact = false,
}: ChatConversationProps) {
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const { data: settings } = useChatSettings();
  
  const {
    messages,
    isLoading,
    error,
    isWithLiveAgent,
    agentInfo,
    sendMessage,
    cancelRequest,
  } = useChat({ conversationId, onNewConversation });

  // Auto-scroll within the chat container (not the whole page)
  useEffect(() => {
    const container = scrollContainerRef.current;
    if (container) {
      container.scrollTo({
        top: container.scrollHeight,
        behavior: 'smooth',
      });
    }
  }, [messages, isLoading]);

  const handlePromptClick = (prompt: string) => {
    sendMessage(prompt);
  };

  const showEmptyState = messages.length === 0 && !isLoading;
  const showTypingIndicator = isLoading && messages[messages.length - 1]?.role === 'user';
  const showFeedback = settings?.feedbackEnabled ?? true;
  const showAgentAvatar = (settings?.showAgentAvatar ?? true) && isWithLiveAgent;

  return (
    <div className={cn(
      'flex flex-col h-full bg-background',
      mode === 'widget' && 'rounded-t-xl',
      className
    )}>
      {/* Live agent indicator */}
      {isWithLiveAgent && <LiveAgentIndicator />}
      
      {/* Messages area */}
      <div ref={scrollContainerRef} className="flex-1 overflow-y-auto">
        {showEmptyState ? (
          <ChatEmptyState
            title={settings?.title}
            welcomeMessage={settings?.welcomeMessage}
            suggestedPrompts={settings?.suggestedPrompts}
            onPromptClick={handlePromptClick}
            maxPrompts={maxPrompts}
            compact={compact}
          />
        ) : (
          <div className="py-2">
            {messages.map((message, index) => {
              // Find the previous user message for context
              const previousUserMessage = message.role === 'assistant' 
                ? messages.slice(0, index).reverse().find(m => m.role === 'user')?.content
                : undefined;
              
              return (
                <ChatMessage
                  key={message.id}
                  role={message.role}
                  content={message.content}
                  createdAt={message.createdAt}
                  messageId={message.id}
                  conversationId={conversationId}
                  previousUserMessage={previousUserMessage}
                  showFeedback={showFeedback && message.role === 'assistant' && !!message.content}
                  agentInfo={agentInfo}
                  showAgentAvatar={showAgentAvatar}
                />
              );
            })}
            {showTypingIndicator && <ChatTypingIndicator />}
          </div>
        )}
      </div>

      {/* Error display */}
      {error && (
        <div className="px-4 pb-2">
          <Alert variant="destructive" className="py-2">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        </div>
      )}

      {/* Input area */}
      <ChatInput
        onSend={sendMessage}
        onCancel={cancelRequest}
        isLoading={isLoading}
        placeholder={settings?.placeholder}
        disabled={!settings?.enabled}
      />
    </div>
  );
}
