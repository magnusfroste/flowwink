import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Plus, Trash2, GripVertical, Bold, Italic, List, ListOrdered } from 'lucide-react';
import { AccordionBlockData, TiptapDocument } from '@/types/cms';
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
import { useEditor, EditorContent, generateHTML } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Link from '@tiptap/extension-link';
import Placeholder from '@tiptap/extension-placeholder';

// Helper to check if content is Tiptap JSON
function isTiptapDocument(content: unknown): content is TiptapDocument {
  return typeof content === 'object' && content !== null && (content as TiptapDocument).type === 'doc';
}

// Get initial content for editor
function getEditorContent(answer: string | TiptapDocument | undefined): string {
  if (!answer) return '';
  if (isTiptapDocument(answer)) {
    return generateHTML(answer, [StarterKit, Link]);
  }
  return `<p>${answer}</p>`;
}

// Render answer as HTML
function renderAnswer(answer: string | TiptapDocument | undefined): string {
  if (!answer) return '';
  if (isTiptapDocument(answer)) {
    return generateHTML(answer, [StarterKit, Link]);
  }
  return `<p>${answer}</p>`;
}

interface AccordionBlockEditorProps {
  data: AccordionBlockData;
  onChange: (data: AccordionBlockData) => void;
  canEdit: boolean;
}

interface SortableItemProps {
  id: string;
  index: number;
  item: { question: string; answer: string | TiptapDocument; image?: string; imageAlt?: string };
  onUpdate: (index: number, field: 'question' | 'answer' | 'image' | 'imageAlt', value: string | TiptapDocument) => void;
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

  const editor = useEditor({
    extensions: [
      StarterKit,
      Link.configure({ openOnClick: false }),
      Placeholder.configure({ placeholder: 'Write the answer here...' }),
    ],
    content: getEditorContent(item.answer),
    onUpdate: ({ editor }) => {
      onUpdate(index, 'answer', editor.getJSON() as TiptapDocument);
    },
  });

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
          <span className="text-sm font-medium">Question {index + 1}</span>
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
        placeholder="Write the question here..."
      />
      <div className="space-y-2">
        <Label className="text-sm">Answer</Label>
        {editor && (
          <>
            <div className="flex gap-1 border-b pb-2 mb-2">
              <Button
                type="button"
                variant={editor.isActive('bold') ? 'secondary' : 'ghost'}
                size="sm"
                onClick={() => editor.chain().focus().toggleBold().run()}
              >
                <Bold className="h-4 w-4" />
              </Button>
              <Button
                type="button"
                variant={editor.isActive('italic') ? 'secondary' : 'ghost'}
                size="sm"
                onClick={() => editor.chain().focus().toggleItalic().run()}
              >
                <Italic className="h-4 w-4" />
              </Button>
              <Button
                type="button"
                variant={editor.isActive('bulletList') ? 'secondary' : 'ghost'}
                size="sm"
                onClick={() => editor.chain().focus().toggleBulletList().run()}
              >
                <List className="h-4 w-4" />
              </Button>
              <Button
                type="button"
                variant={editor.isActive('orderedList') ? 'secondary' : 'ghost'}
                size="sm"
                onClick={() => editor.chain().focus().toggleOrderedList().run()}
              >
                <ListOrdered className="h-4 w-4" />
              </Button>
            </div>
            <EditorContent 
              editor={editor} 
              className="prose prose-sm max-w-none min-h-[80px] border rounded-md p-3 focus-within:ring-2 focus-within:ring-ring bg-background"
            />
          </>
        )}
      </div>
      <div className="space-y-2">
        <Label className="text-sm">Image (optional)</Label>
        <ImagePickerField
          value={item.image || ''}
          onChange={(url) => onUpdate(index, 'image', url)}
          placeholder="Choose an image..."
        />
        {item.image && (
          <Input
            value={item.imageAlt || ''}
            onChange={(e) => onUpdate(index, 'imageAlt', e.target.value)}
            placeholder="Image description (alt text)"
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

  const updateItem = (index: number, field: 'question' | 'answer' | 'image' | 'imageAlt', value: string | TiptapDocument) => {
    const newItems = [...data.items];
    newItems[index] = { ...newItems[index], [field]: value };
    onChange({ ...data, items: newItems });
  };

  const addItem = () => {
    onChange({
      ...data,
      items: [...data.items, { question: '', answer: { type: 'doc', content: [] } as TiptapDocument }]
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
            <p className="font-medium">{item.question || 'No question'}</p>
            <div 
              className="text-sm text-muted-foreground mt-1 prose prose-sm max-w-none"
              dangerouslySetInnerHTML={{ __html: renderAnswer(item.answer) || 'No answer' }}
            />
          </div>
        ))}
        {data.items.length === 0 && (
          <p className="text-muted-foreground text-sm">No questions added</p>
        )}
      </div>
    );
  }

  const itemIds = data.items.map((_, index) => `accordion-${index}`);

  return (
    <div className="space-y-4">
      <div>
        <Label htmlFor="accordion-title">Title (optional)</Label>
        <Input
          id="accordion-title"
          value={data.title || ''}
          onChange={(e) => onChange({ ...data, title: e.target.value })}
          placeholder="e.g. Frequently Asked Questions"
        />
      </div>

      <div className="space-y-3">
        <Label>Questions & Answers</Label>
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
        Add question
      </Button>
    </div>
  );
}
