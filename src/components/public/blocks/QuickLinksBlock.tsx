import { cn } from '@/lib/utils';

export interface QuickLink {
  id: string;
  label: string;
  url: string;
  icon?: string;
  /** primary = a filled brand button; secondary (default) = outlined. */
  variant?: 'primary' | 'secondary';
}

export interface QuickLinksBlockData {
  heading?: string;          // "Hur kan vi hjälpa dig?"
  links: QuickLink[];
  /**
   * The panel: dark (a dark panel on BOTH themes — on a dark site the card
   * surface, not an inverted white slab), primary, muted, or ground (no
   * panel: heading and links flat on the page, a flat design's row).
   */
  variant?: 'dark' | 'primary' | 'muted' | 'ground';
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

  // "dark" used to be bg-foreground / text-background — on a DARK site that
  // is a white slab with black text, the opposite of its name (synclair's
  // three rows, 2026-10-21). Each variant now names a surface that holds on
  // both themes; "ground" paints nothing.
  const bgClasses = {
    dark: 'bg-foreground dark:bg-card dark:border dark:border-border',
    primary: 'bg-primary',
    muted: 'bg-muted',
    ground: '',
  };

  const textClasses = {
    dark: 'text-background dark:text-foreground',
    primary: 'text-primary-foreground',
    muted: 'text-foreground',
    ground: 'text-foreground',
  };

  // Outlined (secondary) links per surface; a primary link is the brand button.
  const buttonClasses = {
    dark: 'border-background/30 text-background hover:bg-background/10 dark:border-border dark:text-foreground dark:hover:bg-muted',
    primary: 'border-primary-foreground/30 text-primary-foreground hover:bg-primary-foreground/10',
    muted: 'border-foreground/20 text-foreground hover:bg-foreground/5',
    ground: 'border-foreground/25 text-foreground hover:bg-foreground/5',
  };
  const painted = variant !== 'ground';

  const inner = (
      <div className={cn(
        'relative',
        textClasses[variant] ?? textClasses.dark,
        layout === 'split' ? 'flex flex-col md:flex-row md:items-center md:justify-between md:gap-10' : 'text-center'
      )}>
        {heading && (
          // An h2, so the site's heading dials (font, case, weight, colour) apply — not a serif <p>.
          <h2 className={cn(
            'text-xl md:text-2xl font-semibold tracking-tight shrink-0',
            layout === 'split' ? 'mb-4 md:mb-0' : 'mb-5'
          )}>
            {heading}
          </h2>
        )}
        <div className={cn(
          'flex flex-wrap gap-3',
          layout === 'centered' && 'justify-center'
        )}>
          {links.map((link) => (
            <a
              key={link.id}
              href={link.url}
              data-link-variant={link.variant === 'primary' ? 'primary' : 'secondary'}
              className={cn(
                // The control radius follows the branding dial (sharp corners stay sharp), never a hard-coded pill.
                'px-5 py-2.5 rounded-[var(--radius)] border text-sm font-medium transition-colors',
                link.variant === 'primary'
                  ? 'border-transparent bg-primary text-primary-foreground hover:opacity-90'
                  : (buttonClasses[variant] ?? buttonClasses.dark)
              )}
            >
              {link.label}
            </a>
          ))}
        </div>
      </div>
  );

  // "ground" paints nothing, so it carries no padding and no radius — the
  // renderer's section shell is the only shell (renderaren äger skalet).
  if (!painted) {
    return <section className="relative" data-quick-links={variant}>{inner}</section>;
  }
  return (
    <section className="relative overflow-hidden px-6 py-8 md:px-10 md:py-10 rounded-[var(--radius-block,1rem)]" data-quick-links={variant}>
      <div aria-hidden className={cn('absolute inset-0', bgClasses[variant] ?? bgClasses.dark)} />
      {inner}
    </section>
  );
}
