import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, Trash2, GripVertical } from 'lucide-react';
import { ArticleGridBlockData } from '@/types/cms';
import { ImageUploader } from '../ImageUploader';
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

interface ArticleGridBlockEditorProps {
  data: ArticleGridBlockData;
  onChange: (data: ArticleGridBlockData) => void;
  canEdit: boolean;
}

interface SortableArticleProps {
  id: string;
  index: number;
  article: ArticleGridBlockData['articles'][0];
  onUpdate: (index: number, field: keyof ArticleGridBlockData['articles'][0], value: string) => void;
  onRemove: (index: number) => void;
}

function SortableArticleItem({ id, index, article, onUpdate, onRemove }: SortableArticleProps) {
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
          <span className="text-sm font-medium">Article {index + 1}</span>
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
      <div className="grid grid-cols-2 gap-3">
        <div className="col-span-2">
          <Label>Title</Label>
          <Input
            value={article.title}
            onChange={(e) => onUpdate(index, 'title', e.target.value)}
            placeholder="Article title"
          />
        </div>
        <div className="col-span-2">
          <Label>Description</Label>
          <Textarea
            value={article.excerpt}
            onChange={(e) => onUpdate(index, 'excerpt', e.target.value)}
            placeholder="Short description..."
            rows={2}
          />
        </div>
        <div>
          <Label>Link (URL)</Label>
          <Input
            value={article.url}
            onChange={(e) => onUpdate(index, 'url', e.target.value)}
            placeholder="/artiklar/min-artikel"
          />
        </div>
        <div>
          <Label>Image</Label>
          <ImageUploader
            value={article.image || ''}
            onChange={(value) => onUpdate(index, 'image', value)}
          />
        </div>
      </div>
    </div>
  );
}

export function ArticleGridBlockEditor({ data, onChange, canEdit }: ArticleGridBlockEditorProps) {
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const updateArticle = (index: number, field: keyof ArticleGridBlockData['articles'][0], value: string) => {
    const newArticles = [...data.articles];
    newArticles[index] = { ...newArticles[index], [field]: value };
    onChange({ ...data, articles: newArticles });
  };

  const addArticle = () => {
    onChange({
      ...data,
      articles: [...data.articles, { title: '', excerpt: '', url: '' }]
    });
  };

  const removeArticle = (index: number) => {
    onChange({
      ...data,
      articles: data.articles.filter((_, i) => i !== index)
    });
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      const oldIndex = data.articles.findIndex((_, i) => `article-${i}` === active.id);
      const newIndex = data.articles.findIndex((_, i) => `article-${i}` === over.id);
      onChange({ ...data, articles: arrayMove(data.articles, oldIndex, newIndex) });
    }
  };

  if (!canEdit) {
    return (
      <div className="space-y-4">
        {data.title && <h3 className="font-semibold text-lg">{data.title}</h3>}
        <div className={`grid gap-4 grid-cols-${data.columns}`}>
          {data.articles.map((article, index) => (
            <div key={index} className="border border-border rounded-lg overflow-hidden">
              {article.image && (
                <div className="aspect-video bg-muted">
                  <img src={article.image} alt={article.title} className="w-full h-full object-cover" />
                </div>
              )}
              <div className="p-3">
                <p className="font-medium">{article.title || 'No title'}</p>
                <p className="text-sm text-muted-foreground mt-1 line-clamp-2">
                  {article.excerpt || 'No description'}
                </p>
              </div>
            </div>
          ))}
        </div>
        {data.articles.length === 0 && (
          <p className="text-muted-foreground text-sm">No articles added</p>
        )}
      </div>
    );
  }

  const articleIds = data.articles.map((_, index) => `article-${index}`);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label htmlFor="grid-title">Title (optional)</Label>
          <Input
            id="grid-title"
            value={data.title || ''}
            onChange={(e) => onChange({ ...data, title: e.target.value })}
            placeholder="e.g. Latest Articles"
          />
        </div>
        <div>
          <Label htmlFor="grid-columns">Number of columns</Label>
          <Select
            value={data.columns.toString()}
            onValueChange={(value) => onChange({ ...data, columns: parseInt(value) as 2 | 3 | 4 })}
          >
            <SelectTrigger id="grid-columns">
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

      <div className="space-y-4">
        <Label>Artiklar</Label>
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          <SortableContext items={articleIds} strategy={verticalListSortingStrategy}>
            {data.articles.map((article, index) => (
              <SortableArticleItem
                key={`article-${index}`}
                id={`article-${index}`}
                index={index}
                article={article}
                onUpdate={updateArticle}
                onRemove={removeArticle}
              />
            ))}
          </SortableContext>
        </DndContext>
      </div>

      <Button type="button" variant="outline" onClick={addArticle} className="w-full">
        <Plus className="h-4 w-4 mr-2" />
        Add article
      </Button>
    </div>
  );
}
