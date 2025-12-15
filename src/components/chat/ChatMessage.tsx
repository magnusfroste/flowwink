import { cn } from '@/lib/utils';
import { User, Bot, Copy, Check } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';

interface ChatMessageProps {
  role: 'user' | 'assistant';
  content: string;
  createdAt?: Date;
}

export function ChatMessage({ role, content, createdAt }: ChatMessageProps) {
  const [copied, setCopied] = useState(false);
  const isUser = role === 'user';

  const handleCopy = async () => {
    await navigator.clipboard.writeText(content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className={cn(
      'flex gap-3 py-4 px-4 group',
      isUser ? 'justify-end' : 'justify-start'
    )}>
      {!isUser && (
        <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
          <Bot className="w-4 h-4 text-primary" />
        </div>
      )}
      
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
          <Button
            variant="ghost"
            size="icon"
            className="absolute -right-10 top-1 h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity"
            onClick={handleCopy}
          >
            {copied ? (
              <Check className="h-3.5 w-3.5 text-green-500" />
            ) : (
              <Copy className="h-3.5 w-3.5" />
            )}
          </Button>
        )}

        {createdAt && (
          <time className={cn(
            'text-[10px] mt-1 block',
            isUser ? 'text-primary-foreground/60' : 'text-muted-foreground'
          )}>
            {createdAt.toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit' })}
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
