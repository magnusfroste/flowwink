import { useState } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Slider } from '@/components/ui/slider';
import { HeroBlockData, HeroLayout, HeroVideoType, HeroOverlayColor, HeroTextAlignment } from '@/types/cms';
import { ImageUploader } from '../ImageUploader';
import { AITextAssistant } from '../AITextAssistant';
import { 
  Image, Video, Palette, Maximize, AlignVerticalJustifyStart, AlignVerticalJustifyCenter, 
  AlignVerticalJustifyEnd, Type, MoveUp, Sparkles, ChevronDown, LayoutTemplate, 
  PanelLeftInactive, PanelRightInactive, AlignCenter, AlignLeft, AlignRight,
  Youtube, FileVideo, Moon, Sun, Paintbrush
} from 'lucide-react';

interface HeroBlockEditorProps {
  data: HeroBlockData;
  onChange: (data: HeroBlockData) => void;
  isEditing: boolean;
}

const LAYOUT_OPTIONS: { value: HeroLayout; label: string; icon: typeof LayoutTemplate }[] = [
  { value: 'centered', label: 'Centered', icon: AlignCenter },
  { value: 'split-left', label: 'Split (Image Left)', icon: PanelLeftInactive },
  { value: 'split-right', label: 'Split (Image Right)', icon: PanelRightInactive },
];

const VIDEO_TYPE_OPTIONS: { value: HeroVideoType; label: string; icon: typeof Youtube }[] = [
  { value: 'direct', label: 'Direct', icon: FileVideo },
  { value: 'youtube', label: 'YouTube', icon: Youtube },
  { value: 'vimeo', label: 'Vimeo', icon: Video },
];

const OVERLAY_COLOR_OPTIONS: { value: HeroOverlayColor; label: string; icon: typeof Moon }[] = [
  { value: 'dark', label: 'Dark', icon: Moon },
  { value: 'light', label: 'Light', icon: Sun },
  { value: 'primary', label: 'Brand', icon: Paintbrush },
];

const TEXT_ALIGNMENT_OPTIONS: { value: HeroTextAlignment; label: string; icon: typeof AlignCenter }[] = [
  { value: 'left', label: 'Left', icon: AlignLeft },
  { value: 'center', label: 'Center', icon: AlignCenter },
  { value: 'right', label: 'Right', icon: AlignRight },
];

export function HeroBlockEditor({ data, onChange, isEditing }: HeroBlockEditorProps) {
  const [localData, setLocalData] = useState<HeroBlockData>(data);

  const handleChange = (updates: Partial<HeroBlockData>) => {
    const newData = { ...localData, ...updates };
    setLocalData(newData);
    onChange(newData);
  };

  const layout = localData.layout || 'centered';
  const backgroundType = localData.backgroundType || 'image';
  const videoType = localData.videoType || 'direct';
  const isSplitLayout = layout === 'split-left' || layout === 'split-right';

  if (isEditing) {
    return (
      <div className="space-y-4 p-4 bg-muted/50 rounded-lg">
        {/* Layout Selector */}
        <div className="space-y-3">
          <Label>Layout</Label>
          <div className="grid grid-cols-3 gap-2">
            {LAYOUT_OPTIONS.map(({ value, label, icon: Icon }) => (
              <Button
                key={value}
                type="button"
                variant={layout === value ? 'default' : 'outline'}
                size="sm"
                onClick={() => handleChange({ layout: value })}
                className="flex items-center gap-2"
              >
                <Icon className="h-4 w-4" />
                <span className="hidden sm:inline">{label}</span>
              </Button>
            ))}
          </div>
        </div>

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

        {/* Background Type Selector - only show for centered layout */}
        {!isSplitLayout && (
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
        )}

        {/* Image/Media uploader for split layout */}
        {isSplitLayout && (
          <div className="space-y-3">
            <Label>Media (Image or Video)</Label>
            <ImageUploader
              value={localData.backgroundImage || ''}
              onChange={(url) => handleChange({ backgroundImage: url, backgroundType: 'image' })}
              label="Image"
            />
            <p className="text-xs text-muted-foreground">
              Or use a video background:
            </p>
            {/* Video Type Selector for split layout */}
            <div className="flex gap-2">
              {VIDEO_TYPE_OPTIONS.map(({ value, label, icon: Icon }) => (
                <Button
                  key={value}
                  type="button"
                  variant={videoType === value ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => handleChange({ videoType: value, backgroundType: 'video' })}
                  className="flex items-center gap-1"
                >
                  <Icon className="h-3 w-3" />
                  {label}
                </Button>
              ))}
            </div>
            <Input
              value={localData.videoUrl || ''}
              onChange={(e) => handleChange({ videoUrl: e.target.value, backgroundType: 'video' })}
              placeholder={videoType === 'youtube' ? 'YouTube URL or ID' : videoType === 'vimeo' ? 'Vimeo URL or ID' : 'Video URL (MP4)'}
            />
          </div>
        )}

        {/* Image Background Options - for centered layout */}
        {!isSplitLayout && backgroundType === 'image' && (
          <ImageUploader
            value={localData.backgroundImage || ''}
            onChange={(url) => handleChange({ backgroundImage: url })}
            label="Background Image"
          />
        )}

        {/* Video Background Options - for centered layout */}
        {!isSplitLayout && backgroundType === 'video' && (
          <div className="space-y-4 p-4 border border-border rounded-lg bg-background/50">
            {/* Video Type Selector */}
            <div className="space-y-2">
              <Label>Video Source</Label>
              <div className="flex gap-2">
                {VIDEO_TYPE_OPTIONS.map(({ value, label, icon: Icon }) => (
                  <Button
                    key={value}
                    type="button"
                    variant={videoType === value ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => handleChange({ videoType: value })}
                    className="flex items-center gap-1"
                  >
                    <Icon className="h-3 w-3" />
                    {label}
                  </Button>
                ))}
              </div>
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="video-url">
                {videoType === 'youtube' ? 'YouTube URL' : videoType === 'vimeo' ? 'Vimeo URL' : 'Video URL (MP4)'}
              </Label>
              <Input
                id="video-url"
                value={localData.videoUrl || ''}
                onChange={(e) => handleChange({ videoUrl: e.target.value })}
                placeholder={
                  videoType === 'youtube' 
                    ? 'https://youtube.com/watch?v=... or video ID' 
                    : videoType === 'vimeo' 
                    ? 'https://vimeo.com/... or video ID'
                    : 'https://example.com/video.mp4'
                }
              />
              <p className="text-xs text-muted-foreground">
                {videoType === 'youtube' 
                  ? 'Paste a YouTube URL or video ID'
                  : videoType === 'vimeo'
                  ? 'Paste a Vimeo URL or video ID'
                  : 'Use a direct link to an MP4 file or CDN URL'
                }
              </p>
            </div>
            
            {/* WebM fallback only for direct videos */}
            {videoType === 'direct' && (
              <div className="space-y-2">
                <Label htmlFor="video-webm">WebM Fallback (Optional)</Label>
                <Input
                  id="video-webm"
                  value={localData.videoUrlWebm || ''}
                  onChange={(e) => handleChange({ videoUrlWebm: e.target.value })}
                  placeholder="https://example.com/video.webm"
                />
              </div>
            )}
            
            <ImageUploader
              value={localData.videoPosterUrl || ''}
              onChange={(url) => handleChange({ videoPosterUrl: url })}
              label="Poster Image (shown while loading)"
            />
            
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
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
              {videoType === 'direct' && (
                <div className="flex items-center justify-between">
                  <Label htmlFor="video-controls" className="text-sm">Controls</Label>
                  <Switch
                    id="video-controls"
                    checked={localData.showVideoControls || false}
                    onCheckedChange={(checked) => handleChange({ showVideoControls: checked })}
                  />
                </div>
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              Note: Most browsers require videos to be muted for autoplay to work.
            </p>
          </div>
        )}

        {/* Color Background Info - for centered layout */}
        {!isSplitLayout && backgroundType === 'color' && (
          <p className="text-sm text-muted-foreground p-4 border border-border rounded-lg bg-background/50">
            The hero will use your primary brand color as the background. 
            You can customize colors in Branding Settings.
          </p>
        )}

        {/* Layout Options - only for centered layout */}
        {!isSplitLayout && (
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
            
            {/* Text Alignment */}
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">Text Alignment</Label>
              <div className="grid grid-cols-3 gap-2">
                {TEXT_ALIGNMENT_OPTIONS.map(({ value, label, icon: Icon }) => (
                  <Button
                    key={value}
                    type="button"
                    variant={(localData.textAlignment || 'center') === value ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => handleChange({ textAlignment: value })}
                    className="flex items-center gap-1"
                  >
                    <Icon className="h-3 w-3" />
                    {label}
                  </Button>
                ))}
              </div>
            </div>

            {/* Overlay settings - only show when image or video */}
            {(backgroundType === 'image' || backgroundType === 'video') && (
              <>
                {/* Overlay Color */}
                <div className="space-y-2">
                  <Label className="text-xs text-muted-foreground">Overlay Color</Label>
                  <div className="grid grid-cols-3 gap-2">
                    {OVERLAY_COLOR_OPTIONS.map(({ value, label, icon: Icon }) => (
                      <Button
                        key={value}
                        type="button"
                        variant={(localData.overlayColor || 'dark') === value ? 'default' : 'outline'}
                        size="sm"
                        onClick={() => handleChange({ overlayColor: value })}
                        className="flex items-center gap-1"
                      >
                        <Icon className="h-3 w-3" />
                        {label}
                      </Button>
                    ))}
                  </div>
                </div>
                
                {/* Overlay Opacity */}
                <div className="space-y-2">
                  <Label className="text-xs text-muted-foreground">
                    Overlay Opacity: {localData.overlayOpacity ?? 60}%
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
              </>
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

            {/* Scroll Indicator - only for tall heroes */}
            {(localData.heightMode && localData.heightMode !== 'auto') && (
              <div className="flex items-center justify-between">
                <div>
                  <Label className="text-xs text-muted-foreground flex items-center gap-1">
                    <ChevronDown className="h-3 w-3" />
                    Scroll Indicator
                  </Label>
                  <p className="text-xs text-muted-foreground/70">Show animated arrow at bottom</p>
                </div>
                <Switch
                  checked={localData.showScrollIndicator || false}
                  onCheckedChange={(checked) => handleChange({ showScrollIndicator: checked })}
                />
              </div>
            )}
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
  
  // Split layout preview
  if (isSplitLayout) {
    const imageOnLeft = layout === 'split-left';
    return (
      <div className="grid md:grid-cols-2 min-h-[300px] rounded-lg overflow-hidden">
        <div className={`relative bg-muted ${!imageOnLeft ? 'md:order-2' : ''}`}>
          {localData.backgroundImage ? (
            <img src={localData.backgroundImage} alt="" className="absolute inset-0 w-full h-full object-cover" />
          ) : hasVideo ? (
            <div className="absolute inset-0 bg-gradient-to-br from-primary/20 to-primary/40 flex items-center justify-center">
              <Video className="h-12 w-12 text-primary/50" />
            </div>
          ) : (
            <div className="absolute inset-0 bg-gradient-to-br from-primary/20 to-primary/40" />
          )}
        </div>
        <div className={`flex flex-col justify-center p-8 bg-background ${!imageOnLeft ? 'md:order-1' : ''}`}>
          <h1 className="font-serif text-2xl font-bold mb-4 text-foreground">{localData.title || 'Hero Title'}</h1>
          {localData.subtitle && <p className="text-muted-foreground mb-6">{localData.subtitle}</p>}
          <div className="flex flex-wrap gap-3">
            {localData.primaryButton?.text && (
              <span className="px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium">
                {localData.primaryButton.text}
              </span>
            )}
            {localData.secondaryButton?.text && (
              <span className="px-4 py-2 border border-border rounded-lg text-sm font-medium">
                {localData.secondaryButton.text}
              </span>
            )}
          </div>
        </div>
      </div>
    );
  }
  
  // Centered layout preview
  return (
    <div 
      className="relative min-h-[300px] rounded-lg overflow-hidden flex items-center justify-center bg-primary text-primary-foreground"
      style={localData.backgroundImage ? { backgroundImage: `url(${localData.backgroundImage})`, backgroundSize: 'cover', backgroundPosition: 'center' } : undefined}
    >
      {localData.backgroundImage && <div className="absolute inset-0 bg-primary/60" />}
      {hasVideo && !localData.backgroundImage && (
        <div className="absolute inset-0 bg-gradient-to-br from-primary/80 to-primary/60 flex items-center justify-center">
          <Video className="h-16 w-16 text-primary-foreground/30" />
        </div>
      )}
      <div className="relative z-10 text-center px-6 py-12">
        <h1 className="font-serif text-3xl font-bold mb-4">{localData.title || 'Hero Title'}</h1>
        {localData.subtitle && <p className="text-lg opacity-90 mb-6">{localData.subtitle}</p>}
        <div className="flex gap-3 justify-center flex-wrap">
          {localData.primaryButton?.text && (
            <span className="px-5 py-2.5 bg-background text-foreground rounded-lg font-medium">
              {localData.primaryButton.text}
            </span>
          )}
          {localData.secondaryButton?.text && (
            <span className="px-5 py-2.5 border border-current rounded-lg font-medium">
              {localData.secondaryButton.text}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
