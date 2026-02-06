/**
 * Template Validator
 * 
 * Validates template structure and provides clear error messages.
 * Use before importing templates to catch issues early.
 */

import { StarterTemplate, TemplatePage, TemplateBlogPost } from '@/data/starter-templates';
import { ContentBlock, ContentBlockType } from '@/types/cms';

export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
  warnings: ValidationWarning[];
}

export interface ValidationError {
  path: string;
  message: string;
  suggestion?: string;
}

export interface ValidationWarning {
  path: string;
  message: string;
}

// Valid block types - keep in sync with ContentBlockType in cms.ts
const VALID_BLOCK_TYPES: ContentBlockType[] = [
  // Core content blocks
  'hero', 'text', 'image', 'two-column', 'cta', 'features', 'stats',
  'testimonials', 'pricing', 'accordion', 'form', 'logos', 'team',
  'gallery', 'timeline', 'quote', 'separator', 'chat', 'map',
  'newsletter', 'products', 'cart', 'booking', 'comparison',
  'article-grid', 'link-grid', 'youtube', 'info-box', 'popup',
  // Knowledge Base blocks
  'kb-hub', 'kb-search', 'kb-featured', 'kb-accordion',
  // Contact and global blocks
  'contact', 'footer', 'header',
  // Advanced blocks (Design System 2026)
  'marquee', 'progress', 'countdown', 'embed', 'lottie', 'tabs', 
  'table', 'badge', 'social-proof', 'floating-cta', 
  'notification-toast', 'announcement-bar'
];

// Required fields per block type
const BLOCK_REQUIRED_FIELDS: Record<string, string[]> = {
  hero: ['title'],
  text: ['content'],
  image: ['src'],
  'two-column': [], // content is optional - can be empty columns
  cta: ['title', 'buttonText', 'buttonUrl'],
  features: ['features'],
  stats: [], // stats array is optional - can show placeholder
  testimonials: ['testimonials'],
  pricing: ['tiers'],
  accordion: ['items'],
  form: ['fields'],
  logos: ['logos'],
  team: ['members'],
  gallery: ['images'],
  timeline: [], // steps is optional
  quote: ['quote'],
  separator: [],
  chat: [],
  map: [], // address is optional - can use coordinates
  newsletter: [],
  products: [],
  cart: [],
  booking: [],
  comparison: ['products', 'features'],
  'article-grid': [],
  'link-grid': ['links'],
  youtube: [], // videoId is optional - shows placeholder
  'info-box': [], // title is optional
  popup: ['content'],
  // Knowledge Base blocks
  'kb-hub': [],
  'kb-search': [],
  'kb-featured': [],
  // Contact and global blocks
  contact: [],
  footer: [],
  header: [],
  // Advanced blocks
  marquee: [],
  progress: [],
  countdown: [],
  embed: [],
  lottie: [],
  tabs: [],
  table: [],
  badge: [],
  'social-proof': [],
  'floating-cta': [],
  'notification-toast': [],
  'announcement-bar': [],
  'kb-accordion': [],
};

/**
 * Validate a complete template.
 */
export function validateTemplate(template: Partial<StarterTemplate>): ValidationResult {
  const errors: ValidationError[] = [];
  const warnings: ValidationWarning[] = [];

  // Check required template fields
  if (!template.id) {
    errors.push({
      path: 'id',
      message: 'Template ID is required',
      suggestion: 'Add a unique lowercase ID like "my-template"',
    });
  } else if (!/^[a-z0-9-]+$/.test(template.id)) {
    errors.push({
      path: 'id',
      message: 'Template ID must be lowercase with dashes only',
      suggestion: `Use "${template.id.toLowerCase().replace(/[^a-z0-9-]/g, '-')}"`,
    });
  }

  if (!template.name) {
    errors.push({
      path: 'name',
      message: 'Template name is required',
    });
  }

  if (!template.description) {
    warnings.push({
      path: 'description',
      message: 'Template description is recommended for better discovery',
    });
  }

  if (!template.category) {
    errors.push({
      path: 'category',
      message: 'Template category is required',
      suggestion: 'Use one of: startup, enterprise, compliance, platform',
    });
  } else if (!['startup', 'enterprise', 'compliance', 'platform', 'helpcenter'].includes(template.category)) {
    errors.push({
      path: 'category',
      message: `Invalid category "${template.category}"`,
      suggestion: 'Use one of: startup, enterprise, compliance, platform, helpcenter',
    });
  }

  // Check pages
  if (!template.pages || template.pages.length === 0) {
    errors.push({
      path: 'pages',
      message: 'Template must have at least one page',
    });
  } else {
    const homePages = template.pages.filter(p => p.isHomePage);
    if (homePages.length === 0) {
      warnings.push({
        path: 'pages',
        message: 'No page marked as homepage (isHomePage: true)',
      });
    } else if (homePages.length > 1) {
      errors.push({
        path: 'pages',
        message: 'Only one page can be marked as homepage',
        suggestion: 'Remove isHomePage from all but one page',
      });
    }

    // Check for duplicate slugs
    const slugs = template.pages.map(p => p.slug);
    const duplicateSlugs = slugs.filter((s, i) => slugs.indexOf(s) !== i);
    if (duplicateSlugs.length > 0) {
      errors.push({
        path: 'pages',
        message: `Duplicate page slugs: ${duplicateSlugs.join(', ')}`,
        suggestion: 'Each page must have a unique slug',
      });
    }

    // Validate each page
    template.pages.forEach((page, index) => {
      const pageErrors = validatePage(page, `pages[${index}]`);
      errors.push(...pageErrors.errors);
      warnings.push(...pageErrors.warnings);
    });
  }

  // Check blog posts if present
  if (template.blogPosts) {
    template.blogPosts.forEach((post, index) => {
      const postErrors = validateBlogPost(post, `blogPosts[${index}]`);
      errors.push(...postErrors.errors);
      warnings.push(...postErrors.warnings);
    });
  }

  // Check settings
  if (!template.branding) {
    warnings.push({
      path: 'branding',
      message: 'No branding settings defined - defaults will be used',
    });
  }

  if (!template.siteSettings?.homepageSlug) {
    warnings.push({
      path: 'siteSettings.homepageSlug',
      message: 'No homepage slug defined',
    });
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * Validate a single page.
 */
function validatePage(page: TemplatePage, path: string): ValidationResult {
  const errors: ValidationError[] = [];
  const warnings: ValidationWarning[] = [];

  if (!page.title) {
    errors.push({
      path: `${path}.title`,
      message: 'Page title is required',
    });
  }

  if (!page.slug) {
    errors.push({
      path: `${path}.slug`,
      message: 'Page slug is required',
    });
  } else if (!/^[a-z0-9-]+$/.test(page.slug)) {
    errors.push({
      path: `${path}.slug`,
      message: 'Page slug must be lowercase with dashes only',
      suggestion: `Use "${page.slug.toLowerCase().replace(/[^a-z0-9-]/g, '-')}"`,
    });
  }

  if (!page.blocks || page.blocks.length === 0) {
    warnings.push({
      path: `${path}.blocks`,
      message: `Page "${page.title}" has no content blocks`,
    });
  } else {
    // Check for duplicate block IDs
    const blockIds = page.blocks.map(b => b.id);
    const duplicateIds = blockIds.filter((id, i) => blockIds.indexOf(id) !== i);
    if (duplicateIds.length > 0) {
      errors.push({
        path: `${path}.blocks`,
        message: `Duplicate block IDs: ${duplicateIds.join(', ')}`,
        suggestion: 'Each block must have a unique ID within the page',
      });
    }

    // Validate each block
    page.blocks.forEach((block, index) => {
      const blockErrors = validateBlock(block, `${path}.blocks[${index}]`);
      errors.push(...blockErrors.errors);
      warnings.push(...blockErrors.warnings);
    });
  }

  if (!page.meta) {
    warnings.push({
      path: `${path}.meta`,
      message: `Page "${page.title}" has no meta settings`,
    });
  } else if (!page.meta.description) {
    warnings.push({
      path: `${path}.meta.description`,
      message: `Page "${page.title}" has no meta description (important for SEO)`,
    });
  }

  return { valid: errors.length === 0, errors, warnings };
}

/**
 * Validate a single block.
 */
function validateBlock(block: ContentBlock, path: string): ValidationResult {
  const errors: ValidationError[] = [];
  const warnings: ValidationWarning[] = [];

  if (!block.id) {
    errors.push({
      path: `${path}.id`,
      message: 'Block ID is required',
      suggestion: 'Add a unique ID like "hero-1" or "text-intro"',
    });
  }

  if (!block.type) {
    errors.push({
      path: `${path}.type`,
      message: 'Block type is required',
    });
  } else if (!VALID_BLOCK_TYPES.includes(block.type)) {
    errors.push({
      path: `${path}.type`,
      message: `Invalid block type "${block.type}"`,
      suggestion: `Valid types: ${VALID_BLOCK_TYPES.join(', ')}`,
    });
  }

  if (!block.data) {
    errors.push({
      path: `${path}.data`,
      message: 'Block data is required',
    });
  } else if (block.type && BLOCK_REQUIRED_FIELDS[block.type]) {
    // Check required fields for this block type
    const requiredFields = BLOCK_REQUIRED_FIELDS[block.type];
    for (const field of requiredFields) {
      if (!(field in block.data) || block.data[field] === undefined || block.data[field] === null) {
        errors.push({
          path: `${path}.data.${field}`,
          message: `Missing required field "${field}" for ${block.type} block`,
        });
      }
    }
  }

  // Validate content format if present
  if (block.data?.content) {
    const content = block.data.content;
    if (typeof content === 'string') {
      warnings.push({
        path: `${path}.data.content`,
        message: 'Content is a string - use Tiptap format or text() helper for better compatibility',
      });
    } else if (content && typeof content === 'object') {
      const contentObj = content as Record<string, unknown>;
      if (contentObj.type !== 'doc') {
        errors.push({
          path: `${path}.data.content`,
          message: 'Content must be a Tiptap document (type: "doc")',
          suggestion: 'Use the text() or heading() helpers from template-helpers.ts',
        });
      }
    }
  }

  return { valid: errors.length === 0, errors, warnings };
}

/**
 * Validate a blog post.
 */
function validateBlogPost(post: TemplateBlogPost, path: string): ValidationResult {
  const errors: ValidationError[] = [];
  const warnings: ValidationWarning[] = [];

  if (!post.title) {
    errors.push({
      path: `${path}.title`,
      message: 'Blog post title is required',
    });
  }

  if (!post.slug) {
    errors.push({
      path: `${path}.slug`,
      message: 'Blog post slug is required',
    });
  }

  if (!post.excerpt) {
    warnings.push({
      path: `${path}.excerpt`,
      message: 'Blog post excerpt is recommended',
    });
  }

  if (!post.content || post.content.length === 0) {
    warnings.push({
      path: `${path}.content`,
      message: 'Blog post has no content blocks',
    });
  }

  return { valid: errors.length === 0, errors, warnings };
}

/**
 * Format validation results for display.
 */
export function formatValidationResults(result: ValidationResult): string {
  const lines: string[] = [];

  if (result.valid) {
    lines.push('✅ Template is valid!');
  } else {
    lines.push('❌ Template has errors:');
  }

  if (result.errors.length > 0) {
    lines.push('\nErrors:');
    for (const error of result.errors) {
      lines.push(`  • ${error.path}: ${error.message}`);
      if (error.suggestion) {
        lines.push(`    💡 ${error.suggestion}`);
      }
    }
  }

  if (result.warnings.length > 0) {
    lines.push('\nWarnings:');
    for (const warning of result.warnings) {
      lines.push(`  ⚠️ ${warning.path}: ${warning.message}`);
    }
  }

  return lines.join('\n');
}
