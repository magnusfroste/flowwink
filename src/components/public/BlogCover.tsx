import { cn } from '@/lib/utils';
import { coverInitial, coverSeed } from '@/lib/blog-cover';
import { PixelGradient } from '@/components/public/PixelGradient';

/**
 * A blog post's cover, drawn from the brand tokens only — the picture a post
 * gets when Blog settings → Cover images is "Brand" (blog.coverStyle).
 *
 * Ground: a dark editorial surface in BOTH themes (.surface-cover — the
 * inverse band's tokens in light theme, the page's own dark ground in dark).
 * Along the bottom edge the brand's pixel gradient rises out of the ground
 * (ground → primary → the gradient highlight → primary), and under it a thin
 * primary → accent bar: the OG card's band (api/og.ts), so a shared link and
 * the page it opens look like one thing. Above it, top-left, the eyebrow
 * (category or site name, small caps in the accent) and the title in the
 * heading font. `thumb` (the 80×80 compact card) carries only the motif and
 * the title's first letter.
 *
 * Decoration, consistently: the whole cover is aria-hidden. Everywhere it is
 * used, the post's real heading (<h1>/<h2>/<h3>) sits next to it, so a screen
 * reader hears the title once. Deterministic per `seed`: the slug picks the
 * dither and the band's height — the same cover on every visit, no
 * Math.random at render.
 */
export type BlogCoverVariant = 'hero' | 'card' | 'thumb';

export interface BlogCoverProps {
  title: string;
  /** Category name or site name, above the title. */
  eyebrow?: string | null;
  /** Varies the cover per post (the slug). */
  seed: string;
  variant: BlogCoverVariant;
  /** Size and rounding come from the slot: `aspect-[2/1] rounded-[var(--radius-block,1rem)]`, `h-full w-full`, … */
  className?: string;
}

const BAND: Record<BlogCoverVariant, { base: number; spread: number; dot: 'fine' | 'medium' }> = {
  hero: { base: 34, spread: 8, dot: 'medium' },
  card: { base: 32, spread: 8, dot: 'fine' },
  thumb: { base: 50, spread: 10, dot: 'fine' },
};

export function BlogCover({ title, eyebrow, seed, variant, className }: BlogCoverProps) {
  const n = coverSeed(seed || title);
  const band = BAND[variant];
  // About a third of the cover (half a thumb), its height by the post's own seed.
  const bandHeight = band.base + (n % (band.spread + 1));
  const eyebrowText = (eyebrow || '').trim();

  return (
    <div
      aria-hidden="true"
      data-blog-cover={variant}
      className={cn(
        'surface-cover bg-background text-foreground relative isolate overflow-hidden select-none ring-1 ring-inset ring-foreground/10 [container-type:inline-size]',
        className,
      )}
    >
      <div className="absolute inset-x-0 bottom-0" style={{ height: `${bandHeight}%` }}>
        <PixelGradient
          direction="in"
          dot={band.dot}
          seed={n}
          midColor="hsl(var(--primary))"
          toColor="hsl(var(--primary))"
          className="h-full"
        />
      </div>
      <div
        data-blog-cover-bar
        className={cn(
          'absolute inset-x-0 bottom-0 bg-gradient-to-r from-[hsl(var(--primary))] to-[hsl(var(--cover-accent))]',
          variant === 'thumb' ? 'h-1' : 'h-[max(4px,0.9cqw)]',
        )}
      />

      {variant === 'thumb' ? (
        // shape-by-design: font-serif IS the heading-font dial (--font-serif, branding headingFont); this letter is a heading the a11y tree never sees
        <span className="relative z-10 block p-2 font-serif text-[2rem] leading-none [font-weight:var(--heading-weight)] [color:var(--heading-color)]">
          {coverInitial(title)}
        </span>
      ) : (
        <div
          className={cn(
            'relative z-10 flex flex-col items-start text-left',
            variant === 'hero' ? 'max-w-[82%] p-[6cqw]' : 'max-w-[94%] p-[6cqw]',
          )}
        >
          {eyebrowText && (
            <span
              data-blog-cover-eyebrow
              className={cn(
                'mb-[2.2cqw] font-semibold uppercase tracking-[0.18em] text-[hsl(var(--cover-accent))] line-clamp-1',
                variant === 'hero' ? 'text-[clamp(0.6875rem,1.6cqw,0.9375rem)]' : 'text-[clamp(0.5625rem,3cqw,0.8125rem)]',
              )}
            >
              {eyebrowText}
            </span>
          )}
          <span
            data-blog-cover-title
            className={cn(
              // shape-by-design: font-serif IS the heading-font dial (--font-serif); a decorative heading, not an h1-h6, so the base heading rule cannot reach it
              'block font-serif [font-weight:var(--heading-weight)] [letter-spacing:var(--heading-tracking)] [text-transform:var(--heading-transform)] [color:var(--heading-color)] [overflow-wrap:anywhere]',
              variant === 'hero'
                ? 'line-clamp-4 text-[clamp(1.375rem,5cqw,3.25rem)] leading-[1.08]'
                : 'line-clamp-3 text-[clamp(0.9375rem,6cqw,1.75rem)] leading-[1.12]',
            )}
          >
            {title}
          </span>
        </div>
      )}
    </div>
  );
}
