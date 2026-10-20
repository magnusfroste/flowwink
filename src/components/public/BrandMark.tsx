import { useEffect, useRef, useState } from 'react';

/**
 * The organisation's mark in the header: a static logo, or — when branding
 * carries a logo animation — a short video that plays and settles into it.
 *
 * Synclair's agency delivered the logo-mark as an After Effects animation
 * (black and white mp4). With no dial for it, the connected ChatGPT wrote a
 * MutationObserver script into custom_scripts that swapped the header image
 * for a <video> at runtime (2026-10-19). This component is that dial.
 *
 * Rules the script did not have:
 *  - `prefers-reduced-motion: reduce` → the static logo, always.
 *  - mode "once" plays ONE time per browser session (sessionStorage), then
 *    the static logo — a visitor navigating six pages does not watch the
 *    animation six times.
 *  - the static logo is the poster and the fallback: before the first frame,
 *    on error, and on screen readers (the video is role="img" with the
 *    organisation name).
 */
export type LogoAnimationMode = 'once' | 'loop' | 'off';

interface BrandMarkProps {
  /** The static logo for this surface. */
  src: string;
  /** The animation for this surface (mp4/webm). Absent = static only. */
  animationSrc?: string | null;
  mode?: LogoAnimationMode;
  alt: string;
  className?: string;
}

const SESSION_KEY = 'fw:logo-mark-played';

function reducedMotion(): boolean {
  try {
    return typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}

function playedThisSession(): boolean {
  try {
    return typeof window !== 'undefined' && window.sessionStorage.getItem(SESSION_KEY) === '1';
  } catch {
    return false;
  }
}

function markPlayed(): void {
  try {
    window.sessionStorage.setItem(SESSION_KEY, '1');
  } catch {
    /* private mode, blocked storage — the animation simply plays again next page */
  }
}

export function BrandMark({ src, animationSrc, mode = 'once', alt, className }: BrandMarkProps) {
  const wantsAnimation = !!animationSrc && mode !== 'off' && !reducedMotion() && (mode === 'loop' || !playedThisSession());
  const [animating, setAnimating] = useState(wantsAnimation);
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    setAnimating(wantsAnimation);
  }, [wantsAnimation]);

  if (!animating || !animationSrc) {
    return <img src={src} alt={alt} className={className} />;
  }

  return (
    <video
      ref={videoRef}
      src={animationSrc}
      poster={src}
      autoPlay
      muted
      playsInline
      loop={mode === 'loop'}
      preload="auto"
      role="img"
      aria-label={alt}
      className={className}
      data-logo-animation={mode}
      onEnded={() => {
        if (mode === 'once') {
          markPlayed();
          setAnimating(false);
        }
      }}
      onError={() => setAnimating(false)}
    />
  );
}
