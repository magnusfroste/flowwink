import { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Card, CardContent } from '@/components/ui/card';

interface EmptyStateProps {
  icon?: LucideIcon;
  title: string;
  description?: string;
  action?: React.ReactNode;
  secondaryAction?: React.ReactNode;
  className?: string;
  /** When true, wraps in a Card. Defaults to true. */
  card?: boolean;
  /** Compact variant for inline lists / small containers. */
  compact?: boolean;
}

/**
 * Shared empty-state UI for admin pages, lists and cards.
 * Keep visuals consistent: icon (optional) + title + description + primary CTA.
 */
export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  secondaryAction,
  className,
  card = true,
  compact = false,
}: EmptyStateProps) {
  const content = (
    <div
      className={cn(
        'flex flex-col items-center justify-center text-center',
        compact ? 'py-6 px-4' : 'py-12 px-6',
        className,
      )}
    >
      {Icon && (
        <div
          className={cn(
            'flex items-center justify-center rounded-full bg-muted mb-4',
            compact ? 'h-10 w-10' : 'h-14 w-14',
          )}
        >
          <Icon
            className={cn(
              'text-muted-foreground',
              compact ? 'h-5 w-5' : 'h-6 w-6',
            )}
          />
        </div>
      )}
      <h3
        className={cn(
          'font-medium text-foreground',
          compact ? 'text-sm' : 'text-lg',
        )}
      >
        {title}
      </h3>
      {description && (
        <p
          className={cn(
            'text-muted-foreground max-w-md',
            compact ? 'text-xs mt-1' : 'text-sm mt-2',
          )}
        >
          {description}
        </p>
      )}
      {(action || secondaryAction) && (
        <div className={cn('flex flex-wrap items-center justify-center gap-2', compact ? 'mt-3' : 'mt-5')}>
          {action}
          {secondaryAction}
        </div>
      )}
    </div>
  );

  if (!card) return content;

  return (
    <Card className="border-dashed">
      <CardContent className="p-0">{content}</CardContent>
    </Card>
  );
}
