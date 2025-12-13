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
  | 'youtube';

export interface ContentBlock {
  id: string;
  type: ContentBlockType;
  data: Record<string, unknown>;
}

export interface HeroBlockData {
  title: string;
  subtitle?: string;
  backgroundImage?: string;
  primaryButton?: { text: string; url: string };
  secondaryButton?: { text: string; url: string };
}

export interface TextBlockData {
  content: string; // HTML from Tiptap
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
  content: string;
  imageSrc: string;
  imageAlt: string;
  imagePosition: 'left' | 'right';
}

export interface InfoBoxBlockData {
  title: string;
  content: string;
  variant: 'info' | 'success' | 'warning' | 'highlight';
  icon?: string;
}

export interface AccordionBlockData {
  title?: string;
  items: { question: string; answer: string }[];
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

// Workflow actions
export type WorkflowAction = 
  | 'save_draft'
  | 'send_for_review'
  | 'approve'
  | 'reject'
  | 'archive';

export const STATUS_LABELS: Record<PageStatus, string> = {
  draft: 'Utkast',
  reviewing: 'Granskning',
  published: 'Publicerad',
  archived: 'Arkiverad',
};

export const STATUS_ICONS: Record<PageStatus, string> = {
  draft: '🖊️',
  reviewing: '⏳',
  published: '✅',
  archived: '📦',
};

export const ROLE_LABELS: Record<AppRole, string> = {
  writer: 'Skribent',
  approver: 'Granskare',
  admin: 'Administratör',
};
