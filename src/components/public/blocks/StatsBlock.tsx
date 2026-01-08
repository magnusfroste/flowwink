import { useState, useEffect, useRef, useCallback } from 'react';
import { StatsBlockData } from '@/types/cms';
import { icons, LucideIcon } from 'lucide-react';

interface StatsBlockProps {
  data: StatsBlockData;
}

// Parse a stat value to extract numeric parts for animation
function parseStatValue(value: string): { prefix: string; number: number; suffix: string } | null {
  // Match patterns like "500+", "$1.2M", "99%", "10k+", etc.
  const match = value.match(/^([^\d]*)([\d,.]+)(.*)$/);
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

// Animated counter component
function AnimatedStat({ 
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

export function StatsBlock({ data }: StatsBlockProps) {
  const stats = data.stats || [];
  const [isVisible, setIsVisible] = useState(false);
  const containerRef = useRef<HTMLElement>(null);
  const animated = data.animated !== false; // Default to true
  const duration = data.animationDuration || 2000;

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

  return (
    <section ref={containerRef} className="py-12 md:py-20 bg-primary/5">
      <div className="container mx-auto px-4">
        {data.title && (
          <h2 className="text-2xl md:text-3xl font-serif font-bold text-center mb-12">
            {data.title}
          </h2>
        )}

        <div className={`grid ${gridCols} gap-8 max-w-5xl mx-auto`}>
          {stats.map((stat, index) => (
            <div
              key={index}
              className="text-center p-6 bg-background rounded-xl shadow-sm"
              style={{
                animationDelay: animated ? `${index * 100}ms` : undefined,
              }}
            >
              {stat.icon && (
                <div className="flex justify-center mb-4 text-primary">
                  {getIcon(stat.icon)}
                </div>
              )}
              <div className="text-4xl md:text-5xl font-bold text-primary mb-2">
                {animated ? (
                  <AnimatedStat 
                    value={stat.value} 
                    isVisible={isVisible}
                    duration={duration}
                  />
                ) : (
                  stat.value
                )}
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
