/**
 * Template JSON Loader
 * 
 * Loads and validates StarterTemplate objects from JSON files.
 * Used by the template registry to support both TS and JSON sources.
 * 
 * JSON templates in /templates/ are imported statically at build time
 * via Vite's JSON import support.
 */

import type { StarterTemplate } from '@/data/templates/types';

/**
 * Validates that a parsed JSON object conforms to StarterTemplate shape.
 * Returns the template if valid, throws if critical fields are missing.
 */
export function validateJsonTemplate(data: unknown): StarterTemplate {
  const obj = data as Record<string, unknown>;

  if (!obj || typeof obj !== 'object') {
    throw new Error('Template JSON must be an object');
  }

  // Required fields
  const required = ['id', 'name', 'pages', 'siteSettings'] as const;
  for (const field of required) {
    if (!obj[field]) {
      throw new Error(`Missing required field: ${field}`);
    }
  }

  if (!Array.isArray(obj.pages) || obj.pages.length === 0) {
    throw new Error('Template must have at least one page');
  }

  // Apply defaults for optional fields
  return {
    id: obj.id as string,
    name: obj.name as string,
    description: (obj.description as string) || '',
    category: (obj.category as StarterTemplate['category']) || 'startup',
    icon: (obj.icon as string) || 'FileText',
    tagline: (obj.tagline as string) || '',
    aiChatPosition: (obj.aiChatPosition as string) || 'bottom-right',
    pages: obj.pages as StarterTemplate['pages'],
    blogPosts: obj.blogPosts as StarterTemplate['blogPosts'],
    kbCategories: obj.kbCategories as StarterTemplate['kbCategories'],
    products: obj.products as StarterTemplate['products'],
    requiredModules: obj.requiredModules as StarterTemplate['requiredModules'],
    helpStyle: obj.helpStyle as StarterTemplate['helpStyle'],
    branding: (obj.branding as StarterTemplate['branding']) || {},
    chatSettings: obj.chatSettings as StarterTemplate['chatSettings'],
    headerSettings: obj.headerSettings as StarterTemplate['headerSettings'],
    footerSettings: obj.footerSettings as StarterTemplate['footerSettings'],
    seoSettings: obj.seoSettings as StarterTemplate['seoSettings'],
    cookieBannerSettings: obj.cookieBannerSettings as StarterTemplate['cookieBannerSettings'],
    siteSettings: obj.siteSettings as StarterTemplate['siteSettings'],
  };
}

/**
 * Load multiple JSON templates and validate them.
 * Skips invalid templates with a console warning.
 */
export function loadJsonTemplates(jsonModules: Record<string, unknown>[]): StarterTemplate[] {
  const templates: StarterTemplate[] = [];

  for (const data of jsonModules) {
    try {
      templates.push(validateJsonTemplate(data));
    } catch (err) {
      console.warn(`Skipping invalid template:`, err);
    }
  }

  return templates;
}
