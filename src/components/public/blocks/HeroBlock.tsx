import { HeroBlockData } from '@/types/cms';
import { cn } from '@/lib/utils';
import { ChevronDown } from 'lucide-react';

interface HeroBlockProps {
  data: HeroBlockData;
}

const heightClasses: Record<string, string> = {
  auto: 'py-24',
  viewport: 'min-h-screen',
  '80vh': 'min-h-[80vh]',
  '60vh': 'min-h-[60vh]',
};

const alignmentClasses: Record<string, string> = {
  top: 'items-start pt-32',
  center: 'items-center',
  bottom: 'items-end pb-32',
};

const titleAnimationClasses: Record<string, string> = {
  none: '',
  'fade-in': 'animate-fade-in',
  'slide-up': 'animate-slide-up',
  typewriter: 'overflow-hidden whitespace-nowrap animate-typewriter border-r-2 border-current animate-blink',
};

export function HeroBlock({ data }: HeroBlockProps) {
  if (!data.title) return null;
  
  const backgroundType = data.backgroundType || 'image';
  const hasVideoBackground = backgroundType === 'video' && data.videoUrl;
  const hasImageBackground = backgroundType === 'image' && data.backgroundImage;
  const heightMode = data.heightMode || 'auto';
  const contentAlignment = data.contentAlignment || 'center';
  const overlayOpacity = data.overlayOpacity ?? 60;
  const titleAnimation = data.titleAnimation || 'none';
  
  return (
    <section 
      className={cn(
        "relative px-6 bg-primary text-primary-foreground overflow-hidden flex",
        heightClasses[heightMode],
        heightMode !== 'auto' && alignmentClasses[contentAlignment]
      )}
    >
      {/* Video Background */}
      {hasVideoBackground && (
        <video
          autoPlay={data.videoAutoplay !== false}
          loop={data.videoLoop !== false}
          muted={data.videoMuted !== false}
          playsInline
          className="absolute inset-0 w-full h-full object-cover"
          poster={data.videoPosterUrl}
        >
          <source src={data.videoUrl} type="video/mp4" />
          {data.videoUrlWebm && <source src={data.videoUrlWebm} type="video/webm" />}
        </video>
      )}
      
      {/* Image Background */}
      {hasImageBackground && (
        <div 
          className={cn(
            "absolute inset-0 bg-cover bg-center",
            data.parallaxEffect && "bg-fixed"
          )}
          style={{ backgroundImage: `url(${data.backgroundImage})` }}
        />
      )}
      
      {/* Overlay with configurable opacity */}
      {(hasVideoBackground || hasImageBackground) && (
        <div 
          className="absolute inset-0 bg-primary"
          style={{ opacity: overlayOpacity / 100 }}
        />
      )}
      
      <div className={cn(
        "relative container mx-auto text-center max-w-3xl z-10",
        heightMode === 'auto' && "py-0"
      )}>
        <h1 
          className={cn(
            "font-serif text-5xl font-bold mb-6",
            titleAnimationClasses[titleAnimation],
            titleAnimation === 'typewriter' && "inline-block"
          )}
        >
          {data.title}
        </h1>
        {data.subtitle && <p className="text-xl opacity-90 mb-8">{data.subtitle}</p>}
        <div className="flex gap-4 justify-center flex-wrap">
          {data.primaryButton?.text && data.primaryButton?.url && (
            <a 
              href={data.primaryButton.url} 
              className="bg-background text-foreground px-6 py-3 rounded-lg font-medium hover:opacity-90 transition-opacity"
            >
              {data.primaryButton.text}
            </a>
          )}
          {data.secondaryButton?.text && data.secondaryButton?.url && (
            <a 
              href={data.secondaryButton.url} 
              className="border border-current px-6 py-3 rounded-lg font-medium hover:bg-primary-foreground/10 transition-colors"
            >
              {data.secondaryButton.text}
            </a>
          )}
        </div>
      </div>
      
      {/* Scroll indicator */}
      {data.showScrollIndicator && heightMode !== 'auto' && (
        <button
          onClick={() => window.scrollTo({ top: window.innerHeight, behavior: 'smooth' })}
          className="absolute bottom-8 left-1/2 -translate-x-1/2 z-10 text-primary-foreground/80 hover:text-primary-foreground transition-colors"
          aria-label="Scroll down"
        >
          <ChevronDown className="h-8 w-8 animate-bounce-down" />
        </button>
      )}
    </section>
  );
}
