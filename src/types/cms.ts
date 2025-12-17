export type AppRole = 'writer' | 'approver' | 'admin';

export type PageStatus = 'draft' | 'reviewing' | 'published' | 'archived';

export interface Profile {
  id: string;
  email: string;
  full_name: string | null;
  avatar_url: string | null;
  created_at: string;
  updated_at: string;
}

export interface UserRole {
  id: string;
  user_id: string;
  role: AppRole;
  created_at: string;
}

export interface Page {
  id: string;
  slug: string;
  title: string;
  status: PageStatus;
  content_json: ContentBlock[];
  meta_json: PageMeta;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
  scheduled_at: string | null;
}

export interface PageVersion {
  id: string;
  page_id: string;
  title: string;
  content_json: ContentBlock[];
  meta_json: PageMeta | null;
  created_by: string | null;
  created_at: string;
}

export interface AuditLog {
  id: string;
  action: string;
  entity_type: string;
  entity_id: string | null;
  user_id: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
}

export interface PageMeta {
  description?: string;
  keywords?: string[];
  og_image?: string;
  // Page display settings
  showTitle?: boolean;
  titleAlignment?: 'left' | 'center';
  // SEO settings
  seoTitle?: string;
  noIndex?: boolean;
  noFollow?: boolean;
}

export type ContentBlockType = 
  | 'hero'
  | 'text'
  | 'image'
  | 'cta'
  | 'contact'
  | 'link-grid'
  | 'two-column'
  | 'info-box'
  | 'accordion'
  | 'article-grid'
  | 'youtube'
  | 'quote'
  | 'separator'
  | 'gallery'
  | 'stats'
  | 'chat'
  | 'footer'
  | 'header';

// Global block slot types
export type GlobalBlockSlot = 'footer' | 'header' | 'sidebar';

// Global block record
export interface GlobalBlock {
  id: string;
  slot: GlobalBlockSlot;
  type: ContentBlockType;
  data: Record<string, unknown>;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  updated_by: string | null;
}

// Header block data (stored in global_blocks.data)
export interface HeaderBlockData {
  showLogo?: boolean;
  showNameWithLogo?: boolean;
  logoSize?: 'sm' | 'md' | 'lg';
  stickyHeader?: boolean;
  showThemeToggle?: boolean;
  // Custom nav items (external links beyond CMS pages)
  customNavItems?: HeaderNavItem[];
}

export interface HeaderNavItem {
  id: string;
  label: string;
  url: string;
  openInNewTab?: boolean;
  enabled: boolean;
}

// Footer block data (stored in global_blocks.data)
export interface FooterBlockData {
  phone: string;
  email: string;
  address: string;
  postalCode: string;
  weekdayHours: string;
  weekendHours: string;
  // Social media
  facebook?: string;
  instagram?: string;
  linkedin?: string;
  twitter?: string;
  youtube?: string;
  // Section visibility
  showBrand?: boolean;
  showQuickLinks?: boolean;
  showContact?: boolean;
  showHours?: boolean;
  // Section order
  sectionOrder?: FooterSectionId[];
  // Legal links
  legalLinks?: FooterLegalLink[];
}

export type FooterSectionId = 'brand' | 'quickLinks' | 'contact' | 'hours';

export interface FooterLegalLink {
  id: string;
  label: string;
  url: string;
  enabled: boolean;
}

export interface ContentBlock {
  id: string;
  type: ContentBlockType;
  data: Record<string, unknown>;
}

export interface HeroBlockData {
  title: string;
  subtitle?: string;
  // Background options
  backgroundType?: 'image' | 'video' | 'color';
  backgroundImage?: string;
  // Video background support
  videoUrl?: string;
  videoUrlWebm?: string;
  videoPosterUrl?: string;
  videoAutoplay?: boolean;
  videoLoop?: boolean;
  videoMuted?: boolean;
  // Layout options
  heightMode?: 'auto' | 'viewport' | '80vh' | '60vh';
  contentAlignment?: 'top' | 'center' | 'bottom';
  overlayOpacity?: number;
  parallaxEffect?: boolean;
  titleAnimation?: 'none' | 'fade-in' | 'slide-up' | 'typewriter';
  showScrollIndicator?: boolean;
  // Buttons
  primaryButton?: { text: string; url: string };
  secondaryButton?: { text: string; url: string };
}

// Tiptap JSON document structure (ProseMirror format)
export interface TiptapMark {
  type: string;
  attrs?: Record<string, unknown>;
}

export interface TiptapNode {
  type: string;
  attrs?: Record<string, unknown>;
  content?: TiptapNode[];
  marks?: TiptapMark[];
  text?: string;
}

export interface TiptapDocument {
  type: 'doc';
  content: TiptapNode[];
}

export interface TextBlockData {
  content: string | TiptapDocument; // HTML (legacy) or Tiptap JSON
  backgroundColor?: string;
}

export interface ImageBlockData {
  src: string;
  alt: string;
  caption?: string;
}

export interface CTABlockData {
  title: string;
  subtitle?: string;
  buttonText: string;
  buttonUrl: string;
  gradient?: boolean;
}

export interface ContactBlockData {
  title: string;
  phone?: string;
  email?: string;
  address?: string;
  hours?: { day: string; time: string }[];
}

export interface LinkGridBlockData {
  links: { icon: string; title: string; description?: string; url: string }[];
  columns: 2 | 3 | 4;
}

export interface TwoColumnBlockData {
  content: string | TiptapDocument; // HTML (legacy) or Tiptap JSON
  imageSrc: string;
  imageAlt: string;
  imagePosition: 'left' | 'right';
}

export interface InfoBoxBlockData {
  title: string;
  content: string | TiptapDocument; // Plaintext/HTML (legacy) or Tiptap JSON
  variant: 'info' | 'success' | 'warning' | 'highlight';
  icon?: string;
}

export interface AccordionBlockData {
  title?: string;
  items: { question: string; answer: string | TiptapDocument; image?: string; imageAlt?: string }[];
}

export interface ArticleGridBlockData {
  title?: string;
  articles: { title: string; excerpt: string; image?: string; url: string }[];
  columns: 2 | 3 | 4;
}

export interface YouTubeBlockData {
  url: string;
  title?: string;
  autoplay?: boolean;
  loop?: boolean;
  mute?: boolean;
  controls?: boolean;
}

export interface QuoteBlockData {
  text: string;
  author?: string;
  source?: string;
  variant: 'simple' | 'styled';
}

export interface SeparatorBlockData {
  style: 'line' | 'dots' | 'ornament' | 'space';
  spacing: 'sm' | 'md' | 'lg';
}

export interface GalleryBlockData {
  images: { src: string; alt: string; caption?: string }[];
  layout: 'grid' | 'carousel' | 'masonry';
  columns: 2 | 3 | 4;
}

export interface StatsBlockData {
  title?: string;
  stats: { value: string; label: string; icon?: string }[];
}

export interface ChatBlockData {
  title?: string;
  height: 'sm' | 'md' | 'lg' | 'full';
  showSidebar: boolean;
  initialPrompt?: string;
  variant: 'embedded' | 'card';
}

// Workflow actions
export type WorkflowAction = 
  | 'save_draft'
  | 'send_for_review'
  | 'approve'
  | 'reject'
  | 'archive';

export const STATUS_LABELS: Record<PageStatus, string> = {
  draft: 'Draft',
  reviewing: 'Review',
  published: 'Published',
  archived: 'Archived',
};

export const STATUS_ICONS: Record<PageStatus, string> = {
  draft: '🖊️',
  reviewing: '⏳',
  published: '✅',
  archived: '📦',
};

export const ROLE_LABELS: Record<AppRole, string> = {
  writer: 'Writer',
  approver: 'Approver',
  admin: 'Administrator',
};
