/**
 * Design System 2026: Block Container Width Reference
 * 
 * This module defines the standardized container widths for all public-facing blocks.
 * Consistency in container widths creates visual alignment across the page.
 * 
 * Container Width Categories:
 * 
 * WIDE (max-w-6xl / 1152px)
 * Grid-based, multi-column layouts that need horizontal space.
 * - TwoColumnBlock
 * - FeaturesBlock
 * - TeamBlock
 * - TestimonialsBlock
 * - PricingBlock
 * - StatsBlock
 * - GalleryBlock
 * - LogosBlock
 * - ComparisonBlock
 * - TabsBlock
 * - SeparatorBlock (to align with wide content)
 * 
 * CONTENT (max-w-4xl / 896px)
 * Text-focused blocks that benefit from comfortable reading width.
 * - TextBlock
 * - AccordionBlock
 * - ContactBlock
 * - YouTubeBlock
 * - InfoBoxBlock
 * - QuoteBlock
 * - TimelineBlock
 * - ArticleGridBlock
 * 
 * FOCUSED (max-w-3xl / 768px)
 * Attention-grabbing blocks with centered content.
 * - HeroBlock (text overlay)
 * - CTABlock
 * 
 * NARROW (max-w-2xl / 672px)
 * Forms and compact widgets.
 * - FormBlock
 * - NewsletterBlock
 * 
 * FULL-WIDTH (no max-width)
 * Edge-to-edge elements.
 * - HeaderBlock
 * - FooterBlock
 * - AnnouncementBarBlock
 * - MapBlock
 * - MarqueeBlock
 */

export const CONTAINER_WIDTHS = {
  wide: 'max-w-6xl',      // 1152px - Grid layouts
  content: 'max-w-4xl',   // 896px  - Text content
  focused: 'max-w-3xl',   // 768px  - CTAs, Hero
  narrow: 'max-w-2xl',    // 672px  - Forms
  full: '',               // No constraint
} as const;

export type ContainerWidth = keyof typeof CONTAINER_WIDTHS;

/**
 * Get container class for a specific width category
 */
export function getContainerClass(width: ContainerWidth = 'content'): string {
  return CONTAINER_WIDTHS[width];
}

/**
 * Block type to container width mapping
 */
export const BLOCK_CONTAINER_MAP: Record<string, ContainerWidth> = {
  // Wide blocks (grid-based)
  'two-column': 'wide',
  'features': 'wide',
  'team': 'wide',
  'testimonials': 'wide',
  'pricing': 'wide',
  'stats': 'wide',
  'gallery': 'wide',
  'logos': 'wide',
  'comparison': 'wide',
  'tabs': 'wide',
  'separator': 'wide',
  'link-grid': 'wide',
  
  // Content blocks (text-focused)
  'text': 'content',
  'accordion': 'content',
  'contact': 'content',
  'youtube': 'content',
  'info-box': 'content',
  'quote': 'content',
  'timeline': 'content',
  'article-grid': 'content',
  'embed': 'content',
  
  // Focused blocks (attention-grabbing)
  'hero': 'focused',
  'cta': 'focused',
  
  // Narrow blocks (forms)
  'form': 'narrow',
  'newsletter': 'narrow',
  'booking': 'narrow',
  
  // Full-width blocks
  'header': 'full',
  'footer': 'full',
  'announcement-bar': 'full',
  'map': 'full',
  'marquee': 'full',
  'image': 'full', // Images can be full-width
} as const;
