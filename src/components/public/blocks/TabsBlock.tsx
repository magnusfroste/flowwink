import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { cn } from '@/lib/utils';
import { 
  Home, Settings, User, Bell, Calendar, FileText, 
  Image, Mail, MessageSquare, Search, Star, Heart 
} from 'lucide-react';
import type { RichTextContent } from '@/types/cms';
import { renderToHtml } from '@/lib/tiptap-utils';

export interface TabItem {
  id: string;
  title: string;
  icon?: string;
  content: RichTextContent;
}

export interface TabsBlockData {
  title?: string;
  subtitle?: string;
  tabs: TabItem[];
  orientation?: 'horizontal' | 'vertical';
  variant?: 'underline' | 'pills' | 'boxed';
  defaultTab?: string;
}

interface TabsBlockProps {
  data: TabsBlockData;
}

const iconMap: Record<string, React.ComponentType<{ className?: string }>> = {
  Home, Settings, User, Bell, Calendar, FileText,
  Image, Mail, MessageSquare, Search, Star, Heart,
};

function getIcon(iconName?: string) {
  if (!iconName) return null;
  const Icon = iconMap[iconName];
  return Icon ? <Icon className="h-4 w-4" /> : null;
}

export function TabsBlock({ data }: TabsBlockProps) {
  const orientation = data.orientation || 'horizontal';
  const variant = data.variant || 'underline';
  const tabs = data.tabs || [];

  if (tabs.length === 0) return null;

  const defaultTab = data.defaultTab || tabs[0]?.id;

  const variantStyles = {
    underline: {
      list: 'bg-transparent border-b rounded-none h-auto p-0 gap-0',
      trigger: 'rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none px-4 py-2',
    },
    pills: {
      list: 'bg-muted/50 p-1 rounded-full',
      trigger: 'rounded-full data-[state=active]:bg-background data-[state=active]:shadow-sm px-4 py-1.5',
    },
    boxed: {
      list: 'bg-muted p-1 rounded-lg',
      trigger: 'rounded-md data-[state=active]:bg-background data-[state=active]:shadow-sm px-4 py-2',
    },
  };

  return (
    <section className="py-12 px-6">
      <div className="container mx-auto max-w-5xl">
        {(data.title || data.subtitle) && (
          <div className="text-center mb-8">
            {data.title && (
              <h2 className="font-serif text-3xl md:text-4xl font-bold mb-3">{data.title}</h2>
            )}
            {data.subtitle && (
              <p className="text-muted-foreground text-lg">{data.subtitle}</p>
            )}
          </div>
        )}

        <Tabs 
          defaultValue={defaultTab} 
          orientation={orientation === 'vertical' ? 'vertical' : 'horizontal'}
          className={cn(
            orientation === 'vertical' && 'flex gap-8'
          )}
        >
          <TabsList 
            className={cn(
              'w-full justify-start',
              variantStyles[variant].list,
              orientation === 'vertical' && 'flex-col h-auto w-auto items-stretch'
            )}
          >
            {tabs.map((tab) => (
              <TabsTrigger
                key={tab.id}
                value={tab.id}
                className={cn(
                  'flex items-center gap-2 transition-all',
                  variantStyles[variant].trigger
                )}
              >
                {getIcon(tab.icon)}
                {tab.title}
              </TabsTrigger>
            ))}
          </TabsList>

          <div className={cn(orientation === 'vertical' && 'flex-1')}>
            {tabs.map((tab) => (
              <TabsContent 
                key={tab.id} 
                value={tab.id}
                className="mt-6 prose prose-lg dark:prose-invert max-w-none"
              >
                {typeof tab.content === 'string' ? (
                  <div dangerouslySetInnerHTML={{ __html: tab.content }} />
                ) : (
                  <div dangerouslySetInnerHTML={{ __html: renderToHtml(tab.content) }} />
                )}
              </TabsContent>
            ))}
          </div>
        </Tabs>
      </div>
    </section>
  );
}
