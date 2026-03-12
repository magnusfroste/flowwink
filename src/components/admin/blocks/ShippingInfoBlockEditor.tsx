import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Truck, Plus, Trash2 } from 'lucide-react';
import type { ShippingInfoBlockData, ShippingInfoItem } from '@/components/public/blocks/ShippingInfoBlock';

const ICON_OPTIONS = [
  { value: 'truck', label: '🚚 Shipping' },
  { value: 'rotate-ccw', label: '↩️ Returns' },
  { value: 'clock', label: '🕐 Time' },
  { value: 'map-pin', label: '📍 Location' },
  { value: 'help', label: '❓ Help' },
];

const DEFAULT_ITEMS: ShippingInfoItem[] = [
  { icon: 'truck', title: 'Standard Shipping', description: '3–5 business days. Free on orders over $50.' },
  { icon: 'clock', title: 'Express Shipping', description: '1–2 business days. $9.99 flat rate.' },
  { icon: 'rotate-ccw', title: 'Returns', description: 'Free returns within 30 days.' },
];

interface ShippingInfoBlockEditorProps {
  data: ShippingInfoBlockData;
  onChange: (data: ShippingInfoBlockData) => void;
  isEditing: boolean;
}

export function ShippingInfoBlockEditor({ data, onChange, isEditing }: ShippingInfoBlockEditorProps) {
  const items = data.items?.length ? data.items : DEFAULT_ITEMS;

  const updateData = (updates: Partial<ShippingInfoBlockData>) => {
    onChange({ ...data, ...updates });
  };

  const updateItem = (index: number, updates: Partial<ShippingInfoItem>) => {
    const newItems = [...items];
    newItems[index] = { ...newItems[index], ...updates };
    updateData({ items: newItems });
  };

  const addItem = () => {
    updateData({ items: [...items, { icon: 'truck', title: 'New item', description: 'Description...' }] });
  };

  const removeItem = (index: number) => {
    updateData({ items: items.filter((_, i) => i !== index) });
  };

  if (!isEditing) {
    return (
      <div className="p-4 text-center border-2 border-dashed rounded-lg bg-muted/30">
        <Truck className="h-10 w-10 mx-auto text-muted-foreground mb-2" />
        <h3 className="font-medium">Shipping Info</h3>
        <p className="text-xs text-muted-foreground">{items.length} items</p>
      </div>
    );
  }

  return (
    <div className="space-y-5 p-4 border rounded-lg bg-card">
      <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
        <Truck className="h-4 w-4" />
        Shipping Info - Settings
      </div>

      <div className="space-y-2">
        <Label>Title</Label>
        <Input
          value={data.title || ''}
          onChange={(e) => updateData({ title: e.target.value })}
          placeholder="Shipping & Delivery"
        />
      </div>

      <div className="space-y-2">
        <Label>Layout</Label>
        <Select
          value={data.variant || 'list'}
          onValueChange={(v: 'list' | 'grid' | 'compact') => updateData({ variant: v })}
        >
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="list">List</SelectItem>
            <SelectItem value="grid">Grid</SelectItem>
            <SelectItem value="compact">Compact</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-3">
        <Label>Items</Label>
        {items.map((item, i) => (
          <div key={i} className="space-y-2 p-3 rounded-md border border-border/50 bg-muted/20">
            <div className="flex items-center gap-2">
              <Select
                value={item.icon || 'truck'}
                onValueChange={(v) => updateItem(i, { icon: v })}
              >
                <SelectTrigger className="w-32">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ICON_OPTIONS.map(opt => (
                    <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Input
                value={item.title}
                onChange={(e) => updateItem(i, { title: e.target.value })}
                placeholder="Title"
                className="flex-1"
              />
              <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={() => removeItem(i)}>
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
            <Textarea
              value={item.description}
              onChange={(e) => updateItem(i, { description: e.target.value })}
              placeholder="Description..."
              rows={1}
              className="text-sm"
            />
          </div>
        ))}
        {items.length < 8 && (
          <Button variant="outline" size="sm" onClick={addItem}>
            <Plus className="h-3.5 w-3.5 mr-1" /> Add item
          </Button>
        )}
      </div>
    </div>
  );
}
