import { useSearchParams } from 'react-router-dom';
import { ALL_TEMPLATES } from '@/data/templates';
import { BlockRenderer } from '@/components/public/BlockRenderer';
import { TemplateBrandingProvider } from '@/components/admin/templates/TemplateBrandingProvider';
import { ContentBlock } from '@/types/cms';
import { cn } from '@/lib/utils';

export default function TemplateLivePreviewPage() {
  const [params] = useSearchParams();
  const templateId = params.get('id');
  const pageIdx = parseInt(params.get('page') || '0', 10);

  const template = ALL_TEMPLATES.find(t => t.id === templateId);
  if (!template) {
    return <div className="flex items-center justify-center h-screen text-muted-foreground">Template not found</div>;
  }

  const page = template.pages?.[pageIdx];
  const isDark = template.branding?.defaultTheme === 'dark';

  return (
    <TemplateBrandingProvider branding={template.branding || {}}>
      <div className={cn("min-h-screen", isDark && "dark")}
        style={{
          backgroundColor: isDark ? 'hsl(222 47% 11%)' : 'hsl(0 0% 100%)',
          color: isDark ? 'hsl(0 0% 100%)' : 'hsl(222 47% 11%)',
        }}
      >
        {(() => {
          const FULL_BLEED = new Set(['hero', 'parallax-section', 'announcement-bar', 'map', 'marquee', 'header', 'footer', 'popup', 'notification-toast', 'floating-cta', 'chat-launcher', 'section-divider', 'featured-carousel']);
          const SELF_STYLED = new Set([
            'cta', 'newsletter', 'pricing', 'form', 'booking', 'smart-booking',
            'comparison', 'bento-grid', 'social-proof', 'badge', 'separator',
            'kb-search', 'kb-hub', 'kb-featured', 'kb-accordion',
            'features', 'stats', 'testimonials', 'team', 'tabs', 'accordion',
            'timeline', 'resume-matcher', 'quick-links', 'two-column', 'logos',
            'table', 'countdown', 'products', 'cart', 'webinar', 'article-grid',
          ]);
          let contentIndex = 0;
          return page?.blocks?.map((block, index) => {
            const b = block as ContentBlock;
            const isFullBleed = FULL_BLEED.has(b.type);
            const isSelfStyled = SELF_STYLED.has(b.type);
            let resolvedBg: import('@/types/cms').SectionBackground | undefined;
            if (!isFullBleed && !b.sectionBackground) {
              resolvedBg = isSelfStyled ? undefined : (contentIndex % 2 === 1 ? 'muted' : 'none');
              contentIndex++;
            } else if (!isFullBleed) {
              contentIndex++;
            }
            return <BlockRenderer key={b.id || index} block={b} index={index} resolvedBackground={resolvedBg} />;
          });
        })()}
        {(!page?.blocks || page.blocks.length === 0) && (
          <div className="flex items-center justify-center h-screen text-muted-foreground">
            No blocks on this page
          </div>
        )}
      </div>
    </TemplateBrandingProvider>
  );
}
