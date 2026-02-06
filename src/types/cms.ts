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
  | 'smart-booking'
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
  | 'kb-accordion'
  | 'announcement-bar'
  | 'tabs'
  | 'marquee'
  | 'embed'
  | 'lottie'
  | 'table'
  | 'countdown'
  | 'progress'
  | 'badge'
  | 'social-proof'
  | 'notification-toast'
  | 'floating-cta';

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
  // Variant determines overall layout/style preset
  variant?: HeaderVariant;
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
  // Mega menu specific
  megaMenuEnabled?: boolean;
  megaMenuColumns?: 2 | 3 | 4;
  // Custom nav items (external links beyond CMS pages)
  customNavItems?: HeaderNavItem[];
}

export interface HeaderNavItem {
  id: string;
  label: string;
  url: string;
  openInNewTab?: boolean;
  enabled: boolean;
  // Mega menu sub-items
  children?: HeaderNavSubItem[];
  // Column settings for mega menu
  columnLabel?: string;
  description?: string;
  icon?: string;
}

export interface HeaderNavSubItem {
  id: string;
  label: string;
  url: string;
  description?: string;
  icon?: string;
  openInNewTab?: boolean;
}

// Header variant types
export type HeaderVariant = 'clean' | 'sticky' | 'mega-menu';

// Footer variant types
export type FooterVariant = 'minimal' | 'full' | 'enterprise';

// Footer block data (stored in global_blocks.data)
export interface FooterBlockData {
  // Variant determines overall layout/style
  variant?: FooterVariant;
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
  // Enterprise-specific
  showComplianceBadges?: boolean;
  complianceBadges?: string[];
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
// Design System 2026: Extended animation types
export type AnimationType = 
  | 'none' 
  | 'fade-up' 
  | 'fade-in' 
  | 'slide-up' 
  | 'scale-in' 
  | 'slide-left' 
  | 'slide-right'
  | 'zoom-in'    // 2026: Premium zoom effect
  | 'blur-in'    // 2026: Premium blur fade
  | 'rotate-in'; // 2026: Subtle rotation entry

export type AnimationSpeed = 'fast' | 'normal' | 'slow';
export type AnimationEasing = 'default' | 'premium' | 'bounce-soft' | 'elastic';

export interface BlockAnimation {
  type: AnimationType;
  speed?: AnimationSpeed;
  delay?: number; // in ms
  easing?: AnimationEasing; // 2026: Premium easing curves
  staggerIndex?: number; // 2026: For staggered children animations
}

export interface ContentBlock {
  id: string;
  type: ContentBlockType;
  data: Record<string, unknown>;
  spacing?: BlockSpacing;
  animation?: BlockAnimation;
  /** Optional anchor ID for in-page navigation (e.g., "contact-us" for #contact-us links) */
  anchorId?: string;
}

export type HeroLayout = 'centered' | 'split-left' | 'split-right';
export type HeroVideoType = 'direct' | 'youtube' | 'vimeo';
export type HeroOverlayColor = 'dark' | 'light' | 'primary';
export type HeroTextAlignment = 'left' | 'center' | 'right';
// Design System 2026: Text theme for contrast control
export type HeroTextTheme = 'auto' | 'light' | 'dark';

// Design System 2026: Hero title size options
export type HeroTitleSize = 'default' | 'large' | 'display' | 'massive';

export interface HeroBlockData {
  title: string;
  subtitle?: string;
  // Layout mode
  layout?: HeroLayout;
  // Background options
  backgroundType?: 'image' | 'video' | 'color';
  backgroundImage?: string;
  // Video background support
  videoType?: HeroVideoType;
  videoUrl?: string;
  videoUrlWebm?: string;
  videoPosterUrl?: string;
  videoAutoplay?: boolean;
  videoLoop?: boolean;
  videoMuted?: boolean;
  showVideoControls?: boolean;
  // Layout options (for centered layout)
  heightMode?: 'auto' | 'viewport' | '80vh' | '60vh';
  contentAlignment?: 'top' | 'center' | 'bottom';
  textAlignment?: HeroTextAlignment;
  overlayOpacity?: number;
  overlayColor?: HeroOverlayColor;
  // Design System 2026: Manual text theme override for contrast
  textTheme?: HeroTextTheme;
  parallaxEffect?: boolean;
  titleAnimation?: 'none' | 'fade-in' | 'slide-up' | 'typewriter';
  showScrollIndicator?: boolean;
  // Buttons
  primaryButton?: { text: string; url: string };
  secondaryButton?: { text: string; url: string };
  // Design System 2026: Premium Typography
  titleSize?: HeroTitleSize;
  gradientTitle?: boolean;
  // Design System 2026: Premium Animations
  subtitleAnimation?: 'none' | 'fade-in' | 'slide-up';
  buttonAnimation?: 'none' | 'fade-in' | 'scale-in';
}

// =============================================================================
// TIPTAP DOCUMENT TYPES
// =============================================================================
// TiptapDocument is the STANDARD format for all rich text content in FlowWink.
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
 * This is the PRIMARY format for all rich text content in FlowWink.
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

// Design System 2026: Text block title sizes
export type TextTitleSize = 'default' | 'large' | 'display';

export interface TextBlockData {
  /** 
   * Rich text content. TiptapDocument is the standard format.
   * @deprecated string (HTML) support is legacy - use TiptapDocument.
   */
  content: RichTextContent;
  backgroundColor?: string;
  // Design System 2026: Premium typography features
  eyebrow?: string;           // Small label above title (e.g., "SERVICES")
  eyebrowColor?: string;      // Color for eyebrow text
  title?: string;             // Display title above content
  titleSize?: TextTitleSize;  // Title size variant
  accentText?: string;        // Part of title in accent/script font
  accentPosition?: 'start' | 'end' | 'inline'; // Where accent appears
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
  // Design System 2026: Premium features
  eyebrow?: string;
  eyebrowColor?: string;
  title?: string;
  titleSize?: TextTitleSize;
  accentText?: string;
  accentPosition?: 'start' | 'end' | 'inline';
  // CTA Link
  ctaText?: string;
  ctaUrl?: string;
  // Second image for stacked effect
  secondImageSrc?: string;
  secondImageAlt?: string;
  // Background
  backgroundColor?: string;
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

export type StatsAnimationStyle = 'count-up' | 'fade-in' | 'slide-up' | 'typewriter';

export interface StatsBlockData {
  title?: string;
  stats: { value: string; label: string; icon?: string }[];
  animated?: boolean;
  animationDuration?: number; // in ms, default 2000
  animationStyle?: StatsAnimationStyle; // default 'count-up'
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
  // Mode: embed = external calendar, form = simple form, smart = real-time availability
  mode: 'embed' | 'form' | 'smart';
  // Embed settings
  provider?: BookingProvider;
  embedUrl?: string;
  height?: 'sm' | 'md' | 'lg' | 'xl';
  // Form mode settings
  submitButtonText?: string;
  successMessage?: string;
  showPhoneField?: boolean;
  showDatePicker?: boolean;
  // Service selection (for form mode only - smart mode uses database)
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
  staggeredReveal?: boolean;
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

// Design System 2026: Premium hover effects
export type FeatureHoverEffect = 'none' | 'lift' | 'glow' | 'border';
export type FeatureCardStyle = 'default' | 'glass' | 'gradient-border';

export interface FeaturesBlockData {
  title?: string;
  subtitle?: string;
  features: FeatureItem[];
  columns?: 2 | 3 | 4;
  layout?: 'grid' | 'list';
  variant?: 'default' | 'cards' | 'minimal' | 'centered';
  iconStyle?: 'circle' | 'square' | 'none';
  showLinks?: boolean;
  // Design System 2026: Premium Effects
  staggeredReveal?: boolean;
  hoverEffect?: FeatureHoverEffect;
  cardStyle?: FeatureCardStyle;
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

// ==================== NEW BLOCK DATA TYPES ====================
// Re-export types from component files for consistency

export interface AnnouncementBarBlockData {
  message: string;
  linkText?: string;
  linkUrl?: string;
  variant?: 'solid' | 'gradient' | 'minimal';
  dismissable?: boolean;
  showCountdown?: boolean;
  countdownTarget?: string; // ISO date string
  backgroundColor?: string;
  textColor?: string;
  sticky?: boolean;
}

export interface TabItem {
  id: string;
  title: string;
  icon?: string;
  content: RichTextContent;
}

export interface TabsBlockData {
  title?: string;
  subtitle?: string;
  tabs: TabItem[];
  orientation?: 'horizontal' | 'vertical';
  variant?: 'underline' | 'pills' | 'boxed';
  defaultTab?: string;
}

export interface MarqueeItem {
  id: string;
  text: string;
  icon?: string;
}

export interface MarqueeBlockData {
  items: MarqueeItem[];
  speed?: 'slow' | 'normal' | 'fast';
  direction?: 'left' | 'right';
  pauseOnHover?: boolean;
  separator?: string;
  variant?: 'default' | 'gradient' | 'outlined';
}

export type EmbedProvider = 'vimeo' | 'spotify' | 'soundcloud' | 'codepen' | 'figma' | 'loom' | 'custom';

export interface EmbedBlockData {
  url: string;
  provider?: EmbedProvider;
  customEmbed?: string;
  aspectRatio?: '16:9' | '4:3' | '1:1' | '9:16' | 'auto';
  maxWidth?: 'sm' | 'md' | 'lg' | 'full';
  caption?: string;
  variant?: 'default' | 'card' | 'minimal';
}

export interface TableColumn {
  id: string;
  header: string;
  align?: 'left' | 'center' | 'right';
}

export interface TableBlockData {
  title?: string;
  caption?: string;
  columns: TableColumn[];
  rows: Record<string, string>[];
  variant?: 'default' | 'striped' | 'bordered' | 'minimal';
  size?: 'sm' | 'md' | 'lg';
  stickyHeader?: boolean;
  highlightOnHover?: boolean;
}

export interface CountdownBlockData {
  title?: string;
  subtitle?: string;
  targetDate: string; // ISO date string
  expiredMessage?: string;
  showDays?: boolean;
  showHours?: boolean;
  showMinutes?: boolean;
  showSeconds?: boolean;
  variant?: 'default' | 'cards' | 'minimal' | 'hero';
  size?: 'sm' | 'md' | 'lg';
  labels?: {
    days?: string;
    hours?: string;
    minutes?: string;
    seconds?: string;
  };
}

export interface ProgressItem {
  id: string;
  label: string;
  value: number; // 0-100
  color?: string;
  icon?: string;
}

export interface ProgressBlockData {
  title?: string;
  subtitle?: string;
  items: ProgressItem[];
  variant?: 'default' | 'circular' | 'minimal' | 'cards';
  size?: 'sm' | 'md' | 'lg';
  showPercentage?: boolean;
  showLabels?: boolean;
  animated?: boolean;
  animationDuration?: number;
}

export interface BadgeItem {
  id: string;
  title: string;
  subtitle?: string;
  icon?: 'award' | 'shield' | 'check' | 'star' | 'medal' | 'trophy';
  image?: string;
  url?: string;
}

export interface BadgeBlockData {
  title?: string;
  subtitle?: string;
  badges: BadgeItem[];
  variant?: 'default' | 'cards' | 'minimal' | 'bordered';
  columns?: 3 | 4 | 5 | 6;
  size?: 'sm' | 'md' | 'lg';
  showTitles?: boolean;
  grayscale?: boolean;
}

export interface SocialProofItem {
  id: string;
  type: 'counter' | 'rating' | 'activity' | 'custom';
  icon?: 'users' | 'star' | 'activity' | 'trending' | 'heart' | 'eye' | 'message' | 'cart';
  label: string;
  value: string;
  suffix?: string;
  prefix?: string;
  rating?: number;
  maxRating?: number;
  timestamp?: string;
  description?: string;
}

export interface SocialProofBlockData {
  title?: string;
  subtitle?: string;
  items: SocialProofItem[];
  variant?: 'default' | 'cards' | 'minimal' | 'banner' | 'floating';
  layout?: 'horizontal' | 'vertical' | 'grid';
  columns?: 2 | 3 | 4;
  size?: 'sm' | 'md' | 'lg';
  animated?: boolean;
  animationDuration?: number;
  showIcons?: boolean;
  showLiveIndicator?: boolean;
  liveText?: string;
}

export interface NotificationItem {
  type?: string;
  icon?: string;
  title: string;
  message: string;
  image?: string;
  timestamp?: string;
  location?: string;
}

export interface NotificationToastBlockData {
  notifications: NotificationItem[];
  variant?: 'default' | 'minimal' | 'rounded';
  position?: 'bottom-left' | 'bottom-right' | 'top-left' | 'top-right';
  displayDuration?: number;
  delayBetween?: number;
  initialDelay?: number;
  maxWidth?: 'sm' | 'md' | 'lg';
  animationType?: 'slide' | 'fade' | 'bounce';
}

export interface FloatingCTABlockData {
  text?: string;
  buttonText: string;
  buttonUrl: string;
  secondaryText?: string;
  scrollThreshold?: number;
  variant?: 'bar' | 'card' | 'minimal' | 'pill';
  position?: 'bottom' | 'top';
  size?: 'sm' | 'md' | 'lg';
  hideOnScrollUp?: boolean;
  closeable?: boolean;
  closePersistent?: boolean;
  showScrollToTop?: boolean;
}
