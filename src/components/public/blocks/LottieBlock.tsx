import { useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';

export interface LottieBlockData {
  // Source
  src: string; // URL to .json animation file
  
  // Playback controls
  autoplay?: boolean;
  loop?: boolean;
  speed?: number; // 0.5 to 2
  direction?: 'forward' | 'reverse';
  
  // Interactions
  playOn?: 'load' | 'hover' | 'click' | 'scroll';
  hoverAction?: 'play' | 'pause' | 'reverse';
  
  // Layout
  size?: 'sm' | 'md' | 'lg' | 'xl' | 'full';
  maxWidth?: number; // pixels
  aspectRatio?: '1:1' | '16:9' | '4:3' | 'auto';
  alignment?: 'left' | 'center' | 'right';
  
  // Styling
  backgroundColor?: string;
  variant?: 'default' | 'card' | 'floating';
  
  // Accessibility
  alt?: string;
  caption?: string;
}

interface LottieBlockProps {
  data: LottieBlockData;
}

const SIZE_CLASSES = {
  sm: 'max-w-[200px]',
  md: 'max-w-[320px]',
  lg: 'max-w-[480px]',
  xl: 'max-w-[640px]',
  full: 'max-w-full',
};

const ASPECT_CLASSES = {
  '1:1': 'aspect-square',
  '16:9': 'aspect-video',
  '4:3': 'aspect-[4/3]',
  'auto': '',
};

const ALIGNMENT_CLASSES = {
  left: 'mr-auto',
  center: 'mx-auto',
  right: 'ml-auto',
};

export function LottieBlock({ data }: LottieBlockProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [Player, setPlayer] = useState<React.ComponentType<any> | null>(null);
  const [isPlaying, setIsPlaying] = useState(data.autoplay !== false);
  const [isVisible, setIsVisible] = useState(false);
  const playerRef = useRef<any>(null);

  // Dynamic import of lottie player
  useEffect(() => {
    import('@lottiefiles/react-lottie-player').then((module) => {
      setPlayer(() => module.Player);
    });
  }, []);

  // Scroll visibility detection
  useEffect(() => {
    if (data.playOn !== 'scroll' || !containerRef.current) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        setIsVisible(entry.isIntersecting);
        if (entry.isIntersecting && playerRef.current) {
          playerRef.current.play();
        } else if (!entry.isIntersecting && playerRef.current) {
          playerRef.current.pause();
        }
      },
      { threshold: 0.3 }
    );

    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, [data.playOn]);

  const handleMouseEnter = () => {
    if (!playerRef.current) return;
    
    if (data.playOn === 'hover') {
      playerRef.current.play();
    } else if (data.hoverAction === 'play') {
      playerRef.current.play();
    } else if (data.hoverAction === 'reverse') {
      playerRef.current.setPlayerDirection(-1);
      playerRef.current.play();
    }
  };

  const handleMouseLeave = () => {
    if (!playerRef.current) return;
    
    if (data.playOn === 'hover') {
      playerRef.current.pause();
    } else if (data.hoverAction === 'pause') {
      playerRef.current.pause();
    } else if (data.hoverAction === 'reverse') {
      playerRef.current.setPlayerDirection(1);
      playerRef.current.play();
    }
  };

  const handleClick = () => {
    if (!playerRef.current || data.playOn !== 'click') return;
    
    if (isPlaying) {
      playerRef.current.pause();
    } else {
      playerRef.current.play();
    }
    setIsPlaying(!isPlaying);
  };

  const size = data.size || 'md';
  const aspectRatio = data.aspectRatio || 'auto';
  const alignment = data.alignment || 'center';
  const variant = data.variant || 'default';
  const speed = data.speed || 1;
  const shouldAutoplay = data.playOn === 'load' || (data.autoplay !== false && data.playOn !== 'scroll' && data.playOn !== 'hover' && data.playOn !== 'click');

  if (!data.src) {
    return (
      <section className="py-8 px-6">
        <div className="container mx-auto">
          <div className="bg-muted rounded-lg p-8 text-center text-muted-foreground max-w-md mx-auto">
            Add a Lottie animation URL to display
          </div>
        </div>
      </section>
    );
  }

  if (!Player) {
    return (
      <section className="py-8 px-6">
        <div className="container mx-auto">
          <div 
            className={cn(
              SIZE_CLASSES[size],
              ASPECT_CLASSES[aspectRatio],
              ALIGNMENT_CLASSES[alignment],
              'bg-muted/30 animate-pulse rounded-lg'
            )}
            style={{ minHeight: aspectRatio === 'auto' ? '200px' : undefined }}
          />
        </div>
      </section>
    );
  }

  const variantClasses = {
    default: '',
    card: 'bg-card rounded-xl shadow-lg p-4 border',
    floating: 'drop-shadow-2xl',
  };

  return (
    <section className="py-8 px-6">
      <div className="container mx-auto">
        <div
          ref={containerRef}
          className={cn(
            SIZE_CLASSES[size],
            ALIGNMENT_CLASSES[alignment],
            variantClasses[variant],
            data.playOn === 'click' && 'cursor-pointer',
            data.playOn === 'hover' && 'cursor-default'
          )}
          style={{
            maxWidth: data.maxWidth ? `${data.maxWidth}px` : undefined,
            backgroundColor: data.backgroundColor,
          }}
          onMouseEnter={handleMouseEnter}
          onMouseLeave={handleMouseLeave}
          onClick={handleClick}
          role={data.alt ? 'img' : undefined}
          aria-label={data.alt}
        >
          <div className={cn(ASPECT_CLASSES[aspectRatio], 'w-full')}>
            <Player
              ref={playerRef}
              src={data.src}
              autoplay={shouldAutoplay}
              loop={data.loop !== false}
              speed={speed}
              direction={data.direction === 'reverse' ? -1 : 1}
              style={{ width: '100%', height: '100%' }}
              keepLastFrame={!data.loop}
            />
          </div>
        </div>
        
        {data.caption && (
          <p className={cn(
            'mt-3 text-sm text-muted-foreground',
            alignment === 'center' && 'text-center',
            alignment === 'right' && 'text-right'
          )}>
            {data.caption}
          </p>
        )}
      </div>
    </section>
  );
}
