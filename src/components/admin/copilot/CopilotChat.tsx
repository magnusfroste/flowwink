import { useRef, useEffect, useState } from 'react';
import { Zap, ArrowUp, Loader2, CheckCircle2, Layout, Image, MessageSquare, Users, Wand2, Square, RotateCcw, AlertTriangle, Globe } from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { cn } from '@/lib/utils';
import type { CopilotMessage, CopilotBlock, MigrationState, DiscoveryStatus } from '@/hooks/useCopilot';

interface CopilotChatProps {
  messages: CopilotMessage[];
  blocks: CopilotBlock[];
  isLoading: boolean;
  isAutoContinue: boolean;
  onSendMessage: (message: string) => void;
  onCancel: () => void;
  onFinishPage: () => void;
  onStopAutoContinue: () => void;
  onReset: () => void;
  migrationState?: MigrationState;
  onAnalyzeSite: (url: string) => Promise<void>;
  discoveryStatus: DiscoveryStatus;
}

const WELCOME_MESSAGE = `👋 Hi! I'm FlowPilot, your AI migration assistant.\n\nPaste a URL and I'll migrate your entire website automatically — pages, blog posts, and knowledge base articles.\n\nOr describe your business and I'll build you a new site from scratch!`;

const STARTER_PROMPTS = [
  { label: 'Migrate my site', icon: Globe, hint: 'Paste your URL' },
  { label: 'Build from scratch', icon: Wand2, hint: 'Describe your business' },
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

// Quick action hints during migration
const MIGRATION_HINTS = [
  { command: 'yes', label: 'Keep it' },
  { command: 'skip', label: 'Skip' },
  { command: 'make it shorter', label: 'Shorter' },
];

export function CopilotChat({
  messages,
  blocks,
  isLoading,
  isAutoContinue,
  onSendMessage,
  onCancel,
  onFinishPage,
  onStopAutoContinue,
  onReset,
  onAnalyzeSite,
  discoveryStatus,
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
      const trimmedInput = input.trim();
      
      // Check if input contains a URL - trigger site analysis
      const urlMatch = trimmedInput.match(/https?:\/\/[^\s]+/);
      if (urlMatch) {
        onAnalyzeSite(urlMatch[0]);
        setInput('');
        return;
      }
      
      onSendMessage(trimmedInput);
      setInput('');
    }
  };

  const isEmpty = messages.length === 0;
  const hasBlocks = blocks.length > 0;

  // Determine which block types have been created
  const createdBlockTypes = new Set(blocks.map(b => b.type));
  const suggestedNext = SUGGESTED_BLOCKS.filter(s => !createdBlockTypes.has(s.id)).slice(0, 3);

  return (
    <div className="flex flex-col h-full">
      <ScrollArea className="flex-1">
        <div className="p-3 space-y-3">
          {/* Welcome state */}
          {isEmpty && (
            <div className="space-y-4 py-6">
              <div className="text-center space-y-2">
                <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-primary/10 mb-1">
                  <Zap className="w-6 h-6 text-primary" />
                </div>
                <h3 className="font-medium text-base">Welcome to FlowPilot</h3>
                <p className="text-xs text-muted-foreground max-w-xs mx-auto whitespace-pre-line">
                  {WELCOME_MESSAGE}
                </p>
              </div>

              <div className="flex flex-col gap-2 max-w-xs mx-auto">
                {STARTER_PROMPTS.map((prompt) => (
                  <Button
                    key={prompt.label}
                    variant="outline"
                    size="sm"
                    onClick={() => prompt.label.includes('Migrate') 
                      ? onSendMessage('I want to migrate my existing website')
                      : onSendMessage('I want to build a new website from scratch')
                    }
                    className="text-xs h-9 px-3 gap-2 justify-start"
                  >
                    <prompt.icon className="h-4 w-4" />
                    {prompt.label}
                  </Button>
                ))}
              </div>
            </div>
          )}

          {/* Generate full page button - show when ready to build */}
          {!isEmpty && !hasBlocks && !isLoading && (
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

          {/* Quick action hints during migration - show only when NOT in discovery/migration mode */}
          {hasBlocks && !isLoading && suggestedNext.length > 0 && discoveryStatus !== 'migrating' && discoveryStatus !== 'ready' && (
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

          {/* Migration quick actions - conversational commands */}
          {discoveryStatus === 'migrating' && !isLoading && (
            <div className="pt-2">
              <div className="flex flex-wrap gap-1.5 justify-center">
                <span className="text-[10px] text-muted-foreground w-full text-center mb-1">Quick commands:</span>
                {MIGRATION_HINTS.map((hint) => (
                  <Button
                    key={hint.command}
                    variant="outline"
                    size="sm"
                    onClick={() => onSendMessage(hint.command)}
                    className="text-xs h-6 px-3"
                  >
                    {hint.label}
                  </Button>
                ))}
              </div>
            </div>
          )}

          {/* Loading state with auto-continue indicator */}
          {isLoading && (
            <div className="text-left">
              <div className="inline-flex items-center gap-1.5 bg-muted rounded-xl px-3 py-2 text-sm text-muted-foreground">
                <Loader2 className="w-3 h-3 animate-spin" />
                <span>{isAutoContinue ? 'Generating page...' : 'Thinking...'}</span>
              </div>
              {isAutoContinue && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={onStopAutoContinue}
                  className="mt-1 text-xs h-6 px-2 text-muted-foreground"
                >
                  <Square className="w-3 h-3 mr-1 fill-current" />
                  Stop auto-generation
                </Button>
              )}
            </div>
          )}

          <div ref={scrollRef} />
        </div>
      </ScrollArea>

      {/* Input */}
      <div className="p-3 border-t bg-background space-y-2">
        {/* Finish page button - show after 3+ blocks */}
        {blocks.length >= 3 && !isLoading && (
          <Button 
            onClick={onFinishPage}
            variant="secondary"
            className="w-full gap-2 bg-green-500/10 hover:bg-green-500/20 text-green-700 dark:text-green-400 border border-green-500/20"
          >
            <CheckCircle2 className="w-4 h-4" />
            Finish & create page ({blocks.length} blocks)
          </Button>
        )}
        
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
        <div className="flex justify-between">
          {(messages.length > 0 || blocks.length > 0) && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button 
                  variant="ghost" 
                  size="sm" 
                  className="text-xs h-6 px-2 text-muted-foreground hover:text-destructive"
                >
                  <RotateCcw className="w-3 h-3 mr-1" />
                  Reset page
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle className="flex items-center gap-2">
                    <AlertTriangle className="h-5 w-5 text-destructive" />
                    Reset page?
                  </AlertDialogTitle>
                  <AlertDialogDescription>
                    This will clear all {blocks.length} generated block{blocks.length !== 1 ? 's' : ''} and conversation history. This action cannot be undone.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction 
                    onClick={onReset}
                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  >
                    Reset everything
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
          <div className="flex-1" />
          <Button variant="ghost" size="sm" onClick={onCancel} className="text-xs h-6 px-2 text-muted-foreground">
            Cancel
          </Button>
        </div>
      </div>
    </div>
  );
}