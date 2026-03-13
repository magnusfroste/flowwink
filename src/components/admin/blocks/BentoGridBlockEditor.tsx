import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Plus, Trash2, GripVertical } from 'lucide-react';
import type { BentoGridBlockData, BentoGridItem } from '@/components/public/blocks/BentoGridBlock';
import { BentoGridBlock } from '@/components/public/blocks/BentoGridBlock';

interface BentoGridBlockEditorProps {
  data: BentoGridBlockData;
  onChange: (data: BentoGridBlockData) => void;
  isEditing: boolean;
}

export function BentoGridBlockEditor({ data, onChange, isEditing }: BentoGridBlockEditorProps) {
  if (!isEditing) {
    return <BentoGridBlock data={data} />;
  }

  const updateItem = (index: number, updates: Partial<BentoGridItem>) => {
    const newItems = [...(data.items || [])];
    newItems[index] = { ...newItems[index], ...updates };
    onChange({ ...data, items: newItems });
  };

  const addItem = () => {
    const newItem: BentoGridItem = {
      id: `bento-${Date.now()}`,
      title: 'New Item',
      description: 'Description goes here',
      icon: 'Zap',
      span: 'normal',
    };
    onChange({ ...data, items: [...(data.items || []), newItem] });
  };

  const removeItem = (index: number) => {
    const newItems = [...(data.items || [])];
    newItems.splice(index, 1);
    onChange({ ...data, items: newItems });
  };

  return (
    <div className="space-y-6 p-4">
      {/* Header Settings */}
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label className="text-xs">Eyebrow</Label>
            <Input
              value={data.eyebrow || ''}
              onChange={(e) => onChange({ ...data, eyebrow: e.target.value })}
              placeholder="e.g. OUR SERVICES"
              className="h-8 text-sm"
            />
          </div>
          <div>
            <Label className="text-xs">Eyebrow Color</Label>
            <Input
              type="color"
              value={data.eyebrowColor || '#6366f1'}
              onChange={(e) => onChange({ ...data, eyebrowColor: e.target.value })}
              className="h-8"
            />
          </div>
        </div>
        <div>
          <Label className="text-xs">Title</Label>
          <Input
            value={data.title || ''}
            onChange={(e) => onChange({ ...data, title: e.target.value })}
            placeholder="Section title"
            className="h-8 text-sm"
          />
        </div>
        <div>
          <Label className="text-xs">Subtitle</Label>
          <Input
            value={data.subtitle || ''}
            onChange={(e) => onChange({ ...data, subtitle: e.target.value })}
            placeholder="Brief description"
            className="h-8 text-sm"
          />
        </div>
      </div>

      {/* Grid Settings */}
      <div className="grid grid-cols-3 gap-3">
        <div>
          <Label className="text-xs">Columns</Label>
          <Select
            value={String(data.columns || 3)}
            onValueChange={(v) => onChange({ ...data, columns: Number(v) as 3 | 4 })}
          >
            <SelectTrigger className="h-8 text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="3">3 Columns</SelectItem>
              <SelectItem value="4">4 Columns</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-xs">Gap</Label>
          <Select
            value={data.gap || 'md'}
            onValueChange={(v) => onChange({ ...data, gap: v as 'sm' | 'md' | 'lg' })}
          >
            <SelectTrigger className="h-8 text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="sm">Small</SelectItem>
              <SelectItem value="md">Medium</SelectItem>
              <SelectItem value="lg">Large</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-xs">Variant</Label>
          <Select
            value={data.variant || 'default'}
            onValueChange={(v) => onChange({ ...data, variant: v as 'default' | 'glass' | 'bordered' })}
          >
            <SelectTrigger className="h-8 text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="default">Default</SelectItem>
              <SelectItem value="glass">Glass</SelectItem>
              <SelectItem value="bordered">Bordered</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="flex items-center justify-between">
        <Label className="text-xs">Staggered Reveal Animation</Label>
        <Switch
          checked={data.staggeredReveal !== false}
          onCheckedChange={(v) => onChange({ ...data, staggeredReveal: v })}
        />
      </div>

      {/* Items */}
      <div>
        <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3 block">
          Grid Items ({(data.items || []).length})
        </Label>
        <Accordion type="single" collapsible className="space-y-2">
          {(data.items || []).map((item, index) => (
            <AccordionItem key={item.id} value={item.id} className="border rounded-lg px-3">
              <AccordionTrigger className="py-2 text-sm hover:no-underline">
                <div className="flex items-center gap-2">
                  <GripVertical className="h-3.5 w-3.5 text-muted-foreground" />
                  <span className="font-medium">{item.title || `Item ${index + 1}`}</span>
                  <span className="text-xs text-muted-foreground">({item.span || 'normal'})</span>
                </div>
              </AccordionTrigger>
              <AccordionContent className="space-y-3 pb-3">
                <div>
                  <Label className="text-xs">Title</Label>
                  <Input
                    value={item.title}
                    onChange={(e) => updateItem(index, { title: e.target.value })}
                    className="h-8 text-sm"
                  />
                </div>
                <div>
                  <Label className="text-xs">Description</Label>
                  <Textarea
                    value={item.description || ''}
                    onChange={(e) => updateItem(index, { description: e.target.value })}
                    className="text-sm min-h-[60px]"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-xs">Icon (Lucide name)</Label>
                    <Input
                      value={item.icon || ''}
                      onChange={(e) => updateItem(index, { icon: e.target.value })}
                      placeholder="e.g. Zap, Star, Shield"
                      className="h-8 text-sm"
                    />
                  </div>
                  <div>
                    <Label className="text-xs">Grid Span</Label>
                    <Select
                      value={item.span || 'normal'}
                      onValueChange={(v) => updateItem(index, { span: v as BentoGridItem['span'] })}
                    >
                      <SelectTrigger className="h-8 text-sm">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="normal">1×1</SelectItem>
                        <SelectItem value="wide">2×1 Wide</SelectItem>
                        <SelectItem value="tall">1×2 Tall</SelectItem>
                        <SelectItem value="large">2×2 Large</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div>
                  <Label className="text-xs">Background Image URL</Label>
                  <Input
                    value={item.image || ''}
                    onChange={(e) => updateItem(index, { image: e.target.value })}
                    placeholder="https://..."
                    className="h-8 text-sm"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-xs">Accent Color</Label>
                    <Input
                      type="color"
                      value={item.accentColor || '#6366f1'}
                      onChange={(e) => updateItem(index, { accentColor: e.target.value })}
                      className="h-8"
                    />
                  </div>
                  <div>
                    <Label className="text-xs">Image Alt</Label>
                    <Input
                      value={item.imageAlt || ''}
                      onChange={(e) => updateItem(index, { imageAlt: e.target.value })}
                      className="h-8 text-sm"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-xs">Link URL</Label>
                    <Input
                      value={item.linkUrl || ''}
                      onChange={(e) => updateItem(index, { linkUrl: e.target.value })}
                      placeholder="/services"
                      className="h-8 text-sm"
                    />
                  </div>
                  <div>
                    <Label className="text-xs">Link Label</Label>
                    <Input
                      value={item.linkLabel || ''}
                      onChange={(e) => updateItem(index, { linkLabel: e.target.value })}
                      placeholder="Learn more"
                      className="h-8 text-sm"
                    />
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => removeItem(index)}
                  className="text-destructive hover:text-destructive"
                >
                  <Trash2 className="h-3.5 w-3.5 mr-1" /> Remove
                </Button>
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>

        <Button variant="outline" size="sm" onClick={addItem} className="w-full mt-3 border-dashed">
          <Plus className="h-4 w-4 mr-2" /> Add Item
        </Button>
      </div>
    </div>
  );
}