import { ALL_CHANNELS, SupportChannel, channelMeta } from '@/lib/support-channels';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { Loader2 } from 'lucide-react';

interface Props {
  value: SupportChannel[];
  onChange: (next: SupportChannel[]) => void;
  isSaving?: boolean;
}

export function ChannelToggleGroup({ value, onChange, isSaving }: Props) {
  const toggle = (c: SupportChannel) => {
    const set = new Set(value);
    if (set.has(c)) set.delete(c); else set.add(c);
    onChange(Array.from(set));
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
          Channels you accept
        </p>
        {isSaving && <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />}
      </div>
      <div className="flex flex-wrap gap-1.5">
        {ALL_CHANNELS.filter(c => c !== 'voicemail').map(c => {
          const meta = channelMeta[c];
          const Icon = meta.icon;
          const active = value.includes(c);
          return (
            <Button
              key={c}
              size="sm"
              variant={active ? 'default' : 'outline'}
              onClick={() => toggle(c)}
              className={cn('h-7 px-2 gap-1 text-xs', !active && meta.color)}
            >
              <Icon className="h-3 w-3" />
              {meta.label}
            </Button>
          );
        })}
      </div>
      <p className="text-[11px] text-muted-foreground">
        New conversations on un-checked channels won't be routed to you.
      </p>
    </div>
  );
}
