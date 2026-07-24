import { HTMLAttributes, ReactNode } from 'react';
import { cn } from '@/lib/utils';

interface SectionHeadingProps extends HTMLAttributes<HTMLDivElement> {
  eyebrow?: ReactNode;
  title: ReactNode;
  lead?: ReactNode;
  align?: 'left' | 'center';
  /** Visual scale for the heading. */
  size?: 'sm' | 'md' | 'lg';
  /** Wrap in an `<h1>` instead of `<h2>` (for hero-level headings). */
  as?: 'h1' | 'h2' | 'h3';
  /** Semantic accent color for the eyebrow. */
  accent?: 'primary' | 'muted';
}

const SIZE_CLASSES: Record<NonNullable<SectionHeadingProps['size']>, string> = {
  sm: 'text-2xl md:text-3xl',
  md: 'text-3xl md:text-4xl lg:text-5xl',
  lg: 'text-4xl md:text-5xl lg:text-6xl',
};

/**
 * Design System 2026: canonical section heading.
 * Replaces the ad-hoc eyebrow/h2/lead trio duplicated across
 * TextBlock, CTABlock, PricingBlock, FeaturesBlock, etc.
 */
export function SectionHeading({
  eyebrow,
  title,
  lead,
  align = 'left',
  size = 'md',
  as: Heading = 'h2',
  accent = 'primary',
  className,
  ...rest
}: SectionHeadingProps) {
  return (
    <div
      className={cn(
        'flex flex-col gap-4',
        align === 'center' && 'items-center text-center',
        className,
      )}
      {...rest}
    >
      {eyebrow ? (
        <span
          className={cn(
            'text-xs md:text-sm font-semibold uppercase tracking-[0.18em]',
            accent === 'primary' ? 'text-primary' : 'text-muted-foreground',
          )}
        >
          {eyebrow}
        </span>
      ) : null}
      <Heading
        className={cn(
          'font-bold tracking-tight text-balance',
          SIZE_CLASSES[size],
        )}
      >
        {title}
      </Heading>
      {lead ? (
        <p
          className={cn(
            'text-base md:text-lg text-muted-foreground leading-relaxed max-w-2xl text-pretty',
            align === 'center' && 'mx-auto',
          )}
        >
          {lead}
        </p>
      ) : null}
    </div>
  );
}
