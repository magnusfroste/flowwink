import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical, Trash2, Settings } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ContentBlock, ContentBlockType } from '@/types/cms';
import { cn } from '@/lib/utils';

const BLOCK_LABELS: Record<ContentBlockType, string> = {
  hero: 'Hero',
  text: 'Text',
  image: 'Bild',
  cta: 'Call-to-Action',
  contact: 'Kontakt',
  'link-grid': 'Länkgrid',
  'two-column': 'Två-kolumn',
  'info-box': 'Faktaruta',
  accordion: 'Accordion/FAQ',
  'article-grid': 'Artikelgrid',
  youtube: 'YouTube',
  quote: 'Citat',
  separator: 'Avdelare',
  gallery: 'Galleri',
  stats: 'Statistik',
  chat: 'AI Chat',
  footer: 'Footer',
  header: 'Header',
};

interface BlockWrapperProps {
  block: ContentBlock;
  children: React.ReactNode;
  isEditing: boolean;
  onEdit: () => void;
  onDelete: () => void;
  canEdit: boolean;
}

export function BlockWrapper({
  block,
  children,
  isEditing,
  onEdit,
  onDelete,
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

      {/* Block Content */}
      <div className="p-2">{children}</div>
    </div>
  );
}
