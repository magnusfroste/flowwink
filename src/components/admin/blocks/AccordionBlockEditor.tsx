import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Plus, Trash2, GripVertical } from 'lucide-react';
import { AccordionBlockData } from '@/types/cms';
import { ImagePickerField } from '@/components/admin/ImagePickerField';
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

interface AccordionBlockEditorProps {
  data: AccordionBlockData;
  onChange: (data: AccordionBlockData) => void;
  canEdit: boolean;
}

interface SortableItemProps {
  id: string;
  index: number;
  item: { question: string; answer: string; image?: string; imageAlt?: string };
  onUpdate: (index: number, field: 'question' | 'answer' | 'image' | 'imageAlt', value: string) => void;
  onRemove: (index: number) => void;
}

function SortableAccordionItem({ id, index, item, onUpdate, onRemove }: SortableItemProps) {
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
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div ref={setNodeRef} style={style} className="border border-border rounded-lg p-4 space-y-3 bg-background">
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
          <span className="text-sm font-medium">Fråga {index + 1}</span>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => onRemove(index)}
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>
      <Input
        value={item.question}
        onChange={(e) => onUpdate(index, 'question', e.target.value)}
        placeholder="Skriv frågan här..."
      />
      <Textarea
        value={item.answer}
        onChange={(e) => onUpdate(index, 'answer', e.target.value)}
        placeholder="Skriv svaret här..."
        rows={3}
      />
      <div className="space-y-2">
        <Label className="text-sm">Bild (valfritt)</Label>
        <ImagePickerField
          value={item.image || ''}
          onChange={(url) => onUpdate(index, 'image', url)}
          placeholder="Välj en bild..."
        />
        {item.image && (
          <Input
            value={item.imageAlt || ''}
            onChange={(e) => onUpdate(index, 'imageAlt', e.target.value)}
            placeholder="Bildbeskrivning (alt-text)"
          />
        )}
      </div>
    </div>
  );
}

export function AccordionBlockEditor({ data, onChange, canEdit }: AccordionBlockEditorProps) {
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const updateItem = (index: number, field: 'question' | 'answer' | 'image' | 'imageAlt', value: string) => {
    const newItems = [...data.items];
    newItems[index] = { ...newItems[index], [field]: value };
    onChange({ ...data, items: newItems });
  };

  const addItem = () => {
    onChange({
      ...data,
      items: [...data.items, { question: '', answer: '' }]
    });
  };

  const removeItem = (index: number) => {
    onChange({
      ...data,
      items: data.items.filter((_, i) => i !== index)
    });
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      const oldIndex = data.items.findIndex((_, i) => `accordion-${i}` === active.id);
      const newIndex = data.items.findIndex((_, i) => `accordion-${i}` === over.id);
      onChange({ ...data, items: arrayMove(data.items, oldIndex, newIndex) });
    }
  };

  if (!canEdit) {
    return (
      <div className="space-y-3">
        {data.title && <h3 className="font-semibold text-lg">{data.title}</h3>}
        {data.items.map((item, index) => (
          <div key={index} className="border border-border rounded-lg p-4">
            <p className="font-medium">{item.question || 'Ingen fråga'}</p>
            <p className="text-sm text-muted-foreground mt-1">{item.answer || 'Inget svar'}</p>
          </div>
        ))}
        {data.items.length === 0 && (
          <p className="text-muted-foreground text-sm">Inga frågor tillagda</p>
        )}
      </div>
    );
  }

  const itemIds = data.items.map((_, index) => `accordion-${index}`);

  return (
    <div className="space-y-4">
      <div>
        <Label htmlFor="accordion-title">Rubrik (valfritt)</Label>
        <Input
          id="accordion-title"
          value={data.title || ''}
          onChange={(e) => onChange({ ...data, title: e.target.value })}
          placeholder="T.ex. Vanliga frågor"
        />
      </div>

      <div className="space-y-3">
        <Label>Frågor & Svar</Label>
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          <SortableContext items={itemIds} strategy={verticalListSortingStrategy}>
            {data.items.map((item, index) => (
              <SortableAccordionItem
                key={`accordion-${index}`}
                id={`accordion-${index}`}
                index={index}
                item={item}
                onUpdate={updateItem}
                onRemove={removeItem}
              />
            ))}
          </SortableContext>
        </DndContext>
      </div>

      <Button type="button" variant="outline" onClick={addItem} className="w-full">
        <Plus className="h-4 w-4 mr-2" />
        Lägg till fråga
      </Button>
    </div>
  );
}
