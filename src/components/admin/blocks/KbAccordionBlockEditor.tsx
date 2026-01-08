import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { HelpCircle } from 'lucide-react';
import type { KbAccordionBlockData } from '@/components/public/blocks/KbAccordionBlock';

interface KbAccordionBlockEditorProps {
  data: KbAccordionBlockData;
  onChange: (data: KbAccordionBlockData) => void;
  isEditing?: boolean;
}

export function KbAccordionBlockEditor({ data, onChange, isEditing }: KbAccordionBlockEditorProps) {
  // Fetch available categories
  const { data: categories } = useQuery({
    queryKey: ['kb-categories-for-editor'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('kb_categories')
        .select('id, name, slug')
        .eq('is_active', true)
        .order('sort_order', { ascending: true });
      if (error) throw error;
      return data;
    },
  });

  // Preview mode
  if (!isEditing) {
    return (
      <div className="p-6 text-center border-2 border-dashed rounded-lg bg-muted/30">
        <HelpCircle className="h-12 w-12 mx-auto text-muted-foreground mb-3" />
        <h3 className="font-medium text-lg">{data.title || "FAQ Accordion"}</h3>
        <p className="text-sm text-muted-foreground mt-1">
          {data.maxItems || 10} items • {data.variant || 'default'} style
          {data.categorySlug && ` • filtered`}
        </p>
        <div className="mt-4 max-w-xs mx-auto space-y-1">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-10 rounded border bg-background" />
          ))}
        </div>
      </div>
    );
  }

  const handleChange = (field: keyof KbAccordionBlockData, value: unknown) => {
    onChange({ ...data, [field]: value });
  };

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="title">Rubrik</Label>
        <Input
          id="title"
          value={data.title || ''}
          onChange={(e) => handleChange('title', e.target.value)}
          placeholder="Vanliga frågor"
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="subtitle">Underrubrik</Label>
        <Input
          id="subtitle"
          value={data.subtitle || ''}
          onChange={(e) => handleChange('subtitle', e.target.value)}
          placeholder="Hitta svar på vanliga frågor"
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="categorySlug">Filtrera efter kategori</Label>
        <Select
          value={data.categorySlug || 'all'}
          onValueChange={(value) => handleChange('categorySlug', value === 'all' ? undefined : value)}
        >
          <SelectTrigger id="categorySlug">
            <SelectValue placeholder="Alla kategorier" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Alla kategorier</SelectItem>
            {categories?.map((cat) => (
              <SelectItem key={cat.id} value={cat.slug}>
                {cat.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="variant">Variant</Label>
          <Select
            value={data.variant || 'default'}
            onValueChange={(value) => handleChange('variant', value)}
          >
            <SelectTrigger id="variant">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="default">Standard</SelectItem>
              <SelectItem value="bordered">Med ram</SelectItem>
              <SelectItem value="minimal">Minimal</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label htmlFor="defaultOpen">Öppna som standard</Label>
          <Select
            value={data.defaultOpen || 'none'}
            onValueChange={(value) => handleChange('defaultOpen', value)}
          >
            <SelectTrigger id="defaultOpen">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">Ingen</SelectItem>
              <SelectItem value="first">Första</SelectItem>
              <SelectItem value="all">Alla (kräver "Tillåt flera öppna")</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="maxItems">Max antal artiklar</Label>
        <Input
          id="maxItems"
          type="number"
          min={1}
          max={50}
          value={data.maxItems || 10}
          onChange={(e) => handleChange('maxItems', Number(e.target.value))}
        />
      </div>

      <div className="flex items-center justify-between">
        <Label htmlFor="showCategory">Visa kategori</Label>
        <Switch
          id="showCategory"
          checked={data.showCategory === true}
          onCheckedChange={(checked) => handleChange('showCategory', checked)}
        />
      </div>

      <div className="flex items-center justify-between">
        <Label htmlFor="allowMultiple">Tillåt flera öppna samtidigt</Label>
        <Switch
          id="allowMultiple"
          checked={data.allowMultiple === true}
          onCheckedChange={(checked) => handleChange('allowMultiple', checked)}
        />
      </div>
    </div>
  );
}
