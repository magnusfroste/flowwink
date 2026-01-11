import { useRef, useEffect } from 'react';
import { Sparkles, Check, X, ArrowUp, Loader2 } from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import type { CopilotMessage, ModuleRecommendation } from '@/hooks/useCopilot';
import { defaultModulesSettings } from '@/hooks/useModules';
import { useState } from 'react';

interface CopilotChatProps {
  messages: CopilotMessage[];
  isLoading: boolean;
  onSendMessage: (message: string) => void;
  onCancel: () => void;
  moduleRecommendation: ModuleRecommendation | null;
  onAcceptModules: () => void;
  onRejectModules: () => void;
}

const WELCOME_MESSAGE = `Tell me about your business and I'll help you build the perfect website. What's your company name and what do you do?`;

const STARTER_PROMPTS = [
  'Beauty salon',
  'Consulting agency',
  'Restaurant',
  'E-commerce store',
];

export function CopilotChat({
  messages,
  isLoading,
  onSendMessage,
  onCancel,
  moduleRecommendation,
  onAcceptModules,
  onRejectModules,
}: CopilotChatProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [input, setInput] = useState('');

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, isLoading]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (input.trim() && !isLoading) {
      onSendMessage(input.trim());
      setInput('');
    }
  };

  const isEmpty = messages.length === 0;

  return (
    <div className="flex flex-col h-full">
      <ScrollArea className="flex-1">
        <div className="p-4 space-y-4">
          {/* Welcome state */}
          {isEmpty && (
            <div className="space-y-6 py-8">
              <div className="text-center space-y-2">
                <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-primary/10 mb-2">
                  <Sparkles className="w-6 h-6 text-primary" />
                </div>
                <h3 className="font-medium">What are we building?</h3>
                <p className="text-sm text-muted-foreground max-w-sm mx-auto">
                  {WELCOME_MESSAGE}
                </p>
              </div>

              <div className="flex flex-wrap justify-center gap-2">
                {STARTER_PROMPTS.map((prompt) => (
                  <Button
                    key={prompt}
                    variant="outline"
                    size="sm"
                    onClick={() => onSendMessage(`I run a ${prompt.toLowerCase()}`)}
                    className="text-xs"
                  >
                    {prompt}
                  </Button>
                ))}
              </div>
            </div>
          )}

          {/* Messages - minimal design without avatars */}
          {messages.map((message) => (
            <div
              key={message.id}
              className={cn(
                'text-sm',
                message.role === 'user' ? 'text-right' : 'text-left'
              )}
            >
              <div
                className={cn(
                  'inline-block max-w-[85%] rounded-2xl px-4 py-2.5',
                  message.role === 'user'
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-muted'
                )}
              >
                <div className="whitespace-pre-wrap">{message.content}</div>
                
                {message.toolCall && (
                  <Badge variant="secondary" className="mt-2 text-xs opacity-70">
                    {message.toolCall.name.replace(/_/g, ' ')}
                  </Badge>
                )}
              </div>
            </div>
          ))}

          {/* Module recommendation */}
          {moduleRecommendation && moduleRecommendation.status === 'pending' && (
            <ModuleRecommendationCard
              recommendation={moduleRecommendation}
              onAccept={onAcceptModules}
              onReject={onRejectModules}
            />
          )}

          {/* Loading state */}
          {isLoading && (
            <div className="text-left">
              <div className="inline-flex items-center gap-2 bg-muted rounded-2xl px-4 py-2.5 text-sm text-muted-foreground">
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                <span>Thinking...</span>
              </div>
            </div>
          )}

          <div ref={scrollRef} />
        </div>
      </ScrollArea>

      {/* Minimal input */}
      <div className="p-4 border-t bg-background">
        <form onSubmit={handleSubmit} className="flex gap-2">
          <Input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Describe your business..."
            disabled={isLoading}
            className="flex-1"
          />
          <Button 
            type="submit" 
            size="icon" 
            disabled={!input.trim() || isLoading}
          >
            {isLoading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <ArrowUp className="h-4 w-4" />
            )}
          </Button>
        </form>
        <div className="flex justify-end mt-2">
          <Button variant="ghost" size="sm" onClick={onCancel} className="text-xs text-muted-foreground">
            Cancel
          </Button>
        </div>
      </div>
    </div>
  );
}

function ModuleRecommendationCard({
  recommendation,
  onAccept,
  onReject,
}: {
  recommendation: ModuleRecommendation;
  onAccept: () => void;
  onReject: () => void;
}) {
  return (
    <Card className="p-4 border-primary/30 bg-primary/5">
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-primary" />
          <span className="font-medium text-sm">Recommended modules</span>
        </div>
        
        <p className="text-xs text-muted-foreground">{recommendation.reason}</p>

        <div className="flex flex-wrap gap-1.5">
          {recommendation.modules.map((moduleId) => {
            const module = defaultModulesSettings[moduleId];
            return (
              <Badge key={moduleId} variant="secondary" className="text-xs">
                {module?.name || moduleId}
              </Badge>
            );
          })}
        </div>

        <div className="flex gap-2 pt-1">
          <Button size="sm" onClick={onAccept} className="flex-1">
            <Check className="h-3.5 w-3.5 mr-1.5" />
            Activate
          </Button>
          <Button size="sm" variant="outline" onClick={onReject}>
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>
    </Card>
  );
}
