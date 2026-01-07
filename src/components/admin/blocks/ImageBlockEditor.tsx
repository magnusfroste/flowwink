import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ImageIcon } from 'lucide-react';
import { ImageUploader } from '../ImageUploader';
import { useBlockEditor } from '@/hooks/useBlockEditor';
import type { ImageBlockData } from '@/components/public/blocks/ImageBlock';

interface ImageBlockEditorProps {
  data: ImageBlockData;
  onChange: (data: ImageBlockData) => void;
  isEditing: boolean;
}

export function ImageBlockEditor({ data, onChange, isEditing }: ImageBlockEditorProps) {
  const { data: blockData, updateField } = useBlockEditor({
    initialData: data,
    onChange,
  });

  if (isEditing) {
    return (
      <div className="space-y-4 p-4 bg-muted/50 rounded-lg">
        <ImageUploader
          value={blockData.src || ''}
          onChange={(url) => updateField('src', url)}
          label="Image"
        />
        
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="image-alt">Alt text (accessibility)</Label>
            <Input
              id="image-alt"
              value={blockData.alt || ''}
              onChange={(e) => updateField('alt', e.target.value)}
              placeholder="Description of the image"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="image-caption">Caption (optional)</Label>
            <Input
              id="image-caption"
              value={blockData.caption || ''}
              onChange={(e) => updateField('caption', e.target.value)}
              placeholder="Caption below the image"
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>Aspect Ratio</Label>
            <Select
              value={blockData.aspectRatio || 'auto'}
              onValueChange={(value) => updateField('aspectRatio', value as 'auto' | '16:9' | '4:3' | '1:1' | '21:9')}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="auto">Auto</SelectItem>
                <SelectItem value="16:9">16:9 (Video)</SelectItem>
                <SelectItem value="4:3">4:3 (Classic)</SelectItem>
                <SelectItem value="1:1">1:1 (Square)</SelectItem>
                <SelectItem value="21:9">21:9 (Cinematic)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Hover Effect</Label>
            <Select
              value={blockData.hoverEffect || 'none'}
              onValueChange={(value) => updateField('hoverEffect', value as 'none' | 'zoom' | 'fade' | 'lift')}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">None</SelectItem>
                <SelectItem value="zoom">Zoom</SelectItem>
                <SelectItem value="fade">Fade</SelectItem>
                <SelectItem value="lift">Lift</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>Shadow</Label>
            <Select
              value={blockData.shadow || 'md'}
              onValueChange={(value) => updateField('shadow', value as 'none' | 'sm' | 'md' | 'lg')}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">None</SelectItem>
                <SelectItem value="sm">Small</SelectItem>
                <SelectItem value="md">Medium</SelectItem>
                <SelectItem value="lg">Large</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center justify-between pt-6">
            <Label htmlFor="full-bleed">Full bleed (edge to edge)</Label>
            <Switch
              id="full-bleed"
              checked={blockData.fullBleed ?? false}
              onCheckedChange={(checked) => updateField('fullBleed', checked)}
            />
          </div>
        </div>

        <div className="flex items-center justify-between">
          <Label htmlFor="rounded">Rounded corners</Label>
          <Switch
            id="rounded"
            checked={blockData.rounded ?? true}
            onCheckedChange={(checked) => updateField('rounded', checked)}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="overlay-text">Overlay Text (optional)</Label>
          <Input
            id="overlay-text"
            value={blockData.overlayText || ''}
            onChange={(e) => updateField('overlayText', e.target.value)}
            placeholder="Text displayed over the image"
          />
        </div>

        {blockData.overlayText && (
          <div className="space-y-2">
            <Label>Overlay Position</Label>
            <Select
              value={blockData.overlayPosition || 'center'}
              onValueChange={(value) => updateField('overlayPosition', value as 'center' | 'bottom-left' | 'bottom-center')}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="center">Center</SelectItem>
                <SelectItem value="bottom-left">Bottom Left</SelectItem>
                <SelectItem value="bottom-center">Bottom Center</SelectItem>
              </SelectContent>
            </Select>
          </div>
        )}
      </div>
    );
  }

  // Preview mode
  if (!blockData.src) {
    return (
      <div className="flex flex-col items-center justify-center h-48 bg-muted/50 rounded-lg border-2 border-dashed border-muted-foreground/30">
        <ImageIcon className="h-12 w-12 text-muted-foreground/50 mb-2" />
        <p className="text-sm text-muted-foreground">No image selected</p>
      </div>
    );
  }

  return (
    <figure className="rounded-lg overflow-hidden relative group">
      <img
        src={blockData.src}
        alt={blockData.alt || ''}
        className="w-full h-auto object-cover"
      />
      {blockData.overlayText && (
        <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
          <span className="text-white text-xl font-bold">{blockData.overlayText}</span>
        </div>
      )}
      {blockData.caption && !blockData.overlayText && (
        <figcaption className="text-sm text-muted-foreground text-center py-2 bg-muted/30">
          {blockData.caption}
        </figcaption>
      )}
    </figure>
  );
}
