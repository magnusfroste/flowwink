import { useState } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Slider } from '@/components/ui/slider';
import { CTABlockData, CTAVariant } from '@/types/cms';
import { AITextAssistant } from '../AITextAssistant';
import { ImageUploader } from '../ImageUploader';
import { cn } from '@/lib/utils';

interface CTABlockEditorProps {
  data: CTABlockData;
  onChange: (data: CTABlockData) => void;
  isEditing: boolean;
}

const VARIANT_OPTIONS: { value: CTAVariant; label: string; description: string }[] = [
  { value: 'default', label: 'Default', description: 'Solid or gradient background' },
  { value: 'with-image', label: 'With Image', description: 'Full background image with overlay' },
  { value: 'split', label: 'Split', description: 'Image on one side, content on other' },
  { value: 'minimal', label: 'Minimal', description: 'Clean, understated design' },
];

export function CTABlockEditor({ data, onChange, isEditing }: CTABlockEditorProps) {
  const [localData, setLocalData] = useState<CTABlockData>(data);

  const handleChange = (updates: Partial<CTABlockData>) => {
    const newData = { ...localData, ...updates };
    setLocalData(newData);
    onChange(newData);
  };

  const variant = localData.variant || 'default';

  if (isEditing) {
    return (
      <div className="space-y-6 p-4 bg-muted/50 rounded-lg">
        {/* Variant selector */}
        <div className="space-y-2">
          <Label>Design variant</Label>
          <Select
            value={variant}
            onValueChange={(value: CTAVariant) => handleChange({ variant: value })}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {VARIANT_OPTIONS.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  <div>
                    <div className="font-medium">{option.label}</div>
                    <div className="text-xs text-muted-foreground">{option.description}</div>
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Title */}
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

        {/* Subtitle */}
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

        {/* Primary Button */}
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="cta-button-text">Primary button text</Label>
            <Input
              id="cta-button-text"
              value={localData.buttonText || ''}
              onChange={(e) => handleChange({ buttonText: e.target.value })}
              placeholder="Contact us"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="cta-button-url">Primary button link</Label>
            <Input
              id="cta-button-url"
              value={localData.buttonUrl || ''}
              onChange={(e) => handleChange({ buttonUrl: e.target.value })}
              placeholder="/contact"
            />
          </div>
        </div>

        {/* Secondary Button */}
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="cta-secondary-text">Secondary button text (optional)</Label>
            <Input
              id="cta-secondary-text"
              value={localData.secondaryButtonText || ''}
              onChange={(e) => handleChange({ secondaryButtonText: e.target.value })}
              placeholder="Learn more"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="cta-secondary-url">Secondary button link</Label>
            <Input
              id="cta-secondary-url"
              value={localData.secondaryButtonUrl || ''}
              onChange={(e) => handleChange({ secondaryButtonUrl: e.target.value })}
              placeholder="/about"
            />
          </div>
        </div>

        {/* Background image - show for with-image and split variants */}
        {(variant === 'with-image' || variant === 'split') && (
          <div className="space-y-4 pt-4 border-t">
            <ImageUploader
              value={localData.backgroundImage || ''}
              onChange={(url) => handleChange({ backgroundImage: url })}
              label="Background image"
            />
            
            {variant === 'with-image' && (
              <div className="space-y-2">
                <Label>Overlay opacity: {Math.round((localData.overlayOpacity ?? 0.6) * 100)}%</Label>
                <Slider
                  value={[(localData.overlayOpacity ?? 0.6) * 100]}
                  onValueChange={([value]) => handleChange({ overlayOpacity: value / 100 })}
                  min={0}
                  max={100}
                  step={5}
                />
              </div>
            )}
          </div>
        )}

        {/* Gradient toggle - only for default variant */}
        {variant === 'default' && (
          <div className="flex items-center gap-2 pt-4 border-t">
            <Switch
              id="cta-gradient"
              checked={localData.gradient ?? true}
              onCheckedChange={(checked) => handleChange({ gradient: checked })}
            />
            <Label htmlFor="cta-gradient">Use gradient background</Label>
          </div>
        )}
      </div>
    );
  }

  // Preview mode - render based on variant
  const overlayOpacity = localData.overlayOpacity ?? 0.6;

  if (variant === 'split') {
    return (
      <div className="grid md:grid-cols-2 min-h-[300px] rounded-lg overflow-hidden">
        <div className="relative bg-muted">
          {localData.backgroundImage ? (
            <img src={localData.backgroundImage} alt="" className="absolute inset-0 w-full h-full object-cover" />
          ) : (
            <div className="absolute inset-0 bg-gradient-to-br from-primary/20 to-primary/40" />
          )}
        </div>
        <div className="flex flex-col justify-center p-8 bg-background">
          <h3 className="text-2xl font-bold mb-2">{localData.title || 'CTA Title'}</h3>
          {localData.subtitle && <p className="text-muted-foreground mb-4">{localData.subtitle}</p>}
          <div className="flex flex-wrap gap-3">
            <Button>{localData.buttonText || 'Button'}</Button>
            {localData.secondaryButtonText && <Button variant="outline">{localData.secondaryButtonText}</Button>}
          </div>
        </div>
      </div>
    );
  }

  if (variant === 'minimal') {
    return (
      <div className="rounded-lg py-12 px-8 text-center">
        <h3 className="text-2xl font-bold mb-2">{localData.title || 'CTA Title'}</h3>
        {localData.subtitle && <p className="text-muted-foreground mb-6">{localData.subtitle}</p>}
        <div className="flex flex-wrap justify-center gap-4">
          <Button variant="default" className="bg-foreground text-background hover:bg-foreground/90">{localData.buttonText || 'Button'}</Button>
          {localData.secondaryButtonText && <Button variant="link">{localData.secondaryButtonText}</Button>}
        </div>
      </div>
    );
  }

  if (variant === 'with-image' && localData.backgroundImage) {
    return (
      <div className="relative rounded-lg overflow-hidden py-16 px-8 text-center">
        <div className="absolute inset-0">
          <img src={localData.backgroundImage} alt="" className="w-full h-full object-cover" />
          <div className="absolute inset-0 bg-black" style={{ opacity: overlayOpacity }} />
        </div>
        <div className="relative">
          <h3 className="text-2xl font-bold mb-2 text-white">{localData.title || 'CTA Title'}</h3>
          {localData.subtitle && <p className="text-white/90 mb-6">{localData.subtitle}</p>}
          <div className="flex flex-wrap justify-center gap-4">
            <Button variant="secondary">{localData.buttonText || 'Button'}</Button>
            {localData.secondaryButtonText && <Button variant="outline" className="border-white text-white hover:bg-white/10">{localData.secondaryButtonText}</Button>}
          </div>
        </div>
      </div>
    );
  }

  // Default variant
  return (
    <div
      className={cn(
        'rounded-lg py-12 px-8 text-center',
        localData.gradient
          ? 'bg-gradient-to-r from-primary to-primary/80 text-primary-foreground'
          : 'bg-secondary text-secondary-foreground'
      )}
    >
      <h3 className="text-2xl font-bold mb-2">{localData.title || 'CTA Title'}</h3>
      {localData.subtitle && <p className="text-lg opacity-90 mb-6">{localData.subtitle}</p>}
      <div className="flex flex-wrap justify-center gap-4">
        <Button variant={localData.gradient ? 'secondary' : 'default'} size="lg">
          {localData.buttonText || 'Button'}
        </Button>
        {localData.secondaryButtonText && (
          <Button variant="ghost" size="lg" className="border border-primary-foreground/30">
            {localData.secondaryButtonText}
          </Button>
        )}
      </div>
    </div>
  );
}
