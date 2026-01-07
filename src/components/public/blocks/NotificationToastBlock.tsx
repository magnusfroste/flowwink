import { useEffect, useState, useCallback } from 'react';
import { cn } from '@/lib/utils';
import { X, ShoppingCart, User, Star, MessageCircle, Heart, Bell, Check } from 'lucide-react';

export interface NotificationItem {
  id: string;
  type: 'purchase' | 'signup' | 'review' | 'custom';
  icon?: 'cart' | 'user' | 'star' | 'message' | 'heart' | 'bell' | 'check';
  title: string;
  message: string;
  image?: string;
  timestamp?: string;
  location?: string;
}

export interface NotificationToastBlockData {
  notifications: NotificationItem[];
  variant: 'default' | 'minimal' | 'card' | 'bubble';
  position: 'bottom-left' | 'bottom-right' | 'top-left' | 'top-right';
  displayDuration?: number; // in seconds
  delayBetween?: number; // in seconds
  initialDelay?: number; // in seconds
  showCloseButton?: boolean;
  showImage?: boolean;
  showTimestamp?: boolean;
  loop?: boolean;
  maxWidth?: 'sm' | 'md' | 'lg';
  // Animation
  animationType?: 'slide' | 'fade' | 'pop';
}

interface NotificationToastBlockProps {
  data: NotificationToastBlockData;
}

const ICONS = {
  cart: ShoppingCart,
  user: User,
  star: Star,
  message: MessageCircle,
  heart: Heart,
  bell: Bell,
  check: Check,
};

function getRandomTimestamp(): string {
  const minutes = Math.floor(Math.random() * 30) + 1;
  return `${minutes} min ago`;
}

function getRandomLocation(): string {
  const locations = [
    'Stockholm', 'Göteborg', 'Malmö', 'Uppsala', 'Linköping',
    'New York', 'London', 'Paris', 'Berlin', 'Tokyo',
  ];
  return locations[Math.floor(Math.random() * locations.length)];
}

export function NotificationToastBlock({ data }: NotificationToastBlockProps) {
  const {
    notifications = [],
    variant = 'default',
    position = 'bottom-left',
    displayDuration = 5,
    delayBetween = 8,
    initialDelay = 3,
    showCloseButton = true,
    showImage = true,
    showTimestamp = true,
    loop = true,
    maxWidth = 'sm',
    animationType = 'slide',
  } = data;

  const [currentIndex, setCurrentIndex] = useState(-1);
  const [isVisible, setIsVisible] = useState(false);
  const [isDismissed, setIsDismissed] = useState(false);

  const showNextNotification = useCallback(() => {
    if (notifications.length === 0 || isDismissed) return;

    setCurrentIndex((prev) => {
      const next = prev + 1;
      if (next >= notifications.length) {
        return loop ? 0 : -1;
      }
      return next;
    });
    setIsVisible(true);
  }, [notifications.length, loop, isDismissed]);

  useEffect(() => {
    if (notifications.length === 0) return;

    // Initial delay before first notification
    const initialTimer = setTimeout(() => {
      showNextNotification();
    }, initialDelay * 1000);

    return () => clearTimeout(initialTimer);
  }, [initialDelay, showNextNotification, notifications.length]);

  useEffect(() => {
    if (!isVisible || currentIndex < 0) return;

    // Hide after display duration
    const hideTimer = setTimeout(() => {
      setIsVisible(false);
    }, displayDuration * 1000);

    return () => clearTimeout(hideTimer);
  }, [isVisible, currentIndex, displayDuration]);

  useEffect(() => {
    if (isVisible || currentIndex < 0 || isDismissed) return;

    // Show next notification after delay
    const nextTimer = setTimeout(() => {
      showNextNotification();
    }, delayBetween * 1000);

    return () => clearTimeout(nextTimer);
  }, [isVisible, currentIndex, delayBetween, showNextNotification, isDismissed]);

  const handleClose = () => {
    setIsVisible(false);
    setIsDismissed(true);
  };

  if (notifications.length === 0 || currentIndex < 0 || !notifications[currentIndex]) {
    return null;
  }

  const notification = notifications[currentIndex];
  const IconComponent = notification.icon ? ICONS[notification.icon] : null;

  const positionClasses = {
    'bottom-left': 'bottom-4 left-4',
    'bottom-right': 'bottom-4 right-4',
    'top-left': 'top-4 left-4',
    'top-right': 'top-4 right-4',
  };

  const maxWidthClasses = {
    sm: 'max-w-xs',
    md: 'max-w-sm',
    lg: 'max-w-md',
  };

  const getAnimationClasses = () => {
    const isLeft = position.includes('left');
    const isTop = position.includes('top');

    if (animationType === 'slide') {
      if (isVisible) {
        return 'translate-x-0 opacity-100';
      }
      return isLeft ? '-translate-x-full opacity-0' : 'translate-x-full opacity-0';
    }

    if (animationType === 'pop') {
      if (isVisible) {
        return 'scale-100 opacity-100';
      }
      return 'scale-75 opacity-0';
    }

    // fade
    return isVisible ? 'opacity-100' : 'opacity-0';
  };

  const renderContent = () => (
    <>
      {/* Image or Icon */}
      {(showImage && notification.image) || IconComponent ? (
        <div className="flex-shrink-0">
          {showImage && notification.image ? (
            <img
              src={notification.image}
              alt=""
              className="w-12 h-12 rounded-lg object-cover"
            />
          ) : IconComponent ? (
            <div className={cn(
              'w-10 h-10 rounded-full flex items-center justify-center',
              notification.type === 'purchase' && 'bg-green-100 text-green-600 dark:bg-green-900/30 dark:text-green-400',
              notification.type === 'signup' && 'bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400',
              notification.type === 'review' && 'bg-yellow-100 text-yellow-600 dark:bg-yellow-900/30 dark:text-yellow-400',
              notification.type === 'custom' && 'bg-primary/10 text-primary'
            )}>
              <IconComponent className="w-5 h-5" />
            </div>
          ) : null}
        </div>
      ) : null}

      {/* Content */}
      <div className="flex-1 min-w-0">
        <p className="font-medium text-sm truncate">
          {notification.title}
        </p>
        <p className="text-xs text-muted-foreground line-clamp-2">
          {notification.message}
        </p>
        {showTimestamp && (
          <p className="text-xs text-muted-foreground/70 mt-1">
            {notification.timestamp || getRandomTimestamp()}
            {notification.location && ` • ${notification.location}`}
            {!notification.location && ` • ${getRandomLocation()}`}
          </p>
        )}
      </div>

      {/* Close button */}
      {showCloseButton && (
        <button
          onClick={handleClose}
          className="flex-shrink-0 p-1 rounded-full hover:bg-muted transition-colors"
          aria-label="Close notification"
        >
          <X className="w-4 h-4 text-muted-foreground" />
        </button>
      )}
    </>
  );

  // Variant-specific styling
  const getVariantClasses = () => {
    switch (variant) {
      case 'minimal':
        return 'bg-background/95 backdrop-blur-sm border shadow-sm';
      case 'card':
        return 'bg-card border shadow-lg';
      case 'bubble':
        return 'bg-primary text-primary-foreground shadow-lg';
      default:
        return 'bg-background border shadow-lg';
    }
  };

  return (
    <div
      className={cn(
        'fixed z-50 p-4 rounded-lg transition-all duration-300 ease-out',
        positionClasses[position],
        maxWidthClasses[maxWidth],
        getVariantClasses(),
        getAnimationClasses(),
        !isVisible && 'pointer-events-none'
      )}
      role="alert"
      aria-live="polite"
    >
      <div className="flex items-start gap-3">
        {renderContent()}
      </div>
    </div>
  );
}
