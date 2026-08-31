import { useState, useRef, useEffect } from 'react';
import { useUiText } from '@/lib/ui-text';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, Sparkles } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { useChatSettings } from '@/hooks/useSiteSettings';
import { useIsModuleEnabled } from '@/hooks/useModules';
import { cn } from '@/lib/utils';

export interface ChatLauncherBlockData {
  title?: string;
  subtitle?: string;
  placeholder?: string;
  showQuickActions?: boolean;
  quickActionCount?: 2 | 3 | 4;
  variant?: 'minimal' | 'card' | 'hero-integrated';
}

interface ChatLauncherBlockProps {
  data: ChatLauncherBlockData;
}

export function ChatLauncherBlock({ data }: ChatLauncherBlockProps) {
  const t = useUiText();
  const navigate = useNavigate();
  const { data: chatSettings } = useChatSettings();
  const [inputValue, setInputValue] = useState('');
  const [isFocused, setIsFocused] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const {
    title = chatSettings?.title || 'What can I help you with?',
    subtitle,
    placeholder = chatSettings?.placeholder || 'Message AI Assistant...',
    showQuickActions = true,
    quickActionCount = 4,
    variant = 'card',
  } = data;

  const quickActions = chatSettings?.suggestedPrompts?.slice(0, quickActionCount) || [];

  const chatModuleEnabled = useIsModuleEnabled('chat');
  const isEnabled = chatModuleEnabled && chatSettings?.landingPageEnabled;

  const handleSubmit = (message?: string) => {
    const finalMessage = (message ?? inputValue).trim();
    if (!finalMessage) {
      navigate('/chat');
      return;
    }
    // Use query param so the link is shareable / refresh-safe.
    navigate(`/chat?q=${encodeURIComponent(finalMessage)}`);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  // Quick actions fill the input so the visitor can review/edit before sending.
  const handleQuickAction = (prompt: string) => {
    setInputValue(prompt);
    requestAnimationFrame(() => {
      inputRef.current?.focus();
      const len = prompt.length;
      inputRef.current?.setSelectionRange(len, len);
    });
  };

  if (!isEnabled) return null;

  const containerClasses = cn(
    'w-full max-w-3xl mx-auto',
    variant === 'card' && 'bg-card rounded-[var(--radius-block,1rem)] border shadow-lg p-6 md:p-8',
    variant === 'hero-integrated' && 'py-8 md:py-12',
    variant === 'minimal' && 'py-6 md:py-8'
  );

  return (
    <section className="py-8 md:py-12 px-4" aria-label={t('chat.start', 'Start a chat')}>
      <div className={containerClasses}>
        <div className="text-center mb-6">
          <h2 className={cn(
            'font-serif tracking-tight',
            variant === 'hero-integrated' ? 'text-3xl md:text-5xl' : 'text-2xl md:text-3xl'
          )}>
            {title}
          </h2>
          {subtitle && (
            <p className="text-muted-foreground mt-2 text-base md:text-lg">
              {subtitle}
            </p>
          )}
        </div>

        <div className={cn(
          'relative group transition-all duration-300',
          isFocused && 'scale-[1.01]'
        )}>
          <div className={cn(
            'relative flex items-center gap-2 rounded-xl border bg-background transition-all duration-200',
            'hover:border-primary/50 hover:shadow-md',
            isFocused && 'border-primary shadow-lg ring-2 ring-primary/20'
          )}>
            <Sparkles className="absolute left-4 h-5 w-5 text-muted-foreground pointer-events-none" />
            <Input
              ref={inputRef}
              type="text"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={handleKeyDown}
              onFocus={() => setIsFocused(true)}
              onBlur={() => setIsFocused(false)}
              placeholder={placeholder}
              aria-label={t('chat.messageLabel', 'Your message')}
              className="flex-1 border-0 bg-transparent pl-12 pr-14 py-6 text-base focus-visible:ring-0 focus-visible:ring-offset-0"
            />
            <Button
              onClick={() => handleSubmit()}
              size="icon"
              aria-label={t('chat.send', 'Send message')}
              className="absolute right-2 h-10 w-10 rounded-lg"
            >
              <ArrowRight className="h-5 w-5" />
            </Button>
          </div>
        </div>

        {showQuickActions && quickActions.length > 0 && (
          <div className="mt-6 flex flex-wrap justify-center gap-2">
            {quickActions.map((prompt, index) => (
              <Button
                key={index}
                variant="outline"
                size="sm"
                onClick={() => handleQuickAction(prompt)}
                className="rounded-full text-sm hover:bg-primary hover:text-primary-foreground transition-colors"
              >
                {prompt}
              </Button>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
