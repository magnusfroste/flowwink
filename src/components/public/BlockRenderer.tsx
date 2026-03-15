import { ContentBlock, BlockSpacing, SpacingSize, AnimationType, SectionBackground, PopupBlockData, BookingBlockData, PricingBlockData, TestimonialsBlockData, TeamBlockData, LogosBlockData, ComparisonBlockData, FeaturesBlockData } from '@/types/cms';
import { AnimatedBlock } from './AnimatedBlock';
import { cn } from '@/lib/utils';
import {
  HeroBlock,
  TextBlock,
  ImageBlock,
  CTABlock,
  ContactBlock,
  LinkGridBlock,
  TwoColumnBlock,
  InfoBoxBlock,
  AccordionBlock,
  ArticleGridBlock,
  YouTubeBlock,
  QuoteBlock,
  SeparatorBlock,
  GalleryBlock,
  StatsBlock,
  ChatBlock,
  MapBlock,
  FormBlock,
  NewsletterBlock,
  PopupBlock,
  BookingBlock,
  PricingBlock,
  TestimonialsBlock,
  TeamBlock,
  LogosBlock,
  ComparisonBlock,
  FeaturesBlock,
  TimelineBlock,
  ProductsBlock,
  CartBlock,
  KbFeaturedBlock,
  KbHubBlock,
  KbSearchBlock,
  KbAccordionBlock,
  AnnouncementBarBlock,
  TabsBlock,
  MarqueeBlock,
  EmbedBlock,
  LottieBlock,
  TableBlock,
  CountdownBlock,
  ProgressBlock,
  BadgeBlock,
  SocialProofBlock,
  NotificationToastBlock,
  FloatingCTABlock,
  ChatLauncherBlock,
  WebinarBlock,
  ParallaxSectionBlock,
  BentoGridBlock,
  SectionDividerBlock,
  FeaturedCarouselBlock,
  ResumeMatcherBlock,
  FeaturedProductBlock,
  TrustBarBlock,
  CategoryNavBlock,
  ShippingInfoBlock,
  AiAssistantBlock,
  QuickLinksBlock,
} from './blocks';
import type { ChatLauncherBlockData } from './blocks/ChatLauncherBlock';
import type { KbHubBlockData } from './blocks/KbHubBlock';
import type {
  HeroBlockData,
  TextBlockData,
  ImageBlockData,
  CTABlockData,
  ContactBlockData,
  LinkGridBlockData,
  TwoColumnBlockData,
  InfoBoxBlockData,
  AccordionBlockData,
  ArticleGridBlockData,
  YouTubeBlockData,
  QuoteBlockData,
  SeparatorBlockData,
  GalleryBlockData,
  StatsBlockData,
  ChatBlockData,
  MapBlockData,
  FormBlockData,
} from '@/types/cms';
import type { ProductsBlockData } from './blocks/ProductsBlock';
import type { CartBlockData } from './blocks/CartBlock';
import type { KbFeaturedBlockData } from './blocks/KbFeaturedBlock';
import type { KbAccordionBlockData } from './blocks/KbAccordionBlock';
import type { AnnouncementBarBlockData } from './blocks/AnnouncementBarBlock';
import type { TabsBlockData } from './blocks/TabsBlock';
import type { MarqueeBlockData } from './blocks/MarqueeBlock';
import type { EmbedBlockData } from './blocks/EmbedBlock';
import type { LottieBlockData } from './blocks/LottieBlock';
import type { TableBlockData } from './blocks/TableBlock';
import type { CountdownBlockData } from './blocks/CountdownBlock';
import type { ProgressBlockData } from './blocks/ProgressBlock';
import type { BadgeBlockData } from './blocks/BadgeBlock';
import type { SocialProofBlockData } from './blocks/SocialProofBlock';
import type { NotificationToastBlockData } from './blocks/NotificationToastBlock';
import type { FloatingCTABlockData } from './blocks/FloatingCTABlock';
import type { ParallaxSectionBlockData } from './blocks/ParallaxSectionBlock';
import type { BentoGridBlockData } from './blocks/BentoGridBlock';
import type { SectionDividerBlockData } from './blocks/SectionDividerBlock';
import type { FeaturedCarouselBlockData } from './blocks/FeaturedCarouselBlock';
import type { FeaturedProductBlockData } from './blocks/FeaturedProductBlock';
import type { TrustBarBlockData } from './blocks/TrustBarBlock';
import type { CategoryNavBlockData } from './blocks/CategoryNavBlock';
import type { ShippingInfoBlockData } from './blocks/ShippingInfoBlock';
import type { AiAssistantBlockData } from './blocks/AiAssistantBlock';
import type { QuickLinksBlockData } from './blocks/QuickLinksBlock';

interface BlockRendererProps {
  block: ContentBlock;
  pageId?: string;
  index?: number;
  resolvedBackground?: SectionBackground;
}

// Utility function to convert spacing to Tailwind classes for public rendering
function getSpacingClasses(spacing?: BlockSpacing): string {
  if (!spacing) return '';
  
  const classes: string[] = [];
  
  const spacingMap: Record<SpacingSize, string> = {
    none: '0',
    xs: '2',
    sm: '4',
    md: '8',
    lg: '12',
    xl: '16',
  };
  
  if (spacing.paddingTop && spacing.paddingTop !== 'none') {
    classes.push(`pt-${spacingMap[spacing.paddingTop]}`);
  }
  if (spacing.paddingBottom && spacing.paddingBottom !== 'none') {
    classes.push(`pb-${spacingMap[spacing.paddingBottom]}`);
  }
  if (spacing.marginTop && spacing.marginTop !== 'none') {
    classes.push(`mt-${spacingMap[spacing.marginTop]}`);
  }
  if (spacing.marginBottom && spacing.marginBottom !== 'none') {
    classes.push(`mb-${spacingMap[spacing.marginBottom]}`);
  }
  
  return classes.join(' ');
}

// Full-bleed block types that should NOT get container wrapping
const FULL_BLEED_TYPES = new Set([
  'hero', 'parallax-section', 'announcement-bar', 'map', 'marquee',
  'header', 'footer', 'popup', 'notification-toast', 'floating-cta',
  'chat-launcher', 'section-divider', 'featured-carousel',
]);

// Overlay block types that use position:fixed and should not occupy any document flow
const OVERLAY_TYPES = new Set([
  'floating-cta', 'notification-toast', 'popup', 'chat-launcher',
]);

function getSectionBackgroundClasses(bg?: SectionBackground): { section: string; text: string } {
  switch (bg) {
    case 'muted':
      return { section: 'bg-muted/40', text: '' };
    case 'accent':
      return { section: 'bg-accent/10', text: '' };
    case 'dark':
      return { section: 'bg-foreground', text: 'text-background' };
    default:
      return { section: '', text: '' };
  }
}

export function BlockRenderer({ block, pageId, index = 0, resolvedBackground }: BlockRendererProps) {
  // Skip hidden blocks on public site
  if (block.hidden) return null;

  const spacingClasses = getSpacingClasses(block.spacing);
  
  // Get animation settings from block or use defaults
  const animationType: AnimationType = block.animation?.type || 'fade-up';
  const animationSpeed = block.animation?.speed || 'normal';
  const animationDelay = block.animation?.delay ?? (index * 100);
  
  // Hero and separator blocks skip animation by default unless explicitly set
  const skipAnimation = (block.type === 'hero' || block.type === 'separator' || block.type === 'parallax-section') && !block.animation?.type;
  
  const renderBlock = () => {
    switch (block.type) {
      case 'hero':
        return <HeroBlock data={block.data as unknown as HeroBlockData} />;
      case 'text':
        return <TextBlock data={block.data as unknown as TextBlockData} />;
      case 'image':
        return <ImageBlock data={block.data as unknown as ImageBlockData} />;
      case 'cta':
        return <CTABlock data={block.data as unknown as CTABlockData} />;
      case 'contact':
        return <ContactBlock data={block.data as unknown as ContactBlockData} />;
      case 'link-grid':
        return <LinkGridBlock data={block.data as unknown as LinkGridBlockData} />;
      case 'two-column':
        return <TwoColumnBlock data={block.data as unknown as TwoColumnBlockData} />;
      case 'info-box':
        return <InfoBoxBlock data={block.data as unknown as InfoBoxBlockData} />;
      case 'accordion':
        return <AccordionBlock data={block.data as unknown as AccordionBlockData} />;
      case 'article-grid':
        return <ArticleGridBlock data={block.data as unknown as ArticleGridBlockData} />;
      case 'youtube':
        return <YouTubeBlock data={block.data as unknown as YouTubeBlockData} />;
      case 'quote':
        return <QuoteBlock data={block.data as unknown as QuoteBlockData} />;
      case 'separator':
        return <SeparatorBlock data={block.data as unknown as SeparatorBlockData} />;
      case 'gallery':
        return <GalleryBlock data={block.data as unknown as GalleryBlockData} />;
      case 'stats':
        return <StatsBlock data={block.data as unknown as StatsBlockData} />;
      case 'chat':
        return <ChatBlock data={block.data as unknown as ChatBlockData} />;
      case 'map':
        return <MapBlock data={block.data as unknown as MapBlockData} />;
      case 'form':
        return <FormBlock data={block.data as unknown as FormBlockData} blockId={block.id} pageId={pageId} />;
      case 'newsletter':
        return <NewsletterBlock data={block.data as Record<string, unknown>} />;
      case 'popup':
        return <PopupBlock data={block.data as unknown as PopupBlockData} />;
      case 'booking':
        return <BookingBlock data={block.data as unknown as BookingBlockData} blockId={block.id} pageId={pageId} />;
      case 'pricing':
        return <PricingBlock data={block.data as unknown as PricingBlockData} />;
      case 'testimonials':
        return <TestimonialsBlock data={block.data as unknown as TestimonialsBlockData} />;
      case 'team':
        return <TeamBlock data={block.data as unknown as TeamBlockData} />;
      case 'logos':
        return <LogosBlock data={block.data as unknown as LogosBlockData} />;
      case 'comparison':
        return <ComparisonBlock data={block.data as unknown as ComparisonBlockData} />;
      case 'features':
        return <FeaturesBlock data={block.data as unknown as FeaturesBlockData} />;
      case 'timeline':
        return <TimelineBlock data={block.data as Record<string, unknown>} />;
      case 'products':
        return <ProductsBlock data={block.data as unknown as ProductsBlockData} />;
      case 'cart':
        return <CartBlock data={block.data as unknown as CartBlockData} />;
      case 'kb-featured':
        return <KbFeaturedBlock data={block.data as unknown as KbFeaturedBlockData} />;
      case 'kb-hub':
        return <KbHubBlock data={block.data as unknown as KbHubBlockData} />;
      case 'kb-search':
        return <KbSearchBlock data={block.data as Record<string, unknown>} />;
      case 'kb-accordion':
        return <KbAccordionBlock data={block.data as unknown as KbAccordionBlockData} />;
      case 'announcement-bar':
        return <AnnouncementBarBlock data={block.data as unknown as AnnouncementBarBlockData} />;
      case 'tabs':
        return <TabsBlock data={block.data as unknown as TabsBlockData} />;
      case 'marquee':
        return <MarqueeBlock data={block.data as unknown as MarqueeBlockData} />;
      case 'embed':
        return <EmbedBlock data={block.data as unknown as EmbedBlockData} />;
      case 'lottie':
        return <LottieBlock data={block.data as unknown as LottieBlockData} />;
      case 'table':
        return <TableBlock data={block.data as unknown as TableBlockData} />;
      case 'countdown':
        return <CountdownBlock data={block.data as unknown as CountdownBlockData} />;
      case 'progress':
        return <ProgressBlock data={block.data as unknown as ProgressBlockData} />;
      case 'badge':
        return <BadgeBlock data={block.data as unknown as BadgeBlockData} />;
      case 'social-proof':
        return <SocialProofBlock data={block.data as unknown as SocialProofBlockData} />;
      case 'notification-toast':
        return <NotificationToastBlock data={block.data as unknown as NotificationToastBlockData} />;
      case 'floating-cta':
        return <FloatingCTABlock data={block.data as unknown as FloatingCTABlockData} />;
      case 'chat-launcher':
        return <ChatLauncherBlock data={block.data as unknown as ChatLauncherBlockData} />;
      case 'webinar':
        return <WebinarBlock data={block.data as Record<string, unknown>} blockId={block.id} pageId={pageId} />;
      case 'parallax-section':
        return <ParallaxSectionBlock data={block.data as unknown as ParallaxSectionBlockData} />;
      case 'bento-grid':
        return <BentoGridBlock data={block.data as unknown as BentoGridBlockData} />;
      case 'section-divider':
        return <SectionDividerBlock data={block.data as unknown as SectionDividerBlockData} />;
      case 'featured-carousel':
        return <FeaturedCarouselBlock data={block.data as unknown as FeaturedCarouselBlockData} />;
      case 'resume-matcher':
        return <ResumeMatcherBlock data={block.data as Record<string, unknown>} />;
      case 'featured-product':
        return <FeaturedProductBlock data={block.data as unknown as FeaturedProductBlockData} />;
      case 'trust-bar':
        return <TrustBarBlock data={block.data as unknown as TrustBarBlockData} />;
      case 'category-nav':
        return <CategoryNavBlock data={block.data as unknown as CategoryNavBlockData} />;
      case 'shipping-info':
        return <ShippingInfoBlock data={block.data as unknown as ShippingInfoBlockData} />;
      case 'ai-assistant':
        return <AiAssistantBlock data={block.data as unknown as AiAssistantBlockData} />;
      case 'quick-links':
        return <QuickLinksBlock data={block.data as unknown as QuickLinksBlockData} />;
      default:
        return null;
    }
  };

  const content = renderBlock();
  const anchorId = block.anchorId || block.id;
  // Overlay blocks (fixed position) render without any wrapper to avoid taking up document flow
  if (OVERLAY_TYPES.has(block.type)) {
    return <>{content}</>;
  }

  const isFullBleed = FULL_BLEED_TYPES.has(block.type);
  
  // Determine background: explicit on block, or resolved from parent (auto-alternate)
  const effectiveBg = block.sectionBackground || resolvedBackground || 'none';
  const { section: bgClass, text: textClass } = getSectionBackgroundClasses(effectiveBg);
  const hasSectionWrapper = bgClass || !isFullBleed;

  // Build the inner content with optional container
  const innerContent = isFullBleed ? (
    <>{content}</>
  ) : (
    <div className={cn('container mx-auto max-w-6xl px-4 md:px-6', spacingClasses)}>
      {content}
    </div>
  );

  // Wrap in section with background and generous padding
  const sectionContent = hasSectionWrapper ? (
    <section
      id={anchorId}
      className={cn(
        'w-full',
        bgClass,
        textClass,
        !isFullBleed && 'py-12 md:py-16 lg:py-20',
      )}
    >
      {innerContent}
    </section>
  ) : (
    <div id={anchorId} className={spacingClasses}>
      {content}
    </div>
  );

  // Skip animation for hero/separator unless explicitly configured
  if (skipAnimation || animationType === 'none') {
    return sectionContent;
  }

  return (
    <AnimatedBlock 
      animation={animationType} 
      speed={animationSpeed}
      delay={animationDelay}
    >
      {sectionContent}
    </AnimatedBlock>
  );
}
