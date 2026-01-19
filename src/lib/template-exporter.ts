/**
 * Template Exporter
 * 
 * Utility to export the current site's configuration as a StarterTemplate.
 * This allows creating new templates based on existing site content.
 */

import { ContentBlock, PageMeta, FooterBlockData, HeaderBlockData } from '@/types/cms';
import { BrandingSettings, ChatSettings, SeoSettings, CookieBannerSettings } from '@/hooks/useSiteSettings';
import { ModulesSettings } from '@/hooks/useModules';
import { StarterTemplate, TemplatePage, TemplateBlogPost, TemplateProduct } from '@/data/starter-templates';
import { TemplateKbCategory } from '@/data/template-kb-articles';

export interface SiteExportData {
  pages: Array<{
    title: string;
    slug: string;
    content_json: ContentBlock[];
    meta_json: PageMeta;
    menu_order: number;
    show_in_menu: boolean;
    status: string;
  }>;
  settings: {
    branding?: BrandingSettings;
    chat?: ChatSettings;
    footer?: FooterBlockData;
    header?: HeaderBlockData;
    seo?: SeoSettings;
    cookie_banner?: CookieBannerSettings;
    general?: { homepageSlug: string };
    modules?: ModulesSettings;
  };
  blogPosts?: Array<{
    title: string;
    slug: string;
    excerpt: string;
    featured_image?: string;
    featured_image_alt?: string;
    content_json: ContentBlock[];
  }>;
  kbCategories?: TemplateKbCategory[];
  products?: TemplateProduct[];
}

export interface TemplateMetadata {
  id: string;
  name: string;
  description: string;
  category: 'startup' | 'enterprise' | 'compliance' | 'platform' | 'helpcenter';
  icon: string;
  tagline: string;
}

/**
 * Converts site data into a StarterTemplate object
 */
export function exportSiteAsTemplate(
  siteData: SiteExportData,
  metadata: TemplateMetadata
): StarterTemplate {
  // Convert pages to TemplatePage format
  const templatePages: TemplatePage[] = siteData.pages
    .filter(page => page.status === 'published')
    .map(page => ({
      title: page.title,
      slug: page.slug,
      isHomePage: page.slug === siteData.settings.general?.homepageSlug,
      blocks: page.content_json || [],
      meta: page.meta_json || {},
      menu_order: page.menu_order,
      showInMenu: page.show_in_menu,
    }));

  // Convert blog posts if available
  const templateBlogPosts: TemplateBlogPost[] | undefined = siteData.blogPosts?.map(post => ({
    title: post.title,
    slug: post.slug,
    excerpt: post.excerpt || '',
    featured_image: post.featured_image,
    featured_image_alt: post.featured_image_alt,
    content: post.content_json || [],
  }));

  // Build the template
  const template: StarterTemplate = {
    id: metadata.id,
    name: metadata.name,
    description: metadata.description,
    category: metadata.category,
    icon: metadata.icon,
    tagline: metadata.tagline,
    aiChatPosition: 'bottom-right',
    
    pages: templatePages,
    blogPosts: templateBlogPosts,
    kbCategories: siteData.kbCategories,
    products: siteData.products,
    
    branding: siteData.settings.branding || {},
    chatSettings: siteData.settings.chat,
    headerSettings: siteData.settings.header,
    footerSettings: siteData.settings.footer,
    seoSettings: siteData.settings.seo,
    cookieBannerSettings: siteData.settings.cookie_banner,
    
    siteSettings: {
      homepageSlug: siteData.settings.general?.homepageSlug || 'home',
    },
  };

  // Add required modules if available
  if (siteData.settings.modules) {
    const enabledModules = Object.entries(siteData.settings.modules)
      .filter(([, config]) => config?.enabled)
      .map(([key]) => key as keyof ModulesSettings);
    
    if (enabledModules.length > 0) {
      template.requiredModules = enabledModules;
    }
  }

  return template;
}

/**
 * Generates TypeScript code for the template
 */
export function generateTemplateCode(template: StarterTemplate): string {
  const sanitizeString = (str: string) => str.replace(/'/g, "\\'").replace(/\n/g, '\\n');
  
  // Generate pages array
  const pagesCode = template.pages.map(page => {
    const blocksCode = JSON.stringify(page.blocks, null, 2)
      .split('\n')
      .map((line, i) => i === 0 ? line : '      ' + line)
      .join('\n');
    
    return `  {
    title: '${sanitizeString(page.title)}',
    slug: '${page.slug}',
    isHomePage: ${page.isHomePage || false},
    menu_order: ${page.menu_order || 0},
    showInMenu: ${page.showInMenu ?? true},
    meta: ${JSON.stringify(page.meta, null, 2).split('\n').map((l, i) => i === 0 ? l : '    ' + l).join('\n')},
    blocks: ${blocksCode},
  }`;
  }).join(',\n');

  const code = `// Generated Template: ${template.name}
// Created: ${new Date().toISOString()}

import { ContentBlock, PageMeta } from '@/types/cms';
import { StarterTemplate, TemplatePage } from '@/data/starter-templates';

const ${template.id.replace(/-/g, '_')}Pages: TemplatePage[] = [
${pagesCode}
];

export const ${template.id.replace(/-/g, '_')}Template: StarterTemplate = {
  id: '${template.id}',
  name: '${sanitizeString(template.name)}',
  description: '${sanitizeString(template.description)}',
  category: '${template.category}',
  icon: '${template.icon}',
  tagline: '${sanitizeString(template.tagline)}',
  aiChatPosition: '${template.aiChatPosition}',
  
  pages: ${template.id.replace(/-/g, '_')}Pages,
  
  branding: ${JSON.stringify(template.branding, null, 2)},
  
  chatSettings: ${JSON.stringify(template.chatSettings, null, 2)},
  
  footerSettings: ${JSON.stringify(template.footerSettings, null, 2)},
  
  siteSettings: {
    homepageSlug: '${template.siteSettings.homepageSlug}',
  },
};
`;

  return code;
}

/**
 * Exports template as downloadable JSON
 */
export function exportTemplateAsJson(template: StarterTemplate): string {
  return JSON.stringify(template, null, 2);
}

/**
 * Validates a template structure
 */
export function validateTemplate(template: Partial<StarterTemplate>): {
  valid: boolean;
  errors: string[];
  warnings: string[];
} {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Required fields
  if (!template.id) errors.push('Template ID is required');
  if (!template.name) errors.push('Template name is required');
  if (!template.description) errors.push('Template description is required');
  if (!template.pages || template.pages.length === 0) {
    errors.push('Template must have at least one page');
  }
  if (!template.siteSettings?.homepageSlug) {
    errors.push('Homepage slug is required in siteSettings');
  }

  // Validate pages
  template.pages?.forEach((page, index) => {
    if (!page.title) errors.push(`Page ${index + 1}: title is required`);
    if (!page.slug) errors.push(`Page ${index + 1}: slug is required`);
    if (!page.blocks || page.blocks.length === 0) {
      warnings.push(`Page "${page.title || index}": has no content blocks`);
    }
  });

  // Check homepage exists
  const homepageSlug = template.siteSettings?.homepageSlug;
  if (homepageSlug && template.pages) {
    const homepageExists = template.pages.some(p => p.slug === homepageSlug);
    if (!homepageExists) {
      errors.push(`Homepage slug "${homepageSlug}" does not match any page`);
    }
  }

  // Warnings for missing recommended fields
  if (!template.branding) {
    warnings.push('No branding settings defined - template will use defaults');
  }
  if (!template.tagline) {
    warnings.push('No tagline defined - consider adding one for template gallery');
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}
