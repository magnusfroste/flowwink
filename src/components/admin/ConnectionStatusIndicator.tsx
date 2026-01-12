import { useConnectionStatus, type ConnectionStatus } from '@/hooks/useConnectionStatus';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Database, RefreshCw } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ConnectionStatusIndicatorProps {
  collapsed?: boolean;
}

const statusConfig: Record<ConnectionStatus, { label: string; color: string; bgColor: string }> = {
  connected: {
    label: 'Connected',
    color: 'text-emerald-500',
    bgColor: 'bg-emerald-500',
  },
  disconnected: {
    label: 'Disconnected',
    color: 'text-destructive',
    bgColor: 'bg-destructive',
  },
  checking: {
    label: 'Checking...',
    color: 'text-muted-foreground',
    bgColor: 'bg-muted-foreground',
  },
};

export function ConnectionStatusIndicator({ collapsed = false }: ConnectionStatusIndicatorProps) {
  const { status, lastChecked, checkConnection } = useConnectionStatus();
  const config = statusConfig[status];

  const formatLastChecked = () => {
    if (!lastChecked) return 'Never';
    const seconds = Math.floor((Date.now() - lastChecked.getTime()) / 1000);
    if (seconds < 60) return 'Just now';
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
    return `${Math.floor(seconds / 3600)}h ago`;
  };

  const content = (
    <button
      onClick={checkConnection}
      className={cn(
        "flex items-center gap-2 w-full px-2 py-1.5 text-xs rounded-md transition-colors",
        "hover:bg-sidebar-accent text-sidebar-foreground/60 hover:text-sidebar-foreground"
      )}
    >
      <div className="relative">
        <Database className="h-3.5 w-3.5" />
        <span
          className={cn(
            "absolute -bottom-0.5 -right-0.5 h-2 w-2 rounded-full border border-sidebar",
            config.bgColor,
            status === 'checking' && 'animate-pulse'
          )}
        />
      </div>
      {!collapsed && (
        <>
          <span className={cn("flex-1 text-left", config.color)}>
            {config.label}
          </span>
          {status !== 'checking' && (
            <RefreshCw className="h-3 w-3 opacity-0 group-hover:opacity-100 transition-opacity" />
          )}
        </>
      )}
    </button>
  );

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div className="group">{content}</div>
      </TooltipTrigger>
      <TooltipContent side={collapsed ? "right" : "top"} className="text-xs">
        <div className="space-y-1">
          <div className="font-medium">Database: {config.label}</div>
          <div className="text-muted-foreground">Last checked: {formatLastChecked()}</div>
          <div className="text-muted-foreground">Click to refresh</div>
        </div>
      </TooltipContent>
    </Tooltip>
  );
}
