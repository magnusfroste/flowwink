import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { KbAccordionBlockData } from '@/components/public/blocks/KbAccordionBlock';

interface KbAccordionBlockEditorProps {
  data: KbAccordionBlockData;
  onChange: (data: KbAccordionBlockData) => void;
}

export function KbAccordionBlockEditor({ data, onChange }: KbAccordionBlockEditorProps) {
  const handleChange = (field: keyof KbAccordionBlockData, value: unknown) => {
    onChange({ ...data, [field]: value });
  };

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