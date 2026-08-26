import { QuoteBlockData } from '@/types/cms';
import { Quote } from 'lucide-react';
import { cn } from '@/lib/utils';

interface QuoteBlockProps {
  data: QuoteBlockData;
}

export function QuoteBlock({ data }: QuoteBlockProps) {
  const isStyled = data.variant === 'styled';

  return (
    <section>
      <div className="container mx-auto px-4 max-w-4xl">
        <blockquote
          className={cn(
            'relative',
            isStyled && 'bg-primary/5 rounded-[var(--radius-block,1rem)] p-8 md:p-12'
          )}
        >
          {isStyled && (
            <Quote className="absolute top-6 left-6 h-12 w-12 text-accent-foreground/20" />
          )}
          
          <div className={cn(isStyled && 'pl-8')}>
            <p
              className={cn(
                'text-xl md:text-2xl lg:text-3xl font-serif italic leading-relaxed',
                isStyled ? 'text-foreground' : 'text-foreground/90 border-l-4 border-accent-foreground pl-6'
              )}
            >
              {data.text}
            </p>
            
            {(data.author || data.source) && (
              <footer className="mt-6">
                <cite className="not-italic text-muted-foreground">
                  {data.author && (
                    <span className="font-medium text-foreground">{data.author}</span>
                  )}
                  {data.author && data.source && <span className="mx-2">•</span>}
                  {data.source && (
                    <span className="text-muted-foreground">{data.source}</span>
                  )}
                </cite>
              </footer>
            )}
          </div>
        </blockquote>
      </div>
    </section>
  );
}
