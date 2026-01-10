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
  Bot,
  BookOpen,
  Sparkles,
} from 'lucide-react';

interface TemplateBlockPreviewProps {
  block: ContentBlock;
  compact?: boolean;
  primaryColor?: string;
}

/**
 * Enhanced placeholder component for blocks that require database/API context
 */
function BlockPlaceholder({ 
  type, 
  icon: Icon, 
  label,
  description,
  primaryColor = '#6366f1',
  variant = 'default',
}: { 
  type: string; 
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  description?: string;
  primaryColor?: string;
  variant?: 'default' | 'chat' | 'products' | 'booking' | 'kb';
}) {
  // Different visual styles based on block type
  if (variant === 'chat') {
    return (
      <div className="bg-gradient-to-br from-muted/50 to-muted/30 rounded-2xl border border-dashed p-8 mx-4 my-4">
        <div className="flex items-start gap-4 max-w-md mx-auto">
          <div 
            className="p-3 rounded-xl shrink-0"
            style={{ backgroundColor: `${primaryColor}15` }}
          >
            <Bot className="h-6 w-6" style={{ color: primaryColor }} />
          </div>
          <div className="flex-1 space-y-3">
            <div className="space-y-2">
              <div className="h-3 bg-muted rounded-full w-3/4" />
              <div className="h-3 bg-muted rounded-full w-1/2" />
            </div>
            <div 
              className="rounded-xl p-3 text-sm text-white"
              style={{ backgroundColor: primaryColor }}
            >
              <p className="opacity-90">Hej! Hur kan jag hjälpa dig idag?</p>
            </div>
            <div className="flex gap-2">
              <div className="flex-1 h-9 bg-muted rounded-lg" />
              <div 
                className="h-9 w-9 rounded-lg shrink-0"
                style={{ backgroundColor: primaryColor }}
              />
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (variant === 'products') {
    return (
      <div className="py-12 px-4">
        <div className="text-center mb-6">
          <p className="font-semibold text-lg">{label}</p>
          <p className="text-sm text-muted-foreground">{description}</p>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4 max-w-3xl mx-auto">
          {[1, 2, 3].map((i) => (
            <div key={i} className="bg-muted/30 rounded-xl border p-4 space-y-3">
              <div className="aspect-square bg-muted rounded-lg flex items-center justify-center">
                <Package className="h-8 w-8 text-muted-foreground/50" />
              </div>
              <div className="space-y-1">
                <div className="h-3 bg-muted rounded w-3/4" />
                <div className="h-3 bg-muted rounded w-1/2" />
              </div>
              <div 
                className="h-8 rounded-md"
                style={{ backgroundColor: `${primaryColor}20` }}
              />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (variant === 'booking') {
    return (
      <div className="py-12 px-4">
        <div className="max-w-2xl mx-auto">
          <div className="text-center mb-6">
            <p className="font-semibold text-lg">{label}</p>
            <p className="text-sm text-muted-foreground">{description}</p>
          </div>
          <div className="bg-muted/30 rounded-xl border p-6 grid md:grid-cols-2 gap-6">
            {/* Calendar mockup */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="h-4 bg-muted rounded w-24" />
                <div className="flex gap-1">
                  <div className="h-6 w-6 bg-muted rounded" />
                  <div className="h-6 w-6 bg-muted rounded" />
                </div>
              </div>
              <div className="grid grid-cols-7 gap-1">
                {Array.from({ length: 35 }).map((_, i) => (
                  <div 
                    key={i} 
                    className={cn(
                      "aspect-square rounded text-[10px] flex items-center justify-center",
                      i === 15 ? "text-white" : "bg-muted/50"
                    )}
                    style={i === 15 ? { backgroundColor: primaryColor } : {}}
                  >
                    {(i % 7) + 1}
                  </div>
                ))}
              </div>
            </div>
            {/* Time slots mockup */}
            <div className="space-y-2">
              {['09:00', '10:00', '11:00', '14:00'].map((time) => (
                <div 
                  key={time}
                  className="h-10 rounded-lg border bg-background flex items-center justify-center text-sm text-muted-foreground"
                >
                  {time}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (variant === 'kb') {
    return (
      <div className="py-12 px-4">
        <div className="max-w-3xl mx-auto">
          <div className="text-center mb-8">
            <p className="font-semibold text-xl mb-2">{label}</p>
            <div className="max-w-md mx-auto">
              <div className="flex items-center gap-2 bg-muted/50 rounded-xl border px-4 py-3">
                <Search className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm text-muted-foreground">Sök i kunskapsbasen...</span>
              </div>
            </div>
          </div>
          <div className="grid md:grid-cols-3 gap-4">
            {[
              { icon: BookOpen, title: 'Kom igång' },
              { icon: Sparkles, title: 'Funktioner' },
              { icon: MessageSquare, title: 'Vanliga frågor' },
            ].map((cat, i) => (
              <div 
                key={i}
                className="bg-muted/30 rounded-xl border p-5 hover:border-primary/50 transition-colors"
              >
                <div 
                  className="p-2.5 rounded-lg w-fit mb-3"
                  style={{ backgroundColor: `${primaryColor}15`, color: primaryColor }}
                >
                  <cat.icon className="h-5 w-5" />
                </div>
                <p className="font-medium mb-1">{cat.title}</p>
                <p className="text-xs text-muted-foreground">12 artiklar</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // Default placeholder
  return (
    <div className="bg-muted/30 rounded-xl border border-dashed p-6 mx-4 my-4 text-center">
      <div className="flex flex-col items-center gap-3 max-w-xs mx-auto">
        <div 
          className="p-3 rounded-xl"
          style={{ backgroundColor: `${primaryColor}15`, color: primaryColor }}
        >
          <Icon className="h-6 w-6" />
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
export function TemplateBlockPreview({ block, compact, primaryColor = '#6366f1' }: TemplateBlockPreviewProps) {
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

      // Blocks that require database context - show enhanced placeholders
      case 'chat':
        return (
          <BlockPlaceholder 
            type="chat" 
            icon={MessageSquare} 
            label="AI Chatt"
            description="Interaktiv AI-chattwidget"
            primaryColor={primaryColor}
            variant="chat"
          />
        );
      case 'booking':
        return (
          <BlockPlaceholder 
            type="booking" 
            icon={Calendar} 
            label="Bokningssystem"
            description="Kalender & tidsbokning"
            primaryColor={primaryColor}
            variant="booking"
          />
        );
      case 'form':
        return (
          <BlockPlaceholder 
            type="form" 
            icon={FileText} 
            label="Kontaktformulär"
            description="Anpassningsbart formulär"
            primaryColor={primaryColor}
          />
        );
      case 'products':
        return (
          <BlockPlaceholder 
            type="products" 
            icon={Package} 
            label="Produktgrid"
            description="Visar produkter från databasen"
            primaryColor={primaryColor}
            variant="products"
          />
        );
      case 'cart':
        return (
          <BlockPlaceholder 
            type="cart" 
            icon={ShoppingCart} 
            label="Varukorg"
            description="E-handel varukorg"
            primaryColor={primaryColor}
          />
        );
      case 'kb-hub':
        return (
          <BlockPlaceholder 
            type="kb-hub" 
            icon={Layers} 
            label="Kunskapsbas"
            description="Kategoriöversikt för hjälpartiklar"
            primaryColor={primaryColor}
            variant="kb"
          />
        );
      case 'kb-search':
        return (
          <BlockPlaceholder 
            type="kb-search" 
            icon={Search} 
            label="KB Sök"
            description="Sök i kunskapsbasen"
            primaryColor={primaryColor}
          />
        );
      case 'kb-featured':
        return (
          <BlockPlaceholder 
            type="kb-featured" 
            icon={FileText} 
            label="Utvalda artiklar"
            description="Visar utvalda KB-artiklar"
            primaryColor={primaryColor}
          />
        );
      case 'popup':
        return (
          <BlockPlaceholder 
            type="popup" 
            icon={LayoutGrid} 
            label="Popup"
            description="Modal/popup dialog"
            primaryColor={primaryColor}
          />
        );
      case 'notification-toast':
        return (
          <BlockPlaceholder 
            type="notification-toast" 
            icon={Bell} 
            label="Notification Toast"
            description="Animerade notifikationer"
            primaryColor={primaryColor}
          />
        );
      case 'floating-cta':
        return (
          <BlockPlaceholder 
            type="floating-cta" 
            icon={MousePointer} 
            label="Floating CTA"
            description="Sticky call-to-action vid scroll"
            primaryColor={primaryColor}
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
            primaryColor={primaryColor}
          />
        );

      default:
        return (
          <BlockPlaceholder 
            type={block.type} 
            icon={LayoutGrid} 
            label={block.type.charAt(0).toUpperCase() + block.type.slice(1).replace(/-/g, ' ')}
            primaryColor={primaryColor}
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