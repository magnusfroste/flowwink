import { ReactNode } from 'react';
import { cn } from '@/lib/utils';

interface AdminPageContainerProps {
  children: ReactNode;
  className?: string;
  /** Optional max-width constraint (e.g., 'max-w-2xl', 'max-w-4xl') */
  maxWidth?: string;
}

/**
 * Consistent container wrapper for all admin page content.
 * Provides standard spacing between sections (space-y-6).
 */
export function AdminPageContainer({ 
  children, 
  className,
  maxWidth 
}: AdminPageContainerProps) {
  return (
    <div className={cn('space-y-6', maxWidth, className)}>
      {children}
    </div>
  );
}
