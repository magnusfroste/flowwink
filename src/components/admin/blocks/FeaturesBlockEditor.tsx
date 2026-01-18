import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Card, CardContent } from '@/components/ui/card';
import { Plus, Trash2, GripVertical, ExternalLink, Zap } from 'lucide-react';
import { IconPicker } from '../IconPicker';
import { FeaturesBlockData, FeatureItem } from '@/types/cms';
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

interface FeaturesBlockEditorProps {
  data: FeaturesBlockData;
  onChange: (data: FeaturesBlockData) => void;
  isEditing?: boolean;
}

function SortableFeatureItem({
  feature,
  onUpdate,
  onRemove,
  showLinks,
}: {
  feature: FeatureItem;
  onUpdate: (updated: FeatureItem) => void;
  onRemove: () => void;
  showLinks: boolean;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: feature.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <Card ref={setNodeRef} style={style} className="relative">
      <CardContent className="pt-4 space-y-4">
        <div className="flex items-start gap-3">
          <button
            type="button"
            className="mt-2 cursor-grab active:cursor-grabbing text-muted-foreground hover:text-foreground"
            {...attributes}
            {...listeners}
          >
            <GripVertical className="h-4 w-4" />
          </button>
          <div className="flex-1 space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Icon</Label>
                <IconPicker
                  value={feature.icon}
                  onChange={(icon) => onUpdate({ ...feature, icon })}
                />
              </div>
              <div className="space-y-2">
                <Label>Title</Label>
                <Input
                  value={feature.title}
                  onChange={(e) => onUpdate({ ...feature, title: e.target.value })}
                  placeholder="Feature title"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Description</Label>
              <Textarea
                value={feature.description}
                onChange={(e) => onUpdate({ ...feature, description: e.target.value })}
                placeholder="Describe this feature..."
                rows={2}
              />
            </div>
            {showLinks && (
              <div className="space-y-2">
                <Label>Link URL (optional)</Label>
                <div className="flex gap-2">
                  <Input
                    value={feature.url || ''}
                    onChange={(e) => onUpdate({ ...feature, url: e.target.value })}
                    placeholder="/page or https://..."
                  />
                  <Button variant="ghost" size="icon" className="shrink-0" disabled={!feature.url}>
                    <ExternalLink className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            )}
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="text-destructive hover:text-destructive"
            onClick={onRemove}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

export function FeaturesBlockEditor({ data, onChange, isEditing }: FeaturesBlockEditorProps) {
  const features = data.features || [];
  const showLinks = data.showLinks ?? true;

  // Preview mode
  if (!isEditing) {
    return (
      <div className="p-6 text-center border-2 border-dashed rounded-lg bg-muted/30">
        <Zap className="h-12 w-12 mx-auto text-muted-foreground mb-3" />
        <h3 className="font-medium text-lg">{data.title || "Features"}</h3>
        <p className="text-sm text-muted-foreground mt-1">
          {features.length} feature{features.length !== 1 ? 's' : ''} • {data.columns || 3} columns • {data.layout || 'grid'}
        </p>
        {features.length > 0 && (
          <div className="mt-4 grid grid-cols-3 gap-2 max-w-xs mx-auto">
            {features.slice(0, 3).map((f) => (
              <div key={f.id} className="p-2 rounded bg-background border text-xs truncate">
                {f.title || 'Feature'}
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const addFeature = () => {
    const newFeature: FeatureItem = {
      id: crypto.randomUUID(),
      icon: 'Zap',
      title: '',
      description: '',
    };
    onChange({ ...data, features: [...features, newFeature] });
  };

  const updateFeature = (index: number, updated: FeatureItem) => {
    const newFeatures = [...features];
    newFeatures[index] = updated;
    onChange({ ...data, features: newFeatures });
  };

  const removeFeature = (index: number) => {
    onChange({ ...data, features: features.filter((_, i) => i !== index) });
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      const oldIndex = features.findIndex((f) => f.id === active.id);
      const newIndex = features.findIndex((f) => f.id === over.id);
      onChange({ ...data, features: arrayMove(features, oldIndex, newIndex) });
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="space-y-4">
        <div className="space-y-2">
          <Label>Title</Label>
          <Input
            value={data.title || ''}
            onChange={(e) => onChange({ ...data, title: e.target.value })}
            placeholder="Our Services"
          />
        </div>
        <div className="space-y-2">
          <Label>Subtitle</Label>
          <Textarea
            value={data.subtitle || ''}
            onChange={(e) => onChange({ ...data, subtitle: e.target.value })}
            placeholder="What we offer..."
            rows={2}
          />
        </div>
      </div>

      {/* Display Settings */}
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Columns</Label>
          <Select
            value={String(data.columns || 3)}
            onValueChange={(v) => onChange({ ...data, columns: Number(v) as 2 | 3 | 4 })}
          >
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
        <div className="space-y-2">
          <Label>Layout</Label>
          <Select
            value={data.layout || 'grid'}
            onValueChange={(v) => onChange({ ...data, layout: v as 'grid' | 'list' })}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="grid">Grid</SelectItem>
              <SelectItem value="list">List</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label>Variant</Label>
          <Select
            value={data.variant || 'default'}
            onValueChange={(v) => onChange({ ...data, variant: v as 'default' | 'cards' | 'minimal' | 'centered' })}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="default">Default</SelectItem>
              <SelectItem value="cards">Cards</SelectItem>
              <SelectItem value="minimal">Minimal</SelectItem>
              <SelectItem value="centered">Centered</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label>Icon Style</Label>
          <Select
            value={data.iconStyle || 'circle'}
            onValueChange={(v) => onChange({ ...data, iconStyle: v as 'circle' | 'square' | 'none' })}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="circle">Circle</SelectItem>
              <SelectItem value="square">Square</SelectItem>
              <SelectItem value="none">No background</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="flex items-center justify-between">
        <Label>Show Links</Label>
        <Switch
          checked={showLinks}
          onCheckedChange={(v) => onChange({ ...data, showLinks: v })}
        />
      </div>

      {/* Design System 2026: Premium Effects */}
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Hover Effect</Label>
          <Select
            value={data.hoverEffect || 'none'}
            onValueChange={(v) => onChange({ ...data, hoverEffect: v as 'none' | 'lift' | 'glow' | 'border' })}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">None</SelectItem>
              <SelectItem value="lift">Lift</SelectItem>
              <SelectItem value="glow">Glow</SelectItem>
              <SelectItem value="border">Border</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label>Card Style</Label>
          <Select
            value={data.cardStyle || 'default'}
            onValueChange={(v) => onChange({ ...data, cardStyle: v as 'default' | 'glass' | 'gradient-border' })}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="default">Default</SelectItem>
              <SelectItem value="glass">Glass</SelectItem>
              <SelectItem value="gradient-border">Gradient Border</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="flex items-center justify-between">
        <div>
          <Label>Staggered Reveal</Label>
          <p className="text-xs text-muted-foreground">Animate cards one by one</p>
        </div>
        <Switch
          checked={data.staggeredReveal || false}
          onCheckedChange={(v) => onChange({ ...data, staggeredReveal: v })}
        />
      </div>

      {/* Features List */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <Label className="text-base">Features ({features.length})</Label>
          <Button variant="outline" size="sm" onClick={addFeature}>
            <Plus className="h-4 w-4 mr-2" />
            Add Feature
          </Button>
        </div>

        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          <SortableContext items={features.map((f) => f.id)} strategy={verticalListSortingStrategy}>
            <div className="space-y-3">
              {features.map((feature, index) => (
                <SortableFeatureItem
                  key={feature.id}
                  feature={feature}
                  onUpdate={(updated) => updateFeature(index, updated)}
                  onRemove={() => removeFeature(index)}
                  showLinks={showLinks}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>

        {features.length === 0 && (
          <div className="text-center py-8 text-muted-foreground border-2 border-dashed rounded-lg">
            <p>No features yet. Click "Add Feature" to get started.</p>
          </div>
        )}
      </div>
    </div>
  );
}
