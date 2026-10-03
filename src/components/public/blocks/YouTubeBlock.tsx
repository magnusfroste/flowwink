import { useState } from 'react';
import { Play } from 'lucide-react';
import { YouTubeBlockData } from '@/types/cms';
import { useUiText } from '@/lib/ui-text';
import { buildYouTubeEmbedUrl, extractYouTubeId } from '@/lib/youtube-embed';

interface YouTubeBlockProps {
  data: YouTubeBlockData;
}

/**
 * Privacy posture, in two steps the operator chooses between:
 *
 *   1. No poster — the iframe loads at once, from youtube-nocookie.com unless the
 *      block opts out (`privacyMode: false`). No tracking cookie before play, but
 *      YouTube is contacted on page load.
 *   2. A first-party `poster` — nothing from YouTube is requested until the visitor
 *      clicks the poster; then the iframe mounts with autoplay so one click plays.
 *      YouTube's own thumbnail (i.ytimg.com) is deliberately NOT used as the
 *      placeholder: it is the third-party request the poster exists to avoid.
 */
export function YouTubeBlock({ data }: YouTubeBlockProps) {
  const t = useUiText();
  const [activated, setActivated] = useState(false);
  const videoId = extractYouTubeId(data.url || '');

  if (!videoId) {
    return null;
  }

  const poster = typeof data.poster === 'string' ? data.poster.trim() : '';
  const waitingForClick = !!poster && !activated;
  const title = data.title || t('youtube.defaultTitle', 'Video');

  return (
    <section>
      <div className="container mx-auto px-4 max-w-4xl">
        <div className="aspect-video rounded-xl overflow-hidden shadow-lg bg-muted">
          {waitingForClick ? (
            <button
              type="button"
              onClick={() => setActivated(true)}
              aria-label={t('youtube.play', 'Play video')}
              className="group relative block h-full w-full focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <img src={poster} alt={title} loading="lazy" className="h-full w-full object-cover" />
              <span className="absolute inset-0 flex items-center justify-center bg-foreground/10 transition-colors group-hover:bg-foreground/20">
                <span className="flex h-16 w-16 items-center justify-center rounded-full bg-background/90 text-foreground shadow-lg transition-transform group-hover:scale-105">
                  <Play className="ml-1 h-7 w-7" aria-hidden="true" />
                </span>
              </span>
            </button>
          ) : (
            <iframe
              src={buildYouTubeEmbedUrl(videoId, {
                autoplay: data.autoplay || activated,
                loop: data.loop,
                mute: data.mute,
                controls: data.controls,
                privacyMode: data.privacyMode,
              })}
              title={title}
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
              className="w-full h-full"
            />
          )}
        </div>
        {data.title && (
          <p className="mt-4 text-center text-muted-foreground">{data.title}</p>
        )}
      </div>
    </section>
  );
}
