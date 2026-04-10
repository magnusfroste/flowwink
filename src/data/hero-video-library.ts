/**
 * Curated library of reliable, free-to-use hero background videos.
 * All URLs are from Pexels CDN (permanent, no rate limits, free for commercial use).
 * Tagged by context so the editor can pick a relevant video based on hero title/subtitle.
 *
 * NOTE: Pexels periodically blocks hotlinking on older videos.
 * Only include URLs that have been verified to return HTTP 200.
 * Last verified: 2026-04-10
 */

export interface HeroVideo {
  url: string;
  posterUrl: string;
  tags: string[];
  label: string;
}

export const heroVideoLibrary: HeroVideo[] = [
  // Technology / Digital
  {
    url: 'https://videos.pexels.com/video-files/3129671/3129671-uhd_2560_1440_30fps.mp4',
    posterUrl: 'https://images.pexels.com/videos/3129671/free-video-3129671.jpg?auto=compress&w=1920',
    tags: ['technology', 'digital', 'network', 'abstract', 'data', 'startup', 'saas', 'software', 'code', 'innovation'],
    label: 'Digital Network',
  },
  {
    url: 'https://videos.pexels.com/video-files/3571264/3571264-uhd_2560_1440_30fps.mp4',
    posterUrl: 'https://images.pexels.com/videos/3571264/free-video-3571264.jpg?auto=compress&w=1920',
    tags: ['technology', 'abstract', 'particles', 'digital', 'modern', 'startup', 'innovation'],
    label: 'Abstract Particles',
  },
  // Business / Corporate
  {
    url: 'https://videos.pexels.com/video-files/3209828/3209828-uhd_2560_1440_25fps.mp4',
    posterUrl: 'https://images.pexels.com/videos/3209828/free-video-3209828.jpg?auto=compress&w=1920',
    tags: ['business', 'office', 'team', 'corporate', 'meeting', 'collaboration', 'professional', 'agentic', 'operating system', 'leadership', 'strategy'],
    label: 'Modern Office',
  },
  // Food / Restaurant
  {
    url: 'https://videos.pexels.com/video-files/3195394/3195394-uhd_2560_1440_25fps.mp4',
    posterUrl: 'https://images.pexels.com/videos/3195394/free-video-3195394.jpg?auto=compress&w=1920',
    tags: ['food', 'restaurant', 'cooking', 'kitchen', 'dining', 'hospitality', 'chef'],
    label: 'Kitchen Action',
  },
];

/**
 * Find the best matching video based on context text (title + subtitle).
 * Uses simple keyword matching with scoring.
 */
export function findBestVideo(context: string, excludeUrl?: string): HeroVideo {
  const contextLower = context.toLowerCase();
  const words = contextLower.split(/\s+/).filter(w => w.length > 2);

  const scored = heroVideoLibrary
    .filter(v => v.url !== excludeUrl)
    .map(video => {
      let score = 0;
      for (const tag of video.tags) {
        if (contextLower.includes(tag)) {
          score += 3;
        }
        for (const word of words) {
          if (tag.includes(word) || word.includes(tag)) {
            score += 1;
          }
        }
      }
      return { video, score };
    });

  scored.sort((a, b) => b.score - a.score);

  const topScore = scored[0]?.score || 0;
  if (topScore > 0) {
    const topTier = scored.filter(s => s.score >= topScore * 0.6);
    return topTier[Math.floor(Math.random() * topTier.length)].video;
  }

  const available = scored.map(s => s.video);
  return available[Math.floor(Math.random() * available.length)];
}
