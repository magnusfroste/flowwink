import { ReactNode, Children, cloneElement, isValidElement } from 'react';
import { useScrollAnimation } from '@/hooks/useScrollAnimation';
import { cn } from '@/lib/utils';
import { AnimationType, AnimationSpeed, AnimationEasing } from '@/types/cms';

interface StaggeredRevealProps {
  children: ReactNode;
  animation?: AnimationType;
  speed?: AnimationSpeed;
  easing?: AnimationEasing;
  delayBetween?: number; // ms between each child
  baseDelay?: number; // initial delay before first child
  className?: string;
}

/**
 * Design System 2026: Staggered Reveal Component
 * Wraps children and animates them in sequence with a delay between each.
 * Perfect for feature grids, card lists, and any repeated content.
 */
export function StaggeredReveal({
  children,
  animation = 'fade-up',
  speed = 'normal',
  easing = 'premium',
  delayBetween = 100,
  baseDelay = 0,
  className,
}: StaggeredRevealProps) {
  const { ref, isVisible } = useScrollAnimation<HTMLDivElement>();

  if (animation === 'none') {
    return <div className={className}>{children}</div>;
  }

  const animationClasses: Record<Exclude<AnimationType, 'none'>, string> = {
    'fade-up': 'translate-y-8 opacity-0',
    'fade-in': 'opacity-0',
    'slide-up': 'translate-y-12 opacity-0',
    'scale-in': 'scale-95 opacity-0',
    'slide-left': 'translate-x-12 opacity-0',
    'slide-right': '-translate-x-12 opacity-0',
    'zoom-in': 'scale-90 opacity-0',
    'blur-in': 'opacity-0 blur-sm',
    'rotate-in': 'rotate-[-3deg] scale-95 opacity-0',
  };

  const speedDurations: Record<AnimationSpeed, string> = {
    fast: 'duration-300',
    normal: 'duration-500',
    slow: 'duration-700',
  };

  const easingClasses: Record<AnimationEasing, string> = {
    default: 'ease-out',
    premium: 'ease-premium',
    'bounce-soft': 'ease-bounce-soft',
    elastic: 'ease-elastic',
  };

  const visibleClasses = 'translate-y-0 translate-x-0 scale-100 opacity-100 blur-0 rotate-0';

  return (
    <div ref={ref} className={className}>
      {Children.map(children, (child, index) => {
        if (!isValidElement(child)) return child;

        const delay = baseDelay + (index * delayBetween);

        return cloneElement(child as React.ReactElement<{ className?: string; style?: React.CSSProperties }>, {
          className: cn(
            (child as React.ReactElement<{ className?: string }>).props.className,
            'transition-all',
            speedDurations[speed],
            easingClasses[easing],
            isVisible ? visibleClasses : animationClasses[animation]
          ),
          style: {
            ...(child as React.ReactElement<{ style?: React.CSSProperties }>).props.style,
            transitionDelay: `${delay}ms`,
          },
        });
      })}
    </div>
  );
}
