/**
 * site-scrape — the HTML observation primitives behind site migration.
 *
 * These were inline in migrate-page/index.ts (1600+ lines) where nothing could
 * import or unit-test them. They are pure functions over HTML and URLs: what a
 * page CONTAINS, never what it should BECOME. That distinction is the whole
 * point of the sensor split — composition belongs to the agent, observation
 * belongs here.
 *
 * Moved verbatim; behaviour unchanged.
 */

// Detect platform from HTML/metadata
export function detectPlatform(html: string, metadata: Record<string, unknown>): string {
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
export function extractVideos(html: string): { type: string; url: string; id?: string; poster?: string; isHeroCandidate?: boolean }[] {
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
export function extractLottieAnimations(html: string): { src: string; type: 'lottie' | 'dotlottie'; context?: string }[] {
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
export function extractSvgAnimations(html: string): { svg: string; type: 'inline' | 'external'; src?: string; hasAnimation: boolean }[] {
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
export function extractImagesFromHtml(html: string): { src: string; alt?: string }[] {
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
export function extractNavLinks(html: string, baseUrl: string): { label: string; url: string; source: 'nav' | 'header' | 'footer' }[] {
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
      const href = linkMatch[1].trim();
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
export function shouldExcludeUrl(url: string, baseUrl: string): boolean {
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
  if (/\/search\//.test(path) || /[?&]s=/.test(path)) return true;
  
  // Exclude print pages
  if (/\/print\/?$/.test(path)) return true;
  
  // Exclude empty or single-char paths that aren't home
  if (path.length > 0 && path !== '/' && path.length <= 2) return true;
  
  return false;
}

// Check if lastmod date is within acceptable range (last 2 years by default)
export function isRecentEnough(lastmod: string | undefined, maxAgeMonths: number = 24): boolean {
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

export async function fetchSitemap(baseUrl: string): Promise<{ url: string; title?: string; lastmod?: string }[]> {
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

export function extractUrlsFromSitemap(
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
export function categorizeUrl(url: string, baseUrl: string, platform: string = 'unknown'): 'page' | 'blog' | 'kb' {
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
