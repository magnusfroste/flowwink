import { BlockRenderer } from './BlockRenderer';
import { ContentBlock, SectionBackground } from '@/types/cms';

// Full-bleed blocks skip the container wrapper AND the auto-background
// alternation; self-styled blocks participate in the alternation count but
// paint their own surface, so no background is applied to them.
const FULL_BLEED = new Set([
  'hero', 'parallax-section', 'announcement-bar', 'map', 'marquee',
  'header', 'footer', 'popup', 'notification-toast', 'floating-cta',
  'chat-launcher', 'section-divider', 'featured-carousel',
]);
const SELF_STYLED = new Set([
  'cta', 'newsletter', 'pricing', 'form', 'booking', 'smart-booking',
  'comparison', 'bento-grid', 'social-proof', 'badge', 'separator',
  'kb-search', 'kb-hub', 'kb-featured', 'kb-accordion',
  'features', 'stats', 'testimonials', 'team', 'tabs', 'accordion',
  'timeline', 'consultant-matcher', 'quick-links', 'two-column', 'logos',
  'table', 'countdown', 'products', 'cart', 'webinar', 'article-grid',
]);

interface PageBlocksProps {
  blocks: ContentBlock[];
  pageId?: string;
}

/**
 * Renders a page's block sequence with the auto-alternating section
 * backgrounds the public site uses. Shared by PublicPage-style consumers
 * (PreviewPage, the editor's device preview) so the alternation rules live
 * in one place instead of being copy-pasted per surface.
 */
export function PageBlocks({ blocks, pageId }: PageBlocksProps) {
  let contentIndex = 0;
  return (
    <>
      {blocks.map((block, index) => {
        const isFullBleed = FULL_BLEED.has(block.type);
        const isSelfStyled = SELF_STYLED.has(block.type);
        let resolvedBg: SectionBackground | undefined;
        if (!isFullBleed && !block.sectionBackground) {
          resolvedBg = isSelfStyled ? undefined : (contentIndex % 2 === 1 ? 'muted' : 'none');
          contentIndex++;
        } else if (!isFullBleed) {
          contentIndex++;
        }
        return (
          <BlockRenderer
            key={block.id || index}
            block={block}
            pageId={pageId}
            index={index}
            resolvedBackground={resolvedBg}
          />
        );
      })}
    </>
  );
}
