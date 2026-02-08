import { TwoColumnBlockData, TiptapDocument } from '@/types/cms';
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
  const imageFirst = data.imagePosition === 'left';
  const stickyColumn = data.stickyColumn || 'none';
  const titleSize = data.titleSize || 'default';
  const hasHeader = data.eyebrow || data.title;
  const hasSecondImage = data.secondImageSrc;
  
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
  
  // Use the shared tiptap-utils for consistent rendering
  const htmlContent = renderToHtml(data.content);

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

  // Check if CTA is internal or external link
  const isInternalLink = data.ctaUrl?.startsWith('/');

  return (
    <section 
      className="py-16 px-6"
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
                  "w-full h-auto rounded-lg shadow-md",
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

            {/* CTA Link */}
            {data.ctaText && data.ctaUrl && (
              <div className="mt-8">
                {isInternalLink ? (
                  <Link 
                    to={data.ctaUrl}
                    className="inline-flex items-center gap-3 text-sm font-semibold uppercase tracking-widest group hover:opacity-80 transition-opacity"
                  >
                    <span>{data.ctaText}</span>
                    <span className="flex items-center gap-2">
                      <span className="w-8 h-px bg-current" />
                      <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
                    </span>
                  </Link>
                ) : (
                  <a 
                    href={data.ctaUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-3 text-sm font-semibold uppercase tracking-widest group hover:opacity-80 transition-opacity"
                  >
                    <span>{data.ctaText}</span>
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
