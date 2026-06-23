import { type SupportChannel, channelMeta } from '@/lib/support-channels';
import { cn } from '@/lib/utils';

interface LiveAgentIndicatorProps {
  className?: string;
  channel?: SupportChannel;
  agentName?: string;
}

export function LiveAgentIndicator({ className, channel = 'web', agentName }: LiveAgentIndicatorProps) {
  const meta = channelMeta[channel];
  const Icon = meta.icon;

  const copy = (() => {
    const who = agentName ? `with ${agentName}` : 'with a teammate';
    switch (channel) {
      case 'telegram': return `You're now connected ${who} on Telegram`;
      case 'sms':      return `${agentName ?? 'A teammate'} is replying by SMS`;
      case 'voice':    return `${agentName ?? 'A teammate'} is on the line`;
      case 'voicemail':return `${agentName ?? 'A teammate'} will follow up on your voicemail`;
      case 'web':
      default:         return `You are now chatting ${who}`;
    }
  })();

  return (
    <div className={cn(
      'flex items-center gap-2 px-4 py-2.5 border-b',
      meta.bg, 'border-current/20',
      className
    )}>
      <div className="relative">
        <Icon className={cn('h-4 w-4', meta.color)} />
        <span className="absolute -top-0.5 -right-0.5 h-2 w-2 bg-green-500 rounded-full animate-pulse" />
      </div>
      <span className={cn('text-sm font-medium', meta.color)}>
        {copy}
      </span>
    </div>
  );
}
