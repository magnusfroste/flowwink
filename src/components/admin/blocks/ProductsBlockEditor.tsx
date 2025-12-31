import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { ShoppingBag } from 'lucide-react';
import { useProducts } from '@/hooks/useProducts';
import type { ProductsBlockData } from '@/components/public/blocks/ProductsBlock';

interface ProductsBlockEditorProps {
  data: ProductsBlockData;
  onChange: (data: ProductsBlockData) => void;
  isEditing: boolean;
}

export function ProductsBlockEditor({ data, onChange, isEditing }: ProductsBlockEditorProps) {
  const { data: products = [] } = useProducts();

  const updateData = (updates: Partial<ProductsBlockData>) => {
    onChange({ ...data, ...updates });
  };

  const activeProductsCount = products.filter(p => p.is_active).length;

  // Preview for non-editing mode
  if (!isEditing) {
    return (
      <div className="p-6 text-center border-2 border-dashed rounded-lg bg-muted/30">
        <ShoppingBag className="h-12 w-12 mx-auto text-muted-foreground mb-3" />
        <h3 className="font-medium text-lg">{data.title || 'Produkter'}</h3>
        <p className="text-sm text-muted-foreground mt-1">
          {activeProductsCount} aktiv{activeProductsCount !== 1 ? 'a' : ''} produkt{activeProductsCount !== 1 ? 'er' : ''}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-4 border rounded-lg bg-card">
      <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
        <ShoppingBag className="h-4 w-4" />
        Produktblock - Inställningar
      </div>

      {/* Header Settings */}
      <div className="space-y-4">
        <div className="space-y-2">
          <Label>Rubrik</Label>
          <Input
            value={data.title || ''}
            onChange={(e) => updateData({ title: e.target.value })}
            placeholder="Våra produkter"
          />
        </div>

        <div className="space-y-2">
          <Label>Underrubrik</Label>
          <Textarea
            value={data.subtitle || ''}
            onChange={(e) => updateData({ subtitle: e.target.value })}
            placeholder="Utforska vårt sortiment"
            rows={2}
          />
        </div>
      </div>

      {/* Layout Settings */}
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Kolumner</Label>
          <Select
            value={String(data.columns || 3)}
            onValueChange={(value) => updateData({ columns: parseInt(value) as 2 | 3 | 4 })}
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

        <div className="space-y-2">
          <Label>Produkttyp</Label>
          <Select
            value={data.productType || 'all'}
            onValueChange={(value: 'all' | 'one_time' | 'recurring') => updateData({ productType: value })}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Alla produkter</SelectItem>
              <SelectItem value="one_time">Engångsköp</SelectItem>
              <SelectItem value="recurring">Prenumerationer</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Button Text */}
      <div className="space-y-2">
        <Label>Knapptext</Label>
        <Input
          value={data.buttonText || ''}
          onChange={(e) => updateData({ buttonText: e.target.value })}
          placeholder="Lägg i varukorg"
        />
      </div>

      {/* Options */}
      <div className="flex items-center justify-between">
        <div className="space-y-0.5">
          <Label>Visa beskrivning</Label>
          <p className="text-xs text-muted-foreground">Visa produktbeskrivning i kortet</p>
        </div>
        <Switch
          checked={data.showDescription !== false}
          onCheckedChange={(checked) => updateData({ showDescription: checked })}
        />
      </div>

      {/* Info */}
      <div className="text-sm text-muted-foreground bg-muted/50 rounded-lg p-3">
        <p>
          <strong>{activeProductsCount}</strong> aktiv{activeProductsCount !== 1 ? 'a' : ''} produkt{activeProductsCount !== 1 ? 'er' : ''} kommer visas.
        </p>
        <p className="mt-1">
          Hantera produkter under <strong>CRM → Produkter</strong> i sidomenyn.
        </p>
      </div>
    </div>
  );
}
