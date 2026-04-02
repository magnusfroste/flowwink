import { useState, useCallback, useRef } from 'react';
import { ArrowRight, Sparkles, ShoppingBag, Search, Star, X } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { ChatConversation } from '@/components/chat/ChatConversation';
import { useChatSettings } from '@/hooks/useSiteSettings';

export interface AiAssistantBlockData {
  title?: string;
  subtitle?: string;
  placeholder?: string;
  variant?: 'hero' | 'card' | 'minimal' | 'split';
  backgroundImage?: string;
  overlayOpacity?: number;
  suggestedPrompts?: string[];
  showBadge?: boolean;
  badgeText?: string;
  iconStyle?: 'sparkles' | 'shopping' | 'search';
}

interface AiAssistantBlockProps {
  data: AiAssistantBlockData;
}

const iconMap = {
  sparkles: Sparkles,
  shopping: ShoppingBag,
  search: Search,
};

export function AiAssistantBlock({ data }: AiAssistantBlockProps) {
  const [inputValue, setInputValue] = useState('');
  const [isFocused, setIsFocused] = useState(false);
  const [activeMessage, setActiveMessage] = useState<string | null>(null);
  const chatContainerRef = useRef<HTMLDivElement>(null);
  const { data: chatSettings } = useChatSettings();

  const {
    title = 'Find Your Perfect Product',
    subtitle = 'Ask our AI shopping assistant anything — it knows our entire catalog.',
    placeholder = 'What are you looking for?',
    variant = 'card',
    backgroundImage,
    overlayOpacity = 50,
    suggestedPrompts = [
      'Find me a template for my startup',
      'Compare your most popular products',
      'What\'s best for beginners?',
      'Tell me about Pro Membership',
    ],
    showBadge = true,
    badgeText = 'AI-Powered Shopping',
    iconStyle = 'sparkles',
  } = data;

  const IconComponent = iconMap[iconStyle] || Sparkles;

  const handleSubmit = useCallback((message?: string) => {
    const finalMessage = message || inputValue.trim();
    if (!finalMessage) return;

    // Expand inline chat with this message
    setActiveMessage(finalMessage);
    setInputValue('');

    // Scroll to chat after a tick
    setTimeout(() => {
      chatContainerRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }, 100);
  }, [inputValue]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const handleClose = () => {
    setActiveMessage(null);
  };

  const isHero = variant === 'hero';
  const isSplit = variant === 'split';
  const isMinimal = variant === 'minimal';

  return (
    <section className={cn(
      'relative overflow-hidden',
      isHero && 'py-24 md:py-32',
      isSplit && 'py-16 md:py-24',
      !isHero && !isSplit && 'py-12 md:py-16',
    )}>
      {/* Background image for hero variant */}
      {isHero && backgroundImage && (
        <>
          <div
            className="absolute inset-0 bg-cover bg-center"
            style={{ backgroundImage: `url(${backgroundImage})` }}
          />
          <div
            className="absolute inset-0 bg-background"
            style={{ opacity: overlayOpacity / 100 }}
          />
        </>
      )}

      <div className={cn(
        'relative container mx-auto px-4',
        isSplit && 'grid md:grid-cols-2 gap-12 items-center',
      )}>
        {/* Split variant: left side visual */}
        {isSplit && (
          <div className="hidden md:flex flex-col items-center justify-center">
            <div className="relative">
              <div className="w-48 h-48 rounded-full bg-primary/10 flex items-center justify-center">
                <div className="w-32 h-32 rounded-full bg-primary/20 flex items-center justify-center">
                  <IconComponent className="h-16 w-16 text-primary" />
                </div>
              </div>
              <div className="absolute -top-4 -right-4 w-8 h-8 rounded-full bg-accent/20 animate-pulse" />
              <div className="absolute -bottom-2 -left-6 w-6 h-6 rounded-full bg-primary/30 animate-pulse delay-500" />
              <div className="absolute top-1/2 -right-8 w-4 h-4 rounded-full bg-accent/40 animate-pulse delay-1000" />
            </div>
          </div>
        )}

        {/* Main content */}
        <div className={cn(
          'w-full',
          !isSplit && 'max-w-3xl mx-auto',
        )}>
          {/* Show input UI when chat is not active */}
          {!activeMessage && (
            <>
              {/* Badge */}
              {showBadge && (
                <div className={cn(
                  'flex justify-center mb-6',
                  isSplit && 'md:justify-start',
                )}>
                  <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium bg-primary/10 text-primary border border-primary/20">
                    <Sparkles className="h-3 w-3" />
                    {badgeText}
                  </span>
                </div>
              )}

              {/* Title */}
              <div className={cn(
                'mb-8',
                !isSplit && 'text-center',
              )}>
                <h2 className={cn(
                  'font-serif tracking-tight',
                  isHero ? 'text-4xl md:text-5xl lg:text-6xl' : 'text-3xl md:text-4xl',
                )}>
                  {title}
                </h2>
                {subtitle && (
                  <p className={cn(
                    'text-muted-foreground mt-3',
                    isHero ? 'text-lg md:text-xl' : 'text-base md:text-lg',
                  )}>
                    {subtitle}
                  </p>
                )}
              </div>

              {/* Chat Input */}
              <div className={cn(
                'relative group transition-all duration-300',
                isFocused && 'scale-[1.01]',
              )}>
                <div className={cn(
                  'relative flex items-center rounded-2xl border-2 bg-background transition-all duration-300',
                  'hover:border-primary/40 hover:shadow-lg',
                  isFocused
                    ? 'border-primary shadow-xl ring-4 ring-primary/10'
                    : 'border-border shadow-md',
                  isMinimal && 'rounded-xl border',
                )}>
                  <IconComponent className={cn(
                    'absolute left-5 h-5 w-5 transition-colors duration-200',
                    isFocused ? 'text-primary' : 'text-muted-foreground',
                  )} />
                  <Input
                    type="text"
                    value={inputValue}
                    onChange={(e) => setInputValue(e.target.value)}
                    onKeyDown={handleKeyDown}
                    onFocus={() => setIsFocused(true)}
                    onBlur={() => setIsFocused(false)}
                    placeholder={placeholder}
                    className={cn(
                      'flex-1 border-0 bg-transparent pl-14 pr-4 text-base focus-visible:ring-0 focus-visible:ring-offset-0',
                      isHero ? 'py-7 text-lg' : 'py-5',
                    )}
                  />
                  <Button
                    onClick={() => handleSubmit()}
                    size="icon"
                    className={cn(
                      'absolute right-3 rounded-xl transition-all duration-200',
                      isHero ? 'h-12 w-12' : 'h-10 w-10',
                      inputValue.trim() ? 'opacity-100 scale-100' : 'opacity-60 scale-95',
                    )}
                  >
                    <ArrowRight className="h-5 w-5" />
                  </Button>
                </div>
              </div>

              {/* Suggested Prompts */}
              {suggestedPrompts.length > 0 && (
                <div className={cn(
                  'mt-6 flex flex-wrap gap-2',
                  !isSplit && 'justify-center',
                )}>
                  {suggestedPrompts.map((prompt, index) => (
                    <button
                      key={index}
                      onClick={() => handleSubmit(prompt)}
                      className={cn(
                        'px-4 py-2 rounded-full text-sm border transition-all duration-200',
                        'bg-background hover:bg-primary hover:text-primary-foreground hover:border-primary',
                        'hover:shadow-md hover:scale-105 active:scale-100',
                      )}
                    >
                      {prompt}
                    </button>
                  ))}
                </div>
              )}

              {/* Trust indicator */}
              <div className={cn(
                'mt-6 flex items-center gap-1 text-xs text-muted-foreground',
                !isSplit && 'justify-center',
              )}>
                <Star className="h-3 w-3 fill-current text-yellow-500" />
                <span>Powered by AI • Knows our entire product catalog</span>
              </div>
            </>
          )}

          {/* Inline Chat – replaces the input UI */}
          {activeMessage && (
            <div ref={chatContainerRef} className="animate-in fade-in slide-in-from-bottom-4 duration-300">
              <div className="flex items-center justify-between mb-4">
                <span className="inline-flex items-center gap-1.5 text-sm font-medium text-primary">
                  <Sparkles className="h-4 w-4" />
                  {badgeText}
                </span>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={handleClose}
                  className="h-8 w-8 rounded-full"
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
              <div className="border rounded-2xl overflow-hidden shadow-lg bg-background">
                <ChatConversation
                  mode="block"
                  className="h-[450px]"
                  initialMessage={activeMessage}
                  onInitialMessageSent={() => {}}
                  skipRestore
                />
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
