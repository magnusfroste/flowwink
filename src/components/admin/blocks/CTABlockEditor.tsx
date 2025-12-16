import { useState } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { CTABlockData } from '@/types/cms';
import { AITextAssistant } from '../AITextAssistant';
import { cn } from '@/lib/utils';

interface CTABlockEditorProps {
  data: CTABlockData;
  onChange: (data: CTABlockData) => void;
  isEditing: boolean;
}

export function CTABlockEditor({ data, onChange, isEditing }: CTABlockEditorProps) {
  const [localData, setLocalData] = useState<CTABlockData>(data);

  const handleChange = (updates: Partial<CTABlockData>) => {
    const newData = { ...localData, ...updates };
    setLocalData(newData);
    onChange(newData);
  };

  if (isEditing) {
    return (
      <div className="space-y-4 p-4 bg-muted/50 rounded-lg">
        <div className="space-y-2">
          <Label htmlFor="cta-title">Title</Label>
          <div className="flex gap-2">
            <Input
              id="cta-title"
              value={localData.title || ''}
              onChange={(e) => handleChange({ title: e.target.value })}
              placeholder="Ready to take the next step?"
              className="flex-1"
            />
            <AITextAssistant
              value={localData.title || ''}
              onChange={(text) => handleChange({ title: text })}
              actions={['expand', 'improve']}
              compact
            />
          </div>
        </div>
        <div className="space-y-2">
          <Label htmlFor="cta-subtitle">Subtitle (optional)</Label>
          <div className="flex gap-2">
            <Input
              id="cta-subtitle"
              value={localData.subtitle || ''}
              onChange={(e) => handleChange({ subtitle: e.target.value })}
              placeholder="Short description"
              className="flex-1"
            />
            <AITextAssistant
              value={localData.subtitle || ''}
              onChange={(text) => handleChange({ subtitle: text })}
              actions={['expand', 'improve']}
              compact
            />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="cta-button-text">Button text</Label>
            <Input
              id="cta-button-text"
              value={localData.buttonText || ''}
              onChange={(e) => handleChange({ buttonText: e.target.value })}
              placeholder="Contact us"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="cta-button-url">Link</Label>
            <Input
              id="cta-button-url"
              value={localData.buttonUrl || ''}
              onChange={(e) => handleChange({ buttonUrl: e.target.value })}
              placeholder="/contact"
            />
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Switch
            id="cta-gradient"
            checked={localData.gradient ?? true}
            onCheckedChange={(checked) => handleChange({ gradient: checked })}
          />
          <Label htmlFor="cta-gradient">Use gradient background</Label>
        </div>
      </div>
    );
  }

  // Preview mode
  return (
    <div
      className={cn(
        'rounded-lg py-12 px-8 text-center',
        localData.gradient
          ? 'bg-gradient-to-r from-primary to-primary/80 text-primary-foreground'
          : 'bg-secondary text-secondary-foreground'
      )}
    >
      <h3 className="text-2xl font-bold mb-2">{localData.title || 'Call-to-Action title'}</h3>
      {localData.subtitle && <p className="text-lg opacity-90 mb-6">{localData.subtitle}</p>}
      {localData.buttonText && (
        <Button
          variant={localData.gradient ? 'secondary' : 'default'}
          size="lg"
        >
          {localData.buttonText}
        </Button>
      )}
    </div>
  );
}
