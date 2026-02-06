import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, Sparkles } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { useChatSettings } from '@/hooks/useSiteSettings';
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
  const navigate = useNavigate();
  const { data: chatSettings } = useChatSettings();
  const [inputValue, setInputValue] = useState('');
  const [isFocused, setIsFocused] = useState(false);

  const {
    title = chatSettings?.title || 'What can I help you with?',
    subtitle,
    placeholder = chatSettings?.placeholder || 'Message AI Assistant...',
    showQuickActions = true,
    quickActionCount = 4,
    variant = 'card',
  } = data;

  // Get quick actions from chat settings
  const quickActions = chatSettings?.suggestedPrompts?.slice(0, quickActionCount) || [];

  // Check if chat landing page is enabled
  const isEnabled = chatSettings?.enabled && chatSettings?.landingPageEnabled;

  const handleSubmit = (message?: string) => {
    const finalMessage = message || inputValue.trim();
    if (!finalMessage) {
      navigate('/chat');
      return;
    }
    navigate('/chat', { state: { initialMessage: finalMessage } });
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const handleQuickAction = (prompt: string) => {
    handleSubmit(prompt);
  };

  if (!isEnabled) {
    return null;
  }

  const containerClasses = cn(
    'w-full max-w-3xl mx-auto',
    variant === 'card' && 'bg-card rounded-2xl border shadow-lg p-8',
    variant === 'hero-integrated' && 'py-12',
    variant === 'minimal' && 'py-8'
  );

  return (
    <section className="py-12 px-4">
      <div className={containerClasses}>
        {/* Title */}
        <div className="text-center mb-6">
          <h2 className={cn(
            'font-serif tracking-tight',
            variant === 'hero-integrated' ? 'text-4xl md:text-5xl' : 'text-2xl md:text-3xl'
          )}>
            {title}
          </h2>
          {subtitle && (
            <p className="text-muted-foreground mt-2 text-lg">
              {subtitle}
            </p>
          )}
        </div>

        {/* Input Field */}
        <div className={cn(
          'relative group transition-all duration-300',
          isFocused && 'scale-[1.01]'
        )}>
          <div className={cn(
            'relative flex items-center gap-2 rounded-xl border bg-background transition-all duration-200',
            'hover:border-primary/50 hover:shadow-md',
            isFocused && 'border-primary shadow-lg ring-2 ring-primary/20'
          )}>
            <Sparkles className="absolute left-4 h-5 w-5 text-muted-foreground" />
            <Input
              type="text"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={handleKeyDown}
              onFocus={() => setIsFocused(true)}
              onBlur={() => setIsFocused(false)}
              placeholder={placeholder}
              className="flex-1 border-0 bg-transparent pl-12 pr-4 py-6 text-base focus-visible:ring-0 focus-visible:ring-offset-0"
            />
            <Button
              onClick={() => handleSubmit()}
              size="icon"
              className="absolute right-2 h-10 w-10 rounded-lg"
            >
              <ArrowRight className="h-5 w-5" />
            </Button>
          </div>
        </div>

        {/* Quick Actions */}
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
