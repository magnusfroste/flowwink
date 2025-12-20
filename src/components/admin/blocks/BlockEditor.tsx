import { useState, useCallback } from 'react';
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
import { ContentBlock, ContentBlockType, HeroBlockData, TextBlockData, ImageBlockData, CTABlockData, ContactBlockData, LinkGridBlockData, TwoColumnBlockData, InfoBoxBlockData, AccordionBlockData, ArticleGridBlockData, YouTubeBlockData, QuoteBlockData, SeparatorBlockData, GalleryBlockData, StatsBlockData, ChatBlockData, MapBlockData, FormBlockData } from '@/types/cms';
import { BlockWrapper } from './BlockWrapper';
import { BlockSelector } from './BlockSelector';
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
import { TemplateEmptyState } from '@/components/admin/StarterTemplateSelector';
import { StarterTemplate } from '@/data/starter-templates';

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
};

interface BlockEditorProps {
  blocks: ContentBlock[];
  onChange: (blocks: ContentBlock[]) => void;
  canEdit: boolean;
}

export function BlockEditor({ blocks, onChange, canEdit }: BlockEditorProps) {
  const [editingBlockId, setEditingBlockId] = useState<string | null>(null);

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
              canEdit={canEdit}
            >
              {renderBlockContent(block, editingBlockId === block.id)}
            </BlockWrapper>
          ))}
        </SortableContext>
      </DndContext>

      {canEdit && (
        <div className="pt-4">
          <BlockSelector onAdd={handleAddBlock} />
        </div>
      )}

      {blocks.length === 0 && canEdit && (
        <TemplateEmptyState 
          onSelectTemplate={(template: StarterTemplate) => {
            // Apply first page's blocks to the current page
            const homePage = template.pages.find(p => p.isHomePage) || template.pages[0];
            if (homePage) {
              onChange(homePage.blocks.map(block => ({
                ...block,
                id: `block-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
              })));
            }
          }}
        />
      )}

      {blocks.length === 0 && !canEdit && (
        <div className="text-center py-12 text-muted-foreground">
          This page has no content yet.
        </div>
      )}
    </div>
  );
}
