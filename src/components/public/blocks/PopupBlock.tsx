import { useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { PopupBlockData } from '@/types/cms';

interface PopupBlockProps {
  data: PopupBlockData;
}

const STORAGE_KEY_PREFIX = 'popup-dismissed-';

export function PopupBlock({ data }: PopupBlockProps) {
  const [isVisible, setIsVisible] = useState(false);
  const [hasTriggered, setHasTriggered] = useState(false);

  const popupId = `${data.title}-${data.trigger}`.replace(/\s+/g, '-').toLowerCase();
  const storageKey = `${STORAGE_KEY_PREFIX}${popupId}`;

  // Check if popup was previously dismissed
  const checkDismissed = useCallback(() => {
    if (!data.showOnce) return false;
    
    const dismissedAt = localStorage.getItem(storageKey);
    if (!dismissedAt) return false;
    
    const dismissedDate = new Date(dismissedAt);
    const cookieDays = data.cookieDays || 7;
    const expiryDate = new Date(dismissedDate.getTime() + cookieDays * 24 * 60 * 60 * 1000);
    
    return new Date() < expiryDate;
  }, [storageKey, data.showOnce, data.cookieDays]);

  // Dismiss handler
  const handleDismiss = useCallback(() => {
    setIsVisible(false);
    if (data.showOnce) {
      localStorage.setItem(storageKey, new Date().toISOString());
    }
  }, [storageKey, data.showOnce]);

  // Time delay trigger
  useEffect(() => {
    if (data.trigger !== 'time' || hasTriggered || checkDismissed()) return;

    const timer = setTimeout(() => {
      setIsVisible(true);
      setHasTriggered(true);
    }, (data.delaySeconds || 5) * 1000);

    return () => clearTimeout(timer);
  }, [data.trigger, data.delaySeconds, hasTriggered, checkDismissed]);

  // Scroll trigger
  useEffect(() => {
    if (data.trigger !== 'scroll' || hasTriggered || checkDismissed()) return;

    const handleScroll = () => {
      const scrollPercentage = (window.scrollY / (document.documentElement.scrollHeight - window.innerHeight)) * 100;
      
      if (scrollPercentage >= (data.scrollPercentage || 50)) {
        setIsVisible(true);
        setHasTriggered(true);
      }
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, [data.trigger, data.scrollPercentage, hasTriggered, checkDismissed]);

  // Exit intent trigger
  useEffect(() => {
    if (data.trigger !== 'exit-intent' || hasTriggered || checkDismissed()) return;

    const handleMouseLeave = (e: MouseEvent) => {
      if (e.clientY <= 0) {
        setIsVisible(true);
        setHasTriggered(true);
      }
    };

    document.addEventListener('mouseleave', handleMouseLeave);
    return () => document.removeEventListener('mouseleave', handleMouseLeave);
  }, [data.trigger, hasTriggered, checkDismissed]);

  // Close on escape key
  useEffect(() => {
    if (!isVisible) return;

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        handleDismiss();
      }
    };

    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [isVisible, handleDismiss]);

  if (!isVisible) return null;

  const sizeClasses = {
    sm: 'max-w-sm',
    md: 'max-w-md',
    lg: 'max-w-lg',
  };

  const positionClasses = {
    center: 'items-center justify-center',
    'bottom-right': 'items-end justify-end p-6',
    'bottom-left': 'items-end justify-start p-6',
  };

  const popup = (
    <div
      className={cn(
        'fixed inset-0 z-50 flex',
        positionClasses[data.position],
        data.overlayDark && data.position === 'center' && 'bg-background/80 backdrop-blur-sm'
      )}
      onClick={(e) => {
        if (e.target === e.currentTarget && data.position === 'center') {
          handleDismiss();
        }
      }}
    >
      <div
        className={cn(
          'relative bg-card border rounded-lg shadow-xl animate-in fade-in-0 zoom-in-95 duration-300',
          sizeClasses[data.size],
          data.position !== 'center' && 'shadow-2xl'
        )}
      >
        {/* Close button */}
        <button
          onClick={handleDismiss}
          className="absolute top-3 right-3 p-1 rounded-full hover:bg-muted transition-colors"
          aria-label="Close popup"
        >
          <X className="h-4 w-4" />
        </button>

        {/* Image */}
        {data.image && (
          <div className="w-full">
            <img
              src={data.image}
              alt=""
              className="w-full h-40 object-cover rounded-t-lg"
            />
          </div>
        )}

        {/* Content */}
        <div className="p-6">
          <h3 className="text-xl font-semibold mb-2">{data.title}</h3>
          <p className="text-muted-foreground mb-4">{data.content}</p>

          {/* Buttons */}
          <div className="flex flex-col sm:flex-row gap-2">
            {data.buttonText && (
              <Button asChild className="flex-1">
                <a href={data.buttonUrl || '#'}>{data.buttonText}</a>
              </Button>
            )}
            {data.secondaryButtonText && (
              <Button variant="outline" onClick={handleDismiss} className="flex-1">
                {data.secondaryButtonText}
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );

  // Render popup in portal to ensure it's on top
  return createPortal(popup, document.body);
}
