import { cn } from '@/lib/utils';
import { User, Bot, Copy, Check, Headphones } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { ChatFeedback } from './ChatFeedback';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';

interface AgentInfo {
  id: string;
  fullName: string | null;
  avatarUrl: string | null;
}

type LiveAgentIconStyle = 'avatar' | 'person' | 'headphones';

interface ChatMessageProps {
  role: 'user' | 'assistant';
  content: string;
  createdAt?: Date;
  messageId?: string;
  conversationId?: string;
  previousUserMessage?: string;
  showFeedback?: boolean;
  agentInfo?: AgentInfo | null;
  isFromAgent?: boolean; // True if this specific message is from a live agent
  liveAgentIconStyle?: LiveAgentIconStyle;
}

export function ChatMessage({ 
  role, 
  content, 
  createdAt,
  messageId,
  conversationId,
  previousUserMessage,
  showFeedback = true,
  agentInfo,
  isFromAgent = false,
  liveAgentIconStyle = 'avatar',
}: ChatMessageProps) {
  const [copied, setCopied] = useState(false);
  const isUser = role === 'user';

  const handleCopy = async () => {
    await navigator.clipboard.writeText(content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const renderAssistantAvatar = () => {
    // Only show live agent icon for messages actually from a live agent
    if (!isUser && isFromAgent) {
      switch (liveAgentIconStyle) {
        case 'avatar':
          if (agentInfo?.avatarUrl) {
            return (
              <Avatar className="h-8 w-8">
                <AvatarImage src={agentInfo.avatarUrl} alt={agentInfo.fullName || 'Agent'} />
                <AvatarFallback className="bg-primary/10 text-primary text-xs">
                  {agentInfo.fullName?.split(' ').map(n => n[0]).join('').slice(0, 2) || 'AG'}
                </AvatarFallback>
              </Avatar>
            );
          }
          // Fallback to person icon if no avatar URL
          return (
            <div className="flex-shrink-0 w-8 h-8 rounded-full bg-green-100 dark:bg-green-900/50 flex items-center justify-center">
              <User className="w-4 h-4 text-green-600 dark:text-green-400" />
            </div>
          );
        case 'person':
          return (
            <div className="flex-shrink-0 w-8 h-8 rounded-full bg-green-100 dark:bg-green-900/50 flex items-center justify-center">
              <User className="w-4 h-4 text-green-600 dark:text-green-400" />
            </div>
          );
        case 'headphones':
          return (
            <div className="flex-shrink-0 w-8 h-8 rounded-full bg-green-100 dark:bg-green-900/50 flex items-center justify-center">
              <Headphones className="w-4 h-4 text-green-600 dark:text-green-400" />
            </div>
          );
      }
    }
    
    // Default: AI/Bot icon
    return (
      <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
        <Bot className="w-4 h-4 text-primary" />
      </div>
    );
  };

  return (
    <div className={cn(
      'flex gap-3 py-4 px-4 group',
      isUser ? 'justify-end' : 'justify-start'
    )}>
      {!isUser && renderAssistantAvatar()}
      
      <div className={cn(
        'relative max-w-[80%] rounded-2xl px-4 py-3',
        isUser 
          ? 'bg-primary text-primary-foreground rounded-br-md' 
          : 'bg-muted rounded-bl-md'
      )}>
        <div className={cn(
          'prose prose-sm max-w-none',
          isUser && 'prose-invert'
        )}>
          {content.split('\n').map((line, i) => (
            <p key={i} className="mb-1 last:mb-0">
              {line || '\u00A0'}
            </p>
          ))}
        </div>
        
        {!isUser && content && (
          <div className="absolute -right-10 top-1 flex flex-col gap-1">
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity"
              onClick={handleCopy}
            >
              {copied ? (
                <Check className="h-3.5 w-3.5 text-green-500" />
              ) : (
                <Copy className="h-3.5 w-3.5" />
              )}
            </Button>
          </div>
        )}

        {/* Feedback buttons for assistant messages */}
        {!isUser && content && showFeedback && messageId && (
          <div className="mt-2 pt-2 border-t border-border/50">
            <ChatFeedback
              messageId={messageId}
              conversationId={conversationId}
              userQuestion={previousUserMessage}
              aiResponse={content}
            />
          </div>
        )}

        {createdAt && (
          <time className={cn(
            'text-[10px] mt-1 block',
            isUser ? 'text-primary-foreground/60' : 'text-muted-foreground'
          )}>
            {createdAt.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
          </time>
        )}
      </div>

      {isUser && (
        <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary flex items-center justify-center">
          <User className="w-4 h-4 text-primary-foreground" />
        </div>
      )}
    </div>
  );
}
