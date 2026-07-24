import { forwardRef, HTMLAttributes, ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { getContainerClass, ContainerWidth } from '@/lib/block-container';

export type BlockBackground =
  | 'default'
  | 'muted'
  | 'subtle'
  | 'primary'
  | 'accent'
  | 'transparent';

export type BlockPadding = 'none' | 'sm' | 'md' | 'lg' | 'xl';

interface BlockSectionProps extends HTMLAttributes<HTMLElement> {
  children: ReactNode;
  /** Semantic background token. */
  background?: BlockBackground;
  /** Vertical padding scale. Default: lg. */
  padding?: BlockPadding;
  /** Container width preset. Default: content. Use 'full' to opt out. */
  width?: ContainerWidth;
  /** Full-bleed (no container wrapper). Use for hero-like blocks. */
  fullBleed?: boolean;
  /** Optional className applied to the inner container. */
  innerClassName?: string;
}

const BG_CLASSES: Record<BlockBackground, string> = {
  default: 'bg-background text-foreground',
  muted: 'bg-muted/40 text-foreground',
  subtle: 'bg-[image:var(--gradient-subtle)] text-foreground',
  primary: 'bg-primary text-primary-foreground',
  accent: 'bg-accent text-accent-foreground',
  transparent: '',
};

const PADDING_CLASSES: Record<BlockPadding, string> = {
  none: '',
  sm: 'py-8 md:py-10',
  md: 'py-12 md:py-16',
  lg: 'py-16 md:py-24 lg:py-28',
  xl: 'py-24 md:py-32 lg:py-40',
};

/**
 * Design System 2026: canonical wrapper for public blocks.
 * Owns background, vertical rhythm, and container width so individual
 * blocks stop duplicating the same `container mx-auto max-w-* px-4 py-*`
 * pattern.
 */
export const BlockSection = forwardRef<HTMLElement, BlockSectionProps>(
  (
    {
      children,
      background = 'default',
      padding = 'lg',
      width = 'content',
      fullBleed = false,
      innerClassName,
      className,
      ...rest
    },
    ref,
  ) => {
    const container = getContainerClass(width);

    return (
      <section
        ref={ref}
        className={cn(
          'w-full',
          BG_CLASSES[background],
          PADDING_CLASSES[padding],
          className,
        )}
        {...rest}
      >
        {fullBleed ? (
          children
        ) : (
          <div
            className={cn(
              'mx-auto px-4 sm:px-6 lg:px-8',
              container,
              innerClassName,
            )}
          >
            {children}
          </div>
        )}
      </section>
    );
  },
);

BlockSection.displayName = 'BlockSection';
