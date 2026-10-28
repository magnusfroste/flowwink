/**
 * Template Types & Interfaces
 * 
 * Shared type definitions for all starter templates.
 * Import these when creating new templates.
 */

import { ContentBlock, PageMeta, FooterBlockData, HeaderBlockData } from '@/types/cms';
import { BrandingSettings, ChatSettings, SeoSettings, CookieBannerSettings, AeoSettings } from '@/hooks/useSiteSettings';
import { ModulesSettings } from '@/hooks/useModules';
import { TemplateKbCategory } from '@/data/template-kb-articles';

// Help style for templates
export type HelpStyle = 'kb-classic' | 'ai-hub' | 'hybrid' | 'none';

// Product definition for e-commerce templates
export interface TemplateProductStock {
  quantity_on_hand: number;
  reorder_point?: number;
}

export interface TemplateProduct {
  name: string;
  description: string;
  price_cents: number;
  currency: string;
  type: 'one_time' | 'recurring';
  image_url?: string;
  is_active?: boolean;
  stock?: TemplateProductStock;
}

// Consultant profile for consulting/agency templates
export interface TemplateConsultant {
  name: string;
  title: string;
  summary: string;
  bio?: string;
  skills: string[];
  experience_years: number;
  certifications?: string[];
  languages?: string[];
  availability: 'available' | 'partially_available' | 'unavailable';
  hourly_rate_cents?: number;
  currency?: string;
  avatar_url?: string;
  linkedin_url?: string;
  is_active?: boolean;
}

// Booking service definition for templates
export interface TemplateBookingService {
  name: string;
  description?: string;
  duration_minutes: number;
  price_cents: number;
  currency: string;
  color?: string;
  is_active?: boolean;
}

// Booking availability slot for templates
export interface TemplateBookingAvailability {
  day_of_week: number; // 0=Sun, 1=Mon, ..., 6=Sat
  start_time: string;  // "09:00"
  end_time: string;    // "17:00"
  is_active?: boolean;
}

/**
 * A wiki page as the wiki stores it — carried by `export_site_template`
 * (include "wiki") and restored by `install_template` on the slug: an existing
 * slug is updated, never duplicated. `parent_slug` is applied in a second pass
 * once every page exists, so a hierarchy travels whole.
 */
export interface TemplateWikiPage {
  slug: string;
  title: string;
  content_md: string;
  tags?: string[];
  parent_slug?: string | null;
  /** internal (every signed-in user) | admin. Carried verbatim. */
  visibility?: 'internal' | 'admin';
  editable_by?: 'authenticated' | 'admin';
}

/**
 * An uploaded document: its metadata, its indexed text, and — when the export
 * could fetch it within the edge budget — the stored file itself. Visibility
 * travels with the row and is never widened: a document that was `private`
 * stays private, and nothing uploaded ever becomes public (the `documents`
 * bucket is private by construction).
 *
 * Exactly one of `file`, `file_ref`, `file_omitted` describes the bytes:
 *  - `file`         — embedded (base64 + SHA-256 seal, verified on install)
 *  - `file_ref`     — referenced, not copied (an external URL or a `demo://`
 *                     fixture); restored as the same reference
 *  - `file_omitted` — bytes left behind on purpose, with the reason (too
 *                     large, payload full, out of time, unreachable,
 *                     embed_files=false); the text still travels
 */
export interface TemplateDocument {
  title: string;
  file_name: string;
  file_type?: string | null;
  file_size_bytes?: number | null;
  category?: string;
  tags?: string[];
  folder?: string | null;
  description?: string | null;
  visibility?: 'shared' | 'role' | 'private';
  visible_to_role?: string | null;
  content_md?: string | null;
  extraction_status?: string | null;
  source?: string | null;
  file?: { base64: string; sha256: string; bytes: number };
  file_ref?: string;
  file_omitted?: string;
}

/**
 * A media file copied out of THIS instance's public storage (`copy_media: true`)
 * so the installed site stands alone. `url` is the absolute URL the carried
 * content references; the installer uploads the bytes to `bucket/path` on the
 * target and rewrites every occurrence of `url` to the new public URL.
 */
export interface TemplateMediaFile {
  url: string;
  /** Every URL variant naming this object (`a.png`, `a.png?t=1`); all are rewritten on install. */
  urls?: string[];
  bucket: string;
  path: string;
  content_type?: string;
  bytes: number;
  sha256: string;
  base64: string;
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
  /**
   * The accounting locale pack this template ACTIVATES on install (e.g.
   * 'se-bas2024'). The engine is empty-until-chosen — it never assumes a
   * country — so the template is where the default choice lives, the way a
   * WordPress installer preselects a language. Installation writes
   * site_settings.accounting_locale ONLY if no choice exists yet; it never
   * overrides one. Omit (blank template) to leave accounting un-activated.
   */
  accountingLocale?: string;
  /**
   * A FICTIONAL company's Business Identity (site_settings.company_profile),
   * for demo templates only (category 'platform'). Written on install ONLY
   * when the instance has no identity yet, never over one.
   *
   * Real templates must not carry one: identity is what every outward-facing
   * text is grounded in, and a template's invented company would become the
   * customer's. The demo needs it for the opposite reason — without it the
   * first thing a tester asks a connected agent ("write a blog post") is
   * refused with "No Business Identity yet" (sandbox, 2026-10-18).
   */
  demoIdentity?: {
    company_name: string;
    tagline?: string;
    about_us?: string;
    industry?: string;
    services?: Array<{ name: string; description: string }>;
    differentiators?: Array<{ name: string; description: string }>;
    target_industries?: string[];
    primary_cta?: { label: string; destination: string; intent?: string };
  };
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
  /**
   * Modules the installer switches ON. `['*']` enables every module the
   * instance knows — the demo template's contract, where the whole point is
   * showing the full surface (Magnus 2026-08-12: an explicit list silently
   * capped the demo at whatever subset existed when the list was written).
   * Same wildcard convention as chat-context page scoping.
   */
  requiredModules?: (keyof ModulesSettings | '*')[];
  
  // Products for e-commerce templates
  products?: TemplateProduct[];

  // Consultant profiles for consulting/agency templates
  consultants?: TemplateConsultant[];

  // Booking services and availability
  bookingServices?: TemplateBookingService[];
  bookingAvailability?: TemplateBookingAvailability[];

  // The site's knowledge and files — written by export_site_template
  // (include "wiki" / "documents", copy_media) and restored by
  // install_template. Shipped catalog templates carry none of these.
  wikiPages?: TemplateWikiPage[];
  documents?: TemplateDocument[];
  media?: TemplateMediaFile[];

  // Site-wide settings
  branding: Partial<BrandingSettings>;
  chatSettings?: Partial<ChatSettings>;
  headerSettings?: Partial<HeaderBlockData>;
  footerSettings?: Partial<FooterBlockData>;
  seoSettings?: Partial<SeoSettings>;
  aeoSettings?: Partial<AeoSettings>;
  cookieBannerSettings?: Partial<CookieBannerSettings>;
  
  // FlowPilot is an opt-in module — bootstrapped automatically via useFlowPilotBootstrap
  // when enabled. Templates no longer seed FlowPilot objectives, automations, or workflows.
  
  // General settings
  siteSettings: {
    homepageSlug: string;
  };
}
