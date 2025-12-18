import { ContentBlock } from '@/types/cms';
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
}

export function BlockRenderer({ block, pageId }: BlockRendererProps) {
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
    default:
      return null;
  }
}
