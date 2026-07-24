import { HTMLAttributes, ReactNode } from 'react';
import { cn } from '@/lib/utils';

interface TextOnImageOverlayProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
  /** Overlay strength. Default `medium` (~0.42). */
  strength?: 'soft' | 'medium' | 'strong';
  /** Vertical gradient (top→bottom) instead of solid tint. */
  gradient?: boolean;
}

const STRENGTH_STYLE: Record<
  NonNullable<TextOnImageOverlayProps['strength']>,
  string
> = {
  soft: '0.25',
  medium: '0.42',
  strong: '0.6',
};

/**
 * Design System 2026: canonical dark overlay + light-text pair for
 * hero / parallax / carousel blocks. Uses the semantic `--hero-overlay`
 * token instead of raw `bg-black/*` + `text-white`.
 */
export function TextOnImageOverlay({
  children,
  strength = 'medium',
  gradient = false,
  className,
  style,
  ...rest
}: TextOnImageOverlayProps) {
  const opacity = STRENGTH_STYLE[strength];
  const overlayStyle = gradient
    ? {
        backgroundImage: `linear-gradient(180deg, hsl(var(--hero-overlay) / 0) 0%, hsl(var(--hero-overlay) / ${opacity}) 100%)`,
      }
    : {
        backgroundColor: `hsl(var(--hero-overlay) / ${opacity})`,
      };

  return (
    <div
      className={cn('absolute inset-0 pointer-events-none', className)}
      style={{ ...overlayStyle, ...style }}
      {...rest}
    >
      {children}
    </div>
  );
}
