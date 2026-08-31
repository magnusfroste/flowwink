import { MessageSquare, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useUiText } from '@/lib/ui-text';

interface ChatEmptyStateProps {
  title?: string;
  welcomeMessage?: string;
  suggestedPrompts?: string[];
  onPromptClick?: (prompt: string) => void;
  maxPrompts?: number;
  compact?: boolean;
}

export function ChatEmptyState({
  title,
  welcomeMessage,
  suggestedPrompts,
  onPromptClick,
  maxPrompts,
  compact = false,
}: ChatEmptyStateProps) {
  const t = useUiText();
  const shownTitle = title ?? t('chat.assistantTitle', 'AI Assistant');
  const shownWelcome = welcomeMessage ?? t('chat.welcome', 'Hi! How can I help you today?');
  const prompts = suggestedPrompts ?? [
    t('chat.suggestion1', 'What can you help me with?'),
    t('chat.suggestion2', 'Tell me about your services'),
    t('chat.suggestion3', 'How do I book an appointment?'),
  ];
  // Limit prompts if maxPrompts is specified
  const visiblePrompts = maxPrompts
    ? prompts.slice(0, maxPrompts)
    : prompts;

  return (
    <div className={cn(
      'flex-1 flex flex-col items-center justify-center p-6 text-center',
      compact && 'p-4'
    )}>
      <div className={cn(
        'w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mb-6',
        compact && 'w-12 h-12 mb-4'
      )}>
        <Sparkles className={cn('w-8 h-8 text-primary', compact && 'w-6 h-6')} />
      </div>
      
      <h2 className={cn(
        'text-2xl font-serif font-semibold mb-2',
        compact && 'text-lg mb-1'
      )}>
        {shownTitle}
      </h2>
      <p className={cn(
        'text-muted-foreground mb-4 max-w-md',
        compact && 'text-sm mb-3'
      )}>
        {shownWelcome}
      </p>

      {visiblePrompts.length > 0 && (
        <div className={cn(
          'flex flex-col gap-2 w-full max-w-sm',
          compact && 'gap-1.5'
        )}>
          {visiblePrompts.map((prompt, index) => (
            <Button
              key={index}
              variant="outline"
              className={cn(
                'justify-start text-left h-auto py-3 px-4 rounded-xl hover:bg-primary/5 hover:border-primary/30',
                compact && 'py-2 px-3 text-sm rounded-lg'
              )}
              onClick={() => onPromptClick?.(prompt)}
            >
              <MessageSquare className={cn(
                'w-4 h-4 mr-3 flex-shrink-0 text-primary',
                compact && 'w-3.5 h-3.5 mr-2'
              )} />
              <span className="truncate">{prompt}</span>
            </Button>
          ))}
        </div>
      )}
    </div>
  );
}

