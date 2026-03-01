import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Slider } from '@/components/ui/slider';
import type { ParallaxSectionBlockData } from '@/components/public/blocks/ParallaxSectionBlock';

interface ParallaxSectionBlockEditorProps {
  data: ParallaxSectionBlockData;
  onChange: (data: ParallaxSectionBlockData) => void;
  isEditing: boolean;
}

export function ParallaxSectionBlockEditor({ data, onChange, isEditing }: ParallaxSectionBlockEditorProps) {
  const handleChange = (updates: Partial<ParallaxSectionBlockData>) => {
    onChange({ ...data, ...updates });
  };

  if (!isEditing) {
    return (
      <div className="relative overflow-hidden rounded-lg min-h-[120px]">
        {data.backgroundImage ? (
          <div
            className="absolute inset-0 bg-cover bg-center"
            style={{ backgroundImage: `url(${data.backgroundImage})` }}
          />
        ) : (
          <div className="absolute inset-0 bg-gradient-to-br from-muted to-muted-foreground/20" />
        )}
        <div className="absolute inset-0 bg-background/50" />
        <div className="relative z-10 flex items-center justify-center p-6 text-center">
          <div className="space-y-1">
            <p className="font-serif font-bold text-lg">{data.title || 'Parallax Section'}</p>
            {data.subtitle && <p className="text-sm text-muted-foreground">{data.subtitle}</p>}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <Label className="text-xs text-muted-foreground">Background Image URL</Label>
        <Input
          value={data.backgroundImage || ''}
          onChange={(e) => handleChange({ backgroundImage: e.target.value })}
          placeholder="https://images.unsplash.com/..."
        />
      </div>

      <div>
        <Label className="text-xs text-muted-foreground">Title</Label>
        <Input
          value={data.title || ''}
          onChange={(e) => handleChange({ title: e.target.value })}
          placeholder="Section title"
        />
      </div>

      <div>
        <Label className="text-xs text-muted-foreground">Subtitle</Label>
        <Textarea
          value={data.subtitle || ''}
          onChange={(e) => handleChange({ subtitle: e.target.value })}
          placeholder="Optional subtitle or description"
          rows={2}
        />
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div>
          <Label className="text-xs text-muted-foreground">Height</Label>
          <Select value={data.height || 'md'} onValueChange={(v) => handleChange({ height: v as ParallaxSectionBlockData['height'] })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="sm">Small (40vh)</SelectItem>
              <SelectItem value="md">Medium (60vh)</SelectItem>
              <SelectItem value="lg">Large (80vh)</SelectItem>
              <SelectItem value="xl">Full Screen</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div>
          <Label className="text-xs text-muted-foreground">Text Color</Label>
          <Select value={data.textColor || 'light'} onValueChange={(v) => handleChange({ textColor: v as 'light' | 'dark' })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="light">Light</SelectItem>
              <SelectItem value="dark">Dark</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div>
          <Label className="text-xs text-muted-foreground">Alignment</Label>
          <Select value={data.contentAlignment || 'center'} onValueChange={(v) => handleChange({ contentAlignment: v as 'left' | 'center' | 'right' })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="left">Left</SelectItem>
              <SelectItem value="center">Center</SelectItem>
              <SelectItem value="right">Right</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div>
        <Label className="text-xs text-muted-foreground">Overlay Opacity: {data.overlayOpacity ?? 50}%</Label>
        <Slider
          value={[data.overlayOpacity ?? 50]}
          onValueChange={([v]) => handleChange({ overlayOpacity: v })}
          min={0}
          max={90}
          step={5}
        />
      </div>
    </div>
  );
}
