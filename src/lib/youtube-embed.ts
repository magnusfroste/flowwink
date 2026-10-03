/**
 * YouTube embed URLs — one writer for the public block, its admin preview and
 * the hero's video background.
 *
 * Privacy-enhanced by default: youtube-nocookie.com does not set tracking
 * cookies before the visitor plays. The plain host is kept only when a block
 * opts out (`privacyMode: false`). Until 2026-10-03 the renderer, the editor and
 * the hero each built their own `https://www.youtube.com/embed/...` string, so
 * the host could never be changed in one place (Hermes feedback, #619 point 5).
 */

export const YOUTUBE_EMBED_HOST_PRIVACY = 'https://www.youtube-nocookie.com';
export const YOUTUBE_EMBED_HOST_PLAIN = 'https://www.youtube.com';

export function youtubeEmbedHost(privacyMode: boolean | undefined): string {
  return privacyMode === false ? YOUTUBE_EMBED_HOST_PLAIN : YOUTUBE_EMBED_HOST_PRIVACY;
}

/** watch?v=ID, youtu.be/ID, /embed/ID, /shorts/ID, nocookie, or a bare 11-char ID. */
export function extractYouTubeId(url: string): string | null {
  const patterns = [
    /(?:youtube(?:-nocookie)?\.com\/(?:watch\?(?:.*&)?v=|embed\/|shorts\/|live\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/,
    /^([a-zA-Z0-9_-]{11})$/,
  ];
  for (const pattern of patterns) {
    const match = url.trim().match(pattern);
    if (match) return match[1];
  }
  return null;
}

export interface YouTubeEmbedOptions {
  autoplay?: boolean;
  loop?: boolean;
  mute?: boolean;
  controls?: boolean;
  privacyMode?: boolean;
}

export function buildYouTubeEmbedUrl(videoId: string, opts: YouTubeEmbedOptions): string {
  const params = new URLSearchParams();
  if (opts.autoplay) params.set('autoplay', '1');
  if (opts.loop) {
    params.set('loop', '1');
    params.set('playlist', videoId);
  }
  if (opts.mute) params.set('mute', '1');
  if (opts.controls === false) params.set('controls', '0');
  const qs = params.toString();
  return `${youtubeEmbedHost(opts.privacyMode)}/embed/${videoId}${qs ? '?' + qs : ''}`;
}
