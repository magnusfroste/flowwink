import { BlogCover, type BlogCoverVariant } from '@/components/public/BlogCover';
import { hasPostPicture, shortBrandName, type BlogCoverDial } from '@/lib/blog-cover';
import { cn } from '@/lib/utils';
import { useBrandingSettings, useSeoSettings } from '@/hooks/useSiteSettings';

/**
 * A blog post's picture — THE one place a public surface turns a post into
 * pixels. Photo mode: the featured image, as it always was. Brand mode
 * (blog.coverStyle 'brand'): the BlogCover drawn from the branding, whatever
 * featured_image holds. Renders nothing when photo mode has no image; callers
 * ask `hasPostPicture(post, style)` first to decide whether to draw the slot.
 *
 * While the blog settings load (`style: 'pending'`, from useBlogCoverStyle)
 * it draws a neutral placeholder in the cover's box (coverClassName: the same
 * size, aspect and rounding) on the muted surface — never the photo, which on
 * a brand-mode site flashed the stock picture before the cover replaced it.
 *
 * A guard (blog-cover.guardrails.test.ts) scans every public component and
 * page for an <img> fed from featured_image outside this file — so a new post
 * surface cannot quietly bring the stock photos back.
 */
export interface PostPictureProps {
  post: { title: string; slug: string; featured_image?: string | null; featured_image_alt?: string | null };
  style: BlogCoverDial;
  variant: BlogCoverVariant;
  /** The cover's eyebrow: the post's category, else the site name. */
  eyebrow?: string | null;
  /** Classes for the photo <img>. */
  imgClassName?: string;
  /** Classes for the brand cover (size, rounding). */
  coverClassName?: string;
  loading?: 'lazy' | 'eager';
}

export function PostPicture({ post, style, variant, eyebrow, imgClassName, coverClassName, loading }: PostPictureProps) {
  // The site's name, for a cover whose post has no category — the OG card's
  // short brand name (organisation, else the site title up to its separator). Both are cached
  // settings reads every public page already makes.
  const { data: seo } = useSeoSettings();
  const { data: branding } = useBrandingSettings();
  if (!hasPostPicture(post, style)) return null;
  if (style === 'pending') {
    return <div aria-hidden="true" data-post-picture-pending className={cn('bg-muted', coverClassName)} />;
  }
  if (style === 'brand') {
    const brandName = shortBrandName({ organizationName: (branding as { organizationName?: string } | undefined)?.organizationName, siteTitle: seo?.siteTitle });
    return <BlogCover title={post.title} eyebrow={eyebrow || brandName} seed={post.slug || post.title} variant={variant} className={coverClassName} />;
  }
  return (
    <img
      src={post.featured_image as string}
      alt={post.featured_image_alt || post.title}
      loading={loading}
      className={imgClassName}
    />
  );
}
