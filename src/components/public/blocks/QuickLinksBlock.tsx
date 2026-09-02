import { cn } from '@/lib/utils';

export interface QuickLink {
  id: string;
  label: string;
  url: string;
  icon?: string;
}

export interface QuickLinksBlockData {
  heading?: string;          // "Hur kan vi hjälpa dig?"
  links: QuickLink[];
  variant?: 'dark' | 'primary' | 'muted';  // background variant
  layout?: 'centered' | 'split';  // heading left, buttons right
}

/**
 * A painted PANEL, in the design system's sense (cta-doktrinen #278): the
 * renderer owns the section shell (container, rhythm, alternating ground);
 * a block that paints its own colour must carry the system's panel radius
 * and keep its padding INSIDE. Until 2026-09-02 this block was a square,
 * edge-to-edge band with 1.25 rem of padding sitting inside the renderer's
 * container — neither full-bleed nor a panel ("quick links block verkar
 * inte följa design systemet", Magnus). Same tokens as before (dark =
 * inverted foreground/background, primary, muted); the colour lives on an
 * absolute layer like CTA with-image, so the section tag itself is the
 * literal padded+radiused shell the guard reads.
 */
export function QuickLinksBlock({ data }: { data: QuickLinksBlockData }) {
  const { heading, links = [], variant = 'dark', layout = 'split' } = data;

  if (links.length === 0) return null;

  const bgClasses = {
    dark: 'bg-foreground',
    primary: 'bg-primary',
    muted: 'bg-muted',
  };

  const textClasses = {
    dark: 'text-background',
    primary: 'text-primary-foreground',
    muted: 'text-foreground',
  };

  const buttonClasses = {
    dark: 'border-background/30 text-background hover:bg-background/10',
    primary: 'border-primary-foreground/30 text-primary-foreground hover:bg-primary-foreground/10',
    muted: 'border-foreground/20 text-foreground hover:bg-foreground/5',
  };

  return (
    <section className="relative overflow-hidden px-6 py-8 md:px-10 md:py-10 rounded-[var(--radius-block,1rem)]">
      <div aria-hidden className={cn('absolute inset-0', bgClasses[variant] ?? bgClasses.dark)} />
      <div className={cn(
        'relative',
        textClasses[variant] ?? textClasses.dark,
        layout === 'split' ? 'flex flex-col md:flex-row md:items-center md:justify-between md:gap-10' : 'text-center'
      )}>
        {heading && (
          <p className={cn(
            'font-serif font-semibold text-xl md:text-2xl shrink-0',
            layout === 'split' ? 'mb-4 md:mb-0' : 'mb-5'
          )}>
            {heading}
          </p>
        )}
        <div className={cn(
          'flex flex-wrap gap-3',
          layout === 'centered' && 'justify-center'
        )}>
          {links.map((link) => (
            <a
              key={link.id}
              href={link.url}
              className={cn(
                'px-5 py-2.5 rounded-full border text-sm font-medium transition-colors',
                buttonClasses[variant] ?? buttonClasses.dark
              )}
            >
              {link.label}
            </a>
          ))}
        </div>
      </div>
    </section>
  );
}
