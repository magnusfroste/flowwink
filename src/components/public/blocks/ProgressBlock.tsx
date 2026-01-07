import { useEffect, useState, useRef } from 'react';
import { cn } from '@/lib/utils';

export interface ProgressItem {
  id: string;
  label: string;
  value: number; // 0-100
  color?: string;
  icon?: string;
}

export interface ProgressBlockData {
  title?: string;
  subtitle?: string;
  items: ProgressItem[];
  variant: 'default' | 'circular' | 'minimal' | 'cards';
  size: 'sm' | 'md' | 'lg';
  showPercentage: boolean;
  showLabels: boolean;
  animated: boolean;
  animationDuration?: number; // in ms
}

interface ProgressBlockProps {
  data: ProgressBlockData;
}

const sizeConfig = {
  sm: { bar: 'h-2', text: 'text-sm', circular: 80, stroke: 6 },
  md: { bar: 'h-3', text: 'text-base', circular: 100, stroke: 8 },
  lg: { bar: 'h-4', text: 'text-lg', circular: 120, stroke: 10 },
};

function CircularProgress({ 
  value, 
  size, 
  strokeWidth, 
  animated, 
  duration,
  showPercentage,
  label,
}: { 
  value: number; 
  size: number; 
  strokeWidth: number; 
  animated: boolean;
  duration: number;
  showPercentage: boolean;
  label?: string;
}) {
  const [currentValue, setCurrentValue] = useState(animated ? 0 : value);
  const ref = useRef<SVGSVGElement>(null);
  const hasAnimated = useRef(false);
  
  const radius = (size - strokeWidth) / 2;
  const circumference = radius * 2 * Math.PI;
  const offset = circumference - (currentValue / 100) * circumference;

  useEffect(() => {
    if (!animated || hasAnimated.current) return;
    
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting && !hasAnimated.current) {
            hasAnimated.current = true;
            const startTime = Date.now();
            const animate = () => {
              const elapsed = Date.now() - startTime;
              const progress = Math.min(elapsed / duration, 1);
              setCurrentValue(Math.floor(progress * value));
              if (progress < 1) {
                requestAnimationFrame(animate);
              }
            };
            requestAnimationFrame(animate);
          }
        });
      },
      { threshold: 0.2 }
    );

    if (ref.current) {
      observer.observe(ref.current);
    }

    return () => observer.disconnect();
  }, [animated, duration, value]);

  return (
    <div className="flex flex-col items-center gap-2">
      <svg
        ref={ref}
        width={size}
        height={size}
        className="transform -rotate-90"
      >
        {/* Background circle */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeWidth={strokeWidth}
          className="text-muted/30"
        />
        {/* Progress circle */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeWidth={strokeWidth}
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          className="text-primary transition-all duration-300"
        />
      </svg>
      <div className="text-center">
        {showPercentage && (
          <div className="text-2xl font-bold">{currentValue}%</div>
        )}
        {label && (
          <div className="text-sm text-muted-foreground">{label}</div>
        )}
      </div>
    </div>
  );
}

function LinearProgress({ 
  value, 
  sizeClass,
  animated, 
  duration,
  showPercentage,
  label,
}: { 
  value: number; 
  sizeClass: string;
  animated: boolean;
  duration: number;
  showPercentage: boolean;
  label?: string;
}) {
  const [currentValue, setCurrentValue] = useState(animated ? 0 : value);
  const ref = useRef<HTMLDivElement>(null);
  const hasAnimated = useRef(false);

  useEffect(() => {
    if (!animated || hasAnimated.current) return;
    
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting && !hasAnimated.current) {
            hasAnimated.current = true;
            const startTime = Date.now();
            const animate = () => {
              const elapsed = Date.now() - startTime;
              const progress = Math.min(elapsed / duration, 1);
              setCurrentValue(Math.floor(progress * value));
              if (progress < 1) {
                requestAnimationFrame(animate);
              }
            };
            requestAnimationFrame(animate);
          }
        });
      },
      { threshold: 0.2 }
    );

    if (ref.current) {
      observer.observe(ref.current);
    }

    return () => observer.disconnect();
  }, [animated, duration, value]);

  return (
    <div ref={ref} className="space-y-2">
      {(label || showPercentage) && (
        <div className="flex justify-between items-center">
          {label && <span className="text-sm font-medium">{label}</span>}
          {showPercentage && (
            <span className="text-sm text-muted-foreground">{currentValue}%</span>
          )}
        </div>
      )}
      <div className={cn('w-full bg-muted/30 rounded-full overflow-hidden', sizeClass)}>
        <div
          className="h-full bg-primary rounded-full transition-all duration-300"
          style={{ width: `${currentValue}%` }}
        />
      </div>
    </div>
  );
}

export function ProgressBlock({ data }: ProgressBlockProps) {
  const { 
    title, 
    subtitle, 
    items = [], 
    variant = 'default', 
    size = 'md',
    showPercentage = true,
    showLabels = true,
    animated = true,
    animationDuration = 1500,
  } = data;

  const config = sizeConfig[size];

  if (items.length === 0) {
    return (
      <div className="py-12 text-center text-muted-foreground">
        No progress items configured
      </div>
    );
  }

  return (
    <section className="py-12">
      <div className="container mx-auto px-4">
        {/* Header */}
        {(title || subtitle) && (
          <div className="text-center mb-10">
            {title && (
              <h2 className="text-3xl font-bold tracking-tight mb-3">{title}</h2>
            )}
            {subtitle && (
              <p className="text-muted-foreground max-w-2xl mx-auto">{subtitle}</p>
            )}
          </div>
        )}

        {/* Progress items */}
        {variant === 'circular' ? (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-8">
            {items.map((item) => (
              <CircularProgress
                key={item.id}
                value={item.value}
                size={config.circular}
                strokeWidth={config.stroke}
                animated={animated}
                duration={animationDuration}
                showPercentage={showPercentage}
                label={showLabels ? item.label : undefined}
              />
            ))}
          </div>
        ) : variant === 'cards' ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {items.map((item) => (
              <div key={item.id} className="p-6 rounded-lg border bg-card">
                <LinearProgress
                  value={item.value}
                  sizeClass={config.bar}
                  animated={animated}
                  duration={animationDuration}
                  showPercentage={showPercentage}
                  label={showLabels ? item.label : undefined}
                />
              </div>
            ))}
          </div>
        ) : variant === 'minimal' ? (
          <div className="space-y-6 max-w-2xl mx-auto">
            {items.map((item) => (
              <div key={item.id} className="flex items-center gap-4">
                {showLabels && (
                  <span className="text-sm font-medium w-32 shrink-0">{item.label}</span>
                )}
                <div className={cn('flex-1 bg-muted/30 rounded-full overflow-hidden', config.bar)}>
                  <LinearProgress
                    value={item.value}
                    sizeClass={config.bar}
                    animated={animated}
                    duration={animationDuration}
                    showPercentage={false}
                  />
                </div>
                {showPercentage && (
                  <span className="text-sm text-muted-foreground w-12 text-right">{item.value}%</span>
                )}
              </div>
            ))}
          </div>
        ) : (
          // Default variant
          <div className="space-y-6 max-w-3xl mx-auto">
            {items.map((item) => (
              <LinearProgress
                key={item.id}
                value={item.value}
                sizeClass={config.bar}
                animated={animated}
                duration={animationDuration}
                showPercentage={showPercentage}
                label={showLabels ? item.label : undefined}
              />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
