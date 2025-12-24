import { useState } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Plus, Trash2, GripVertical, Check, X } from 'lucide-react';
import { ComparisonBlockData, ComparisonProduct, ComparisonFeature } from '@/types/cms';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

interface ComparisonBlockEditorProps {
  data: ComparisonBlockData;
  onChange: (data: ComparisonBlockData) => void;
  isEditing: boolean;
}

export function ComparisonBlockEditor({ data, onChange, isEditing }: ComparisonBlockEditorProps) {
  const [activeTab, setActiveTab] = useState('products');

  const products = data.products || [];
  const features = data.features || [];
  const variant = data.variant || 'default';
  const showPrices = data.showPrices ?? true;
  const showButtons = data.showButtons ?? true;
  const stickyHeader = data.stickyHeader ?? false;

  const addProduct = () => {
    const newProduct: ComparisonProduct = {
      id: `product-${Date.now()}`,
      name: 'New Plan',
      price: '$0',
      period: '/month',
      description: '',
      highlighted: false,
      buttonText: 'Get Started',
      buttonUrl: '#',
    };
    // Add empty value for each existing feature
    const updatedFeatures = features.map((f) => ({
      ...f,
      values: [...f.values, ''],
    }));
    onChange({ ...data, products: [...products, newProduct], features: updatedFeatures });
  };

  const updateProduct = (id: string, updates: Partial<ComparisonProduct>) => {
    onChange({
      ...data,
      products: products.map((p) => (p.id === id ? { ...p, ...updates } : p)),
    });
  };

  const removeProduct = (id: string) => {
    const index = products.findIndex((p) => p.id === id);
    if (index === -1) return;
    // Remove corresponding value from each feature
    const updatedFeatures = features.map((f) => ({
      ...f,
      values: f.values.filter((_, i) => i !== index),
    }));
    onChange({
      ...data,
      products: products.filter((p) => p.id !== id),
      features: updatedFeatures,
    });
  };

  const addFeature = () => {
    const newFeature: ComparisonFeature = {
      id: `feature-${Date.now()}`,
      name: 'New Feature',
      values: products.map(() => true), // Default to true/included for all products
    };
    onChange({ ...data, features: [...features, newFeature] });
  };

  const updateFeature = (id: string, updates: Partial<ComparisonFeature>) => {
    onChange({
      ...data,
      features: features.map((f) => (f.id === id ? { ...f, ...updates } : f)),
    });
  };

  const removeFeature = (id: string) => {
    onChange({ ...data, features: features.filter((f) => f.id !== id) });
  };

  const updateFeatureValue = (featureId: string, productIndex: number, value: boolean | string) => {
    onChange({
      ...data,
      features: features.map((f) => {
        if (f.id !== featureId) return f;
        const newValues = [...f.values];
        newValues[productIndex] = value;
        return { ...f, values: newValues };
      }),
    });
  };

  if (!isEditing) {
    return (
      <div className="p-6 bg-muted/30 rounded-lg">
        <div className="text-center mb-4">
          {data.title && <h3 className="text-xl font-semibold">{data.title}</h3>}
          {data.subtitle && <p className="text-muted-foreground mt-1">{data.subtitle}</p>}
        </div>
        <div className="text-center text-muted-foreground">
          {products.length} plans × {features.length} features
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-4">
      {/* Header Settings */}
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Title</Label>
          <Input
            value={data.title || ''}
            onChange={(e) => onChange({ ...data, title: e.target.value })}
            placeholder="Compare Plans"
          />
        </div>
        <div className="space-y-2">
          <Label>Subtitle</Label>
          <Input
            value={data.subtitle || ''}
            onChange={(e) => onChange({ ...data, subtitle: e.target.value })}
            placeholder="Find the perfect plan for you"
          />
        </div>
      </div>

      {/* Layout Settings */}
      <div className="grid grid-cols-4 gap-4">
        <div className="space-y-2">
          <Label>Variant</Label>
          <Select value={variant} onValueChange={(v) => onChange({ ...data, variant: v as 'default' | 'striped' | 'bordered' })}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="default">Default</SelectItem>
              <SelectItem value="striped">Striped</SelectItem>
              <SelectItem value="bordered">Bordered</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-center gap-2 pt-6">
          <Switch checked={showPrices} onCheckedChange={(v) => onChange({ ...data, showPrices: v })} />
          <Label>Show Prices</Label>
        </div>
        <div className="flex items-center gap-2 pt-6">
          <Switch checked={showButtons} onCheckedChange={(v) => onChange({ ...data, showButtons: v })} />
          <Label>Show Buttons</Label>
        </div>
        <div className="flex items-center gap-2 pt-6">
          <Switch checked={stickyHeader} onCheckedChange={(v) => onChange({ ...data, stickyHeader: v })} />
          <Label>Sticky Header</Label>
        </div>
      </div>

      {/* Products & Features Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="products">Products/Plans ({products.length})</TabsTrigger>
          <TabsTrigger value="features">Features ({features.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="products" className="space-y-3 mt-4">
          <div className="flex justify-end">
            <Button variant="outline" size="sm" onClick={addProduct}>
              <Plus className="h-4 w-4 mr-1" />
              Add Plan
            </Button>
          </div>

          {products.length === 0 && (
            <p className="text-sm text-muted-foreground py-4 text-center border rounded-lg bg-muted/30">
              No plans yet. Click "Add Plan" to get started.
            </p>
          )}

          <div className="space-y-2">
            {products.map((product) => (
              <Card key={product.id}>
                <CardHeader className="p-3">
                  <div className="flex items-center gap-3">
                    <GripVertical className="h-4 w-4 text-muted-foreground" />
                    <CardTitle className="text-sm font-medium flex-1">{product.name}</CardTitle>
                    {product.highlighted && (
                      <span className="text-xs bg-primary text-primary-foreground px-2 py-0.5 rounded">Featured</span>
                    )}
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-destructive"
                      onClick={() => removeProduct(product.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </CardHeader>
                <CardContent className="p-3 pt-0 space-y-3">
                  <div className="grid grid-cols-3 gap-3">
                    <div className="space-y-1">
                      <Label className="text-xs">Name</Label>
                      <Input
                        value={product.name}
                        onChange={(e) => updateProduct(product.id, { name: e.target.value })}
                        className="h-8"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Price</Label>
                      <Input
                        value={product.price || ''}
                        onChange={(e) => updateProduct(product.id, { price: e.target.value })}
                        placeholder="$29"
                        className="h-8"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Period</Label>
                      <Input
                        value={product.period || ''}
                        onChange={(e) => updateProduct(product.id, { period: e.target.value })}
                        placeholder="/month"
                        className="h-8"
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <Label className="text-xs">Button Text</Label>
                      <Input
                        value={product.buttonText || ''}
                        onChange={(e) => updateProduct(product.id, { buttonText: e.target.value })}
                        className="h-8"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Button URL</Label>
                      <Input
                        value={product.buttonUrl || ''}
                        onChange={(e) => updateProduct(product.id, { buttonUrl: e.target.value })}
                        className="h-8"
                      />
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Switch
                      checked={product.highlighted || false}
                      onCheckedChange={(v) => updateProduct(product.id, { highlighted: v })}
                    />
                    <Label className="text-xs">Highlight this plan</Label>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="features" className="space-y-3 mt-4">
          <div className="flex justify-end">
            <Button variant="outline" size="sm" onClick={addFeature} disabled={products.length === 0}>
              <Plus className="h-4 w-4 mr-1" />
              Add Feature
            </Button>
          </div>

          {products.length === 0 && (
            <p className="text-sm text-muted-foreground py-4 text-center border rounded-lg bg-muted/30">
              Add plans first before adding features.
            </p>
          )}

          {products.length > 0 && features.length === 0 && (
            <p className="text-sm text-muted-foreground py-4 text-center border rounded-lg bg-muted/30">
              No features yet. Click "Add Feature" to get started.
            </p>
          )}

          <div className="space-y-2">
            {features.map((feature) => (
              <Card key={feature.id}>
                <CardContent className="p-3">
                  <div className="flex items-start gap-3">
                    <GripVertical className="h-4 w-4 text-muted-foreground mt-2" />
                    <div className="flex-1 space-y-2">
                      <Input
                        value={feature.name}
                        onChange={(e) => updateFeature(feature.id, { name: e.target.value })}
                        placeholder="Feature name"
                        className="h-8"
                      />
                      <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${products.length}, 1fr)` }}>
                        {products.map((product, idx) => (
                          <div key={product.id} className="space-y-1">
                            <Label className="text-xs text-muted-foreground truncate block">{product.name}</Label>
                            <div className="flex items-center gap-1">
                              <Button
                                variant={feature.values[idx] === true ? 'default' : 'outline'}
                                size="icon"
                                className="h-7 w-7"
                                onClick={() => updateFeatureValue(feature.id, idx, true)}
                              >
                                <Check className="h-3 w-3" />
                              </Button>
                              <Button
                                variant={feature.values[idx] === false ? 'destructive' : 'outline'}
                                size="icon"
                                className="h-7 w-7"
                                onClick={() => updateFeatureValue(feature.id, idx, false)}
                              >
                                <X className="h-3 w-3" />
                              </Button>
                              <Input
                                value={typeof feature.values[idx] === 'string' ? feature.values[idx] : ''}
                                onChange={(e) => updateFeatureValue(feature.id, idx, e.target.value || true)}
                                placeholder="Custom"
                                className="h-7 text-xs flex-1"
                              />
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-destructive"
                      onClick={() => removeFeature(feature.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
