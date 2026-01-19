/**
 * Template Importer
 * 
 * Utility to import and validate JSON templates for editing or applying.
 */

import { StarterTemplate, TemplatePage, TemplateBlogPost } from '@/data/starter-templates';
import { ContentBlock } from '@/types/cms';

export interface ImportResult {
  success: boolean;
  template: StarterTemplate | null;
  errors: string[];
  warnings: string[];
}

/**
 * Parses and validates a JSON string as a StarterTemplate
 */
export function parseTemplateJson(jsonString: string): ImportResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  
  try {
    const parsed = JSON.parse(jsonString);
    
    // Validate required fields
    if (!parsed.id || typeof parsed.id !== 'string') {
      errors.push('Missing or invalid template ID');
    }
    if (!parsed.name || typeof parsed.name !== 'string') {
      errors.push('Missing or invalid template name');
    }
    if (!parsed.pages || !Array.isArray(parsed.pages)) {
      errors.push('Missing or invalid pages array');
    }
    if (!parsed.siteSettings?.homepageSlug) {
      errors.push('Missing homepage slug in siteSettings');
    }
    
    // Validate pages
    if (parsed.pages && Array.isArray(parsed.pages)) {
      parsed.pages.forEach((page: Partial<TemplatePage>, index: number) => {
        if (!page.title) {
          errors.push(`Page ${index + 1}: missing title`);
        }
        if (!page.slug) {
          errors.push(`Page ${index + 1}: missing slug`);
        }
        if (!page.blocks || !Array.isArray(page.blocks)) {
          warnings.push(`Page "${page.title || index}": missing or invalid blocks array`);
        } else {
          // Validate blocks
          page.blocks.forEach((block: Partial<ContentBlock>, blockIndex: number) => {
            if (!block.id) {
              warnings.push(`Page "${page.title}", Block ${blockIndex + 1}: missing ID`);
            }
            if (!block.type) {
              errors.push(`Page "${page.title}", Block ${blockIndex + 1}: missing type`);
            }
          });
        }
      });
      
      // Check homepage exists
      const homepageSlug = parsed.siteSettings?.homepageSlug;
      if (homepageSlug) {
        const homepageExists = parsed.pages.some((p: TemplatePage) => p.slug === homepageSlug);
        if (!homepageExists) {
          errors.push(`Homepage slug "${homepageSlug}" does not match any page`);
        }
      }
    }
    
    // Validate blog posts if present
    if (parsed.blogPosts && Array.isArray(parsed.blogPosts)) {
      parsed.blogPosts.forEach((post: Partial<TemplateBlogPost>, index: number) => {
        if (!post.title) {
          warnings.push(`Blog post ${index + 1}: missing title`);
        }
        if (!post.slug) {
          warnings.push(`Blog post ${index + 1}: missing slug`);
        }
      });
    }
    
    // Check for recommended fields
    if (!parsed.description) {
      warnings.push('No description provided');
    }
    if (!parsed.tagline) {
      warnings.push('No tagline provided');
    }
    if (!parsed.branding) {
      warnings.push('No branding settings - defaults will be used');
    }
    if (!parsed.category) {
      warnings.push('No category specified - defaulting to "startup"');
      parsed.category = 'startup';
    }
    if (!parsed.icon) {
      parsed.icon = 'Rocket';
    }
    
    // Ensure required defaults
    const template: StarterTemplate = {
      id: parsed.id || 'imported-template',
      name: parsed.name || 'Imported Template',
      description: parsed.description || '',
      category: parsed.category || 'startup',
      icon: parsed.icon || 'Rocket',
      tagline: parsed.tagline || '',
      aiChatPosition: parsed.aiChatPosition || 'bottom-right',
      pages: parsed.pages || [],
      blogPosts: parsed.blogPosts,
      kbCategories: parsed.kbCategories,
      products: parsed.products,
      requiredModules: parsed.requiredModules,
      branding: parsed.branding || {},
      chatSettings: parsed.chatSettings,
      headerSettings: parsed.headerSettings,
      footerSettings: parsed.footerSettings,
      seoSettings: parsed.seoSettings,
      cookieBannerSettings: parsed.cookieBannerSettings,
      siteSettings: parsed.siteSettings || { homepageSlug: 'home' },
    };
    
    return {
      success: errors.length === 0,
      template: errors.length === 0 ? template : null,
      errors,
      warnings,
    };
  } catch (e) {
    return {
      success: false,
      template: null,
      errors: [`Invalid JSON: ${e instanceof Error ? e.message : 'Parse error'}`],
      warnings: [],
    };
  }
}

/**
 * Read a file and parse it as a template
 */
export async function importTemplateFromFile(file: File): Promise<ImportResult> {
  return new Promise((resolve) => {
    const reader = new FileReader();
    
    reader.onload = (e) => {
      const content = e.target?.result as string;
      resolve(parseTemplateJson(content));
    };
    
    reader.onerror = () => {
      resolve({
        success: false,
        template: null,
        errors: ['Failed to read file'],
        warnings: [],
      });
    };
    
    reader.readAsText(file);
  });
}

/**
 * Modify specific fields in a template
 */
export function modifyTemplate(
  template: StarterTemplate,
  modifications: Partial<Pick<StarterTemplate, 'id' | 'name' | 'description' | 'tagline' | 'category' | 'icon'>>
): StarterTemplate {
  return {
    ...template,
    ...modifications,
  };
}

/**
 * Generate a unique ID for an imported template
 */
export function generateTemplateId(baseName: string): string {
  const slug = baseName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  
  const timestamp = Date.now().toString(36).slice(-4);
  return `${slug}-${timestamp}`;
}
