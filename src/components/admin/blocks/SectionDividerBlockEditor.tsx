import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import { ImagePickerField } from '@/components/admin/ImagePickerField';
import type { SectionDividerBlockData } from '@/components/public/blocks/SectionDividerBlock';
import { SectionDividerBlock } from '@/components/public/blocks/SectionDividerBlock';

interface SectionDividerBlockEditorProps {
  data: SectionDividerBlockData;
  onChange: (data: SectionDividerBlockData) => void;
  isEditing: boolean;
}

export function SectionDividerBlockEditor({ data, onChange, isEditing }: SectionDividerBlockEditorProps) {
  if (!isEditing) {
    return (
      <div className="bg-muted/30 rounded overflow-hidden">
        <SectionDividerBlock data={data} />
      </div>
    );
  }

  const isTexture = data.shape === 'texture';

  return (
    <div className="space-y-4 p-4">
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Shape</Label>
          <Select
            value={data.shape || 'wave'}
            onValueChange={(v) => onChange({ ...data, shape: v as SectionDividerBlockData['shape'] })}
          >
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="wave">Wave</SelectItem>
              <SelectItem value="diagonal">Diagonal</SelectItem>
              <SelectItem value="curved">Curved</SelectItem>
              <SelectItem value="zigzag">Zigzag</SelectItem>
              <SelectItem value="triangle">Triangle</SelectItem>
              <SelectItem value="texture">Texture (image band)</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label>Height</Label>
          <Select
            value={data.height || 'md'}
            onValueChange={(v) => onChange({ ...data, height: v as SectionDividerBlockData['height'] })}
          >
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="sm">Small (40 px)</SelectItem>
              <SelectItem value="md">Medium (80 px)</SelectItem>
              <SelectItem value="lg">Large (120 px)</SelectItem>
              <SelectItem value="xl">Extra large (200 px)</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {isTexture ? (
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Texture image</Label>
            <ImagePickerField
              value={data.imageSrc || ''}
              onChange={(url) => onChange({ ...data, imageSrc: url })}
              placeholder="A web-sized PNG with transparency (≤ 1600 px wide)"
            />
            <p className="text-xs text-muted-foreground">
              A grain, gradient or scan-line band laid over the next section. Set the block's section background for the surface it sits on.
            </p>
          </div>
          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label>Fit</Label>
              <Select
                value={data.fit || 'cover'}
                onValueChange={(v) => onChange({ ...data, fit: v as SectionDividerBlockData['fit'] })}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="cover">Cover (crop to band)</SelectItem>
                  <SelectItem value="contain">Contain (whole image)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Anchor</Label>
              <Select
                value={data.position || 'center'}
                onValueChange={(v) => onChange({ ...data, position: v as SectionDividerBlockData['position'] })}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="top">Top</SelectItem>
                  <SelectItem value="center">Center</SelectItem>
                  <SelectItem value="bottom">Bottom</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Opacity</Label>
              <Input
                type="number"
                min={0}
                max={1}
                step={0.05}
                value={typeof data.opacity === 'number' ? data.opacity : 1}
                onChange={(e) => onChange({ ...data, opacity: Math.min(1, Math.max(0, Number(e.target.value))) })}
                className="h-9"
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label>Background Color</Label>
            <Input
              type="color"
              value={data.bgColor || '#000000'}
              onChange={(e) => onChange({ ...data, bgColor: e.target.value })}
              className="h-9"
            />
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>Shape Color</Label>
            <Input
              type="color"
              value={data.color || '#ffffff'}
              onChange={(e) => onChange({ ...data, color: e.target.value })}
              className="h-9"
            />
          </div>
          <div className="space-y-2">
            <Label>Background Color</Label>
            <Input
              type="color"
              value={data.bgColor || '#000000'}
              onChange={(e) => onChange({ ...data, bgColor: e.target.value })}
              className="h-9"
            />
          </div>
        </div>
      )}

      <div className="flex items-center justify-between">
        <Label>Flip Horizontally</Label>
        <Switch checked={data.flip || false} onCheckedChange={(v) => onChange({ ...data, flip: v })} />
      </div>
      <div className="flex items-center justify-between">
        <Label>Invert (upside down)</Label>
        <Switch checked={data.invert || false} onCheckedChange={(v) => onChange({ ...data, invert: v })} />
      </div>

      {/* Preview */}
      <div className="border rounded-lg overflow-hidden bg-muted/30">
        <SectionDividerBlock data={data} />
      </div>
    </div>
  );
}
