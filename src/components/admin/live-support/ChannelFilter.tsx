import { Button } from '@/components/ui/button';
import { ALL_CHANNELS, SupportChannel, channelMeta } from '@/lib/support-channels';
import { cn } from '@/lib/utils';

interface Props {
  selected: SupportChannel | 'all';
  counts?: Partial<Record<SupportChannel | 'all', number>>;
  onChange: (channel: SupportChannel | 'all') => void;
}

export function ChannelFilter({ selected, counts, onChange }: Props) {
  const entries: Array<{ key: SupportChannel | 'all'; label: string; color?: string }> = [
    { key: 'all', label: 'All' },
    ...ALL_CHANNELS.filter(c => c !== 'voicemail').map(c => ({
      key: c, label: channelMeta[c].label, color: channelMeta[c].color,
    })),
  ];

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {entries.map(({ key, label, color }) => {
        const Icon = key === 'all' ? null : channelMeta[key as SupportChannel].icon;
        const active = selected === key;
        const count = counts?.[key];
        return (
          <Button
            key={key}
            size="sm"
            variant={active ? 'default' : 'outline'}
            className={cn('h-7 px-2 gap-1 text-xs', !active && color)}
            onClick={() => onChange(key)}
          >
            {Icon ? <Icon className="h-3 w-3" /> : null}
            {label}
            {typeof count === 'number' && (
              <span className={cn('ml-1 rounded-full px-1.5 text-[10px]',
                active ? 'bg-primary-foreground/20' : 'bg-muted')}>{count}</span>
            )}
          </Button>
        );
      })}
    </div>
  );
}
