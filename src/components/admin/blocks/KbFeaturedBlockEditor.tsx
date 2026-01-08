import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Star } from 'lucide-react';
import type { KbFeaturedBlockData } from '@/components/public/blocks/KbFeaturedBlock';

interface KbFeaturedBlockEditorProps {
  data: KbFeaturedBlockData;
  onChange: (data: KbFeaturedBlockData) => void;
  isEditing?: boolean;
}

export function KbFeaturedBlockEditor({ data, onChange, isEditing }: KbFeaturedBlockEditorProps) {
  // Preview mode
  if (!isEditing) {
    return (
      <div className="p-6 text-center border-2 border-dashed rounded-lg bg-muted/30">
        <Star className="h-12 w-12 mx-auto text-muted-foreground mb-3" />
        <h3 className="font-medium text-lg">{data.title || "Featured Articles"}</h3>
        <p className="text-sm text-muted-foreground mt-1">
          {data.maxItems || 6} articles • {data.columns || 3} columns • {data.layout || 'grid'}
        </p>
        <div className="mt-4 grid grid-cols-3 gap-2 max-w-xs mx-auto">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-12 rounded bg-background border" />
          ))}
        </div>
      </div>
    );
  }

  const handleChange = (field: keyof KbFeaturedBlockData, value: unknown) => {
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

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="layout">Layout</Label>
          <Select
            value={data.layout || 'grid'}
            onValueChange={(value) => handleChange('layout', value)}
          >
            <SelectTrigger id="layout">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="grid">Grid</SelectItem>
              <SelectItem value="list">Lista</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label htmlFor="columns">Kolumner (grid)</Label>
          <Select
            value={String(data.columns || 3)}
            onValueChange={(value) => handleChange('columns', Number(value))}
          >
            <SelectTrigger id="columns">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="2">2 kolumner</SelectItem>
              <SelectItem value="3">3 kolumner</SelectItem>
              <SelectItem value="4">4 kolumner</SelectItem>
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
          max={12}
          value={data.maxItems || 6}
          onChange={(e) => handleChange('maxItems', Number(e.target.value))}
        />
      </div>

      <div className="flex items-center justify-between">
        <Label htmlFor="showCategory">Visa kategori</Label>
        <Switch
          id="showCategory"
          checked={data.showCategory !== false}
          onCheckedChange={(checked) => handleChange('showCategory', checked)}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="kbPageSlug">KB Page Slug</Label>
        <Input
          id="kbPageSlug"
          value={data.kbPageSlug || ''}
          onChange={(e) => handleChange('kbPageSlug', e.target.value)}
          placeholder="help"
        />
        <p className="text-xs text-muted-foreground">
          The slug of the KB page for article links (e.g., "help" → /help/article-slug)
        </p>
      </div>
    </div>
  );
}
