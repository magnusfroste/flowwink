import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ImagePickerField } from '@/components/admin/ImagePickerField';
import { ModelViewerBlock, type ModelViewerBlockData } from '@/components/public/blocks/ModelViewerBlock';

interface Props { data: ModelViewerBlockData; onChange: (data: ModelViewerBlockData) => void; isEditing: boolean }

export function ModelViewerBlockEditor({ data, onChange, isEditing }: Props) {
  if (!isEditing) {
    return data.src ? <ModelViewerBlock data={data} /> : (
      <div className="p-6 text-center bg-muted/50 rounded-lg text-sm text-muted-foreground">3D model — add a .glb file to configure</div>
    );
  }
  return (
    <div className="space-y-4 p-4">
      <div className="space-y-2">
        <Label>Model file (.glb / .gltf)</Label>
        <Input value={data.src || ''} onChange={(e) => onChange({ ...data, src: e.target.value })} placeholder="https://…/moss-aperture.glb" />
        <p className="text-xs text-muted-foreground">Import the model to the media library first; the URL it returns goes here.</p>
      </div>
      <div className="space-y-2">
        <Label>Poster image</Label>
        <ImagePickerField value={data.poster || ''} onChange={(url) => onChange({ ...data, poster: url })} placeholder="Shown before the model loads and where motion is reduced" />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Alt text</Label>
          <Input value={data.alt || ''} onChange={(e) => onChange({ ...data, alt: e.target.value })} placeholder="MOSS aperture, front" />
        </div>
        <div className="space-y-2">
          <Label>Caption</Label>
          <Input value={data.caption || ''} onChange={(e) => onChange({ ...data, caption: e.target.value })} />
        </div>
        <div className="space-y-2">
          <Label>Height</Label>
          <Select value={data.height || 'md'} onValueChange={(v) => onChange({ ...data, height: v as ModelViewerBlockData['height'] })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="sm">Small (280 px)</SelectItem>
              <SelectItem value="md">Medium (380 px)</SelectItem>
              <SelectItem value="lg">Large (480 px)</SelectItem>
              <SelectItem value="xl">Extra large (600 px)</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label>Exposure</Label>
          <Input type="number" min={0.5} max={2} step={0.1} value={data.exposure ?? 1} onChange={(e) => onChange({ ...data, exposure: Number(e.target.value) })} />
        </div>
      </div>
      <div className="flex items-center justify-between">
        <Label>Auto-rotate</Label>
        <Switch checked={data.autoRotate !== false} onCheckedChange={(v) => onChange({ ...data, autoRotate: v })} />
      </div>
      <div className="flex items-center justify-between">
        <Label>Camera controls (drag, zoom)</Label>
        <Switch checked={data.cameraControls !== false} onCheckedChange={(v) => onChange({ ...data, cameraControls: v })} />
      </div>
    </div>
  );
}
