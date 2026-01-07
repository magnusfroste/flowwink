import { useEffect, useState, useRef } from 'react';
import { cn } from '@/lib/utils';
import { Users, Star, Activity, TrendingUp, Heart, Eye, MessageCircle, ShoppingCart } from 'lucide-react';

export interface SocialProofItem {
  id: string;
  type: 'counter' | 'rating' | 'activity' | 'custom';
  icon?: 'users' | 'star' | 'activity' | 'trending' | 'heart' | 'eye' | 'message' | 'cart';
  label: string;
  value: string;
  suffix?: string;
  prefix?: string;
  // For rating type
  rating?: number;
  maxRating?: number;
  // For activity type
  timestamp?: string;
  description?: string;
}

export interface SocialProofBlockData {
  title?: string;
  subtitle?: string;
  items: SocialProofItem[];
  variant: 'default' | 'cards' | 'minimal' | 'banner' | 'floating';
  layout: 'horizontal' | 'vertical' | 'grid';
  columns?: 2 | 3 | 4;
  size: 'sm' | 'md' | 'lg';
  animated?: boolean;
  animationDuration?: number;
  showIcons?: boolean;
  // Live activity settings
  showLiveIndicator?: boolean;
  liveText?: string;
}

interface SocialProofBlockProps {
  data: SocialProofBlockData;
}

const ICONS = {
  users: Users,
  star: Star,
  activity: Activity,
  trending: TrendingUp,
  heart: Heart,
  eye: Eye,
  message: MessageCircle,
  cart: ShoppingCart,
};

function AnimatedCounter({ 
  value, 
  duration = 2000,
  prefix = '',
  suffix = '',
}: { 
  value: string;
  duration?: number;
  prefix?: string;
  suffix?: string;
}) {
  const [displayValue, setDisplayValue] = useState('0');
  const ref = useRef<HTMLSpanElement>(null);
  const hasAnimated = useRef(false);

  useEffect(() => {
    const numericValue = parseFloat(value.replace(/[^0-9.]/g, ''));
    const isNumeric = !isNaN(numericValue);

    if (!isNumeric) {
      setDisplayValue(value);
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting && !hasAnimated.current) {
            hasAnimated.current = true;
            
            const startTime = performance.now();
            const isDecimal = value.includes('.');
            const decimals = isDecimal ? (value.split('.')[1]?.length || 1) : 0;
            
            const animate = (currentTime: number) => {
              const elapsed = currentTime - startTime;
              const progress = Math.min(elapsed / duration, 1);
              
              // Easing function for smooth animation
              const easeOutQuart = 1 - Math.pow(1 - progress, 4);
              const current = numericValue * easeOutQuart;
              
              if (isDecimal) {
                setDisplayValue(current.toFixed(decimals));
              } else {
                setDisplayValue(Math.floor(current).toLocaleString());
              }
              
              if (progress < 1) {
                requestAnimationFrame(animate);
              } else {
                // Preserve original formatting
                setDisplayValue(value);
              }
            };
            
            requestAnimationFrame(animate);
          }
        });
      },
      { threshold: 0.1 }
    );

    if (ref.current) {
      observer.observe(ref.current);
    }

    return () => observer.disconnect();
  }, [value, duration]);

  return (
    <span ref={ref}>
      {prefix}{displayValue}{suffix}
    </span>
  );
}

function RatingStars({ rating, maxRating = 5, size = 'md' }: { rating: number; maxRating?: number; size?: 'sm' | 'md' | 'lg' }) {
  const sizeClasses = {
    sm: 'h-3 w-3',
    md: 'h-4 w-4',
    lg: 'h-5 w-5',
  };

  return (
    <div className="flex items-center gap-0.5">
      {Array.from({ length: maxRating }).map((_, i) => (
        <Star
          key={i}
          className={cn(
            sizeClasses[size],
            i < rating 
              ? 'fill-yellow-400 text-yellow-400' 
              : 'fill-muted text-muted'
          )}
        />
      ))}
    </div>
  );
}

function LiveIndicator({ text = 'Live' }: { text?: string }) {
  return (
    <div className="flex items-center gap-2 text-sm">
      <span className="relative flex h-2 w-2">
        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
        <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
      </span>
      <span className="text-muted-foreground">{text}</span>
    </div>
  );
}

export function SocialProofBlock({ data }: SocialProofBlockProps) {
  const {
    title,
    subtitle,
    items = [],
    variant = 'default',
    layout = 'horizontal',
    columns = 4,
    size = 'md',
    animated = true,
    animationDuration = 2000,
    showIcons = true,
    showLiveIndicator = false,
    liveText = 'Live',
  } = data;

  const sizeClasses = {
    sm: {
      value: 'text-xl font-bold',
      label: 'text-xs',
      icon: 'h-4 w-4',
      padding: 'p-3',
    },
    md: {
      value: 'text-2xl md:text-3xl font-bold',
      label: 'text-sm',
      icon: 'h-5 w-5',
      padding: 'p-4',
    },
    lg: {
      value: 'text-3xl md:text-4xl font-bold',
      label: 'text-base',
      icon: 'h-6 w-6',
      padding: 'p-6',
    },
  };

  const getLayoutClasses = () => {
    if (layout === 'horizontal') {
      return 'flex flex-wrap items-center justify-center gap-6 md:gap-8';
    }
    if (layout === 'vertical') {
      return 'flex flex-col gap-4';
    }
    // Grid layout
    const gridCols = {
      2: 'grid-cols-2',
      3: 'grid-cols-2 md:grid-cols-3',
      4: 'grid-cols-2 md:grid-cols-4',
    };
    return cn('grid gap-4', gridCols[columns]);
  };

  const renderItem = (item: SocialProofItem) => {
    const IconComponent = item.icon ? ICONS[item.icon] : null;

    const itemContent = (
      <>
        {showIcons && IconComponent && (
          <div className={cn(
            'text-primary',
            variant === 'cards' && 'mb-2'
          )}>
            <IconComponent className={sizeClasses[size].icon} />
          </div>
        )}
        
        <div className={cn(
          variant === 'minimal' && 'text-center',
          variant === 'cards' && 'text-center'
        )}>
          {item.type === 'rating' ? (
            <div className="space-y-1">
              <div className={sizeClasses[size].value}>
                {item.value}
              </div>
              <RatingStars 
                rating={item.rating || 0} 
                maxRating={item.maxRating || 5} 
                size={size}
              />
              <div className={cn('text-muted-foreground', sizeClasses[size].label)}>
                {item.label}
              </div>
            </div>
          ) : item.type === 'activity' ? (
            <div className="space-y-1">
              <div className={sizeClasses[size].value}>
                {animated ? (
                  <AnimatedCounter 
                    value={item.value} 
                    duration={animationDuration}
                    prefix={item.prefix}
                    suffix={item.suffix}
                  />
                ) : (
                  <>{item.prefix}{item.value}{item.suffix}</>
                )}
              </div>
              <div className={cn('text-muted-foreground', sizeClasses[size].label)}>
                {item.label}
              </div>
              {item.description && (
                <div className="text-xs text-muted-foreground/70">
                  {item.description}
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-1">
              <div className={sizeClasses[size].value}>
                {animated ? (
                  <AnimatedCounter 
                    value={item.value} 
                    duration={animationDuration}
                    prefix={item.prefix}
                    suffix={item.suffix}
                  />
                ) : (
                  <>{item.prefix}{item.value}{item.suffix}</>
                )}
              </div>
              <div className={cn('text-muted-foreground', sizeClasses[size].label)}>
                {item.label}
              </div>
            </div>
          )}
        </div>
      </>
    );

    // Variant-specific wrapper styling
    if (variant === 'cards') {
      return (
        <div 
          key={item.id} 
          className={cn(
            'flex flex-col items-center justify-center rounded-lg border bg-card',
            sizeClasses[size].padding
          )}
        >
          {itemContent}
        </div>
      );
    }

    if (variant === 'minimal') {
      return (
        <div key={item.id} className="flex flex-col items-center">
          {itemContent}
        </div>
      );
    }

    if (variant === 'floating') {
      return (
        <div 
          key={item.id} 
          className={cn(
            'flex items-center gap-3 rounded-full bg-card border shadow-lg',
            sizeClasses[size].padding
          )}
        >
          {itemContent}
        </div>
      );
    }

    // Default variant
    return (
      <div key={item.id} className="flex items-center gap-3">
        {itemContent}
      </div>
    );
  };

  // Banner variant has special layout
  if (variant === 'banner') {
    return (
      <div className="bg-primary text-primary-foreground py-4">
        <div className="container mx-auto px-4">
          <div className="flex flex-wrap items-center justify-center gap-6 md:gap-12">
            {showLiveIndicator && (
              <LiveIndicator text={liveText} />
            )}
            {items.map((item) => (
              <div key={item.id} className="flex items-center gap-2">
                {showIcons && item.icon && (
                  <span className="opacity-80">
                    {(() => {
                      const Icon = ICONS[item.icon];
                      return <Icon className={sizeClasses[size].icon} />;
                    })()}
                  </span>
                )}
                <span className="font-bold">
                  {animated ? (
                    <AnimatedCounter 
                      value={item.value} 
                      duration={animationDuration}
                      prefix={item.prefix}
                      suffix={item.suffix}
                    />
                  ) : (
                    <>{item.prefix}{item.value}{item.suffix}</>
                  )}
                </span>
                <span className="opacity-80">{item.label}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <section className="py-12 md:py-16">
      <div className="container mx-auto px-4">
        {/* Header */}
        {(title || subtitle || showLiveIndicator) && (
          <div className="text-center mb-8 space-y-2">
            {showLiveIndicator && (
              <div className="flex justify-center mb-4">
                <LiveIndicator text={liveText} />
              </div>
            )}
            {title && (
              <h2 className="text-2xl md:text-3xl font-bold font-serif">
                {title}
              </h2>
            )}
            {subtitle && (
              <p className="text-muted-foreground max-w-2xl mx-auto">
                {subtitle}
              </p>
            )}
          </div>
        )}

        {/* Items */}
        <div className={getLayoutClasses()}>
          {items.map(renderItem)}
        </div>
      </div>
    </section>
  );
}
