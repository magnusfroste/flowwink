import { useEffect, useRef, useState } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Wand2, Play, MousePointer, Scroll, Hand, Settings, Layout, Palette } from 'lucide-react';
import type { LottieBlockData } from '@/components/public/blocks/LottieBlock';
import { cn } from '@/lib/utils';

export interface LottieBlockEditorProps {
  data: LottieBlockData;
  onChange: (data: LottieBlockData) => void;
  isEditing: boolean;
}

export function LottieBlockEditor({ data, onChange, isEditing }: LottieBlockEditorProps) {
  const [Player, setPlayer] = useState<React.ComponentType<any> | null>(null);
  const [isValidUrl, setIsValidUrl] = useState(true);
  const playerRef = useRef<any>(null);

  // Dynamic import of lottie player
  useEffect(() => {
    import('@lottiefiles/react-lottie-player').then((module) => {
      setPlayer(() => module.Player);
    });
  }, []);

  // Validate URL
  useEffect(() => {
    if (!data.src) {
      setIsValidUrl(true);
      return;
    }
    try {
      new URL(data.src);
      setIsValidUrl(data.src.endsWith('.json') || data.src.includes('lottie'));
    } catch {
      setIsValidUrl(false);
    }
  }, [data.src]);

  if (!isEditing) {
    return (
      <div className="p-6 text-center bg-muted/50 rounded-lg">
        <div className="flex items-center justify-center gap-2 text-muted-foreground">
          <Wand2 className="h-5 w-5" />
          <span className="font-medium">Lottie Animation</span>
        </div>
        {data.src ? (
          <div className="mt-4 max-w-[200px] mx-auto">
            {Player && (
              <Player
                src={data.src}
                autoplay
                loop
                style={{ width: '100%', height: 'auto' }}
              />
            )}
          </div>
        ) : (
          <p className="mt-2 text-sm text-muted-foreground">Click to configure animation</p>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4 p-4">
      <Tabs defaultValue="source" className="w-full">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="source" className="gap-1.5">
            <Wand2 className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Source</span>
          </TabsTrigger>
          <TabsTrigger value="playback" className="gap-1.5">
            <Play className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Playback</span>
          </TabsTrigger>
          <TabsTrigger value="layout" className="gap-1.5">
            <Layout className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Layout</span>
          </TabsTrigger>
          <TabsTrigger value="style" className="gap-1.5">
            <Palette className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Style</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="source" className="space-y-4 mt-4">
          <div className="space-y-2">
            <Label>Animation URL</Label>
            <Input
              value={data.src || ''}
              onChange={(e) => onChange({ ...data, src: e.target.value })}
              placeholder="https://assets.lottiefiles.com/..."
              className={cn(!isValidUrl && 'border-destructive')}
            />
            <p className="text-xs text-muted-foreground">
              Paste a URL to a Lottie JSON animation file. Get free animations at{' '}
              <a 
                href="https://lottiefiles.com" 
                target="_blank" 
                rel="noopener noreferrer"
                className="text-primary hover:underline"
              >
                LottieFiles.com
              </a>
            </p>
            {!isValidUrl && (
              <p className="text-xs text-destructive">URL should point to a .json Lottie file</p>
            )}
          </div>

          {/* Preview */}
          {data.src && Player && isValidUrl && (
            <div className="border rounded-lg p-4 bg-muted/30">
              <p className="text-xs text-muted-foreground mb-2 font-medium">Preview</p>
              <div className="max-w-[200px] mx-auto">
                <Player
                  ref={playerRef}
                  src={data.src}
                  autoplay
                  loop
                  style={{ width: '100%', height: 'auto' }}
                />
              </div>
            </div>
          )}

          <div className="space-y-2">
            <Label>Alt Text (accessibility)</Label>
            <Input
              value={data.alt || ''}
              onChange={(e) => onChange({ ...data, alt: e.target.value })}
              placeholder="Describe the animation for screen readers"
            />
          </div>

          <div className="space-y-2">
            <Label>Caption (optional)</Label>
            <Input
              value={data.caption || ''}
              onChange={(e) => onChange({ ...data, caption: e.target.value })}
              placeholder="Add a caption below the animation"
            />
          </div>
        </TabsContent>

        <TabsContent value="playback" className="space-y-4 mt-4">
          <div className="space-y-2">
            <Label>Play Trigger</Label>
            <Select
              value={data.playOn || 'load'}
              onValueChange={(value) => onChange({ ...data, playOn: value as LottieBlockData['playOn'] })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="load">
                  <div className="flex items-center gap-2">
                    <Play className="h-4 w-4" />
                    On Page Load
                  </div>
                </SelectItem>
                <SelectItem value="hover">
                  <div className="flex items-center gap-2">
                    <MousePointer className="h-4 w-4" />
                    On Hover
                  </div>
                </SelectItem>
                <SelectItem value="click">
                  <div className="flex items-center gap-2">
                    <Hand className="h-4 w-4" />
                    On Click
                  </div>
                </SelectItem>
                <SelectItem value="scroll">
                  <div className="flex items-center gap-2">
                    <Scroll className="h-4 w-4" />
                    When Visible (scroll)
                  </div>
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          {data.playOn !== 'hover' && (
            <div className="space-y-2">
              <Label>Hover Action</Label>
              <Select
                value={data.hoverAction || 'play'}
                onValueChange={(value) => onChange({ ...data, hoverAction: value as LottieBlockData['hoverAction'] })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="play">Play</SelectItem>
                  <SelectItem value="pause">Pause</SelectItem>
                  <SelectItem value="reverse">Reverse</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label>Loop</Label>
              <p className="text-xs text-muted-foreground">Repeat animation continuously</p>
            </div>
            <Switch
              checked={data.loop !== false}
              onCheckedChange={(checked) => onChange({ ...data, loop: checked })}
            />
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Speed</Label>
              <span className="text-sm text-muted-foreground">{data.speed || 1}x</span>
            </div>
            <Slider
              value={[data.speed || 1]}
              min={0.25}
              max={2}
              step={0.25}
              onValueChange={([value]) => onChange({ ...data, speed: value })}
            />
            <p className="text-xs text-muted-foreground">0.25x (slow) to 2x (fast)</p>
          </div>

          <div className="space-y-2">
            <Label>Direction</Label>
            <Select
              value={data.direction || 'forward'}
              onValueChange={(value) => onChange({ ...data, direction: value as LottieBlockData['direction'] })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="forward">Forward</SelectItem>
                <SelectItem value="reverse">Reverse</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </TabsContent>

        <TabsContent value="layout" className="space-y-4 mt-4">
          <div className="space-y-2">
            <Label>Size</Label>
            <Select
              value={data.size || 'md'}
              onValueChange={(value) => onChange({ ...data, size: value as LottieBlockData['size'] })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="sm">Small (200px)</SelectItem>
                <SelectItem value="md">Medium (320px)</SelectItem>
                <SelectItem value="lg">Large (480px)</SelectItem>
                <SelectItem value="xl">Extra Large (640px)</SelectItem>
                <SelectItem value="full">Full Width</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Custom Max Width (optional)</Label>
            <Input
              type="number"
              value={data.maxWidth || ''}
              onChange={(e) => onChange({ ...data, maxWidth: e.target.value ? parseInt(e.target.value) : undefined })}
              placeholder="e.g., 400"
            />
            <p className="text-xs text-muted-foreground">Override size with custom pixel width</p>
          </div>

          <div className="space-y-2">
            <Label>Aspect Ratio</Label>
            <Select
              value={data.aspectRatio || 'auto'}
              onValueChange={(value) => onChange({ ...data, aspectRatio: value as LottieBlockData['aspectRatio'] })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="auto">Auto (native)</SelectItem>
                <SelectItem value="1:1">1:1 (Square)</SelectItem>
                <SelectItem value="16:9">16:9 (Widescreen)</SelectItem>
                <SelectItem value="4:3">4:3</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Alignment</Label>
            <Select
              value={data.alignment || 'center'}
              onValueChange={(value) => onChange({ ...data, alignment: value as LottieBlockData['alignment'] })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="left">Left</SelectItem>
                <SelectItem value="center">Center</SelectItem>
                <SelectItem value="right">Right</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </TabsContent>

        <TabsContent value="style" className="space-y-4 mt-4">
          <div className="space-y-2">
            <Label>Variant</Label>
            <Select
              value={data.variant || 'default'}
              onValueChange={(value) => onChange({ ...data, variant: value as LottieBlockData['variant'] })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="default">Default (no frame)</SelectItem>
                <SelectItem value="card">Card (with shadow)</SelectItem>
                <SelectItem value="floating">Floating (drop shadow)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Background Color</Label>
            <div className="flex gap-2">
              <Input
                value={data.backgroundColor || ''}
                onChange={(e) => onChange({ ...data, backgroundColor: e.target.value })}
                placeholder="transparent"
                className="flex-1"
              />
              <input
                type="color"
                value={data.backgroundColor || '#ffffff'}
                onChange={(e) => onChange({ ...data, backgroundColor: e.target.value })}
                className="w-10 h-10 rounded border cursor-pointer"
              />
            </div>
            <p className="text-xs text-muted-foreground">Leave empty for transparent background</p>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
