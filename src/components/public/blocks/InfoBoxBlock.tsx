import { InfoBoxBlockData } from '@/types/cms';
import { Info, CheckCircle, AlertTriangle, Lightbulb } from 'lucide-react';

interface InfoBoxBlockProps {
  data: InfoBoxBlockData;
}

const variantStyles = {
  info: {
    bg: 'bg-blue-50 dark:bg-blue-950/30',
    border: 'border-blue-200 dark:border-blue-800',
    icon: 'text-blue-600 dark:text-blue-400',
    IconComponent: Info,
  },
  success: {
    bg: 'bg-green-50 dark:bg-green-950/30',
    border: 'border-green-200 dark:border-green-800',
    icon: 'text-green-600 dark:text-green-400',
    IconComponent: CheckCircle,
  },
  warning: {
    bg: 'bg-amber-50 dark:bg-amber-950/30',
    border: 'border-amber-200 dark:border-amber-800',
    icon: 'text-amber-600 dark:text-amber-400',
    IconComponent: AlertTriangle,
  },
  highlight: {
    bg: 'bg-primary/5',
    border: 'border-primary/20',
    icon: 'text-primary',
    IconComponent: Lightbulb,
  },
};

export function InfoBoxBlock({ data }: InfoBoxBlockProps) {
  const style = variantStyles[data.variant] || variantStyles.info;
  const Icon = style.IconComponent;

  return (
    <section className="py-8 px-6">
      <div className="container mx-auto max-w-3xl">
        <div className={`p-6 rounded-lg border ${style.bg} ${style.border}`}>
          <div className="flex items-start gap-4">
            <Icon className={`h-6 w-6 shrink-0 mt-0.5 ${style.icon}`} />
            <div>
              {data.title && (
                <h3 className="font-semibold mb-2">{data.title}</h3>
              )}
              <div 
                className="prose prose-sm max-w-none"
                dangerouslySetInnerHTML={{ __html: data.content || '' }}
              />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
