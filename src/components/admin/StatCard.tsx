import { ReactNode } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { LucideIcon } from 'lucide-react';

interface StatCardProps {
  label: string;
  value: string | number | null | undefined;
  icon?: LucideIcon;
  variant?: 'default' | 'primary' | 'success' | 'warning' | 'destructive' | 'muted';
  isLoading?: boolean;
  className?: string;
  subtext?: string;
}

const variantStyles = {
  default: {
    icon: 'bg-muted text-muted-foreground',
    value: 'text-foreground',
  },
  primary: {
    icon: 'bg-primary/10 text-primary',
    value: 'text-foreground',
  },
  success: {
    icon: 'bg-success/10 text-success',
    value: 'text-success',
  },
  warning: {
    icon: 'bg-warning/10 text-warning',
    value: 'text-warning',
  },
  destructive: {
    icon: 'bg-destructive/10 text-destructive',
    value: 'text-destructive',
  },
  muted: {
    icon: 'bg-muted text-muted-foreground',
    value: 'text-muted-foreground',
  },
};

/**
 * Standardized stat card for admin dashboards.
 * Use this component for all statistics displays to ensure UI consistency.
 * 
 * @example
 * <StatCard 
 *   label="Total Orders" 
 *   value={stats.total} 
 *   icon={ShoppingCart} 
 *   variant="primary" 
 * />
 */
export function StatCard({
  label,
  value,
  icon: Icon,
  variant = 'default',
  isLoading = false,
  className,
  subtext,
}: StatCardProps) {
  const styles = variantStyles[variant];

  return (
    <Card className={className}>
      <CardContent className="pt-6">
        <div className="flex items-center gap-4">
          {Icon && (
            <div className={cn('p-3 rounded-lg', styles.icon)}>
              <Icon className="h-5 w-5" />
            </div>
          )}
          <div className="flex-1 min-w-0">
            {isLoading ? (
              <Skeleton className="h-8 w-16" />
            ) : (
              <p className={cn('text-2xl font-bold', styles.value)}>
                {value ?? '—'}
              </p>
            )}
            <p className="text-sm text-muted-foreground truncate">{label}</p>
            {subtext && (
              <p className="text-xs text-muted-foreground mt-0.5">{subtext}</p>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

/**
 * Compact stat card variant for smaller layouts.
 */
export function StatCardCompact({
  label,
  value,
  variant = 'default',
  isLoading = false,
  className,
}: Omit<StatCardProps, 'icon' | 'subtext'>) {
  const styles = variantStyles[variant];

  return (
    <Card className={className}>
      <CardContent className="py-4 px-4">
        <p className="text-xs text-muted-foreground mb-1">{label}</p>
        {isLoading ? (
          <Skeleton className="h-7 w-12" />
        ) : (
          <p className={cn('text-xl font-bold', styles.value)}>
            {value ?? '—'}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
