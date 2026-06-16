import { Globe, Send, MessageSquare, Phone, Voicemail, type LucideIcon } from 'lucide-react';

export type SupportChannel = 'web' | 'telegram' | 'sms' | 'voice' | 'voicemail';

export const ALL_CHANNELS: SupportChannel[] = ['web', 'telegram', 'sms', 'voice', 'voicemail'];

export const channelMeta: Record<SupportChannel, {
  label: string;
  icon: LucideIcon;
  color: string;            // tailwind text color for icon
  bg: string;               // muted bg chip
  composerPlaceholder: string;
}> = {
  web:       { label: 'Web chat', icon: Globe,         color: 'text-blue-500',    bg: 'bg-blue-500/10',    composerPlaceholder: 'Type your reply…' },
  telegram:  { label: 'Telegram', icon: Send,          color: 'text-sky-500',     bg: 'bg-sky-500/10',     composerPlaceholder: 'Reply on Telegram…' },
  sms:       { label: 'SMS',      icon: MessageSquare, color: 'text-emerald-500', bg: 'bg-emerald-500/10', composerPlaceholder: 'Send SMS (160 chars recommended)…' },
  voice:     { label: 'Voice',    icon: Phone,         color: 'text-violet-500',  bg: 'bg-violet-500/10',  composerPlaceholder: 'Add internal note for this call…' },
  voicemail: { label: 'Voicemail',icon: Voicemail,     color: 'text-amber-500',   bg: 'bg-amber-500/10',   composerPlaceholder: 'Reply to voicemail…' },
};

export function getChannel(value: unknown): SupportChannel {
  const v = typeof value === 'string' ? value.toLowerCase() : '';
  return (ALL_CHANNELS as string[]).includes(v) ? (v as SupportChannel) : 'web';
}

export function ChannelIcon({ channel, className }: { channel: SupportChannel; className?: string }) {
  const meta = channelMeta[channel];
  const Icon = meta.icon;
  return <Icon className={className ?? `h-3.5 w-3.5 ${meta.color}`} />;
}

export function ChannelChip({ channel }: { channel: SupportChannel }) {
  const meta = channelMeta[channel];
  const Icon = meta.icon;
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${meta.bg} ${meta.color}`}>
      <Icon className="h-3 w-3" />
      {meta.label}
    </span>
  );
}
