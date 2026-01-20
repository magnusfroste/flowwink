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
import type { ModulesSettings } from '@/hooks/useModules';

export interface ChannelConfig {
  icon: LucideIcon;
  label: string;
  color: string;
  disabledColor: string;
  /** Which module must be enabled for this channel to work (null = always available/external) */
  moduleId: keyof ModulesSettings | null;
  /** Hint shown when module is disabled */
  disabledHint?: string;
}

const CHANNEL_CONFIG: Record<ChannelType, ChannelConfig> = {
  blog: { 
    icon: FileText, 
    label: 'Blog', 
    color: 'text-emerald-600 bg-emerald-50',
    disabledColor: 'text-muted-foreground bg-muted',
    moduleId: 'blog',
    disabledHint: 'Enable Blog module to publish here',
  },
  newsletter: { 
    icon: Mail, 
    label: 'Newsletter', 
    color: 'text-blue-600 bg-blue-50',
    disabledColor: 'text-muted-foreground bg-muted',
    moduleId: 'newsletter',
    disabledHint: 'Enable Newsletter module to publish here',
  },
  linkedin: { 
    icon: Linkedin, 
    label: 'LinkedIn', 
    color: 'text-[#0A66C2] bg-[#0A66C2]/10',
    disabledColor: 'text-muted-foreground bg-muted',
    moduleId: null, // External platform - always available
  },
  instagram: { 
    icon: Instagram, 
    label: 'Instagram', 
    color: 'text-[#E4405F] bg-[#E4405F]/10',
    disabledColor: 'text-muted-foreground bg-muted',
    moduleId: null,
  },
  twitter: { 
    icon: Twitter, 
    label: 'X/Twitter', 
    color: 'text-foreground bg-muted',
    disabledColor: 'text-muted-foreground bg-muted/50',
    moduleId: null,
  },
  facebook: { 
    icon: Facebook, 
    label: 'Facebook', 
    color: 'text-[#1877F2] bg-[#1877F2]/10',
    disabledColor: 'text-muted-foreground bg-muted',
    moduleId: null,
  },
  print: { 
    icon: Printer, 
    label: 'Print', 
    color: 'text-gray-600 bg-gray-100',
    disabledColor: 'text-muted-foreground bg-muted',
    moduleId: null,
  },
};

interface ChannelIconProps {
  channel: ChannelType;
  size?: 'sm' | 'md' | 'lg';
  showLabel?: boolean;
  disabled?: boolean;
  className?: string;
}

export function ChannelIcon({ channel, size = 'md', showLabel = false, disabled = false, className }: ChannelIconProps) {
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
      <div className={cn('rounded-md p-1.5', disabled ? config.disabledColor : config.color)}>
        <Icon className={sizeClasses[size]} />
      </div>
      {showLabel && (
        <span className={cn('text-sm font-medium', disabled && 'text-muted-foreground')}>{config.label}</span>
      )}
    </div>
  );
}

export function getChannelConfig(channel: ChannelType): ChannelConfig | undefined {
  return CHANNEL_CONFIG[channel];
}

/** Internal channels that require CMS modules */
export const INTERNAL_CHANNELS: ChannelType[] = ['blog', 'newsletter'];

/** External channels (social platforms, print) */
export const EXTERNAL_CHANNELS: ChannelType[] = ['linkedin', 'instagram', 'twitter', 'facebook', 'print'];

export const ALL_CHANNELS: ChannelType[] = ['blog', 'newsletter', 'linkedin', 'instagram', 'twitter', 'facebook', 'print'];
