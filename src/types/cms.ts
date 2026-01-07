export type AppRole = 'writer' | 'approver' | 'admin';

export type PageStatus = 'draft' | 'reviewing' | 'published' | 'archived';

export interface Profile {
  id: string;
  email: string;
  full_name: string | null;
  avatar_url: string | null;
  title: string | null;
  bio: string | null;
  show_as_author: boolean | null;
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
  | 'map'
  | 'form'
  | 'newsletter'
  | 'popup'
  | 'booking'
  | 'pricing'
  | 'testimonials'
  | 'team'
  | 'logos'
  | 'comparison'
  | 'features'
  | 'timeline'
  | 'footer'
  | 'header'
  | 'products'
  | 'cart'
  | 'kb-featured'
  | 'kb-hub'
  | 'kb-search'
  | 'announcement-bar'
  | 'tabs'
  | 'marquee'
  | 'embed'
  | 'table'
  | 'countdown'
  | 'progress'
  | 'badge'
  | 'social-proof';

// Form field types
export type FormFieldType = 'text' | 'email' | 'phone' | 'textarea' | 'checkbox';

export interface FormField {
  id: string;
  type: FormFieldType;
  label: string;
  placeholder?: string;
  required: boolean;
  width: 'full' | 'half';
}

export interface FormBlockData {
  title?: string;
  description?: string;
  fields: FormField[];
  submitButtonText: string;
  successMessage: string;
  // Styling
  variant: 'default' | 'card' | 'minimal';
}

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
  // Background styling
  backgroundStyle?: 'solid' | 'transparent' | 'blur';
  headerShadow?: 'none' | 'sm' | 'md' | 'lg';
  // Colors
  linkColorScheme?: 'default' | 'primary' | 'muted' | 'contrast';
  // Layout
  navAlignment?: 'left' | 'center' | 'right';
  headerHeight?: 'compact' | 'default' | 'tall';
  showBorder?: boolean;
  // Mobile menu
  mobileMenuStyle?: 'default' | 'fullscreen' | 'slide';
  mobileMenuAnimation?: 'fade' | 'slide-down' | 'slide-up';
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

// Block spacing configuration
export type SpacingSize = 'none' | 'xs' | 'sm' | 'md' | 'lg' | 'xl';

export interface BlockSpacing {
  paddingTop?: SpacingSize;
  paddingBottom?: SpacingSize;
  marginTop?: SpacingSize;
  marginBottom?: SpacingSize;
}

// Block animation configuration
export type AnimationType = 'none' | 'fade-up' | 'fade-in' | 'slide-up' | 'scale-in' | 'slide-left' | 'slide-right';
export type AnimationSpeed = 'fast' | 'normal' | 'slow';

export interface BlockAnimation {
  type: AnimationType;
  speed?: AnimationSpeed;
  delay?: number; // in ms
}

export interface ContentBlock {
  id: string;
  type: ContentBlockType;
  data: Record<string, unknown>;
  spacing?: BlockSpacing;
  animation?: BlockAnimation;
}

export type HeroLayout = 'centered' | 'split-left' | 'split-right';

export interface HeroBlockData {
  title: string;
  subtitle?: string;
  // Layout mode
  layout?: HeroLayout;
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
  // Layout options (for centered layout)
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

// =============================================================================
// TIPTAP DOCUMENT TYPES
// =============================================================================
// TiptapDocument is the STANDARD format for all rich text content in PezCMS.
// 
// CONTENT FORMAT STRATEGY:
// - Primary: TiptapDocument (JSON) - stored in database, used in editors
// - Export: HTML, Markdown, Plain text - generated on demand via tiptap-utils
// - Legacy: HTML strings - DEPRECATED, will be removed in future versions
//
// For conversion utilities, see: src/lib/tiptap-utils.ts
// =============================================================================

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

/**
 * Standard Tiptap/ProseMirror document structure.
 * This is the PRIMARY format for all rich text content in PezCMS.
 */
export interface TiptapDocument {
  type: 'doc';
  content: TiptapNode[];
}

/**
 * Rich text content type used across block data.
 * TiptapDocument is the standard format.
 * @deprecated string (HTML) support is legacy and will be removed.
 */
export type RichTextContent = TiptapDocument | string;

// =============================================================================
// BLOCK DATA TYPES
// =============================================================================

export interface TextBlockData {
  /** 
   * Rich text content. TiptapDocument is the standard format.
   * @deprecated string (HTML) support is legacy - use TiptapDocument.
   */
  content: RichTextContent;
  backgroundColor?: string;
}

export interface ImageBlockData {
  src: string;
  alt: string;
  caption?: string;
}

export type CTAVariant = 'default' | 'with-image' | 'split' | 'minimal';

export interface CTABlockData {
  title: string;
  subtitle?: string;
  buttonText: string;
  buttonUrl: string;
  // Secondary button
  secondaryButtonText?: string;
  secondaryButtonUrl?: string;
  // Design variant
  variant?: CTAVariant;
  // Background options
  backgroundImage?: string;
  overlayOpacity?: number;
  // Legacy gradient option (used by default variant)
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
  /** 
   * Rich text content. TiptapDocument is the standard format.
   * @deprecated string (HTML) support is legacy - use TiptapDocument.
   */
  content: RichTextContent;
  imageSrc: string;
  imageAlt: string;
  imagePosition: 'left' | 'right';
  /** Which column should be sticky when scrolling */
  stickyColumn?: 'none' | 'image' | 'text';
}

export interface InfoBoxBlockData {
  title: string;
  /** 
   * Rich text content. TiptapDocument is the standard format.
   * @deprecated string (HTML) support is legacy - use TiptapDocument.
   */
  content: RichTextContent;
  variant: 'info' | 'success' | 'warning' | 'highlight';
  icon?: string;
}

export interface AccordionBlockData {
  title?: string;
  items: { 
    question: string; 
    /** 
     * Rich text content. TiptapDocument is the standard format.
     * @deprecated string (HTML) support is legacy - use TiptapDocument.
     */
    answer: RichTextContent; 
    image?: string; 
    imageAlt?: string;
  }[];
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
  animated?: boolean;
  animationDuration?: number; // in ms, default 2000
}

export interface ChatBlockData {
  title?: string;
  height: 'sm' | 'md' | 'lg' | 'full';
  showSidebar: boolean;
  initialPrompt?: string;
  variant: 'embedded' | 'card';
}

export interface MapBlockData {
  // Location
  address: string;
  locationName?: string;
  // Display options
  title?: string;
  description?: string;
  // Map settings
  zoom: number;
  mapType: 'roadmap' | 'satellite';
  height: 'sm' | 'md' | 'lg' | 'xl';
  // Styling
  showBorder: boolean;
  rounded: boolean;
  // Privacy
  loadOnConsent?: boolean;
}

// Popup block data
export type PopupTrigger = 'scroll' | 'time' | 'exit-intent';

export interface PopupBlockData {
  // Content
  title: string;
  content: string;
  image?: string;
  buttonText?: string;
  buttonUrl?: string;
  secondaryButtonText?: string;
  // Trigger settings
  trigger: PopupTrigger;
  scrollPercentage?: number; // 0-100, for scroll trigger
  delaySeconds?: number; // for time trigger
  // Display settings
  showOnce?: boolean; // Only show once per session
  cookieDays?: number; // Days to remember dismissal
  // Styling
  size: 'sm' | 'md' | 'lg';
  position: 'center' | 'bottom-right' | 'bottom-left';
  overlayDark?: boolean;
}

// Booking block data
export type BookingProvider = 'calendly' | 'cal' | 'hubspot' | 'custom';

// Service type for booking form
export interface BookingService {
  id: string;
  name: string;
  duration?: string; // e.g., "30 min"
  description?: string;
}

export interface BookingBlockData {
  // Content
  title?: string;
  description?: string;
  // Mode
  mode: 'embed' | 'form';
  // Embed settings
  provider?: BookingProvider;
  embedUrl?: string;
  height?: 'sm' | 'md' | 'lg' | 'xl';
  // Form mode settings
  submitButtonText?: string;
  successMessage?: string;
  showPhoneField?: boolean;
  showDatePicker?: boolean;
  // Service selection
  services?: BookingService[];
  showServiceSelector?: boolean;
  // Webhook integration
  triggerWebhook?: boolean;
  // Styling
  variant?: 'default' | 'card' | 'minimal';
}

// Pricing block data
export interface PricingTier {
  id: string;
  name: string;
  price: string;
  period?: string; // e.g., "/month", "/year"
  description?: string;
  features: string[];
  buttonText?: string;
  buttonUrl?: string;
  highlighted?: boolean;
  badge?: string; // e.g., "Popular", "Best Value"
  productId?: string; // Link to a product in the database for cart integration
}

export interface PricingBlockData {
  title?: string;
  subtitle?: string;
  tiers: PricingTier[];
  columns?: 2 | 3 | 4;
  variant?: 'default' | 'cards' | 'compact';
  showToggle?: boolean;
  monthlyLabel?: string;
  yearlyLabel?: string;
  useProducts?: boolean; // If true, fetch products from database instead of using tiers
  productType?: 'all' | 'one_time' | 'recurring'; // Filter products by type
}

// Testimonials block data
export interface Testimonial {
  id: string;
  content: string;
  author: string;
  role?: string;
  company?: string;
  avatar?: string;
  rating?: number; // 1-5 stars
}

export interface TestimonialsBlockData {
  title?: string;
  subtitle?: string;
  testimonials: Testimonial[];
  layout: 'grid' | 'carousel' | 'single';
  columns?: 2 | 3;
  showRating?: boolean;
  showAvatar?: boolean;
  variant?: 'default' | 'cards' | 'minimal';
  autoplay?: boolean;
  autoplaySpeed?: number; // in seconds
}

// Team members block data
export interface TeamMemberSocial {
  linkedin?: string;
  twitter?: string;
  email?: string;
  website?: string;
}

export interface TeamMember {
  id: string;
  name: string;
  role: string;
  bio?: string;
  photo?: string;
  social?: TeamMemberSocial;
}

export interface TeamBlockData {
  title?: string;
  subtitle?: string;
  members: TeamMember[];
  columns?: 2 | 3 | 4;
  layout?: 'grid' | 'carousel';
  variant?: 'default' | 'cards' | 'compact';
  showBio?: boolean;
  showSocial?: boolean;
}

// Logo cloud block data
export interface LogoItem {
  id: string;
  name: string;
  logo: string;
  url?: string;
}

export interface LogosBlockData {
  title?: string;
  subtitle?: string;
  logos: LogoItem[];
  columns?: 3 | 4 | 5 | 6;
  layout?: 'grid' | 'carousel' | 'scroll';
  variant?: 'default' | 'grayscale' | 'bordered';
  logoSize?: 'sm' | 'md' | 'lg';
  autoplay?: boolean;
  autoplaySpeed?: number;
}

// Comparison table block data
export type ComparisonCellValue = boolean | string;

export interface ComparisonFeature {
  id: string;
  name: string;
  values: ComparisonCellValue[]; // One value per product/plan
}

export interface ComparisonProduct {
  id: string;
  name: string;
  price?: string;
  period?: string;
  description?: string;
  highlighted?: boolean;
  buttonText?: string;
  buttonUrl?: string;
}

export interface ComparisonBlockData {
  title?: string;
  subtitle?: string;
  products: ComparisonProduct[];
  features: ComparisonFeature[];
  variant?: 'default' | 'striped' | 'bordered';
  showPrices?: boolean;
  showButtons?: boolean;
  stickyHeader?: boolean;
}

// Features/Services block data
export interface FeatureItem {
  id: string;
  icon: string;
  title: string;
  description: string;
  url?: string;
}

export interface FeaturesBlockData {
  title?: string;
  subtitle?: string;
  features: FeatureItem[];
  columns?: 2 | 3 | 4;
  layout?: 'grid' | 'list';
  variant?: 'default' | 'cards' | 'minimal' | 'centered';
  iconStyle?: 'circle' | 'square' | 'none';
  showLinks?: boolean;
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

// ==================== BLOG TYPES ====================

export interface AuthorProfile {
  id: string;
  email: string;
  full_name: string | null;
  avatar_url: string | null;
  bio: string | null;
  title: string | null;
  show_as_author: boolean;
  created_at: string;
  updated_at: string;
}

export interface BlogCategory {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  parent_id: string | null;
  sort_order: number;
  created_at: string;
}

export interface BlogTag {
  id: string;
  name: string;
  slug: string;
  created_at: string;
}

export interface BlogPostMeta extends PageMeta {
  canonical_url?: string;
}

export interface BlogPost {
  id: string;
  slug: string;
  title: string;
  excerpt: string | null;
  content_json: ContentBlock[];
  featured_image: string | null;
  featured_image_alt: string | null;
  
  // Author
  author_id: string | null;
  author?: AuthorProfile;
  
  // Optional Reviewer (generic)
  reviewer_id: string | null;
  reviewer?: AuthorProfile;
  reviewed_at: string | null;
  
  // Publishing
  status: PageStatus;
  published_at: string | null;
  scheduled_at: string | null;
  
  // Meta
  meta_json: BlogPostMeta;
  
  // Blog-specific
  is_featured: boolean;
  reading_time_minutes: number | null;
  
  // Relations
  categories?: BlogCategory[];
  tags?: BlogTag[];
  
  // Tracking
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface BlogSettings {
  enabled: boolean;
  postsPerPage: number;
  showAuthorBio: boolean;
  showReadingTime: boolean;
  showReviewer: boolean;
  archiveTitle: string;
  archiveSlug: string;
  rssEnabled: boolean;
  rssTitle: string;
  rssDescription: string;
}
