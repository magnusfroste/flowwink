import { useState } from 'react';
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
  rectSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GalleryBlockData } from '@/types/cms';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Plus, GripVertical, Trash2, ImageIcon, FolderOpen } from 'lucide-react';
import { MediaLibraryPicker } from '../MediaLibraryPicker';
import { cn } from '@/lib/utils';

interface GalleryBlockEditorProps {
  data: GalleryBlockData;
  onChange: (data: GalleryBlockData) => void;
  canEdit: boolean;
}

interface SortableImageProps {
  image: { src: string; alt: string; caption?: string };
  index: number;
  onUpdate: (index: number, updates: Partial<{ src: string; alt: string; caption: string }>) => void;
  onDelete: (index: number) => void;
  isEditing: boolean;
  onOpenMediaLibrary: (index: number) => void;
}

function SortableImage({ image, index, onUpdate, onDelete, isEditing, onOpenMediaLibrary }: SortableImageProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: `image-${index}` });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  if (!isEditing) {
    return (
      <div className="aspect-video bg-muted rounded-lg overflow-hidden">
        {image.src ? (
          <img src={image.src} alt={image.alt} className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <ImageIcon className="h-8 w-8 text-muted-foreground" />
          </div>
        )}
      </div>
    );
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        'border rounded-lg p-3 space-y-3 bg-card',
        isDragging && 'opacity-50'
      )}
    >
      <div className="flex items-center justify-between">
        <div
          {...attributes}
          {...listeners}
          className="cursor-grab active:cursor-grabbing p-1"
        >
          <GripVertical className="h-4 w-4 text-muted-foreground" />
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 text-destructive hover:bg-destructive/10"
          onClick={() => onDelete(index)}
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>

      <div className="aspect-video bg-muted rounded overflow-hidden">
        {image.src ? (
          <img src={image.src} alt={image.alt} className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <ImageIcon className="h-8 w-8 text-muted-foreground" />
          </div>
        )}
      </div>

      <div className="flex gap-2">
        <Input
          value={image.src}
          onChange={(e) => onUpdate(index, { src: e.target.value })}
          placeholder="Bild-URL"
          className="flex-1"
        />
        <Button
          variant="outline"
          size="icon"
          onClick={() => onOpenMediaLibrary(index)}
          title="Välj från bibliotek"
        >
          <FolderOpen className="h-4 w-4" />
        </Button>
      </div>

      <Input
        value={image.alt}
        onChange={(e) => onUpdate(index, { alt: e.target.value })}
        placeholder="Alternativtext"
      />

      <Input
        value={image.caption || ''}
        onChange={(e) => onUpdate(index, { caption: e.target.value })}
        placeholder="Bildtext (valfritt)"
      />
    </div>
  );
}

export function GalleryBlockEditor({ data, onChange, canEdit }: GalleryBlockEditorProps) {
  const [mediaPickerIndex, setMediaPickerIndex] = useState<number | null>(null);
  const images = data.images || [];

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      const oldIndex = parseInt(String(active.id).replace('image-', ''));
      const newIndex = parseInt(String(over.id).replace('image-', ''));
      onChange({ ...data, images: arrayMove(images, oldIndex, newIndex) });
    }
  };

  const handleAddImage = () => {
    onChange({
      ...data,
      images: [...images, { src: '', alt: '' }],
    });
  };

  const handleUpdateImage = (index: number, updates: Partial<{ src: string; alt: string; caption: string }>) => {
    const newImages = [...images];
    newImages[index] = { ...newImages[index], ...updates };
    onChange({ ...data, images: newImages });
  };

  const handleDeleteImage = (index: number) => {
    onChange({ ...data, images: images.filter((_, i) => i !== index) });
  };

  const handleMediaSelect = (url: string) => {
    if (mediaPickerIndex !== null) {
      handleUpdateImage(mediaPickerIndex, { src: url });
      setMediaPickerIndex(null);
    }
  };

  if (!canEdit) {
    const columns = data.columns || 3;
    const gridCols = {
      2: 'grid-cols-2',
      3: 'grid-cols-3',
      4: 'grid-cols-4',
    }[columns];

    return (
      <div className={`grid ${gridCols} gap-4 p-4`}>
        {images.map((image, index) => (
          <SortableImage
            key={index}
            image={image}
            index={index}
            onUpdate={handleUpdateImage}
            onDelete={handleDeleteImage}
            isEditing={false}
            onOpenMediaLibrary={setMediaPickerIndex}
          />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-4 p-4">
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Layout</Label>
          <Select
            value={data.layout || 'grid'}
            onValueChange={(value: 'grid' | 'carousel' | 'masonry') =>
              onChange({ ...data, layout: value })
            }
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="grid">Rutnät</SelectItem>
              <SelectItem value="carousel">Karusell</SelectItem>
              <SelectItem value="masonry">Masonry</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label>Kolumner</Label>
          <Select
            value={String(data.columns || 3)}
            onValueChange={(value) =>
              onChange({ ...data, columns: parseInt(value) as 2 | 3 | 4 })
            }
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="2">2 kolumner</SelectItem>
              <SelectItem value="3">3 kolumner</SelectItem>
              <SelectItem value="4">4 kolumner</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={handleDragEnd}
      >
        <SortableContext
          items={images.map((_, i) => `image-${i}`)}
          strategy={rectSortingStrategy}
        >
          <div className="grid grid-cols-2 gap-4">
            {images.map((image, index) => (
              <SortableImage
                key={`image-${index}`}
                image={image}
                index={index}
                onUpdate={handleUpdateImage}
                onDelete={handleDeleteImage}
                isEditing={true}
                onOpenMediaLibrary={setMediaPickerIndex}
              />
            ))}
          </div>
        </SortableContext>
      </DndContext>

      <Button variant="outline" onClick={handleAddImage} className="w-full">
        <Plus className="h-4 w-4 mr-2" />
        Lägg till bild
      </Button>

      <MediaLibraryPicker
        open={mediaPickerIndex !== null}
        onOpenChange={(open) => !open && setMediaPickerIndex(null)}
        onSelect={handleMediaSelect}
      />
    </div>
  );
}
