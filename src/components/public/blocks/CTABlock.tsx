import { CTABlockData } from '@/types/cms';
import { cn } from '@/lib/utils';
import { handleAnchorClick, isAnchorLink } from '@/hooks/useAnchorScroll';

interface CTABlockProps {
  data: CTABlockData;
}

export function CTABlock({ data }: CTABlockProps) {
  if (!data.title || !data.buttonText || !data.buttonUrl) return null;
  
  const variant = data.variant || 'default';
  const overlayOpacity = data.overlayOpacity ?? 0.6;

  // Split variant - image on one side, content on the other
  if (variant === 'split') {
    return (
      <section className="py-0">
        <div className="grid md:grid-cols-2 min-h-[400px]">
          {/* Image side */}
          <div className="relative bg-muted">
            {data.backgroundImage ? (
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
          <div className="flex flex-col justify-center px-8 md:px-12 lg:px-16 py-12 bg-background">
            <h2 className="font-serif text-2xl md:text-3xl lg:text-4xl font-bold mb-4 text-foreground">
              {data.title}
            </h2>
            {data.subtitle && (
              <p className="text-lg text-muted-foreground mb-8 max-w-md">
                {data.subtitle}
              </p>
            )}
            <div className="flex flex-wrap gap-4">
              <a
                href={data.buttonUrl}
                onClick={(e) => isAnchorLink(data.buttonUrl) && handleAnchorClick(e, data.buttonUrl)}
                className="inline-flex items-center justify-center px-6 py-3 bg-primary text-primary-foreground font-medium rounded-lg hover:bg-primary/90 transition-colors"
              >
                {data.buttonText}
              </a>
              {data.secondaryButtonText && data.secondaryButtonUrl && (
                <a
                  href={data.secondaryButtonUrl}
                  onClick={(e) => isAnchorLink(data.secondaryButtonUrl) && handleAnchorClick(e, data.secondaryButtonUrl!)}
                  className="inline-flex items-center justify-center px-6 py-3 border border-border text-foreground font-medium rounded-lg hover:bg-muted transition-colors"
                >
                  {data.secondaryButtonText}
                </a>
              )}
            </div>
          </div>
        </div>
      </section>
    );
  }

  // Minimal variant - clean, understated design
  if (variant === 'minimal') {
    return (
      <section className="py-16 md:py-24 px-6">
        <div className="container mx-auto text-center max-w-3xl">
          <h2 className="font-serif text-2xl md:text-3xl font-bold mb-4 text-foreground">
            {data.title}
          </h2>
          {data.subtitle && (
            <p className="text-muted-foreground mb-8">
              {data.subtitle}
            </p>
          )}
          <div className="flex flex-wrap justify-center gap-4">
            <a
              href={data.buttonUrl}
              onClick={(e) => isAnchorLink(data.buttonUrl) && handleAnchorClick(e, data.buttonUrl)}
              className="inline-flex items-center justify-center px-6 py-3 bg-foreground text-background font-medium rounded-lg hover:bg-foreground/90 transition-colors"
            >
              {data.buttonText}
            </a>
            {data.secondaryButtonText && data.secondaryButtonUrl && (
              <a
                href={data.secondaryButtonUrl}
                onClick={(e) => isAnchorLink(data.secondaryButtonUrl) && handleAnchorClick(e, data.secondaryButtonUrl!)}
                className="inline-flex items-center justify-center px-6 py-3 text-foreground font-medium underline underline-offset-4 hover:no-underline transition-all"
              >
                {data.secondaryButtonText}
              </a>
            )}
          </div>
        </div>
      </section>
    );
  }

  // With-image variant - full background image with overlay
  if (variant === 'with-image' && data.backgroundImage) {
    return (
      <section className="relative py-20 md:py-28 px-6">
        {/* Background image */}
        <div className="absolute inset-0">
          <img
            src={data.backgroundImage}
            alt=""
            className="w-full h-full object-cover"
          />
          <div
            className="absolute inset-0 bg-foreground"
            style={{ opacity: overlayOpacity }}
          />
        </div>
        
        {/* Content */}
        <div className="relative container mx-auto text-center max-w-3xl">
          <h2 className="font-serif text-3xl md:text-4xl font-bold mb-4 text-background">
            {data.title}
          </h2>
          {data.subtitle && (
            <p className="text-lg text-background/90 mb-8">
              {data.subtitle}
            </p>
          )}
          <div className="flex flex-wrap justify-center gap-4">
            <a
              href={data.buttonUrl}
              onClick={(e) => isAnchorLink(data.buttonUrl) && handleAnchorClick(e, data.buttonUrl)}
              className="inline-flex items-center justify-center px-8 py-3 bg-background text-foreground font-medium rounded-lg hover:bg-background/90 transition-colors"
            >
              {data.buttonText}
            </a>
            {data.secondaryButtonText && data.secondaryButtonUrl && (
              <a
                href={data.secondaryButtonUrl}
                onClick={(e) => isAnchorLink(data.secondaryButtonUrl) && handleAnchorClick(e, data.secondaryButtonUrl!)}
                className="inline-flex items-center justify-center px-8 py-3 border-2 border-background text-background font-medium rounded-lg hover:bg-background/10 transition-colors"
              >
                {data.secondaryButtonText}
              </a>
            )}
          </div>
        </div>
      </section>
    );
  }

  // Default variant - solid/gradient background
  const useGradient = data.gradient ?? true;
  
  return (
    <section
      className={cn(
        'py-16 px-6',
        useGradient
          ? 'bg-gradient-to-r from-primary to-primary/80 text-primary-foreground'
          : 'bg-primary text-primary-foreground'
      )}
    >
      <div className="container mx-auto text-center max-w-3xl">
        <h2 className="font-serif text-3xl font-bold mb-4">{data.title}</h2>
        {data.subtitle && <p className="text-lg opacity-90 mb-6">{data.subtitle}</p>}
        <div className="flex flex-wrap justify-center gap-4">
          <a
            href={data.buttonUrl}
            onClick={(e) => isAnchorLink(data.buttonUrl) && handleAnchorClick(e, data.buttonUrl)}
            className="inline-flex items-center justify-center px-8 py-3 bg-background text-foreground font-medium rounded-lg hover:opacity-90 transition-opacity"
          >
            {data.buttonText}
          </a>
          {data.secondaryButtonText && data.secondaryButtonUrl && (
            <a
              href={data.secondaryButtonUrl}
              onClick={(e) => isAnchorLink(data.secondaryButtonUrl) && handleAnchorClick(e, data.secondaryButtonUrl!)}
              className="inline-flex items-center justify-center px-8 py-3 border-2 border-primary-foreground/30 text-primary-foreground font-medium rounded-lg hover:bg-primary-foreground/10 transition-colors"
            >
              {data.secondaryButtonText}
            </a>
          )}
        </div>
      </div>
    </section>
  );
}
