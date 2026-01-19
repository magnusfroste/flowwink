import { useState, useEffect, useMemo } from 'react';
import { cn } from '@/lib/utils';

export interface CountdownBlockData {
  title?: string;
  subtitle?: string;
  targetDate: string; // ISO date string
  expiredMessage?: string;
  showDays?: boolean;
  showHours?: boolean;
  showMinutes?: boolean;
  showSeconds?: boolean;
  variant: 'default' | 'cards' | 'minimal' | 'hero';
  size: 'sm' | 'md' | 'lg';
  labels?: {
    days?: string;
    hours?: string;
    minutes?: string;
    seconds?: string;
  };
}

interface TimeLeft {
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
  expired: boolean;
}

function calculateTimeLeft(targetDate: string): TimeLeft {
  const difference = new Date(targetDate).getTime() - new Date().getTime();

  if (difference <= 0) {
    return { days: 0, hours: 0, minutes: 0, seconds: 0, expired: true };
  }

  return {
    days: Math.floor(difference / (1000 * 60 * 60 * 24)),
    hours: Math.floor((difference / (1000 * 60 * 60)) % 24),
    minutes: Math.floor((difference / 1000 / 60) % 60),
    seconds: Math.floor((difference / 1000) % 60),
    expired: false,
  };
}

interface CountdownBlockProps {
  data: CountdownBlockData;
}

export function CountdownBlock({ data }: CountdownBlockProps) {
  const {
    title,
    subtitle,
    targetDate,
    expiredMessage = 'Time has expired!',
    showDays = true,
    showHours = true,
    showMinutes = true,
    showSeconds = true,
    variant = 'default',
    size = 'md',
    labels = {},
  } = data;

  const defaultLabels = {
    days: labels.days || 'Days',
    hours: labels.hours || 'Hours',
    minutes: labels.minutes || 'Minutes',
    seconds: labels.seconds || 'Seconds',
  };

  const [timeLeft, setTimeLeft] = useState<TimeLeft>(() =>
    calculateTimeLeft(targetDate)
  );

  useEffect(() => {
    const timer = setInterval(() => {
      setTimeLeft(calculateTimeLeft(targetDate));
    }, 1000);

    return () => clearInterval(timer);
  }, [targetDate]);

  const units = useMemo(() => {
    const result: { value: number; label: string; key: string }[] = [];
    if (showDays) result.push({ value: timeLeft.days, label: defaultLabels.days, key: 'days' });
    if (showHours) result.push({ value: timeLeft.hours, label: defaultLabels.hours, key: 'hours' });
    if (showMinutes) result.push({ value: timeLeft.minutes, label: defaultLabels.minutes, key: 'minutes' });
    if (showSeconds) result.push({ value: timeLeft.seconds, label: defaultLabels.seconds, key: 'seconds' });
    return result;
  }, [timeLeft, showDays, showHours, showMinutes, showSeconds, defaultLabels]);

  const sizeClasses = {
    sm: {
      value: 'text-2xl md:text-3xl',
      label: 'text-xs',
      gap: 'gap-3',
      padding: 'p-3',
    },
    md: {
      value: 'text-3xl md:text-5xl',
      label: 'text-sm',
      gap: 'gap-4',
      padding: 'p-4',
    },
    lg: {
      value: 'text-4xl md:text-7xl',
      label: 'text-base',
      gap: 'gap-6',
      padding: 'p-6',
    },
  };

  const currentSize = sizeClasses[size];

  if (!targetDate) {
    return (
      <section className="py-12">
        <div className="max-w-4xl mx-auto px-4 text-center text-muted-foreground">
          Please set a target date for the countdown
        </div>
      </section>
    );
  }

  if (timeLeft.expired) {
    return (
      <section className={cn('py-12', variant === 'hero' && 'py-20')}>
        <div className="max-w-4xl mx-auto px-4 text-center">
          <p className={cn('font-medium text-muted-foreground', currentSize.value)}>
            {expiredMessage}
          </p>
        </div>
      </section>
    );
  }

  const renderUnit = (value: number, label: string, key: string) => {
    const formattedValue = value.toString().padStart(2, '0');

    switch (variant) {
      case 'cards':
        return (
          <div
            key={key}
            className={cn(
              'bg-card border rounded-xl shadow-sm flex flex-col items-center justify-center',
              currentSize.padding
            )}
          >
            <span className={cn('font-bold font-mono tabular-nums', currentSize.value)}>
              {formattedValue}
            </span>
            <span className={cn('text-muted-foreground uppercase tracking-wider mt-1', currentSize.label)}>
              {label}
            </span>
          </div>
        );

      case 'minimal':
        return (
          <div key={key} className="flex flex-col items-center">
            <span className={cn('font-light font-mono tabular-nums', currentSize.value)}>
              {formattedValue}
            </span>
            <span className={cn('text-muted-foreground', currentSize.label)}>
              {label}
            </span>
          </div>
        );

      case 'hero':
        return (
          <div key={key} className="flex flex-col items-center">
            <span className={cn('font-bold font-mono tabular-nums text-primary', currentSize.value)}>
              {formattedValue}
            </span>
            <span className={cn('text-muted-foreground uppercase tracking-widest font-medium', currentSize.label)}>
              {label}
            </span>
          </div>
        );

      default:
        return (
          <div key={key} className="flex flex-col items-center">
            <span className={cn('font-semibold font-mono tabular-nums', currentSize.value)}>
              {formattedValue}
            </span>
            <span className={cn('text-muted-foreground', currentSize.label)}>
              {label}
            </span>
          </div>
        );
    }
  };

  const renderSeparator = (index: number) => {
    if (index === units.length - 1) return null;

    if (variant === 'cards') {
      return null;
    }

    return (
      <span
        key={`sep-${index}`}
        className={cn('text-muted-foreground/50 font-light', currentSize.value)}
      >
        :
      </span>
    );
  };

  return (
    <section className={cn('py-12', variant === 'hero' && 'py-20 bg-muted/30')}>
      <div className="max-w-4xl mx-auto px-4">
        {(title || subtitle) && (
          <div className="text-center mb-8">
            {title && (
              <h2 className="text-2xl md:text-3xl font-serif font-medium mb-2">
                {title}
              </h2>
            )}
            {subtitle && (
              <p className="text-muted-foreground">{subtitle}</p>
            )}
          </div>
        )}

        <div className={cn('flex items-center justify-center', currentSize.gap)}>
          {units.map((unit, index) => (
            <>
              {renderUnit(unit.value, unit.label, unit.key)}
              {renderSeparator(index)}
            </>
          ))}
        </div>
      </div>
    </section>
  );
}
