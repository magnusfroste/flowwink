import { useState, useEffect, useRef } from 'react';
import { StatsBlockData, StatsAnimationStyle } from '@/types/cms';
import { icons, LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

interface StatsBlockProps {
  data: StatsBlockData;
}

// Parse a stat value to extract numeric parts for animation
function parseStatValue(value: string | number | undefined): { prefix: string; number: number; suffix: string } | null {
  const valueStr = String(value ?? '');
  // Match patterns like "500+", "$1.2M", "99%", "10k+", etc.
  const match = valueStr.match(/^([^\d]*)([\d,.]+)(.*)$/);
  if (!match) return null;
  
  const [, prefix, numStr, suffix] = match;
  const number = parseFloat(numStr.replace(/,/g, ''));
  
  if (isNaN(number)) return null;
  return { prefix, number, suffix };
}

// Format number back to string with proper formatting
function formatNumber(num: number, originalValue: string): string {
  // Preserve original formatting (commas, decimals, etc.)
  const hasDecimal = originalValue.includes('.');
  const decimalPlaces = hasDecimal ? (originalValue.split('.')[1]?.match(/\d+/)?.[0]?.length || 0) : 0;
  
  if (decimalPlaces > 0) {
    return num.toFixed(decimalPlaces);
  }
  
  // Add commas for thousands
  if (originalValue.includes(',') || num >= 1000) {
    return num.toLocaleString('en-US', { maximumFractionDigits: 0 });
  }
  
  return Math.round(num).toString();
}

// Count-up animation component
function CountUpStat({ 
  value, 
  isVisible, 
  duration = 2000 
}: { 
  value: string; 
  isVisible: boolean;
  duration: number;
}) {
  const [displayValue, setDisplayValue] = useState(value);
  const animationRef = useRef<number>();
  const startTimeRef = useRef<number>();
  const hasAnimatedRef = useRef(false);
  
  useEffect(() => {
    const parsed = parseStatValue(value);
    
    // Don't re-animate if already completed
    if (hasAnimatedRef.current) {
      return;
    }
    
    if (!isVisible || !parsed) {
      setDisplayValue(value);
      return;
    }
    
    const { prefix, number, suffix } = parsed;
    const startValue = 0;
    const endValue = number;
    
    const animate = (timestamp: number) => {
      if (!startTimeRef.current) {
        startTimeRef.current = timestamp;
      }
      
      const elapsed = timestamp - startTimeRef.current;
      const progress = Math.min(elapsed / duration, 1);
      
      // Ease-out cubic for smooth deceleration
      const easeOut = 1 - Math.pow(1 - progress, 3);
      const currentValue = startValue + (endValue - startValue) * easeOut;
      
      setDisplayValue(`${prefix}${formatNumber(currentValue, value)}${suffix}`);
      
      if (progress < 1) {
        animationRef.current = requestAnimationFrame(animate);
      } else {
        // Mark animation as complete
        hasAnimatedRef.current = true;
      }
    };
    
    startTimeRef.current = undefined;
    animationRef.current = requestAnimationFrame(animate);
    
    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [isVisible, value, duration]);
  
  return <>{displayValue}</>;
}

// Typewriter animation component
function TypewriterStat({ 
  value, 
  isVisible, 
  duration = 2000 
}: { 
  value: string; 
  isVisible: boolean;
  duration: number;
}) {
  const [displayValue, setDisplayValue] = useState('');
  const hasAnimatedRef = useRef(false);
  
  useEffect(() => {
    if (hasAnimatedRef.current || !isVisible) {
      if (!isVisible) setDisplayValue('');
      return;
    }
    
    const chars = value.split('');
    const charDelay = duration / chars.length;
    let currentIndex = 0;
    
    const interval = setInterval(() => {
      currentIndex++;
      setDisplayValue(value.slice(0, currentIndex));
      
      if (currentIndex >= chars.length) {
        clearInterval(interval);
        hasAnimatedRef.current = true;
      }
    }, charDelay);
    
    return () => clearInterval(interval);
  }, [isVisible, value, duration]);
  
  return <>{displayValue || '\u00A0'}</>;
}

// Animated stat wrapper for fade-in and slide-up
function AnimatedStatWrapper({ 
  children, 
  isVisible, 
  style,
  duration,
  delay = 0
}: { 
  children: React.ReactNode;
  isVisible: boolean;
  style: StatsAnimationStyle;
  duration: number;
  delay?: number;
}) {
  const [hasAnimated, setHasAnimated] = useState(false);
  
  useEffect(() => {
    if (isVisible && !hasAnimated) {
      const timer = setTimeout(() => setHasAnimated(true), delay);
      return () => clearTimeout(timer);
    }
  }, [isVisible, hasAnimated, delay]);
  
  const shouldShow = hasAnimated || !isVisible;
  const durationMs = duration;
  
  if (style === 'fade-in') {
    return (
      <span
        className={cn(
          'inline-block transition-opacity',
          shouldShow ? 'opacity-100' : 'opacity-0'
        )}
        style={{ transitionDuration: `${durationMs}ms` }}
      >
        {children}
      </span>
    );
  }
  
  if (style === 'slide-up') {
    return (
      <span
        className={cn(
          'inline-block transition-all',
          shouldShow ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'
        )}
        style={{ transitionDuration: `${durationMs}ms` }}
      >
        {children}
      </span>
    );
  }
  
  return <>{children}</>;
}

export function StatsBlock({ data }: StatsBlockProps) {
  const stats = data.stats || [];
  const [isVisible, setIsVisible] = useState(false);
  const containerRef = useRef<HTMLElement>(null);
  const animated = data.animated !== false; // Default to true
  const duration = data.animationDuration || 2000;
  const animationStyle: StatsAnimationStyle = data.animationStyle || 'count-up';

  // Intersection Observer to trigger animation when visible
  useEffect(() => {
    if (!animated || !containerRef.current) {
      setIsVisible(true);
      return;
    }
    
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true);
          observer.disconnect();
        }
      },
      { threshold: 0.3 }
    );
    
    observer.observe(containerRef.current);
    
    return () => observer.disconnect();
  }, [animated]);

  if (stats.length === 0) return null;

  const getIcon = (iconName?: string) => {
    if (!iconName) return null;
    const Icon = icons[iconName as keyof typeof icons] as LucideIcon | undefined;
    return Icon ? <Icon className="h-6 w-6" /> : null;
  };

  const gridCols = {
    1: 'grid-cols-1',
    2: 'grid-cols-1 sm:grid-cols-2',
    3: 'grid-cols-1 sm:grid-cols-3',
    4: 'grid-cols-2 sm:grid-cols-4',
  }[Math.min(stats.length, 4) as 1 | 2 | 3 | 4];

  const renderStatValue = (value: string, index: number) => {
    if (!animated) return value;
    
    const delay = index * 150; // Stagger animations
    
    switch (animationStyle) {
      case 'count-up':
        return (
          <CountUpStat 
            value={value} 
            isVisible={isVisible}
            duration={duration}
          />
        );
      case 'typewriter':
        return (
          <TypewriterStat 
            value={value} 
            isVisible={isVisible}
            duration={duration}
          />
        );
      case 'fade-in':
      case 'slide-up':
        return (
          <AnimatedStatWrapper
            isVisible={isVisible}
            style={animationStyle}
            duration={duration}
            delay={delay}
          >
            {value}
          </AnimatedStatWrapper>
        );
      default:
        return value;
    }
  };

  return (
    <section ref={containerRef} className="py-12 md:py-20 bg-primary/5">
      <div className="container mx-auto px-4">
        {data.title && (
          <h2 className="text-2xl md:text-3xl font-serif font-bold text-center mb-12">
            {data.title}
          </h2>
        )}

        <div className={`grid ${gridCols} gap-8 max-w-6xl mx-auto`}>
          {stats.map((stat, index) => (
            <div
              key={index}
              className="text-center p-6 bg-background rounded-xl shadow-sm"
            >
              {stat.icon && (
                <div className="flex justify-center mb-4 text-primary">
                  {getIcon(stat.icon)}
                </div>
              )}
              <div className="text-4xl md:text-5xl font-bold text-primary mb-2">
                {renderStatValue(stat.value, index)}
              </div>
              <div className="text-muted-foreground font-medium">
                {stat.label}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
