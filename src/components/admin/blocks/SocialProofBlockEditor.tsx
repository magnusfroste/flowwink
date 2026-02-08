import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Plus, Trash2, GripVertical, Users, Star, Activity, TrendingUp, Heart, Eye, MessageCircle, ShoppingCart } from 'lucide-react';
import type { SocialProofBlockData, SocialProofItem } from '@/components/public/blocks/SocialProofBlock';

interface SocialProofBlockEditorProps {
  data: SocialProofBlockData;
  onChange: (data: SocialProofBlockData) => void;
  isEditing: boolean;
}

const ICON_OPTIONS = [
  { value: 'users', label: 'Users', icon: Users },
  { value: 'star', label: 'Star', icon: Star },
  { value: 'activity', label: 'Activity', icon: Activity },
  { value: 'trending', label: 'Trending', icon: TrendingUp },
  { value: 'heart', label: 'Heart', icon: Heart },
  { value: 'eye', label: 'Eye', icon: Eye },
  { value: 'message', label: 'Message', icon: MessageCircle },
  { value: 'cart', label: 'Cart', icon: ShoppingCart },
];

const DEFAULT_ITEM: Omit<SocialProofItem, 'id'> = {
  type: 'counter',
  icon: 'users',
  label: 'Happy Customers',
  value: '10,000',
  suffix: '+',
};

export function SocialProofBlockEditor({ data, onChange, isEditing }: SocialProofBlockEditorProps) {
  const items = data.items || [];

  const handleAddItem = () => {
    onChange({
      ...data,
      items: [
        ...items,
        { ...DEFAULT_ITEM, id: `item-${Date.now()}` },
      ],
    });
  };

  const handleUpdateItem = (index: number, updates: Partial<SocialProofItem>) => {
    const updatedItems = [...items];
    updatedItems[index] = { ...updatedItems[index], ...updates };
    onChange({ ...data, items: updatedItems });
  };

  const handleRemoveItem = (index: number) => {
    onChange({
      ...data,
      items: items.filter((_, i) => i !== index),
    });
  };

  if (!isEditing) {
    if (items.length === 0) {
      return (
        <div className="p-6 text-center border-2 border-dashed rounded-lg bg-muted/30">
          <Users className="h-10 w-10 mx-auto text-muted-foreground mb-2" />
          <p className="text-sm text-muted-foreground">No social proof items added yet</p>
        </div>
      );
    }

    return (
      <div className="py-6">
        {data.title && <h3 className="text-xl font-bold text-center mb-4">{data.title}</h3>}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {items.slice(0, 4).map((item, i) => {
            const IconComp = ICON_OPTIONS.find(o => o.value === item.icon)?.icon || Users;
            return (
              <div key={item.id || i} className="text-center p-3 rounded-lg bg-card border">
                <IconComp className="h-5 w-5 mx-auto text-accent-foreground mb-1" />
                <div className="text-lg font-bold">
                  {item.prefix}{item.value}{item.suffix}
                </div>
                <p className="text-[11px] text-muted-foreground">{item.label}</p>
              </div>
            );
          })}
        </div>
        {items.length > 4 && (
          <p className="text-xs text-muted-foreground text-center mt-2">+{items.length - 4} more</p>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-6 p-4 bg-muted/30 rounded-lg">
      {/* Basic settings */}
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Title</Label>
          <Input
            value={data.title || ''}
            onChange={(e) => onChange({ ...data, title: e.target.value })}
            placeholder="Social Proof Title"
          />
        </div>
        <div className="space-y-2">
          <Label>Subtitle</Label>
          <Input
            value={data.subtitle || ''}
            onChange={(e) => onChange({ ...data, subtitle: e.target.value })}
            placeholder="Optional subtitle"
          />
        </div>
      </div>

      {/* Variant and Layout */}
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Variant</Label>
          <Select
            value={data.variant || 'default'}
            onValueChange={(value) => onChange({ ...data, variant: value as SocialProofBlockData['variant'] })}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="default">Default</SelectItem>
              <SelectItem value="cards">Cards</SelectItem>
              <SelectItem value="minimal">Minimal</SelectItem>
              <SelectItem value="banner">Banner</SelectItem>
              <SelectItem value="floating">Floating</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label>Layout</Label>
          <Select
            value={data.layout || 'horizontal'}
            onValueChange={(value) => onChange({ ...data, layout: value as SocialProofBlockData['layout'] })}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="horizontal">Horizontal</SelectItem>
              <SelectItem value="vertical">Vertical</SelectItem>
              <SelectItem value="grid">Grid</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Size and Columns */}
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Size</Label>
          <Select
            value={data.size || 'md'}
            onValueChange={(value) => onChange({ ...data, size: value as SocialProofBlockData['size'] })}
          >
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
        {data.layout === 'grid' && (
          <div className="space-y-2">
            <Label>Columns</Label>
            <Select
              value={String(data.columns || 4)}
              onValueChange={(value) => onChange({ ...data, columns: Number(value) as 2 | 3 | 4 })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="2">2 Columns</SelectItem>
                <SelectItem value="3">3 Columns</SelectItem>
                <SelectItem value="4">4 Columns</SelectItem>
              </SelectContent>
            </Select>
          </div>
        )}
      </div>

      {/* Options */}
      <div className="grid grid-cols-2 gap-4">
        <div className="flex items-center gap-2">
          <Switch
            checked={data.animated !== false}
            onCheckedChange={(checked) => onChange({ ...data, animated: checked })}
          />
          <Label>Animated counters</Label>
        </div>
        <div className="flex items-center gap-2">
          <Switch
            checked={data.showIcons !== false}
            onCheckedChange={(checked) => onChange({ ...data, showIcons: checked })}
          />
          <Label>Show icons</Label>
        </div>
      </div>

      {/* Live indicator */}
      <div className="space-y-3 border-t pt-4">
        <div className="flex items-center gap-2">
          <Switch
            checked={data.showLiveIndicator || false}
            onCheckedChange={(checked) => onChange({ ...data, showLiveIndicator: checked })}
          />
          <Label>Show live indicator</Label>
        </div>
        {data.showLiveIndicator && (
          <div className="space-y-2">
            <Label>Live text</Label>
            <Input
              value={data.liveText || 'Live'}
              onChange={(e) => onChange({ ...data, liveText: e.target.value })}
              placeholder="Live"
            />
          </div>
        )}
      </div>

      {/* Items */}
      <div className="space-y-3 border-t pt-4">
        <div className="flex items-center justify-between">
          <Label className="text-base font-medium">Proof Items</Label>
          <Button variant="outline" size="sm" onClick={handleAddItem}>
            <Plus className="h-4 w-4 mr-1" />
            Add Item
          </Button>
        </div>

        {items.map((item, index) => (
          <Card key={item.id} className="p-4 space-y-4">
            <div className="flex items-start gap-2">
              <GripVertical className="h-5 w-5 text-muted-foreground cursor-move mt-2" />
              
              <div className="flex-1 space-y-4">
                {/* Type and Icon */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label className="text-xs">Type</Label>
                    <Select
                      value={item.type}
                      onValueChange={(value) => handleUpdateItem(index, { type: value as SocialProofItem['type'] })}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="counter">Counter</SelectItem>
                        <SelectItem value="rating">Rating</SelectItem>
                        <SelectItem value="activity">Activity</SelectItem>
                        <SelectItem value="custom">Custom</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs">Icon</Label>
                    <Select
                      value={item.icon || 'users'}
                      onValueChange={(value) => handleUpdateItem(index, { icon: value as SocialProofItem['icon'] })}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {ICON_OPTIONS.map((option) => (
                          <SelectItem key={option.value} value={option.value}>
                            <div className="flex items-center gap-2">
                              <option.icon className="h-4 w-4" />
                              {option.label}
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {/* Value and Label */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label className="text-xs">Value</Label>
                    <Input
                      value={item.value}
                      onChange={(e) => handleUpdateItem(index, { value: e.target.value })}
                      placeholder="10,000"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs">Label</Label>
                    <Input
                      value={item.label}
                      onChange={(e) => handleUpdateItem(index, { label: e.target.value })}
                      placeholder="Happy Customers"
                    />
                  </div>
                </div>

                {/* Prefix and Suffix */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label className="text-xs">Prefix</Label>
                    <Input
                      value={item.prefix || ''}
                      onChange={(e) => handleUpdateItem(index, { prefix: e.target.value })}
                      placeholder="e.g. $"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs">Suffix</Label>
                    <Input
                      value={item.suffix || ''}
                      onChange={(e) => handleUpdateItem(index, { suffix: e.target.value })}
                      placeholder="e.g. +"
                    />
                  </div>
                </div>

                {/* Rating-specific fields */}
                {item.type === 'rating' && (
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-2">
                      <Label className="text-xs">Rating (1-5)</Label>
                      <Input
                        type="number"
                        min={1}
                        max={5}
                        value={item.rating || 5}
                        onChange={(e) => handleUpdateItem(index, { rating: Number(e.target.value) })}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-xs">Max Rating</Label>
                      <Input
                        type="number"
                        min={1}
                        max={10}
                        value={item.maxRating || 5}
                        onChange={(e) => handleUpdateItem(index, { maxRating: Number(e.target.value) })}
                      />
                    </div>
                  </div>
                )}

                {/* Activity-specific fields */}
                {item.type === 'activity' && (
                  <div className="space-y-2">
                    <Label className="text-xs">Description</Label>
                    <Input
                      value={item.description || ''}
                      onChange={(e) => handleUpdateItem(index, { description: e.target.value })}
                      placeholder="e.g. in the last 24 hours"
                    />
                  </div>
                )}
              </div>

              <Button
                variant="ghost"
                size="icon"
                className="text-destructive hover:text-destructive"
                onClick={() => handleRemoveItem(index)}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          </Card>
        ))}

        {items.length === 0 && (
          <div className="text-center py-8 text-muted-foreground border-2 border-dashed rounded-lg">
            No items yet. Click "Add Item" to get started.
          </div>
        )}
      </div>
    </div>
  );
}
