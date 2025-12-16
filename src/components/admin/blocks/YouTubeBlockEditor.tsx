import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { YouTubeBlockData } from '@/types/cms';

interface YouTubeBlockEditorProps {
  data: YouTubeBlockData;
  onChange: (data: YouTubeBlockData) => void;
  isEditing: boolean;
}

function extractYouTubeId(url: string): string | null {
  const patterns = [
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([^&\n?#]+)/,
    /^([a-zA-Z0-9_-]{11})$/,
  ];
  
  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match) return match[1];
  }
  return null;
}

function buildEmbedUrl(videoId: string, data: YouTubeBlockData): string {
  const params = new URLSearchParams();
  if (data.autoplay) params.set('autoplay', '1');
  if (data.loop) {
    params.set('loop', '1');
    params.set('playlist', videoId);
  }
  if (data.mute) params.set('mute', '1');
  if (data.controls === false) params.set('controls', '0');
  
  const paramString = params.toString();
  return `https://www.youtube.com/embed/${videoId}${paramString ? '?' + paramString : ''}`;
}

export function YouTubeBlockEditor({ data, onChange, isEditing }: YouTubeBlockEditorProps) {
  const videoId = extractYouTubeId(data.url || '');
  
  if (!isEditing) {
    return (
      <div className="space-y-2">
        {videoId ? (
          <div className="aspect-video bg-muted rounded-lg overflow-hidden">
            <iframe
              src={buildEmbedUrl(videoId, data)}
              title={data.title || 'YouTube video'}
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
              className="w-full h-full"
            />
          </div>
        ) : (
          <div className="aspect-video bg-muted rounded-lg flex items-center justify-center text-muted-foreground">
            No video URL provided
          </div>
        )}
        {data.title && (
          <p className="text-sm text-muted-foreground text-center">{data.title}</p>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="youtube-url">YouTube URL</Label>
        <Input
          id="youtube-url"
          value={data.url || ''}
          onChange={(e) => onChange({ ...data, url: e.target.value })}
          placeholder="https://www.youtube.com/watch?v=..."
        />
        <p className="text-xs text-muted-foreground">
          Supports youtube.com/watch, youtu.be and embed links
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="youtube-title">Title (optional)</Label>
        <Input
          id="youtube-title"
          value={data.title || ''}
          onChange={(e) => onChange({ ...data, title: e.target.value })}
          placeholder="Video title"
        />
      </div>

      <div className="space-y-3 pt-2 border-t">
        <Label className="text-sm font-medium">Video options</Label>
        
        <div className="flex items-center justify-between">
          <div>
            <Label htmlFor="autoplay" className="text-sm">Autoplay</Label>
            <p className="text-xs text-muted-foreground">Start the video automatically</p>
          </div>
          <Switch
            id="autoplay"
            checked={data.autoplay || false}
            onCheckedChange={(checked) => onChange({ ...data, autoplay: checked })}
          />
        </div>

        <div className="flex items-center justify-between">
          <div>
            <Label htmlFor="loop" className="text-sm">Loop</Label>
            <p className="text-xs text-muted-foreground">Repeat the video</p>
          </div>
          <Switch
            id="loop"
            checked={data.loop || false}
            onCheckedChange={(checked) => onChange({ ...data, loop: checked })}
          />
        </div>

        <div className="flex items-center justify-between">
          <div>
            <Label htmlFor="mute" className="text-sm">Mute</Label>
            <p className="text-xs text-muted-foreground">Start without sound (required for autoplay)</p>
          </div>
          <Switch
            id="mute"
            checked={data.mute || false}
            onCheckedChange={(checked) => onChange({ ...data, mute: checked })}
          />
        </div>

        <div className="flex items-center justify-between">
          <div>
            <Label htmlFor="controls" className="text-sm">Show controls</Label>
            <p className="text-xs text-muted-foreground">Show play/pause buttons</p>
          </div>
          <Switch
            id="controls"
            checked={data.controls !== false}
            onCheckedChange={(checked) => onChange({ ...data, controls: checked })}
          />
        </div>
      </div>

      {videoId && (
        <div className="space-y-2 pt-2 border-t">
          <Label>Preview</Label>
          <div className="aspect-video bg-muted rounded-lg overflow-hidden">
            <iframe
              src={buildEmbedUrl(videoId, data)}
              title={data.title || 'YouTube video'}
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
              className="w-full h-full"
            />
          </div>
        </div>
      )}
    </div>
  );
}
