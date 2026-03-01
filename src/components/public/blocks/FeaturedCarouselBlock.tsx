import { useState, useEffect, useCallback, useRef } from 'react';
import { cn } from '@/lib/utils';
import { ChevronLeft, ChevronRight } from 'lucide-react';

export interface CarouselSlide {
  id: string;
  title: string;
  subtitle?: string;
  description?: string;
  image: string;
  imageAlt?: string;
  ctaLabel?: string;
  ctaUrl?: string;
  ctaVariant?: 'primary' | 'secondary' | 'outline';
  textPosition?: 'left' | 'center' | 'right';
  overlayOpacity?: number;
}

export interface FeaturedCarouselBlockData {
  slides: CarouselSlide[];
  autoPlay?: boolean;
  interval?: number;
  height?: 'sm' | 'md' | 'lg' | 'full';
  showArrows?: boolean;
  showDots?: boolean;
  pauseOnHover?: boolean;
  transition?: 'fade' | 'slide';
}

interface FeaturedCarouselBlockProps {
  data: FeaturedCarouselBlockData;
}

const HEIGHT_MAP = {
  sm: 'h-[360px]',
  md: 'h-[520px]',
  lg: 'h-[680px]',
  full: 'h-screen',
};

export function FeaturedCarouselBlock({ data }: FeaturedCarouselBlockProps) {
  const {
    slides = [],
    autoPlay = true,
    interval = 5000,
    height = 'md',
    showArrows = true,
    showDots = true,
    pauseOnHover = true,
    transition = 'fade',
  } = data;

  const [current, setCurrent] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const [direction, setDirection] = useState<'next' | 'prev'>('next');
  const timerRef = useRef<ReturnType<typeof setInterval>>();

  const count = slides.length;

  const goTo = useCallback((index: number, dir?: 'next' | 'prev') => {
    setDirection(dir || (index > current ? 'next' : 'prev'));
    setCurrent((index + count) % count);
  }, [current, count]);

  const next = useCallback(() => goTo(current + 1, 'next'), [current, goTo]);
  const prev = useCallback(() => goTo(current - 1, 'prev'), [current, goTo]);

  useEffect(() => {
    if (!autoPlay || isPaused || count <= 1) return;
    timerRef.current = setInterval(next, interval);
    return () => clearInterval(timerRef.current);
  }, [autoPlay, isPaused, interval, next, count]);

  if (count === 0) return null;

  const textAlignMap = {
    left: 'items-start text-left',
    center: 'items-center text-center',
    right: 'items-end text-right',
  };

  return (
    <section
      className={cn('relative w-full overflow-hidden bg-black', HEIGHT_MAP[height])}
      onMouseEnter={() => pauseOnHover && setIsPaused(true)}
      onMouseLeave={() => pauseOnHover && setIsPaused(false)}
      aria-roledescription="carousel"
      aria-label="Featured content"
    >
      {/* Slides */}
      {slides.map((slide, i) => {
        const isActive = i === current;
        const pos = slide.textPosition || 'center';
        const overlay = slide.overlayOpacity ?? 40;

        return (
          <div
            key={slide.id}
            role="group"
            aria-roledescription="slide"
            aria-label={`Slide ${i + 1} of ${count}`}
            aria-hidden={!isActive}
            className={cn(
              'absolute inset-0 transition-all duration-700 ease-out',
              transition === 'fade' && (isActive ? 'opacity-100 z-10' : 'opacity-0 z-0'),
              transition === 'slide' && isActive && 'translate-x-0 z-10',
              transition === 'slide' && !isActive && direction === 'next' && 'translate-x-full z-0',
              transition === 'slide' && !isActive && direction === 'prev' && '-translate-x-full z-0',
            )}
          >
            {/* Image */}
            <img
              src={slide.image}
              alt={slide.imageAlt || slide.title}
              className={cn(
                'w-full h-full object-cover transition-transform duration-[5000ms] ease-out',
                isActive && 'scale-105',
              )}
              loading={i === 0 ? 'eager' : 'lazy'}
            />

            {/* Overlay */}
            <div
              className="absolute inset-0"
              style={{ background: `linear-gradient(to top, rgba(0,0,0,${overlay / 100}), rgba(0,0,0,${overlay / 200}))` }}
            />

            {/* Content */}
            <div className={cn(
              'absolute inset-0 z-10 flex flex-col justify-end pb-16 md:pb-24 px-6 md:px-16 lg:px-24',
              textAlignMap[pos],
            )}>
              <div className="max-w-2xl space-y-4">
                {slide.subtitle && (
                  <p className="text-sm md:text-base font-medium uppercase tracking-[0.2em] text-white/70">
                    {slide.subtitle}
                  </p>
                )}
                <h2 className="text-3xl md:text-5xl lg:text-6xl font-bold text-white tracking-tight leading-tight">
                  {slide.title}
                </h2>
                {slide.description && (
                  <p className="text-base md:text-lg text-white/80 leading-relaxed max-w-xl">
                    {slide.description}
                  </p>
                )}
                {slide.ctaLabel && slide.ctaUrl && (
                  <a
                    href={slide.ctaUrl}
                    className={cn(
                      'inline-flex items-center px-6 py-3 rounded-lg font-medium text-sm transition-all duration-300 mt-2',
                      slide.ctaVariant === 'outline'
                        ? 'border-2 border-white text-white hover:bg-white hover:text-black'
                        : slide.ctaVariant === 'secondary'
                        ? 'bg-white/20 backdrop-blur-sm text-white hover:bg-white/30'
                        : 'bg-white text-black hover:bg-white/90',
                    )}
                  >
                    {slide.ctaLabel}
                    <ChevronRight className="ml-2 h-4 w-4" />
                  </a>
                )}
              </div>
            </div>
          </div>
        );
      })}

      {/* Arrows */}
      {showArrows && count > 1 && (
        <>
          <button
            onClick={prev}
            className="absolute left-4 top-1/2 -translate-y-1/2 z-20 w-12 h-12 rounded-full bg-black/30 backdrop-blur-sm text-white flex items-center justify-center hover:bg-black/50 transition-colors"
            aria-label="Previous slide"
          >
            <ChevronLeft className="h-6 w-6" />
          </button>
          <button
            onClick={next}
            className="absolute right-4 top-1/2 -translate-y-1/2 z-20 w-12 h-12 rounded-full bg-black/30 backdrop-blur-sm text-white flex items-center justify-center hover:bg-black/50 transition-colors"
            aria-label="Next slide"
          >
            <ChevronRight className="h-6 w-6" />
          </button>
        </>
      )}

      {/* Dots */}
      {showDots && count > 1 && (
        <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-20 flex gap-2">
          {slides.map((_, i) => (
            <button
              key={i}
              onClick={() => goTo(i)}
              aria-label={`Go to slide ${i + 1}`}
              className={cn(
                'h-2 rounded-full transition-all duration-300',
                i === current ? 'w-8 bg-white' : 'w-2 bg-white/40 hover:bg-white/60',
              )}
            />
          ))}
        </div>
      )}

      {/* Progress bar */}
      {autoPlay && count > 1 && (
        <div className="absolute bottom-0 left-0 right-0 z-20 h-0.5 bg-white/10">
          <div
            className="h-full bg-white/60 transition-all ease-linear"
            style={{
              width: `${((current + 1) / count) * 100}%`,
              transitionDuration: `${interval}ms`,
            }}
          />
        </div>
      )}
    </section>
  );
}
