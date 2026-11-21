import { useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';
import { BlockSection, SectionHeading } from './_shared';
import { useUiText } from '@/lib/ui-text';

export interface StickyScrollChapter {
  id: string;
  title: string;
  body: string;
  image?: string;
  eyebrow?: string;
}

export interface StickyScrollBlockData {
  title?: string;
  subtitle?: string;
  eyebrow?: string;
  chapters?: StickyScrollChapter[];
  visualSide?: 'left' | 'right';
}

interface Props {
  data: StickyScrollBlockData;
}

export function StickyScrollBlock({ data }: Props) {
  const t = useUiText();
  const { title, subtitle, eyebrow, chapters = [], visualSide = 'right' } = data;
  const [activeIdx, setActiveIdx] = useState(0);
  const chapterRefs = useRef<Array<HTMLDivElement | null>>([]);

  useEffect(() => {
    const observers: IntersectionObserver[] = [];
    chapterRefs.current.forEach((el, idx) => {
      if (!el) return;
      const io = new IntersectionObserver(
        (entries) => {
          entries.forEach((entry) => {
            if (entry.isIntersecting) setActiveIdx(idx);
          });
        },
        { rootMargin: '-45% 0px -45% 0px', threshold: 0 }
      );
      io.observe(el);
      observers.push(io);
    });
    return () => observers.forEach((o) => o.disconnect());
  }, [chapters.length]);

  if (chapters.length === 0) {
    return (
      <BlockSection>
        <SectionHeading eyebrow={eyebrow} title={title || t('stickyScroll.title', 'Sticky-scroll story')} align="center" />
        <p className="text-center text-muted-foreground text-sm mt-4">{t('stickyScroll.empty', 'No chapters yet.')}</p>
      </BlockSection>
    );
  }

  const activeChapter = chapters[activeIdx] ?? chapters[0];
  const visualFirst = visualSide === 'left';

  return (
    <BlockSection>
      {(title || subtitle || eyebrow) && (
        <div className="mb-12">
          <SectionHeading eyebrow={eyebrow} title={title || ''} lead={subtitle} align="center" />
        </div>
      )}
      <div className={cn('grid gap-8 md:gap-16 md:grid-cols-2', visualFirst && 'md:[&>*:first-child]:order-2')}>
        {/* Chapters column */}
        <div className="space-y-24 md:space-y-40">
          {chapters.map((chapter, idx) => (
            <div
              key={chapter.id}
              ref={(el) => { chapterRefs.current[idx] = el; }}
              className={cn(
                'transition-opacity duration-500',
                idx === activeIdx ? 'opacity-100' : 'md:opacity-40'
              )}
            >
              {chapter.eyebrow && (
                <div className="text-xs font-semibold uppercase tracking-wider text-primary mb-3">
                  {chapter.eyebrow}
                </div>
              )}
              <h3 className="text-2xl md:text-3xl font-semibold mb-4 tracking-tight">
                {chapter.title}
              </h3>
              <p className="text-base md:text-lg text-muted-foreground leading-relaxed whitespace-pre-line">
                {chapter.body}
              </p>
              {/* Mobile: inline image */}
              {chapter.image && (
                <div className="mt-6 md:hidden rounded-[var(--radius-block,1rem)] overflow-hidden bg-muted aspect-video">
                  <img src={chapter.image} alt={chapter.title} className="w-full h-full object-cover" />
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Sticky visual column (desktop only) */}
        <div className="hidden md:block">
          <div className="sticky top-24 aspect-square rounded-[var(--radius-block,1.5rem)] overflow-hidden bg-muted border border-border/60">
            {activeChapter?.image ? (
              <img
                key={activeChapter.id}
                src={activeChapter.image}
                alt={activeChapter.title}
                className="w-full h-full object-cover animate-in fade-in duration-500"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-muted-foreground text-sm p-8 text-center">
                {activeChapter?.title}
              </div>
            )}
          </div>
        </div>
      </div>
    </BlockSection>
  );
}
