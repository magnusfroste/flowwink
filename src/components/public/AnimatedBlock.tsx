import { ReactNode } from 'react';
import { useScrollAnimation } from '@/hooks/useScrollAnimation';
import { cn } from '@/lib/utils';
import { AnimationType, AnimationSpeed } from '@/types/cms';

interface AnimatedBlockProps {
  children: ReactNode;
  animation?: AnimationType;
  speed?: AnimationSpeed;
  delay?: number;
  className?: string;
}

export function AnimatedBlock({ 
  children, 
  animation = 'fade-up',
  speed = 'normal',
  delay = 0,
  className 
}: AnimatedBlockProps) {
  const { ref, isVisible } = useScrollAnimation<HTMLDivElement>();

  // Skip animation if type is 'none'
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
  };

  const speedDurations: Record<AnimationSpeed, string> = {
    fast: 'duration-300',
    normal: 'duration-500',
    slow: 'duration-700',
  };

  const visibleClasses = 'translate-y-0 translate-x-0 scale-100 opacity-100';

  return (
    <div
      ref={ref}
      className={cn(
        'transition-all ease-out',
        speedDurations[speed],
        isVisible ? visibleClasses : animationClasses[animation],
        className
      )}
      style={{ transitionDelay: `${delay}ms` }}
    >
      {children}
    </div>
  );
}
