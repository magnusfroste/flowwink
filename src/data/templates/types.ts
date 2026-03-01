/**
 * Template Types & Interfaces
 * 
 * Shared type definitions for all starter templates.
 * Import these when creating new templates.
 */

import { ContentBlock, PageMeta, FooterBlockData, HeaderBlockData } from '@/types/cms';
import { BrandingSettings, ChatSettings, SeoSettings, CookieBannerSettings } from '@/hooks/useSiteSettings';
import { ModulesSettings } from '@/hooks/useModules';
import { TemplateKbCategory } from '@/data/template-kb-articles';

// Help style for templates
export type HelpStyle = 'kb-classic' | 'ai-hub' | 'hybrid' | 'none';

// Product definition for e-commerce templates
export interface TemplateProduct {
  name: string;
  description: string;
  price_cents: number;
  currency: string;
  type: 'one_time' | 'recurring';
  image_url?: string;
  is_active?: boolean;
}

// Page definition within a template
export interface TemplatePage {
  title: string;
  slug: string;
  isHomePage?: boolean;
  blocks: ContentBlock[];
  meta: PageMeta;
  menu_order?: number;
  showInMenu?: boolean;
}

// Blog post definition within a template
export interface TemplateBlogPost {
  title: string;
  slug: string;
  excerpt: string;
  featured_image?: string;
  featured_image_alt?: string;
  content: ContentBlock[];
  meta?: {
    description?: string;
  };
  is_featured?: boolean;
}

// Full site template
export interface StarterTemplate {
  id: string;
  name: string;
  description: string;
  category: 'startup' | 'enterprise' | 'compliance' | 'platform' | 'helpcenter';
  icon: string;
  tagline: string;
  aiChatPosition: string;
  helpStyle?: HelpStyle;
  
  // Multi-page support
  pages: TemplatePage[];
  
  // Blog posts (optional)
  blogPosts?: TemplateBlogPost[];
  
  // Knowledge Base (optional)
  kbCategories?: TemplateKbCategory[];
  
  // Modules to enable on template install
  requiredModules?: (keyof ModulesSettings)[];
  
  // Products for e-commerce templates
  products?: TemplateProduct[];
  
  // Site-wide settings
  branding: Partial<BrandingSettings>;
  chatSettings?: Partial<ChatSettings>;
  headerSettings?: Partial<HeaderBlockData>;
  footerSettings?: Partial<FooterBlockData>;
  seoSettings?: Partial<SeoSettings>;
  cookieBannerSettings?: Partial<CookieBannerSettings>;
  
  // General settings
  siteSettings: {
    homepageSlug: string;
  };
}
