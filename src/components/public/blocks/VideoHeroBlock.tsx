import { useState, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Play, Pause, Volume2, VolumeX, ArrowRight, ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface VideoHeroBlockData {
  // Content
  title: string;
  subtitle?: string;
  primaryButton?: { text: string; url: string };
  secondaryButton?: { text: string; url: string };
  // Video settings
  videoType: 'youtube' | 'vimeo' | 'direct';
  videoUrl: string;
  posterImage?: string;
  // Playback
  autoplay: boolean;
  loop: boolean;
  muted: boolean;
  showControls: boolean;
  // Layout
  heightMode: 'viewport' | '80vh' | '60vh' | 'auto';
  contentAlignment: 'top' | 'center' | 'bottom';
  textAlignment: 'left' | 'center' | 'right';
  overlayOpacity: number;
  overlayColor: 'dark' | 'light' | 'primary';
  // Effects
  showScrollIndicator?: boolean;
  parallaxEffect?: boolean;
  titleAnimation?: 'none' | 'fade-in' | 'slide-up' | 'typewriter';
}

interface VideoHeroBlockProps {
  data: VideoHeroBlockData;
}

// Extract video ID from various URL formats
function extractVideoId(url: string, type: 'youtube' | 'vimeo'): string | null {
  if (!url) return null;
  
  if (type === 'youtube') {
    // Handle various YouTube URL formats
    const patterns = [
      /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([^&\s?]+)/,
      /youtube\.com\/shorts\/([^&\s?]+)/,
    ];
    for (const pattern of patterns) {
      const match = url.match(pattern);
      if (match) return match[1];
    }
  } else if (type === 'vimeo') {
    // Handle Vimeo URLs
    const match = url.match(/(?:vimeo\.com\/)(\d+)/);
    if (match) return match[1];
  }
  
  return null;
}

export function VideoHeroBlock({ data }: VideoHeroBlockProps) {
  const {
    title,
    subtitle,
    primaryButton,
    secondaryButton,
    videoType = 'youtube',
    videoUrl,
    posterImage,
    autoplay = true,
    loop = true,
    muted = true,
    showControls = false,
    heightMode = 'viewport',
    contentAlignment = 'center',
    textAlignment = 'center',
    overlayOpacity = 50,
    overlayColor = 'dark',
    showScrollIndicator = true,
    titleAnimation = 'fade-in',
  } = data;

  const [isPlaying, setIsPlaying] = useState(autoplay);
  const [isMuted, setIsMuted] = useState(muted);
  const [isLoaded, setIsLoaded] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const videoId = videoType !== 'direct' ? extractVideoId(videoUrl, videoType) : null;

  // Handle video controls for direct video
  useEffect(() => {
    if (videoRef.current && videoType === 'direct') {
      if (isPlaying) {
        videoRef.current.play().catch(() => setIsPlaying(false));
      } else {
        videoRef.current.pause();
      }
    }
  }, [isPlaying, videoType]);

  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.muted = isMuted;
    }
  }, [isMuted]);

  // Height classes
  const heightClasses = {
    viewport: 'min-h-screen',
    '80vh': 'min-h-[80vh]',
    '60vh': 'min-h-[60vh]',
    auto: 'min-h-[400px] md:min-h-[500px]',
  };

  // Content alignment
  const alignmentClasses = {
    top: 'items-start pt-24',
    center: 'items-center',
    bottom: 'items-end pb-24',
  };

  // Text alignment
  const textAlignClasses = {
    left: 'text-left items-start',
    center: 'text-center items-center',
    right: 'text-right items-end',
  };

  // Overlay colors
  const overlayColorClasses = {
    dark: 'bg-black',
    light: 'bg-white',
    primary: 'bg-primary',
  };

  // Title animations
  const titleAnimationClasses = {
    none: '',
    'fade-in': 'animate-fade-in',
    'slide-up': 'animate-slide-up',
    typewriter: 'animate-typewriter',
  };

  const renderVideo = () => {
    if (videoType === 'youtube' && videoId) {
      return (
        <iframe
          className="absolute inset-0 w-full h-full object-cover pointer-events-none"
          src={`https://www.youtube.com/embed/${videoId}?autoplay=${autoplay ? 1 : 0}&loop=${loop ? 1 : 0}&mute=${isMuted ? 1 : 0}&controls=0&showinfo=0&rel=0&modestbranding=1&playlist=${videoId}&playsinline=1&enablejsapi=1`}
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
          onLoad={() => setIsLoaded(true)}
          style={{ 
            position: 'absolute',
            top: '50%',
            left: '50%',
            width: '177.78vh', // 16:9 aspect ratio
            height: '100vh',
            minWidth: '100%',
            minHeight: '56.25vw', // 16:9 aspect ratio
            transform: 'translate(-50%, -50%)',
          }}
        />
      );
    }

    if (videoType === 'vimeo' && videoId) {
      return (
        <iframe
          className="absolute inset-0 w-full h-full object-cover pointer-events-none"
          src={`https://player.vimeo.com/video/${videoId}?autoplay=${autoplay ? 1 : 0}&loop=${loop ? 1 : 0}&muted=${isMuted ? 1 : 0}&background=1&quality=auto`}
          allow="autoplay; fullscreen; picture-in-picture"
          allowFullScreen
          onLoad={() => setIsLoaded(true)}
          style={{ 
            position: 'absolute',
            top: '50%',
            left: '50%',
            width: '177.78vh',
            height: '100vh',
            minWidth: '100%',
            minHeight: '56.25vw',
            transform: 'translate(-50%, -50%)',
          }}
        />
      );
    }

    if (videoType === 'direct' && videoUrl) {
      return (
        <video
          ref={videoRef}
          className="absolute inset-0 w-full h-full object-cover"
          src={videoUrl}
          poster={posterImage}
          autoPlay={autoplay}
          loop={loop}
          muted={isMuted}
          playsInline
          onLoadedData={() => setIsLoaded(true)}
        />
      );
    }

    // Fallback to poster image
    if (posterImage) {
      return (
        <img
          src={posterImage}
          alt=""
          className="absolute inset-0 w-full h-full object-cover"
        />
      );
    }

    return null;
  };

  const scrollToContent = () => {
    const nextSection = containerRef.current?.nextElementSibling;
    if (nextSection) {
      nextSection.scrollIntoView({ behavior: 'smooth' });
    }
  };

  return (
    <div
      ref={containerRef}
      className={cn(
        'relative w-full overflow-hidden flex',
        heightClasses[heightMode],
        alignmentClasses[contentAlignment]
      )}
    >
      {/* Video Background */}
      <div className="absolute inset-0 overflow-hidden">
        {renderVideo()}
        
        {/* Overlay */}
        <div 
          className={cn('absolute inset-0', overlayColorClasses[overlayColor])}
          style={{ opacity: overlayOpacity / 100 }}
        />
      </div>

      {/* Content */}
      <div className={cn(
        'relative z-10 container mx-auto px-4 py-12 flex flex-col',
        textAlignClasses[textAlignment]
      )}>
        <div className={cn(
          'max-w-3xl space-y-6',
          textAlignment === 'center' && 'mx-auto',
          textAlignment === 'right' && 'ml-auto'
        )}>
          <h1 className={cn(
            'text-4xl md:text-5xl lg:text-6xl font-bold tracking-tight',
            overlayColor === 'light' ? 'text-foreground' : 'text-white',
            titleAnimationClasses[titleAnimation]
          )}>
            {title}
          </h1>
          
          {subtitle && (
            <p className={cn(
              'text-lg md:text-xl lg:text-2xl max-w-2xl',
              overlayColor === 'light' ? 'text-muted-foreground' : 'text-white/90',
              titleAnimation !== 'none' && 'animate-fade-in animation-delay-200'
            )}>
              {subtitle}
            </p>
          )}

          {(primaryButton?.text || secondaryButton?.text) && (
            <div className={cn(
              'flex flex-wrap gap-4 pt-4',
              textAlignment === 'center' && 'justify-center',
              textAlignment === 'right' && 'justify-end',
              titleAnimation !== 'none' && 'animate-fade-in animation-delay-400'
            )}>
              {primaryButton?.text && (
                <Button size="lg" asChild>
                  <a href={primaryButton.url} className="flex items-center gap-2">
                    {primaryButton.text}
                    <ArrowRight className="h-4 w-4" />
                  </a>
                </Button>
              )}
              {secondaryButton?.text && (
                <Button 
                  size="lg" 
                  variant={overlayColor === 'light' ? 'outline' : 'secondary'}
                  asChild
                >
                  <a href={secondaryButton.url}>{secondaryButton.text}</a>
                </Button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Video Controls */}
      {showControls && (videoType === 'direct' || videoId) && (
        <div className="absolute bottom-6 right-6 z-20 flex items-center gap-2">
          {videoType === 'direct' && (
            <Button
              variant="secondary"
              size="icon"
              className="bg-black/50 hover:bg-black/70 text-white border-0"
              onClick={() => setIsPlaying(!isPlaying)}
            >
              {isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
            </Button>
          )}
          <Button
            variant="secondary"
            size="icon"
            className="bg-black/50 hover:bg-black/70 text-white border-0"
            onClick={() => setIsMuted(!isMuted)}
          >
            {isMuted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
          </Button>
        </div>
      )}

      {/* Scroll Indicator */}
      {showScrollIndicator && (
        <button
          onClick={scrollToContent}
          className={cn(
            'absolute bottom-8 left-1/2 -translate-x-1/2 z-20',
            'animate-bounce cursor-pointer',
            overlayColor === 'light' ? 'text-foreground' : 'text-white'
          )}
        >
          <ChevronDown className="h-8 w-8" />
        </button>
      )}

      {/* CSS for animations */}
      <style>{`
        @keyframes fade-in {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes slide-up {
          from { opacity: 0; transform: translateY(30px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .animate-fade-in {
          animation: fade-in 0.8s ease-out forwards;
        }
        .animate-slide-up {
          animation: slide-up 0.8s ease-out forwards;
        }
        .animation-delay-200 {
          animation-delay: 200ms;
          opacity: 0;
        }
        .animation-delay-400 {
          animation-delay: 400ms;
          opacity: 0;
        }
      `}</style>
    </div>
  );
}
