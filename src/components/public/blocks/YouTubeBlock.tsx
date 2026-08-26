import { YouTubeBlockData } from '@/types/cms';

interface YouTubeBlockProps {
  data: YouTubeBlockData;
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

export function YouTubeBlock({ data }: YouTubeBlockProps) {
  const videoId = extractYouTubeId(data.url || '');

  if (!videoId) {
    return null;
  }

  return (
    <section>
      <div className="container mx-auto px-4 max-w-4xl">
        <div className="aspect-video rounded-xl overflow-hidden shadow-lg">
          <iframe
            src={buildEmbedUrl(videoId, data)}
            title={data.title || 'YouTube video'}
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
            className="w-full h-full"
          />
        </div>
        {data.title && (
          <p className="mt-4 text-center text-muted-foreground">{data.title}</p>
        )}
      </div>
    </section>
  );
}
