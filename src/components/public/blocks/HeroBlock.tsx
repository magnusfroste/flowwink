import { HeroBlockData } from '@/types/cms';
import { useBranding } from '@/providers/BrandingProvider';

interface HeroBlockProps {
  data: HeroBlockData;
}

const opacityMap: Record<string, string> = {
  none: 'opacity-100',
  light: 'opacity-30',
  medium: 'opacity-20',
  strong: 'opacity-10',
};

export function HeroBlock({ data }: HeroBlockProps) {
  const { branding } = useBranding();
  
  if (!data.title) return null;
  
  const overlayOpacity = opacityMap[branding?.heroOverlayOpacity || 'medium'];
  const backgroundType = data.backgroundType || 'image';
  const hasVideoBackground = backgroundType === 'video' && data.videoUrl;
  const hasImageBackground = backgroundType === 'image' && data.backgroundImage;
  
  return (
    <section className="relative py-24 px-6 bg-primary text-primary-foreground overflow-hidden">
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
          className={`absolute inset-0 bg-cover bg-center ${overlayOpacity}`}
          style={{ backgroundImage: `url(${data.backgroundImage})` }}
        />
      )}
      
      {/* Overlay for video to ensure text readability */}
      {hasVideoBackground && (
        <div className="absolute inset-0 bg-primary/60" />
      )}
      
      <div className="relative container mx-auto text-center max-w-3xl z-10">
        <h1 className="font-serif text-5xl font-bold mb-6">{data.title}</h1>
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
    </section>
  );
}
