import { cn } from '@/lib/utils';

export type EmbedProvider = 'vimeo' | 'spotify' | 'soundcloud' | 'codepen' | 'figma' | 'loom' | 'custom';

export interface EmbedBlockData {
  url: string;
  provider?: EmbedProvider;
  customEmbed?: string; // For custom embed codes
  aspectRatio?: '16:9' | '4:3' | '1:1' | '9:16' | 'auto';
  maxWidth?: 'sm' | 'md' | 'lg' | 'full';
  caption?: string;
  variant?: 'default' | 'card' | 'minimal';
}

interface EmbedBlockProps {
  data: EmbedBlockData;
}

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

// Extract embed URL based on provider
function getEmbedUrl(url: string, provider: EmbedProvider): string | null {
  if (!url) return null;

  switch (provider) {
    case 'vimeo': {
      const match = url.match(/vimeo\.com\/(\d+)/);
      if (match) return `https://player.vimeo.com/video/${match[1]}`;
      return null;
    }
    case 'spotify': {
      // Handle various Spotify URLs
      const trackMatch = url.match(/spotify\.com\/track\/([a-zA-Z0-9]+)/);
      if (trackMatch) return `https://open.spotify.com/embed/track/${trackMatch[1]}`;
      
      const albumMatch = url.match(/spotify\.com\/album\/([a-zA-Z0-9]+)/);
      if (albumMatch) return `https://open.spotify.com/embed/album/${albumMatch[1]}`;
      
      const playlistMatch = url.match(/spotify\.com\/playlist\/([a-zA-Z0-9]+)/);
      if (playlistMatch) return `https://open.spotify.com/embed/playlist/${playlistMatch[1]}`;
      
      const artistMatch = url.match(/spotify\.com\/artist\/([a-zA-Z0-9]+)/);
      if (artistMatch) return `https://open.spotify.com/embed/artist/${artistMatch[1]}`;
      
      const episodeMatch = url.match(/spotify\.com\/episode\/([a-zA-Z0-9]+)/);
      if (episodeMatch) return `https://open.spotify.com/embed/episode/${episodeMatch[1]}`;
      
      return null;
    }
    case 'soundcloud': {
      // SoundCloud requires their embed API, but we can try a direct embed
      return `https://w.soundcloud.com/player/?url=${encodeURIComponent(url)}&color=%23ff5500&auto_play=false&hide_related=false&show_comments=true&show_user=true&show_reposts=false&show_teaser=true`;
    }
    case 'codepen': {
      const match = url.match(/codepen\.io\/([^\/]+)\/pen\/([^\/\?]+)/);
      if (match) return `https://codepen.io/${match[1]}/embed/${match[2]}?default-tab=result`;
      return null;
    }
    case 'figma': {
      // Figma embed format
      return `https://www.figma.com/embed?embed_host=share&url=${encodeURIComponent(url)}`;
    }
    case 'loom': {
      const match = url.match(/loom\.com\/share\/([a-zA-Z0-9]+)/);
      if (match) return `https://www.loom.com/embed/${match[1]}`;
      return null;
    }
    default:
      return null;
  }
}

// Get default aspect ratio per provider
function getDefaultAspectRatio(provider: EmbedProvider): string {
  switch (provider) {
    case 'spotify':
      return 'aspect-[3/1]'; // Spotify players are wide
    case 'soundcloud':
      return 'aspect-[4/1]'; // SoundCloud players are also wide
    default:
      return 'aspect-video'; // 16:9 for video content
  }
}

export function EmbedBlock({ data }: EmbedBlockProps) {
  const provider = data.provider || detectProvider(data.url);
  const variant = data.variant || 'default';
  const maxWidth = data.maxWidth || 'lg';
  
  const maxWidthStyles = {
    sm: 'max-w-sm',
    md: 'max-w-2xl',
    lg: 'max-w-4xl',
    full: 'max-w-none',
  };

  const aspectRatioStyles = {
    '16:9': 'aspect-video',
    '4:3': 'aspect-[4/3]',
    '1:1': 'aspect-square',
    '9:16': 'aspect-[9/16]',
    'auto': getDefaultAspectRatio(provider),
  };

  const variantStyles = {
    default: 'rounded-lg overflow-hidden shadow-md',
    card: 'rounded-xl overflow-hidden shadow-lg bg-card border p-4',
    minimal: 'rounded overflow-hidden',
  };

  // If custom embed code is provided, use it
  if (data.customEmbed) {
    return (
      <section className="py-8 px-6">
        <div className={cn('container mx-auto', maxWidthStyles[maxWidth])}>
          <div className={cn(variantStyles[variant])}>
            <div 
              className={cn(aspectRatioStyles[data.aspectRatio || 'auto'], 'w-full')}
              dangerouslySetInnerHTML={{ __html: data.customEmbed }}
            />
          </div>
          {data.caption && (
            <p className="mt-3 text-sm text-muted-foreground text-center">{data.caption}</p>
          )}
        </div>
      </section>
    );
  }

  const embedUrl = getEmbedUrl(data.url, provider);

  if (!embedUrl && !data.url) {
    return (
      <section className="py-8 px-6">
        <div className={cn('container mx-auto', maxWidthStyles[maxWidth])}>
          <div className="bg-muted rounded-lg p-8 text-center text-muted-foreground">
            Paste an embed URL to display content
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="py-8 px-6">
      <div className={cn('container mx-auto', maxWidthStyles[maxWidth])}>
        <div className={cn(variantStyles[variant])}>
          <div className={cn(aspectRatioStyles[data.aspectRatio || 'auto'], 'w-full')}>
            <iframe
              src={embedUrl || data.url}
              className="w-full h-full border-0"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
              allowFullScreen
              loading="lazy"
              title="Embedded content"
            />
          </div>
        </div>
        {data.caption && (
          <p className="mt-3 text-sm text-muted-foreground text-center">{data.caption}</p>
        )}
      </div>
    </section>
  );
}
