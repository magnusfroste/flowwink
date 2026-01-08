import { useState } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Card } from '@/components/ui/card';
import { PricingBlockData, PricingTier } from '@/types/cms';
import { CreditCard, Plus, Trash2, GripVertical, Star, X, Package } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useProducts, formatPrice } from '@/hooks/useProducts';

interface PricingBlockEditorProps {
  data: PricingBlockData;
  onChange: (data: PricingBlockData) => void;
  isEditing: boolean;
}

export function PricingBlockEditor({ data, onChange, isEditing }: PricingBlockEditorProps) {
  const [expandedTier, setExpandedTier] = useState<string | null>(null);
  const { data: products } = useProducts({ activeOnly: true });

  const updateData = (updates: Partial<PricingBlockData>) => {
    onChange({ ...data, ...updates });
  };

  const addTier = () => {
    const newTier: PricingTier = {
      id: `tier-${Date.now()}`,
      name: 'Ny plan',
      price: '999 kr',
      period: '/månad',
      description: 'Perfekt för att komma igång',
      features: ['Funktion 1', 'Funktion 2', 'Funktion 3'],
      buttonText: 'Beställ',
      buttonUrl: '/checkout',
      highlighted: false,
    };
    updateData({ tiers: [...(data.tiers || []), newTier] });
    setExpandedTier(newTier.id);
  };

  const updateTier = (tierId: string, updates: Partial<PricingTier>) => {
    updateData({
      tiers: (data.tiers || []).map(tier =>
        tier.id === tierId ? { ...tier, ...updates } : tier
      ),
    });
  };

  const removeTier = (tierId: string) => {
    updateData({
      tiers: (data.tiers || []).filter(tier => tier.id !== tierId),
    });
  };

  const addFeature = (tierId: string) => {
    const tier = data.tiers?.find(t => t.id === tierId);
    if (tier) {
      updateTier(tierId, { features: [...(tier.features || []), 'New feature'] });
    }
  };

  const updateFeature = (tierId: string, index: number, value: string) => {
    const tier = data.tiers?.find(t => t.id === tierId);
    if (tier) {
      const features = [...(tier.features || [])];
      features[index] = value;
      updateTier(tierId, { features });
    }
  };

  const removeFeature = (tierId: string, index: number) => {
    const tier = data.tiers?.find(t => t.id === tierId);
    if (tier) {
      const features = [...(tier.features || [])];
      features.splice(index, 1);
      updateTier(tierId, { features });
    }
  };

  // Preview for non-editing mode
  if (!isEditing) {
    const tiers = data.tiers || [];
    return (
      <div className="p-6 text-center border-2 border-dashed rounded-lg bg-muted/30">
        <CreditCard className="h-12 w-12 mx-auto text-muted-foreground mb-3" />
        <h3 className="font-medium text-lg">{data.title || 'Pricing'}</h3>
        <p className="text-sm text-muted-foreground mt-1">
          {data.useProducts 
            ? `Visar produkter från databasen${data.productType && data.productType !== 'all' ? ` (${data.productType === 'recurring' ? 'prenumerationer' : 'engångskostnader'})` : ''}`
            : `${tiers.length} prisplan${tiers.length !== 1 ? 'er' : ''}`
          }
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-4 border rounded-lg bg-card">
      <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
        <CreditCard className="h-4 w-4" />
        Pricing Block Settings
      </div>

      {/* Header Settings */}
      <div className="space-y-4">
        <div className="space-y-2">
          <Label>Title</Label>
          <Input
            value={data.title || ''}
            onChange={(e) => updateData({ title: e.target.value })}
            placeholder="Choose Your Plan"
          />
        </div>

        <div className="space-y-2">
          <Label>Subtitle</Label>
          <Textarea
            value={data.subtitle || ''}
            onChange={(e) => updateData({ subtitle: e.target.value })}
            placeholder="Select the perfect plan for your needs"
            rows={2}
          />
      </div>

      {/* Use Products Mode */}
      <Card className="p-4 bg-muted/30">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Package className="h-4 w-4 text-muted-foreground" />
            <div>
              <Label>Använd produkter från databasen</Label>
              <p className="text-xs text-muted-foreground">
                Hämtar produkter automatiskt och kopplar till varukorgen
              </p>
            </div>
          </div>
          <Switch
            checked={data.useProducts || false}
            onCheckedChange={(checked) => updateData({ useProducts: checked })}
          />
        </div>

        {data.useProducts && (
          <div className="space-y-2 pt-2 border-t">
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
                <SelectItem value="recurring">Endast prenumerationer</SelectItem>
                <SelectItem value="one_time">Endast engångskostnader</SelectItem>
              </SelectContent>
            </Select>
            
            {products && products.length > 0 && (
              <div className="mt-3 p-3 bg-background rounded border">
                <p className="text-xs text-muted-foreground mb-2">Produkter som kommer visas:</p>
                <div className="space-y-1">
                  {products
                    .filter(p => !data.productType || data.productType === 'all' || p.type === data.productType)
                    .map(p => (
                      <div key={p.id} className="flex items-center justify-between text-sm">
                        <span>{p.name}</span>
                        <span className="text-muted-foreground">
                          {formatPrice(p.price_cents, p.currency)}
                          {p.type === 'recurring' ? '/mån' : ''}
                        </span>
                      </div>
                    ))
                  }
                </div>
              </div>
            )}
          </div>
        )}
      </Card>
      </div>

      {/* Layout Settings */}
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Columns</Label>
          <Select
            value={String(data.columns || 3)}
            onValueChange={(value) => updateData({ columns: parseInt(value) as 2 | 3 | 4 })}
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

        <div className="space-y-2">
          <Label>Style</Label>
          <Select
            value={data.variant || 'cards'}
            onValueChange={(value: 'default' | 'cards' | 'compact') => updateData({ variant: value })}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="default">Default</SelectItem>
              <SelectItem value="cards">Cards with shadow</SelectItem>
              <SelectItem value="compact">Compact</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Tiers */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <Label>Pricing Tiers</Label>
          <Button variant="outline" size="sm" onClick={addTier}>
            <Plus className="h-4 w-4 mr-1" />
            Add Tier
          </Button>
        </div>

        <div className="space-y-3">
          {(data.tiers || []).map((tier, index) => (
            <Card
              key={tier.id}
              className={cn(
                'p-4 transition-all',
                tier.highlighted && 'ring-2 ring-primary',
                expandedTier === tier.id && 'bg-muted/30'
              )}
            >
              <div className="flex items-center gap-3">
                <GripVertical className="h-4 w-4 text-muted-foreground cursor-grab" />
                <div className="flex-1 min-w-0">
                  <button
                    type="button"
                    onClick={() => setExpandedTier(expandedTier === tier.id ? null : tier.id)}
                    className="w-full text-left"
                  >
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{tier.name}</span>
                      <span className="text-muted-foreground">{tier.price}{tier.period}</span>
                      {tier.highlighted && (
                        <Star className="h-4 w-4 text-yellow-500 fill-yellow-500" />
                      )}
                    </div>
                  </button>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-destructive hover:text-destructive"
                  onClick={() => removeTier(tier.id)}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>

              {expandedTier === tier.id && (
                <div className="mt-4 pt-4 border-t space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Plan Name</Label>
                      <Input
                        value={tier.name}
                        onChange={(e) => updateTier(tier.id, { name: e.target.value })}
                        placeholder="Pro"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Badge (optional)</Label>
                      <Input
                        value={tier.badge || ''}
                        onChange={(e) => updateTier(tier.id, { badge: e.target.value })}
                        placeholder="Popular"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Price</Label>
                      <Input
                        value={tier.price}
                        onChange={(e) => updateTier(tier.id, { price: e.target.value })}
                        placeholder="$99"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Period</Label>
                      <Input
                        value={tier.period || ''}
                        onChange={(e) => updateTier(tier.id, { period: e.target.value })}
                        placeholder="/month"
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label>Description</Label>
                    <Input
                      value={tier.description || ''}
                      onChange={(e) => updateTier(tier.id, { description: e.target.value })}
                      placeholder="Perfect for growing businesses"
                    />
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label>Features</Label>
                      <Button variant="ghost" size="sm" onClick={() => addFeature(tier.id)}>
                        <Plus className="h-3 w-3 mr-1" />
                        Add
                      </Button>
                    </div>
                    <div className="space-y-2">
                      {(tier.features || []).map((feature, fIndex) => (
                        <div key={fIndex} className="flex items-center gap-2">
                          <Input
                            value={feature}
                            onChange={(e) => updateFeature(tier.id, fIndex, e.target.value)}
                            placeholder="Feature description"
                          />
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 shrink-0"
                            onClick={() => removeFeature(tier.id, fIndex)}
                          >
                            <X className="h-4 w-4" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Product Link */}
                  <div className="space-y-2 p-3 bg-muted/50 rounded-lg">
                    <Label className="flex items-center gap-2">
                      <Package className="h-4 w-4" />
                      Koppla till produkt (för varukorg)
                    </Label>
                    <Select
                      value={tier.productId || 'none'}
                      onValueChange={(value) => updateTier(tier.id, { productId: value === 'none' ? undefined : value })}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Välj produkt..." />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">No connection (use URL)</SelectItem>
                        {products?.map(p => (
                          <SelectItem key={p.id} value={p.id}>
                            {p.name} - {formatPrice(p.price_cents, p.currency)}{p.type === 'recurring' ? '/mån' : ''}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-muted-foreground">
                      Om en produkt är kopplad läggs den till i varukorgen vid klick
                    </p>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Button text</Label>
                      <Input
                        value={tier.buttonText || ''}
                        onChange={(e) => updateTier(tier.id, { buttonText: e.target.value })}
                        placeholder="Beställ"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>URL (if no product)</Label>
                      <Input
                        value={tier.buttonUrl || ''}
                        onChange={(e) => updateTier(tier.id, { buttonUrl: e.target.value })}
                        placeholder="/checkout"
                        disabled={!!tier.productId}
                      />
                    </div>
                  </div>

                  <div className="flex items-center justify-between pt-2">
                    <div className="space-y-0.5">
                      <Label>Highlight this tier</Label>
                      <p className="text-xs text-muted-foreground">Make it stand out</p>
                    </div>
                    <Switch
                      checked={tier.highlighted || false}
                      onCheckedChange={(checked) => updateTier(tier.id, { highlighted: checked })}
                    />
                  </div>
                </div>
              )}
            </Card>
          ))}

          {(data.tiers || []).length === 0 && (
            <div className="text-center py-8 border-2 border-dashed rounded-lg bg-muted/30">
              <p className="text-muted-foreground mb-2">No pricing tiers yet</p>
              <Button variant="outline" size="sm" onClick={addTier}>
                <Plus className="h-4 w-4 mr-1" />
                Add your first tier
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
