import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { LayoutGrid } from 'lucide-react';
import type { CategoryNavBlockData } from '@/components/public/blocks/CategoryNavBlock';

interface CategoryNavBlockEditorProps {
  data: CategoryNavBlockData;
  onChange: (data: CategoryNavBlockData) => void;
  isEditing: boolean;
}

export function CategoryNavBlockEditor({ data, onChange, isEditing }: CategoryNavBlockEditorProps) {
  const updateData = (updates: Partial<CategoryNavBlockData>) => {
    onChange({ ...data, ...updates });
  };

  if (!isEditing) {
    return (
      <div className="p-6 text-center border-2 border-dashed rounded-lg bg-muted/30">
        <LayoutGrid className="h-12 w-12 mx-auto text-muted-foreground mb-3" />
        <h3 className="font-medium text-lg">Category Navigation</h3>
        <p className="text-sm text-muted-foreground mt-1">{data.title || 'Browse categories'}</p>
      </div>
    );
  }

  return (
    <div className="space-y-5 p-4 border rounded-lg bg-card">
      <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
        <LayoutGrid className="h-4 w-4" />
        Category Navigation - Settings
      </div>

      <div className="space-y-2">
        <Label>Section title</Label>
        <Input
          value={data.title || ''}
          onChange={(e) => updateData({ title: e.target.value })}
          placeholder="Shop by Category"
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Columns</Label>
          <Select
            value={String(data.columns || 3)}
            onValueChange={(v) => updateData({ columns: parseInt(v) as 2 | 3 | 4 })}
          >
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="2">2 columns</SelectItem>
              <SelectItem value="3">3 columns</SelectItem>
              <SelectItem value="4">4 columns</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label>Style</Label>
          <Select
            value={data.variant || 'cards'}
            onValueChange={(v: 'cards' | 'minimal' | 'overlay') => updateData({ variant: v })}
          >
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="cards">Cards</SelectItem>
              <SelectItem value="minimal">Minimal</SelectItem>
              <SelectItem value="overlay">Image overlay</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="space-y-2">
        <Label>Link base path</Label>
        <Input
          value={data.linkBase || ''}
          onChange={(e) => updateData({ linkBase: e.target.value })}
          placeholder="/shop"
        />
      </div>

      <div className="flex items-center justify-between">
        <Label>Show descriptions</Label>
        <Switch
          checked={data.showDescription ?? false}
          onCheckedChange={(checked) => updateData({ showDescription: checked })}
        />
      </div>
    </div>
  );
}
