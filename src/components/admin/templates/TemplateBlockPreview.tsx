/**
 * Template Block Preview - Renders actual block components for template previews
 * This is a simplified version of BlockRenderer that works without database context
 */
import { ContentBlock } from '@/types/cms';
import { cn } from '@/lib/utils';

// Import block components that can render statically (no DB dependencies)
import { HeroBlock } from '@/components/public/blocks/HeroBlock';
import { TextBlock } from '@/components/public/blocks/TextBlock';
import { ImageBlock } from '@/components/public/blocks/ImageBlock';
import { CTABlock } from '@/components/public/blocks/CTABlock';
import { FeaturesBlock } from '@/components/public/blocks/FeaturesBlock';
import { QuoteBlock } from '@/components/public/blocks/QuoteBlock';
import { SeparatorBlock } from '@/components/public/blocks/SeparatorBlock';
import { LogosBlock } from '@/components/public/blocks/LogosBlock';
import { TimelineBlock } from '@/components/public/blocks/TimelineBlock';
import { AccordionBlock } from '@/components/public/blocks/AccordionBlock';
import { GalleryBlock } from '@/components/public/blocks/GalleryBlock';
import { TwoColumnBlock } from '@/components/public/blocks/TwoColumnBlock';
import { InfoBoxBlock } from '@/components/public/blocks/InfoBoxBlock';
import { ContactBlock } from '@/components/public/blocks/ContactBlock';
import { ComparisonBlock } from '@/components/public/blocks/ComparisonBlock';
import { YouTubeBlock } from '@/components/public/blocks/YouTubeBlock';
import { ArticleGridBlock } from '@/components/public/blocks/ArticleGridBlock';
import { LinkGridBlock } from '@/components/public/blocks/LinkGridBlock';
import { MapBlock } from '@/components/public/blocks/MapBlock';
import { NewsletterBlock } from '@/components/public/blocks/NewsletterBlock';
import { TeamBlock } from '@/components/public/blocks/TeamBlock';
import { PricingBlock } from '@/components/public/blocks/PricingBlock';
import { TestimonialsBlock } from '@/components/public/blocks/TestimonialsBlock';
import { StatsBlock } from '@/components/public/blocks/StatsBlock';
// New block imports
import { AnnouncementBarBlock } from '@/components/public/blocks/AnnouncementBarBlock';
import { TabsBlock } from '@/components/public/blocks/TabsBlock';
import { MarqueeBlock } from '@/components/public/blocks/MarqueeBlock';
import { EmbedBlock } from '@/components/public/blocks/EmbedBlock';
import { TableBlock } from '@/components/public/blocks/TableBlock';
import { CountdownBlock } from '@/components/public/blocks/CountdownBlock';
import { ProgressBlock } from '@/components/public/blocks/ProgressBlock';
import { BadgeBlock } from '@/components/public/blocks/BadgeBlock';
import { SocialProofBlock } from '@/components/public/blocks/SocialProofBlock';

import type {
  HeroBlockData,
  TextBlockData,
  ImageBlockData,
  CTABlockData,
  FeaturesBlockData,
  QuoteBlockData,
  SeparatorBlockData,
  LogosBlockData,
  AccordionBlockData,
  GalleryBlockData,
  TwoColumnBlockData,
  InfoBoxBlockData,
  ContactBlockData,
  ComparisonBlockData,
  YouTubeBlockData,
  ArticleGridBlockData,
  LinkGridBlockData,
  MapBlockData,
  TeamBlockData,
  PricingBlockData,
  StatsBlockData,
  TestimonialsBlockData,
  AnnouncementBarBlockData,
  TabsBlockData,
  MarqueeBlockData,
  EmbedBlockData,
  TableBlockData,
  CountdownBlockData,
  ProgressBlockData,
  BadgeBlockData,
  SocialProofBlockData,
} from '@/types/cms';

import {
  LayoutGrid,
  MessageSquare,
  ShoppingCart,
  Calendar,
  FileText,
  Package,
  Mail,
  Search,
  Layers,
  Bell,
  MousePointer,
} from 'lucide-react';

interface TemplateBlockPreviewProps {
  block: ContentBlock;
  compact?: boolean;
}

/**
 * Placeholder component for blocks that require database/API context
 */
function BlockPlaceholder({ 
  type, 
  icon: Icon, 
  label,
  description,
}: { 
  type: string; 
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  description?: string;
}) {
  return (
    <div className="bg-muted/30 rounded-lg border border-dashed p-6 text-center">
      <div className="flex flex-col items-center gap-3">
        <div className="p-3 bg-primary/10 rounded-full">
          <Icon className="h-6 w-6 text-primary" />
        </div>
        <div>
          <p className="font-medium text-foreground">{label}</p>
          {description && (
            <p className="text-sm text-muted-foreground mt-1">{description}</p>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * Renders a block component for template preview
 * Falls back to placeholder for blocks requiring database context
 */
export function TemplateBlockPreview({ block, compact }: TemplateBlockPreviewProps) {
  // Scale down the preview when in compact mode
  const wrapperClass = cn(
    'template-block-preview',
    compact && 'scale-[0.85] origin-top'
  );

  const renderBlock = () => {
    switch (block.type) {
      // Blocks that render fully without DB context
      case 'hero':
        return <HeroBlock data={block.data as unknown as HeroBlockData} />;
      case 'text':
        return <TextBlock data={block.data as unknown as TextBlockData} />;
      case 'image':
        return <ImageBlock data={block.data as unknown as ImageBlockData} />;
      case 'cta':
        return <CTABlock data={block.data as unknown as CTABlockData} />;
      case 'features':
        return <FeaturesBlock data={block.data as unknown as FeaturesBlockData} />;
      case 'quote':
        return <QuoteBlock data={block.data as unknown as QuoteBlockData} />;
      case 'separator':
        return <SeparatorBlock data={block.data as unknown as SeparatorBlockData} />;
      case 'logos':
        return <LogosBlock data={block.data as unknown as LogosBlockData} />;
      case 'timeline':
        return <TimelineBlock data={block.data as Record<string, unknown>} />;
      case 'accordion':
        return <AccordionBlock data={block.data as unknown as AccordionBlockData} />;
      case 'gallery':
        return <GalleryBlock data={block.data as unknown as GalleryBlockData} />;
      case 'two-column':
        return <TwoColumnBlock data={block.data as unknown as TwoColumnBlockData} />;
      case 'info-box':
        return <InfoBoxBlock data={block.data as unknown as InfoBoxBlockData} />;
      case 'contact':
        return <ContactBlock data={block.data as unknown as ContactBlockData} />;
      case 'comparison':
        return <ComparisonBlock data={block.data as unknown as ComparisonBlockData} />;
      case 'youtube':
        return <YouTubeBlock data={block.data as unknown as YouTubeBlockData} />;
      case 'article-grid':
        return <ArticleGridBlock data={block.data as unknown as ArticleGridBlockData} />;
      case 'link-grid':
        return <LinkGridBlock data={block.data as unknown as LinkGridBlockData} />;
      case 'map':
        return <MapBlock data={block.data as unknown as MapBlockData} />;
      case 'newsletter':
        return <NewsletterBlock data={block.data as Record<string, unknown>} />;
      case 'team':
        return <TeamBlock data={block.data as unknown as TeamBlockData} />;
      case 'pricing':
        return <PricingBlock data={block.data as unknown as PricingBlockData} />;
      case 'testimonials':
        return <TestimonialsBlock data={block.data as unknown as TestimonialsBlockData} />;

      // New blocks that render statically
      case 'announcement-bar':
        return <AnnouncementBarBlock data={block.data as any} />;
      case 'tabs':
        return <TabsBlock data={block.data as any} />;
      case 'marquee':
        return <MarqueeBlock data={block.data as any} />;
      case 'embed':
        return <EmbedBlock data={block.data as any} />;
      case 'table':
        return <TableBlock data={block.data as any} />;
      case 'countdown':
        return <CountdownBlock data={block.data as any} />;
      case 'progress':
        return <ProgressBlock data={block.data as any} />;
      case 'badge':
        return <BadgeBlock data={block.data as any} />;
      case 'social-proof':
        return <SocialProofBlock data={block.data as any} />;

      // Blocks that require database context - show placeholders
      case 'chat':
        return (
          <BlockPlaceholder 
            type="chat" 
            icon={MessageSquare} 
            label="AI Chatt"
            description="Interaktiv AI-chattwidget"
          />
        );
      case 'booking':
        return (
          <BlockPlaceholder 
            type="booking" 
            icon={Calendar} 
            label="Bokningssystem"
            description="Kalender & tidsbokning"
          />
        );
      case 'form':
        return (
          <BlockPlaceholder 
            type="form" 
            icon={FileText} 
            label="Kontaktformulär"
            description="Anpassningsbart formulär"
          />
        );
      case 'products':
        return (
          <BlockPlaceholder 
            type="products" 
            icon={Package} 
            label="Produktgrid"
            description="Visar produkter från databasen"
          />
        );
      case 'cart':
        return (
          <BlockPlaceholder 
            type="cart" 
            icon={ShoppingCart} 
            label="Varukorg"
            description="E-handel varukorg"
          />
        );
      case 'kb-hub':
        return (
          <BlockPlaceholder 
            type="kb-hub" 
            icon={Layers} 
            label="Kunskapsbas Hub"
            description="Kategoriöversikt för hjälpartiklar"
          />
        );
      case 'kb-search':
        return (
          <BlockPlaceholder 
            type="kb-search" 
            icon={Search} 
            label="KB Sök"
            description="Sök i kunskapsbasen"
          />
        );
      case 'kb-featured':
        return (
          <BlockPlaceholder 
            type="kb-featured" 
            icon={FileText} 
            label="Utvalda artiklar"
            description="Visar utvalda KB-artiklar"
          />
        );
      case 'popup':
        return (
          <BlockPlaceholder 
            type="popup" 
            icon={LayoutGrid} 
            label="Popup"
            description="Modal/popup dialog"
          />
        );
      case 'notification-toast':
        return (
          <BlockPlaceholder 
            type="notification-toast" 
            icon={Bell} 
            label="Notification Toast"
            description="Animerade notifikationer"
          />
        );
      case 'floating-cta':
        return (
          <BlockPlaceholder 
            type="floating-cta" 
            icon={MousePointer} 
            label="Floating CTA"
            description="Sticky call-to-action vid scroll"
          />
        );
      case 'stats':
        // Stats can render statically if data is provided
        if ((block.data as any)?.stats?.length > 0) {
          return <StatsBlock data={block.data as unknown as StatsBlockData} />;
        }
        return (
          <BlockPlaceholder 
            type="stats" 
            icon={LayoutGrid} 
            label="Statistik"
            description="Siffror & nyckeltal"
          />
        );

      default:
        return (
          <BlockPlaceholder 
            type={block.type} 
            icon={LayoutGrid} 
            label={block.type.charAt(0).toUpperCase() + block.type.slice(1).replace(/-/g, ' ')}
          />
        );
    }
  };

  return (
    <div className={wrapperClass}>
      {renderBlock()}
    </div>
  );
}
