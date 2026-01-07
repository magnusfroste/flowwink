import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, Trash2, GripVertical } from 'lucide-react';
import { ImagePickerField } from '../ImagePickerField';
import type { BadgeBlockData, BadgeItem } from '@/components/public/blocks/BadgeBlock';

interface BadgeBlockEditorProps {
  data: BadgeBlockData;
  onChange: (data: BadgeBlockData) => void;
  isEditing: boolean;
}

export function BadgeBlockEditor({ data, onChange, isEditing }: BadgeBlockEditorProps) {
  const {
    title = '',
    subtitle = '',
    badges = [],
    variant = 'default',
    columns = 4,
    size = 'md',
    showTitles = true,
    grayscale = false,
  } = data;

  const addBadge = () => {
    const newBadge: BadgeItem = {
      id: `badge-${Date.now()}`,
      title: 'New Badge',
      icon: 'award',
    };
    onChange({ ...data, badges: [...badges, newBadge] });
  };

  const updateBadge = (index: number, updates: Partial<BadgeItem>) => {
    const newBadges = [...badges];
    newBadges[index] = { ...newBadges[index], ...updates };
    onChange({ ...data, badges: newBadges });
  };

  const removeBadge = (index: number) => {
    onChange({ ...data, badges: badges.filter((_, i) => i !== index) });
  };

  if (!isEditing) {
    return (
      <div className="py-8 text-center text-muted-foreground">
        <div className="text-lg font-medium mb-2">{title || 'Badge Block'}</div>
        <div className="text-sm">{badges.length} badges • {variant} variant</div>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-4">
      {/* Header */}
      <div className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="badge-title">Title</Label>
          <Input
            id="badge-title"
            value={title}
            onChange={(e) => onChange({ ...data, title: e.target.value })}
            placeholder="Trusted by industry leaders..."
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="badge-subtitle">Subtitle</Label>
          <Input
            id="badge-subtitle"
            value={subtitle}
            onChange={(e) => onChange({ ...data, subtitle: e.target.value })}
            placeholder="Optional description..."
          />
        </div>
      </div>

      {/* Settings */}
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Variant</Label>
          <Select value={variant} onValueChange={(v) => onChange({ ...data, variant: v as BadgeBlockData['variant'] })}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="default">Default</SelectItem>
              <SelectItem value="cards">Cards</SelectItem>
              <SelectItem value="bordered">Bordered</SelectItem>
              <SelectItem value="minimal">Minimal</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label>Columns</Label>
          <Select value={String(columns)} onValueChange={(v) => onChange({ ...data, columns: Number(v) as BadgeBlockData['columns'] })}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="3">3 columns</SelectItem>
              <SelectItem value="4">4 columns</SelectItem>
              <SelectItem value="5">5 columns</SelectItem>
              <SelectItem value="6">6 columns</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label>Size</Label>
          <Select value={size} onValueChange={(v) => onChange({ ...data, size: v as BadgeBlockData['size'] })}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="sm">Small</SelectItem>
              <SelectItem value="md">Medium</SelectItem>
              <SelectItem value="lg">Large</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Toggles */}
      <div className="grid grid-cols-2 gap-4">
        <div className="flex items-center justify-between">
          <Label htmlFor="show-titles">Show Titles</Label>
          <Switch
            id="show-titles"
            checked={showTitles}
            onCheckedChange={(v) => onChange({ ...data, showTitles: v })}
          />
        </div>
        <div className="flex items-center justify-between">
          <Label htmlFor="grayscale">Grayscale Effect</Label>
          <Switch
            id="grayscale"
            checked={grayscale}
            onCheckedChange={(v) => onChange({ ...data, grayscale: v })}
          />
        </div>
      </div>

      {/* Badge Items */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <Label className="text-base font-medium">Badges</Label>
          <Button variant="outline" size="sm" onClick={addBadge}>
            <Plus className="h-4 w-4 mr-1" />
            Add Badge
          </Button>
        </div>

        {badges.length === 0 ? (
          <div className="text-center py-8 border-2 border-dashed rounded-lg text-muted-foreground">
            <p>No badges yet</p>
            <Button variant="link" onClick={addBadge}>Add your first badge</Button>
          </div>
        ) : (
          <div className="space-y-3">
            {badges.map((badge, index) => (
              <div key={badge.id} className="flex items-start gap-3 p-4 border rounded-lg bg-card">
                <div className="cursor-move mt-2 text-muted-foreground">
                  <GripVertical className="h-4 w-4" />
                </div>
                <div className="flex-1 space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <Input
                      value={badge.title}
                      onChange={(e) => updateBadge(index, { title: e.target.value })}
                      placeholder="Badge title..."
                    />
                    <Select 
                      value={badge.icon || 'award'} 
                      onValueChange={(v) => updateBadge(index, { icon: v as BadgeItem['icon'] })}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Icon" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="award">Award</SelectItem>
                        <SelectItem value="shield">Shield</SelectItem>
                        <SelectItem value="check">Check</SelectItem>
                        <SelectItem value="star">Star</SelectItem>
                        <SelectItem value="medal">Medal</SelectItem>
                        <SelectItem value="trophy">Trophy</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <Input
                    value={badge.subtitle || ''}
                    onChange={(e) => updateBadge(index, { subtitle: e.target.value })}
                    placeholder="Subtitle (optional)..."
                  />
                  <div className="grid grid-cols-2 gap-3">
                    <ImagePickerField
                      value={badge.image || ''}
                      onChange={(v) => updateBadge(index, { image: v })}
                      placeholder="Badge image URL"
                    />
                    <Input
                      value={badge.url || ''}
                      onChange={(e) => updateBadge(index, { url: e.target.value })}
                      placeholder="Link URL (optional)..."
                    />
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => removeBadge(index)}
                  className="text-destructive hover:text-destructive hover:bg-destructive/10"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
