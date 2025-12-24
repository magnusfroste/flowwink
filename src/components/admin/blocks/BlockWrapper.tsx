import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical, Trash2, Settings } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ContentBlock, ContentBlockType, BlockSpacing } from '@/types/cms';
import { cn } from '@/lib/utils';
import { BlockSpacingControl, getSpacingClasses } from './BlockSpacingControl';

const BLOCK_LABELS: Record<ContentBlockType, string> = {
  hero: 'Hero',
  text: 'Text',
  image: 'Image',
  cta: 'Call-to-Action',
  contact: 'Contact',
  'link-grid': 'Link Grid',
  'two-column': 'Two Column',
  'info-box': 'Fact Box',
  accordion: 'Accordion/FAQ',
  'article-grid': 'Article Grid',
  youtube: 'YouTube',
  quote: 'Quote',
  separator: 'Separator',
  gallery: 'Gallery',
  stats: 'Statistics',
  chat: 'AI Chat',
  map: 'Map',
  form: 'Form',
  newsletter: 'Newsletter',
  footer: 'Footer',
  header: 'Header',
};

interface BlockWrapperProps {
  block: ContentBlock;
  children: React.ReactNode;
  isEditing: boolean;
  onEdit: () => void;
  onDelete: () => void;
  onSpacingChange?: (spacing: BlockSpacing) => void;
  canEdit: boolean;
}

export function BlockWrapper({
  block,
  children,
  isEditing,
  onEdit,
  onDelete,
  onSpacingChange,
  canEdit,
}: BlockWrapperProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: block.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const spacingClasses = getSpacingClasses(block.spacing);

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        'relative group rounded-lg border-2 transition-all',
        isDragging ? 'opacity-50 border-primary shadow-lg z-50' : 'border-transparent',
        isEditing ? 'border-primary bg-primary/5' : 'hover:border-border',
        !canEdit && 'pointer-events-none'
      )}
    >
      {/* Block Controls */}
      {canEdit && (
        <div
          className={cn(
            'absolute -top-3 left-4 flex items-center gap-1 opacity-0 transition-opacity z-10',
            'group-hover:opacity-100',
            isEditing && 'opacity-100'
          )}
        >
          <div
            {...attributes}
            {...listeners}
            className="flex items-center gap-1 px-2 py-1 bg-card border rounded-md shadow-sm cursor-grab active:cursor-grabbing"
          >
            <GripVertical className="h-4 w-4 text-muted-foreground" />
            <span className="text-xs font-medium text-muted-foreground">
              {BLOCK_LABELS[block.type]}
            </span>
          </div>
          <Button
            variant="outline"
            size="icon"
            className="h-7 w-7 bg-card"
            onClick={onEdit}
          >
            <Settings className="h-3.5 w-3.5" />
          </Button>
          {onSpacingChange && (
            <BlockSpacingControl
              spacing={block.spacing}
              onChange={onSpacingChange}
            />
          )}
          <Button
            variant="outline"
            size="icon"
            className="h-7 w-7 bg-card hover:bg-destructive hover:text-destructive-foreground hover:border-destructive"
            onClick={onDelete}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      )}

      {/* Block Content with spacing applied */}
      <div className={cn('p-2', spacingClasses)}>{children}</div>
    </div>
  );
}
