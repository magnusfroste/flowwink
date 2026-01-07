import { useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { X, ArrowRight, ChevronUp } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface FloatingCTABlockData {
  // Content
  title: string;
  subtitle?: string;
  buttonText: string;
  buttonUrl: string;
  secondaryButtonText?: string;
  secondaryButtonUrl?: string;
  // Trigger settings
  showAfterScroll: number; // percentage 0-100
  hideOnScrollUp?: boolean;
  // Display settings
  position: 'bottom' | 'bottom-left' | 'bottom-right';
  variant: 'bar' | 'card' | 'minimal' | 'pill';
  size: 'sm' | 'md' | 'lg';
  // Styling
  showCloseButton: boolean;
  closePersistent?: boolean; // Remember close state in session
  showScrollTop?: boolean;
  // Animation
  animationType: 'slide' | 'fade' | 'scale';
}

interface FloatingCTABlockProps {
  data: FloatingCTABlockData;
}

export function FloatingCTABlock({ data }: FloatingCTABlockProps) {
  const {
    title,
    subtitle,
    buttonText,
    buttonUrl,
    secondaryButtonText,
    secondaryButtonUrl,
    showAfterScroll = 25,
    hideOnScrollUp = false,
    position = 'bottom',
    variant = 'bar',
    size = 'md',
    showCloseButton = true,
    closePersistent = false,
    showScrollTop = false,
    animationType = 'slide',
  } = data;

  const [isVisible, setIsVisible] = useState(false);
  const [isClosed, setIsClosed] = useState(false);
  const [lastScrollY, setLastScrollY] = useState(0);

  // Check session storage for persistent close
  useEffect(() => {
    if (closePersistent) {
      const closed = sessionStorage.getItem('floating-cta-closed');
      if (closed === 'true') {
        setIsClosed(true);
      }
    }
  }, [closePersistent]);

  const handleScroll = useCallback(() => {
    const currentScrollY = window.scrollY;
    const scrollHeight = document.documentElement.scrollHeight - window.innerHeight;
    const scrollPercentage = (currentScrollY / scrollHeight) * 100;

    // Show after scroll threshold
    const shouldShow = scrollPercentage >= showAfterScroll;
    
    // Hide on scroll up if enabled
    if (hideOnScrollUp && currentScrollY < lastScrollY && currentScrollY > 100) {
      setIsVisible(false);
    } else if (shouldShow && !isClosed) {
      setIsVisible(true);
    } else if (!shouldShow) {
      setIsVisible(false);
    }

    setLastScrollY(currentScrollY);
  }, [showAfterScroll, hideOnScrollUp, lastScrollY, isClosed]);

  useEffect(() => {
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, [handleScroll]);

  const handleClose = () => {
    setIsClosed(true);
    setIsVisible(false);
    if (closePersistent) {
      sessionStorage.setItem('floating-cta-closed', 'true');
    }
  };

  const handleScrollToTop = () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  if (isClosed || !isVisible) return null;

  // Size classes
  const sizeClasses = {
    sm: 'text-sm py-2 px-4',
    md: 'text-base py-3 px-6',
    lg: 'text-lg py-4 px-8',
  };

  // Position classes
  const positionClasses = {
    bottom: 'left-0 right-0 mx-auto',
    'bottom-left': 'left-4 sm:left-6',
    'bottom-right': 'right-4 sm:right-6',
  };

  // Animation classes
  const animationClasses = {
    slide: isVisible ? 'translate-y-0' : 'translate-y-full',
    fade: isVisible ? 'opacity-100' : 'opacity-0',
    scale: isVisible ? 'scale-100 opacity-100' : 'scale-95 opacity-0',
  };

  // Variant-specific content
  const renderContent = () => {
    switch (variant) {
      case 'bar':
        return (
          <div className={cn(
            'fixed bottom-0 left-0 right-0 z-50 bg-primary text-primary-foreground shadow-lg transition-transform duration-300',
            sizeClasses[size],
            animationClasses[animationType]
          )}>
            <div className="container mx-auto flex flex-wrap items-center justify-between gap-4">
              <div className="flex-1 min-w-0">
                <p className="font-semibold truncate">{title}</p>
                {subtitle && (
                  <p className="text-sm opacity-90 truncate">{subtitle}</p>
                )}
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                {secondaryButtonText && secondaryButtonUrl && (
                  <Button
                    variant="ghost"
                    size={size === 'lg' ? 'default' : 'sm'}
                    className="text-primary-foreground hover:bg-primary-foreground/20"
                    asChild
                  >
                    <a href={secondaryButtonUrl}>{secondaryButtonText}</a>
                  </Button>
                )}
                <Button
                  variant="secondary"
                  size={size === 'lg' ? 'default' : 'sm'}
                  asChild
                >
                  <a href={buttonUrl} className="flex items-center gap-2">
                    {buttonText}
                    <ArrowRight className="h-4 w-4" />
                  </a>
                </Button>
                {showCloseButton && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-primary-foreground hover:bg-primary-foreground/20"
                    onClick={handleClose}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                )}
              </div>
            </div>
          </div>
        );

      case 'card':
        return (
          <div className={cn(
            'fixed bottom-4 z-50 transition-all duration-300',
            positionClasses[position],
            position === 'bottom' ? 'max-w-md w-[calc(100%-2rem)]' : 'max-w-sm w-full',
            animationClasses[animationType]
          )}>
            <div className={cn(
              'bg-card border rounded-xl shadow-xl',
              sizeClasses[size]
            )}>
              {showCloseButton && (
                <button
                  onClick={handleClose}
                  className="absolute top-2 right-2 p-1 rounded-full hover:bg-muted transition-colors"
                >
                  <X className="h-4 w-4 text-muted-foreground" />
                </button>
              )}
              <div className="pr-6">
                <h4 className="font-semibold text-foreground">{title}</h4>
                {subtitle && (
                  <p className="text-sm text-muted-foreground mt-1">{subtitle}</p>
                )}
              </div>
              <div className="flex items-center gap-2 mt-4">
                <Button size={size === 'lg' ? 'default' : 'sm'} asChild>
                  <a href={buttonUrl} className="flex items-center gap-2">
                    {buttonText}
                    <ArrowRight className="h-4 w-4" />
                  </a>
                </Button>
                {secondaryButtonText && secondaryButtonUrl && (
                  <Button variant="ghost" size={size === 'lg' ? 'default' : 'sm'} asChild>
                    <a href={secondaryButtonUrl}>{secondaryButtonText}</a>
                  </Button>
                )}
              </div>
            </div>
          </div>
        );

      case 'minimal':
        return (
          <div className={cn(
            'fixed bottom-4 z-50 transition-all duration-300',
            positionClasses[position],
            animationClasses[animationType]
          )}>
            <div className={cn(
              'flex items-center gap-3 bg-background/95 backdrop-blur border rounded-lg shadow-lg',
              sizeClasses[size]
            )}>
              <span className="font-medium text-foreground">{title}</span>
              <Button size="sm" asChild>
                <a href={buttonUrl}>{buttonText}</a>
              </Button>
              {showCloseButton && (
                <button
                  onClick={handleClose}
                  className="p-1 rounded hover:bg-muted transition-colors"
                >
                  <X className="h-3.5 w-3.5 text-muted-foreground" />
                </button>
              )}
            </div>
          </div>
        );

      case 'pill':
        return (
          <div className={cn(
            'fixed bottom-4 z-50 transition-all duration-300',
            positionClasses[position],
            animationClasses[animationType]
          )}>
            <div className="flex items-center gap-2">
              <Button
                size={size === 'lg' ? 'lg' : 'default'}
                className="rounded-full shadow-lg"
                asChild
              >
                <a href={buttonUrl} className="flex items-center gap-2">
                  {buttonText}
                  <ArrowRight className="h-4 w-4" />
                </a>
              </Button>
              {showScrollTop && (
                <Button
                  variant="outline"
                  size="icon"
                  className="rounded-full shadow-lg"
                  onClick={handleScrollToTop}
                >
                  <ChevronUp className="h-4 w-4" />
                </Button>
              )}
              {showCloseButton && (
                <Button
                  variant="outline"
                  size="icon"
                  className="rounded-full shadow-lg h-8 w-8"
                  onClick={handleClose}
                >
                  <X className="h-3.5 w-3.5" />
                </Button>
              )}
            </div>
          </div>
        );

      default:
        return null;
    }
  };

  return renderContent();
}
