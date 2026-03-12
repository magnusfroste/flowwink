import { cn } from '@/lib/utils';
import { 
  Truck, RotateCcw, ShieldCheck, CreditCard, Clock, Star, 
  HeartHandshake, Award, Leaf, Zap, Globe, Lock 
} from 'lucide-react';

export interface TrustBarItem {
  icon?: string;
  text: string;
}

export interface TrustBarBlockData {
  items?: TrustBarItem[];
  variant?: 'default' | 'bordered' | 'filled';
  size?: 'sm' | 'md' | 'lg';
  columns?: 3 | 4 | 5;
}

interface TrustBarBlockProps {
  data: TrustBarBlockData;
}

const ICON_MAP: Record<string, React.ComponentType<{ className?: string }>> = {
  truck: Truck,
  'rotate-ccw': RotateCcw,
  'shield-check': ShieldCheck,
  'credit-card': CreditCard,
  clock: Clock,
  star: Star,
  'heart-handshake': HeartHandshake,
  award: Award,
  leaf: Leaf,
  zap: Zap,
  globe: Globe,
  lock: Lock,
};

const DEFAULT_ITEMS: TrustBarItem[] = [
  { icon: 'truck', text: 'Free Shipping' },
  { icon: 'rotate-ccw', text: '30-Day Returns' },
  { icon: 'shield-check', text: 'Secure Payment' },
  { icon: 'clock', text: '24/7 Support' },
];

export function TrustBarBlock({ data }: TrustBarBlockProps) {
  const items = data.items?.length ? data.items : DEFAULT_ITEMS;
  const variant = data.variant || 'default';
  const size = data.size || 'md';
  const columns = data.columns || Math.min(items.length, 4) as 3 | 4 | 5;

  const sizeClasses = {
    sm: { icon: 'h-5 w-5', text: 'text-xs', padding: 'py-3', gap: 'gap-2' },
    md: { icon: 'h-6 w-6', text: 'text-sm', padding: 'py-5', gap: 'gap-3' },
    lg: { icon: 'h-8 w-8', text: 'text-base', padding: 'py-6', gap: 'gap-3' },
  };

  const colClasses = {
    3: 'md:grid-cols-3',
    4: 'md:grid-cols-4',
    5: 'md:grid-cols-5',
  };

  const s = sizeClasses[size];

  return (
    <section className={cn(
      s.padding,
      variant === 'filled' && 'bg-muted/40',
      variant === 'bordered' && 'border-y border-border',
    )}>
      <div className="max-w-6xl mx-auto px-4">
        <div className={cn(
          'grid grid-cols-2 gap-4',
          colClasses[columns],
        )}>
          {items.map((item, i) => {
            const IconComponent = ICON_MAP[item.icon || ''] || ShieldCheck;

            return (
              <div
                key={i}
                className={cn(
                  'flex flex-col items-center text-center',
                  s.gap,
                )}
              >
                <div className="flex items-center justify-center text-primary">
                  <IconComponent className={s.icon} />
                </div>
                <span className={cn(
                  'font-medium text-foreground/80',
                  s.text,
                )}>
                  {item.text}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
