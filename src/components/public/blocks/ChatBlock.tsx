import { ChatBlockData } from '@/types/cms';
import { ChatConversation } from '@/components/chat/ChatConversation';
import { useChatSettings } from '@/hooks/useSiteSettings';
import { useIsModuleEnabled } from '@/hooks/useModules';
import { cn } from '@/lib/utils';
import { Card } from '@/components/ui/card';
...
  const chatModuleEnabled = useIsModuleEnabled('chat');

  if (!chatModuleEnabled || !settings?.blockEnabled) {
    return null;
  }

  const content = (
    <ChatConversation 
      mode="block" 
      className={cn(heightClasses[data.height || 'md'])}
    />
  );

  if (data.variant === 'card') {
    return (
      <section className="py-12 px-4">
        <div className="container max-w-4xl mx-auto">
          {data.title && (
            <h2 className="text-2xl md:text-3xl font-serif font-semibold text-center mb-6">
              {data.title}
            </h2>
          )}
          <Card className="overflow-hidden shadow-lg">
            <div className={cn(heightClasses[data.height || 'md'], 'overflow-hidden')}>
              {content}
            </div>
          </Card>
        </div>
      </section>
    );
  }

  return (
    <section className="py-8">
      <div className="container max-w-4xl mx-auto">
        {data.title && (
          <h2 className="text-2xl md:text-3xl font-serif font-semibold text-center mb-6">
            {data.title}
          </h2>
        )}
        <div className="border rounded-xl overflow-hidden">
          {content}
        </div>
      </div>
    </section>
  );
}
