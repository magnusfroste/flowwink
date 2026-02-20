/**
 * Curated library of reliable, free-to-use hero background videos.
 * All URLs are from Pexels CDN (permanent, no rate limits, free for commercial use).
 * Tagged by context so the editor can pick a relevant video based on hero title/subtitle.
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
    url: 'https://videos.pexels.com/video-files/2795394/2795394-uhd_2560_1440_25fps.mp4',
    posterUrl: 'https://images.pexels.com/videos/2795394/free-video-2795394.jpg?auto=compress&w=1920',
    tags: ['city', 'business', 'corporate', 'enterprise', 'urban', 'skyline', 'office', 'professional'],
    label: 'City Skyline',
  },
  {
    url: 'https://videos.pexels.com/video-files/3209828/3209828-uhd_2560_1440_25fps.mp4',
    posterUrl: 'https://images.pexels.com/videos/3209828/free-video-3209828.jpg?auto=compress&w=1920',
    tags: ['business', 'office', 'team', 'corporate', 'meeting', 'collaboration', 'professional'],
    label: 'Modern Office',
  },
  // Nature / Wellness
  {
    url: 'https://videos.pexels.com/video-files/1093662/1093662-uhd_2560_1440_30fps.mp4',
    posterUrl: 'https://images.pexels.com/videos/1093662/free-video-1093662.jpg?auto=compress&w=1920',
    tags: ['nature', 'water', 'ocean', 'calm', 'wellness', 'health', 'spa', 'relaxation', 'meditation'],
    label: 'Ocean Waves',
  },
  {
    url: 'https://videos.pexels.com/video-files/857195/857195-hd_1920_1080_25fps.mp4',
    posterUrl: 'https://images.pexels.com/videos/857195/free-video-857195.jpg?auto=compress&w=1920',
    tags: ['nature', 'forest', 'green', 'eco', 'sustainability', 'wellness', 'organic', 'environment'],
    label: 'Forest Canopy',
  },
  // Creative / Agency
  {
    url: 'https://videos.pexels.com/video-files/5532770/5532770-uhd_2560_1440_25fps.mp4',
    posterUrl: 'https://images.pexels.com/videos/5532770/free-video-5532770.jpg?auto=compress&w=1920',
    tags: ['creative', 'design', 'agency', 'art', 'color', 'gradient', 'abstract', 'modern'],
    label: 'Creative Flow',
  },
  {
    url: 'https://videos.pexels.com/video-files/4488162/4488162-uhd_2560_1440_24fps.mp4',
    posterUrl: 'https://images.pexels.com/videos/4488162/free-video-4488162.jpg?auto=compress&w=1920',
    tags: ['creative', 'light', 'abstract', 'neon', 'agency', 'entertainment', 'music', 'event'],
    label: 'Neon Lights',
  },
  // Healthcare / Medical
  {
    url: 'https://videos.pexels.com/video-files/4173239/4173239-uhd_2560_1440_24fps.mp4',
    posterUrl: 'https://images.pexels.com/videos/4173239/free-video-4173239.jpg?auto=compress&w=1920',
    tags: ['health', 'medical', 'healthcare', 'clinic', 'hospital', 'care', 'science', 'research'],
    label: 'Medical Lab',
  },
  // Food / Restaurant
  {
    url: 'https://videos.pexels.com/video-files/3195394/3195394-uhd_2560_1440_25fps.mp4',
    posterUrl: 'https://images.pexels.com/videos/3195394/free-video-3195394.jpg?auto=compress&w=1920',
    tags: ['food', 'restaurant', 'cooking', 'kitchen', 'dining', 'hospitality', 'chef'],
    label: 'Kitchen Action',
  },
  // Architecture / Real Estate
  {
    url: 'https://videos.pexels.com/video-files/2888424/2888424-hd_1920_1080_24fps.mp4',
    posterUrl: 'https://images.pexels.com/videos/2888424/free-video-2888424.jpg?auto=compress&w=1920',
    tags: ['architecture', 'building', 'real estate', 'interior', 'luxury', 'design', 'home'],
    label: 'Modern Architecture',
  },
  // Fitness / Sports
  {
    url: 'https://videos.pexels.com/video-files/4761434/4761434-uhd_2560_1440_25fps.mp4',
    posterUrl: 'https://images.pexels.com/videos/4761434/free-video-4761434.jpg?auto=compress&w=1920',
    tags: ['fitness', 'sport', 'gym', 'training', 'exercise', 'health', 'active', 'energy'],
    label: 'Fitness Training',
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
        // Exact word match in context
        if (contextLower.includes(tag)) {
          score += 3;
        }
        // Partial word matches
        for (const word of words) {
          if (tag.includes(word) || word.includes(tag)) {
            score += 1;
          }
        }
      }
      return { video, score };
    });

  // Sort by score descending
  scored.sort((a, b) => b.score - a.score);

  // If we have matches with score > 0, pick randomly from top tier
  const topScore = scored[0]?.score || 0;
  if (topScore > 0) {
    const topTier = scored.filter(s => s.score >= topScore * 0.6);
    return topTier[Math.floor(Math.random() * topTier.length)].video;
  }

  // No context match — pick random
  const available = scored.map(s => s.video);
  return available[Math.floor(Math.random() * available.length)];
}
