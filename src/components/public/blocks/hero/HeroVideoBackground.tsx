import { logger } from '@/lib/logger';
import { useRef, useEffect, useState, useCallback } from 'react';

interface HeroVideoBackgroundProps {
  videoType: 'direct' | 'youtube' | 'vimeo';
  videoUrl: string;
  videoAutoplay?: boolean;
  videoLoop?: boolean;
  videoMuted?: boolean;
  videoPosterUrl?: string;
  videoUrlWebm?: string;
  isMuted: boolean;
  isPlaying: boolean;
  onError: () => void;
}

// Extract video ID from YouTube or Vimeo URL
function extractVideoId(url: string, type: 'youtube' | 'vimeo'): string | null {
  if (!url) return null;

  if (type === 'youtube') {
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

// Validate that a URL is reachable (HEAD request)
async function validateUrl(url: string): Promise<boolean> {
  try {
    const response = await fetch(url, { method: 'HEAD', mode: 'no-cors' });
    // no-cors returns opaque response, so we consider it "ok" if it doesn't throw
    return true;
  } catch {
    return false;
  }
}

export function HeroVideoBackground({
  videoType,
  videoUrl,
  videoAutoplay = true,
  videoLoop = true,
  videoMuted = true,
  videoPosterUrl,
  videoUrlWebm,
  isMuted,
  isPlaying,
  onError,
}: HeroVideoBackgroundProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [iframeLoaded, setIframeLoaded] = useState(false);
  const iframeTimeoutRef = useRef<ReturnType<typeof setTimeout>>();

  // Handle play/pause for direct videos
  useEffect(() => {
    if (videoRef.current) {
      if (isPlaying) {
        videoRef.current.play().catch(() => {
          // Autoplay blocked — try muted
          if (videoRef.current) {
            videoRef.current.muted = true;
            videoRef.current.play().catch(() => {});
          }
        });
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

  // Iframe load timeout — if iframe doesn't load in 8s, treat as error
  const handleIframeMount = useCallback(
    (el: HTMLIFrameElement | null) => {
      if (iframeTimeoutRef.current) {
        clearTimeout(iframeTimeoutRef.current);
      }
      if (el) {
        iframeTimeoutRef.current = setTimeout(() => {
          if (!iframeLoaded) {
            logger.warn('Video iframe load timeout, falling back');
            onError();
          }
        }, 8000);
      }
    },
    [iframeLoaded, onError]
  );

  useEffect(() => {
    return () => {
      if (iframeTimeoutRef.current) clearTimeout(iframeTimeoutRef.current);
    };
  }, []);

  if (videoType === 'youtube') {
    const videoId = extractVideoId(videoUrl, 'youtube');
    if (!videoId) {
      onError();
      return null;
    }

    const autoplay = videoAutoplay ? 1 : 0;
    const loop = videoLoop ? 1 : 0;
    const mute = isMuted ? 1 : 0;

    return (
      <div className="absolute inset-0 overflow-hidden">
        <iframe
          ref={handleIframeMount}
          src={`https://www.youtube.com/embed/${videoId}?autoplay=${autoplay}&loop=${loop}&mute=${mute}&controls=0&showinfo=0&rel=0&modestbranding=1&playlist=${videoId}&playsinline=1`}
          className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 min-w-[177.78vh] min-h-[56.25vw] w-auto h-auto"
          allow="autoplay; encrypted-media"
          allowFullScreen
          style={{ border: 0 }}
          onLoad={() => setIframeLoaded(true)}
          onError={() => onError()}
        />
      </div>
    );
  }

  if (videoType === 'vimeo') {
    const videoId = extractVideoId(videoUrl, 'vimeo');
    if (!videoId) {
      onError();
      return null;
    }

    const autoplay = videoAutoplay ? 1 : 0;
    const loop = videoLoop ? 1 : 0;
    const muted = isMuted ? 1 : 0;

    return (
      <div className="absolute inset-0 overflow-hidden">
        <iframe
          ref={handleIframeMount}
          src={`https://player.vimeo.com/video/${videoId}?autoplay=${autoplay}&loop=${loop}&muted=${muted}&background=1&quality=auto`}
          className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 min-w-[177.78vh] min-h-[56.25vw] w-auto h-auto"
          allow="autoplay; encrypted-media"
          allowFullScreen
          style={{ border: 0 }}
          onLoad={() => setIframeLoaded(true)}
          onError={() => onError()}
        />
      </div>
    );
  }

  // Direct video (MP4/WebM) with robust autoplay handling
  return (
    <video
      ref={videoRef}
      autoPlay={videoAutoplay}
      loop={videoLoop}
      muted={isMuted}
      playsInline
      preload="auto"
      className="absolute inset-0 w-full h-full object-cover"
      poster={videoPosterUrl}
      onError={() => onError()}
      onStalled={() => {
        // If stalled for too long, the source may be unreachable
        const timer = setTimeout(() => {
          if (videoRef.current && videoRef.current.readyState < 2) {
            onError();
          }
        }, 5000);
        videoRef.current?.addEventListener('playing', () => clearTimeout(timer), { once: true });
      }}
    >
      <source src={videoUrl} type="video/mp4" />
      {videoUrlWebm && <source src={videoUrlWebm} type="video/webm" />}
    </video>
  );
}

// Re-export extractVideoId for use in split layouts
export { extractVideoId };
