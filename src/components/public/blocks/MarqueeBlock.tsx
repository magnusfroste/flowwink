import { useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';

export interface MarqueeItem {
  id: string;
  text: string;
  icon?: string;
}

export interface MarqueeBlockData {
  items: MarqueeItem[];
  speed?: 'slow' | 'normal' | 'fast';
  direction?: 'left' | 'right';
  pauseOnHover?: boolean;
  separator?: string;
  variant?: 'default' | 'gradient' | 'outlined';
}

interface MarqueeBlockProps {
  data: MarqueeBlockData;
}

export function MarqueeBlock({ data }: MarqueeBlockProps) {
  const items = data.items || [];
  const speed = data.speed || 'normal';
  const direction = data.direction || 'left';
  const pauseOnHover = data.pauseOnHover ?? true;
  const separator = data.separator || '•';
  const variant = data.variant || 'default';

  if (items.length === 0) return null;

  const speedMap = {
    slow: '40s',
    normal: '25s',
    fast: '15s',
  };

  const variantStyles = {
    default: 'bg-muted/50 text-foreground',
    gradient: 'bg-gradient-to-r from-primary/10 via-primary/5 to-primary/10 text-foreground',
    outlined: 'bg-transparent border-y border-border text-foreground',
  };

  // Duplicate items for seamless loop
  const duplicatedItems = [...items, ...items, ...items];

  return (
    <section className={cn('py-4 overflow-hidden', variantStyles[variant])}>
      <div 
        className={cn(
          'flex whitespace-nowrap',
          pauseOnHover && 'hover:[animation-play-state:paused]'
        )}
        style={{
          animation: `marquee ${speedMap[speed]} linear infinite`,
          animationDirection: direction === 'right' ? 'reverse' : 'normal',
        }}
      >
        {duplicatedItems.map((item, index) => (
          <span 
            key={`${item.id}-${index}`}
            className="inline-flex items-center gap-3 px-6 text-lg font-medium"
          >
            {item.icon && <span>{item.icon}</span>}
            <span>{item.text}</span>
            <span className="text-muted-foreground/50">{separator}</span>
          </span>
        ))}
      </div>

      <style>{`
        @keyframes marquee {
          0% {
            transform: translateX(0);
          }
          100% {
            transform: translateX(-33.333%);
          }
        }
      `}</style>
    </section>
  );
}
