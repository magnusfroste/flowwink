import { LogosBlockData } from '@/types/cms';
import { cn } from '@/lib/utils';
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
} from '@/components/ui/carousel';
import { useEffect, useState, useCallback } from 'react';
import useEmblaCarousel from 'embla-carousel-react';
import Autoplay from 'embla-carousel-autoplay';

interface LogosBlockProps {
  data: LogosBlockData;
}

function LogoImage({
  logo,
  name,
  url,
  size,
  variant,
}: {
  logo: string;
  name: string;
  url?: string;
  size: string;
  variant: string;
}) {
  const sizeClasses = {
    sm: 'h-8 max-w-[100px]',
    md: 'h-12 max-w-[140px]',
    lg: 'h-16 max-w-[180px]',
  };

  const content = (
    <img
      src={logo}
      alt={name}
      className={cn(
        'object-contain transition-all duration-300',
        sizeClasses[size as keyof typeof sizeClasses] || sizeClasses.md,
        variant === 'grayscale' && 'grayscale hover:grayscale-0',
        url && 'hover:scale-105'
      )}
    />
  );

  if (url) {
    return (
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="block"
        aria-label={name}
      >
        {content}
      </a>
    );
  }

  return content;
}

function AutoScrollLogos({
  logos,
  size,
  variant,
  speed,
}: {
  logos: LogosBlockData['logos'];
  size: string;
  variant: string;
  speed: number;
}) {
  // Duplicate logos for seamless scroll
  const duplicatedLogos = [...logos, ...logos];

  return (
    <div className="overflow-hidden">
      <div
        className="flex items-center gap-12 animate-scroll"
        style={{
          animationDuration: `${speed * logos.length}s`,
        }}
      >
        {duplicatedLogos.map((logo, index) => (
          <div
            key={`${logo.id}-${index}`}
            className={cn(
              'flex-shrink-0 px-4 py-2',
              variant === 'bordered' && 'border rounded-lg bg-card'
            )}
          >
            <LogoImage
              logo={logo.logo}
              name={logo.name}
              url={logo.url}
              size={size}
              variant={variant}
            />
          </div>
        ))}
      </div>
      <style>{`
        @keyframes scroll {
          0% { transform: translateX(0); }
          100% { transform: translateX(-50%); }
        }
        .animate-scroll {
          animation: scroll linear infinite;
        }
      `}</style>
    </div>
  );
}

export function LogosBlock({ data }: LogosBlockProps) {
  const {
    title,
    subtitle,
    logos = [],
    columns = 5,
    layout = 'grid',
    variant = 'default',
    logoSize = 'md',
    autoplay = true,
    autoplaySpeed = 3,
  } = data;

  if (logos.length === 0) {
    return null;
  }

  const gridCols = {
    3: 'grid-cols-3',
    4: 'grid-cols-2 sm:grid-cols-4',
    5: 'grid-cols-2 sm:grid-cols-3 lg:grid-cols-5',
    6: 'grid-cols-3 sm:grid-cols-4 lg:grid-cols-6',
  };

  return (
    <section className="py-12 md:py-16">
      <div className="container max-w-6xl mx-auto px-4">
        {(title || subtitle) && (
          <div className="text-center mb-8 md:mb-10">
            {title && (
              <h2 className="text-xl md:text-2xl font-semibold text-muted-foreground">
                {title}
              </h2>
            )}
            {subtitle && (
              <p className="text-sm text-muted-foreground mt-1">{subtitle}</p>
            )}
          </div>
        )}

        {layout === 'scroll' ? (
          <AutoScrollLogos
            logos={logos}
            size={logoSize}
            variant={variant}
            speed={autoplaySpeed}
          />
        ) : layout === 'carousel' ? (
          <Carousel
            opts={{ align: 'start', loop: true }}
            plugins={autoplay ? [Autoplay({ delay: autoplaySpeed * 1000 })] : []}
            className="w-full"
          >
            <CarouselContent className="-ml-4">
              {logos.map((logo) => (
                <CarouselItem
                  key={logo.id}
                  className={cn(
                    'pl-4 basis-1/2 sm:basis-1/3',
                    columns >= 4 && 'md:basis-1/4',
                    columns >= 5 && 'lg:basis-1/5',
                    columns >= 6 && 'lg:basis-1/6'
                  )}
                >
                  <div
                    className={cn(
                      'flex items-center justify-center p-4',
                      variant === 'bordered' && 'border rounded-lg bg-card'
                    )}
                  >
                    <LogoImage
                      logo={logo.logo}
                      name={logo.name}
                      url={logo.url}
                      size={logoSize}
                      variant={variant}
                    />
                  </div>
                </CarouselItem>
              ))}
            </CarouselContent>
            <CarouselPrevious className="hidden md:flex -left-12" />
            <CarouselNext className="hidden md:flex -right-12" />
          </Carousel>
        ) : (
          <div
            className={cn(
              'grid gap-8 items-center justify-items-center',
              gridCols[columns]
            )}
          >
            {logos.map((logo) => (
              <div
                key={logo.id}
                className={cn(
                  'flex items-center justify-center p-4',
                  variant === 'bordered' && 'border rounded-lg bg-card w-full'
                )}
              >
                <LogoImage
                  logo={logo.logo}
                  name={logo.name}
                  url={logo.url}
                  size={logoSize}
                  variant={variant}
                />
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
