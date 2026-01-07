import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Slider } from '@/components/ui/slider';
import { Plus, Trash2, GripVertical } from 'lucide-react';
import type { ProgressBlockData, ProgressItem } from '@/components/public/blocks/ProgressBlock';

interface ProgressBlockEditorProps {
  data: ProgressBlockData;
  onChange: (data: ProgressBlockData) => void;
  isEditing: boolean;
}

export function ProgressBlockEditor({ data, onChange, isEditing }: ProgressBlockEditorProps) {
  const { 
    title = '', 
    subtitle = '', 
    items = [], 
    variant = 'default',
    size = 'md',
    showPercentage = true,
    showLabels = true,
    animated = true,
    animationDuration = 1500,
  } = data;

  const addItem = () => {
    const newItem: ProgressItem = {
      id: `progress-${Date.now()}`,
      label: 'New Item',
      value: 50,
    };
    onChange({ ...data, items: [...items, newItem] });
  };

  const updateItem = (index: number, updates: Partial<ProgressItem>) => {
    const newItems = [...items];
    newItems[index] = { ...newItems[index], ...updates };
    onChange({ ...data, items: newItems });
  };

  const removeItem = (index: number) => {
    onChange({ ...data, items: items.filter((_, i) => i !== index) });
  };

  if (!isEditing) {
    return (
      <div className="py-8 text-center text-muted-foreground">
        <div className="text-lg font-medium mb-2">{title || 'Progress Block'}</div>
        <div className="text-sm">{items.length} progress items • {variant} variant</div>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-4">
      {/* Header */}
      <div className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="progress-title">Title</Label>
          <Input
            id="progress-title"
            value={title}
            onChange={(e) => onChange({ ...data, title: e.target.value })}
            placeholder="Progress title..."
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="progress-subtitle">Subtitle</Label>
          <Input
            id="progress-subtitle"
            value={subtitle}
            onChange={(e) => onChange({ ...data, subtitle: e.target.value })}
            placeholder="Optional description..."
          />
        </div>
      </div>

      {/* Settings */}
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Variant</Label>
          <Select value={variant} onValueChange={(v) => onChange({ ...data, variant: v as ProgressBlockData['variant'] })}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="default">Default (Linear)</SelectItem>
              <SelectItem value="circular">Circular</SelectItem>
              <SelectItem value="cards">Cards</SelectItem>
              <SelectItem value="minimal">Minimal</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label>Size</Label>
          <Select value={size} onValueChange={(v) => onChange({ ...data, size: v as ProgressBlockData['size'] })}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="sm">Small</SelectItem>
              <SelectItem value="md">Medium</SelectItem>
              <SelectItem value="lg">Large</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Toggles */}
      <div className="grid grid-cols-2 gap-4">
        <div className="flex items-center justify-between">
          <Label htmlFor="show-percentage">Show Percentage</Label>
          <Switch
            id="show-percentage"
            checked={showPercentage}
            onCheckedChange={(v) => onChange({ ...data, showPercentage: v })}
          />
        </div>
        <div className="flex items-center justify-between">
          <Label htmlFor="show-labels">Show Labels</Label>
          <Switch
            id="show-labels"
            checked={showLabels}
            onCheckedChange={(v) => onChange({ ...data, showLabels: v })}
          />
        </div>
        <div className="flex items-center justify-between">
          <Label htmlFor="animated">Animate on Scroll</Label>
          <Switch
            id="animated"
            checked={animated}
            onCheckedChange={(v) => onChange({ ...data, animated: v })}
          />
        </div>
        {animated && (
          <div className="space-y-2">
            <Label>Duration: {animationDuration}ms</Label>
            <Slider
              value={[animationDuration]}
              onValueChange={([v]) => onChange({ ...data, animationDuration: v })}
              min={500}
              max={3000}
              step={100}
            />
          </div>
        )}
      </div>

      {/* Progress Items */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <Label className="text-base font-medium">Progress Items</Label>
          <Button variant="outline" size="sm" onClick={addItem}>
            <Plus className="h-4 w-4 mr-1" />
            Add Item
          </Button>
        </div>

        {items.length === 0 ? (
          <div className="text-center py-8 border-2 border-dashed rounded-lg text-muted-foreground">
            <p>No progress items yet</p>
            <Button variant="link" onClick={addItem}>Add your first item</Button>
          </div>
        ) : (
          <div className="space-y-3">
            {items.map((item, index) => (
              <div key={item.id} className="flex items-start gap-3 p-4 border rounded-lg bg-card">
                <div className="cursor-move mt-2 text-muted-foreground">
                  <GripVertical className="h-4 w-4" />
                </div>
                <div className="flex-1 space-y-3">
                  <Input
                    value={item.label}
                    onChange={(e) => updateItem(index, { label: e.target.value })}
                    placeholder="Item label..."
                  />
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label className="text-xs">Value: {item.value}%</Label>
                    </div>
                    <Slider
                      value={[item.value]}
                      onValueChange={([v]) => updateItem(index, { value: v })}
                      min={0}
                      max={100}
                      step={1}
                    />
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => removeItem(index)}
                  className="text-destructive hover:text-destructive hover:bg-destructive/10"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
