import { useState, useEffect, useId, useRef } from 'react';
import { MessageCircle, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ChatConversation } from '@/components/chat/ChatConversation';
import { useChatSettings } from '@/hooks/useSiteSettings';
import { useIsModuleEnabled } from '@/hooks/useModules';
import { useBranding } from '@/providers/BrandingProvider';
import { useCookieConsent } from '@/components/public/CookieBanner';
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

// Width caps to viewport on small screens; height uses dvh so mobile chrome can't clip.
const sizeMap = {
  sm: {
    width: 'w-[min(320px,calc(100vw-2rem))]',
    height: 'h-[min(400px,calc(100dvh-7rem))]',
    button: 'h-12 w-12',
  },
  md: {
    width: 'w-[min(380px,calc(100vw-2rem))]',
    height: 'h-[min(500px,calc(100dvh-7rem))]',
    button: 'h-14 w-14',
  },
  lg: {
    width: 'w-[min(440px,calc(100vw-2rem))]',
    height: 'h-[min(600px,calc(100dvh-7rem))]',
    button: 'h-16 w-16',
  },
};

export function ChatWidget() {
  const [isOpen, setIsOpen] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const [initialMessage, setInitialMessage] = useState<string | undefined>();
  const { data: settings, isLoading } = useChatSettings();
  const { branding } = useBranding();
  const chatModuleEnabled = useIsModuleEnabled('chat');
  const cookieConsent = useCookieConsent();
  const panelId = useId();
  const panelRef = useRef<HTMLDivElement | null>(null);
  const toggleRef = useRef<HTMLButtonElement | null>(null);

  // Listen for external open-chat-widget events (from AiAssistantBlock, etc.)
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail?.message) {
        setInitialMessage(detail.message);
      }
      setIsOpen(true);
    };
    window.addEventListener('open-chat-widget', handler);
    return () => window.removeEventListener('open-chat-widget', handler);
  }, []);

  // Escape to close + focus input on open / return focus to toggle on close.
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsOpen(false);
        toggleRef.current?.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    // Move focus into the panel (first focusable input/textarea).
    const t = window.setTimeout(() => {
      const focusable = panelRef.current?.querySelector<HTMLElement>(
        'textarea, input:not([type="hidden"])',
      );
      focusable?.focus();
    }, 50);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.clearTimeout(t);
    };
  }, [isOpen]);

  if (isLoading || !chatModuleEnabled || !settings?.widgetEnabled) {
    return null;
  }

  const position = settings.widgetPosition || 'bottom-right';
  const positionClasses = position === 'bottom-left'
    ? 'left-4 sm:left-6'
    : 'right-4 sm:right-6';

  // CSS-based mobile hide reacts to resize/rotation (replaces innerWidth check).
  const mobileHideClass = settings.widgetShowOnMobile ? '' : 'hidden sm:block';

  const radius = radiusMap[branding?.borderRadius || 'md'];
  const shadow = shadowMap[branding?.shadowIntensity || 'subtle'];
  const size = sizeMap[settings.widgetSize || 'md'];
  const style = settings.widgetStyle || 'floating';

  const isPill = style === 'pill';
  const buttonLabel = settings.widgetButtonText || 'Chat';

  return (
    <div className={cn(
      'fixed z-50 transition-[bottom] duration-300',
      positionClasses,
      mobileHideClass,
      // Lift above the cookie banner on mobile while consent is pending
      cookieConsent === 'pending'
        ? 'bottom-[260px] sm:bottom-[140px] md:bottom-6'
        : 'bottom-4 sm:bottom-6'
    )}>
      {/* Chat window */}
      {isOpen && (
        <div
          ref={panelRef}
          id={panelId}
          role="dialog"
          aria-label={settings.title || 'AI Assistant'}
          className={cn(
            'absolute bottom-16 mb-2',
            size.width, size.height,
            'bg-background border overflow-hidden flex flex-col',
            'animate-in slide-in-from-bottom-4 fade-in duration-200',
            radius.window,
            shadow,
            position === 'bottom-left' ? 'left-0' : 'right-0'
          )}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b bg-primary/5 shrink-0">
            <div className="flex items-center gap-2 min-w-0">
              <MessageCircle className="h-4 w-4 text-primary shrink-0" aria-hidden="true" />
              <p className="font-medium font-serif truncate">{settings.title || 'AI Assistant'}</p>
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 rounded-full shrink-0"
              onClick={() => {
                setIsOpen(false);
                toggleRef.current?.focus();
              }}
              aria-label="Close chat"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </Button>
          </div>

          {/* Chat content - pass compact mode and max prompts for widget */}
          <div className="flex-1 min-h-0">
            <ChatConversation
              mode="widget"
              maxPrompts={settings.widgetMaxPrompts ?? 3}
              compact
              skipRestore
              initialMessage={initialMessage}
              onInitialMessageSent={() => setInitialMessage(undefined)}
            />
          </div>
        </div>
      )}

      {/* Toggle button - supports pill style */}
      {isPill ? (
        <button
          ref={toggleRef}
          type="button"
          className={cn(
            'flex items-center gap-2 px-4 py-3 bg-primary text-primary-foreground',
            'transition-all duration-200 hover:scale-105',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
            radius.button,
            shadow,
            isOpen && 'bg-muted text-muted-foreground',
            // Always show label on touch (hover doesn't fire), expand on hover for pointer.
            !isOpen && (isHovered ? 'pr-6' : 'sm:pr-3')
          )}
          onClick={() => setIsOpen(!isOpen)}
          onMouseEnter={() => setIsHovered(true)}
          onMouseLeave={() => setIsHovered(false)}
          aria-label={isOpen ? 'Close chat' : buttonLabel}
          aria-expanded={isOpen}
          aria-controls={panelId}
        >
          {isOpen ? (
            <X className="h-5 w-5" aria-hidden="true" />
          ) : (
            <>
              <MessageCircle className="h-5 w-5" aria-hidden="true" />
              <span
                className={cn(
                  'text-sm font-medium whitespace-nowrap overflow-hidden transition-all duration-200',
                  // Always visible on touch (<sm); hover-driven on sm+
                  'max-w-[200px] opacity-100',
                  'sm:transition-all sm:duration-200',
                  isHovered ? 'sm:max-w-[200px] sm:opacity-100' : 'sm:max-w-0 sm:opacity-0'
                )}
              >
                {buttonLabel}
              </span>
            </>
          )}
        </button>
      ) : (
        <Button
          ref={toggleRef}
          size="lg"
          className={cn(
            size.button,
            'transition-transform hover:scale-105',
            radius.button,
            shadow,
            isOpen && 'bg-muted text-muted-foreground hover:bg-muted/90'
          )}
          onClick={() => setIsOpen(!isOpen)}
          aria-label={isOpen ? 'Close chat' : buttonLabel}
          aria-expanded={isOpen}
          aria-controls={panelId}
        >
          {isOpen ? (
            <X className="h-6 w-6" aria-hidden="true" />
          ) : (
            <MessageCircle className="h-6 w-6" aria-hidden="true" />
          )}
        </Button>
      )}
    </div>
  );
}
