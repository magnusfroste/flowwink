import { cn } from '@/lib/utils';
import { User, Bot, Copy, Check, Headphones } from 'lucide-react';
import { useState, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { ChatFeedback } from './ChatFeedback';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';

// Simple markdown parser for chat messages
function parseMarkdown(text: string): string {
  return text
    // Code blocks (must be before inline code)
    .replace(/```(\w*)\n?([\s\S]*?)```/g, '<pre><code class="language-$1">$2</code></pre>')
    // Inline code
    .replace(/`([^`]+)`/g, '<code class="bg-muted-foreground/20 px-1 py-0.5 rounded text-sm">$1</code>')
    // Bold
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    // Italic
    .replace(/\*([^*]+)\*/g, '<em>$1</em>')
    // Links
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer" class="text-primary underline">$1</a>')
    // Line breaks
    .replace(/\n/g, '<br />');
}

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
  showIcons?: boolean; // Whether to show avatars/icons in chat
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
  showIcons = true,
}: ChatMessageProps) {
  const [copied, setCopied] = useState(false);
  const isUser = role === 'user';

  const parsedContent = useMemo(() => parseMarkdown(content), [content]);

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
            <div className="flex-shrink-0 w-8 h-8 rounded-full bg-success/10 flex items-center justify-center">
              <User className="w-4 h-4 text-success" />
            </div>
          );
        case 'person':
          return (
            <div className="flex-shrink-0 w-8 h-8 rounded-full bg-success/10 flex items-center justify-center">
              <User className="w-4 h-4 text-success" />
            </div>
          );
        case 'headphones':
          return (
            <div className="flex-shrink-0 w-8 h-8 rounded-full bg-success/10 flex items-center justify-center">
              <Headphones className="w-4 h-4 text-success" />
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
      {!isUser && showIcons && renderAssistantAvatar()}
      
      <div className={cn(
        'relative max-w-[80%]',
        isUser 
          ? 'bg-primary text-primary-foreground rounded-2xl rounded-br-md px-4 py-3' 
          : 'text-foreground'
      )}>
        <div 
          className={cn(
            'prose prose-sm max-w-none',
            isUser ? 'prose-invert' : 'prose-neutral dark:prose-invert',
            '[&_pre]:bg-muted-foreground/10 [&_pre]:p-2 [&_pre]:rounded [&_pre]:overflow-x-auto [&_pre]:my-2',
            '[&_code]:text-inherit'
          )}
          dangerouslySetInnerHTML={{ __html: parsedContent }}
        />
        
        {!isUser && content && (
          <div className="absolute -right-10 top-1 flex flex-col gap-1">
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity text-foreground"
              onClick={handleCopy}
            >
              {copied ? (
                <Check className="h-3.5 w-3.5 text-success" />
              ) : (
                <Copy className="h-3.5 w-3.5" />
              )}
            </Button>
          </div>
        )}

        {/* Feedback buttons for assistant messages */}
        {!isUser && content && showFeedback && messageId && (
          <div className="mt-2 pt-2 border-t border-border/30">
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

      {isUser && showIcons && (
        <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary flex items-center justify-center">
          <User className="w-4 h-4 text-primary-foreground" />
        </div>
      )}
    </div>
  );
}
