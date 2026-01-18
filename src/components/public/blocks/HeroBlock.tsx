import { useState, useRef, useEffect } from 'react';
import { HeroBlockData, HeroTitleSize } from '@/types/cms';
import { cn } from '@/lib/utils';
import { ChevronDown, Play, Pause, Volume2, VolumeX } from 'lucide-react';

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

const textAlignmentClasses: Record<string, string> = {
  left: 'text-left items-start',
  center: 'text-center items-center',
  right: 'text-right items-end',
};

// Design System 2026: Title size classes
const titleSizeClasses: Record<HeroTitleSize, string> = {
  default: 'text-4xl md:text-5xl',
  large: 'text-5xl md:text-6xl',
  display: 'text-6xl md:text-7xl lg:text-display',
  massive: 'text-7xl md:text-8xl lg:text-display-lg xl:text-display-xl',
};

// Extract video ID from YouTube or Vimeo URL
function extractVideoId(url: string, type: 'youtube' | 'vimeo'): string | null {
  if (!url) return null;
  
  if (type === 'youtube') {
    // Match youtube.com/watch?v=ID, youtu.be/ID, youtube.com/embed/ID
    const patterns = [
      /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([^&\s?]+)/,
      /^([a-zA-Z0-9_-]{11})$/,
    ];
    for (const pattern of patterns) {
      const match = url.match(pattern);
      if (match) return match[1];
    }
  }
  
  if (type === 'vimeo') {
    // Match vimeo.com/ID, player.vimeo.com/video/ID
    const patterns = [
      /vimeo\.com\/(\d+)/,
      /player\.vimeo\.com\/video\/(\d+)/,
      /^(\d+)$/,
    ];
    for (const pattern of patterns) {
      const match = url.match(pattern);
      if (match) return match[1];
    }
  }
  
  return null;
}

export function HeroBlock({ data }: HeroBlockProps) {
  const [isPlaying, setIsPlaying] = useState(true);
  const [isMuted, setIsMuted] = useState(data.videoMuted !== false);
  const videoRef = useRef<HTMLVideoElement>(null);
  
  if (!data.title) return null;
  
  const layout = data.layout || 'centered';
  const videoType = data.videoType || 'direct';
  const overlayColor = data.overlayColor || 'dark';
  const textAlignment = data.textAlignment || 'center';
  
  // Handle play/pause for direct videos
  useEffect(() => {
    if (videoRef.current) {
      if (isPlaying) {
        videoRef.current.play().catch(() => {});
      } else {
        videoRef.current.pause();
      }
    }
  }, [isPlaying]);
  
  // Handle mute for direct videos
  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.muted = isMuted;
    }
  }, [isMuted]);
  
  // Get overlay color classes
  const getOverlayClasses = () => {
    switch (overlayColor) {
      case 'light': return 'bg-white';
      case 'primary': return 'bg-primary';
      default: return 'bg-black';
    }
  };
  
  // Get text color classes based on textTheme (manual override) or overlay (auto)
  const textTheme = data.textTheme || 'auto';
  const getTextColorClasses = () => {
    // Manual override takes precedence
    if (textTheme === 'light') return 'text-white';
    if (textTheme === 'dark') return 'text-foreground';
    // Auto: derive from overlay color
    switch (overlayColor) {
      case 'light': return 'text-foreground';
      case 'primary': return 'text-primary-foreground';
      default: return 'text-white';
    }
  };
  
  // Render video background based on type
  const renderVideoBackground = () => {
    const hasVideo = data.backgroundType === 'video' && data.videoUrl;
    if (!hasVideo) return null;
    
    if (videoType === 'youtube') {
      const videoId = extractVideoId(data.videoUrl!, 'youtube');
      if (!videoId) return null;
      
      const autoplay = data.videoAutoplay !== false ? 1 : 0;
      const loop = data.videoLoop !== false ? 1 : 0;
      const mute = isMuted ? 1 : 0;
      
      return (
        <div className="absolute inset-0 overflow-hidden">
          <iframe
            src={`https://www.youtube.com/embed/${videoId}?autoplay=${autoplay}&loop=${loop}&mute=${mute}&controls=0&showinfo=0&rel=0&modestbranding=1&playlist=${videoId}&playsinline=1`}
            className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 min-w-[177.78vh] min-h-[56.25vw] w-auto h-auto"
            allow="autoplay; encrypted-media"
            allowFullScreen
            style={{ border: 0 }}
          />
        </div>
      );
    }
    
    if (videoType === 'vimeo') {
      const videoId = extractVideoId(data.videoUrl!, 'vimeo');
      if (!videoId) return null;
      
      const autoplay = data.videoAutoplay !== false ? 1 : 0;
      const loop = data.videoLoop !== false ? 1 : 0;
      const muted = isMuted ? 1 : 0;
      
      return (
        <div className="absolute inset-0 overflow-hidden">
          <iframe
            src={`https://player.vimeo.com/video/${videoId}?autoplay=${autoplay}&loop=${loop}&muted=${muted}&background=1&quality=auto`}
            className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 min-w-[177.78vh] min-h-[56.25vw] w-auto h-auto"
            allow="autoplay; encrypted-media"
            allowFullScreen
            style={{ border: 0 }}
          />
        </div>
      );
    }
    
    // Direct video (MP4/WebM)
    return (
      <video
        ref={videoRef}
        autoPlay={data.videoAutoplay !== false}
        loop={data.videoLoop !== false}
        muted={isMuted}
        playsInline
        className="absolute inset-0 w-full h-full object-cover"
        poster={data.videoPosterUrl}
      >
        <source src={data.videoUrl} type="video/mp4" />
        {data.videoUrlWebm && <source src={data.videoUrlWebm} type="video/webm" />}
      </video>
    );
  };
  
  // Render video controls
  const renderVideoControls = () => {
    if (!data.showVideoControls) return null;
    if (data.backgroundType !== 'video' || !data.videoUrl) return null;
    
    // Only show controls for direct videos (iframe controls are limited)
    if (videoType !== 'direct') return null;
    
    return (
      <div className="absolute bottom-8 right-8 z-20 flex gap-2">
        <button
          onClick={() => setIsPlaying(!isPlaying)}
          className="p-2 rounded-full bg-black/50 hover:bg-black/70 text-white transition-colors"
          aria-label={isPlaying ? 'Pause video' : 'Play video'}
        >
          {isPlaying ? <Pause className="h-5 w-5" /> : <Play className="h-5 w-5" />}
        </button>
        <button
          onClick={() => setIsMuted(!isMuted)}
          className="p-2 rounded-full bg-black/50 hover:bg-black/70 text-white transition-colors"
          aria-label={isMuted ? 'Unmute video' : 'Mute video'}
        >
          {isMuted ? <VolumeX className="h-5 w-5" /> : <Volume2 className="h-5 w-5" />}
        </button>
      </div>
    );
  };
  
  // Split layout rendering
  if (layout === 'split-left' || layout === 'split-right') {
    const imageOnLeft = layout === 'split-left';
    const hasImage = data.backgroundImage;
    const hasVideo = data.backgroundType === 'video' && data.videoUrl;
    
    return (
      <section className="min-h-[60vh] md:min-h-[80vh]">
        <div className={cn(
          "grid md:grid-cols-2 min-h-[inherit]",
          !imageOnLeft && "md:[direction:rtl]"
        )}>
          {/* Media side */}
          <div className={cn(
            "relative bg-muted min-h-[300px] md:min-h-[inherit]",
            !imageOnLeft && "md:[direction:ltr]"
          )}>
            {hasVideo ? (
              videoType === 'direct' ? (
                <video
                  ref={videoRef}
                  autoPlay={data.videoAutoplay !== false}
                  loop={data.videoLoop !== false}
                  muted={isMuted}
                  playsInline
                  className="absolute inset-0 w-full h-full object-cover"
                  poster={data.videoPosterUrl}
                >
                  <source src={data.videoUrl} type="video/mp4" />
                  {data.videoUrlWebm && <source src={data.videoUrlWebm} type="video/webm" />}
                </video>
              ) : videoType === 'youtube' ? (
                <div className="absolute inset-0 overflow-hidden">
                  <iframe
                    src={`https://www.youtube.com/embed/${extractVideoId(data.videoUrl!, 'youtube')}?autoplay=${data.videoAutoplay !== false ? 1 : 0}&loop=1&mute=${isMuted ? 1 : 0}&controls=0&showinfo=0&rel=0&modestbranding=1&playlist=${extractVideoId(data.videoUrl!, 'youtube')}&playsinline=1`}
                    className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 min-w-[177.78vh] min-h-[56.25vw] w-auto h-auto"
                    allow="autoplay; encrypted-media"
                    allowFullScreen
                    style={{ border: 0 }}
                  />
                </div>
              ) : (
                <div className="absolute inset-0 overflow-hidden">
                  <iframe
                    src={`https://player.vimeo.com/video/${extractVideoId(data.videoUrl!, 'vimeo')}?autoplay=${data.videoAutoplay !== false ? 1 : 0}&loop=1&muted=${isMuted ? 1 : 0}&background=1`}
                    className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 min-w-[177.78vh] min-h-[56.25vw] w-auto h-auto"
                    allow="autoplay; encrypted-media"
                    allowFullScreen
                    style={{ border: 0 }}
                  />
                </div>
              )
            ) : hasImage ? (
              <img
                src={data.backgroundImage}
                alt=""
                className="absolute inset-0 w-full h-full object-cover"
              />
            ) : (
              <div className="absolute inset-0 bg-gradient-to-br from-primary/20 to-primary/40" />
            )}
          </div>
          
          {/* Content side */}
          <div className={cn(
            "flex flex-col justify-center px-8 md:px-12 lg:px-16 xl:px-20 py-16 md:py-20 bg-background",
            !imageOnLeft && "md:[direction:ltr]"
          )}>
            <div className="max-w-xl">
              <h1 
                className={cn(
                  "font-serif font-bold mb-6 text-foreground",
                  titleSizeClasses[data.titleSize || 'default'],
                  titleAnimationClasses[data.titleAnimation || 'none'],
                  data.gradientTitle && "text-gradient"
                )}
              >
                {data.title}
              </h1>
              {data.subtitle && (
                <p className={cn(
                  "text-lg md:text-xl text-muted-foreground mb-8",
                  data.subtitleAnimation === 'fade-in' && "animate-fade-in",
                  data.subtitleAnimation === 'slide-up' && "animate-slide-up"
                )}>
                  {data.subtitle}
                </p>
              )}
              <div className="flex flex-wrap gap-4">
                {data.primaryButton?.text && data.primaryButton?.url && (
                  <a
                    href={data.primaryButton.url}
                    className="inline-flex items-center justify-center px-6 py-3 bg-primary text-primary-foreground font-medium rounded-lg hover:bg-primary/90 transition-colors"
                  >
                    {data.primaryButton.text}
                  </a>
                )}
                {data.secondaryButton?.text && data.secondaryButton?.url && (
                  <a
                    href={data.secondaryButton.url}
                    className="inline-flex items-center justify-center px-6 py-3 border border-border text-foreground font-medium rounded-lg hover:bg-muted transition-colors"
                  >
                    {data.secondaryButton.text}
                  </a>
                )}
              </div>
            </div>
          </div>
        </div>
      </section>
    );
  }
  
  // Centered layout (original behavior with enhancements)
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
        "relative px-6 overflow-hidden flex",
        backgroundType === 'color' && "bg-primary text-primary-foreground",
        (hasVideoBackground || hasImageBackground) && getTextColorClasses(),
        heightClasses[heightMode],
        heightMode !== 'auto' && alignmentClasses[contentAlignment]
      )}
    >
      {/* Video Background */}
      {hasVideoBackground && renderVideoBackground()}
      
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
      
      {/* Overlay with configurable opacity and color */}
      {(hasVideoBackground || hasImageBackground) && (
        <div 
          className={cn("absolute inset-0", getOverlayClasses())}
          style={{ opacity: overlayOpacity / 100 }}
        />
      )}
      
      {/* Video Controls */}
      {renderVideoControls()}
      
      <div className={cn(
        "relative container mx-auto max-w-3xl z-10 flex flex-col",
        textAlignmentClasses[textAlignment],
        heightMode === 'auto' && "py-0"
      )}>
        <h1 
          className={cn(
            "font-serif font-bold mb-6",
            titleSizeClasses[data.titleSize || 'default'],
            titleAnimationClasses[titleAnimation],
            titleAnimation === 'typewriter' && "inline-block",
            data.gradientTitle && "text-gradient"
          )}
        >
          {data.title}
        </h1>
        {data.subtitle && (
          <p className={cn(
            "text-xl opacity-90 mb-8",
            data.subtitleAnimation === 'fade-in' && "animate-fade-in [animation-delay:200ms]",
            data.subtitleAnimation === 'slide-up' && "animate-slide-up [animation-delay:200ms]"
          )}>
            {data.subtitle}
          </p>
        )}
        <div className={cn(
          "flex gap-4 flex-wrap",
          textAlignment === 'center' && "justify-center",
          textAlignment === 'right' && "justify-end"
        )}>
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
              className="border border-current px-6 py-3 rounded-lg font-medium hover:bg-white/10 transition-colors"
            >
              {data.secondaryButton.text}
            </a>
          )}
        </div>
      </div>
      
      {/* Scroll indicator - fixed position to always be visible above fold */}
      {data.showScrollIndicator && heightMode !== 'auto' && (
        <button
          onClick={() => window.scrollTo({ top: window.innerHeight, behavior: 'smooth' })}
          className="fixed bottom-8 left-1/2 -translate-x-1/2 z-50 opacity-80 hover:opacity-100 transition-opacity"
          aria-label="Scroll down"
        >
          <ChevronDown className="h-8 w-8 animate-bounce-down text-foreground drop-shadow-lg" />
        </button>
      )}
    </section>
  );
}
