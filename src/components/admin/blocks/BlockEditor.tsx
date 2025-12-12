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
import { ContentBlock, ContentBlockType, HeroBlockData, TextBlockData, ImageBlockData, CTABlockData, ContactBlockData, LinkGridBlockData, TwoColumnBlockData, InfoBoxBlockData } from '@/types/cms';
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

type BlockDataMap = {
  hero: HeroBlockData;
  text: TextBlockData;
  image: ImageBlockData;
  cta: CTABlockData;
  contact: ContactBlockData;
  'link-grid': LinkGridBlockData;
  'two-column': TwoColumnBlockData;
  'info-box': InfoBoxBlockData;
};

const DEFAULT_BLOCK_DATA: BlockDataMap = {
  hero: { title: 'Ny Hero', subtitle: '' },
  text: { content: '<p>Skriv ditt innehåll här...</p>' },
  image: { src: '', alt: '' },
  cta: { title: 'Redo att ta nästa steg?', buttonText: 'Kontakta oss', buttonUrl: '/kontakt', gradient: true },
  contact: { title: 'Kontakta oss' },
  'link-grid': { links: [], columns: 3 },
  'two-column': { content: '<p>Skriv ditt innehåll här...</p>', imageSrc: '', imageAlt: '', imagePosition: 'right' },
  'info-box': { title: 'Viktig information', content: '', variant: 'info' },
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
      default:
        return <div className="p-4 text-muted-foreground">Okänd blocktyp</div>;
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

      {blocks.length === 0 && !canEdit && (
        <div className="text-center py-12 text-muted-foreground">
          Denna sida har inget innehåll ännu.
        </div>
      )}
    </div>
  );
}
