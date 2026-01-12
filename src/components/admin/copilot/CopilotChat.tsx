import { useRef, useEffect } from 'react';
import { Sparkles, Check, X, ArrowUp, Loader2, CheckCircle2, Layout, Image, MessageSquare, Users, Wand2 } from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import type { CopilotMessage, ModuleRecommendation, CopilotBlock } from '@/hooks/useCopilot';
import { defaultModulesSettings } from '@/hooks/useModules';
import { useState } from 'react';

interface CopilotChatProps {
  messages: CopilotMessage[];
  blocks: CopilotBlock[];
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

const SUGGESTED_BLOCKS = [
  { id: 'features', label: 'Features', icon: Layout },
  { id: 'testimonials', label: 'Testimonials', icon: Users },
  { id: 'gallery', label: 'Gallery', icon: Image },
  { id: 'contact', label: 'Contact form', icon: MessageSquare },
];

const FULL_PAGE_PROMPT = `Create a complete landing page for me with these sections in order:
1. Hero section with headline and call-to-action
2. Features section showing 3-4 key benefits
3. Testimonials from happy customers
4. Call-to-action section
5. Contact form

Create them one at a time, starting with the hero.`;

const FULL_PAGE_BLOCKS = ['hero', 'features', 'testimonials', 'cta', 'contact'];
const FULL_PAGE_BLOCK_COUNT = 5;

export function CopilotChat({
  messages,
  blocks,
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
  const hasBlocks = blocks.length > 0;
  const approvedCount = blocks.filter(b => b.status === 'approved').length;

  // Detect if full page generation is in progress
  const isFullPageMode = messages.some(m => 
    m.role === 'user' && m.content.toLowerCase().includes('complete landing page')
  );
  
  // Count how many of the expected full page blocks have been created
  const fullPageProgress = FULL_PAGE_BLOCKS.filter(type => 
    blocks.some(b => b.type === type)
  ).length;

  // Determine which block types have been created
  const createdBlockTypes = new Set(blocks.map(b => b.type));
  const suggestedNext = SUGGESTED_BLOCKS.filter(s => !createdBlockTypes.has(s.id)).slice(0, 3);

  return (
    <div className="flex flex-col h-full">
      {/* Progress indicator */}
      {hasBlocks && (
        <div className="px-3 py-2 border-b bg-muted/30">
          <div className="flex items-center justify-between text-xs">
            <div className="flex items-center gap-1.5">
              {/* Full page mode: show X of 5 progress */}
              {isFullPageMode ? (
                <>
                  <div className="flex items-center gap-0.5">
                    {FULL_PAGE_BLOCKS.map((type, i) => (
                      <div
                        key={type}
                        className={cn(
                          'w-2 h-2 rounded-full transition-colors',
                          blocks.some(b => b.type === type)
                            ? blocks.find(b => b.type === type)?.status === 'approved'
                              ? 'bg-primary'
                              : 'bg-primary/50'
                            : 'bg-muted-foreground/20'
                        )}
                      />
                    ))}
                  </div>
                  <span className="text-muted-foreground font-medium">
                    {fullPageProgress} of {FULL_PAGE_BLOCK_COUNT}
                  </span>
                  {fullPageProgress === FULL_PAGE_BLOCK_COUNT && (
                    <Badge variant="secondary" className="text-[10px] h-4 px-1.5 bg-green-500/10 text-green-600">
                      Complete!
                    </Badge>
                  )}
                </>
              ) : (
                <>
                  <div className="flex items-center gap-1">
                    {[...Array(Math.min(blocks.length, 5))].map((_, i) => (
                      <div
                        key={i}
                        className={cn(
                          'w-1.5 h-1.5 rounded-full transition-colors',
                          i < approvedCount ? 'bg-primary' : 'bg-muted-foreground/30'
                        )}
                      />
                    ))}
                    {blocks.length > 5 && (
                      <span className="text-muted-foreground ml-0.5">+{blocks.length - 5}</span>
                    )}
                  </div>
                  <span className="text-muted-foreground">
                    {blocks.length} block{blocks.length !== 1 ? 's' : ''} created
                  </span>
                </>
              )}
            </div>
            {approvedCount > 0 && (
              <Badge variant="secondary" className="text-[10px] h-5">
                <CheckCircle2 className="w-3 h-3 mr-1 text-primary" />
                {approvedCount} ready
              </Badge>
            )}
          </div>
        </div>
      )}

      <ScrollArea className="flex-1">
        <div className="p-3 space-y-3">
          {/* Welcome state */}
          {isEmpty && (
            <div className="space-y-4 py-6">
              <div className="text-center space-y-1">
                <div className="inline-flex items-center justify-center w-10 h-10 rounded-full bg-primary/10 mb-1">
                  <Sparkles className="w-5 h-5 text-primary" />
                </div>
                <h3 className="font-medium text-sm">What are we building?</h3>
                <p className="text-xs text-muted-foreground max-w-xs mx-auto">
                  {WELCOME_MESSAGE}
                </p>
              </div>

              <div className="flex flex-wrap justify-center gap-1.5">
                {STARTER_PROMPTS.map((prompt) => (
                  <Button
                    key={prompt}
                    variant="outline"
                    size="sm"
                    onClick={() => onSendMessage(`I run a ${prompt.toLowerCase()}`)}
                    className="text-xs h-7 px-2.5"
                  >
                    {prompt}
                  </Button>
                ))}
              </div>
            </div>
          )}

          {/* Generate full page button - show after modules accepted but before blocks */}
          {!isEmpty && !hasBlocks && !isLoading && moduleRecommendation?.status === 'accepted' && (
            <div className="py-3">
              <Button
                onClick={() => onSendMessage(FULL_PAGE_PROMPT)}
                className="w-full gap-2"
                variant="default"
              >
                <Wand2 className="w-4 h-4" />
                Generate full landing page
              </Button>
              <p className="text-[10px] text-muted-foreground text-center mt-1.5">
                Hero → Features → Testimonials → CTA → Contact
              </p>
            </div>
          )}

          {/* Messages */}
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
                  'inline-block max-w-[90%] rounded-xl px-3 py-2',
                  message.role === 'user'
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-muted'
                )}
              >
                <div className="whitespace-pre-wrap text-sm leading-relaxed">{message.content}</div>
                
                {message.toolCall && (
                  <Badge variant="secondary" className="mt-1.5 text-[10px] opacity-60">
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

          {/* Continue building button - primary action after block created */}
          {hasBlocks && !isLoading && suggestedNext.length > 0 && (
            <div className="pt-2 space-y-2">
              <Button
                onClick={() => onSendMessage(`Continue building. Add a ${suggestedNext[0].label.toLowerCase()} section next.`)}
                className="w-full gap-2"
                size="sm"
              >
                <ArrowUp className="w-3.5 h-3.5" />
                Continue with {suggestedNext[0].label}
              </Button>
              
              {suggestedNext.length > 1 && (
                <div className="flex flex-wrap gap-1.5">
                  <span className="text-[10px] text-muted-foreground w-full">Or choose:</span>
                  {suggestedNext.slice(1).map((suggestion) => (
                    <Button
                      key={suggestion.id}
                      variant="outline"
                      size="sm"
                      onClick={() => onSendMessage(`Add a ${suggestion.label.toLowerCase()} section`)}
                      className="text-xs h-6 px-2 gap-1"
                    >
                      <suggestion.icon className="w-3 h-3" />
                      {suggestion.label}
                    </Button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Loading state */}
          {isLoading && (
            <div className="text-left">
              <div className="inline-flex items-center gap-1.5 bg-muted rounded-xl px-3 py-2 text-sm text-muted-foreground">
                <Loader2 className="w-3 h-3 animate-spin" />
                <span>Thinking...</span>
              </div>
            </div>
          )}

          <div ref={scrollRef} />
        </div>
      </ScrollArea>

      {/* Input */}
      <div className="p-3 border-t bg-background">
        <form onSubmit={handleSubmit} className="flex gap-2">
          <Input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={hasBlocks ? "Ask for more blocks..." : "Describe your business..."}
            disabled={isLoading}
            className="flex-1 h-9 text-sm"
          />
          <Button 
            type="submit" 
            size="icon" 
            className="h-9 w-9"
            disabled={!input.trim() || isLoading}
          >
            {isLoading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <ArrowUp className="h-4 w-4" />
            )}
          </Button>
        </form>
        <div className="flex justify-end mt-1.5">
          <Button variant="ghost" size="sm" onClick={onCancel} className="text-xs h-6 px-2 text-muted-foreground">
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
    <Card className="p-3 border-primary/20 bg-gradient-to-br from-primary/5 to-primary/10">
      <div className="space-y-2.5">
        <div className="flex items-center gap-2">
          <div className="flex items-center justify-center w-6 h-6 rounded-md bg-primary/10">
            <Sparkles className="h-3.5 w-3.5 text-primary" />
          </div>
          <span className="font-medium text-sm">Recommended modules</span>
        </div>
        
        <p className="text-xs text-muted-foreground leading-relaxed">{recommendation.reason}</p>

        <div className="flex flex-wrap gap-1">
          {recommendation.modules.map((moduleId) => {
            const module = defaultModulesSettings[moduleId];
            return (
              <Badge key={moduleId} variant="secondary" className="text-[10px] px-1.5 py-0.5">
                {module?.name || moduleId}
              </Badge>
            );
          })}
        </div>

        <div className="flex gap-2 pt-0.5">
          <Button size="sm" onClick={onAccept} className="flex-1 h-8 text-xs">
            <Check className="h-3 w-3 mr-1" />
            Activate all
          </Button>
          <Button size="sm" variant="outline" onClick={onReject} className="h-8 w-8 p-0">
            <X className="h-3 w-3" />
          </Button>
        </div>
      </div>
    </Card>
  );
}
