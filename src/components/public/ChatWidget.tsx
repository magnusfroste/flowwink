import { useState } from 'react';
import { MessageCircle, X, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ChatConversation } from '@/components/chat/ChatConversation';
import { useChatSettings } from '@/hooks/useSiteSettings';
import { useBranding } from '@/providers/BrandingProvider';
import { ChatContextIndicator } from '@/components/chat/ChatContextIndicator';
import { cn } from '@/lib/utils';

const radiusMap: Record<string, { window: string; button: string }> = {
  none: { window: 'rounded-none', button: 'rounded-none' },
  sm: { window: 'rounded-lg', button: 'rounded-lg' },
  md: { window: 'rounded-2xl', button: 'rounded-full' },
  lg: { window: 'rounded-3xl', button: 'rounded-full' },
};

const shadowMap: Record<string, string> = {
  none: 'shadow-none',
  subtle: 'shadow-lg',
  medium: 'shadow-xl',
  strong: 'shadow-2xl',
};

const sizeMap = {
  sm: { width: 'w-[320px]', height: 'h-[400px]', button: 'h-12 w-12' },
  md: { width: 'w-[380px]', height: 'h-[500px]', button: 'h-14 w-14' },
  lg: { width: 'w-[440px]', height: 'h-[600px]', button: 'h-16 w-16' },
};

export function ChatWidget() {
  const [isOpen, setIsOpen] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const { data: settings, isLoading } = useChatSettings();
  const { branding } = useBranding();

  if (isLoading || !settings?.enabled || !settings?.widgetEnabled) {
    return null;
  }

  // Hide on mobile if configured
  if (!settings.widgetShowOnMobile && typeof window !== 'undefined' && window.innerWidth < 640) {
    return null;
  }

  const position = settings.widgetPosition || 'bottom-right';
  const positionClasses = position === 'bottom-left' 
    ? 'left-4 sm:left-6' 
    : 'right-4 sm:right-6';

  const radius = radiusMap[branding?.borderRadius || 'md'];
  const shadow = shadowMap[branding?.shadowIntensity || 'subtle'];
  const size = sizeMap[settings.widgetSize || 'md'];
  const style = settings.widgetStyle || 'floating';

  const isPill = style === 'pill';

  return (
    <div className={cn('fixed bottom-4 sm:bottom-6 z-50', positionClasses)}>
      {/* Chat window */}
      {isOpen && (
        <div className={cn(
          'absolute bottom-16 mb-2',
          size.width, size.height,
          'bg-background border overflow-hidden',
          'animate-in slide-in-from-bottom-4 fade-in duration-200',
          radius.window,
          shadow,
          position === 'bottom-left' ? 'left-0' : 'right-0'
        )}>
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b bg-primary/5">
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-primary" />
              <h3 className="font-medium font-serif">{settings.title || 'AI Assistant'}</h3>
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 rounded-full"
              onClick={() => setIsOpen(false)}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>

          {/* Context indicator */}
          <ChatContextIndicator variant="detailed" />
          
          {/* Chat content - pass compact mode and max prompts for widget */}
          <div className={cn(
            'h-[calc(100%-56px)]',
            settings.showContextIndicator && 
            (settings.includeContentAsContext || settings.includeKbArticles) && 
            'h-[calc(100%-88px)]'
          )}>
            <ChatConversation 
              mode="widget" 
              maxPrompts={settings.widgetMaxPrompts ?? 3}
              compact
            />
          </div>
        </div>
      )}

      {/* Toggle button - supports pill style */}
      {isPill ? (
        <button
          className={cn(
            'flex items-center gap-2 px-4 py-3 bg-primary text-primary-foreground',
            'transition-all duration-200 hover:scale-105',
            radius.button,
            shadow,
            isOpen && 'bg-muted text-muted-foreground',
            isHovered && !isOpen && 'pr-6'
          )}
          onClick={() => setIsOpen(!isOpen)}
          onMouseEnter={() => setIsHovered(true)}
          onMouseLeave={() => setIsHovered(false)}
        >
          {isOpen ? (
            <X className="h-5 w-5" />
          ) : (
            <>
              <MessageCircle className="h-5 w-5" />
              <span className={cn(
                'text-sm font-medium whitespace-nowrap overflow-hidden transition-all duration-200',
                isHovered ? 'max-w-[200px] opacity-100' : 'max-w-0 opacity-0'
              )}>
                {settings.widgetButtonText || 'Chat'}
              </span>
            </>
          )}
        </button>
      ) : (
        <Button
          size="lg"
          className={cn(
            size.button,
            'transition-transform hover:scale-105',
            radius.button,
            shadow,
            isOpen && 'bg-muted text-muted-foreground hover:bg-muted/90'
          )}
          onClick={() => setIsOpen(!isOpen)}
        >
          {isOpen ? (
            <X className="h-6 w-6" />
          ) : (
            <MessageCircle className="h-6 w-6" />
          )}
          <span className="sr-only">
            {isOpen ? 'Close chat' : settings.widgetButtonText || 'Open chat'}
          </span>
        </Button>
      )}
    </div>
  );
}
