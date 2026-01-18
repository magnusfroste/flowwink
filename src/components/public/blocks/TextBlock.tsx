import { TextBlockData } from '@/types/cms';
import { renderToHtml } from '@/lib/tiptap-utils';

interface TextBlockProps {
  data: TextBlockData;
}

// Title size classes for Design System 2026
const titleSizeClasses: Record<string, string> = {
  default: 'text-3xl md:text-4xl',
  large: 'text-4xl md:text-5xl',
  display: 'text-5xl md:text-6xl lg:text-7xl',
};

export function TextBlock({ data }: TextBlockProps) {
  const html = renderToHtml(data.content);
  const titleSize = data.titleSize || 'default';
  const hasHeader = data.eyebrow || data.title;
  
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
        // Replace first occurrence of accentText in title
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
  
  return (
    <section className="py-12 px-6" style={{ backgroundColor: data.backgroundColor }}>
      <div className="container mx-auto max-w-4xl">
        {/* Design System 2026: Premium Header */}
        {hasHeader && (
          <div className="mb-8 md:mb-12">
            {/* Eyebrow label */}
            {data.eyebrow && (
              <p 
                className="text-sm font-semibold uppercase tracking-widest mb-4"
                style={{ color: data.eyebrowColor || 'hsl(var(--primary))' }}
              >
                {data.eyebrow}
              </p>
            )}
            
            {/* Display title with optional accent */}
            {data.title && (
              <h2 className={`font-bold tracking-tight leading-tight ${titleSizeClasses[titleSize]}`}>
                {renderTitle()}
              </h2>
            )}
          </div>
        )}
        
        {/* Rich text content */}
        <div 
          className="prose prose-lg dark:prose-invert max-w-none
            prose-blockquote:border-l-4 prose-blockquote:border-primary 
            prose-blockquote:pl-6 prose-blockquote:italic 
            prose-blockquote:text-muted-foreground prose-blockquote:not-italic
            prose-blockquote:font-normal prose-blockquote:my-6
            prose-p:text-lg prose-p:leading-relaxed"
          dangerouslySetInnerHTML={{ __html: html }}
        />
      </div>
    </section>
  );
}
