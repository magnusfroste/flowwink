import { MessageSquare, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ChatContextIndicator } from './ChatContextIndicator';
import { cn } from '@/lib/utils';

interface ChatEmptyStateProps {
  title?: string;
  welcomeMessage?: string;
  suggestedPrompts?: string[];
  onPromptClick?: (prompt: string) => void;
  maxPrompts?: number;
  compact?: boolean;
}

const defaultPrompts = [
  'What can you help me with?',
  'Tell me about your services',
  'How do I book an appointment?',
];

export function ChatEmptyState({ 
  title = 'AI Assistant',
  welcomeMessage = 'Hi! How can I help you today?',
  suggestedPrompts = defaultPrompts,
  onPromptClick,
  maxPrompts,
  compact = false,
}: ChatEmptyStateProps) {
  // Limit prompts if maxPrompts is specified
  const visiblePrompts = maxPrompts 
    ? suggestedPrompts.slice(0, maxPrompts) 
    : suggestedPrompts;

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
        {title}
      </h2>
      <p className={cn(
        'text-muted-foreground mb-4 max-w-md',
        compact && 'text-sm mb-3'
      )}>
        {welcomeMessage}
      </p>

      {/* Context indicator */}
      <ChatContextIndicator variant="compact" className="mb-6" />
      
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

