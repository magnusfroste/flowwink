import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { ShoppingCart } from 'lucide-react';
import type { CartBlockData } from '@/components/public/blocks/CartBlock';

interface CartBlockEditorProps {
  data: CartBlockData;
  onChange: (data: CartBlockData) => void;
  isEditing: boolean;
}

export function CartBlockEditor({ data, onChange, isEditing }: CartBlockEditorProps) {
  const updateData = (updates: Partial<CartBlockData>) => {
    onChange({ ...data, ...updates });
  };

  // Preview for non-editing mode
  if (!isEditing) {
    return (
      <div className="p-6 text-center border-2 border-dashed rounded-lg bg-muted/30">
        <ShoppingCart className="h-12 w-12 mx-auto text-muted-foreground mb-3" />
        <h3 className="font-medium text-lg">{data.title || 'Varukorg'}</h3>
        <p className="text-sm text-muted-foreground mt-1">
          Visar besökarens varukorg
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-4 border rounded-lg bg-card">
      <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
        <ShoppingCart className="h-4 w-4" />
        Cart Block - Settings
      </div>

      {/* Title */}
      <div className="space-y-2">
        <Label>Title</Label>
        <Input
          value={data.title || ''}
          onChange={(e) => updateData({ title: e.target.value })}
          placeholder="Your cart"
        />
      </div>

      {/* Empty Message */}
      <div className="space-y-2">
        <Label>Empty cart message</Label>
        <Input
          value={data.emptyMessage || ''}
          onChange={(e) => updateData({ emptyMessage: e.target.value })}
          placeholder="Your cart is empty"
        />
      </div>

      {/* Checkout Settings */}
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Checkout button text</Label>
          <Input
            value={data.checkoutButtonText || ''}
            onChange={(e) => updateData({ checkoutButtonText: e.target.value })}
            placeholder="Go to checkout"
          />
        </div>
        <div className="space-y-2">
          <Label>Checkout URL</Label>
          <Input
            value={data.checkoutUrl || ''}
            onChange={(e) => updateData({ checkoutUrl: e.target.value })}
            placeholder="/checkout"
          />
        </div>
      </div>

      {/* Style */}
      <div className="space-y-2">
        <Label>Style</Label>
        <Select
          value={data.variant || 'default'}
          onValueChange={(value: 'default' | 'compact' | 'minimal') => updateData({ variant: value })}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="default">Standard</SelectItem>
            <SelectItem value="compact">Compact</SelectItem>
            <SelectItem value="minimal">Minimal</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Continue Shopping */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <Label>Show "Continue Shopping"</Label>
            <p className="text-xs text-muted-foreground">Button to return to shopping</p>
          </div>
          <Switch
            checked={data.showContinueShopping !== false}
            onCheckedChange={(checked) => updateData({ showContinueShopping: checked })}
          />
        </div>

        {data.showContinueShopping !== false && (
          <div className="space-y-2">
            <Label>Continue Shopping URL</Label>
            <Input
              value={data.continueShoppingUrl || ''}
              onChange={(e) => updateData({ continueShoppingUrl: e.target.value })}
              placeholder="/"
            />
          </div>
        )}
      </div>
    </div>
  );
}
