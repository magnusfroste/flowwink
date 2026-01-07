import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card } from '@/components/ui/card';
import { useBlockEditor } from '@/hooks/useBlockEditor';
import { Plus, Trash2, MoveHorizontal, GripVertical } from 'lucide-react';
import type { MarqueeBlockData, MarqueeItem } from '@/components/public/blocks/MarqueeBlock';

interface MarqueeBlockEditorProps {
  data: MarqueeBlockData;
  onChange: (data: MarqueeBlockData) => void;
  isEditing: boolean;
}

export function MarqueeBlockEditor({ data, onChange, isEditing }: MarqueeBlockEditorProps) {
  const { data: blockData, updateField } = useBlockEditor({
    initialData: data,
    onChange,
  });

  const addItem = () => {
    const newItem: MarqueeItem = {
      id: `item-${Date.now()}`,
      text: 'New item',
    };
    updateField('items', [...(blockData.items || []), newItem]);
  };

  const updateItem = (index: number, field: keyof MarqueeItem, value: string) => {
    const newItems = [...(blockData.items || [])];
    newItems[index] = { ...newItems[index], [field]: value };
    updateField('items', newItems);
  };

  const deleteItem = (index: number) => {
    const newItems = (blockData.items || []).filter((_, i) => i !== index);
    updateField('items', newItems);
  };

  if (isEditing) {
    return (
      <div className="space-y-4 p-4 bg-muted/50 rounded-lg">
        <div className="grid grid-cols-3 gap-4">
          <div className="space-y-2">
            <Label>Speed</Label>
            <Select
              value={blockData.speed || 'normal'}
              onValueChange={(value) => updateField('speed', value as 'slow' | 'normal' | 'fast')}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="slow">Slow</SelectItem>
                <SelectItem value="normal">Normal</SelectItem>
                <SelectItem value="fast">Fast</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Direction</Label>
            <Select
              value={blockData.direction || 'left'}
              onValueChange={(value) => updateField('direction', value as 'left' | 'right')}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="left">Left</SelectItem>
                <SelectItem value="right">Right</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Variant</Label>
            <Select
              value={blockData.variant || 'default'}
              onValueChange={(value) => updateField('variant', value as 'default' | 'gradient' | 'outlined')}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="default">Default</SelectItem>
                <SelectItem value="gradient">Gradient</SelectItem>
                <SelectItem value="outlined">Outlined</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>Separator</Label>
            <Input
              value={blockData.separator || '•'}
              onChange={(e) => updateField('separator', e.target.value)}
              placeholder="•"
            />
          </div>
          <div className="flex items-center justify-between pt-6">
            <Label htmlFor="pause-hover">Pause on hover</Label>
            <Switch
              id="pause-hover"
              checked={blockData.pauseOnHover ?? true}
              onCheckedChange={(checked) => updateField('pauseOnHover', checked)}
            />
          </div>
        </div>

        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <Label>Items</Label>
            <Button variant="outline" size="sm" onClick={addItem}>
              <Plus className="h-4 w-4 mr-1" />
              Add Item
            </Button>
          </div>

          {(blockData.items || []).map((item, index) => (
            <Card key={item.id} className="p-3">
              <div className="flex items-center gap-3">
                <GripVertical className="h-4 w-4 text-muted-foreground/50" />
                <Input
                  value={item.icon || ''}
                  onChange={(e) => updateItem(index, 'icon', e.target.value)}
                  placeholder="🎉"
                  className="w-16"
                />
                <Input
                  value={item.text}
                  onChange={(e) => updateItem(index, 'text', e.target.value)}
                  placeholder="Marquee text"
                  className="flex-1"
                />
                <Button variant="ghost" size="icon" onClick={() => deleteItem(index)}>
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              </div>
            </Card>
          ))}

          {(!blockData.items || blockData.items.length === 0) && (
            <div className="text-center py-6 text-muted-foreground border-2 border-dashed rounded-lg">
              No items yet. Click "Add Item" to create one.
            </div>
          )}
        </div>
      </div>
    );
  }

  // Preview mode
  if (!blockData.items || blockData.items.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-24 bg-muted/50 rounded-lg border-2 border-dashed border-muted-foreground/30">
        <MoveHorizontal className="h-8 w-8 text-muted-foreground/50 mb-2" />
        <p className="text-sm text-muted-foreground">No marquee items</p>
      </div>
    );
  }

  return (
    <div className="rounded-lg border bg-muted/30 py-3 px-4 overflow-hidden">
      <div className="flex items-center gap-4 whitespace-nowrap">
        {blockData.items.slice(0, 5).map((item) => (
          <span key={item.id} className="flex items-center gap-2">
            {item.icon && <span>{item.icon}</span>}
            <span>{item.text}</span>
            <span className="text-muted-foreground">•</span>
          </span>
        ))}
        {blockData.items.length > 5 && (
          <span className="text-muted-foreground">+{blockData.items.length - 5} more</span>
        )}
      </div>
    </div>
  );
}
