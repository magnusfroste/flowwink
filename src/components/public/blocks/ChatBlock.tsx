import { ChatBlockData } from '@/types/cms';
import { ChatConversation } from '@/components/chat/ChatConversation';
import { useChatSettings } from '@/hooks/useSiteSettings';
import { useIsModuleEnabled } from '@/hooks/useModules';
import { cn } from '@/lib/utils';
import { Card } from '@/components/ui/card';
import { useId } from 'react';

interface ChatBlockProps {
  data: ChatBlockData;
}

// Mobile-first: shorter on small screens, taller on desktop.
// Uses dvh so mobile browser chrome doesn't clip the chat.
const heightClasses = {
  sm: 'h-[280px] md:h-[320px]',
  md: 'h-[380px] md:h-[460px]',
  lg: 'h-[460px] md:h-[600px]',
  full: 'h-[70dvh] md:h-[calc(100dvh-200px)] min-h-[360px]',
};

export function ChatBlock({ data }: ChatBlockProps) {
  const { data: settings, isLoading } = useChatSettings();
  const chatModuleEnabled = useIsModuleEnabled('chat');
  const headingId = useId();
  const height = heightClasses[data.height || 'md'] ?? heightClasses.md;
  const hasTitle = Boolean(data.title);

  if (isLoading) {
    return (
      <div className={cn('bg-muted/50 animate-pulse rounded-xl', height)} />
    );
  }

  if (!chatModuleEnabled || !settings?.blockEnabled) {
    return null;
  }

  const content = (
    <ChatConversation
      mode="block"
      className={cn(height)}
      hideInternalTitle={hasTitle}
    />
  );

  if (data.variant === 'card') {
    return (
      <section
       
        {...(hasTitle ? { 'aria-labelledby': headingId } : { 'aria-label': 'Chat' })}
      >
        <div className="container max-w-4xl mx-auto">
          {hasTitle && (
            <h2
              id={headingId}
              className="text-2xl md:text-3xl font-serif font-semibold text-center mb-6"
            >
              {data.title}
            </h2>
          )}
          <Card className="overflow-hidden shadow-lg">
            <div className={cn(height, 'overflow-hidden')}>{content}</div>
          </Card>
        </div>
      </section>
    );
  }

  return (
    <section
     
      {...(hasTitle ? { 'aria-labelledby': headingId } : { 'aria-label': 'Chat' })}
    >
      <div className="container max-w-4xl mx-auto">
        {hasTitle && (
          <h2
            id={headingId}
            className="text-2xl md:text-3xl font-serif font-semibold text-center mb-6"
          >
            {data.title}
          </h2>
        )}
        <div className="border rounded-xl overflow-hidden">{content}</div>
      </div>
    </section>
  );
}
