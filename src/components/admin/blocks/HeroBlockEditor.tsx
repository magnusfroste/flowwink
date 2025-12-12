import { useState } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { HeroBlockData } from '@/types/cms';

interface HeroBlockEditorProps {
  data: HeroBlockData;
  onChange: (data: HeroBlockData) => void;
  isEditing: boolean;
}

export function HeroBlockEditor({ data, onChange, isEditing }: HeroBlockEditorProps) {
  const [localData, setLocalData] = useState<HeroBlockData>(data);

  const handleChange = (updates: Partial<HeroBlockData>) => {
    const newData = { ...localData, ...updates };
    setLocalData(newData);
    onChange(newData);
  };

  if (isEditing) {
    return (
      <div className="space-y-4 p-4 bg-muted/50 rounded-lg">
        <div className="space-y-2">
          <Label htmlFor="hero-title">Rubrik</Label>
          <Input
            id="hero-title"
            value={localData.title || ''}
            onChange={(e) => handleChange({ title: e.target.value })}
            placeholder="Huvudrubrik"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="hero-subtitle">Underrubrik</Label>
          <Input
            id="hero-subtitle"
            value={localData.subtitle || ''}
            onChange={(e) => handleChange({ subtitle: e.target.value })}
            placeholder="Kort beskrivning"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="hero-bg">Bakgrundsbild (URL)</Label>
          <Input
            id="hero-bg"
            value={localData.backgroundImage || ''}
            onChange={(e) => handleChange({ backgroundImage: e.target.value })}
            placeholder="https://example.com/bild.jpg"
          />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>Primär knapp</Label>
            <Input
              value={localData.primaryButton?.text || ''}
              onChange={(e) =>
                handleChange({
                  primaryButton: { ...localData.primaryButton, text: e.target.value, url: localData.primaryButton?.url || '' },
                })
              }
              placeholder="Knapptext"
            />
            <Input
              value={localData.primaryButton?.url || ''}
              onChange={(e) =>
                handleChange({
                  primaryButton: { ...localData.primaryButton, text: localData.primaryButton?.text || '', url: e.target.value },
                })
              }
              placeholder="Länk"
            />
          </div>
          <div className="space-y-2">
            <Label>Sekundär knapp</Label>
            <Input
              value={localData.secondaryButton?.text || ''}
              onChange={(e) =>
                handleChange({
                  secondaryButton: { ...localData.secondaryButton, text: e.target.value, url: localData.secondaryButton?.url || '' },
                })
              }
              placeholder="Knapptext"
            />
            <Input
              value={localData.secondaryButton?.url || ''}
              onChange={(e) =>
                handleChange({
                  secondaryButton: { ...localData.secondaryButton, text: localData.secondaryButton?.text || '', url: e.target.value },
                })
              }
              placeholder="Länk"
            />
          </div>
        </div>
      </div>
    );
  }

  // Preview mode
  return (
    <div
      className="relative overflow-hidden rounded-lg bg-gradient-to-r from-primary/90 to-primary text-primary-foreground"
      style={{
        backgroundImage: localData.backgroundImage ? `url(${localData.backgroundImage})` : undefined,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
      }}
    >
      <div className="absolute inset-0 bg-primary/70" />
      <div className="relative z-10 px-8 py-16 text-center">
        <h1 className="text-3xl font-bold mb-3">{localData.title || 'Hero-rubrik'}</h1>
        {localData.subtitle && <p className="text-lg opacity-90 mb-6">{localData.subtitle}</p>}
        <div className="flex justify-center gap-3">
          {localData.primaryButton?.text && (
            <Button variant="secondary">{localData.primaryButton.text}</Button>
          )}
          {localData.secondaryButton?.text && (
            <Button variant="outline" className="border-primary-foreground/30 text-primary-foreground hover:bg-primary-foreground/10">
              {localData.secondaryButton.text}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
