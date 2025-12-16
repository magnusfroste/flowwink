import { useState } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { IconPicker } from '@/components/admin/IconPicker';
import { LinkGridBlockData } from '@/types/cms';
import { Plus, Trash2, ExternalLink, GripVertical, icons } from 'lucide-react';
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
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { cn } from '@/lib/utils';

interface LinkGridBlockEditorProps {
  data: LinkGridBlockData;
  isEditing: boolean;
  onChange: (data: LinkGridBlockData) => void;
}

interface SortableLinkItemProps {
  id: string;
  index: number;
  link: { icon: string; title: string; description?: string; url: string };
  onRemove: () => void;
  onLinkChange: (field: 'icon' | 'title' | 'description' | 'url', value: string) => void;
}

function SortableLinkItem({ id, index, link, onRemove, onLinkChange }: SortableLinkItemProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        "border rounded-lg p-4 space-y-3 bg-muted/30",
        isDragging && "opacity-50 shadow-lg"
      )}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <button
            type="button"
            className="cursor-grab touch-none text-muted-foreground hover:text-foreground"
            {...attributes}
            {...listeners}
          >
            <GripVertical className="h-4 w-4" />
          </button>
          <span className="text-sm font-medium">Link {index + 1}</span>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={onRemove}
          className="text-destructive hover:text-destructive"
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>
      
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label>Icon</Label>
          <IconPicker
            value={link.icon}
            onChange={(v) => onLinkChange('icon', v)}
          />
        </div>
        <div>
          <Label>Title</Label>
          <Input
            value={link.title}
            onChange={(e) => onLinkChange('title', e.target.value)}
            placeholder="Find us"
          />
        </div>
      </div>
      
      <div>
        <Label>Description (optional)</Label>
        <Input
          value={link.description || ''}
          onChange={(e) => onLinkChange('description', e.target.value)}
          placeholder="Short description..."
        />
      </div>
      
      <div>
        <Label>URL</Label>
        <Input
          value={link.url}
          onChange={(e) => onLinkChange('url', e.target.value)}
          placeholder="/contact"
        />
      </div>
    </div>
  );
}

export function LinkGridBlockEditor({ data, isEditing, onChange }: LinkGridBlockEditorProps) {
  const [links, setLinks] = useState(data.links || []);
  const [columns, setColumns] = useState(data.columns || 3);

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  // Generate stable IDs for sortable items
  const linkIds = links.map((_, index) => `link-${index}`);

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      const oldIndex = linkIds.indexOf(active.id as string);
      const newIndex = linkIds.indexOf(over.id as string);
      const newLinks = arrayMove(links, oldIndex, newIndex);
      setLinks(newLinks);
      onChange({ ...data, links: newLinks, columns });
    }
  };

  const handleAddLink = () => {
    const newLinks = [...links, { icon: 'ArrowRight', title: '', description: '', url: '' }];
    setLinks(newLinks);
    onChange({ ...data, links: newLinks, columns });
  };

  const handleRemoveLink = (index: number) => {
    const newLinks = links.filter((_, i) => i !== index);
    setLinks(newLinks);
    onChange({ ...data, links: newLinks, columns });
  };

  const handleLinkChange = (index: number, field: 'icon' | 'title' | 'description' | 'url', value: string) => {
    const newLinks = links.map((link, i) => 
      i === index ? { ...link, [field]: value } : link
    );
    setLinks(newLinks);
    onChange({ ...data, links: newLinks, columns });
  };

  const handleColumnsChange = (value: string) => {
    const cols = parseInt(value) as 2 | 3 | 4;
    setColumns(cols);
    onChange({ ...data, links, columns: cols });
  };

  const renderIcon = (iconName: string) => {
    const LucideIcon = icons[iconName as keyof typeof icons];
    if (LucideIcon && typeof LucideIcon === 'function') {
      return <LucideIcon className="h-6 w-6" />;
    }
    return <ExternalLink className="h-6 w-6" />;
  };

  if (isEditing) {
    return (
      <div className="space-y-4 p-4">
        <div className="flex items-center gap-4">
          <div className="flex-1">
            <Label>Number of columns</Label>
            <Select value={columns.toString()} onValueChange={handleColumnsChange}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="2">2 columns</SelectItem>
                <SelectItem value="3">3 columns</SelectItem>
                <SelectItem value="4">4 columns</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          <SortableContext items={linkIds} strategy={verticalListSortingStrategy}>
            <div className="space-y-4">
              {links.map((link, index) => (
                <SortableLinkItem
                  key={linkIds[index]}
                  id={linkIds[index]}
                  index={index}
                  link={link}
                  onRemove={() => handleRemoveLink(index)}
                  onLinkChange={(field, value) => handleLinkChange(index, field, value)}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>

        <Button variant="outline" onClick={handleAddLink} className="w-full">
          <Plus className="h-4 w-4 mr-2" />
          Add link
        </Button>
      </div>
    );
  }

  // Preview mode
  const gridCols = {
    2: 'grid-cols-1 sm:grid-cols-2',
    3: 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3',
    4: 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-4',
  };

  return (
    <div className={`grid ${gridCols[columns]} gap-4 p-6`}>
      {links.length === 0 ? (
        <div className="col-span-full text-center text-muted-foreground py-8">
          No links added
        </div>
      ) : (
        links.map((link, index) => (
          <a
            key={index}
            href={link.url || '#'}
            className="group flex flex-col items-center p-6 bg-card border rounded-lg hover:border-primary hover:shadow-md transition-all text-center"
          >
            <div className="text-primary mb-3">
              {renderIcon(link.icon)}
            </div>
            <h3 className="font-semibold text-foreground group-hover:text-primary transition-colors">
              {link.title || 'Title'}
            </h3>
            {link.description && (
              <p className="text-sm text-muted-foreground mt-1">
                {link.description}
              </p>
            )}
          </a>
        ))
      )}
    </div>
  );
}
