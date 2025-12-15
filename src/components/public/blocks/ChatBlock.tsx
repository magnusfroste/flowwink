import { ChatBlockData } from '@/types/cms';
import { ChatConversation } from '@/components/chat/ChatConversation';
import { useChatSettings } from '@/hooks/useSiteSettings';
import { cn } from '@/lib/utils';
import { Card } from '@/components/ui/card';

interface ChatBlockProps {
  data: ChatBlockData;
}

const heightClasses = {
  sm: 'h-[300px]',
  md: 'h-[450px]',
  lg: 'h-[600px]',
  full: 'h-[calc(100vh-200px)] min-h-[400px]',
};

export function ChatBlock({ data }: ChatBlockProps) {
  const { data: settings, isLoading } = useChatSettings();

  if (isLoading) {
    return (
      <div className={cn('bg-muted/50 animate-pulse rounded-xl', heightClasses[data.height || 'md'])} />
    );
  }

  if (!settings?.enabled || !settings?.blockEnabled) {
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
            {content}
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
