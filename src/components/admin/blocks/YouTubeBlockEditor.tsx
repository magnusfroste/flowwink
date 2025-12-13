import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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

export function YouTubeBlockEditor({ data, onChange, isEditing }: YouTubeBlockEditorProps) {
  const videoId = extractYouTubeId(data.url || '');
  
  if (!isEditing) {
    return (
      <div className="space-y-2">
        {videoId ? (
          <div className="aspect-video bg-muted rounded-lg overflow-hidden">
            <iframe
              src={`https://www.youtube.com/embed/${videoId}`}
              title={data.title || 'YouTube video'}
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
              className="w-full h-full"
            />
          </div>
        ) : (
          <div className="aspect-video bg-muted rounded-lg flex items-center justify-center text-muted-foreground">
            Ingen video-URL angiven
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
          Stödjer youtube.com/watch, youtu.be och embed-länkar
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="youtube-title">Titel (valfritt)</Label>
        <Input
          id="youtube-title"
          value={data.title || ''}
          onChange={(e) => onChange({ ...data, title: e.target.value })}
          placeholder="Videotitel"
        />
      </div>

      {videoId && (
        <div className="space-y-2">
          <Label>Förhandsvisning</Label>
          <div className="aspect-video bg-muted rounded-lg overflow-hidden">
            <iframe
              src={`https://www.youtube.com/embed/${videoId}`}
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
