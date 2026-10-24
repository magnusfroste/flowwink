import type { GalleryGap } from '@/types/cms';

/** Grid gap and the masonry column gap + row spacing, per gap step. 'md' is the old fixed spacing. */
export const GALLERY_GAP: Record<GalleryGap, { gap: string; row: string }> = {
  sm: { gap: 'gap-2', row: 'mb-2' },
  md: { gap: 'gap-4', row: 'mb-4' },
  lg: { gap: 'gap-6 md:gap-8', row: 'mb-6 md:mb-8' },
};
