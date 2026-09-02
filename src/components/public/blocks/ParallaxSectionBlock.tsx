import { useRef, useState, useEffect } from 'react';
import { cn } from '@/lib/utils';
import { useParallaxBackground, parallaxLayerStyle } from '@/hooks/use-parallax-background';

export interface ParallaxSectionBlockData {
  backgroundImage?: string;
  title?: string;
  subtitle?: string;
  height?: 'sm' | 'md' | 'lg' | 'xl';
  textColor?: 'light' | 'dark';
  overlayOpacity?: number;
  contentAlignment?: 'left' | 'center' | 'right';
}

interface ParallaxSectionBlockProps {
  data: ParallaxSectionBlockData;
}

const heightClasses: Record<string, string> = {
  sm: 'min-h-[40vh]',
  md: 'min-h-[60vh]',
  lg: 'min-h-[80vh]',
  xl: 'min-h-screen',
};

const alignmentClasses: Record<string, string> = {
  left: 'text-left items-start',
  center: 'text-center items-center',
  right: 'text-right items-end',
};

export function ParallaxSectionBlock({ data }: ParallaxSectionBlockProps) {
  const { sectionRef, bgRef } = useParallaxBackground(!!data.backgroundImage);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const el = sectionRef.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true);
        }
      },
      { threshold: 0.15 }
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // Delad parallaxmotor — samma som HeroBlock (use-parallax-background).

  const isLight = data.textColor !== 'dark';
  const opacity = data.overlayOpacity ?? 50;
  const alignment = data.contentAlignment || 'center';

  return (
    <section
      ref={sectionRef}
      className={cn(
        'relative overflow-hidden',
        heightClasses[data.height || 'md'] ?? heightClasses.md
      )}
    >
      {/* Background layer — 30% taller than the section; the scroll handler
          above translates it so the image drifts slower than the page. */}
      {data.backgroundImage && (
        <div
          ref={bgRef}
          className="absolute left-0 w-full bg-cover bg-center will-change-transform"
          style={{
            backgroundImage: `url(${data.backgroundImage})`,
            top: '-15%',
            height: '130%',
          }}
        />
      )}

      {/* Overlay */}
      <div
        className="absolute inset-0"
        // The overlay follows the TEXT choice, not the theme: light text needs
        // the fixed dark image overlay, dark text needs the page ground. With
        // --background here, the light theme whitened the photo under white
        // text (theme audit 2026-09-02; live in securehealth and momentum).
        style={{ backgroundColor: isLight ? `hsl(var(--hero-overlay) / ${opacity / 100})` : `hsl(var(--background) / ${opacity / 100})` }}
      />

      {/* Content */}
      <div className={cn(
        'relative z-10 h-full flex flex-col justify-center px-6 py-16',
        alignmentClasses[alignment] ?? alignmentClasses.center
      )}>
        <div
          className={cn(
            'max-w-3xl space-y-6',
            'opacity-0 translate-y-6 transition-all duration-700 ease-out',
            isVisible && 'opacity-100 translate-y-0'
          )}
        >
          {data.title && (
            <h2
              className={cn(
                'text-3xl md:text-5xl lg:text-6xl font-bold tracking-tight font-serif',
                isLight ? 'text-on-image' : 'text-foreground'
              )}
            >
              {data.title}
            </h2>
          )}

          {data.subtitle && (
            <p
              className={cn(
                'text-lg md:text-xl max-w-2xl leading-relaxed',
                'opacity-0 translate-y-4 transition-all duration-700 delay-200 ease-out',
                isVisible && 'opacity-100 translate-y-0',
                isLight ? 'text-on-image-muted' : 'text-muted-foreground',
                alignment === 'center' && 'mx-auto'
              )}
            >
              {data.subtitle}
            </p>
          )}

          {/* Decorative accent line */}
          <div
            className={cn(
              'w-16 h-0.5 rounded-full bg-primary',
              'opacity-0 scale-x-0 transition-all duration-700 delay-[400ms] ease-out',
              isVisible && 'opacity-100 scale-x-100',
              alignment === 'center' && 'mx-auto',
              alignment === 'right' && 'ml-auto'
            )}
          />
        </div>
      </div>
    </section>
  );
}
