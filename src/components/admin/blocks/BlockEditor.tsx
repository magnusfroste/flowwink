import { useState, useCallback } from 'react';
import { Plus } from 'lucide-react';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { ContentBlock, ContentBlockType, HeroBlockData, TextBlockData, ImageBlockData, CTABlockData, ContactBlockData, LinkGridBlockData, TwoColumnBlockData, InfoBoxBlockData, AccordionBlockData, ArticleGridBlockData, YouTubeBlockData, QuoteBlockData, SeparatorBlockData, GalleryBlockData, StatsBlockData, ChatBlockData, MapBlockData, FormBlockData, PopupBlockData, BookingBlockData, PricingBlockData, TestimonialsBlockData, TeamBlockData, LogosBlockData, ComparisonBlockData, FeaturesBlockData, BlockSpacing, BlockAnimation } from '@/types/cms';
import { BlockWrapper } from './BlockWrapper';
import { BlockSelector } from './BlockSelector';
import { useBlockClipboard } from '@/hooks/useBlockClipboard';
import { toast } from 'sonner';
import { HeroBlockEditor } from './HeroBlockEditor';
import { TextBlockEditor } from './TextBlockEditor';
import { ImageBlockEditor } from './ImageBlockEditor';
import { CTABlockEditor } from './CTABlockEditor';
import { ContactBlockEditor } from './ContactBlockEditor';
import { LinkGridBlockEditor } from './LinkGridBlockEditor';
import { TwoColumnBlockEditor } from './TwoColumnBlockEditor';
import { InfoBoxBlockEditor } from './InfoBoxBlockEditor';
import { AccordionBlockEditor } from './AccordionBlockEditor';
import { ArticleGridBlockEditor } from './ArticleGridBlockEditor';
import { YouTubeBlockEditor } from './YouTubeBlockEditor';
import { QuoteBlockEditor } from './QuoteBlockEditor';
import { SeparatorBlockEditor } from './SeparatorBlockEditor';
import { GalleryBlockEditor } from './GalleryBlockEditor';
import { StatsBlockEditor } from './StatsBlockEditor';
import { ChatBlockEditor } from './ChatBlockEditor';
import { MapBlockEditor } from './MapBlockEditor';
import { FormBlockEditor } from './FormBlockEditor';
import { NewsletterBlockEditor } from './NewsletterBlockEditor';
import { PopupBlockEditor } from './PopupBlockEditor';
import { BookingBlockEditor } from './BookingBlockEditor';
import { PricingBlockEditor } from './PricingBlockEditor';
import { TestimonialsBlockEditor } from './TestimonialsBlockEditor';
import { TeamBlockEditor } from './TeamBlockEditor';
import { LogosBlockEditor } from './LogosBlockEditor';
import { ComparisonBlockEditor } from './ComparisonBlockEditor';
import { FeaturesBlockEditor } from './FeaturesBlockEditor';
import { TimelineBlockEditor } from './TimelineBlockEditor';
import { ProductsBlockEditor } from './ProductsBlockEditor';
import { CartBlockEditor } from './CartBlockEditor';
import { KbFeaturedBlockEditor } from './KbFeaturedBlockEditor';
import { KbHubBlockEditor } from './KbHubBlockEditor';
import { KbSearchBlockEditor } from './KbSearchBlockEditor';
import { KbAccordionBlockEditor } from './KbAccordionBlockEditor';
import { AnnouncementBarBlockEditor } from './AnnouncementBarBlockEditor';
import { TabsBlockEditor } from './TabsBlockEditor';
import { MarqueeBlockEditor } from './MarqueeBlockEditor';
import { EmbedBlockEditor } from './EmbedBlockEditor';
import { LottieBlockEditor } from './LottieBlockEditor';
import { TableBlockEditor } from './TableBlockEditor';
import { CountdownBlockEditor } from './CountdownBlockEditor';
import { ProgressBlockEditor } from './ProgressBlockEditor';
import { BadgeBlockEditor } from './BadgeBlockEditor';
import { SocialProofBlockEditor } from './SocialProofBlockEditor';
import { NotificationToastBlockEditor } from './NotificationToastBlockEditor';
import { FloatingCTABlockEditor } from './FloatingCTABlockEditor';
import { ChatLauncherBlockEditor } from './ChatLauncherBlockEditor';
import type { ProductsBlockData } from '@/components/public/blocks/ProductsBlock';
import type { CartBlockData } from '@/components/public/blocks/CartBlock';
import type { KbFeaturedBlockData } from '@/components/public/blocks/KbFeaturedBlock';
import type { KbHubBlockData } from '@/components/public/blocks/KbHubBlock';
import type { KbAccordionBlockData } from '@/components/public/blocks/KbAccordionBlock';
import type { AnnouncementBarBlockData } from '@/components/public/blocks/AnnouncementBarBlock';
import type { TabsBlockData } from '@/components/public/blocks/TabsBlock';
import type { MarqueeBlockData } from '@/components/public/blocks/MarqueeBlock';
import type { EmbedBlockData } from '@/components/public/blocks/EmbedBlock';
import type { LottieBlockData } from '@/components/public/blocks/LottieBlock';
import type { TableBlockData } from '@/components/public/blocks/TableBlock';
import type { CountdownBlockData } from '@/components/public/blocks/CountdownBlock';
import type { ProgressBlockData } from '@/components/public/blocks/ProgressBlock';
import type { BadgeBlockData } from '@/components/public/blocks/BadgeBlock';
import type { SocialProofBlockData } from '@/components/public/blocks/SocialProofBlock';
import type { NotificationToastBlockData } from '@/components/public/blocks/NotificationToastBlock';
import type { FloatingCTABlockData } from '@/components/public/blocks/FloatingCTABlock';
import type { ChatLauncherBlockData } from '@/components/public/blocks/ChatLauncherBlock';

interface NewsletterBlockData {
  title?: string;
  description?: string;
  buttonText?: string;
  successMessage?: string;
  variant?: 'default' | 'card' | 'minimal';
  showNameField?: boolean;
}

type BlockDataMap = {
  hero: HeroBlockData;
  text: TextBlockData;
  image: ImageBlockData;
  cta: CTABlockData;
  contact: ContactBlockData;
  'link-grid': LinkGridBlockData;
  'two-column': TwoColumnBlockData;
  'info-box': InfoBoxBlockData;
  accordion: AccordionBlockData;
  'article-grid': ArticleGridBlockData;
  youtube: YouTubeBlockData;
  quote: QuoteBlockData;
  separator: SeparatorBlockData;
  gallery: GalleryBlockData;
  stats: StatsBlockData;
  chat: ChatBlockData;
  map: MapBlockData;
  form: FormBlockData;
  newsletter: NewsletterBlockData;
  popup: PopupBlockData;
  booking: BookingBlockData;
  pricing: PricingBlockData;
  testimonials: TestimonialsBlockData;
  team: TeamBlockData;
  logos: LogosBlockData;
  comparison: ComparisonBlockData;
  features: FeaturesBlockData;
  timeline: Record<string, unknown>;
  products: ProductsBlockData;
  cart: CartBlockData;
  'kb-featured': KbFeaturedBlockData;
  'kb-hub': KbHubBlockData;
  'kb-search': Record<string, unknown>;
  'kb-accordion': KbAccordionBlockData;
  'announcement-bar': AnnouncementBarBlockData;
  tabs: TabsBlockData;
  marquee: MarqueeBlockData;
  embed: EmbedBlockData;
  lottie: LottieBlockData;
  table: TableBlockData;
  countdown: CountdownBlockData;
  progress: ProgressBlockData;
  badge: BadgeBlockData;
  'social-proof': SocialProofBlockData;
  'notification-toast': NotificationToastBlockData;
  'floating-cta': FloatingCTABlockData;
  'chat-launcher': ChatLauncherBlockData;
};

const DEFAULT_BLOCK_DATA: BlockDataMap = {
  hero: { title: 'New Hero', subtitle: '', backgroundType: 'image', heightMode: 'auto', contentAlignment: 'center', overlayOpacity: 60, parallaxEffect: false, titleAnimation: 'none', showScrollIndicator: false, videoAutoplay: true, videoLoop: true, videoMuted: true },
  text: { content: '<p>Write your content here...</p>' },
  image: { src: '', alt: '' },
  cta: { title: 'Ready to take the next step?', buttonText: 'Contact us', buttonUrl: '/contact', gradient: true },
  contact: { title: 'Contact us' },
  'link-grid': { links: [], columns: 3 },
  'two-column': { content: '<p>Write your content here...</p>', imageSrc: '', imageAlt: '', imagePosition: 'right' },
  'info-box': { title: 'Important information', content: '', variant: 'info' },
  accordion: { items: [] },
  'article-grid': { articles: [], columns: 3 },
  youtube: { url: '' },
  quote: { text: '', variant: 'simple' },
  separator: { style: 'line', spacing: 'md' },
  gallery: { images: [], layout: 'grid', columns: 3 },
  stats: { stats: [] },
  chat: { height: 'md', showSidebar: false, variant: 'card' },
  map: { address: '', zoom: 15, mapType: 'roadmap', height: 'md', showBorder: true, rounded: true, loadOnConsent: false },
  form: { 
    title: 'Contact Us', 
    description: 'Fill out the form below and we\'ll get back to you.',
    fields: [
      { id: 'field-name', type: 'text', label: 'Name', placeholder: 'Your name', required: true, width: 'half' },
      { id: 'field-email', type: 'email', label: 'Email', placeholder: 'email@example.com', required: true, width: 'half' },
      { id: 'field-message', type: 'textarea', label: 'Message', placeholder: 'How can we help you?', required: true, width: 'full' },
    ],
    submitButtonText: 'Send Message',
    successMessage: 'Thank you! We\'ll be in touch soon.',
    variant: 'default',
  },
  newsletter: {
    title: 'Subscribe to our newsletter',
    description: 'Get the latest updates delivered to your inbox.',
    buttonText: 'Subscribe',
    successMessage: 'Thanks for subscribing! Please check your email to confirm.',
    variant: 'default',
    showNameField: false,
  },
  popup: {
    title: 'Special Offer!',
    content: 'Sign up today and get 20% off your first order.',
    trigger: 'time',
    delaySeconds: 5,
    scrollPercentage: 50,
    showOnce: true,
    cookieDays: 7,
    size: 'md',
    position: 'center',
    overlayDark: true,
  },
  booking: {
    title: 'Book an Appointment',
    description: 'Schedule a time that works for you.',
    mode: 'embed',
    provider: 'calendly',
    embedUrl: '',
    height: 'md',
    submitButtonText: 'Request Appointment',
    successMessage: "Thank you! We'll contact you to confirm your appointment.",
    showPhoneField: true,
    showDatePicker: true,
    variant: 'card',
  },
  pricing: {
    title: 'Choose Your Plan',
    subtitle: 'Select the perfect plan for your needs',
    tiers: [],
    columns: 3,
    variant: 'cards',
  },
  testimonials: {
    title: 'What Our Customers Say',
    subtitle: 'Real feedback from real customers',
    testimonials: [],
    layout: 'grid',
    columns: 3,
    showRating: true,
    showAvatar: true,
    variant: 'cards',
    autoplay: true,
    autoplaySpeed: 5,
  },
  team: {
    title: 'Meet Our Team',
    subtitle: 'The people behind our success',
    members: [],
    columns: 3,
    layout: 'grid',
    variant: 'cards',
    showBio: true,
    showSocial: true,
  },
  logos: {
    title: 'Trusted By',
    subtitle: '',
    logos: [],
    columns: 5,
    layout: 'grid',
    variant: 'grayscale',
    logoSize: 'md',
    autoplay: true,
    autoplaySpeed: 3,
  },
  comparison: {
    title: 'Compare Plans',
    subtitle: 'Find the perfect plan for your needs',
    products: [],
    features: [],
    variant: 'default',
    showPrices: true,
    showButtons: true,
    stickyHeader: false,
  },
  features: {
    title: 'Our Services',
    subtitle: 'What we offer',
    features: [],
    columns: 3,
    layout: 'grid',
    variant: 'cards',
    iconStyle: 'circle',
    showLinks: true,
  },
  timeline: {
    title: 'Our Process',
    subtitle: 'How we work',
    steps: [],
    variant: 'vertical',
    showDates: false,
  },
  products: {
    title: 'Our Products',
    subtitle: '',
    columns: 3,
    productType: 'all',
    showDescription: true,
    buttonText: 'Add to cart',
  },
  cart: {
    title: 'Your Cart',
    emptyMessage: 'Your cart is empty',
    checkoutButtonText: 'Go to checkout',
    checkoutUrl: '/checkout',
    showContinueShopping: true,
    continueShoppingUrl: '/',
    variant: 'default',
  },
  'kb-featured': {
    title: 'Vanliga frågor',
    subtitle: '',
    maxItems: 6,
    showCategory: true,
    layout: 'grid',
    columns: 3,
  },
  'kb-hub': {
    title: 'Hur kan vi hjälpa dig?',
    subtitle: 'Sök i vår kunskapsbas eller bläddra efter kategori',
    showSearch: true,
    showCategories: true,
    showContactCta: true,
    layout: 'accordion',
  },
  'kb-search': {
    title: 'Sök i kunskapsbasen',
    placeholder: 'Sök efter svar...',
    variant: 'default',
    showButton: true,
    buttonText: 'Sök',
  },
  'kb-accordion': {
    title: 'Vanliga frågor',
    subtitle: '',
    maxItems: 10,
    showCategory: false,
    allowMultiple: false,
    defaultOpen: 'none',
    variant: 'default',
  },
  'announcement-bar': {
    message: 'Välkommen! Använd kod NYHET för 10% rabatt.',
    variant: 'solid',
    dismissable: true,
    sticky: true,
  },
  tabs: {
    tabs: [
      { id: 'tab-1', title: 'Flik 1', content: '<p>Innehåll för flik 1</p>' },
      { id: 'tab-2', title: 'Flik 2', content: '<p>Innehåll för flik 2</p>' },
    ],
    variant: 'underline',
    orientation: 'horizontal',
  },
  marquee: {
    items: [
      { id: 'item-1', text: 'Nyhet: Ny kollektion lanserad!' },
      { id: 'item-2', text: 'Fri frakt på ordrar över 500 kr' },
    ],
    speed: 'normal',
    pauseOnHover: true,
    direction: 'left',
    variant: 'default',
  },
  embed: {
    url: '',
    aspectRatio: 'auto',
    maxWidth: 'lg',
    variant: 'default',
  },
  lottie: {
    src: '',
    autoplay: true,
    loop: true,
    speed: 1,
    direction: 'forward',
    playOn: 'load',
    size: 'md',
    aspectRatio: 'auto',
    alignment: 'center',
    variant: 'default',
  },
  table: {
    columns: [],
    rows: [],
    variant: 'default',
    size: 'md',
    highlightOnHover: true,
  },
  countdown: {
    targetDate: '',
    variant: 'default',
    size: 'md',
    showDays: true,
    showHours: true,
    showMinutes: true,
    showSeconds: true,
  },
  progress: {
    title: 'Our Skills',
    subtitle: '',
    items: [],
    variant: 'default',
    size: 'md',
    showPercentage: true,
    showLabels: true,
    animated: true,
    animationDuration: 1500,
  },
  badge: {
    title: 'Trusted By',
    subtitle: '',
    badges: [],
    variant: 'default',
    columns: 4,
    size: 'md',
    showTitles: true,
    grayscale: false,
  },
  'social-proof': {
    title: 'Trusted by thousands',
    subtitle: '',
    items: [],
    variant: 'default',
    layout: 'horizontal',
    columns: 4,
    size: 'md',
    animated: true,
    showIcons: true,
    showLiveIndicator: false,
  },
  'notification-toast': {
    notifications: [],
    variant: 'default',
    position: 'bottom-left',
    displayDuration: 5,
    delayBetween: 8,
    initialDelay: 3,
    showCloseButton: true,
    showImage: true,
    showTimestamp: true,
    loop: true,
    maxWidth: 'sm',
    animationType: 'slide',
  },
  'floating-cta': {
    title: 'Redo att komma igång?',
    subtitle: 'Boka en tid eller kontakta oss idag',
    buttonText: 'Boka nu',
    buttonUrl: '/contact',
    showAfterScroll: 25,
    hideOnScrollUp: false,
    position: 'bottom',
    variant: 'bar',
    size: 'md',
    showCloseButton: true,
    closePersistent: false,
    showScrollTop: false,
    animationType: 'slide',
  },
  'chat-launcher': {
    title: 'What can I help you with?',
    placeholder: 'Message AI Assistant...',
    showQuickActions: true,
    quickActionCount: 4,
    variant: 'card',
  },
};

interface BlockEditorProps {
  blocks: ContentBlock[];
  onChange: (blocks: ContentBlock[]) => void;
  canEdit: boolean;
}

export function BlockEditor({ blocks, onChange, canEdit }: BlockEditorProps) {
  const [editingBlockId, setEditingBlockId] = useState<string | null>(null);
  const { copyBlock, pasteBlock, hasBlock: hasClipboardBlock } = useBlockClipboard();

  const handleCopyBlock = useCallback((block: ContentBlock) => {
    copyBlock(block);
    toast.success('Block copied! Paste it on any page.');
  }, [copyBlock]);

  const handlePasteBlock = useCallback(() => {
    const block = pasteBlock();
    if (block) {
      onChange([...blocks, block]);
      setEditingBlockId(block.id);
      toast.success('Block pasted!');
    }
  }, [pasteBlock, blocks, onChange]);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;

    if (over && active.id !== over.id) {
      const oldIndex = blocks.findIndex((block) => block.id === active.id);
      const newIndex = blocks.findIndex((block) => block.id === over.id);
      onChange(arrayMove(blocks, oldIndex, newIndex));
    }
  };

  const handleAddBlock = (type: ContentBlockType) => {
    const newBlock: ContentBlock = {
      id: `block-${Date.now()}`,
      type,
      data: { ...DEFAULT_BLOCK_DATA[type] } as Record<string, unknown>,
    };
    onChange([...blocks, newBlock]);
    setEditingBlockId(newBlock.id);
  };

  const handleUpdateBlock = useCallback(
    (blockId: string, data: Record<string, unknown>) => {
      onChange(
        blocks.map((block) =>
          block.id === blockId ? { ...block, data } : block
        )
      );
    },
    [blocks, onChange]
  );

  const handleUpdateBlockSpacing = useCallback(
    (blockId: string, spacing: BlockSpacing) => {
      onChange(
        blocks.map((block) =>
          block.id === blockId ? { ...block, spacing } : block
        )
      );
    },
    [blocks, onChange]
  );

  const handleUpdateBlockAnimation = useCallback(
    (blockId: string, animation: BlockAnimation) => {
      onChange(
        blocks.map((block) =>
          block.id === blockId ? { ...block, animation } : block
        )
      );
    },
    [blocks, onChange]
  );

  const handleUpdateBlockAnchor = useCallback(
    (blockId: string, anchorId: string | undefined) => {
      onChange(
        blocks.map((block) =>
          block.id === blockId ? { ...block, anchorId } : block
        )
      );
    },
    [blocks, onChange]
  );

  const handleDeleteBlock = (blockId: string) => {
    onChange(blocks.filter((block) => block.id !== blockId));
    if (editingBlockId === blockId) {
      setEditingBlockId(null);
    }
  };

  const renderBlockContent = (block: ContentBlock, isEditing: boolean) => {
    switch (block.type) {
      case 'hero':
        return (
          <HeroBlockEditor
            data={block.data as unknown as HeroBlockData}
            onChange={(data) => handleUpdateBlock(block.id, data as unknown as Record<string, unknown>)}
            isEditing={isEditing}
          />
        );
      case 'text':
        return (
          <TextBlockEditor
            data={block.data as unknown as TextBlockData}
            onChange={(data) => handleUpdateBlock(block.id, data as unknown as Record<string, unknown>)}
            isEditing={isEditing}
          />
        );
      case 'image':
        return (
          <ImageBlockEditor
            data={block.data as unknown as ImageBlockData}
            onChange={(data) => handleUpdateBlock(block.id, data as unknown as Record<string, unknown>)}
            isEditing={isEditing}
          />
        );
      case 'cta':
        return (
          <CTABlockEditor
            data={block.data as unknown as CTABlockData}
            onChange={(data) => handleUpdateBlock(block.id, data as unknown as Record<string, unknown>)}
            isEditing={isEditing}
          />
        );
      case 'contact':
        return (
          <ContactBlockEditor
            data={block.data as unknown as ContactBlockData}
            onChange={(data) => handleUpdateBlock(block.id, data as unknown as Record<string, unknown>)}
            isEditing={isEditing}
          />
        );
      case 'link-grid':
        return (
          <LinkGridBlockEditor
            data={block.data as unknown as LinkGridBlockData}
            onChange={(data) => handleUpdateBlock(block.id, data as unknown as Record<string, unknown>)}
            isEditing={isEditing}
          />
        );
      case 'two-column':
        return (
          <TwoColumnBlockEditor
            data={block.data as unknown as TwoColumnBlockData}
            onChange={(data) => handleUpdateBlock(block.id, data as unknown as Record<string, unknown>)}
            isEditing={isEditing}
          />
        );
      case 'info-box':
        return (
          <InfoBoxBlockEditor
            data={block.data as unknown as InfoBoxBlockData}
            onChange={(data) => handleUpdateBlock(block.id, data as unknown as Record<string, unknown>)}
            isEditing={isEditing}
          />
        );
      case 'accordion':
        return (
          <AccordionBlockEditor
            data={block.data as unknown as AccordionBlockData}
            onChange={(data) => handleUpdateBlock(block.id, data as unknown as Record<string, unknown>)}
            canEdit={isEditing}
          />
        );
      case 'article-grid':
        return (
          <ArticleGridBlockEditor
            data={block.data as unknown as ArticleGridBlockData}
            onChange={(data) => handleUpdateBlock(block.id, data as unknown as Record<string, unknown>)}
            canEdit={isEditing}
          />
        );
      case 'youtube':
        return (
          <YouTubeBlockEditor
            data={block.data as unknown as YouTubeBlockData}
            onChange={(data) => handleUpdateBlock(block.id, data as unknown as Record<string, unknown>)}
            isEditing={isEditing}
          />
        );
      case 'quote':
        return (
          <QuoteBlockEditor
            data={block.data as unknown as QuoteBlockData}
            onChange={(data) => handleUpdateBlock(block.id, data as unknown as Record<string, unknown>)}
            isEditing={isEditing}
          />
        );
      case 'separator':
        return (
          <SeparatorBlockEditor
            data={block.data as unknown as SeparatorBlockData}
            onChange={(data) => handleUpdateBlock(block.id, data as unknown as Record<string, unknown>)}
            isEditing={isEditing}
          />
        );
      case 'gallery':
        return (
          <GalleryBlockEditor
            data={block.data as unknown as GalleryBlockData}
            onChange={(data) => handleUpdateBlock(block.id, data as unknown as Record<string, unknown>)}
            canEdit={isEditing}
          />
        );
      case 'stats':
        return (
          <StatsBlockEditor
            data={block.data as unknown as StatsBlockData}
            onChange={(data) => handleUpdateBlock(block.id, data as unknown as Record<string, unknown>)}
            canEdit={isEditing}
          />
        );
      case 'chat':
        return (
          <ChatBlockEditor
            data={block.data as unknown as ChatBlockData}
            onChange={(data) => handleUpdateBlock(block.id, data as unknown as Record<string, unknown>)}
            isEditing={isEditing}
          />
        );
      case 'map':
        return (
          <MapBlockEditor
            data={block.data as unknown as MapBlockData}
            onChange={(data) => handleUpdateBlock(block.id, data as unknown as Record<string, unknown>)}
            isEditing={isEditing}
          />
        );
      case 'form':
        return (
          <FormBlockEditor
            data={block.data as unknown as FormBlockData}
            onChange={(data) => handleUpdateBlock(block.id, data as unknown as Record<string, unknown>)}
            isEditing={isEditing}
          />
        );
      case 'newsletter':
        return (
          <NewsletterBlockEditor
            data={block.data as unknown as NewsletterBlockData}
            onChange={(data) => handleUpdateBlock(block.id, data as unknown as Record<string, unknown>)}
            isEditing={isEditing}
          />
        );
      case 'popup':
        return (
          <PopupBlockEditor
            data={block.data as unknown as PopupBlockData}
            onChange={(data) => handleUpdateBlock(block.id, data as unknown as Record<string, unknown>)}
            isEditing={isEditing}
          />
        );
      case 'booking':
        return (
          <BookingBlockEditor
            data={block.data as unknown as BookingBlockData}
            onChange={(data) => handleUpdateBlock(block.id, data as unknown as Record<string, unknown>)}
            isEditing={isEditing}
          />
        );
      case 'pricing':
        return (
          <PricingBlockEditor
            data={block.data as unknown as PricingBlockData}
            onChange={(data) => handleUpdateBlock(block.id, data as unknown as Record<string, unknown>)}
            isEditing={isEditing}
          />
        );
      case 'testimonials':
        return (
          <TestimonialsBlockEditor
            data={block.data as unknown as TestimonialsBlockData}
            onChange={(data) => handleUpdateBlock(block.id, data as unknown as Record<string, unknown>)}
            isEditing={isEditing}
          />
        );
      case 'team':
        return (
          <TeamBlockEditor
            data={block.data as unknown as TeamBlockData}
            onChange={(data) => handleUpdateBlock(block.id, data as unknown as Record<string, unknown>)}
            isEditing={isEditing}
          />
        );
      case 'logos':
        return (
          <LogosBlockEditor
            data={block.data as unknown as LogosBlockData}
            onChange={(data) => handleUpdateBlock(block.id, data as unknown as Record<string, unknown>)}
            isEditing={isEditing}
          />
        );
      case 'comparison':
        return (
          <ComparisonBlockEditor
            data={block.data as unknown as ComparisonBlockData}
            onChange={(data) => handleUpdateBlock(block.id, data as unknown as Record<string, unknown>)}
            isEditing={isEditing}
          />
        );
      case 'features':
        return (
          <FeaturesBlockEditor
            data={block.data as unknown as FeaturesBlockData}
            onChange={(data) => handleUpdateBlock(block.id, data as unknown as Record<string, unknown>)}
            isEditing={isEditing}
          />
        );
      case 'timeline':
        return (
          <TimelineBlockEditor
            data={block.data as Record<string, unknown>}
            onChange={(data) => handleUpdateBlock(block.id, data as unknown as Record<string, unknown>)}
            isEditing={isEditing}
          />
        );
      case 'products':
        return (
          <ProductsBlockEditor
            data={block.data as unknown as ProductsBlockData}
            onChange={(data) => handleUpdateBlock(block.id, data as unknown as Record<string, unknown>)}
            isEditing={isEditing}
          />
        );
      case 'cart':
        return (
          <CartBlockEditor
            data={block.data as unknown as CartBlockData}
            onChange={(data) => handleUpdateBlock(block.id, data as unknown as Record<string, unknown>)}
            isEditing={isEditing}
          />
        );
      case 'kb-featured':
        return (
          <KbFeaturedBlockEditor
            data={block.data as unknown as KbFeaturedBlockData}
            onChange={(data) => handleUpdateBlock(block.id, data as unknown as Record<string, unknown>)}
            isEditing={isEditing}
          />
        );
      case 'kb-hub':
        return (
          <KbHubBlockEditor
            data={block.data as unknown as KbHubBlockData}
            onChange={(data) => handleUpdateBlock(block.id, data as unknown as Record<string, unknown>)}
            isEditing={isEditing}
          />
        );
      case 'kb-search':
        return (
          <KbSearchBlockEditor
            data={block.data as Record<string, unknown>}
            onChange={(data) => handleUpdateBlock(block.id, data as unknown as Record<string, unknown>)}
            isEditing={isEditing}
          />
        );
      case 'kb-accordion':
        return (
          <KbAccordionBlockEditor
            data={block.data as unknown as KbAccordionBlockData}
            onChange={(data) => handleUpdateBlock(block.id, data as unknown as Record<string, unknown>)}
            isEditing={isEditing}
          />
        );
      case 'announcement-bar':
        return (
          <AnnouncementBarBlockEditor
            data={block.data as unknown as AnnouncementBarBlockData}
            onChange={(data) => handleUpdateBlock(block.id, data as unknown as Record<string, unknown>)}
            isEditing={isEditing}
          />
        );
      case 'tabs':
        return (
          <TabsBlockEditor
            data={block.data as unknown as TabsBlockData}
            onChange={(data) => handleUpdateBlock(block.id, data as unknown as Record<string, unknown>)}
            isEditing={isEditing}
          />
        );
      case 'marquee':
        return (
          <MarqueeBlockEditor
            data={block.data as unknown as MarqueeBlockData}
            onChange={(data) => handleUpdateBlock(block.id, data as unknown as Record<string, unknown>)}
            isEditing={isEditing}
          />
        );
      case 'embed':
        return (
          <EmbedBlockEditor
            data={block.data as unknown as EmbedBlockData}
            onChange={(data) => handleUpdateBlock(block.id, data as unknown as Record<string, unknown>)}
            isEditing={isEditing}
          />
        );
      case 'lottie':
        return (
          <LottieBlockEditor
            data={block.data as unknown as LottieBlockData}
            onChange={(data) => handleUpdateBlock(block.id, data as unknown as Record<string, unknown>)}
            isEditing={isEditing}
          />
        );
      case 'table':
        return (
          <TableBlockEditor
            data={block.data as unknown as TableBlockData}
            onChange={(data) => handleUpdateBlock(block.id, data as unknown as Record<string, unknown>)}
            isEditing={isEditing}
          />
        );
      case 'countdown':
        return (
          <CountdownBlockEditor
            data={block.data as unknown as CountdownBlockData}
            onChange={(data) => handleUpdateBlock(block.id, data as unknown as Record<string, unknown>)}
            isEditing={isEditing}
          />
        );
      case 'progress':
        return (
          <ProgressBlockEditor
            data={block.data as unknown as ProgressBlockData}
            onChange={(data) => handleUpdateBlock(block.id, data as unknown as Record<string, unknown>)}
            isEditing={isEditing}
          />
        );
      case 'badge':
        return (
          <BadgeBlockEditor
            data={block.data as unknown as BadgeBlockData}
            onChange={(data) => handleUpdateBlock(block.id, data as unknown as Record<string, unknown>)}
            isEditing={isEditing}
          />
        );
      case 'social-proof':
        return (
          <SocialProofBlockEditor
            data={block.data as unknown as SocialProofBlockData}
            onChange={(data) => handleUpdateBlock(block.id, data as unknown as Record<string, unknown>)}
            isEditing={isEditing}
          />
        );
      case 'notification-toast':
        return (
          <NotificationToastBlockEditor
            data={block.data as unknown as NotificationToastBlockData}
            onChange={(data) => handleUpdateBlock(block.id, data as unknown as Record<string, unknown>)}
            isEditing={isEditing}
          />
        );
      case 'floating-cta':
        return (
          <FloatingCTABlockEditor
            data={block.data as unknown as FloatingCTABlockData}
            onChange={(data) => handleUpdateBlock(block.id, data as unknown as Record<string, unknown>)}
            isEditing={isEditing}
          />
        );
      case 'chat-launcher':
        return (
          <ChatLauncherBlockEditor
            data={block.data as unknown as ChatLauncherBlockData}
            onChange={(data) => handleUpdateBlock(block.id, data as unknown as Record<string, unknown>)}
          />
        );
      default:
        return <div className="p-4 text-muted-foreground">Unknown block type</div>;
    }
  };

  return (
    <div className="space-y-4">
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={handleDragEnd}
      >
        <SortableContext
          items={blocks.map((b) => b.id)}
          strategy={verticalListSortingStrategy}
        >
          {blocks.map((block) => (
            <BlockWrapper
              key={block.id}
              block={block}
              isEditing={editingBlockId === block.id}
              onEdit={() =>
                setEditingBlockId(editingBlockId === block.id ? null : block.id)
              }
              onDelete={() => handleDeleteBlock(block.id)}
              onCopy={() => handleCopyBlock(block)}
              onSpacingChange={(spacing) => handleUpdateBlockSpacing(block.id, spacing)}
              onAnimationChange={(animation) => handleUpdateBlockAnimation(block.id, animation)}
              onAnchorChange={(anchorId) => handleUpdateBlockAnchor(block.id, anchorId)}
              canEdit={canEdit}
            >
              {renderBlockContent(block, editingBlockId === block.id)}
            </BlockWrapper>
          ))}
        </SortableContext>
      </DndContext>

      {canEdit && (
        <div className="pt-4">
          <BlockSelector onAdd={handleAddBlock} onPaste={hasClipboardBlock ? handlePasteBlock : undefined} />
        </div>
      )}

      {blocks.length === 0 && canEdit && (
        <div className="text-center py-12 px-4 border-2 border-dashed border-muted-foreground/20 rounded-xl">
          <Plus className="h-8 w-8 mx-auto mb-3 text-muted-foreground/40" />
          <h3 className="text-base font-medium mb-1">Add your first block</h3>
          <p className="text-sm text-muted-foreground max-w-sm mx-auto">
            Use the <strong>+ Add Block</strong> button above to start building your page with text, images, heroes, and more.
          </p>
        </div>
      )}

      {blocks.length === 0 && !canEdit && (
        <div className="text-center py-12 text-muted-foreground">
          This page has no content yet.
        </div>
      )}
    </div>
  );
}
