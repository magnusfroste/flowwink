import { MessageSquare, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface ChatEmptyStateProps {
  title?: string;
  welcomeMessage?: string;
  suggestedPrompts?: string[];
  onPromptClick?: (prompt: string) => void;
}

const defaultPrompts = [
  'Vad kan du hjälpa mig med?',
  'Berätta mer om era tjänster',
  'Hur bokar jag en tid?',
];

export function ChatEmptyState({ 
  title = 'AI Assistant',
  welcomeMessage = 'Hi! How can I help you today?',
  suggestedPrompts = defaultPrompts,
  onPromptClick 
}: ChatEmptyStateProps) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center p-6 text-center">
      <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mb-6">
        <Sparkles className="w-8 h-8 text-primary" />
      </div>
      
      <h2 className="text-2xl font-serif font-semibold mb-2">{title}</h2>
      <p className="text-muted-foreground mb-8 max-w-md">{welcomeMessage}</p>
      
      {suggestedPrompts.length > 0 && (
        <div className="flex flex-col gap-2 w-full max-w-sm">
          {suggestedPrompts.map((prompt, index) => (
            <Button
              key={index}
              variant="outline"
              className="justify-start text-left h-auto py-3 px-4 rounded-xl hover:bg-primary/5 hover:border-primary/30"
              onClick={() => onPromptClick?.(prompt)}
            >
              <MessageSquare className="w-4 h-4 mr-3 flex-shrink-0 text-primary" />
              <span className="truncate">{prompt}</span>
            </Button>
          ))}
        </div>
      )}
    </div>
  );
}
