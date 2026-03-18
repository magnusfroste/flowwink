import { useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';
import { icons } from 'lucide-react';

export interface BentoGridItem {
  id: string;
  title: string;
  description?: string;
  icon?: string;
  image?: string;
  imageAlt?: string;
  span?: 'normal' | 'wide' | 'tall' | 'large';
  accentColor?: string;
  linkUrl?: string;
  linkLabel?: string;
}

export interface BentoGridBlockData {
  title?: string;
  subtitle?: string;
  eyebrow?: string;
  eyebrowColor?: string;
  items: BentoGridItem[];
  columns?: 3 | 4;
  gap?: 'sm' | 'md' | 'lg';
  variant?: 'default' | 'glass' | 'bordered';
  staggeredReveal?: boolean;
}

interface BentoGridBlockProps {
  data: BentoGridBlockData;
}

function getSpanClasses(span?: string, columns?: number): string {
  const cols = columns || 3;
  switch (span) {
    case 'wide':
      return 'md:col-span-2';
    case 'tall':
      return 'md:row-span-2';
    case 'large':
      return 'md:col-span-2 md:row-span-2';
    default:
      return '';
  }
}

function getGapClass(gap?: string): string {
  switch (gap) {
    case 'sm': return 'gap-3';
    case 'lg': return 'gap-8';
    default: return 'gap-5';
  }
}

function LucideIcon({ name, className }: { name: string; className?: string }) {
  const IconComponent = icons[name as keyof typeof icons];
  if (!IconComponent) return null;
  return <IconComponent className={className} />;
}

export function BentoGridBlock({ data }: BentoGridBlockProps) {
  const { title, subtitle, eyebrow, eyebrowColor, items, columns = 3, gap = 'md', variant = 'default', staggeredReveal = true } = data;
  const containerRef = useRef<HTMLDivElement>(null);
  const [visibleItems, setVisibleItems] = useState<Set<number>>(new Set());

  useEffect(() => {
    if (!staggeredReveal || !containerRef.current) {
      // Show all immediately if no animation
      setVisibleItems(new Set(items.map((_, i) => i)));
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            const index = Number(entry.target.getAttribute('data-index'));
            setTimeout(() => {
              setVisibleItems((prev) => new Set(prev).add(index));
            }, index * 100);
            observer.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.15, rootMargin: '0px 0px -40px 0px' }
    );

    const cards = containerRef.current.querySelectorAll('[data-index]');
    cards.forEach((card) => observer.observe(card));

    return () => observer.disconnect();
  }, [items.length, staggeredReveal]);

  const cardBaseClasses = cn(
    'relative overflow-hidden rounded-2xl p-6 transition-all duration-500 group',
    variant === 'default' && 'bg-card border border-border/50 hover:border-primary/30 hover:shadow-lg hover:shadow-primary/5',
    variant === 'glass' && 'bg-card/40 backdrop-blur-xl border border-white/10 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.08)] hover:bg-card/60 hover:border-white/20 hover:shadow-xl hover:shadow-primary/10',
    variant === 'bordered' && 'bg-transparent border-2 border-border hover:border-primary/40 hover:bg-card/30',
  );

  return (
    <section className="py-12 md:py-20">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header */}
        {(eyebrow || title || subtitle) && (
          <div className="text-center mb-8 md:mb-12 max-w-3xl mx-auto">
            {eyebrow && (
              <span
                className="inline-block text-xs font-semibold uppercase tracking-[0.2em] mb-3"
                style={{ color: eyebrowColor || 'hsl(var(--primary))' }}
              >
                {eyebrow}
              </span>
            )}
            {title && (
              <h2 className="text-3xl md:text-4xl lg:text-5xl font-bold tracking-tight text-foreground mb-4">
                {title}
              </h2>
            )}
            {subtitle && (
              <p className="text-lg text-muted-foreground leading-relaxed">
                {subtitle}
              </p>
            )}
          </div>
        )}

        {/* Grid */}
        <div
          ref={containerRef}
          className={cn(
            'grid grid-cols-1 md:grid-cols-3 auto-rows-[minmax(160px,auto)]',
            columns === 4 && 'lg:grid-cols-4',
            getGapClass(gap),
          )}
        >
          {items.map((item, index) => {
            const isVisible = visibleItems.has(index);
            const Wrapper = item.linkUrl ? 'a' : 'div';
            const wrapperProps = item.linkUrl ? { href: item.linkUrl, target: item.linkUrl.startsWith('http') ? '_blank' : undefined, rel: item.linkUrl.startsWith('http') ? 'noopener noreferrer' : undefined } : {};

            return (
              <Wrapper
                key={item.id}
                data-index={index}
                className={cn(
                  cardBaseClasses,
                  getSpanClasses(item.span, columns),
                  item.linkUrl && 'cursor-pointer',
                  'transform',
                  staggeredReveal && !isVisible && 'opacity-0 translate-y-6',
                  staggeredReveal && isVisible && 'opacity-100 translate-y-0',
                )}
                {...wrapperProps}
              >
                {/* Background image */}
                {item.image && (
                  <div className="absolute inset-0">
                    <img
                      src={item.image}
                      alt={item.imageAlt || item.title}
                      className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
                      loading="lazy"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/30 to-transparent" />
                  </div>
                )}

                {/* Content */}
                <div className={cn('relative z-10 flex flex-col h-full', item.image && 'justify-end text-white')}>
                  {item.icon && !item.image && (
                    <div
                      className="w-12 h-12 rounded-xl flex items-center justify-center mb-4 transition-colors duration-300"
                      style={{
                        backgroundColor: item.accentColor
                          ? `${item.accentColor}15`
                          : 'hsl(var(--primary) / 0.1)',
                        color: item.accentColor || 'hsl(var(--primary))',
                      }}
                    >
                      <LucideIcon name={item.icon} className="h-6 w-6" />
                    </div>
                  )}

                  <h3 className={cn(
                    'font-semibold tracking-tight mb-2',
                    item.span === 'large' || item.span === 'wide'
                      ? 'text-xl md:text-2xl'
                      : 'text-lg',
                  )}>
                    {item.title}
                  </h3>

                  {item.description && (
                    <div className={cn(
                      'text-sm leading-relaxed whitespace-pre-line',
                      item.image ? 'text-white/80' : 'text-muted-foreground',
                    )}>
                      {item.description}
                    </div>
                  )}

                  {item.linkLabel && (
                    <span className={cn(
                      'mt-auto pt-4 text-sm font-medium inline-flex items-center gap-1 transition-colors',
                      item.image ? 'text-white/90 group-hover:text-white' : 'text-primary group-hover:text-primary/80',
                    )}>
                      {item.linkLabel}
                      <svg className="w-4 h-4 transition-transform group-hover:translate-x-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                      </svg>
                    </span>
                  )}
                </div>
              </Wrapper>
            );
          })}
        </div>
      </div>
    </section>
  );
}