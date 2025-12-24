import { ContentBlock, BlockSpacing, SpacingSize, AnimationType } from '@/types/cms';
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
} from './blocks';
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

interface BlockRendererProps {
  block: ContentBlock;
  pageId?: string;
  index?: number;
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

export function BlockRenderer({ block, pageId, index = 0 }: BlockRendererProps) {
  const spacingClasses = getSpacingClasses(block.spacing);
  
  // Get animation settings from block or use defaults
  const animationType: AnimationType = block.animation?.type || 'fade-up';
  const animationSpeed = block.animation?.speed || 'normal';
  const animationDelay = block.animation?.delay ?? (index * 100);
  
  // Hero and separator blocks skip animation by default unless explicitly set
  const skipAnimation = (block.type === 'hero' || block.type === 'separator') && !block.animation?.type;
  
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
      default:
        return null;
    }
  };

  const content = renderBlock();
  
  // Wrap with spacing if any is applied
  const wrappedContent = spacingClasses ? (
    <div className={spacingClasses}>{content}</div>
  ) : content;

  // Skip animation for hero/separator unless explicitly configured
  if (skipAnimation || animationType === 'none') {
    return wrappedContent;
  }

  return (
    <AnimatedBlock 
      animation={animationType} 
      speed={animationSpeed}
      delay={animationDelay}
    >
      {wrappedContent}
    </AnimatedBlock>
  );
}
