/**
 * Block Reference
 * 
 * Documentation for all available block types in PezCMS.
 * Use this as a reference when creating templates.
 */

export interface BlockFieldInfo {
  name: string;
  type: 'string' | 'number' | 'boolean' | 'object' | 'array' | 'tiptap';
  required: boolean;
  description: string;
  default?: unknown;
  options?: string[];
}

export interface BlockInfo {
  type: string;
  name: string;
  description: string;
  category: 'content' | 'media' | 'layout' | 'interactive' | 'commerce';
  fields: BlockFieldInfo[];
}

export const BLOCK_REFERENCE: BlockInfo[] = [
  // ============================================
  // Content Blocks
  // ============================================
  {
    type: 'hero',
    name: 'Hero',
    description: 'Large banner section, typically at the top of a page with title, subtitle, and call-to-action buttons.',
    category: 'content',
    fields: [
      { name: 'title', type: 'string', required: true, description: 'Main headline' },
      { name: 'subtitle', type: 'string', required: false, description: 'Supporting text below the title' },
      { name: 'backgroundType', type: 'string', required: false, description: 'Background style', default: 'color', options: ['color', 'image', 'video'] },
      { name: 'imageSrc', type: 'string', required: false, description: 'Background image URL (when backgroundType is "image")' },
      { name: 'videoUrl', type: 'string', required: false, description: 'Background video URL (when backgroundType is "video")' },
      { name: 'heightMode', type: 'string', required: false, description: 'Section height', default: 'auto', options: ['viewport', '60vh', 'auto'] },
      { name: 'contentAlignment', type: 'string', required: false, description: 'Content alignment', default: 'center', options: ['left', 'center'] },
      { name: 'overlayOpacity', type: 'number', required: false, description: 'Dark overlay opacity (0-100)', default: 70 },
      { name: 'titleAnimation', type: 'string', required: false, description: 'Title entrance animation', options: ['none', 'fade-in', 'slide-up'] },
      { name: 'showScrollIndicator', type: 'boolean', required: false, description: 'Show scroll down arrow' },
      { name: 'primaryButton', type: 'object', required: false, description: 'Primary CTA button { text, url }' },
      { name: 'secondaryButton', type: 'object', required: false, description: 'Secondary button { text, url }' },
    ],
  },
  {
    type: 'text',
    name: 'Text',
    description: 'Rich text content block for paragraphs, headings, lists, and formatted text.',
    category: 'content',
    fields: [
      { name: 'content', type: 'tiptap', required: true, description: 'Rich text content in Tiptap format' },
      { name: 'alignment', type: 'string', required: false, description: 'Text alignment', default: 'left', options: ['left', 'center', 'right'] },
      { name: 'maxWidth', type: 'string', required: false, description: 'Content width', default: 'prose', options: ['prose', 'full'] },
    ],
  },
  {
    type: 'quote',
    name: 'Quote',
    description: 'Highlighted quotation with optional attribution.',
    category: 'content',
    fields: [
      { name: 'quote', type: 'string', required: true, description: 'The quote text' },
      { name: 'author', type: 'string', required: false, description: 'Quote author name' },
      { name: 'role', type: 'string', required: false, description: 'Author role or title' },
      { name: 'variant', type: 'string', required: false, description: 'Visual style', default: 'simple', options: ['simple', 'large', 'card'] },
    ],
  },
  {
    type: 'cta',
    name: 'Call to Action',
    description: 'Prominent section encouraging users to take action.',
    category: 'content',
    fields: [
      { name: 'title', type: 'string', required: true, description: 'CTA headline' },
      { name: 'subtitle', type: 'string', required: false, description: 'Supporting text' },
      { name: 'buttonText', type: 'string', required: true, description: 'Button label' },
      { name: 'buttonUrl', type: 'string', required: true, description: 'Button link URL' },
      { name: 'gradient', type: 'boolean', required: false, description: 'Use gradient background', default: true },
    ],
  },
  {
    type: 'features',
    name: 'Features',
    description: 'Grid of feature cards with icons, titles, and descriptions.',
    category: 'content',
    fields: [
      { name: 'title', type: 'string', required: false, description: 'Section title' },
      { name: 'subtitle', type: 'string', required: false, description: 'Section subtitle' },
      { name: 'features', type: 'array', required: true, description: 'Array of features [{ id, icon, title, description }]' },
      { name: 'columns', type: 'number', required: false, description: 'Number of columns', default: 3, options: ['2', '3', '4'] },
      { name: 'layout', type: 'string', required: false, description: 'Layout style', default: 'grid', options: ['grid', 'list'] },
      { name: 'variant', type: 'string', required: false, description: 'Visual style', default: 'cards', options: ['cards', 'minimal', 'centered'] },
      { name: 'iconStyle', type: 'string', required: false, description: 'Icon container style', default: 'circle', options: ['circle', 'square', 'none'] },
    ],
  },
  {
    type: 'stats',
    name: 'Statistics',
    description: 'Display key metrics and numbers.',
    category: 'content',
    fields: [
      { name: 'title', type: 'string', required: false, description: 'Section title' },
      { name: 'stats', type: 'array', required: true, description: 'Array of stats [{ value, label, icon }]' },
    ],
  },
  {
    type: 'testimonials',
    name: 'Testimonials',
    description: 'Customer quotes and reviews.',
    category: 'content',
    fields: [
      { name: 'title', type: 'string', required: false, description: 'Section title' },
      { name: 'testimonials', type: 'array', required: true, description: 'Array of testimonials [{ id, content, author, role, company, rating, avatar }]' },
      { name: 'layout', type: 'string', required: false, description: 'Display layout', default: 'carousel', options: ['carousel', 'grid'] },
      { name: 'columns', type: 'number', required: false, description: 'Grid columns (when layout is grid)', default: 3 },
      { name: 'showRating', type: 'boolean', required: false, description: 'Show star ratings' },
      { name: 'showAvatar', type: 'boolean', required: false, description: 'Show author avatars' },
      { name: 'variant', type: 'string', required: false, description: 'Visual style', default: 'cards', options: ['cards', 'minimal', 'bubbles'] },
      { name: 'autoplay', type: 'boolean', required: false, description: 'Auto-rotate carousel' },
      { name: 'autoplaySpeed', type: 'number', required: false, description: 'Seconds between slides', default: 5 },
    ],
  },
  {
    type: 'team',
    name: 'Team',
    description: 'Team member grid with photos and bios.',
    category: 'content',
    fields: [
      { name: 'title', type: 'string', required: false, description: 'Section title' },
      { name: 'members', type: 'array', required: true, description: 'Array of members [{ id, name, role, bio, image, linkedin, twitter }]' },
      { name: 'columns', type: 'number', required: false, description: 'Number of columns', default: 4 },
      { name: 'variant', type: 'string', required: false, description: 'Visual style', default: 'cards', options: ['cards', 'minimal'] },
      { name: 'showRole', type: 'boolean', required: false, description: 'Show member roles' },
      { name: 'showBio', type: 'boolean', required: false, description: 'Show member bios' },
    ],
  },
  {
    type: 'logos',
    name: 'Logos',
    description: 'Partner or client logo showcase.',
    category: 'content',
    fields: [
      { name: 'title', type: 'string', required: false, description: 'Section title' },
      { name: 'logos', type: 'array', required: true, description: 'Array of logos [{ id, name, logo }]' },
      { name: 'columns', type: 'number', required: false, description: 'Number of columns', default: 5 },
      { name: 'layout', type: 'string', required: false, description: 'Display layout', default: 'grid', options: ['grid', 'carousel'] },
      { name: 'variant', type: 'string', required: false, description: 'Color treatment', default: 'grayscale', options: ['grayscale', 'color'] },
      { name: 'logoSize', type: 'string', required: false, description: 'Logo size', default: 'md', options: ['sm', 'md', 'lg'] },
    ],
  },
  {
    type: 'timeline',
    name: 'Timeline',
    description: 'Step-by-step or chronological content.',
    category: 'content',
    fields: [
      { name: 'title', type: 'string', required: false, description: 'Section title' },
      { name: 'subtitle', type: 'string', required: false, description: 'Section subtitle' },
      { name: 'steps', type: 'array', required: true, description: 'Array of steps [{ id, icon, title, description, date }]' },
      { name: 'variant', type: 'string', required: false, description: 'Layout style', default: 'horizontal', options: ['horizontal', 'vertical', 'alternating'] },
      { name: 'showDates', type: 'boolean', required: false, description: 'Show date/step labels' },
    ],
  },
  {
    type: 'accordion',
    name: 'Accordion',
    description: 'Expandable FAQ or content sections.',
    category: 'content',
    fields: [
      { name: 'title', type: 'string', required: false, description: 'Section title' },
      { name: 'items', type: 'array', required: true, description: 'Array of items [{ question, answer }]' },
    ],
  },

  // ============================================
  // Media Blocks
  // ============================================
  {
    type: 'image',
    name: 'Image',
    description: 'Single image with optional caption.',
    category: 'media',
    fields: [
      { name: 'src', type: 'string', required: true, description: 'Image URL' },
      { name: 'alt', type: 'string', required: true, description: 'Alt text for accessibility' },
      { name: 'caption', type: 'string', required: false, description: 'Optional caption' },
      { name: 'aspectRatio', type: 'string', required: false, description: 'Image aspect ratio', default: 'auto', options: ['16:9', '4:3', '1:1', 'auto'] },
      { name: 'size', type: 'string', required: false, description: 'Image width', default: 'large', options: ['small', 'medium', 'large', 'full'] },
    ],
  },
  {
    type: 'gallery',
    name: 'Gallery',
    description: 'Grid of images.',
    category: 'media',
    fields: [
      { name: 'title', type: 'string', required: false, description: 'Section title' },
      { name: 'images', type: 'array', required: true, description: 'Array of images [{ id, src, alt, caption }]' },
      { name: 'columns', type: 'number', required: false, description: 'Number of columns', default: 3 },
      { name: 'gap', type: 'string', required: false, description: 'Spacing between images', default: 'md', options: ['sm', 'md', 'lg'] },
    ],
  },
  {
    type: 'youtube',
    name: 'YouTube',
    description: 'Embedded YouTube video.',
    category: 'media',
    fields: [
      { name: 'videoId', type: 'string', required: true, description: 'YouTube video ID (e.g., "dQw4w9WgXcQ")' },
      { name: 'title', type: 'string', required: false, description: 'Video title for accessibility' },
      { name: 'aspectRatio', type: 'string', required: false, description: 'Video aspect ratio', default: '16:9', options: ['16:9', '4:3'] },
    ],
  },

  // ============================================
  // Layout Blocks
  // ============================================
  {
    type: 'two-column',
    name: 'Two Column',
    description: 'Side-by-side content and image layout.',
    category: 'layout',
    fields: [
      { name: 'content', type: 'tiptap', required: true, description: 'Rich text content' },
      { name: 'imageSrc', type: 'string', required: false, description: 'Image URL' },
      { name: 'imageAlt', type: 'string', required: false, description: 'Image alt text' },
      { name: 'imagePosition', type: 'string', required: false, description: 'Image placement', default: 'right', options: ['left', 'right'] },
    ],
  },
  {
    type: 'separator',
    name: 'Separator',
    description: 'Visual divider between sections.',
    category: 'layout',
    fields: [
      { name: 'style', type: 'string', required: false, description: 'Divider style', default: 'line', options: ['line', 'dots', 'gradient', 'none'] },
      { name: 'spacing', type: 'string', required: false, description: 'Vertical spacing', default: 'md', options: ['sm', 'md', 'lg'] },
    ],
  },
  {
    type: 'info-box',
    name: 'Info Box',
    description: 'Highlighted information box (tip, warning, etc.).',
    category: 'layout',
    fields: [
      { name: 'title', type: 'string', required: true, description: 'Box title' },
      { name: 'content', type: 'tiptap', required: false, description: 'Box content' },
      { name: 'variant', type: 'string', required: false, description: 'Box style', default: 'info', options: ['info', 'warning', 'success', 'error'] },
    ],
  },
  {
    type: 'link-grid',
    name: 'Link Grid',
    description: 'Grid of linked cards.',
    category: 'layout',
    fields: [
      { name: 'title', type: 'string', required: false, description: 'Section title' },
      { name: 'links', type: 'array', required: true, description: 'Array of links [{ id, title, description, url, icon }]' },
      { name: 'columns', type: 'number', required: false, description: 'Number of columns', default: 3 },
    ],
  },

  // ============================================
  // Interactive Blocks
  // ============================================
  {
    type: 'form',
    name: 'Form',
    description: 'Contact or data collection form.',
    category: 'interactive',
    fields: [
      { name: 'title', type: 'string', required: false, description: 'Form title' },
      { name: 'fields', type: 'array', required: true, description: 'Array of fields [{ id, type, label, required, placeholder }]' },
      { name: 'submitButtonText', type: 'string', required: false, description: 'Submit button label', default: 'Submit' },
      { name: 'successMessage', type: 'string', required: false, description: 'Message shown after submission' },
    ],
  },
  {
    type: 'chat',
    name: 'Chat',
    description: 'Embedded AI chat interface.',
    category: 'interactive',
    fields: [
      { name: 'title', type: 'string', required: false, description: 'Chat title' },
      { name: 'height', type: 'string', required: false, description: 'Chat height', default: 'md', options: ['sm', 'md', 'lg'] },
      { name: 'variant', type: 'string', required: false, description: 'Display style', default: 'embedded', options: ['embedded', 'card', 'floating'] },
      { name: 'showSidebar', type: 'boolean', required: false, description: 'Show conversation sidebar' },
      { name: 'initialPrompt', type: 'string', required: false, description: 'Initial bot message' },
    ],
  },
  {
    type: 'newsletter',
    name: 'Newsletter',
    description: 'Email signup form.',
    category: 'interactive',
    fields: [
      { name: 'title', type: 'string', required: false, description: 'Section title' },
      { name: 'description', type: 'string', required: false, description: 'Description text' },
      { name: 'buttonText', type: 'string', required: false, description: 'Submit button label', default: 'Subscribe' },
      { name: 'successMessage', type: 'string', required: false, description: 'Success message' },
    ],
  },
  {
    type: 'map',
    name: 'Map',
    description: 'Embedded Google Maps.',
    category: 'interactive',
    fields: [
      { name: 'address', type: 'string', required: true, description: 'Location address' },
      { name: 'zoom', type: 'number', required: false, description: 'Map zoom level', default: 15 },
      { name: 'height', type: 'number', required: false, description: 'Map height in pixels', default: 400 },
      { name: 'showMarker', type: 'boolean', required: false, description: 'Show location marker' },
    ],
  },
  {
    type: 'booking',
    name: 'Booking',
    description: 'Appointment booking form.',
    category: 'interactive',
    fields: [
      { name: 'title', type: 'string', required: false, description: 'Section title' },
      { name: 'description', type: 'string', required: false, description: 'Description text' },
      { name: 'mode', type: 'string', required: false, description: 'Booking mode', default: 'form', options: ['form', 'calendar'] },
      { name: 'submitButtonText', type: 'string', required: false, description: 'Submit button label' },
      { name: 'successMessage', type: 'string', required: false, description: 'Success message' },
      { name: 'showPhoneField', type: 'boolean', required: false, description: 'Include phone field' },
      { name: 'showDatePicker', type: 'boolean', required: false, description: 'Include date picker' },
    ],
  },
  {
    type: 'popup',
    name: 'Popup',
    description: 'Modal popup with content.',
    category: 'interactive',
    fields: [
      { name: 'content', type: 'tiptap', required: true, description: 'Popup content' },
      { name: 'trigger', type: 'string', required: false, description: 'How to trigger', default: 'delay', options: ['delay', 'scroll', 'exit'] },
      { name: 'delay', type: 'number', required: false, description: 'Delay in seconds (for delay trigger)' },
    ],
  },

  // ============================================
  // Commerce Blocks
  // ============================================
  {
    type: 'pricing',
    name: 'Pricing',
    description: 'Pricing tier cards.',
    category: 'commerce',
    fields: [
      { name: 'tiers', type: 'array', required: true, description: 'Array of pricing tiers' },
      { name: 'columns', type: 'number', required: false, description: 'Number of columns', default: 3 },
      { name: 'variant', type: 'string', required: false, description: 'Visual style', default: 'cards', options: ['cards', 'minimal'] },
    ],
  },
  {
    type: 'comparison',
    name: 'Comparison',
    description: 'Feature comparison table.',
    category: 'commerce',
    fields: [
      { name: 'title', type: 'string', required: false, description: 'Section title' },
      { name: 'products', type: 'array', required: true, description: 'Products to compare [{ id, name, highlighted }]' },
      { name: 'features', type: 'array', required: true, description: 'Features to compare [{ id, name, values[] }]' },
      { name: 'variant', type: 'string', required: false, description: 'Table style', default: 'striped', options: ['striped', 'bordered'] },
      { name: 'showPrices', type: 'boolean', required: false, description: 'Show prices in header' },
      { name: 'showButtons', type: 'boolean', required: false, description: 'Show CTA buttons' },
    ],
  },
  {
    type: 'products',
    name: 'Products',
    description: 'Product grid from store.',
    category: 'commerce',
    fields: [
      { name: 'title', type: 'string', required: false, description: 'Section title' },
      { name: 'columns', type: 'number', required: false, description: 'Number of columns', default: 3 },
      { name: 'limit', type: 'number', required: false, description: 'Max products to show' },
    ],
  },
  {
    type: 'cart',
    name: 'Cart',
    description: 'Shopping cart display.',
    category: 'commerce',
    fields: [
      { name: 'title', type: 'string', required: false, description: 'Section title' },
      { name: 'showCheckoutButton', type: 'boolean', required: false, description: 'Show checkout button' },
    ],
  },
  {
    type: 'article-grid',
    name: 'Article Grid',
    description: 'Blog post or article grid.',
    category: 'content',
    fields: [
      { name: 'title', type: 'string', required: false, description: 'Section title' },
      { name: 'columns', type: 'number', required: false, description: 'Number of columns', default: 3 },
      { name: 'limit', type: 'number', required: false, description: 'Max articles to show' },
      { name: 'category', type: 'string', required: false, description: 'Filter by category slug' },
    ],
  },
];

/**
 * Get info for a specific block type.
 */
export function getBlockInfo(type: string): BlockInfo | undefined {
  return BLOCK_REFERENCE.find(b => b.type === type);
}

/**
 * Get all blocks in a category.
 */
export function getBlocksByCategory(category: BlockInfo['category']): BlockInfo[] {
  return BLOCK_REFERENCE.filter(b => b.category === category);
}

/**
 * Get required fields for a block type.
 */
export function getRequiredFields(type: string): string[] {
  const block = getBlockInfo(type);
  if (!block) return [];
  return block.fields.filter(f => f.required).map(f => f.name);
}
