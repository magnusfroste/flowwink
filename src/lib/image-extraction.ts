import type { ContentBlock } from '@/types/cms';

export interface ImageReference {
  path: string;
  url: string;
}

export interface BlockImageReference extends ImageReference {
  blockIndex: number;
}

/**
 * Extract all image URLs from a single block's data
 */
export const extractImagesFromBlockData = (data: Record<string, unknown>): ImageReference[] => {
  const images: ImageReference[] = [];

  // Direct image fields
  const directImageFields = ['src', 'backgroundImage', 'image', 'imageSrc'];
  for (const field of directImageFields) {
    if (typeof data[field] === 'string' && isExternalUrl(data[field] as string)) {
      images.push({ path: field, url: data[field] as string });
    }
  }

  // Gallery images (images[].src)
  if (Array.isArray(data.images)) {
    data.images.forEach((img, index) => {
      if (typeof img === 'object' && img !== null) {
        const imgObj = img as Record<string, unknown>;
        if (typeof imgObj.src === 'string' && isExternalUrl(imgObj.src)) {
          images.push({ path: `images.${index}.src`, url: imgObj.src });
        }
      }
    });
  }

  // Article grid items (articles[].image)
  if (Array.isArray(data.articles)) {
    data.articles.forEach((article, index) => {
      if (typeof article === 'object' && article !== null) {
        const articleObj = article as Record<string, unknown>;
        if (typeof articleObj.image === 'string' && isExternalUrl(articleObj.image)) {
          images.push({ path: `articles.${index}.image`, url: articleObj.image });
        }
      }
    });
  }

  // Link grid items (links[].image)
  if (Array.isArray(data.links)) {
    data.links.forEach((link, index) => {
      if (typeof link === 'object' && link !== null) {
        const linkObj = link as Record<string, unknown>;
        if (typeof linkObj.image === 'string' && isExternalUrl(linkObj.image)) {
          images.push({ path: `links.${index}.image`, url: linkObj.image });
        }
      }
    });
  }

  // Logos block (logos[].logo)
  if (Array.isArray(data.logos)) {
    data.logos.forEach((logo, index) => {
      if (typeof logo === 'object' && logo !== null) {
        const logoObj = logo as Record<string, unknown>;
        if (typeof logoObj.logo === 'string' && isExternalUrl(logoObj.logo)) {
          images.push({ path: `logos.${index}.logo`, url: logoObj.logo });
        }
      }
    });
  }

  // Team block (team[].avatar)
  if (Array.isArray(data.team)) {
    data.team.forEach((member, index) => {
      if (typeof member === 'object' && member !== null) {
        const memberObj = member as Record<string, unknown>;
        for (const field of ['avatar', 'image', 'photo']) {
          if (typeof memberObj[field] === 'string' && isExternalUrl(memberObj[field] as string)) {
            images.push({ path: `team.${index}.${field}`, url: memberObj[field] as string });
          }
        }
      }
    });
  }

  // Members block (members[].image/photo/avatar)
  if (Array.isArray(data.members)) {
    data.members.forEach((member, index) => {
      if (typeof member === 'object' && member !== null) {
        const memberObj = member as Record<string, unknown>;
        for (const field of ['image', 'photo', 'avatar']) {
          if (typeof memberObj[field] === 'string' && isExternalUrl(memberObj[field] as string)) {
            images.push({ path: `members.${index}.${field}`, url: memberObj[field] as string });
          }
        }
      }
    });
  }

  // Testimonials block (testimonials[].avatar)
  if (Array.isArray(data.testimonials)) {
    data.testimonials.forEach((testimonial, index) => {
      if (typeof testimonial === 'object' && testimonial !== null) {
        const testimonialObj = testimonial as Record<string, unknown>;
        if (typeof testimonialObj.avatar === 'string' && isExternalUrl(testimonialObj.avatar)) {
          images.push({ path: `testimonials.${index}.avatar`, url: testimonialObj.avatar });
        }
      }
    });
  }

  // Items block (items[].image/avatar)
  if (Array.isArray(data.items)) {
    data.items.forEach((item, index) => {
      if (typeof item === 'object' && item !== null) {
        const itemObj = item as Record<string, unknown>;
        for (const field of ['image', 'avatar', 'photo', 'src']) {
          if (typeof itemObj[field] === 'string' && isExternalUrl(itemObj[field] as string)) {
            images.push({ path: `items.${index}.${field}`, url: itemObj[field] as string });
          }
        }
      }
    });
  }

  // Features block (features[].image)
  if (Array.isArray(data.features)) {
    data.features.forEach((feature, index) => {
      if (typeof feature === 'object' && feature !== null) {
        const featureObj = feature as Record<string, unknown>;
        if (typeof featureObj.image === 'string' && isExternalUrl(featureObj.image)) {
          images.push({ path: `features.${index}.image`, url: featureObj.image });
        }
      }
    });
  }

  // Products block (products[].image)
  if (Array.isArray(data.products)) {
    data.products.forEach((product, index) => {
      if (typeof product === 'object' && product !== null) {
        const productObj = product as Record<string, unknown>;
        if (typeof productObj.image === 'string' && isExternalUrl(productObj.image)) {
          images.push({ path: `products.${index}.image`, url: productObj.image });
        }
      }
    });
  }

  return images;
};

/**
 * Extract all image URLs from an array of content blocks
 */
export const extractImageUrls = (blocks: ContentBlock[]): BlockImageReference[] => {
  const images: BlockImageReference[] = [];

  blocks.forEach((block, blockIndex) => {
    const data = block.data as Record<string, unknown>;
    const blockImages = extractImagesFromBlockData(data);
    
    blockImages.forEach(img => {
      images.push({ ...img, blockIndex });
    });
  });

  return images;
};

/**
 * Check if a URL is an external URL (not already in our storage)
 */
export const isExternalUrl = (url: string): boolean => {
  if (!url || typeof url !== 'string') return false;
  
  // Skip data URLs
  if (url.startsWith('data:')) return false;
  
  // Skip our own storage URLs
  if (url.includes('supabase') && url.includes('cms-images')) return false;
  
  // Local bundled template images (served from public/)
  if (url.startsWith('/templates/')) return false;
  
  // Skip other relative URLs
  if (!url.startsWith('http://') && !url.startsWith('https://')) return false;
  
  return true;
};

/**
 * Check if a URL is a local bundled template image
 */
export const isLocalTemplateImage = (url: string): boolean => {
  return typeof url === 'string' && url.startsWith('/templates/');
};

/**
 * Update block data at a nested path
 */
export const updateBlockAtPath = (
  blocks: ContentBlock[], 
  blockIndex: number, 
  path: string, 
  newValue: string
): ContentBlock[] => {
  const newBlocks = [...blocks];
  const block = { ...newBlocks[blockIndex], data: { ...newBlocks[blockIndex].data as object } };
  
  const parts = path.split('.');
  let current: Record<string, unknown> = block.data as Record<string, unknown>;
  
  for (let i = 0; i < parts.length - 1; i++) {
    const key = parts[i];
    if (Array.isArray(current[key])) {
      current[key] = [...(current[key] as unknown[])];
      const idx = parseInt(parts[i + 1]);
      if (!isNaN(idx)) {
        (current[key] as unknown[])[idx] = { ...((current[key] as unknown[])[idx] as object) };
        current = (current[key] as unknown[])[idx] as Record<string, unknown>;
        i++; // Skip the index part
      }
    } else if (typeof current[key] === 'object' && current[key] !== null) {
      current[key] = { ...(current[key] as object) };
      current = current[key] as Record<string, unknown>;
    }
  }
  
  const lastKey = parts[parts.length - 1];
  current[lastKey] = newValue;
  
  newBlocks[blockIndex] = block;
  return newBlocks;
};

export interface TemplateImageInfo {
  pages: { pageIndex: number; blockIndex: number; path: string; url: string }[];
  blogPosts: { postIndex: number; field: string; url: string }[];
  products: { productIndex: number; url: string }[];
  total: number;
  uniqueUrls: string[];
}

/**
 * Extract all unique image URLs from a template
 */
export const extractImagesFromTemplate = (template: {
  pages?: { blocks?: ContentBlock[] }[];
  blogPosts?: { featured_image?: string }[];
  products?: { image_url?: string }[];
}): TemplateImageInfo => {
  const result: TemplateImageInfo = {
    pages: [],
    blogPosts: [],
    products: [],
    total: 0,
    uniqueUrls: [],
  };

  const urlSet = new Set<string>();

  const isDownloadableUrl = (url: string): boolean => {
    return isExternalUrl(url) || isLocalTemplateImage(url);
  };

  // Extract from pages — check both external and local template images
  if (template.pages) {
    template.pages.forEach((page, pageIndex) => {
      if (page.blocks) {
        // Use a modified check that includes local template images
        const blocks = page.blocks as ContentBlock[];
        blocks.forEach((block, blockIndex) => {
          const data = block.data as Record<string, unknown>;
          const refs = extractImagesFromBlockDataWithLocal(data);
          refs.forEach(img => {
            result.pages.push({ pageIndex, blockIndex, path: img.path, url: img.url });
            urlSet.add(img.url);
          });
        });
      }
    });
  }

  // Extract from blog posts
  if (template.blogPosts) {
    template.blogPosts.forEach((post, postIndex) => {
      if (post.featured_image && isDownloadableUrl(post.featured_image)) {
        result.blogPosts.push({ postIndex, field: 'featured_image', url: post.featured_image });
        urlSet.add(post.featured_image);
      }
    });
  }

  // Extract from products
  if (template.products) {
    template.products.forEach((product, productIndex) => {
      if (product.image_url && isDownloadableUrl(product.image_url)) {
        result.products.push({ productIndex, url: product.image_url });
        urlSet.add(product.image_url);
      }
    });
  }

  result.uniqueUrls = Array.from(urlSet);
  result.total = result.pages.length + result.blogPosts.length + result.products.length;

  return result;
};

/**
 * Extract images including local template images from block data
 */
const extractImagesFromBlockDataWithLocal = (data: Record<string, unknown>): ImageReference[] => {
  const images: ImageReference[] = [];
  const check = (url: string) => isExternalUrl(url) || isLocalTemplateImage(url);

  // Direct image fields
  const directImageFields = ['src', 'backgroundImage', 'image', 'imageSrc', 'imageUrl', 'backgroundUrl'];
  for (const field of directImageFields) {
    if (typeof data[field] === 'string' && check(data[field] as string)) {
      images.push({ path: field, url: data[field] as string });
    }
  }

  // Array fields with image properties
  const arrayFields = ['images', 'articles', 'links', 'logos', 'team', 'members', 'testimonials', 'features', 'products', 'items', 'slides', 'cards', 'clients', 'partners', 'badges'];
  const imageProps = ['src', 'image', 'logo', 'avatar', 'photo', 'thumbnail'];

  for (const arrField of arrayFields) {
    if (Array.isArray(data[arrField])) {
      (data[arrField] as unknown[]).forEach((item, index) => {
        if (typeof item === 'object' && item !== null) {
          const obj = item as Record<string, unknown>;
          for (const prop of imageProps) {
            if (typeof obj[prop] === 'string' && check(obj[prop] as string)) {
              images.push({ path: `${arrField}.${index}.${prop}`, url: obj[prop] as string });
            }
          }
        }
      });
    }
  }

  return images;
};

/**
 * Count total unique images in a template (useful for UI display)
 */
export const countTemplateImages = (template: {
  pages?: { blocks?: ContentBlock[] }[];
  blogPosts?: { featured_image?: string }[];
  products?: { image_url?: string }[];
}): number => {
  return extractImagesFromTemplate(template).uniqueUrls.length;
};
