import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

/**
 * Block types schema for AI import.
 * 
 * IMPORTANT: Keep this in sync with src/lib/block-reference.ts
 * When adding new blocks, update both files!
 * 
 * Excluded from import (require dynamic data):
 * - products, cart, kb-featured, kb-hub, kb-search, kb-accordion, smart-booking
 */
const BLOCK_TYPES_SCHEMA = `
Available CMS block types:

1. hero - Hero section with title, subtitle, background image OR video, optional CTA button
   Data: { 
     title: string, 
     subtitle?: string, 
     backgroundType?: 'image' | 'video' | 'color', // Default: 'image'
     backgroundImage?: string, // Use for backgroundType: 'image'
     videoType?: 'direct' | 'youtube' | 'vimeo', // Use for backgroundType: 'video'
     videoUrl?: string, // MP4/WebM URL for direct, or YouTube/Vimeo URL
     videoPosterUrl?: string, // Fallback image while video loads
     videoAutoplay?: boolean, // Default: true
     videoLoop?: boolean, // Default: true
     videoMuted?: boolean, // Default: true
     primaryButton?: { text: string, url: string },
     secondaryButton?: { text: string, url: string }
   }

2. text - Rich text content block
   Data: { content: string } // HTML content

3. image - Single image block
   Data: { src: string, alt?: string, caption?: string }

4. two-column - Two column layout with text and image
   Data: { content: string, imageSrc?: string, imageAlt?: string, imagePosition: 'left' | 'right' }

5. cta - Call to action block
   Data: { title: string, subtitle?: string, buttonText: string, buttonUrl: string }

6. link-grid - Grid of link cards with icons
   Data: { links: [{ title: string, description?: string, url: string, icon?: string }], columns: 2 | 3 | 4 }

7. article-grid - Grid of article cards
   Data: { title?: string, articles: [{ title: string, excerpt?: string, url: string, image?: string }], columns: 2 | 3 | 4 }

8. accordion - FAQ/Accordion sections
   Data: { title?: string, items: [{ question: string, answer: string, image?: string, imageAlt?: string }] }

9. info-box - Highlighted info box
   Data: { title?: string, content: string, variant: 'info' | 'warning' | 'success' | 'error' }

10. quote - Blockquote with attribution
    Data: { quote: string, author?: string, role?: string }

11. stats - Statistics display
    Data: { title?: string, stats: [{ value: string, label: string }] }

12. contact - Contact information block
    Data: { title?: string, phone?: string, email?: string, address?: string, hours?: string }

13. separator - Visual separator
    Data: { style: 'line' | 'dots' | 'space' }

14. youtube - YouTube video embed
    Data: { videoId: string, title?: string } // Extract video ID from URL

15. embed - Generic embed/iframe (for Vimeo, maps, widgets, etc.)
    Data: { url: string, title?: string }

16. gallery - Image gallery
    Data: { images: [{ src: string, alt?: string, caption?: string }], columns: 2 | 3 | 4 }

17. testimonials - Customer testimonials
    Data: { title?: string, testimonials: [{ content: string, author: string, role?: string, avatar?: string }] }

18. team - Team member cards
    Data: { title?: string, members: [{ name: string, role?: string, image?: string, bio?: string, email?: string, phone?: string }] }

19. features - Feature grid
    Data: { title?: string, features: [{ title: string, description: string, icon?: string }], columns: 2 | 3 | 4 }

20. pricing - Pricing table
    Data: { tiers: [{ name: string, price: string, features: string[], buttonText?: string, buttonUrl?: string, highlighted?: boolean }] }

21. logos - Logo showcase
    Data: { title?: string, logos: [{ name: string, logo: string }] }

22. map - Google Maps embed
    Data: { address: string }

23. form - Contact form
    Data: { title?: string, fields: [{ type: 'text' | 'email' | 'textarea', label: string, required?: boolean }], submitButtonText?: string }

24. newsletter - Email signup
    Data: { title?: string, description?: string, buttonText?: string }

25. timeline - Step-by-step or chronological content
    Data: { title?: string, steps: [{ title: string, description: string }] }

26. comparison - Feature comparison table
    Data: { title?: string, products: [{ name: string }], features: [{ name: string, values: string[] }] }

27. tabs - Tabbed content sections
    Data: { tabs: [{ title: string, content: string }] }

28. table - Data table
    Data: { title?: string, columns: [{ header: string }], rows: [{ [columnId]: value }] }

29. countdown - Countdown timer
    Data: { title?: string, targetDate: string }

30. badge - Certification/trust badges
    Data: { title?: string, badges: [{ title: string, image?: string }] }

31. announcement-bar - Top banner for announcements
    Data: { message: string, link?: string, linkText?: string }

32. marquee - Scrolling text ticker
    Data: { items: [{ text: string }] }

33. social-proof - Social proof metrics
    Data: { items: [{ label: string, value: string }] }

34. lottie - Lottie animation block (native support for .json and .lottie files)
    Data: { 
      src: string,           // URL to .json or .lottie file
      alt?: string,          // Accessibility description
      autoplay?: boolean,    // Default: true
      loop?: boolean,        // Default: true
      speed?: number,        // 0.5-2, Default: 1
      direction?: 1 | -1,    // 1=forward, -1=reverse, Default: 1
      playOn?: 'load' | 'hover' | 'click' | 'scroll', // Default: 'load'
      hoverAction?: 'play' | 'pause' | 'reverse',     // Default: 'play'
      size?: 'small' | 'medium' | 'large' | 'full' | 'custom', // Default: 'medium'
      maxWidth?: number,     // Custom max width in px
      aspectRatio?: '1:1' | '16:9' | '4:3' | '3:2' | 'auto', // Default: 'auto'
      alignment?: 'left' | 'center' | 'right', // Default: 'center'
      caption?: string       // Optional caption below animation
    }
`;

// Detect platform from HTML/metadata
function detectPlatform(html: string, metadata: Record<string, unknown>): string {
  const htmlLower = html.toLowerCase();
  const generator = String(metadata.generator || '').toLowerCase();
  
  if (generator.includes('wordpress') || htmlLower.includes('wp-content') || htmlLower.includes('wp-includes')) {
    return 'wordpress';
  }
  if (htmlLower.includes('wix.com') || htmlLower.includes('wixsite') || htmlLower.includes('_wix')) {
    return 'wix';
  }
  if (htmlLower.includes('squarespace') || htmlLower.includes('sqsp')) {
    return 'squarespace';
  }
  if (htmlLower.includes('shopify') || htmlLower.includes('cdn.shopify')) {
    return 'shopify';
  }
  if (htmlLower.includes('webflow.com') || htmlLower.includes('w-') && htmlLower.includes('data-w-id')) {
    return 'webflow';
  }
  if (htmlLower.includes('ghost.io') || generator.includes('ghost')) {
    return 'ghost';
  }
  if (htmlLower.includes('hubspot') || htmlLower.includes('hs-sites')) {
    return 'hubspot';
  }
  if (htmlLower.includes('drupal') || generator.includes('drupal')) {
    return 'drupal';
  }
  if (htmlLower.includes('sitevision') || htmlLower.includes('sv-') && htmlLower.includes('sv-portlet')) {
    return 'sitevision';
  }
  if (htmlLower.includes('episerver') || htmlLower.includes('optimizely')) {
    return 'episerver';
  }
  
  return 'unknown';
}

// Extract video URLs from HTML - supports HTML5 video, YouTube, and Vimeo
function extractVideos(html: string): { type: string; url: string; id?: string; poster?: string; isHeroCandidate?: boolean }[] {
  const videos: { type: string; url: string; id?: string; poster?: string; isHeroCandidate?: boolean }[] = [];
  const seenUrls = new Set<string>();
  
  // 1. HTML5 <video> tags with source - PRIORITY for hero videos
  const videoTagRegex = /<video[^>]*>[\s\S]*?<\/video>/gi;
  let videoMatch;
  while ((videoMatch = videoTagRegex.exec(html)) !== null) {
    const videoBlock = videoMatch[0];
    
    // Check if this looks like a hero/background video
    const isHero = /hero|banner|background|fullscreen|cover/i.test(videoBlock) || 
                   /autoplay|muted|loop|playsinline/i.test(videoBlock);
    
    // Extract poster image
    const posterMatch = videoBlock.match(/poster=["']([^"']+)["']/i);
    const poster = posterMatch ? posterMatch[1] : undefined;
    
    // Extract MP4 source
    const mp4Match = videoBlock.match(/src=["']([^"']+\.mp4[^"']*)["']/i) ||
                     videoBlock.match(/<source[^>]+src=["']([^"']+\.mp4[^"']*)["']/i);
    if (mp4Match && !seenUrls.has(mp4Match[1])) {
      seenUrls.add(mp4Match[1]);
      videos.push({ 
        type: 'direct', 
        url: mp4Match[1],
        poster,
        isHeroCandidate: isHero
      });
    }
    
    // Extract WebM source
    const webmMatch = videoBlock.match(/src=["']([^"']+\.webm[^"']*)["']/i) ||
                      videoBlock.match(/<source[^>]+src=["']([^"']+\.webm[^"']*)["']/i);
    if (webmMatch && !seenUrls.has(webmMatch[1])) {
      seenUrls.add(webmMatch[1]);
      videos.push({ 
        type: 'direct', 
        url: webmMatch[1],
        poster,
        isHeroCandidate: isHero
      });
    }
  }
  
  // 2. Direct video file URLs in attributes (data-src, data-video, etc.)
  const directVideoRegex = /(?:src|data-src|data-video|href)=["']([^"']+\.(mp4|webm|mov)[^"']*)["']/gi;
  while ((videoMatch = directVideoRegex.exec(html)) !== null) {
    const url = videoMatch[1];
    if (!seenUrls.has(url)) {
      seenUrls.add(url);
      videos.push({ 
        type: 'direct', 
        url,
        isHeroCandidate: /hero|banner|background|cover/i.test(html.substring(Math.max(0, videoMatch.index - 500), videoMatch.index + 500))
      });
    }
  }
  
  // 3. Background video in style or inline
  const bgVideoRegex = /background(?:-video)?:\s*url\(['"]?([^'")\s]+\.(mp4|webm)[^'")\s]*)['"]?\)/gi;
  while ((videoMatch = bgVideoRegex.exec(html)) !== null) {
    const url = videoMatch[1];
    if (!seenUrls.has(url)) {
      seenUrls.add(url);
      videos.push({ 
        type: 'direct', 
        url,
        isHeroCandidate: true
      });
    }
  }
  
  // 4. YouTube patterns
  const youtubePatterns = [
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/|youtube-nocookie\.com\/embed\/)([a-zA-Z0-9_-]{11})/gi,
    /youtube\.com\/v\/([a-zA-Z0-9_-]{11})/gi,
  ];
  
  for (const pattern of youtubePatterns) {
    let match;
    while ((match = pattern.exec(html)) !== null) {
      const videoId = match[1];
      if (!videos.find(v => v.id === videoId && v.type === 'youtube')) {
        videos.push({ 
          type: 'youtube', 
          url: `https://www.youtube.com/watch?v=${videoId}`,
          id: videoId,
          isHeroCandidate: false
        });
      }
    }
  }
  
  // 5. Vimeo patterns
  const vimeoPatterns = [
    /vimeo\.com\/(\d+)/gi,
    /player\.vimeo\.com\/video\/(\d+)/gi,
  ];
  
  for (const pattern of vimeoPatterns) {
    let match;
    while ((match = pattern.exec(html)) !== null) {
      const videoId = match[1];
      if (!videos.find(v => v.id === videoId && v.type === 'vimeo')) {
        videos.push({ 
          type: 'vimeo', 
          url: `https://vimeo.com/${videoId}`,
          id: videoId,
          isHeroCandidate: false
        });
      }
    }
  }
  
  return videos;
}

// Extract Lottie animations from HTML
function extractLottieAnimations(html: string): { src: string; type: 'lottie' | 'dotlottie'; context?: string }[] {
  const animations: { src: string; type: 'lottie' | 'dotlottie'; context?: string }[] = [];
  const seenUrls = new Set<string>();
  
  // 1. lottie-player web component
  const lottiePlayerRegex = /<lottie-player[^>]+src=["']([^"']+)["'][^>]*>/gi;
  let match;
  while ((match = lottiePlayerRegex.exec(html)) !== null) {
    const src = match[1];
    if (!seenUrls.has(src)) {
      seenUrls.add(src);
      const context = html.substring(Math.max(0, match.index - 200), match.index).match(/class=["'][^"']*["']/i)?.[0] || '';
      animations.push({ src, type: 'lottie', context });
    }
  }
  
  // 2. dotlottie-player and dotlottie-wc web components
  const dotlottieRegex = /<(?:dotlottie-player|dotlottie-wc)[^>]+src=["']([^"']+)["'][^>]*>/gi;
  while ((match = dotlottieRegex.exec(html)) !== null) {
    const src = match[1];
    if (!seenUrls.has(src)) {
      seenUrls.add(src);
      animations.push({ src, type: 'dotlottie' });
    }
  }
  
  // 3. amp-bodymovin-animation (AMP)
  const ampRegex = /<amp-bodymovin-animation[^>]+src=["']([^"']+)["'][^>]*>/gi;
  while ((match = ampRegex.exec(html)) !== null) {
    const src = match[1];
    if (!seenUrls.has(src)) {
      seenUrls.add(src);
      animations.push({ src, type: 'lottie' });
    }
  }
  
  // 4. lottie.loadAnimation or bodymovin.loadAnimation in scripts
  const scriptLoadRegex = /(?:lottie|bodymovin)\.loadAnimation\s*\(\s*\{[^}]*(?:path|animationData)\s*:\s*["']([^"']+\.json)["'][^}]*\}/gi;
  while ((match = scriptLoadRegex.exec(html)) !== null) {
    const src = match[1];
    if (!seenUrls.has(src)) {
      seenUrls.add(src);
      animations.push({ src, type: 'lottie' });
    }
  }
  
  // 5. Direct .lottie or .json lottie file URLs in data attributes
  const dataAttrRegex = /(?:data-animation|data-lottie|data-src)=["']([^"']+\.(?:lottie|json))["']/gi;
  while ((match = dataAttrRegex.exec(html)) !== null) {
    const src = match[1];
    // Only add if it looks like a Lottie file (not any JSON)
    if (!seenUrls.has(src) && (src.includes('lottie') || src.includes('animation'))) {
      seenUrls.add(src);
      animations.push({ src, type: src.endsWith('.lottie') ? 'dotlottie' : 'lottie' });
    }
  }
  
  // 6. lottie.host URLs (common hosting platform)
  const lottieHostRegex = /https?:\/\/(?:lottie\.host|assets\d*\.lottiefiles\.com)\/[^"'\s)]+/gi;
  while ((match = lottieHostRegex.exec(html)) !== null) {
    const src = match[0];
    if (!seenUrls.has(src)) {
      seenUrls.add(src);
      animations.push({ src, type: src.endsWith('.lottie') ? 'dotlottie' : 'lottie' });
    }
  }
  
  return animations;
}

// Extract SVG animations from HTML
function extractSvgAnimations(html: string): { svg: string; type: 'inline' | 'external'; src?: string; hasAnimation: boolean }[] {
  const svgAnimations: { svg: string; type: 'inline' | 'external'; src?: string; hasAnimation: boolean }[] = [];
  
  // 1. External SVG files (check for common animation patterns in URL/class)
  const externalSvgRegex = /<(?:img|object|embed)[^>]+(?:src|data)=["']([^"']+\.svg[^"']*)["'][^>]*>/gi;
  let match;
  while ((match = externalSvgRegex.exec(html)) !== null) {
    const src = match[1];
    const context = match[0].toLowerCase();
    // Look for animation hints in class names or surrounding context
    const hasAnimationHint = /anim|motion|loader|spinner|pulse|bounce/i.test(context) ||
                             /class=["'][^"']*(?:anim|motion|loader|spinner)[^"']*["']/i.test(html.substring(Math.max(0, match.index - 100), match.index + 100));
    
    if (hasAnimationHint) {
      svgAnimations.push({ 
        svg: '', 
        type: 'external', 
        src, 
        hasAnimation: true 
      });
    }
  }
  
  // 2. Inline SVG with SMIL animations (<animate>, <animateTransform>, <animateMotion>)
  const inlineSvgRegex = /<svg[^>]*>[\s\S]*?<\/svg>/gi;
  while ((match = inlineSvgRegex.exec(html)) !== null) {
    const svgContent = match[0];
    const hasSmilAnimation = /<animate(?:Transform|Motion)?[^>]*>/i.test(svgContent);
    const hasCssAnimation = /animation:|@keyframes/i.test(svgContent);
    
    if (hasSmilAnimation || hasCssAnimation) {
      // Truncate very large SVGs for the preview
      const truncatedSvg = svgContent.length > 5000 ? svgContent.substring(0, 5000) + '...' : svgContent;
      svgAnimations.push({ 
        svg: truncatedSvg, 
        type: 'inline', 
        hasAnimation: true 
      });
    }
  }
  
  return svgAnimations;
}

// Extract images from HTML with better pattern matching
function extractImagesFromHtml(html: string): { src: string; alt?: string }[] {
  const images: { src: string; alt?: string }[] = [];
  const seenUrls = new Set<string>();
  
  // Match img tags
  const imgRegex = /<img[^>]+src=["']([^"']+)["'][^>]*(?:alt=["']([^"']*)["'])?[^>]*>/gi;
  let match;
  while ((match = imgRegex.exec(html)) !== null) {
    const src = match[1];
    if (src.startsWith('http') && !seenUrls.has(src)) {
      seenUrls.add(src);
      images.push({ src, alt: match[2] || undefined });
    }
  }
  
  // Match background-image in style
  const bgRegex = /background(?:-image)?:\s*url\(['"]?([^'")\s]+)['"]?\)/gi;
  while ((match = bgRegex.exec(html)) !== null) {
    const src = match[1];
    if (src.startsWith('http') && !seenUrls.has(src)) {
      seenUrls.add(src);
      images.push({ src });
    }
  }
  
  // Match data-src (lazy loading)
  const dataSrcRegex = /data-src=["']([^"']+)["']/gi;
  while ((match = dataSrcRegex.exec(html)) !== null) {
    const src = match[1];
    if (src.startsWith('http') && !seenUrls.has(src)) {
      seenUrls.add(src);
      images.push({ src });
    }
  }
  
  return images;
}

// Extract navigation links from HTML - enhanced to include header, footer, and main nav
function extractNavLinks(html: string, baseUrl: string): { label: string; url: string; source: 'nav' | 'header' | 'footer' }[] {
  const links: { label: string; url: string; source: 'nav' | 'header' | 'footer' }[] = [];
  const seenUrls = new Set<string>();
  
  // Helper to normalize URL for deduplication
  const normalizeForDedup = (url: string): string => {
    try {
      const u = new URL(url);
      u.search = '';
      u.hash = '';
      let path = u.pathname.toLowerCase();
      if (path.length > 1 && path.endsWith('/')) {
        path = path.slice(0, -1);
      }
      u.pathname = path;
      return u.href;
    } catch {
      return url.toLowerCase();
    }
  };
  
  // Helper to extract links from HTML content
  const extractLinksFromContent = (content: string, source: 'nav' | 'header' | 'footer') => {
    const linkRegex = /<a[^>]+href=["']([^"'#]+)["'][^>]*>([\s\S]*?)<\/a>/gi;
    let linkMatch;
    while ((linkMatch = linkRegex.exec(content)) !== null) {
      let href = linkMatch[1].trim();
      // Clean up label - remove HTML tags and whitespace
      const label = linkMatch[2].replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
      
      // Skip invalid links
      if (!href || !label || label.length < 2 || label.length > 100) continue;
      if (href.startsWith('javascript:') || href.startsWith('mailto:') || href.startsWith('tel:')) continue;
      if (href.startsWith('#')) continue;
      
      // Skip common non-content links
      if (/\/(wp-login|wp-admin|feed|rss|login|logout|cart|checkout|account|search|privacy|cookie|gdpr)/i.test(href)) continue;
      
      // Convert relative URLs to absolute
      try {
        const absoluteUrl = new URL(href, baseUrl).href;
        const normalizedUrl = normalizeForDedup(absoluteUrl);
        
        // Only include same-domain links that haven't been seen
        if (absoluteUrl.startsWith(baseUrl) && !seenUrls.has(normalizedUrl)) {
          seenUrls.add(normalizedUrl);
          links.push({ label, url: absoluteUrl, source });
        }
      } catch {
        // Invalid URL, skip
      }
    }
  };
  
  // 1. Extract from <nav> elements (highest priority - main navigation)
  const navRegex = /<nav[^>]*>([\s\S]*?)<\/nav>/gi;
  let navMatch;
  while ((navMatch = navRegex.exec(html)) !== null) {
    extractLinksFromContent(navMatch[1], 'nav');
  }
  
  // 2. Extract from <header> elements (often contains main menu)
  const headerRegex = /<header[^>]*>([\s\S]*?)<\/header>/gi;
  let headerMatch;
  while ((headerMatch = headerRegex.exec(html)) !== null) {
    extractLinksFromContent(headerMatch[1], 'header');
  }
  
  // 3. Extract from <footer> elements (often has important links)
  const footerRegex = /<footer[^>]*>([\s\S]*?)<\/footer>/gi;
  let footerMatch;
  while ((footerMatch = footerRegex.exec(html)) !== null) {
    extractLinksFromContent(footerMatch[1], 'footer');
  }
  
  // 4. Look for common menu class patterns (WordPress, etc.)
  const menuPatterns = [
    /<(?:div|ul)[^>]*class="[^"]*(?:menu|navigation|nav-menu|main-menu|primary-menu)[^"]*"[^>]*>([\s\S]*?)<\/(?:div|ul)>/gi,
    /<(?:div|ul)[^>]*id="[^"]*(?:menu|navigation|nav)[^"]*"[^>]*>([\s\S]*?)<\/(?:div|ul)>/gi,
  ];
  
  for (const pattern of menuPatterns) {
    let menuMatch;
    while ((menuMatch = pattern.exec(html)) !== null) {
      extractLinksFromContent(menuMatch[1], 'nav');
    }
  }
  
  return links;
}

// Fetch and parse sitemap.xml
// Filter out URLs that look like archives, pagination, or low-value pages
function shouldExcludeUrl(url: string, baseUrl: string): boolean {
  const path = url.replace(baseUrl, '').toLowerCase();
  
  // Exclude pagination
  if (/\/page\/\d+\/?$/.test(path)) return true;
  
  // Exclude archive pages (year/month archives without article)
  if (/^\/\d{4}\/?$/.test(path)) return true; // /2023/
  if (/^\/\d{4}\/\d{2}\/?$/.test(path)) return true; // /2023/05/
  
  // Exclude feed/rss URLs
  if (/\/(feed|rss|atom)\/?/.test(path)) return true;
  
  // Exclude attachment/media pages
  if (/\/attachment\//.test(path)) return true;
  
  // Exclude login/admin pages
  if (/\/(wp-admin|wp-login|admin|login|logout|dashboard)\/?/.test(path)) return true;
  
  // Exclude search results
  if (/\/search\//.test(path) || /[\?&]s=/.test(path)) return true;
  
  // Exclude print pages
  if (/\/print\/?$/.test(path)) return true;
  
  // Exclude empty or single-char paths that aren't home
  if (path.length > 0 && path !== '/' && path.length <= 2) return true;
  
  return false;
}

// Check if lastmod date is within acceptable range (last 2 years by default)
function isRecentEnough(lastmod: string | undefined, maxAgeMonths: number = 24): boolean {
  if (!lastmod) return true; // No date = include by default
  
  try {
    const modDate = new Date(lastmod);
    const cutoff = new Date();
    cutoff.setMonth(cutoff.getMonth() - maxAgeMonths);
    return modDate >= cutoff;
  } catch {
    return true; // Invalid date = include
  }
}

async function fetchSitemap(baseUrl: string): Promise<{ url: string; title?: string; lastmod?: string }[]> {
  const pages: { url: string; title?: string; lastmod?: string }[] = [];
  
  try {
    // Try common sitemap locations
    const sitemapUrls = [
      `${baseUrl}/sitemap.xml`,
      `${baseUrl}/sitemap_index.xml`,
      `${baseUrl}/sitemap-index.xml`,
    ];
    
    for (const sitemapUrl of sitemapUrls) {
      try {
        const response = await fetch(sitemapUrl, { 
          headers: { 'User-Agent': 'FlowPilot-Bot/1.0' },
          signal: AbortSignal.timeout(5000)
        });
        
        if (!response.ok) continue;
        
        const xml = await response.text();
        
        // Check if it's a sitemap index (contains other sitemaps)
        if (xml.includes('<sitemapindex')) {
          // Extract sitemap URLs from index
          const sitemapLocRegex = /<sitemap>[\s\S]*?<loc>([^<]+)<\/loc>[\s\S]*?<\/sitemap>/gi;
          let sitemapMatch;
          const childSitemaps: string[] = [];
          while ((sitemapMatch = sitemapLocRegex.exec(xml)) !== null) {
            childSitemaps.push(sitemapMatch[1].trim());
          }
          
          // Fetch first few child sitemaps (limit to avoid timeout)
          for (const childUrl of childSitemaps.slice(0, 3)) {
            try {
              const childResponse = await fetch(childUrl, { 
                headers: { 'User-Agent': 'FlowPilot-Bot/1.0' },
                signal: AbortSignal.timeout(3000)
              });
              if (childResponse.ok) {
                const childXml = await childResponse.text();
                extractUrlsFromSitemap(childXml, pages, baseUrl);
              }
            } catch {
              // Skip this child sitemap
            }
          }
        } else {
          // Regular sitemap
          extractUrlsFromSitemap(xml, pages, baseUrl);
        }
        
        // If we found pages, stop trying other sitemap URLs
        if (pages.length > 0) break;
        
      } catch {
        // Try next sitemap URL
      }
    }
  } catch (error) {
    console.error('Sitemap fetch error:', error);
  }
  
  return pages;
}

function extractUrlsFromSitemap(
  xml: string, 
  pages: { url: string; title?: string; lastmod?: string }[],
  baseUrl: string
): void {
  const urlRegex = /<url>[\s\S]*?<loc>([^<]+)<\/loc>(?:[\s\S]*?<lastmod>([^<]+)<\/lastmod>)?[\s\S]*?<\/url>/gi;
  let match;
  while ((match = urlRegex.exec(xml)) !== null) {
    const url = match[1].trim();
    const lastmod = match[2]?.trim();
    
    // Only include same-domain URLs that pass filters
    if (url.startsWith(baseUrl) && !shouldExcludeUrl(url, baseUrl) && isRecentEnough(lastmod)) {
      pages.push({ url, lastmod });
    }
  }
}

// Categorize URL by type - platform-aware
function categorizeUrl(url: string, baseUrl: string, platform: string = 'unknown'): 'page' | 'blog' | 'kb' {
  const path = url.replace(baseUrl, '').toLowerCase();
  
  // WordPress-specific: date-based URLs are blog posts (/YYYY/MM/DD/post-name/)
  if (platform === 'wordpress' && /^\/\d{4}\/\d{2}(\/\d{2})?\//.test(path)) {
    return 'blog';
  }
  
  // WordPress category/tag/author pages are blog archives
  if (platform === 'wordpress' && /^\/(category|tag|author|arkiv)\//.test(path)) {
    return 'blog';
  }
  
  // Blog patterns (generic)
  if (/^\/(blog|news|articles|aktuellt|nyheter|insights|journal|posts?)(?:\/|$)/i.test(path)) {
    return 'blog';
  }
  
  // Knowledge base patterns
  if (/^\/(help|faq|support|knowledge|kb|docs|documentation|hjalp|vanliga-fragor)(?:\/|$)/i.test(path)) {
    return 'kb';
  }
  
  return 'page';
}

// Analyze full site structure
async function analyzeSiteStructure(url: string, firecrawlKey: string): Promise<{
  siteName: string;
  platform: string;
  baseUrl: string;
  pages: { url: string; title: string; type: 'page' | 'blog' | 'kb'; source: 'nav' | 'sitemap' }[];
  navigation: { label: string; url: string }[];
  hasBlog: boolean;
  hasKnowledgeBase: boolean;
}> {
  // Get base URL
  const urlObj = new URL(url);
  const baseUrl = `${urlObj.protocol}//${urlObj.host}`;
  
  // Fetch homepage to get navigation
  const scrapeResponse = await fetch('https://api.firecrawl.dev/v1/scrape', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${firecrawlKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      url: baseUrl,
      formats: ['html', 'rawHtml'],
      onlyMainContent: false,
      waitFor: 2000,
    }),
  });
  
  const scrapeData = await scrapeResponse.json();
  const html = scrapeData.data?.rawHtml || scrapeData.data?.html || '';
  const metadata = scrapeData.data?.metadata || {};
  
  // Detect platform
  const platform = detectPlatform(html, metadata);
  
  // Extract navigation links
  const navLinks = extractNavLinks(html, baseUrl);
  
  // Fetch sitemap
  const sitemapPages = await fetchSitemap(baseUrl);
  
  // Combine and deduplicate (normalize URLs)
  type PageEntry = { url: string; title: string; type: 'page' | 'blog' | 'kb'; source: 'nav' | 'sitemap' };
  const allPages = new Map<string, PageEntry>();
  
  // Helper to normalize URL (remove trailing slash, query params, anchors)
  const normalizeUrl = (url: string): string => {
    try {
      const u = new URL(url);
      // Remove query params and hash
      u.search = '';
      u.hash = '';
      // Normalize trailing slash
      let path = u.pathname;
      if (path.length > 1 && path.endsWith('/')) {
        path = path.slice(0, -1);
      }
      u.pathname = path;
      return u.href;
    } catch {
      return url;
    }
  };
  
  // Helper to extract slug from URL
  const getSlug = (url: string): string => {
    const normalized = normalizeUrl(url);
    const pathParts = normalized.replace(baseUrl, '').split('/').filter(Boolean);
    return pathParts[pathParts.length - 1]?.toLowerCase() || 'home';
  };
  
  // Track seen slugs to detect near-duplicates
  const seenSlugs = new Map<string, string>(); // slug -> first URL
  
  // Add navigation links first (higher priority) - use platform for categorization
  // Sort by source priority: nav > header > footer
  const sortedNavLinks = [...navLinks].sort((a, b) => {
    const priority = { nav: 0, header: 1, footer: 2 };
    return priority[a.source] - priority[b.source];
  });
  
  for (const link of sortedNavLinks) {
    // Skip if URL should be excluded
    if (shouldExcludeUrl(link.url, baseUrl)) continue;
    
    const normalizedUrl = normalizeUrl(link.url);
    const type = categorizeUrl(link.url, baseUrl, platform);
    const slug = getSlug(link.url);
    
    // Skip if we already have this exact URL or slug
    if (allPages.has(normalizedUrl) || seenSlugs.has(slug)) continue;
    
    allPages.set(normalizedUrl, { url: normalizedUrl, title: link.label, type, source: 'nav' });
    seenSlugs.set(slug, normalizedUrl);
  }
  
  // Add sitemap pages (limit to reasonable count for migration)
  const MAX_SITEMAP_PAGES = 50;
  let sitemapCount = 0;
  
  for (const page of sitemapPages) {
    if (sitemapCount >= MAX_SITEMAP_PAGES) break;
    
    // Skip if URL should be excluded
    if (shouldExcludeUrl(page.url, baseUrl)) continue;
    
    const normalizedUrl = normalizeUrl(page.url);
    const slug = getSlug(page.url);
    
    // Skip if we already have this exact URL or slug (near-duplicate)
    if (allPages.has(normalizedUrl) || seenSlugs.has(slug)) continue;
    
    const type = categorizeUrl(page.url, baseUrl, platform);
    const title = slug.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase()) || 'Home';
    
    allPages.set(normalizedUrl, { url: normalizedUrl, title, type, source: 'sitemap' });
    seenSlugs.set(slug, normalizedUrl);
    sitemapCount++;
  }
  
  // Always include homepage if not present
  const normalizedBaseUrl = normalizeUrl(baseUrl);
  const homeSlug = 'home';
  if (!allPages.has(normalizedBaseUrl) && !allPages.has(normalizedBaseUrl + '/') && !seenSlugs.has(homeSlug)) {
    allPages.set(normalizedBaseUrl, { url: normalizedBaseUrl, title: 'Home', type: 'page', source: 'nav' });
    seenSlugs.set(homeSlug, normalizedBaseUrl);
  }
  
  // Sort: homepage first, then navigation order, then sitemap
  const pages = Array.from(allPages.values()).sort((a, b) => {
    const normalizedBase = normalizeUrl(baseUrl);
    const aIsHome = a.url === normalizedBase || a.url === normalizedBase + '/' || 
                    a.title.toLowerCase() === 'home' || a.title.toLowerCase() === 'hem' ||
                    a.title.toLowerCase() === 'start' || a.title.toLowerCase() === 'startsida';
    const bIsHome = b.url === normalizedBase || b.url === normalizedBase + '/' || 
                    b.title.toLowerCase() === 'home' || b.title.toLowerCase() === 'hem' ||
                    b.title.toLowerCase() === 'start' || b.title.toLowerCase() === 'startsida';
    if (aIsHome && !bIsHome) return -1;
    if (!aIsHome && bIsHome) return 1;
    if (a.source === 'nav' && b.source === 'sitemap') return -1;
    if (a.source === 'sitemap' && b.source === 'nav') return 1;
    return 0;
  });
  
  console.log(`Site analysis: Found ${navLinks.length} nav links (nav/header/footer), ${sitemapPages.length} sitemap pages, filtered to ${pages.length} unique pages`);
  console.log(`Nav sources: ${navLinks.filter(l => l.source === 'nav').length} nav, ${navLinks.filter(l => l.source === 'header').length} header, ${navLinks.filter(l => l.source === 'footer').length} footer`);
  
  const hasBlog = pages.some(p => p.type === 'blog');
  const hasKnowledgeBase = pages.some(p => p.type === 'kb');
  
  return {
    siteName: metadata.title || urlObj.host,
    platform,
    baseUrl,
    pages,
    navigation: navLinks.map(l => ({ label: l.label, url: l.url })),
    hasBlog,
    hasKnowledgeBase,
  };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const { url, action } = body;

    if (!url) {
      return new Response(
        JSON.stringify({ success: false, error: 'URL is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const firecrawlKey = Deno.env.get('FIRECRAWL_API_KEY');
    const openaiKey = Deno.env.get('OPENAI_API_KEY');
    const geminiKey = Deno.env.get('GEMINI_API_KEY');

    if (!firecrawlKey) {
      return new Response(
        JSON.stringify({ success: false, error: 'FIRECRAWL_API_KEY is missing. Add it in Settings → Integrations.' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Handle site analysis action
    if (action === 'analyze-site') {
      console.log('Analyzing site structure for:', url);
      
      // Format URL
      let formattedUrl = url.trim();
      if (!formattedUrl.startsWith('http://') && !formattedUrl.startsWith('https://')) {
        formattedUrl = `https://${formattedUrl}`;
      }
      
      const siteStructure = await analyzeSiteStructure(formattedUrl, firecrawlKey);
      
      console.log('Site analysis complete:', {
        siteName: siteStructure.siteName,
        platform: siteStructure.platform,
        pagesFound: siteStructure.pages.length,
        hasBlog: siteStructure.hasBlog,
        hasKnowledgeBase: siteStructure.hasKnowledgeBase,
      });
      
      return new Response(
        JSON.stringify({ 
          success: true, 
          ...siteStructure 
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Original migrate-page logic continues here
    if (!openaiKey && !geminiKey) {
      return new Response(
        JSON.stringify({ success: false, error: 'AI API key missing. Add OPENAI_API_KEY or GEMINI_API_KEY in Settings → Integrations.' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const useGemini = !openaiKey && geminiKey;

    // Format URL
    let formattedUrl = url.trim();
    if (!formattedUrl.startsWith('http://') && !formattedUrl.startsWith('https://')) {
      formattedUrl = `https://${formattedUrl}`;
    }

    console.log('Step 1: Scraping URL with Firecrawl (enhanced):', formattedUrl);

    // Step 1: Scrape with Firecrawl - enhanced options
    const scrapeResponse = await fetch('https://api.firecrawl.dev/v1/scrape', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${firecrawlKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        url: formattedUrl,
        formats: ['markdown', 'html', 'rawHtml', 'screenshot'],
        onlyMainContent: false, // Get full page for better extraction
        waitFor: 3000, // Wait for JS to load
        includeTags: ['main', 'article', 'section', 'header', 'footer', 'aside', 'figure', 'video', 'iframe'],
        excludeTags: ['script', 'noscript', 'style'],
      }),
    });

    const scrapeData = await scrapeResponse.json();

    if (!scrapeResponse.ok) {
      console.error('Firecrawl error:', scrapeData);
      return new Response(
        JSON.stringify({ success: false, error: `Could not scrape page: ${scrapeData.error || scrapeResponse.status}` }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const markdown = scrapeData.data?.markdown || scrapeData.markdown || '';
    const html = scrapeData.data?.html || scrapeData.html || '';
    const rawHtml = scrapeData.data?.rawHtml || scrapeData.rawHtml || html;
    const screenshot = scrapeData.data?.screenshot || scrapeData.screenshot || null;
    const metadata = scrapeData.data?.metadata || scrapeData.metadata || {};

    console.log('Step 2: Scraped content - Markdown:', markdown.length, 'chars, HTML:', html.length, 'chars');
    console.log('Screenshot available:', !!screenshot);
    console.log('Metadata:', JSON.stringify(metadata));

    // Detect platform
    const platform = detectPlatform(rawHtml, metadata);
    console.log('Detected platform:', platform);

    // Extract videos from HTML
    const extractedVideos = extractVideos(rawHtml);
    console.log('Extracted videos:', extractedVideos.length);

    // Extract images from HTML
    const extractedImages = extractImagesFromHtml(rawHtml);
    console.log('Extracted images:', extractedImages.length);

    // Extract Lottie animations
    const extractedLotties = extractLottieAnimations(rawHtml);
    console.log('Extracted Lottie animations:', extractedLotties.length);

    // Extract SVG animations
    const extractedSvgAnimations = extractSvgAnimations(rawHtml);
    console.log('Extracted SVG animations:', extractedSvgAnimations.length);

    // Step 2: Use AI to map content to blocks
    console.log('Step 3: Mapping content to CMS blocks with AI...');

    // Platform-specific prompts for specialized extraction
    const PLATFORM_PROMPTS: Record<string, string> = {
      wordpress: `=== WORDPRESS-SPECIFIC EXTRACTION ===
- Images in /wp-content/uploads/ - PRESERVE these URLs exactly
- Date URLs like /YYYY/MM/DD/slug/ are BLOG POSTS - not pages
- Look for content in .entry-content, .post-content, article classes
- Sidebar widgets (.widget, .sidebar) are NOT main content - IGNORE
- Cookie plugins (CookieLaw, TCKY, Complianz) - IGNORE COMPLETELY
- "Hej världen" / "Hello World" are default placeholder posts - mark as LOW_QUALITY
- "Powered by WordPress" footer - IGNORE
- Social sharing buttons and widgets - IGNORE
- Comment sections - IGNORE unless explicitly requested`,

      wix: `=== WIX-SPECIFIC EXTRACTION ===
- Content in [data-mesh-id] containers is main content
- Images often in static.wixstatic.com - PRESERVE URLs
- Sections use .section-* classes
- Strip/columns layouts are common - preserve structure
- Wix ads/branding - IGNORE
- Premium upgrade prompts - IGNORE
- Social bar widgets - typically IGNORE unless main feature`,

      squarespace: `=== SQUARESPACE-SPECIFIC EXTRACTION ===
- Sections in .page-section containers
- Images in images.squarespace-cdn.com - PRESERVE URLs  
- Block-based layouts (.sqs-block) - follow structure
- Gallery blocks have specific structure - create gallery blocks
- Squarespace badge/footer - IGNORE
- Social links bar - IGNORE unless primary content`,

      shopify: `=== SHOPIFY-SPECIFIC EXTRACTION ===
- Product pages have structured data - extract into products block
- Images in cdn.shopify.com - PRESERVE URLs
- Collection/product URLs are E-COMMERCE content
- Theme sections in .shopify-section
- Announcement bars → announcement-bar block
- Product grids → products block
- Trust badges → badge block`,

      webflow: `=== WEBFLOW-SPECIFIC EXTRACTION ===
- Elements have w-* classes - clean semantic structure
- Rich text in .w-richtext
- CMS items have w-dyn-* classes
- Interactions data in data-w-id - note for animations
- Usually well-organized sections
- High-quality images with srcset - use largest`,

      sitevision: `=== SITEVISION-SPECIFIC EXTRACTION ===
- Swedish CMS - content often in Swedish
- Portlet structure (sv-portlet) 
- Navigation patterns follow Swedish conventions
- Contact info patterns: telefon, e-post, adress
- Organization/myndighet pages common`,

      ghost: `=== GHOST-SPECIFIC EXTRACTION ===
- Blog-focused CMS - expect post structure
- Clean semantic markup
- Feature images prominent
- Author cards common`,

      unknown: `=== GENERAL EXTRACTION ===
- Look for semantic HTML: <header>, <main>, <article>, <section>
- Identify hero by position (first large section) and content (h1, tagline)
- Look for repeating patterns (cards, testimonials, features)
- Extract only meaningful content`
    };

    const platformPrompt = PLATFORM_PROMPTS[platform] || PLATFORM_PROMPTS.unknown;

    let aiResponse: Response;

    const systemPrompt = `You are an expert at analyzing web pages and mapping content to CMS blocks.
Your task is to take content from a scraped web page and transform it into structured CMS blocks.

${BLOCK_TYPES_SCHEMA}

${platformPrompt}

=== CONTENT QUALITY FILTER - CRITICAL ===

IGNORE COMPLETELY (do not create blocks for):
- Navigation menus (topbar, sidebar, footer links)
- Cookie consent banners and their images (CookieLaw, TCKY, Complianz, GDPR popups)
- Close/X button images
- Breadcrumbs and "Back" links
- "Powered by X" badges
- Default placeholder content ("Hej världen", "Hello World", "Sample Page")
- Plugin-generated content
- Sidebar widgets (unless explicitly main content)
- Footer links and copyright notices
- Login/signup forms (unless main feature)
- Social sharing buttons (unless prominent feature)
- Comment sections

QUALITY CHECK:
- If main content has less than 100 words of actual text: add "lowQuality": true to metadata
- If page is mostly navigation/footer: add "lowQuality": true
- Skip promotional/cookie images: look for close.svg, cookie, consent, powered, plugin in URLs

Focus ONLY on main content (typically in <main>, <article>, or primary content area).

HERO BLOCK - CRITICAL (VIDEO PRIORITY):
- If the page has a clear hero/banner section, create a "hero" block
- PRIORITY 1: If a HERO VIDEO is found (marked as isHeroCandidate: true), use video background:
  {
    "backgroundType": "video",
    "videoType": "direct",  // or "youtube" / "vimeo"
    "videoUrl": "the video URL",
    "videoPosterUrl": "poster image if available",
    "videoAutoplay": true,
    "videoLoop": true,
    "videoMuted": true
  }
- PRIORITY 2: If no hero video, use the OG image as backgroundImage:
  {
    "backgroundType": "image",
    "backgroundImage": "OG image URL"
  }
- Hero block should also have: title (main heading), subtitle (subheading if present), buttons

VIDEO CONTENT - CRITICAL:
- For hero/background videos (direct MP4/WebM): Use in HERO block with backgroundType: 'video'
- For YouTube videos: Create "youtube" blocks
- Create "embed" blocks for Vimeo and other video embeds
- Pre-extracted videos are provided below with isHeroCandidate flag

IMAGES - PRESERVE ALL:
- Extract and preserve ALL images from the page
- Use original image URLs (full http/https URLs)
- Include image alt text when available
- Create gallery blocks for image collections

TEAM/CONTACT PERSONS - CRITICAL:
Identify and include ALL contact persons on the page.
Look for patterns:
- Name + title/role + contact info (email/phone)
- Profile pictures with names
- "Contact", "Team", "About us" sections

For team members, create "team" block with members array.
For single contacts, create "two-column" block with content and imageSrc.

STATISTICS AND FACTS:
Look for sections with:
- Key facts, quick facts, highlights
- Numbers with labels

Create "stats" blocks for numerical facts:
{ value: "180", label: "Credits" }
{ value: "3", label: "Years" }

QUOTES AND TESTIMONIALS:
Look for patterns:
- Quoted text with attribution
- Customer reviews, testimonials
- Blockquotes

Create "quote" or "testimonials" blocks.

LOTTIE ANIMATIONS - CRITICAL:
- For Lottie animations (.json or .lottie files), ALWAYS create native "lottie" blocks (NOT embed blocks!)
- "lottie" block requires: { src: "animation URL", autoplay: true, loop: true }
- Optional: Add alt text, caption, size, and playOn settings based on context
- Common placements: hero decorations (playOn: 'load'), hover effects (playOn: 'hover'), scroll reveals (playOn: 'scroll')
- For SVG animations, you can include them in "image" blocks if they are decorative

=== RESPONSE FORMAT ===
Respond ONLY with valid JSON, no other text:
{
  "title": "Page main title",
  "blocks": [
    { 
      "id": "block-1", 
      "type": "hero", 
      "data": { 
        "title": "...", 
        "subtitle": "...", 
        "backgroundType": "video",  // or "image" if no video
        "videoType": "direct",      // only if backgroundType is video
        "videoUrl": "...",          // only if backgroundType is video
        "videoMuted": true,
        "videoAutoplay": true,
        "videoLoop": true,
        "backgroundImage": "..."    // only if backgroundType is image
      } 
    },
    { "id": "block-2", "type": "text", "data": { "content": "<p>...</p>" } },
    { "id": "block-3", "type": "lottie", "data": { "src": "https://lottie.host/...", "autoplay": true, "loop": true, "alt": "Animation description" } }
  ]
}`;

    // Identify hero video candidates
    const heroVideos = extractedVideos.filter(v => v.isHeroCandidate);
    const otherVideos = extractedVideos.filter(v => !v.isHeroCandidate);

    const userPrompt = `Analyze this web page and create CMS blocks:

URL: ${formattedUrl}
Platform: ${platform}
Title: ${metadata.title || 'Unknown'}
Description: ${metadata.description || 'None'}

=== HERO BACKGROUND VIDEO (USE THIS FOR HERO BLOCK!) ===
${heroVideos.length > 0 
  ? heroVideos.map(v => `- Type: ${v.type}, URL: ${v.url}${v.poster ? `, Poster: ${v.poster}` : ''}`).join('\n')
  : 'No hero video found - use OG image instead'}

=== OG IMAGE (FALLBACK FOR HERO IF NO VIDEO) ===
${metadata['og:image'] || metadata.ogImage || 'No OG image available'}

=== OTHER VIDEOS (CREATE YOUTUBE/EMBED BLOCKS) ===
${otherVideos.length > 0 ? otherVideos.map(v => `- ${v.type}: ${v.url}`).join('\n') : 'No other videos found'}

=== PRE-EXTRACTED IMAGES (${extractedImages.length} total) ===
${extractedImages.slice(0, 20).map(img => `- ${img.src}${img.alt ? ` (alt: ${img.alt})` : ''}`).join('\n')}
${extractedImages.length > 20 ? `\n... and ${extractedImages.length - 20} more images` : ''}

=== LOTTIE ANIMATIONS (${extractedLotties.length} found) ===
${extractedLotties.length > 0 
  ? extractedLotties.map(l => `- ${l.type}: ${l.src}`).join('\n')
  : 'No Lottie animations found'}

=== SVG ANIMATIONS (${extractedSvgAnimations.length} found) ===
${extractedSvgAnimations.length > 0 
  ? extractedSvgAnimations.map(s => s.type === 'external' ? `- External: ${s.src}` : '- Inline SVG with SMIL/CSS animation').join('\n')
  : 'No SVG animations found'}

=== MAIN CONTENT (Markdown) ===
${markdown.substring(0, 40000)}
${markdown.length > 40000 ? '\n... (content truncated)' : ''}

=== HTML FOR STRUCTURE ANALYSIS ===
${html.substring(0, 20000)}

=== INSTRUCTIONS ===
1. If HERO BACKGROUND VIDEO is found: Create HERO block with backgroundType: 'video', videoType, videoUrl
2. If NO hero video: Create HERO block with backgroundType: 'image', backgroundImage (OG image)
3. Create "youtube" or "embed" blocks for OTHER VIDEOS (not hero videos)
4. Include ALL images appropriately (gallery, two-column, article-grid, etc.)
5. Identify team members and create team block
6. Create stats blocks for numerical facts
7. Identify quotes and testimonials
8. Group related content into appropriate block types
9. If LOTTIE ANIMATIONS found: Create native "lottie" blocks (NOT embed!) with src, autoplay: true, loop: true
10. For SVG animations: Include in image blocks or as decorative elements

Respond only with JSON.`;

    if (useGemini) {
      // Use Google Gemini API
      const model = 'gemini-2.0-flash-exp';
      
      aiResponse = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${geminiKey}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          contents: [
            {
              role: 'user',
              parts: [{ text: `${systemPrompt}\n\n${userPrompt}` }]
            }
          ],
          generationConfig: {
            temperature: 0.2,
            maxOutputTokens: 16384,
          }
        }),
      });
    } else {
      // Use OpenAI API - upgraded to gpt-4o for better analysis
      const model = 'gpt-4o';
      aiResponse = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${openaiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt }
          ],
          max_tokens: 16384,
          temperature: 0.2,
        }),
      });
    }

    if (!aiResponse.ok) {
      const aiError = await aiResponse.text();
      console.error('AI error:', aiResponse.status, aiError);
      
      if (aiResponse.status === 429) {
        return new Response(
          JSON.stringify({ success: false, error: 'Rate limit exceeded. Please try again in a moment.' }),
          { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      if (aiResponse.status === 402) {
        return new Response(
          JSON.stringify({ success: false, error: 'AI credits depleted. Check your API account.' }),
          { status: 402, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      
      return new Response(
        JSON.stringify({ success: false, error: 'AI analysis failed' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const aiData = await aiResponse.json();
    
    // Parse response based on provider
    let aiContent = '';
    if (useGemini) {
      aiContent = aiData.candidates?.[0]?.content?.parts?.[0]?.text || '';
    } else {
      aiContent = aiData.choices?.[0]?.message?.content || '';
    }
    
    console.log('Step 4: AI response received, parsing...');

    // Parse AI response - extract JSON from possible markdown code blocks
    let parsedBlocks;
    try {
      // Try to extract JSON from code blocks first
      const jsonMatch = aiContent.match(/```(?:json)?\s*([\s\S]*?)```/);
      const jsonString = jsonMatch ? jsonMatch[1].trim() : aiContent.trim();
      parsedBlocks = JSON.parse(jsonString);
    } catch (parseError) {
      console.error('Failed to parse AI response:', aiContent.substring(0, 1000));
      
      // Try to find JSON object directly
      const jsonStart = aiContent.indexOf('{');
      const jsonEnd = aiContent.lastIndexOf('}');
      if (jsonStart !== -1 && jsonEnd !== -1) {
        try {
          parsedBlocks = JSON.parse(aiContent.substring(jsonStart, jsonEnd + 1));
        } catch {
          return new Response(
            JSON.stringify({ 
              success: false, 
              error: 'Could not parse AI response',
              rawResponse: aiContent.substring(0, 1000)
            }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
      } else {
        return new Response(
          JSON.stringify({ 
            success: false, 
            error: 'Could not parse AI response',
            rawResponse: aiContent.substring(0, 1000)
          }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    // Ensure blocks have unique IDs and normalize field names
    const blocks = (parsedBlocks.blocks || []).map((block: Record<string, unknown>, index: number) => {
      const normalizedBlock: Record<string, unknown> = {
        ...block,
        id: block.id || `block-${Date.now()}-${index}`,
      };
      
      // Normalize team block: AI returns 'image' but frontend expects 'photo'
      if (normalizedBlock.type === 'team' && normalizedBlock.data) {
        const data = normalizedBlock.data as Record<string, unknown>;
        if (Array.isArray(data.members)) {
          data.members = (data.members as Record<string, unknown>[]).map((member: Record<string, unknown>) => {
            const normalizedMember: Record<string, unknown> = {
              ...member,
              id: member.id || `member-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
              photo: member.photo || member.image || '', // Map 'image' to 'photo'
              role: member.role || '',
            };
            // Remove the old 'image' field if it exists
            delete normalizedMember.image;
            return normalizedMember;
          });
        }
      }
      
      return normalizedBlock;
    });

    console.log('Step 5: Successfully mapped', blocks.length, 'blocks');
    console.log('Block types:', blocks.map((b: Record<string, unknown>) => b.type).join(', '));

    return new Response(
      JSON.stringify({
        success: true,
        sourceUrl: formattedUrl,
        title: parsedBlocks.title || metadata.title || 'Imported page',
        blocks,
        metadata: {
          originalTitle: metadata.title,
          originalDescription: metadata.description,
          platform,
          videosFound: extractedVideos.length,
          heroVideosFound: heroVideos.length,
          imagesFound: extractedImages.length,
          lottieAnimationsFound: extractedLotties.length,
          svgAnimationsFound: extractedSvgAnimations.length,
          screenshotAvailable: !!screenshot,
          scrapedAt: new Date().toISOString(),
        }
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Migration error:', error);
    return new Response(
      JSON.stringify({ success: false, error: error instanceof Error ? error.message : 'An unexpected error occurred' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
