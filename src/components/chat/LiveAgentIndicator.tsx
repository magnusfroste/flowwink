import { User } from 'lucide-react';
import { cn } from '@/lib/utils';

interface LiveAgentIndicatorProps {
  className?: string;
}

export function LiveAgentIndicator({ className }: LiveAgentIndicatorProps) {
  return (
    <div className={cn(
      'flex items-center gap-2 px-4 py-2.5 bg-primary/10 border-b border-primary/20',
      className
    )}>
      <div className="relative">
        <User className="h-4 w-4 text-primary" />
        <span className="absolute -top-0.5 -right-0.5 h-2 w-2 bg-green-500 rounded-full animate-pulse" />
      </div>
      <span className="text-sm font-medium text-primary">
        You are now chatting with a live agent
      </span>
    </div>
  );
}
