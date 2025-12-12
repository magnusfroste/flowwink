import { useState } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ImageBlockData } from '@/types/cms';
import { ImageIcon } from 'lucide-react';

interface ImageBlockEditorProps {
  data: ImageBlockData;
  onChange: (data: ImageBlockData) => void;
  isEditing: boolean;
}

export function ImageBlockEditor({ data, onChange, isEditing }: ImageBlockEditorProps) {
  const [localData, setLocalData] = useState<ImageBlockData>(data);

  const handleChange = (updates: Partial<ImageBlockData>) => {
    const newData = { ...localData, ...updates };
    setLocalData(newData);
    onChange(newData);
  };

  if (isEditing) {
    return (
      <div className="space-y-4 p-4 bg-muted/50 rounded-lg">
        <div className="space-y-2">
          <Label htmlFor="image-src">Bild-URL</Label>
          <Input
            id="image-src"
            value={localData.src || ''}
            onChange={(e) => handleChange({ src: e.target.value })}
            placeholder="https://example.com/bild.jpg"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="image-alt">Alt-text (tillgänglighet)</Label>
          <Input
            id="image-alt"
            value={localData.alt || ''}
            onChange={(e) => handleChange({ alt: e.target.value })}
            placeholder="Beskrivning av bilden"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="image-caption">Bildtext (valfritt)</Label>
          <Input
            id="image-caption"
            value={localData.caption || ''}
            onChange={(e) => handleChange({ caption: e.target.value })}
            placeholder="Bildtext under bilden"
          />
        </div>
        {localData.src && (
          <div className="mt-4">
            <p className="text-sm text-muted-foreground mb-2">Förhandsvisning:</p>
            <img
              src={localData.src}
              alt={localData.alt || 'Förhandsvisning'}
              className="max-h-48 rounded-lg object-cover"
            />
          </div>
        )}
      </div>
    );
  }

  // Preview mode
  if (!localData.src) {
    return (
      <div className="flex flex-col items-center justify-center h-48 bg-muted/50 rounded-lg border-2 border-dashed border-muted-foreground/30">
        <ImageIcon className="h-12 w-12 text-muted-foreground/50 mb-2" />
        <p className="text-sm text-muted-foreground">Ingen bild vald</p>
      </div>
    );
  }

  return (
    <figure className="rounded-lg overflow-hidden">
      <img
        src={localData.src}
        alt={localData.alt || ''}
        className="w-full h-auto object-cover"
      />
      {localData.caption && (
        <figcaption className="text-sm text-muted-foreground text-center py-2 bg-muted/30">
          {localData.caption}
        </figcaption>
      )}
    </figure>
  );
}
