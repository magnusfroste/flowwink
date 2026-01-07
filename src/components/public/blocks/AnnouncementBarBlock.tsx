import { useState, useEffect } from 'react';
import { X, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export interface AnnouncementBarBlockData {
  message: string;
  linkText?: string;
  linkUrl?: string;
  variant?: 'solid' | 'gradient' | 'minimal';
  dismissable?: boolean;
  showCountdown?: boolean;
  countdownTarget?: string; // ISO date string
  backgroundColor?: string;
  textColor?: string;
  sticky?: boolean;
}

interface AnnouncementBarBlockProps {
  data: AnnouncementBarBlockData;
}

function CountdownTimer({ target }: { target: string }) {
  const [timeLeft, setTimeLeft] = useState({ days: 0, hours: 0, minutes: 0, seconds: 0 });

  useEffect(() => {
    const calculateTimeLeft = () => {
      const difference = new Date(target).getTime() - new Date().getTime();
      
      if (difference > 0) {
        setTimeLeft({
          days: Math.floor(difference / (1000 * 60 * 60 * 24)),
          hours: Math.floor((difference / (1000 * 60 * 60)) % 24),
          minutes: Math.floor((difference / 1000 / 60) % 60),
          seconds: Math.floor((difference / 1000) % 60),
        });
      }
    };

    calculateTimeLeft();
    const timer = setInterval(calculateTimeLeft, 1000);
    return () => clearInterval(timer);
  }, [target]);

  const pad = (num: number) => num.toString().padStart(2, '0');

  return (
    <div className="flex items-center gap-1 font-mono text-sm tabular-nums">
      {timeLeft.days > 0 && (
        <>
          <span className="bg-background/20 px-1.5 py-0.5 rounded">{timeLeft.days}d</span>
          <span>:</span>
        </>
      )}
      <span className="bg-background/20 px-1.5 py-0.5 rounded">{pad(timeLeft.hours)}</span>
      <span>:</span>
      <span className="bg-background/20 px-1.5 py-0.5 rounded">{pad(timeLeft.minutes)}</span>
      <span>:</span>
      <span className="bg-background/20 px-1.5 py-0.5 rounded">{pad(timeLeft.seconds)}</span>
    </div>
  );
}

export function AnnouncementBarBlock({ data }: AnnouncementBarBlockProps) {
  const [dismissed, setDismissed] = useState(false);
  const variant = data.variant || 'solid';
  const dismissable = data.dismissable ?? true;
  const sticky = data.sticky ?? false;

  // Check localStorage for dismissed state
  useEffect(() => {
    const isDismissed = localStorage.getItem('announcement-dismissed');
    if (isDismissed) {
      setDismissed(true);
    }
  }, []);

  const handleDismiss = () => {
    setDismissed(true);
    localStorage.setItem('announcement-dismissed', 'true');
  };

  if (dismissed || !data.message) return null;

  const variantStyles = {
    solid: 'bg-primary text-primary-foreground',
    gradient: 'bg-gradient-to-r from-primary via-primary/90 to-primary text-primary-foreground',
    minimal: 'bg-muted text-muted-foreground border-b',
  };

  return (
    <div
      className={cn(
        'relative z-50 py-2.5 px-4 text-center text-sm',
        variantStyles[variant],
        sticky && 'sticky top-0'
      )}
      style={{
        backgroundColor: data.backgroundColor || undefined,
        color: data.textColor || undefined,
      }}
    >
      <div className="container mx-auto flex items-center justify-center gap-4 flex-wrap">
        <span className="font-medium">{data.message}</span>
        
        {data.showCountdown && data.countdownTarget && (
          <CountdownTimer target={data.countdownTarget} />
        )}
        
        {data.linkText && data.linkUrl && (
          <a
            href={data.linkUrl}
            className="inline-flex items-center gap-1 font-semibold underline underline-offset-2 hover:no-underline transition-all"
          >
            {data.linkText}
            <ChevronRight className="h-4 w-4" />
          </a>
        )}
      </div>
      
      {dismissable && (
        <Button
          variant="ghost"
          size="icon"
          onClick={handleDismiss}
          className="absolute right-2 top-1/2 -translate-y-1/2 h-6 w-6 rounded-full hover:bg-background/20"
        >
          <X className="h-4 w-4" />
          <span className="sr-only">Dismiss</span>
        </Button>
      )}
    </div>
  );
}
