import { cn } from '@/lib/utils';

export interface ImageBlockData {
  src: string;
  alt: string;
  caption?: string;
  // New options
  fullBleed?: boolean;
  aspectRatio?: 'auto' | '16:9' | '4:3' | '1:1' | '21:9';
  hoverEffect?: 'none' | 'zoom' | 'fade' | 'lift';
  overlayText?: string;
  overlayPosition?: 'center' | 'bottom-left' | 'bottom-center';
  rounded?: boolean;
  shadow?: 'none' | 'sm' | 'md' | 'lg';
}

interface ImageBlockProps {
  data: ImageBlockData;
}

export function ImageBlock({ data }: ImageBlockProps) {
  if (!data.src) return null;

  const fullBleed = data.fullBleed ?? false;
  const aspectRatio = data.aspectRatio || 'auto';
  const hoverEffect = data.hoverEffect || 'none';
  const rounded = data.rounded ?? true;
  const shadow = data.shadow || 'md';

  const aspectRatioMap = {
    'auto': '',
    '16:9': 'aspect-video',
    '4:3': 'aspect-[4/3]',
    '1:1': 'aspect-square',
    '21:9': 'aspect-[21/9]',
  };

  const hoverEffectMap = {
    none: '',
    zoom: 'group-hover:scale-105 transition-transform duration-500 ease-out',
    fade: 'group-hover:opacity-80 transition-opacity duration-300',
    lift: '',
  };

  const shadowMap = {
    none: '',
    sm: 'shadow-sm',
    md: 'shadow-md',
    lg: 'shadow-lg',
  };

  const overlayPositionMap = {
    center: 'items-center justify-center text-center',
    'bottom-left': 'items-end justify-start text-left p-6',
    'bottom-center': 'items-end justify-center text-center pb-6',
  };

  return (
    <section className={cn(
      fullBleed ? 'w-full' : 'py-16 px-6'
    )}>
      <figure 
        className={cn(
          'relative overflow-hidden group',
          !fullBleed && 'container mx-auto max-w-6xl',
          rounded && !fullBleed && 'rounded-xl',
          shadowMap[shadow],
          hoverEffect === 'lift' && 'hover:-translate-y-1 hover:shadow-xl transition-all duration-300',
          aspectRatioMap[aspectRatio]
        )}
      >
        <img 
          src={data.src} 
          alt={data.alt || ''} 
          className={cn(
            'w-full h-full object-cover',
            aspectRatio !== 'auto' && 'absolute inset-0',
            hoverEffectMap[hoverEffect]
          )}
        />
        
        {data.overlayText && (
          <div 
            className={cn(
              'absolute inset-0 flex bg-gradient-to-t from-black/60 via-transparent to-transparent',
              overlayPositionMap[data.overlayPosition || 'center']
            )}
          >
            <h3 className="text-white text-2xl md:text-4xl font-bold drop-shadow-lg max-w-2xl">
              {data.overlayText}
            </h3>
          </div>
        )}
        
        {data.caption && !data.overlayText && (
          <figcaption className="mt-4 text-center text-sm text-muted-foreground px-4">
            {data.caption}
          </figcaption>
        )}
      </figure>
    </section>
  );
}
