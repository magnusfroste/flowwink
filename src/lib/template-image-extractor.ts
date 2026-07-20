/**
 * Template Image Extractor
 * 
 * Utility to extract all image URLs from template data for ZIP bundling.
 * Only includes images that are actually referenced in the template content.
 */

import { StarterTemplate, TemplatePage, TemplateBlogPost } from '@/data/templates';

export interface ExtractedImage {
  url: string;
  localPath: string; // Path within ZIP (e.g., "images/hero-bg.jpg")
}

/**
 * Check if a URL is a valid image URL (not placeholder, data URI, or relative path)
 */
function isExternalImageUrl(url: string | undefined | null): url is string {
  if (!url) return false;
  if (url.startsWith('data:')) return false;
  if (url.startsWith('/')) return false;
  if (url.includes('placeholder.')) return false;
  return url.startsWith('http://') || url.startsWith('https://');
}

/**
 * Generate a unique local path for an image
 */
function generateLocalPath(url: string, index: number): string {
  try {
    const urlObj = new URL(url);
    const pathname = urlObj.pathname;
    const ext = pathname.split('.').pop()?.toLowerCase() || 'jpg';
    const validExt = ['jpg', 'jpeg', 'png', 'webp', 'gif', 'svg'].includes(ext) ? ext : 'jpg';
    
    // Create a filename from the URL path or use index
    const baseName = pathname
      .split('/')
      .filter(Boolean)
      .pop()
      ?.replace(/\.[^/.]+$/, '')
      ?.replace(/[^a-zA-Z0-9-_]/g, '-')
      ?.substring(0, 50) || `image-${index}`;
    
    return `images/${index}-${baseName}.${validExt}`;
  } catch {
    return `images/image-${index}.jpg`;
  }
}

/**
 * Extract image URLs from Tiptap JSON content
 */
function extractFromTiptapContent(content: unknown): string[] {
  const urls: string[] = [];
  
  if (!content || typeof content !== 'object') return urls;
  
  const traverse = (node: unknown): void => {
    if (!node || typeof node !== 'object') return;
    
    const obj = node as Record<string, unknown>;
    
    // Check for image nodes in Tiptap
    if (obj.type === 'image' && typeof obj.attrs === 'object') {
      const attrs = obj.attrs as Record<string, unknown>;
      if (isExternalImageUrl(attrs.src as string)) {
        urls.push(attrs.src as string);
      }
    }
    
    // Check for direct src/url properties
    if (isExternalImageUrl(obj.src as string)) urls.push(obj.src as string);
    if (isExternalImageUrl(obj.url as string)) urls.push(obj.url as string);
    
    // Recurse into content array
    if (Array.isArray(obj.content)) {
      obj.content.forEach(traverse);
    }
  };
  
  traverse(content);
  return urls;
}

/**
 * Extract image URLs from a content block
 */
function extractFromBlock(block: ContentBlock): string[] {
  const urls: string[] = [];
  const data = block.data as Record<string, unknown>;
  
  if (!data) return urls;
  
  // Common image fields
  const imageFields = [
    'imageSrc', 'imageUrl', 'image', 'backgroundImage', 'backgroundUrl',
    'src', 'url', 'logo', 'avatar', 'photo', 'thumbnail', 'videoThumb',
    'featured_image', 'featuredImage', 'image_url', 'imageURL',
  ];
  
  imageFields.forEach(field => {
    if (isExternalImageUrl(data[field] as string)) {
      urls.push(data[field] as string);
    }
  });
  
  // Handle hero with video thumbnail
  if (block.type === 'hero' && isExternalImageUrl(data.videoThumb as string)) {
    urls.push(data.videoThumb as string);
  }
  
  // Handle arrays of items with images (logos, team, testimonials, gallery, etc.)
  const arrayFields = [
    'logos', 'items', 'testimonials', 'team', 'members', 'images',
    'slides', 'cards', 'features', 'clients', 'partners', 'badges',
  ];
  
  arrayFields.forEach(field => {
    const items = data[field];
    if (Array.isArray(items)) {
      items.forEach(item => {
        if (typeof item === 'object' && item) {
          const itemObj = item as Record<string, unknown>;
          imageFields.forEach(imgField => {
            if (isExternalImageUrl(itemObj[imgField] as string)) {
              urls.push(itemObj[imgField] as string);
            }
          });
        }
      });
    }
  });
  
  // Handle Tiptap content in blocks
  if (data.content && typeof data.content === 'object') {
    urls.push(...extractFromTiptapContent(data.content));
  }
  
  return urls;
}

/**
 * Extract image URLs from a template page
 */
function extractFromPage(page: TemplatePage): string[] {
  const urls: string[] = [];
  
  page.blocks.forEach(block => {
    urls.push(...extractFromBlock(block));
  });
  
  return urls;
}

/**
 * Extract image URLs from blog posts
 */
function extractFromBlogPosts(posts: TemplateBlogPost[] | undefined): string[] {
  const urls: string[] = [];
  
  if (!posts) return urls;
  
  posts.forEach(post => {
    if (isExternalImageUrl(post.featured_image)) {
      urls.push(post.featured_image);
    }
    
    // Blog posts can have block content or Tiptap content
    if (Array.isArray(post.content)) {
      post.content.forEach(block => {
        urls.push(...extractFromBlock(block));
      });
    }
  });
  
  return urls;
}

/**
 * Extract image URLs from branding settings
 */
function extractFromBranding(branding: StarterTemplate['branding'] | undefined): string[] {
  const urls: string[] = [];
  
  if (!branding) return urls;
  
  const brandingObj = branding as Record<string, unknown>;
  const fields = ['logo', 'logoUrl', 'favicon', 'faviconUrl', 'ogImage', 'ogImageUrl'];
  
  fields.forEach(field => {
    if (isExternalImageUrl(brandingObj[field] as string)) {
      urls.push(brandingObj[field] as string);
    }
  });
  
  return urls;
}

/**
 * Extract image URLs from header settings
 */
function extractFromHeader(header: StarterTemplate['headerSettings'] | undefined): string[] {
  const urls: string[] = [];
  
  if (!header) return urls;
  
  const headerObj = header as Record<string, unknown>;
  if (isExternalImageUrl(headerObj.logo as string)) {
    urls.push(headerObj.logo as string);
  }
  
  return urls;
}

/**
 * Extract image URLs from footer settings
 */
function extractFromFooter(footer: StarterTemplate['footerSettings'] | undefined): string[] {
  const urls: string[] = [];
  
  if (!footer) return urls;
  
  const footerObj = footer as Record<string, unknown>;
  if (isExternalImageUrl(footerObj.logo as string)) {
    urls.push(footerObj.logo as string);
  }
  
  return urls;
}

/**
 * Extract all unique image URLs from a template
 */
export function extractTemplateImages(template: StarterTemplate): ExtractedImage[] {
  const allUrls: string[] = [];
  
  // Extract from pages
  template.pages.forEach(page => {
    allUrls.push(...extractFromPage(page));
  });
  
  // Extract from blog posts
  allUrls.push(...extractFromBlogPosts(template.blogPosts));
  
  // Extract from branding
  allUrls.push(...extractFromBranding(template.branding));
  
  // Extract from header
  allUrls.push(...extractFromHeader(template.headerSettings));
  
  // Extract from footer
  allUrls.push(...extractFromFooter(template.footerSettings));
  
  // Deduplicate URLs
  const uniqueUrls = [...new Set(allUrls)];
  
  // Map to extracted images with local paths
  return uniqueUrls.map((url, index) => ({
    url,
    localPath: generateLocalPath(url, index),
  }));
}

/**
 * Create a URL mapping from original URLs to local paths
 */
export function createUrlMapping(images: ExtractedImage[]): Map<string, string> {
  const mapping = new Map<string, string>();
  images.forEach(img => {
    mapping.set(img.url, img.localPath);
  });
  return mapping;
}

/**
 * Rewrite URLs in a template to use local paths
 */
export function rewriteTemplateUrls(
  template: StarterTemplate,
  urlMapping: Map<string, string>
): StarterTemplate {
  return replaceMappedUrls(template, urlMapping) as StarterTemplate;
}

/**
 * Restore URLs in a template from local paths to new storage URLs
 */
export function restoreTemplateUrls(
  template: StarterTemplate,
  urlMapping: Map<string, string> // localPath -> newStorageUrl
): StarterTemplate {
  return replaceMappedUrls(template, urlMapping) as StarterTemplate;
}

/** Replace exact URL values at any depth, for both block arrays and Tiptap docs. */
function replaceMappedUrls(value: unknown, urlMapping: Map<string, string>): unknown {
  if (typeof value === 'string') return urlMapping.get(value) ?? value;
  if (Array.isArray(value)) return value.map(item => replaceMappedUrls(item, urlMapping));
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, nestedValue]) => [
        key,
        replaceMappedUrls(nestedValue, urlMapping),
      ])
    );
  }
  return value;
}
