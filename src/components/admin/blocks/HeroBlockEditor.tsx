import { useState } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Slider } from '@/components/ui/slider';
import { HeroBlockData } from '@/types/cms';
import { ImageUploader } from '../ImageUploader';
import { AITextAssistant } from '../AITextAssistant';
import { Image, Video, Palette, Maximize, AlignVerticalJustifyStart, AlignVerticalJustifyCenter, AlignVerticalJustifyEnd, Type, MoveUp, Sparkles } from 'lucide-react';

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

  const backgroundType = localData.backgroundType || 'image';

  if (isEditing) {
    return (
      <div className="space-y-4 p-4 bg-muted/50 rounded-lg">
        <div className="space-y-2">
          <Label htmlFor="hero-title">Title</Label>
          <div className="flex gap-2">
            <Input
              id="hero-title"
              value={localData.title || ''}
              onChange={(e) => handleChange({ title: e.target.value })}
              placeholder="Main Heading"
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
          <Label htmlFor="hero-subtitle">Subtitle</Label>
          <div className="flex gap-2">
            <Input
              id="hero-subtitle"
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

        {/* Background Type Selector */}
        <div className="space-y-3">
          <Label>Background Type</Label>
          <div className="flex gap-2">
            <Button
              type="button"
              variant={backgroundType === 'image' ? 'default' : 'outline'}
              size="sm"
              onClick={() => handleChange({ backgroundType: 'image' })}
              className="flex items-center gap-2"
            >
              <Image className="h-4 w-4" />
              Image
            </Button>
            <Button
              type="button"
              variant={backgroundType === 'video' ? 'default' : 'outline'}
              size="sm"
              onClick={() => handleChange({ backgroundType: 'video' })}
              className="flex items-center gap-2"
            >
              <Video className="h-4 w-4" />
              Video
            </Button>
            <Button
              type="button"
              variant={backgroundType === 'color' ? 'default' : 'outline'}
              size="sm"
              onClick={() => handleChange({ backgroundType: 'color' })}
              className="flex items-center gap-2"
            >
              <Palette className="h-4 w-4" />
              Color
            </Button>
          </div>
        </div>

        {/* Image Background Options */}
        {backgroundType === 'image' && (
          <ImageUploader
            value={localData.backgroundImage || ''}
            onChange={(url) => handleChange({ backgroundImage: url })}
            label="Background Image"
          />
        )}

        {/* Video Background Options */}
        {backgroundType === 'video' && (
          <div className="space-y-4 p-4 border border-border rounded-lg bg-background/50">
            <div className="space-y-2">
              <Label htmlFor="video-url">Video URL (MP4)</Label>
              <Input
                id="video-url"
                value={localData.videoUrl || ''}
                onChange={(e) => handleChange({ videoUrl: e.target.value })}
                placeholder="https://example.com/video.mp4"
              />
              <p className="text-xs text-muted-foreground">
                Use a direct link to an MP4 file or CDN URL
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="video-webm">WebM Fallback (Optional)</Label>
              <Input
                id="video-webm"
                value={localData.videoUrlWebm || ''}
                onChange={(e) => handleChange({ videoUrlWebm: e.target.value })}
                placeholder="https://example.com/video.webm"
              />
            </div>
            <ImageUploader
              value={localData.videoPosterUrl || ''}
              onChange={(url) => handleChange({ videoPosterUrl: url })}
              label="Poster Image (shown while loading)"
            />
            <div className="grid grid-cols-3 gap-4">
              <div className="flex items-center justify-between">
                <Label htmlFor="video-autoplay" className="text-sm">Autoplay</Label>
                <Switch
                  id="video-autoplay"
                  checked={localData.videoAutoplay !== false}
                  onCheckedChange={(checked) => handleChange({ videoAutoplay: checked })}
                />
              </div>
              <div className="flex items-center justify-between">
                <Label htmlFor="video-loop" className="text-sm">Loop</Label>
                <Switch
                  id="video-loop"
                  checked={localData.videoLoop !== false}
                  onCheckedChange={(checked) => handleChange({ videoLoop: checked })}
                />
              </div>
              <div className="flex items-center justify-between">
                <Label htmlFor="video-muted" className="text-sm">Muted</Label>
                <Switch
                  id="video-muted"
                  checked={localData.videoMuted !== false}
                  onCheckedChange={(checked) => handleChange({ videoMuted: checked })}
                />
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              Note: Most browsers require videos to be muted for autoplay to work.
            </p>
          </div>
        )}

        {/* Color Background Info */}
        {backgroundType === 'color' && (
          <p className="text-sm text-muted-foreground p-4 border border-border rounded-lg bg-background/50">
            The hero will use your primary brand color as the background. 
            You can customize colors in Branding Settings.
          </p>
        )}

        {/* Layout Options */}
        <div className="space-y-4 p-4 border border-border rounded-lg bg-background/50">
          <Label className="text-sm font-medium">Layout Options</Label>
          
          {/* Height Mode */}
          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground">Hero Height</Label>
            <div className="grid grid-cols-4 gap-2">
              {[
                { value: 'auto', label: 'Auto', icon: null },
                { value: 'viewport', label: 'Full', icon: Maximize },
                { value: '80vh', label: '80%', icon: null },
                { value: '60vh', label: '60%', icon: null },
              ].map(({ value, label, icon: Icon }) => (
                <Button
                  key={value}
                  type="button"
                  variant={(localData.heightMode || 'auto') === value ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => handleChange({ heightMode: value as HeroBlockData['heightMode'] })}
                  className="flex items-center gap-1"
                >
                  {Icon && <Icon className="h-3 w-3" />}
                  {label}
                </Button>
              ))}
            </div>
          </div>

          {/* Content Alignment - only show when not auto */}
          {(localData.heightMode && localData.heightMode !== 'auto') && (
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">Content Position</Label>
              <div className="grid grid-cols-3 gap-2">
                {[
                  { value: 'top', label: 'Top', icon: AlignVerticalJustifyStart },
                  { value: 'center', label: 'Center', icon: AlignVerticalJustifyCenter },
                  { value: 'bottom', label: 'Bottom', icon: AlignVerticalJustifyEnd },
                ].map(({ value, label, icon: Icon }) => (
                  <Button
                    key={value}
                    type="button"
                    variant={(localData.contentAlignment || 'center') === value ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => handleChange({ contentAlignment: value as HeroBlockData['contentAlignment'] })}
                    className="flex items-center gap-1"
                  >
                    <Icon className="h-3 w-3" />
                    {label}
                  </Button>
                ))}
              </div>
            </div>
          )}

          {/* Overlay Opacity - only show when image or video */}
          {(backgroundType === 'image' || backgroundType === 'video') && (
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">
                Overlay Darkness: {localData.overlayOpacity ?? 60}%
              </Label>
              <Slider
                value={[localData.overlayOpacity ?? 60]}
                onValueChange={([value]) => handleChange({ overlayOpacity: value })}
                min={0}
                max={100}
                step={5}
                className="w-full"
              />
            </div>
          )}

          {/* Parallax Effect - only for images */}
          {backgroundType === 'image' && (
            <div className="flex items-center justify-between">
              <div>
                <Label className="text-xs text-muted-foreground">Parallax Effect</Label>
                <p className="text-xs text-muted-foreground/70">Background moves slower than content</p>
              </div>
              <Switch
                checked={localData.parallaxEffect || false}
                onCheckedChange={(checked) => handleChange({ parallaxEffect: checked })}
              />
            </div>
          )}

          {/* Title Animation */}
          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground">Title Animation</Label>
            <div className="grid grid-cols-4 gap-2">
              {[
                { value: 'none', label: 'None', icon: Type },
                { value: 'fade-in', label: 'Fade', icon: Sparkles },
                { value: 'slide-up', label: 'Slide', icon: MoveUp },
                { value: 'typewriter', label: 'Type', icon: Type },
              ].map(({ value, label, icon: Icon }) => (
                <Button
                  key={value}
                  type="button"
                  variant={(localData.titleAnimation || 'none') === value ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => handleChange({ titleAnimation: value as HeroBlockData['titleAnimation'] })}
                  className="flex items-center gap-1"
                >
                  <Icon className="h-3 w-3" />
                  {label}
                </Button>
              ))}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>Primary Button</Label>
            <Input
              value={localData.primaryButton?.text || ''}
              onChange={(e) =>
                handleChange({
                  primaryButton: { ...localData.primaryButton, text: e.target.value, url: localData.primaryButton?.url || '' },
                })
              }
              placeholder="Button text"
            />
            <Input
              value={localData.primaryButton?.url || ''}
              onChange={(e) =>
                handleChange({
                  primaryButton: { ...localData.primaryButton, text: localData.primaryButton?.text || '', url: e.target.value },
                })
              }
              placeholder="Link"
            />
          </div>
          <div className="space-y-2">
            <Label>Secondary Button</Label>
            <Input
              value={localData.secondaryButton?.text || ''}
              onChange={(e) =>
                handleChange({
                  secondaryButton: { ...localData.secondaryButton, text: e.target.value, url: localData.secondaryButton?.url || '' },
                })
              }
              placeholder="Button text"
            />
            <Input
              value={localData.secondaryButton?.url || ''}
              onChange={(e) =>
                handleChange({
                  secondaryButton: { ...localData.secondaryButton, text: localData.secondaryButton?.text || '', url: e.target.value },
                })
              }
              placeholder="Link"
            />
          </div>
        </div>
      </div>
    );
  }

  // Preview mode
  const hasVideo = backgroundType === 'video' && localData.videoUrl;
  
  return (
    <div
      className="relative overflow-hidden rounded-lg bg-gradient-to-r from-primary/90 to-primary text-primary-foreground"
      style={{
        backgroundImage: backgroundType === 'image' && localData.backgroundImage ? `url(${localData.backgroundImage})` : undefined,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
      }}
    >
      {hasVideo && (
        <video
          autoPlay
          loop
          muted
          playsInline
          className="absolute inset-0 w-full h-full object-cover"
          poster={localData.videoPosterUrl}
        >
          <source src={localData.videoUrl} type="video/mp4" />
        </video>
      )}
      <div className="absolute inset-0 bg-primary/70" />
      <div className="relative z-10 px-8 py-16 text-center">
        <h1 className="text-3xl font-bold mb-3">{localData.title || 'Hero Heading'}</h1>
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
