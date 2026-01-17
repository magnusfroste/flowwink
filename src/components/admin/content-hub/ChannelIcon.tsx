import { 
  FileText, 
  Mail, 
  Linkedin, 
  Instagram, 
  Twitter, 
  Facebook, 
  Printer,
  LucideIcon 
} from 'lucide-react';
import { ChannelType } from '@/hooks/useContentProposals';
import { cn } from '@/lib/utils';

const CHANNEL_CONFIG: Record<ChannelType, { icon: LucideIcon; label: string; color: string }> = {
  blog: { icon: FileText, label: 'Blog', color: 'text-emerald-600 bg-emerald-50' },
  newsletter: { icon: Mail, label: 'Newsletter', color: 'text-blue-600 bg-blue-50' },
  linkedin: { icon: Linkedin, label: 'LinkedIn', color: 'text-[#0A66C2] bg-[#0A66C2]/10' },
  instagram: { icon: Instagram, label: 'Instagram', color: 'text-[#E4405F] bg-[#E4405F]/10' },
  twitter: { icon: Twitter, label: 'X/Twitter', color: 'text-foreground bg-muted' },
  facebook: { icon: Facebook, label: 'Facebook', color: 'text-[#1877F2] bg-[#1877F2]/10' },
  print: { icon: Printer, label: 'Print', color: 'text-gray-600 bg-gray-100' },
};

interface ChannelIconProps {
  channel: ChannelType;
  size?: 'sm' | 'md' | 'lg';
  showLabel?: boolean;
  className?: string;
}

export function ChannelIcon({ channel, size = 'md', showLabel = false, className }: ChannelIconProps) {
  const config = CHANNEL_CONFIG[channel];
  if (!config) return null;

  const Icon = config.icon;
  const sizeClasses = {
    sm: 'h-4 w-4',
    md: 'h-5 w-5',
    lg: 'h-6 w-6',
  };

  return (
    <div className={cn('flex items-center gap-1.5', className)}>
      <div className={cn('rounded-md p-1.5', config.color)}>
        <Icon className={sizeClasses[size]} />
      </div>
      {showLabel && (
        <span className="text-sm font-medium">{config.label}</span>
      )}
    </div>
  );
}

export function getChannelConfig(channel: ChannelType) {
  return CHANNEL_CONFIG[channel];
}

export const ALL_CHANNELS: ChannelType[] = ['blog', 'newsletter', 'linkedin', 'instagram', 'twitter', 'facebook', 'print'];
