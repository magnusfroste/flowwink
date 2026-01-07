import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Link2, Code, Film, Music, Figma, Video } from 'lucide-react';
import type { EmbedBlockData, EmbedProvider } from '@/components/public/blocks/EmbedBlock';
import { cn } from '@/lib/utils';

export interface EmbedBlockEditorProps {
  data: EmbedBlockData;
  onChange: (data: EmbedBlockData) => void;
  isEditing: boolean;
}

const PROVIDER_ICONS: Record<EmbedProvider, React.ReactNode> = {
  vimeo: <Film className="h-4 w-4" />,
  spotify: <Music className="h-4 w-4" />,
  soundcloud: <Music className="h-4 w-4" />,
  codepen: <Code className="h-4 w-4" />,
  figma: <Figma className="h-4 w-4" />,
  loom: <Video className="h-4 w-4" />,
  custom: <Code className="h-4 w-4" />,
};

const PROVIDER_LABELS: Record<EmbedProvider, string> = {
  vimeo: 'Vimeo',
  spotify: 'Spotify',
  soundcloud: 'SoundCloud',
  codepen: 'CodePen',
  figma: 'Figma',
  loom: 'Loom',
  custom: 'Custom',
};

// Detect provider from URL
function detectProvider(url: string): EmbedProvider {
  if (!url) return 'custom';
  
  if (url.includes('vimeo.com')) return 'vimeo';
  if (url.includes('spotify.com')) return 'spotify';
  if (url.includes('soundcloud.com')) return 'soundcloud';
  if (url.includes('codepen.io')) return 'codepen';
  if (url.includes('figma.com')) return 'figma';
  if (url.includes('loom.com')) return 'loom';
  
  return 'custom';
}

export function EmbedBlockEditor({ data, onChange, isEditing }: EmbedBlockEditorProps) {
  const detectedProvider = detectProvider(data.url);

  if (!isEditing) {
    return (
      <div className="p-6 text-center bg-muted/50 rounded-lg">
        <div className="flex items-center justify-center gap-2 text-muted-foreground">
          {PROVIDER_ICONS[data.provider || detectedProvider]}
          <span className="font-medium">
            {PROVIDER_LABELS[data.provider || detectedProvider]} Embed
          </span>
        </div>
        {data.url && (
          <p className="mt-2 text-sm text-muted-foreground truncate max-w-md mx-auto">
            {data.url}
          </p>
        )}
        {!data.url && !data.customEmbed && (
          <p className="mt-2 text-sm text-muted-foreground">Click to configure embed</p>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4 p-4">
      <Tabs defaultValue="url" className="w-full">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="url" className="gap-2">
            <Link2 className="h-4 w-4" />
            URL
          </TabsTrigger>
          <TabsTrigger value="custom" className="gap-2">
            <Code className="h-4 w-4" />
            Custom Code
          </TabsTrigger>
        </TabsList>

        <TabsContent value="url" className="space-y-4 mt-4">
          <div className="space-y-2">
            <Label>Embed URL</Label>
            <Input
              value={data.url || ''}
              onChange={(e) => onChange({ ...data, url: e.target.value })}
              placeholder="https://vimeo.com/123456789"
            />
            <p className="text-xs text-muted-foreground">
              Supports: Vimeo, Spotify, SoundCloud, CodePen, Figma, Loom
            </p>
          </div>

          {data.url && (
            <div className="flex items-center gap-2 p-2 bg-muted rounded-md">
              {PROVIDER_ICONS[detectedProvider]}
              <span className="text-sm">
                Detected: <strong>{PROVIDER_LABELS[detectedProvider]}</strong>
              </span>
            </div>
          )}
        </TabsContent>

        <TabsContent value="custom" className="space-y-4 mt-4">
          <div className="space-y-2">
            <Label>Custom Embed Code</Label>
            <Textarea
              value={data.customEmbed || ''}
              onChange={(e) => onChange({ ...data, customEmbed: e.target.value })}
              placeholder="<iframe src='...' ...></iframe>"
              className="font-mono text-sm min-h-[120px]"
            />
            <p className="text-xs text-muted-foreground">
              Paste any embed code (iframe, embed, etc.)
            </p>
          </div>
        </TabsContent>
      </Tabs>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Aspect Ratio</Label>
          <Select
            value={data.aspectRatio || 'auto'}
            onValueChange={(value) => onChange({ ...data, aspectRatio: value as EmbedBlockData['aspectRatio'] })}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="auto">Auto (based on content)</SelectItem>
              <SelectItem value="16:9">16:9 (Video)</SelectItem>
              <SelectItem value="4:3">4:3</SelectItem>
              <SelectItem value="1:1">1:1 (Square)</SelectItem>
              <SelectItem value="9:16">9:16 (Vertical)</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label>Max Width</Label>
          <Select
            value={data.maxWidth || 'lg'}
            onValueChange={(value) => onChange({ ...data, maxWidth: value as EmbedBlockData['maxWidth'] })}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="sm">Small</SelectItem>
              <SelectItem value="md">Medium</SelectItem>
              <SelectItem value="lg">Large</SelectItem>
              <SelectItem value="full">Full Width</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="space-y-2">
        <Label>Variant</Label>
        <Select
          value={data.variant || 'default'}
          onValueChange={(value) => onChange({ ...data, variant: value as EmbedBlockData['variant'] })}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="default">Default</SelectItem>
            <SelectItem value="card">Card</SelectItem>
            <SelectItem value="minimal">Minimal</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        <Label>Caption (optional)</Label>
        <Input
          value={data.caption || ''}
          onChange={(e) => onChange({ ...data, caption: e.target.value })}
          placeholder="Add a caption..."
        />
      </div>
    </div>
  );
}
