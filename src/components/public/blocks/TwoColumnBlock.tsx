import { TwoColumnBlockData, TiptapDocument, ImageAspectRatio, ImageRounded } from '@/types/cms';
import { renderToHtml } from '@/lib/tiptap-utils';
import { cn } from '@/lib/utils';
import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { useBranding } from '@/providers/BrandingProvider';

interface TwoColumnBlockProps {
  data: TwoColumnBlockData;
}

// Shared typography scale for consistency across all blocks (Webflow-style)
const typographyScale = {
  // h1 - Hero/Display titles
  h1: 'text-5xl md:text-6xl lg:text-7xl',
  h1Large: 'text-6xl md:text-7xl lg:text-8xl',
  // h2 - Section titles
  h2: 'text-3xl md:text-4xl',
  h2Large: 'text-4xl md:text-5xl',
  // h3 - Subtitles
  h3: 'text-2xl md:text-3xl',
};

export function TwoColumnBlock({ data }: TwoColumnBlockProps) {
  const { branding } = useBranding();
  // Text-text mode covers two authoring shapes: leftColumn/rightColumn, and the
  // alternate content/secondaryContent pair with layout 'text-text'. Without the
  // second shape the block fell back to image+text and rendered an empty image
  // column (half-blank section) whenever no imageSrc was set.
  const isTextTextLayout = !!(
    data.leftColumn ||
    data.rightColumn ||
    (data.layout === 'text-text' && data.secondaryContent)
  );
  const imageFirst = data.imagePosition === 'left';
  const stickyColumn = data.stickyColumn || 'none';
  const titleSize = data.titleSize || 'default';
  const hasHeader = data.eyebrow || data.title;
  const hasSecondImage = data.secondImageSrc;
  const imageAspect = data.imageAspect || 'auto';
  const imageFit = data.imageFit || 'cover';
  const imageRounded = data.imageRounded || 'lg';
  
  // Default eyebrow color to accent, allow override
  const eyebrowColor = data.eyebrowColor || (branding?.accentColor ? `hsl(${branding.accentColor})` : 'hsl(var(--accent-foreground))');

  // Map titleSize to typography scale
  const getTitleSize = () => {
    switch (titleSize) {
      case 'large': return typographyScale.h2Large;
      case 'display': return typographyScale.h1;
      default: return typographyScale.h2;
    }
  };

  const stickyStyles = 'md:sticky md:top-24 md:self-start';

  // Aspect ratio CSS mapping
  const aspectRatioMap: Record<ImageAspectRatio, string> = {
    'auto': '',
    '1:1': 'aspect-square',
    '4:3': 'aspect-[4/3]',
    '3:2': 'aspect-[3/2]',
    '16:9': 'aspect-video',
    '21:9': 'aspect-[21/9]',
  };

  // Border-radius mapping
  // Authored values outside this map used to yield undefined — no rounding at
  // all, silently ('xl' ships in two templates). Keyed loosely with a fallback.
  const roundedMap: Record<string, string> = {
    'none': 'rounded-none',
    'sm': 'rounded-sm',
    'md': 'rounded-md',
    'lg': 'rounded-lg',
    'xl': 'rounded-xl',
    'full': 'rounded-[var(--radius-block,1rem)]',
  };

  const imageAspectClass = aspectRatioMap[imageAspect] ?? aspectRatioMap.auto;
  const imageRoundedClass = roundedMap[imageRounded] ?? roundedMap.lg;
  const imageFitClass = imageFit === 'contain' ? 'object-contain' : 'object-cover';
  
  // Use the shared tiptap-utils for consistent rendering
  const htmlContent = renderToHtml(data.content);
  const leftHtml = isTextTextLayout ? renderToHtml(data.leftColumn ?? data.content) : '';
  const rightHtml = isTextTextLayout ? renderToHtml(data.rightColumn ?? data.secondaryContent) : '';

  // Build title with optional accent text
  const renderTitle = () => {
    if (!data.title) return null;
    
    const accentText = data.accentText;
    const accentPosition = data.accentPosition || 'end';
    
    if (!accentText) {
      return <span>{data.title}</span>;
    }
    
    // Script/accent font style
    const accentSpan = (
      <span 
        className="font-serif italic"
        style={{ fontFamily: "'Playfair Display', Georgia, serif" }}
      >
        {accentText}
      </span>
    );
    
    switch (accentPosition) {
      case 'start':
        return <>{accentSpan} {data.title}</>;
      case 'inline':
        const parts = data.title.split(accentText);
        if (parts.length > 1) {
          return <>{parts[0]}{accentSpan}{parts.slice(1).join(accentText)}</>;
        }
        return <>{data.title} {accentSpan}</>;
      case 'end':
      default:
        return <>{data.title} {accentSpan}</>;
    }
  };

  // CTA: ctaText/ctaUrl is canonical; primaryButton is an alternate shape used
  // by some templates. Both layout branches read the same fields.
  const ctaText = data.ctaText || data.primaryButton?.text;
  const ctaUrl = data.ctaUrl || data.primaryButton?.url;
  const isInternalLink = ctaUrl?.startsWith('/');

  // Layout grid class for text-text mode
  const layoutGridClass = (() => {
    if (!isTextTextLayout) return 'md:grid-cols-2';
    switch (data.layout) {
      case '60-40': return 'md:grid-cols-[3fr_2fr]';
      case '40-60': return 'md:grid-cols-[2fr_3fr]';
      default: return 'md:grid-cols-2';
    }
  })();

  // Text-Text layout mode
  if (isTextTextLayout) {
    return (
      <section className="" style={{ backgroundColor: data.backgroundColor }}>
        <div className="container mx-auto max-w-6xl">
          {/* Header */}
          {hasHeader && (
            <div className="mb-10">
              {data.eyebrow && (
                <p className="text-sm font-semibold uppercase tracking-widest mb-4" style={{ color: eyebrowColor }}>
                  {data.eyebrow}
                </p>
              )}
              {data.title && (
                <h2 className={`font-bold tracking-tight leading-tight ${getTitleSize()}`}>
                  {renderTitle()}
                </h2>
              )}
            </div>
          )}
          <div className={cn('grid gap-12', layoutGridClass)}>
            {/* Left column */}
            {leftHtml && (
              <div className="prose prose-lg dark:prose-invert max-w-none" dangerouslySetInnerHTML={{ __html: leftHtml }} />
            )}
            {/* Right column */}
            {rightHtml && (
              <div className="prose prose-lg dark:prose-invert max-w-none" dangerouslySetInnerHTML={{ __html: rightHtml }} />
            )}
          </div>
          {/* Note */}
          {data.note && (
            <p className="mt-6 text-sm text-muted-foreground italic">{data.note}</p>
          )}
          {/* CTA */}
          {ctaText && ctaUrl && (
            <div className="mt-8">
              {isInternalLink ? (
                <Link to={ctaUrl!} className="inline-flex items-center gap-3 text-sm font-semibold uppercase tracking-widest group hover:opacity-80 transition-opacity">
                  <span>{ctaText}</span>
                  <span className="flex items-center gap-2">
                    <span className="w-8 h-px bg-current" />
                    <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
                  </span>
                </Link>
              ) : (
                <a href={ctaUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-3 text-sm font-semibold uppercase tracking-widest group hover:opacity-80 transition-opacity">
                  <span>{ctaText}</span>
                  <span className="flex items-center gap-2">
                    <span className="w-8 h-px bg-current" />
                    <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
                  </span>
                </a>
              )}
            </div>
          )}
        </div>
      </section>
    );
  }

  // Image+Text layout (original)
  return (
    <section
      /* px-6 här var dubbelskalet som ÖVERLEVDE #287-svepet: skannern läste
         bara enradiga <section className="…"> och det här attributet bor på
         egen rad. Uppmätt på /why (mobil): 16+24 = 40 px per sida mot
         grannarnas 16. backgroundColor får panelbehandling (samma linje som
         TextBlock) — målad yta bär radie + invändig padding, omålad bär inget. */
      className={data.backgroundColor ? 'rounded-[var(--radius-block,1rem)] p-6 md:p-8' : undefined}
      style={{ backgroundColor: data.backgroundColor }}
    >
      <div className="container mx-auto max-w-6xl">
        <div className={cn(
          'grid md:grid-cols-2 gap-12',
          stickyColumn === 'none' && 'items-center',
          stickyColumn !== 'none' && 'items-start',
          imageFirst ? '' : 'md:[direction:rtl]'
        )}>
          {/* Image column - with stacked effect support */}
          <div className={cn(
            'relative',
            imageFirst ? '' : 'md:[direction:ltr]',
            stickyColumn === 'image' && stickyStyles
          )}>
            {/* Main image */}
            {data.imageSrc && (
              <img
                src={data.imageSrc}
                alt={data.imageAlt || ''}
                className={cn(
                  "w-full shadow-md",
                  imageAspectClass ? `${imageAspectClass} ${imageFitClass}` : 'h-auto',
                  imageRoundedClass,
                  hasSecondImage && "relative z-10"
                )}
              />
            )}
            {/* Second image - stacked effect */}
            {hasSecondImage && (
              <img
                src={data.secondImageSrc}
                alt={data.secondImageAlt || ''}
                className="absolute -bottom-8 -right-4 w-2/3 h-auto rounded-lg shadow-xl z-20 border-4 border-background"
              />
            )}
          </div>

          {/* Text column */}
          <div className={cn(
            imageFirst ? '' : 'md:[direction:ltr]',
            stickyColumn === 'text' && stickyStyles,
            hasSecondImage && 'pb-8' // Extra padding when stacked images
          )}>
            {/* Design System 2026: Premium Header */}
            {hasHeader && (
              <div className="mb-6">
                {/* Eyebrow label */}
                {data.eyebrow && (
                  <p 
                    className="text-sm font-semibold uppercase tracking-widest mb-4"
                    style={{ color: eyebrowColor }}
                  >
                    {data.eyebrow}
                  </p>
                )}
                
                {/* Display title with optional accent */}
                {data.title && (
                  <h2 className={`font-bold tracking-tight leading-tight mb-6 ${getTitleSize()}`}>
                    {renderTitle()}
                  </h2>
                )}
              </div>
            )}

            {/* Rich text content */}
            <div 
              className="prose prose-lg dark:prose-invert max-w-none"
              dangerouslySetInnerHTML={{ __html: htmlContent }} 
            />

            {/* Note */}
            {data.note && (
              <p className="mt-6 text-sm text-muted-foreground italic">{data.note}</p>
            )}

            {/* CTA Link */}
            {ctaText && ctaUrl && (
              <div className="mt-8">
                {isInternalLink ? (
                  <Link
                    to={ctaUrl}
                    className="inline-flex items-center gap-3 text-sm font-semibold uppercase tracking-widest group hover:opacity-80 transition-opacity"
                  >
                    <span>{ctaText}</span>
                    <span className="flex items-center gap-2">
                      <span className="w-8 h-px bg-current" />
                      <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
                    </span>
                  </Link>
                ) : (
                  <a 
                    href={ctaUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-3 text-sm font-semibold uppercase tracking-widest group hover:opacity-80 transition-opacity"
                  >
                    <span>{ctaText}</span>
                    <span className="flex items-center gap-2">
                      <span className="w-8 h-px bg-current" />
                      <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
                    </span>
                  </a>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
