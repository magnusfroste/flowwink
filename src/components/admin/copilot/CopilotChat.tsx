import { useRef, useEffect } from 'react';
import { Bot, Sparkles, Check, X } from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ChatInput } from '@/components/chat/ChatInput';
import { ChatTypingIndicator } from '@/components/chat/ChatTypingIndicator';
import { cn } from '@/lib/utils';
import type { CopilotMessage, ModuleRecommendation } from '@/hooks/useCopilot';
import { defaultModulesSettings } from '@/hooks/useModules';

interface CopilotChatProps {
  messages: CopilotMessage[];
  isLoading: boolean;
  onSendMessage: (message: string) => void;
  onCancel: () => void;
  moduleRecommendation: ModuleRecommendation | null;
  onAcceptModules: () => void;
  onRejectModules: () => void;
}

const WELCOME_MESSAGE = `Hej! 👋 Jag är din Copilot och hjälper dig bygga din webbplats.

Berätta lite om din verksamhet:
• Vad heter ditt företag?
• Vilken bransch är ni i?
• Vilka tjänster eller produkter erbjuder ni?

Baserat på dina svar kommer jag att rekommendera moduler och skapa block för din sida.`;

const STARTER_PROMPTS = [
  'Jag driver en skönhetssalong',
  'Vi är en konsultbyrå',
  'Jag har en restaurang',
  'Vi säljer produkter online',
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

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, isLoading]);

  const isEmpty = messages.length === 0;

  return (
    <div className="flex flex-col h-full">
      <ScrollArea className="flex-1 px-4">
        <div className="py-6 space-y-4">
          {/* Welcome message */}
          {isEmpty && (
            <div className="space-y-6">
              <div className="flex gap-3">
                <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                  <Bot className="w-4 h-4 text-primary" />
                </div>
                <div className="flex-1 bg-muted rounded-2xl rounded-bl-md px-4 py-3">
                  <div className="prose prose-sm max-w-none">
                    {WELCOME_MESSAGE.split('\n').map((line, i) => (
                      <p key={i} className="mb-1 last:mb-0">
                        {line || '\u00A0'}
                      </p>
                    ))}
                  </div>
                </div>
              </div>

              {/* Starter prompts */}
              <div className="flex flex-wrap gap-2 pl-11">
                {STARTER_PROMPTS.map((prompt) => (
                  <Button
                    key={prompt}
                    variant="outline"
                    size="sm"
                    onClick={() => onSendMessage(prompt)}
                    className="text-xs"
                  >
                    <Sparkles className="h-3 w-3 mr-1.5" />
                    {prompt}
                  </Button>
                ))}
              </div>
            </div>
          )}

          {/* Messages */}
          {messages.map((message) => (
            <MessageBubble key={message.id} message={message} />
          ))}

          {/* Module recommendation card */}
          {moduleRecommendation && moduleRecommendation.status === 'pending' && (
            <div className="pl-11">
              <ModuleRecommendationCard
                recommendation={moduleRecommendation}
                onAccept={onAcceptModules}
                onReject={onRejectModules}
              />
            </div>
          )}

          {/* Loading indicator */}
          {isLoading && (
            <div className="flex gap-3">
              <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                <Bot className="w-4 h-4 text-primary" />
              </div>
              <div className="bg-muted rounded-2xl rounded-bl-md px-4 py-3">
                <ChatTypingIndicator />
              </div>
            </div>
          )}

          <div ref={scrollRef} />
        </div>
      </ScrollArea>

      {/* Input */}
      <ChatInput
        onSend={onSendMessage}
        onCancel={onCancel}
        isLoading={isLoading}
        placeholder="Beskriv din verksamhet..."
      />
    </div>
  );
}

function MessageBubble({ message }: { message: CopilotMessage }) {
  const isUser = message.role === 'user';

  return (
    <div className={cn('flex gap-3', isUser ? 'justify-end' : 'justify-start')}>
      {!isUser && (
        <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
          <Bot className="w-4 h-4 text-primary" />
        </div>
      )}

      <div
        className={cn(
          'relative max-w-[80%] rounded-2xl px-4 py-3',
          isUser
            ? 'bg-primary text-primary-foreground rounded-br-md'
            : 'bg-muted rounded-bl-md'
        )}
      >
        <div className={cn('prose prose-sm max-w-none', isUser && 'prose-invert')}>
          {message.content.split('\n').map((line, i) => (
            <p key={i} className="mb-1 last:mb-0">
              {line || '\u00A0'}
            </p>
          ))}
        </div>

        {message.toolCall && (
          <div className="mt-2 pt-2 border-t border-border/50">
            <Badge variant="outline" className="text-xs">
              {message.toolCall.name.replace(/_/g, ' ')}
            </Badge>
          </div>
        )}
      </div>

      {isUser && (
        <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary flex items-center justify-center">
          <span className="text-primary-foreground text-sm font-medium">Du</span>
        </div>
      )}
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
    <Card className="p-4 border-primary/50 bg-primary/5">
      <div className="flex items-start gap-3">
        <div className="p-2 rounded-lg bg-primary/10">
          <Sparkles className="h-4 w-4 text-primary" />
        </div>
        <div className="flex-1 space-y-3">
          <div>
            <p className="font-medium text-sm">Rekommenderade moduler</p>
            <p className="text-xs text-muted-foreground">{recommendation.reason}</p>
          </div>

          <div className="flex flex-wrap gap-2">
            {recommendation.modules.map((moduleId) => {
              const module = defaultModulesSettings[moduleId];
              return (
                <Badge key={moduleId} variant="secondary">
                  {module?.name || moduleId}
                </Badge>
              );
            })}
          </div>

          <div className="flex gap-2">
            <Button size="sm" onClick={onAccept}>
              <Check className="h-3.5 w-3.5 mr-1.5" />
              Aktivera alla
            </Button>
            <Button size="sm" variant="outline" onClick={onReject}>
              <X className="h-3.5 w-3.5 mr-1.5" />
              Hoppa över
            </Button>
          </div>
        </div>
      </div>
    </Card>
  );
}
