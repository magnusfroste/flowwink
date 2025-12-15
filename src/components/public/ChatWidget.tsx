import { useState } from 'react';
import { MessageCircle, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ChatConversation } from '@/components/chat/ChatConversation';
import { useChatSettings } from '@/hooks/useSiteSettings';
import { cn } from '@/lib/utils';

export function ChatWidget() {
  const [isOpen, setIsOpen] = useState(false);
  const { data: settings, isLoading } = useChatSettings();

  if (isLoading || !settings?.enabled || !settings?.widgetEnabled) {
    return null;
  }

  const position = settings.widgetPosition || 'bottom-right';
  const positionClasses = position === 'bottom-left' 
    ? 'left-4 sm:left-6' 
    : 'right-4 sm:right-6';

  return (
    <div className={cn('fixed bottom-4 sm:bottom-6 z-50', positionClasses)}>
      {/* Chat window */}
      {isOpen && (
        <div className={cn(
          'absolute bottom-16 mb-2 w-[350px] sm:w-[400px] h-[500px]',
          'bg-background border rounded-2xl shadow-2xl overflow-hidden',
          'animate-in slide-in-from-bottom-4 fade-in duration-200',
          position === 'bottom-left' ? 'left-0' : 'right-0'
        )}>
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b bg-primary/5">
            <h3 className="font-medium">{settings.title || 'AI Assistent'}</h3>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 rounded-full"
              onClick={() => setIsOpen(false)}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
          
          {/* Chat content */}
          <div className="h-[calc(100%-56px)]">
            <ChatConversation mode="widget" />
          </div>
        </div>
      )}

      {/* Toggle button */}
      <Button
        size="lg"
        className={cn(
          'h-14 w-14 rounded-full shadow-lg',
          'transition-transform hover:scale-105',
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
          {isOpen ? 'Stäng chat' : settings.widgetButtonText || 'Öppna chat'}
        </span>
      </Button>
    </div>
  );
}
