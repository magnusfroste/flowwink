import { type SupportChannel, channelMeta } from '@/lib/support-channels';
import { useUiText } from '@/lib/ui-text';
import { cn } from '@/lib/utils';

interface LiveAgentIndicatorProps {
  className?: string;
  channel?: SupportChannel;
  agentName?: string;
}

export function LiveAgentIndicator({ className, channel = 'web', agentName }: LiveAgentIndicatorProps) {
  const t = useUiText();
  const meta = channelMeta[channel];
  const Icon = meta.icon;

  const template = (() => {
    switch (channel) {
      case 'telegram': return t('chat.live.telegram', "You're now connected with {name} on Telegram");
      case 'sms':      return t('chat.live.sms', '{name} is replying by SMS');
      case 'voice':    return t('chat.live.voice', '{name} is on the line');
      case 'voicemail':return t('chat.live.voicemail', '{name} will follow up on your voicemail');
      case 'web':
      default:         return t('chat.live.web', 'You are now chatting with {name}');
    }
  })();

  const filled = template.replace('{name}', agentName ?? t('chat.live.teammate', 'a teammate'));
  // The teammate fallback is lowercase ("a teammate") so it reads right
  // mid-sentence; when a template leads with {name} the sentence still needs
  // its capital. No-op for strings that already start uppercase.
  const copy = filled.charAt(0).toUpperCase() + filled.slice(1);

  return (
    <div className={cn(
      'flex items-center gap-2 px-4 py-2.5 border-b',
      meta.bg, 'border-current/20',
      className
    )}>
      <div className="relative">
        <Icon className={cn('h-4 w-4', meta.color)} />
        <span className="absolute -top-0.5 -right-0.5 h-2 w-2 bg-success rounded-full animate-pulse" />
      </div>
      <span className={cn('text-sm font-medium', meta.color)}>
        {copy}
      </span>
    </div>
  );
}
