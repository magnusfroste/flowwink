import { useEffect, useRef } from 'react';
import { useChat } from '@/hooks/useChat';
import { useChatSettings } from '@/hooks/useSiteSettings';
import { ChatMessage } from './ChatMessage';
import { ChatInput } from './ChatInput';
import { ChatEmptyState } from './ChatEmptyState';
import { ChatTypingIndicator } from './ChatTypingIndicator';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ChatConversationProps {
  mode?: 'landing' | 'block' | 'widget';
  className?: string;
  conversationId?: string;
  onNewConversation?: (id: string) => void;
}

export function ChatConversation({ 
  mode = 'block', 
  className,
  conversationId,
  onNewConversation,
}: ChatConversationProps) {
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const { data: settings } = useChatSettings();
  
  const {
    messages,
    isLoading,
    error,
    sendMessage,
    cancelRequest,
  } = useChat({ conversationId, onNewConversation });

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isLoading]);

  const handlePromptClick = (prompt: string) => {
    sendMessage(prompt);
  };

  const showEmptyState = messages.length === 0 && !isLoading;
  const showTypingIndicator = isLoading && messages[messages.length - 1]?.role === 'user';

  return (
    <div className={cn(
      'flex flex-col h-full bg-background',
      mode === 'widget' && 'rounded-t-xl',
      className
    )}>
      {/* Messages area */}
      <div className="flex-1 overflow-y-auto">
        {showEmptyState ? (
          <ChatEmptyState
            title={settings?.title}
            welcomeMessage={settings?.welcomeMessage}
            onPromptClick={handlePromptClick}
          />
        ) : (
          <div className="py-2">
            {messages.map((message) => (
              <ChatMessage
                key={message.id}
                role={message.role}
                content={message.content}
                createdAt={message.createdAt}
              />
            ))}
            {showTypingIndicator && <ChatTypingIndicator />}
            <div ref={messagesEndRef} />
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
