import { Play } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { YouTubeBlockData } from '@/types/cms';
import { buildYouTubeEmbedUrl, extractYouTubeId } from '@/lib/youtube-embed';
import { ImageUploader } from '../ImageUploader';

interface YouTubeBlockEditorProps {
  data: YouTubeBlockData;
  onChange: (data: YouTubeBlockData) => void;
  isEditing: boolean;
}

/** The preview mirrors the public block: a poster means no YouTube request until a click. */
function Preview({ data, videoId }: { data: YouTubeBlockData; videoId: string }) {
  const poster = typeof data.poster === 'string' ? data.poster.trim() : '';
  if (poster) {
    return (
      <div className="relative aspect-video bg-muted rounded-lg overflow-hidden">
        <img src={poster} alt={data.title || 'Video poster'} className="h-full w-full object-cover" />
        <span className="absolute inset-0 flex items-center justify-center bg-foreground/10">
          <span className="flex h-14 w-14 items-center justify-center rounded-full bg-background/90 text-foreground shadow-lg">
            <Play className="ml-1 h-6 w-6" aria-hidden="true" />
          </span>
        </span>
      </div>
    );
  }
  return (
    <div className="aspect-video bg-muted rounded-lg overflow-hidden">
      <iframe
        src={buildYouTubeEmbedUrl(videoId, data)}
        title={data.title || 'YouTube video'}
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
        allowFullScreen
        className="w-full h-full"
      />
    </div>
  );
}

export function YouTubeBlockEditor({ data, onChange, isEditing }: YouTubeBlockEditorProps) {
  const videoId = extractYouTubeId(data.url || '');

  if (!isEditing) {
    return (
      <div className="space-y-2">
        {videoId ? (
          <Preview data={data} videoId={videoId} />
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
          Supports youtube.com/watch, youtu.be, shorts and embed links
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
        <Label className="text-sm font-medium">Privacy</Label>

        <div className="flex items-center justify-between">
          <div>
            <Label htmlFor="privacy-mode" className="text-sm">Privacy-enhanced embed</Label>
            <p className="text-xs text-muted-foreground">Load from youtube-nocookie.com — no tracking cookie before the visitor plays</p>
          </div>
          <Switch
            id="privacy-mode"
            checked={data.privacyMode !== false}
            onCheckedChange={(checked) => onChange({ ...data, privacyMode: checked })}
          />
        </div>

        <div className="space-y-2">
          <ImageUploader
            label="Poster image (click to load)"
            value={data.poster || ''}
            onChange={(url) => onChange({ ...data, poster: url })}
            aspectRatio="video"
          />
          <p className="text-xs text-muted-foreground">
            With a poster, nothing is requested from YouTube until the visitor clicks play. Use your own 16:9 image — YouTube's thumbnail would itself be a third-party request.
          </p>
        </div>
      </div>

      <div className="space-y-3 pt-2 border-t">
        <Label className="text-sm font-medium">Video options</Label>

        <div className="flex items-center justify-between">
          <div>
            <Label htmlFor="autoplay" className="text-sm">Autoplay</Label>
            <p className="text-xs text-muted-foreground">Start the video automatically (with a poster: after the click)</p>
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
          <Preview data={data} videoId={videoId} />
        </div>
      )}
    </div>
  );
}
