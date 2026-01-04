import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import type { KbFeaturedBlockData } from '@/components/public/blocks/KbFeaturedBlock';

interface KbFeaturedBlockEditorProps {
  data: KbFeaturedBlockData;
  onChange: (data: KbFeaturedBlockData) => void;
}

export function KbFeaturedBlockEditor({ data, onChange }: KbFeaturedBlockEditorProps) {
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
    </div>
  );
}
