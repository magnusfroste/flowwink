/**
 * Block Reference
 * 
 * Documentation for all available block types in FlowWink.
 * Use this as a reference when creating templates.
 */

export interface BlockFieldInfo {
  name: string;
  type: 'string' | 'number' | 'boolean' | 'object' | 'array' | 'tiptap';
  required: boolean;
  description: string;
  default?: unknown;
  options?: string[];
  /** For array fields: typed schema of each item's sub-fields. */
  itemFields?: BlockFieldInfo[];
}

export interface BlockInfo {
  type: string;
  name: string;
  description: string;
  category: 'content' | 'media' | 'layout' | 'interactive' | 'commerce';
  fields: BlockFieldInfo[];
}

/**
 * ONE ENTRY PER TYPE. Every consumer resolves a type by first match —
 * `getBlockInfo`, `describe_blocks`, the generated tool definitions — so a
 * second entry for the same type is documentation nothing will ever serve.
 * That was not hypothetical: kb-hub and kb-search each carried two entries with
 * DIFFERENT field lists, and the half agents could see was the poorer one
 * (kb-hub's shadowed entry held the only mention of kbPageSlug; kb-search's
 * shadowed entry was the only one missing it, while the visible one lacked it
 * too). `inspect_rendered_page` judges stored pages against this catalogue, so
 * a field that is read but undocumented comes back as "no renderer reads this"
 * and the sensor advises deleting content that renders fine.
 * Enforced by src/lib/__tests__/block-reference-drift.guardrails.test.ts.
 */
export const BLOCK_REFERENCE: BlockInfo[] = [
  // ============================================
  // Content Blocks
  // ============================================
  {
    type: 'hero',
    name: 'Hero',
    description: 'Large banner section with title, subtitle, call-to-action buttons. Supports images, direct video, YouTube, and Vimeo backgrounds.',
    category: 'content',
    fields: [
      { name: 'title', type: 'string', required: true, description: "Main headline" },
      { name: 'subtitle', type: 'string', required: false, description: "Supporting text below the title" },
      { name: 'eyebrow', type: 'string', required: false, description: "Small uppercase label above the title, e.g. \"NEW\", \"SINCE 1998\"" },
      { name: 'eyebrowColor', type: 'string', required: false, description: "Eyebrow tint", default: 'default', options: ['default', 'primary', 'muted'] },
      { name: 'layout', type: 'string', required: false, description: "Hero composition: centered content, or content beside the image", default: 'centered', options: ['centered', 'split-left', 'split-right'] },
      { name: 'backgroundType', type: 'string', required: false, description: "Background style; \"none\" leaves the section transparent", default: 'color', options: ['color', 'image', 'video', 'none'] },
      { name: 'backgroundImage', type: 'string', required: false, description: "Background image URL \u2014 this is the field the renderer reads" },
      { name: 'imageSrc', type: 'string', required: false, description: "Legacy: earlier name for the background image URL; prefer backgroundImage" },
      { name: 'videoUrl', type: 'string', required: false, description: "Background video URL or YouTube/Vimeo URL (when backgroundType is \"video\")" },
      { name: 'videoUrlWebm', type: 'string', required: false, description: "Optional WebM source added alongside videoUrl for browsers that prefer it" },
      { name: 'videoType', type: 'string', required: false, description: "Video source type", default: 'direct', options: ['direct', 'youtube', 'vimeo'] },
      { name: 'videoPosterUrl', type: 'string', required: false, description: "Poster image shown before the video plays, and the fallback on mobile" },
      { name: 'videoAutoplay', type: 'boolean', required: false, description: "Start the background video automatically", default: true },
      { name: 'videoLoop', type: 'boolean', required: false, description: "Loop the background video", default: true },
      { name: 'videoMuted', type: 'boolean', required: false, description: "Start the video muted (required for autoplay in most browsers)", default: true },
      { name: 'showVideoControls', type: 'boolean', required: false, description: "Show play/pause/mute controls for video" },
      { name: 'heightMode', type: 'string', required: false, description: "Section height", default: 'auto', options: ['viewport', '80vh', '70vh', '60vh', '50vh', 'auto'] },
      { name: 'contentAlignment', type: 'string', required: false, description: "Vertical position of the content block", default: 'center', options: ['top', 'center', 'bottom'] },
      { name: 'textAlignment', type: 'string', required: false, description: "Text alignment", default: 'center', options: ['left', 'center', 'right'] },
      { name: 'textTheme', type: 'string', required: false, description: "Text color scheme; \"auto\" derives it from the overlay", default: 'auto', options: ['auto', 'light', 'dark'] },
      { name: 'overlayOpacity', type: 'number', required: false, description: "Overlay opacity over image/video, 0-100", default: 70 },
      { name: 'overlayColor', type: 'string', required: false, description: "Overlay color style", default: 'dark', options: ['dark', 'light', 'primary'] },
      { name: 'parallaxEffect', type: 'boolean', required: false, description: "Background drifts slower than the page (transform-based parallax — works on iOS, unlike background-attachment: fixed)" },
      { name: 'titleSize', type: 'string', required: false, description: "Title scale", default: 'default', options: ['default', 'large', 'display', 'massive'] },
      { name: 'gradientTitle', type: 'boolean', required: false, description: "Render the title with the brand gradient fill" },
      { name: 'titleAnimation', type: 'string', required: false, description: "Title entrance animation", default: 'none', options: ['none', 'fade-in', 'slide-up', 'typewriter'] },
      { name: 'subtitleAnimation', type: 'string', required: false, description: "Subtitle entrance animation, delayed after the title", default: 'none', options: ['none', 'fade-in', 'slide-up'] },
      { name: 'showScrollIndicator', type: 'boolean', required: false, description: "Show scroll down arrow" },
      { name: 'primaryButton', type: 'object', required: false, description: "Primary CTA button { text, url }" },
      { name: 'secondaryButton', type: 'object', required: false, description: "Secondary button { text, url }" },
      { name: 'heroStats', type: 'array', required: false, description: "Proof numbers rendered in a row under the CTA, e.g. \"500+ customers\"", itemFields: [{ name: 'value', type: 'string', required: true, description: 'The number, e.g. "500+"' }, { name: 'label', type: 'string', required: true, description: 'What the number counts, e.g. "customers"' }] },
    ],
  },
  {
    type: 'text',
    name: 'Text',
    description: 'Rich text content block for paragraphs, headings, lists, and formatted text.',
    category: 'content',
    fields: [
      { name: 'eyebrow', type: 'string', required: false, description: "Small uppercase label above the display title, e.g. \"SERVICES\"" },
      { name: 'eyebrowColor', type: 'string', required: false, description: "Eyebrow color as a CSS/hex value; defaults to brand primary" },
      { name: 'title', type: 'string', required: false, description: "Optional display heading above the rich text" },
      { name: 'titleSize', type: 'string', required: false, description: "Title scale", default: 'default', options: ['default', 'large', 'display'] },
      { name: 'accentText', type: 'string', required: false, description: "Script-font accent word/phrase paired with the title, e.g. \"Excellence\"" },
      { name: 'accentPosition', type: 'string', required: false, description: "Where the accent renders relative to the title", default: 'end', options: ['start', 'end', 'inline'] },
      { name: 'content', type: 'tiptap', required: true, description: "Rich text content in Tiptap format" },
      { name: 'alignment', type: 'string', required: false, description: "Text alignment", default: 'left', options: ['left', 'center', 'right'] },
      { name: 'maxWidth', type: 'string', required: false, description: "Content width", default: 'prose', options: ['prose', 'full'] },
      { name: 'backgroundColor', type: 'string', required: false, description: "Section background color override (CSS color)" },
    ],
  },
  {
    type: 'quote',
    name: 'Quote',
    description: 'Highlighted quotation with optional attribution.',
    category: 'content',
    fields: [
      { name: 'text', type: 'string', required: true, description: "The quote text \u2014 this is the field the renderer reads" },
      { name: 'quote', type: 'string', required: false, description: "Legacy: earlier name for the quote text; prefer text" },
      { name: 'author', type: 'string', required: false, description: "Quote author name" },
      { name: 'source', type: 'string', required: false, description: "Where the quote comes from, e.g. a book, article or company" },
      { name: 'role', type: 'string', required: false, description: "Legacy: author role or title; not rendered" },
      { name: 'variant', type: 'string', required: false, description: "Visual style: plain left-rule quote, or a decorative tinted card", default: 'simple', options: ['simple', 'styled'] },
    ],
  },
  {
    type: 'cta',
    name: 'Call to Action',
    description: 'Prominent section encouraging users to take action.',
    category: 'content',
    fields: [
      { name: 'title', type: 'string', required: true, description: "CTA headline" },
      { name: 'subtitle', type: 'string', required: false, description: "Supporting text" },
      { name: 'buttonText', type: 'string', required: true, description: "Primary button label" },
      { name: 'buttonUrl', type: 'string', required: true, description: "Primary button link URL" },
      { name: 'secondaryButtonText', type: 'string', required: false, description: "Secondary button label" },
      { name: 'secondaryButtonUrl', type: 'string', required: false, description: "Secondary button link URL" },
      { name: 'variant', type: 'string', required: false, description: "Layout style: solid/gradient panel, full background image, split image+content, or understated", default: 'default', options: ['default', 'with-image', 'split', 'minimal'] },
      { name: 'backgroundImage', type: 'string', required: false, description: "Background image URL (used by the \"with-image\" and \"split\" variants)" },
      { name: 'overlayOpacity', type: 'number', required: false, description: "Darkening overlay over the background image, 0-1", default: 0.6 },
      { name: 'gradient', type: 'boolean', required: false, description: "Use gradient background", default: true },
    ],
  },
  {
    type: 'features',
    name: 'Features',
    description: 'Grid of feature cards with icons, titles, and descriptions.',
    category: 'content',
    fields: [
      { name: 'title', type: 'string', required: false, description: "Section title" },
      { name: 'subtitle', type: 'string', required: false, description: "Supporting text under the title" },
      { name: 'features', type: 'array', required: true, description: "Array of features [{ id, icon, title, description, link }]" },
      { name: 'columns', type: 'number', required: false, description: "Number of columns", default: 3, options: ['2', '3', '4'] },
      { name: 'layout', type: 'string', required: false, description: "Grid of cards or a stacked list", default: 'grid', options: ['grid', 'list'] },
      { name: 'variant', type: 'string', required: false, description: "Visual style", default: 'default', options: ['default', 'cards', 'minimal', 'centered'] },
      { name: 'iconStyle', type: 'string', required: false, description: "Icon background shape", default: 'circle', options: ['circle', 'square', 'none'] },
      { name: 'showLinks', type: 'boolean', required: false, description: "Render each feature's link as a \"Read more\" action", default: true },
      { name: 'hoverEffect', type: 'string', required: false, description: "Effect on card hover", default: 'none', options: ['none', 'lift', 'glow', 'border'] },
      { name: 'cardStyle', type: 'string', required: false, description: "Card surface treatment", default: 'default', options: ['default', 'glass', 'gradient-border'] },
      { name: 'staggeredReveal', type: 'boolean', required: false, description: "Animate the cards in one by one as they enter the viewport", default: false },
    ],
  },
  {
    type: 'stats',
    name: 'Statistics',
    description: 'Display key metrics and numbers.',
    category: 'content',
    fields: [
      { name: 'title', type: 'string', required: false, description: "Section title" },
      { name: 'stats', type: 'array', required: true, description: "Array of stats [{ value, label }]" },
      { name: 'animated', type: 'boolean', required: false, description: "Animate the numbers when they scroll into view", default: true },
      { name: 'animationStyle', type: 'string', required: false, description: "How each number appears", default: 'count-up', options: ['count-up', 'fade-in', 'slide-up', 'typewriter'] },
      { name: 'animationDuration', type: 'number', required: false, description: "Animation length in ms \u2014 1000 fast, 2000 normal, 3000 slow", default: 2000 },
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
      { name: 'subtitle', type: 'string', required: false, description: "Supporting text under the title" },
    ],
  },
  {
    type: 'team',
    name: 'Team',
    description: 'Team member grid with photos and bios.',
    category: 'content',
    fields: [
      { name: 'title', type: 'string', required: false, description: 'Section title' },
      { name: 'subtitle', type: 'string', required: false, description: 'Supporting text under the title' },
      { name: 'members', type: 'array', required: true, description: 'Array of members [{ id, name, role, bio, image, linkedin, twitter }]' },
      { name: 'columns', type: 'number', required: false, description: 'Number of columns', default: 4 },
      { name: 'layout', type: 'string', required: false, description: 'Grid of cards or a swipeable carousel', default: 'grid', options: ['grid', 'carousel'] },
      { name: 'variant', type: 'string', required: false, description: 'Visual style', default: 'cards', options: ['cards', 'minimal'] },
      { name: 'showRole', type: 'boolean', required: false, description: 'Show member roles' },
      { name: 'showBio', type: 'boolean', required: false, description: 'Show member bios' },
      { name: 'showSocial', type: 'boolean', required: false, description: "Show each member's social links", default: true },
      { name: 'staggeredReveal', type: 'boolean', required: false, description: 'Animate the members in one by one as they enter the viewport', default: false },
    ],
  },
  {
    type: 'logos',
    name: 'Logos',
    description: 'Partner or client logo showcase.',
    category: 'content',
    fields: [
      { name: 'title', type: 'string', required: false, description: 'Section title' },
      { name: 'subtitle', type: 'string', required: false, description: 'Supporting text under the title' },
      { name: 'logos', type: 'array', required: true, description: 'Array of logos [{ id, name, logo }]' },
      { name: 'columns', type: 'number', required: false, description: 'Number of columns', default: 5 },
      { name: 'layout', type: 'string', required: false, description: 'Display layout', default: 'grid', options: ['grid', 'carousel', 'scroll'] },
      { name: 'variant', type: 'string', required: false, description: 'Color treatment', default: 'grayscale', options: ['grayscale', 'color', 'default'] },
      { name: 'logoSize', type: 'string', required: false, description: 'Logo size', default: 'md', options: ['sm', 'md', 'lg'] },
      { name: 'autoplay', type: 'boolean', required: false, description: 'Auto-advance the carousel layout', default: true },
      { name: 'autoplaySpeed', type: 'number', required: false, description: 'Seconds between carousel slides', default: 3 },
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
      { name: 'staggeredReveal', type: 'boolean', required: false, description: "Animate the entries in one by one as they enter the viewport", default: false },
    ],
  },
  {
    type: 'accordion',
    name: 'Accordion',
    description: 'Expandable FAQ or content sections.',
    category: 'content',
    fields: [
      { name: 'title', type: 'string', required: false, description: 'Section title' },
      { name: 'items', type: 'array', required: true, description: 'FAQ items', itemFields: [
        { name: 'question', type: 'string', required: true, description: 'The question text' },
        { name: 'answer', type: 'tiptap', required: true, description: 'The answer — rich text content' },
      ]},
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
      { name: 'src', type: 'string', required: true, description: "Image URL" },
      { name: 'alt', type: 'string', required: true, description: "Alt text for accessibility" },
      { name: 'caption', type: 'string', required: false, description: "Caption below the image (hidden when overlayText is set)" },
      { name: 'aspectRatio', type: 'string', required: false, description: "Image aspect ratio", default: 'auto', options: ['auto', '16:9', '4:3', '1:1', '21:9'] },
      { name: 'size', type: 'string', required: false, description: "Image width", default: 'large', options: ['small', 'medium', 'large', 'full'] },
      { name: 'fullBleed', type: 'boolean', required: false, description: "Break out of the container and run edge to edge", default: false },
      { name: 'rounded', type: 'boolean', required: false, description: "Rounded corners", default: true },
      { name: 'shadow', type: 'string', required: false, description: "Drop shadow depth", default: 'md', options: ['none', 'sm', 'md', 'lg'] },
      { name: 'hoverEffect', type: 'string', required: false, description: "Effect on hover", default: 'none', options: ['none', 'zoom', 'fade', 'lift'] },
      { name: 'overlayText', type: 'string', required: false, description: "Text rendered on top of the image instead of a caption" },
      { name: 'overlayPosition', type: 'string', required: false, description: "Where the overlay text sits", default: 'center', options: ['center', 'bottom-left', 'bottom-center'] },
    ],
  },
  {
    type: 'gallery',
    name: 'Gallery',
    description: 'Grid of images.',
    category: 'media',
    fields: [
      { name: 'title', type: 'string', required: false, description: "Section title" },
      { name: 'images', type: 'array', required: true, description: "Array of images [{ id, src, alt, caption }]" },
      { name: 'layout', type: 'string', required: false, description: "Presentation: even grid, swipeable carousel, or masonry with varying heights", default: 'grid', options: ['grid', 'carousel', 'masonry'] },
      { name: 'columns', type: 'number', required: false, description: "Number of columns", default: 3, options: ['2', '3', '4'] },
      { name: 'gap', type: 'string', required: false, description: "Spacing between images", default: 'md', options: ['sm', 'md', 'lg'] },
    ],
  },
  {
    type: 'youtube',
    name: 'YouTube',
    description: 'Embedded YouTube video.',
    category: 'media',
    fields: [
      { name: 'url', type: 'string', required: true, description: 'YouTube watch, youtu.be, embed URL or a bare 11-character video ID — this is the field the renderer reads' },
      { name: 'videoId', type: 'string', required: false, description: 'Legacy: bare video ID; prefer url, which also accepts an ID' },
      { name: 'title', type: 'string', required: false, description: 'Video title, used as the iframe title and as a caption under the player' },
      { name: 'autoplay', type: 'boolean', required: false, description: 'Start the video automatically (browsers require mute for this to work)', default: false },
      { name: 'loop', type: 'boolean', required: false, description: 'Repeat the video when it ends', default: false },
      { name: 'mute', type: 'boolean', required: false, description: 'Start without sound', default: false },
      { name: 'controls', type: 'boolean', required: false, description: 'Show the YouTube play/pause controls', default: true },
      { name: 'aspectRatio', type: 'string', required: false, description: 'Video aspect ratio', default: '16:9', options: ['16:9', '4:3'] },
    ],
  },

  // ============================================
  // Layout Blocks
  // ============================================
  {
    type: 'two-column',
    name: 'Two Column',
    description: 'Side-by-side content and image layout with editorial styling: eyebrow label, display-size title, script-font accent text, CTA and rich image controls.',
    category: 'layout',
    // This entry documented 4 of the block's 23 fields until 2026-08-04, and an
    // agent composing through the gateway used exactly the documented ones — the
    // pages worked but looked like the poor cousin of what the block can do.
    // The registry is what agents read; keep it as capable as the renderer.
    fields: [
      { name: 'eyebrow', type: 'string', required: false, description: 'Small uppercase label above the title, e.g. "ABOUT US", "SERVICES"' },
      { name: 'eyebrowColor', type: 'string', required: false, description: 'Eyebrow color; defaults to brand primary' },
      { name: 'title', type: 'string', required: false, description: 'Section title' },
      { name: 'titleSize', type: 'string', required: false, description: 'Title scale', default: 'default', options: ['default', 'large', 'display'] },
      { name: 'accentText', type: 'string', required: false, description: 'Script-font accent word/phrase, e.g. "Excellence" — pairs with the title' },
      { name: 'accentPosition', type: 'string', required: false, description: 'Where the accent renders relative to the title', default: 'end', options: ['start', 'end', 'inline'] },
      { name: 'content', type: 'tiptap', required: true, description: 'Rich text content' },
      { name: 'ctaText', type: 'string', required: false, description: 'Call-to-action button label' },
      { name: 'ctaUrl', type: 'string', required: false, description: 'Call-to-action link' },
      { name: 'note', type: 'string', required: false, description: 'Small print under the CTA' },
      { name: 'imageSrc', type: 'string', required: false, description: 'Image URL' },
      { name: 'imageAlt', type: 'string', required: false, description: 'Image alt text' },
      { name: 'imagePosition', type: 'string', required: false, description: 'Image placement', default: 'right', options: ['left', 'right'] },
      { name: 'imageAspect', type: 'string', required: false, description: 'Aspect ratio', default: 'auto', options: ['auto', '1:1', '4:3', '3:2', '16:9', '21:9'] },
      { name: 'imageFit', type: 'string', required: false, description: 'Fill & crop vs show all', default: 'cover', options: ['cover', 'contain'] },
      { name: 'imageRounded', type: 'string', required: false, description: 'Corner radius', default: 'md', options: ['none', 'sm', 'md', 'lg', 'xl', 'full'] },
      { name: 'secondImageSrc', type: 'string', required: false, description: 'Optional second, offset image for a collage feel' },
      { name: 'secondImageAlt', type: 'string', required: false, description: 'Second image alt text' },
      { name: 'stickyColumn', type: 'string', required: false, description: 'Column that stays pinned while the other scrolls', default: 'none', options: ['none', 'image', 'text'] },
      { name: 'backgroundColor', type: 'string', required: false, description: 'Section background override' },
      { name: 'layout', type: 'string', required: false, description: 'Column split, or two-text-column mode instead of text+image', default: '50-50', options: ['50-50', '60-40', '40-60', 'text-text'] },
      { name: 'leftColumn', type: 'tiptap', required: false, description: 'Two-text mode: left column content' },
      { name: 'rightColumn', type: 'tiptap', required: false, description: 'Two-text mode: right column content' },
      { name: 'secondaryContent', type: 'tiptap', required: false, description: "Two-text mode (layout 'text-text'): right column content, paired with content as the left column" },
      { name: 'primaryButton', type: 'object', required: false, description: 'CTA as an object ({ text, url }) — alternative to ctaText/ctaUrl' },

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
      { name: 'title', type: 'string', required: false, description: "Form title" },
      { name: 'description', type: 'string', required: false, description: "Text under the title explaining what the form is for" },
      { name: 'fields', type: 'array', required: true, description: "Array of fields [{ id, type, label, required, placeholder, width, options }]" },
      { name: 'submitButtonText', type: 'string', required: false, description: "Submit button label", default: 'Submit' },
      { name: 'successMessage', type: 'string', required: false, description: "Message shown after submission" },
      { name: 'notifyEmail', type: 'string', required: false, description: "Address that receives an email on every submission" },
      { name: 'jobPostingId', type: 'string', required: false, description: "Bind submissions to a job posting \u2014 turns the form into a job application" },
      { name: 'variant', type: 'string', required: false, description: "Visual style", default: 'default', options: ['default', 'card', 'minimal'] },
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
      { name: 'emailPlaceholder', type: 'string', required: false, description: "Email field placeholder — set it in the site's own language", default: 'Enter your email' },
      { name: 'namePlaceholder', type: 'string', required: false, description: 'Name field placeholder (only rendered when showNameField is on)', default: 'Your name (optional)' },
      { name: 'variant', type: 'string', required: false, description: 'Visual style', default: 'default' },
      { name: 'showNameField', type: 'boolean', required: false, description: 'Also ask for a name', default: false },
    ],
  },
  {
    type: 'map',
    name: 'Map',
    description: 'Embedded Google Maps.',
    category: 'interactive',
    fields: [
      { name: 'address', type: 'string', required: true, description: "Location address used to build the map URL" },
      { name: 'locationName', type: 'string', required: false, description: "Place name shown under the map, e.g. \"Main Office\"" },
      { name: 'title', type: 'string', required: false, description: "Heading above the map, e.g. \"Find Us\"" },
      { name: 'description', type: 'string', required: false, description: "Intro text under the heading" },
      { name: 'zoom', type: 'number', required: false, description: "Map zoom level", default: 15 },
      { name: 'height', type: 'string', required: false, description: "Map height preset", default: 'md', options: ['sm', 'md', 'lg', 'xl'] },
      { name: 'mapType', type: 'string', required: false, description: "Map tiles", default: 'roadmap', options: ['roadmap', 'satellite'] },
      { name: 'showMarker', type: 'boolean', required: false, description: "Show location marker" },
      { name: 'showBorder', type: 'boolean', required: false, description: "Draw a border around the map frame" },
      { name: 'rounded', type: 'boolean', required: false, description: "Rounded map corners" },
      { name: 'loadOnConsent', type: 'boolean', required: false, description: "GDPR: do not load Google Maps until the visitor clicks to accept", default: false },
    ],
  },
  {
    type: 'booking',
    name: 'Booking',
    description: 'Appointment booking form.',
    category: 'interactive',
    fields: [
      { name: 'title', type: 'string', required: false, description: "Section title" },
      { name: 'description', type: 'string', required: false, description: "Description text" },
      { name: 'mode', type: 'string', required: false, description: "How visitors book: embedded external calendar, a request form, or the built-in Booking module flow", default: 'form', options: ['embed', 'form', 'smart'] },
      { name: 'provider', type: 'string', required: false, description: "External calendar provider (mode \"embed\")", default: 'calendly', options: ['calendly', 'cal', 'hubspot', 'custom'] },
      { name: 'embedUrl', type: 'string', required: false, description: "Calendar URL or custom embed URL (mode \"embed\")" },
      { name: 'height', type: 'string', required: false, description: "Embed height: sm 400px, md 550px, lg 700px, xl 850px", default: 'md', options: ['sm', 'md', 'lg', 'xl'] },
      { name: 'submitButtonText', type: 'string', required: false, description: "Submit button label" },
      { name: 'successMessage', type: 'string', required: false, description: "Success message" },
      { name: 'showPhoneField', type: 'boolean', required: false, description: "Include phone field", default: true },
      { name: 'showDatePicker', type: 'boolean', required: false, description: "Include date preference field", default: true },
      { name: 'showServiceSelector', type: 'boolean', required: false, description: "Let the visitor pick a service before booking", default: false },
      { name: 'services', type: 'array', required: false, description: "Selectable services (mode \"form\" with showServiceSelector)", itemFields: [{ name: 'id', type: 'string', required: true, description: 'Stable id for the service' }, { name: 'name', type: 'string', required: true, description: 'Service name' }, { name: 'duration', type: 'string', required: false, description: 'Duration text, e.g. "30 min"' }, { name: 'description', type: 'string', required: false, description: 'Short description' }] },
      { name: 'triggerWebhook', type: 'boolean', required: false, description: "Fire the booking automation webhook on submit", default: false },
      { name: 'variant', type: 'string', required: false, description: "Visual style", default: 'card', options: ['default', 'card', 'minimal'] },
    ],
  },
  {
    type: 'popup',
    name: 'Popup',
    description: 'Modal popup with content.',
    category: 'interactive',
    fields: [
      { name: 'title', type: 'string', required: false, description: "Popup heading" },
      { name: 'content', type: 'tiptap', required: true, description: "Popup content" },
      { name: 'image', type: 'string', required: false, description: "Image shown above the content" },
      { name: 'buttonText', type: 'string', required: false, description: "Primary button label" },
      { name: 'buttonUrl', type: 'string', required: false, description: "Primary button link" },
      { name: 'secondaryButtonText', type: 'string', required: false, description: "Dismiss-style secondary button label, e.g. \"No thanks\"" },
      { name: 'trigger', type: 'string', required: false, description: "What opens the popup", default: 'time', options: ['time', 'scroll', 'exit-intent'] },
      { name: 'delaySeconds', type: 'number', required: false, description: "Seconds before opening (trigger \"time\")", default: 5 },
      { name: 'scrollPercentage', type: 'number', required: false, description: "Scroll depth in percent that opens it (trigger \"scroll\")", default: 50 },
      { name: 'showOnce', type: 'boolean', required: false, description: "Do not show again after it has been dismissed", default: true },
      { name: 'cookieDays', type: 'number', required: false, description: "How many days a dismissal is remembered", default: 7 },
      { name: 'size', type: 'string', required: false, description: "Popup width", default: 'md', options: ['sm', 'md', 'lg'] },
      { name: 'position', type: 'string', required: false, description: "Where it appears", default: 'center', options: ['center', 'bottom-right', 'bottom-left'] },
      { name: 'overlayDark', type: 'boolean', required: false, description: "Dim and blur the page behind it (centered position only)" },
      { name: 'delay', type: 'number', required: false, description: "Legacy: earlier name for delaySeconds" },
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
      { name: 'title', type: 'string', required: false, description: "Section title" },
      { name: 'subtitle', type: 'string', required: false, description: "Supporting text under the title" },
      { name: 'tiers', type: 'array', required: true, description: "Array of pricing tiers" },
      { name: 'productType', type: 'string', required: false, description: "When pricing is driven by the Products module, which product types to include", default: 'all', options: ['all', 'recurring', 'one_time'] },
      { name: 'columns', type: 'number', required: false, description: "Number of columns", default: 3, options: ['2', '3', '4'] },
      { name: 'variant', type: 'string', required: false, description: "Visual style", default: 'cards', options: ['default', 'cards', 'compact'] },
    ],
  },
  {
    type: 'comparison',
    name: 'Comparison',
    description: 'Feature comparison table.',
    category: 'commerce',
    fields: [
      { name: 'title', type: 'string', required: false, description: 'Section title' },
      { name: 'subtitle', type: 'string', required: false, description: 'Supporting text under the title' },
      { name: 'products', type: 'array', required: true, description: 'Products to compare [{ id, name, highlighted }]' },
      { name: 'features', type: 'array', required: true, description: 'Features to compare [{ id, name, values[] }]' },
      { name: 'variant', type: 'string', required: false, description: 'Table style', default: 'striped', options: ['striped', 'bordered'] },
      { name: 'showPrices', type: 'boolean', required: false, description: 'Show prices in header' },
      { name: 'showButtons', type: 'boolean', required: false, description: 'Show CTA buttons' },
      { name: 'stickyHeader', type: 'boolean', required: false, description: 'Keep the product header row pinned while the table scrolls', default: true },
    ],
  },
  {
    type: 'featured-product',
    name: 'Featured Product',
    description: 'Hero-style spotlight for a single product with large image, price, and add-to-cart CTA. Data comes from the Products module — provide productId.',
    category: 'commerce',
    fields: [
      { name: 'productId', type: 'string', required: false, description: 'UUID of the product to feature (leave empty to auto-pick the first active product)' },
      { name: 'badge', type: 'string', required: false, description: 'Small label above the product, e.g. "New", "Sale", "Featured"' },
      { name: 'ctaText', type: 'string', required: false, description: 'CTA button text', default: 'Add to cart' },
      { name: 'layout', type: 'string', required: false, description: 'Image position', default: 'image-left', options: ['image-left', 'image-right'] },
      { name: 'showDescription', type: 'boolean', required: false, description: 'Show product description', default: true },
      { name: 'backgroundStyle', type: 'string', required: false, description: 'Background style', default: 'default', options: ['default', 'muted', 'gradient'] },
    ],
  },
  {
    type: 'trust-bar',
    name: 'Trust Bar',
    description: 'Horizontal bar with trust signals like free shipping, returns policy, secure payment.',
    category: 'commerce',
    fields: [
      { name: 'items', type: 'array', required: false, description: 'Array of { icon, text } items. Icons: truck, rotate-ccw, shield-check, credit-card, clock, star, heart-handshake, award, leaf, zap, globe, lock' },
      { name: 'variant', type: 'string', required: false, description: 'Visual style', default: 'default', options: ['default', 'bordered', 'filled'] },
      { name: 'size', type: 'string', required: false, description: 'Size', default: 'md', options: ['sm', 'md', 'lg'] },
      { name: 'columns', type: 'number', required: false, description: 'Number of columns', default: 4 },
    ],
  },
  {
    type: 'category-nav',
    name: 'Category Navigation',
    description: 'Visual tiles linking to product categories with images and names.',
    category: 'commerce',
    fields: [
      { name: 'title', type: 'string', required: false, description: 'Section title' },
      { name: 'columns', type: 'number', required: false, description: 'Grid columns', default: 3 },
      { name: 'variant', type: 'string', required: false, description: 'Visual style', default: 'cards', options: ['cards', 'minimal', 'overlay'] },
      { name: 'showDescription', type: 'boolean', required: false, description: 'Show category descriptions', default: false },
      { name: 'linkBase', type: 'string', required: false, description: 'Base URL path', default: '/shop' },
    ],
  },
  {
    type: 'shipping-info',
    name: 'Shipping Info',
    description: 'Shipping, delivery, and returns information block.',
    category: 'commerce',
    fields: [
      { name: 'title', type: 'string', required: false, description: 'Section title' },
      { name: 'items', type: 'array', required: false, description: 'Array of { icon, title, description } items' },
      { name: 'variant', type: 'string', required: false, description: 'Layout variant', default: 'list', options: ['list', 'grid', 'compact'] },
    ],
  },
  {
    type: 'article-grid',
    name: 'Article Grid',
    description: 'Blog post or article grid.',
    category: 'content',
    fields: [
      { name: 'title', type: 'string', required: false, description: "Section title" },
      { name: 'columns', type: 'number', required: false, description: "Number of columns", default: 3, options: ['2', '3', '4'] },
      { name: 'articles', type: 'array', required: true, description: "Manually curated cards \u2014 this block does not read the blog; use latest-posts for that", itemFields: [{ name: 'title', type: 'string', required: true, description: 'Card title' }, { name: 'description', type: 'string', required: false, description: 'Short teaser text' }, { name: 'link', type: 'string', required: false, description: 'Where the card links, e.g. "/blog/my-post"' }, { name: 'image', type: 'string', required: false, description: 'Card image URL' }] },
    ],
  },
  {
    type: 'latest-posts',
    name: 'Latest Posts',
    description: 'Auto-pulls the most recent published blog posts.',
    category: 'content',
    fields: [
      { name: 'title', type: 'string', required: false, description: 'Section title' },
      { name: 'subtitle', type: 'string', required: false, description: 'Section subtitle' },
      { name: 'count', type: 'number', required: false, description: 'Posts to show (1-6)', default: 3 },
      { name: 'columns', type: 'number', required: false, description: 'Columns (1-4)', default: 3 },
      { name: 'category', type: 'string', required: false, description: 'Filter by category' },
      { name: 'showExcerpt', type: 'boolean', required: false, description: 'Show post excerpt', default: true },
      { name: 'showDate', type: 'boolean', required: false, description: 'Show published date', default: true },
      { name: 'ctaText', type: 'string', required: false, description: 'CTA text', default: 'View all posts' },
      { name: 'ctaUrl', type: 'string', required: false, description: 'CTA URL', default: '/blog' },
    ],
  },
  {
    type: 'kb-featured',
    name: 'KB Featured',
    description: 'Featured Knowledge Base articles as clickable cards. Data-driven — no article content is authored here.',
    category: 'interactive',
    fields: [
      { name: 'title', type: 'string', required: false, description: 'Section title' },
      { name: 'subtitle', type: 'string', required: false, description: 'Section subtitle' },
      { name: 'maxItems', type: 'number', required: false, description: 'Maximum number of articles to show', default: 6 },
      { name: 'layout', type: 'string', required: false, description: 'Display layout', default: 'grid', options: ['grid', 'list'] },
      { name: 'columns', type: 'number', required: false, description: 'Grid columns (when layout is grid)', default: 3, options: ['2', '3', '4'] },
      { name: 'showCategory', type: 'boolean', required: false, description: 'Show article category', default: true },
      { name: 'kbPageSlug', type: 'string', required: false, description: 'Slug of the KB landing page; article links are built from it. Defaults to the site-wide KB slug.' },
    ],
  },
  {
    type: 'kb-hub',
    name: 'Knowledge Base',
    description: 'Full Knowledge Base with search, category browse, and contact CTA. Use as the landing block on a dedicated help/KB page.',
    category: 'interactive',
    fields: [
      { name: 'title', type: 'string', required: false, description: 'Section title' },
      { name: 'subtitle', type: 'string', required: false, description: 'Section subtitle' },
      { name: 'searchPlaceholder', type: 'string', required: false, description: 'Search input placeholder' },
      { name: 'showSearch', type: 'boolean', required: false, description: 'Show search field', default: true },
      { name: 'showCategories', type: 'boolean', required: false, description: 'Show category filter buttons', default: true },
      { name: 'showContactCta', type: 'boolean', required: false, description: 'Show contact CTA section', default: true },
      { name: 'contactTitle', type: 'string', required: false, description: 'Contact CTA title' },
      { name: 'contactSubtitle', type: 'string', required: false, description: 'Contact CTA subtitle' },
      { name: 'contactButtonText', type: 'string', required: false, description: 'Contact button text' },
      { name: 'contactLink', type: 'string', required: false, description: 'Contact button link' },
      { name: 'layout', type: 'string', required: false, description: 'Display layout', default: 'accordion', options: ['accordion', 'cards'] },
      { name: 'emptyStateTitle', type: 'string', required: false, description: 'Heading shown when a search matches nothing' },
      { name: 'emptyStateSubtitle', type: 'string', required: false, description: 'Supporting line shown when a search matches nothing' },
      { name: 'kbPageSlug', type: 'string', required: false, description: 'Slug of the KB landing page; article links are built from it. Defaults to the site-wide KB slug.' },
    ],
  },
  {
    type: 'kb-search',
    name: 'KB Search',
    description: 'Standalone Knowledge Base search input that routes to the KB search results page. Can be embedded in hero sections or anywhere on the site.',
    category: 'interactive',
    fields: [
      { name: 'title', type: 'string', required: false, description: 'Optional title above search' },
      { name: 'subtitle', type: 'string', required: false, description: 'Optional subtitle; rendered by both the hero and the default variant' },
      { name: 'placeholder', type: 'string', required: false, description: 'Search input placeholder', default: 'Search for answers...' },
      { name: 'buttonText', type: 'string', required: false, description: 'Search button text', default: 'Search' },
      { name: 'variant', type: 'string', required: false, description: 'Display variant', default: 'default', options: ['default', 'minimal', 'hero'] },
      { name: 'showButton', type: 'boolean', required: false, description: 'Show search button', default: true },
      { name: 'kbPageSlug', type: 'string', required: false, description: 'Slug of the KB page the search routes to. Defaults to the site-wide KB slug.' },
    ],
  },
  // ============================================
  // New Interactive & Conversion Blocks
  // ============================================
  {
    type: 'announcement-bar',
    name: 'Announcement Bar',
    description: 'Sticky top banner for promotions, notices, or countdown timers.',
    category: 'layout',
    fields: [
      { name: 'message', type: 'string', required: true, description: "Bar text, e.g. \"Free shipping over 500 SEK\"" },
      { name: 'linkText', type: 'string', required: false, description: "Inline link label" },
      { name: 'linkUrl', type: 'string', required: false, description: "Inline link URL \u2014 the link only renders when both linkText and linkUrl are set" },
      { name: 'variant', type: 'string', required: false, description: "Visual style", default: 'solid', options: ['solid', 'gradient', 'minimal'] },
      { name: 'backgroundColor', type: 'string', required: false, description: "Background color override (CSS color)" },
      { name: 'textColor', type: 'string', required: false, description: "Text color override (CSS color)" },
      { name: 'dismissable', type: 'boolean', required: false, description: "Allow visitors to close the bar", default: true },
      { name: 'sticky', type: 'boolean', required: false, description: "Keep the bar pinned to the top while scrolling", default: false },
      { name: 'showCountdown', type: 'boolean', required: false, description: "Show a countdown next to the message", default: false },
      { name: 'countdownTarget', type: 'string', required: false, description: "ISO date/time the countdown runs to (required when showCountdown is on)" },
    ],
  },
  {
    type: 'tabs',
    name: 'Tabs',
    description: 'Tabbed content sections for organized information.',
    category: 'layout',
    fields: [
      { name: 'title', type: 'string', required: false, description: 'Section title' },
      { name: 'subtitle', type: 'string', required: false, description: 'Section subtitle' },
      { name: 'tabs', type: 'array', required: true, description: 'Tab items', itemFields: [
        { name: 'id', type: 'string', required: true, description: 'Unique tab ID' },
        { name: 'title', type: 'string', required: true, description: 'Tab label shown in the tab bar' },
        { name: 'icon', type: 'string', required: false, description: 'Optional Lucide icon name' },
        { name: 'content', type: 'tiptap', required: true, description: 'Tab body — rich text content' },
      ]},
      { name: 'orientation', type: 'string', required: false, description: 'Tab orientation', default: 'horizontal', options: ['horizontal', 'vertical'] },
      { name: 'variant', type: 'string', required: false, description: 'Tab style', default: 'underline', options: ['underline', 'pills', 'boxed'] },
      { name: 'defaultTab', type: 'string', required: false, description: 'ID of default active tab' },
    ],
  },
  {
    type: 'marquee',
    name: 'Marquee',
    description: 'Scrolling text or logo ticker.',
    category: 'layout',
    fields: [
      { name: 'items', type: 'array', required: true, description: 'Array of items [{ id, text, icon }]' },
      { name: 'speed', type: 'string', required: false, description: 'Scroll speed', default: 'normal', options: ['slow', 'normal', 'fast'] },
      { name: 'direction', type: 'string', required: false, description: 'Scroll direction', default: 'left', options: ['left', 'right'] },
      { name: 'pauseOnHover', type: 'boolean', required: false, description: 'Pause on hover', default: true },
      { name: 'separator', type: 'string', required: false, description: 'Separator between items', default: '•' },
      { name: 'variant', type: 'string', required: false, description: 'Visual style', default: 'default', options: ['default', 'gradient', 'outlined'] },
    ],
  },
  {
    type: 'embed',
    name: 'Embed',
    description: 'Embed external content (Vimeo, Spotify, custom iframes).',
    category: 'media',
    fields: [
      { name: 'url', type: 'string', required: true, description: "URL to embed" },
      { name: 'provider', type: 'string', required: false, description: "Force a provider instead of detecting it from the URL", options: ['vimeo', 'spotify', 'soundcloud', 'codepen', 'figma', 'loom', 'custom'] },
      { name: 'customEmbed', type: 'string', required: false, description: "Raw embed HTML, used instead of url \u2014 rendered as-is, so only paste code you trust" },
      { name: 'caption', type: 'string', required: false, description: "Caption under the embed" },
      { name: 'aspectRatio', type: 'string', required: false, description: "Embed aspect ratio", default: '16:9', options: ['auto', '16:9', '4:3', '1:1', '9:16'] },
      { name: 'maxWidth', type: 'string', required: false, description: "Embed width", default: 'lg', options: ['sm', 'md', 'lg', 'full'] },
      { name: 'variant', type: 'string', required: false, description: "Visual style", default: 'default', options: ['default', 'card', 'minimal'] },
    ],
  },
  {
    type: 'lottie',
    name: 'Lottie Animation',
    description: 'Lightweight vector animations with interactive playback controls.',
    category: 'media',
    fields: [
      { name: 'src', type: 'string', required: true, description: 'URL to Lottie JSON animation file' },
      { name: 'autoplay', type: 'boolean', required: false, description: 'Auto-play on load', default: true },
      { name: 'loop', type: 'boolean', required: false, description: 'Loop animation', default: true },
      { name: 'speed', type: 'number', required: false, description: 'Playback speed (0.25-2)', default: 1 },
      { name: 'direction', type: 'string', required: false, description: 'Play direction', default: 'forward', options: ['forward', 'reverse'] },
      { name: 'playOn', type: 'string', required: false, description: 'Trigger to start playing', default: 'load', options: ['load', 'hover', 'click', 'scroll'] },
      { name: 'hoverAction', type: 'string', required: false, description: 'Action on hover', options: ['play', 'pause', 'reverse'] },
      { name: 'size', type: 'string', required: false, description: 'Animation size', default: 'md', options: ['sm', 'md', 'lg', 'xl', 'full'] },
      { name: 'maxWidth', type: 'number', required: false, description: 'Custom max width in pixels' },
      { name: 'aspectRatio', type: 'string', required: false, description: 'Aspect ratio', default: 'auto', options: ['auto', '1:1', '16:9', '4:3'] },
      { name: 'alignment', type: 'string', required: false, description: 'Horizontal alignment', default: 'center', options: ['left', 'center', 'right'] },
      { name: 'variant', type: 'string', required: false, description: 'Visual style', default: 'default', options: ['default', 'card', 'floating'] },
      { name: 'backgroundColor', type: 'string', required: false, description: 'Background color (leave empty for transparent)' },
      { name: 'alt', type: 'string', required: false, description: 'Alt text for accessibility' },
      { name: 'caption', type: 'string', required: false, description: 'Caption below animation' },
    ],
  },
  {
    type: 'table',
    name: 'Table',
    description: 'Data table with optional sticky header and hover effects.',
    category: 'content',
    fields: [
      { name: 'title', type: 'string', required: false, description: 'Table title' },
      { name: 'caption', type: 'string', required: false, description: 'Table caption' },
      { name: 'columns', type: 'array', required: true, description: 'Column definitions [{ id, header, align }]' },
      { name: 'rows', type: 'array', required: true, description: 'Row data [{ [columnId]: value }]' },
      { name: 'variant', type: 'string', required: false, description: 'Table style', default: 'default', options: ['default', 'striped', 'bordered', 'minimal'] },
      { name: 'size', type: 'string', required: false, description: 'Cell padding', default: 'md', options: ['sm', 'md', 'lg'] },
      { name: 'stickyHeader', type: 'boolean', required: false, description: 'Sticky header on scroll' },
      { name: 'highlightOnHover', type: 'boolean', required: false, description: 'Highlight rows on hover' },
    ],
  },
  {
    type: 'countdown',
    name: 'Countdown',
    description: 'Countdown timer to a specific date.',
    category: 'interactive',
    fields: [
      { name: 'title', type: 'string', required: false, description: 'Section title' },
      { name: 'subtitle', type: 'string', required: false, description: 'Section subtitle' },
      { name: 'targetDate', type: 'string', required: true, description: 'Target date (ISO format)' },
      { name: 'expiredMessage', type: 'string', required: false, description: 'Message when countdown expires' },
      { name: 'showDays', type: 'boolean', required: false, description: 'Show days', default: true },
      { name: 'showHours', type: 'boolean', required: false, description: 'Show hours', default: true },
      { name: 'showMinutes', type: 'boolean', required: false, description: 'Show minutes', default: true },
      { name: 'showSeconds', type: 'boolean', required: false, description: 'Show seconds', default: true },
      { name: 'variant', type: 'string', required: false, description: 'Display style', default: 'default', options: ['default', 'cards', 'minimal', 'circular'] },
      { name: 'size', type: 'string', required: false, description: 'Size', default: 'md', options: ['sm', 'md', 'lg'] },
      { name: 'labels', type: 'object', required: false, description: 'Unit labels, for translating the timer: { days, hours, minutes, seconds }. Any omitted key falls back to English.' },
    ],
  },
  {
    type: 'progress',
    name: 'Progress',
    description: 'Progress bars or circular indicators.',
    category: 'interactive',
    fields: [
      { name: 'title', type: 'string', required: false, description: 'Section title' },
      { name: 'subtitle', type: 'string', required: false, description: 'Section subtitle' },
      { name: 'items', type: 'array', required: true, description: 'Progress items [{ id, label, value, color, icon }]' },
      { name: 'variant', type: 'string', required: false, description: 'Display style', default: 'default', options: ['default', 'circular', 'minimal', 'cards'] },
      { name: 'size', type: 'string', required: false, description: 'Size', default: 'md', options: ['sm', 'md', 'lg'] },
      { name: 'showLabels', type: 'boolean', required: false, description: 'Show item labels', default: true },
      { name: 'showPercentage', type: 'boolean', required: false, description: 'Show percentage', default: true },
      { name: 'animated', type: 'boolean', required: false, description: 'Animate on scroll', default: true },
      { name: 'animationDuration', type: 'number', required: false, description: 'Animation length in ms', default: 1500 },
    ],
  },
  {
    type: 'badge',
    name: 'Badge',
    description: 'Collection of badges, certifications, or partner logos.',
    category: 'content',
    fields: [
      { name: 'title', type: 'string', required: false, description: 'Section title' },
      { name: 'subtitle', type: 'string', required: false, description: 'Section subtitle' },
      { name: 'badges', type: 'array', required: true, description: 'Badge items [{ id, title, subtitle, icon, image, url }]' },
      { name: 'variant', type: 'string', required: false, description: 'Display style', default: 'default', options: ['default', 'cards', 'minimal', 'bordered'] },
      { name: 'columns', type: 'number', required: false, description: 'Number of columns', default: 4, options: ['2', '3', '4', '6'] },
      { name: 'size', type: 'string', required: false, description: 'Badge size', default: 'md', options: ['sm', 'md', 'lg'] },
      { name: 'showTitles', type: 'boolean', required: false, description: 'Show badge titles', default: true },
      { name: 'grayscale', type: 'boolean', required: false, description: 'Grayscale images', default: false },
    ],
  },
  {
    type: 'social-proof',
    name: 'Social Proof',
    description: 'Display social proof metrics, ratings, and live activity.',
    category: 'content',
    fields: [
      { name: 'title', type: 'string', required: false, description: 'Section title' },
      { name: 'subtitle', type: 'string', required: false, description: 'Section subtitle' },
      { name: 'items', type: 'array', required: true, description: 'Social proof items [{ type, label, value, rating, activity }]' },
      { name: 'variant', type: 'string', required: false, description: 'Display style', default: 'default', options: ['default', 'cards', 'minimal', 'banner', 'floating'] },
      { name: 'layout', type: 'string', required: false, description: 'Layout', default: 'horizontal', options: ['horizontal', 'vertical', 'grid'] },
      { name: 'size', type: 'string', required: false, description: 'Size', default: 'md', options: ['sm', 'md', 'lg'] },
      { name: 'columns', type: 'number', required: false, description: 'Number of columns in the grid layout', default: 4, options: ['2', '3', '4'] },
      { name: 'animated', type: 'boolean', required: false, description: 'Animate counters', default: true },
      { name: 'animationDuration', type: 'number', required: false, description: 'Counter animation length in ms', default: 2000 },
      { name: 'showIcons', type: 'boolean', required: false, description: "Show each item's icon", default: true },
      { name: 'showLiveIndicator', type: 'boolean', required: false, description: 'Show live indicator', default: false },
      { name: 'liveText', type: 'string', required: false, description: 'Label shown next to the live indicator', default: 'Live' },
    ],
  },
  {
    type: 'notification-toast',
    name: 'Notification Toast',
    description: 'Animated notification popups for social proof or alerts.',
    category: 'interactive',
    fields: [
      { name: 'notifications', type: 'array', required: true, description: 'Notification items [{ type, icon, title, message, image, timestamp, location }]' },
      { name: 'variant', type: 'string', required: false, description: 'Display style', default: 'default', options: ['default', 'minimal', 'card', 'bubble'] },
      { name: 'position', type: 'string', required: false, description: 'Screen position', default: 'bottom-left', options: ['bottom-left', 'bottom-right', 'top-left', 'top-right'] },
      // Seconds, not milliseconds: the renderer multiplies each of these by
      // 1000. The catalogue said ms with 5000/8000/3000 defaults, so an agent
      // following it would have asked for a toast that hangs for 83 minutes.
      { name: 'displayDuration', type: 'number', required: false, description: 'How long each notification stays on screen, in seconds', default: 5 },
      { name: 'delayBetween', type: 'number', required: false, description: 'Pause between notifications, in seconds', default: 8 },
      { name: 'initialDelay', type: 'number', required: false, description: 'Delay before the first notification, in seconds', default: 3 },
      { name: 'maxWidth', type: 'string', required: false, description: 'Max width', default: 'sm', options: ['sm', 'md', 'lg'] },
      { name: 'animationType', type: 'string', required: false, description: 'Animation type', default: 'slide', options: ['slide', 'fade', 'pop'] },
      { name: 'showCloseButton', type: 'boolean', required: false, description: 'Show the dismiss button; dismissing stops the whole sequence', default: true },
      { name: 'showImage', type: 'boolean', required: false, description: "Show each notification's image (falls back to its icon)", default: true },
      { name: 'showTimestamp', type: 'boolean', required: false, description: "Show each notification's timestamp line", default: true },
      { name: 'loop', type: 'boolean', required: false, description: 'Start over after the last notification instead of stopping', default: true },
    ],
  },
  {
    type: 'floating-cta',
    name: 'Floating CTA',
    description: 'Sticky call-to-action that appears on scroll.',
    category: 'interactive',
    fields: [
      // This list described a component that does not exist. FloatingCTABlock
      // destructures title / subtitle / showAfterScroll / showCloseButton /
      // animationType / showScrollTop / secondaryButtonText+Url — and reads
      // NONE of `text`, `secondaryText`, `scrollThreshold`, `closeable`. The
      // admin editor (FloatingCTABlockEditor) already writes the renderer's
      // names, so the catalogue was the lone outlier, and because the write
      // gate judges THIS list it had the sign flipped both ways: the two
      // templates authored against the renderer were reported as carrying dead
      // fields, while the two authored against this list stored a headline
      // (`text`) that nothing renders and were reported clean.
      { name: 'title', type: 'string', required: true, description: 'Headline — the CTA message. Rendered by the bar, card and minimal variants; the pill variant shows only the button.' },
      { name: 'subtitle', type: 'string', required: false, description: 'Supporting line under the title. Rendered by the bar and card variants only.' },
      { name: 'buttonText', type: 'string', required: true, description: 'Button label' },
      { name: 'buttonUrl', type: 'string', required: true, description: 'Button URL' },
      { name: 'secondaryButtonText', type: 'string', required: false, description: 'Optional second button label; renders only together with secondaryButtonUrl (bar and card variants)' },
      { name: 'secondaryButtonUrl', type: 'string', required: false, description: 'Optional second button URL; renders only together with secondaryButtonText' },
      { name: 'showAfterScroll', type: 'number', required: false, description: 'Reveal once this PERCENTAGE of the page has been scrolled, 0-100 (not pixels)', default: 25 },
      { name: 'hideOnScrollUp', type: 'boolean', required: false, description: 'Hide again while the visitor scrolls back up' },
      { name: 'variant', type: 'string', required: false, description: 'Display style. "pill" is button-only — do not put copy in title for it', default: 'bar', options: ['bar', 'card', 'minimal', 'pill'] },
      { name: 'position', type: 'string', required: false, description: 'Screen position; ignored by the "bar" variant, which always spans the bottom', default: 'bottom', options: ['bottom', 'bottom-left', 'bottom-right'] },
      { name: 'size', type: 'string', required: false, description: 'Size', default: 'md', options: ['sm', 'md', 'lg'] },
      { name: 'showCloseButton', type: 'boolean', required: false, description: 'Show the dismiss (X) control', default: true },
      { name: 'closePersistent', type: 'boolean', required: false, description: 'Remember the dismissal for the rest of the session', default: true },
      { name: 'showScrollTop', type: 'boolean', required: false, description: 'Add a back-to-top button beside the CTA (pill variant only)' },
      { name: 'animationType', type: 'string', required: false, description: 'Entrance animation', default: 'slide', options: ['slide', 'fade', 'scale'] },
    ],
  },
  {
    type: 'webinar',
    name: 'Webinar',
    description: 'Display upcoming and past webinars with registration and recording links.',
    category: 'interactive',
    fields: [
      { name: 'title', type: 'string', required: false, description: 'Section title' },
      { name: 'description', type: 'string', required: false, description: 'Section description' },
      { name: 'maxItems', type: 'number', required: false, description: 'Max webinars to show', default: 5 },
      { name: 'showPast', type: 'boolean', required: false, description: 'Show past webinars with recordings', default: true },
      { name: 'variant', type: 'string', required: false, description: 'Display style', default: 'default', options: ['default', 'card', 'minimal'] },
    ],
  },
  {
    type: 'bento-grid',
    name: 'Bento Grid',
    description: 'Responsive masonry-style card grid with variable-span items. Great for showcasing features, services, or highlights with a visually varied layout.',
    category: 'layout',
    fields: [
      { name: 'title', type: 'string', required: false, description: 'Section title' },
      { name: 'subtitle', type: 'string', required: false, description: 'Section subtitle' },
      { name: 'eyebrow', type: 'string', required: false, description: 'Small label displayed above the title' },
      { name: 'eyebrowColor', type: 'string', required: false, description: 'Eyebrow color as a CSS/hex value; defaults to brand primary' },
      { name: 'items', type: 'array', required: true, description: 'Grid items [{ id, title, description?, icon?, span?, accentColor?, linkUrl?, linkLabel? }]. span: "normal" | "wide" | "tall" | "large"' },
      { name: 'columns', type: 'number', required: false, description: 'Number of columns (3 or 4)', default: 3 },
      { name: 'gap', type: 'string', required: false, description: 'Gap between items', options: ['sm', 'md', 'lg'] },
      { name: 'variant', type: 'string', required: false, description: 'Visual style', options: ['default', 'glass', 'bordered'] },
      { name: 'staggeredReveal', type: 'boolean', required: false, description: 'Animate the cards in one by one as they enter the viewport', default: true },
    ],
  },
  {
    type: 'parallax-section',
    name: 'Parallax Section',
    description: 'Full-bleed section with a background image and slow-parallax scroll effect. Great for storytelling breakers between content sections.',
    category: 'layout',
    fields: [
      { name: 'title', type: 'string', required: false, description: 'Headline overlaid on the image' },
      { name: 'subtitle', type: 'string', required: false, description: 'Supporting text under the headline' },
      { name: 'backgroundImage', type: 'string', required: false, description: 'Background image URL' },
      { name: 'height', type: 'string', required: false, description: 'Section height', default: 'md', options: ['sm', 'md', 'lg', 'xl'] },
      { name: 'textColor', type: 'string', required: false, description: 'Text color scheme', default: 'light', options: ['light', 'dark'] },
      { name: 'overlayOpacity', type: 'number', required: false, description: 'Overlay opacity 0-100', default: 50 },
      { name: 'contentAlignment', type: 'string', required: false, description: 'Content alignment', default: 'center', options: ['left', 'center', 'right'] },
    ],
  },
  {
    type: 'section-divider',
    name: 'Section Divider',
    description: 'Decorative shape transition between two sections (wave, diagonal, curved, zigzag, triangle).',
    category: 'layout',
    fields: [
      { name: 'shape', type: 'string', required: true, description: 'Divider shape', default: 'wave', options: ['wave', 'diagonal', 'curved', 'zigzag', 'triangle'] },
      { name: 'color', type: 'string', required: false, description: 'Foreground color (CSS color)' },
      { name: 'bgColor', type: 'string', required: false, description: 'Background color (CSS color)' },
      { name: 'height', type: 'string', required: false, description: 'Divider height', default: 'md', options: ['sm', 'md', 'lg'] },
      { name: 'flip', type: 'boolean', required: false, description: 'Flip vertically', default: false },
      { name: 'invert', type: 'boolean', required: false, description: 'Invert colors', default: false },
    ],
  },
  {
    type: 'featured-carousel',
    name: 'Featured Carousel',
    description: 'Full-bleed image slideshow with title/description/CTA per slide. Ideal for hero rotations, campaigns, or featured collections.',
    category: 'media',
    fields: [
      { name: 'slides', type: 'array', required: true, description: 'Slides [{ id, title, subtitle?, description?, image, ctaLabel?, ctaUrl?, ctaVariant?, textPosition?, overlayOpacity? }]' },
      { name: 'autoPlay', type: 'boolean', required: false, description: 'Auto-advance slides', default: true },
      { name: 'interval', type: 'number', required: false, description: 'Milliseconds per slide', default: 5000 },
      { name: 'height', type: 'string', required: false, description: 'Carousel height', default: 'md', options: ['sm', 'md', 'lg', 'full'] },
      { name: 'showArrows', type: 'boolean', required: false, description: 'Show prev/next arrows', default: true },
      { name: 'showDots', type: 'boolean', required: false, description: 'Show pagination dots', default: true },
      { name: 'pauseOnHover', type: 'boolean', required: false, description: 'Pause auto-play on hover', default: true },
      { name: 'transition', type: 'string', required: false, description: 'Transition style', default: 'fade', options: ['fade', 'slide'] },
    ],
  },
  {
    type: 'sticky-scroll',
    name: 'Sticky Scroll Story',
    description: 'Two-column narrative layout: chapters scroll on one side while a sticky visual pins on the other. Great for product tours, case studies, and step-by-step storytelling.',
    category: 'layout',
    fields: [
      { name: 'title', type: 'string', required: false, description: 'Section title' },
      { name: 'subtitle', type: 'string', required: false, description: 'Section subtitle' },
      { name: 'eyebrow', type: 'string', required: false, description: 'Small label above the title' },
      { name: 'visualSide', type: 'string', required: false, description: 'Which side pins the sticky visual', default: 'right', options: ['left', 'right'] },
      { name: 'chapters', type: 'array', required: true, description: 'Chapters [{ id, title, body, eyebrow?, image?, videoUrl? }] — each chapter scrolls a new visual into the sticky pane' },
    ],
  },
  {
    type: 'ai-faq',
    name: 'AI FAQ',
    description: 'FAQ list with a semantic search box and an "Ask AI" button that answers via the assistant using site knowledge. Use for support hubs and product help pages.',
    category: 'interactive',
    fields: [
      { name: 'title', type: 'string', required: false, description: 'Section title' },
      { name: 'subtitle', type: 'string', required: false, description: 'Section subtitle' },
      { name: 'eyebrow', type: 'string', required: false, description: 'Small label above the title' },
      { name: 'items', type: 'array', required: true, description: 'FAQ items [{ id, question, answer }] — answer is plain text/markdown' },
      { name: 'searchPlaceholder', type: 'string', required: false, description: 'Search/ask input placeholder', default: 'Ask a question or search…' },
      { name: 'askAiLabel', type: 'string', required: false, description: 'Ask AI button label', default: 'Ask AI' },
      { name: 'emptyStateText', type: 'string', required: false, description: 'Text shown when no FAQ matches — invites the user to ask the AI' },
    ],
  },
  {
    type: 'pricing-calculator',
    name: 'Pricing Calculator',
    description: 'Interactive card with sliders that compute a live total based on variables (users, projects, storage, etc.). Use to give visitors an instant price estimate.',
    category: 'commerce',
    fields: [
      { name: 'title', type: 'string', required: false, description: 'Calculator title' },
      { name: 'subtitle', type: 'string', required: false, description: 'Calculator subtitle' },
      { name: 'eyebrow', type: 'string', required: false, description: 'Small label above the title' },
      { name: 'basePrice', type: 'number', required: false, description: 'Fixed base price added to the variable total', default: 0 },
      { name: 'currencySymbol', type: 'string', required: false, description: 'Currency symbol prefix', default: '$' },
      { name: 'billingLabel', type: 'string', required: false, description: 'Suffix after the total (e.g. "per month")', default: 'per month' },
      { name: 'variables', type: 'array', required: true, description: 'Sliders [{ id, label, unit, min, max, step, unitPrice, defaultValue }] — total = basePrice + Σ(value × unitPrice)' },
      { name: 'primaryButton', type: 'object', required: false, description: 'CTA button { text, url }' },
      { name: 'secondaryNote', type: 'string', required: false, description: 'Small print under the total' },
    ],
  },
  {
    type: 'quick-links',
    name: 'Quick Links',
    description: 'Prominent row of primary/secondary link buttons under a heading. Use for navigation hubs, "how can we help" bars, or top-of-page tasks.',
    category: 'layout',
    fields: [
      { name: 'heading', type: 'string', required: false, description: 'Heading shown next to the links' },
      { name: 'links', type: 'array', required: true, description: 'Links [{ id, label, url, variant?, icon? }] — variant: "primary" | "secondary"' },
      { name: 'variant', type: 'string', required: false, description: 'Background variant', default: 'muted', options: ['dark', 'primary', 'muted'] },
      { name: 'layout', type: 'string', required: false, description: 'Layout style', default: 'split', options: ['centered', 'split'] },
    ],
  },
  {
    type: 'chat-launcher',
    name: 'Chat Launcher',
    description: 'Chat input surface that opens the site AI assistant when the visitor submits a message. Use as an inline "ask us anything" section — NOT the floating widget.',
    category: 'interactive',
    fields: [
      { name: 'title', type: 'string', required: false, description: 'Title above the input', default: 'What can I help you with?' },
      { name: 'subtitle', type: 'string', required: false, description: 'Supporting text' },
      { name: 'placeholder', type: 'string', required: false, description: 'Input placeholder', default: 'Message AI Assistant...' },
      { name: 'showQuickActions', type: 'boolean', required: false, description: 'Show suggested prompt chips', default: true },
      { name: 'quickActionCount', type: 'number', required: false, description: 'How many suggestions', default: 4, options: ['2', '3', '4'] },
      { name: 'variant', type: 'string', required: false, description: 'Visual style', default: 'card', options: ['minimal', 'card', 'hero-integrated'] },
    ],
  },
  {
    type: 'ai-assistant',
    name: 'AI Assistant',
    description: 'Hero-scale AI assistant surface — a prominent search-style input with optional background image, badge, and suggested prompts. Use as the primary intent-capture section on landing pages.',
    category: 'interactive',
    fields: [
      { name: 'title', type: 'string', required: false, description: 'Headline above the input' },
      { name: 'subtitle', type: 'string', required: false, description: 'Supporting text' },
      { name: 'placeholder', type: 'string', required: false, description: 'Input placeholder' },
      { name: 'variant', type: 'string', required: false, description: 'Visual style', default: 'hero', options: ['hero', 'card', 'minimal', 'split'] },
      { name: 'backgroundImage', type: 'string', required: false, description: 'Background image URL (hero variant)' },
      { name: 'overlayOpacity', type: 'number', required: false, description: 'Overlay opacity 0-100', default: 50 },
      { name: 'suggestedPrompts', type: 'array', required: false, description: 'Array of prompt strings shown as suggestion chips' },
      { name: 'showBadge', type: 'boolean', required: false, description: 'Show badge (e.g. "AI-powered")' },
      { name: 'badgeText', type: 'string', required: false, description: 'Badge label' },
      { name: 'iconStyle', type: 'string', required: false, description: 'Input icon', default: 'sparkles', options: ['sparkles', 'shopping', 'search'] },
    ],
  },
  {
    type: 'consultant-matcher',
    name: 'Consultant Matcher',
    description: 'Natural-language search that matches visitor needs to consultant profiles from the Consultants module. Renders as a search field with AI-ranked matches.',
    category: 'interactive',
    fields: [
      { name: 'title', type: 'string', required: false, description: 'Section title', default: 'Find your consultant' },
      { name: 'subtitle', type: 'string', required: false, description: 'Section subtitle' },
      { name: 'placeholder', type: 'string', required: false, description: 'Search input placeholder' },
      { name: 'buttonText', type: 'string', required: false, description: 'Submit button label', default: 'Find match' },
    ],
  },
  // (featured-product was declared a second time here. Merged into the single
  // entry above — see the "one entry per type" note at the top of the array.)
  {
    type: 'products',
    name: 'Products',
    description: 'Grid or list of products from the Products module with add-to-cart buttons. Auto-filtered by type, category, etc.',
    category: 'commerce',
    fields: [
      { name: 'title', type: 'string', required: false, description: 'Section title' },
      { name: 'subtitle', type: 'string', required: false, description: 'Section subtitle' },
      { name: 'columns', type: 'number', required: false, description: 'Number of columns', default: 3, options: ['2', '3', '4'] },
      { name: 'productType', type: 'string', required: false, description: 'Filter by product type', default: 'all', options: ['all', 'one_time', 'recurring'] },
      { name: 'showDescription', type: 'boolean', required: false, description: 'Show product description', default: true },
      { name: 'showCategoryFilter', type: 'boolean', required: false, description: 'Render category filter chips', default: false },
      { name: 'showImages', type: 'boolean', required: false, description: 'Show product images', default: true },
      { name: 'buttonText', type: 'string', required: false, description: 'Button label', default: 'Add to cart' },
      { name: 'buttonStyle', type: 'string', required: false, description: 'Button style', default: 'default', options: ['default', 'outline', 'icon-only'] },
      { name: 'layout', type: 'string', required: false, description: 'Layout style', default: 'grid', options: ['grid', 'list'] },
      { name: 'linkToDetail', type: 'boolean', required: false, description: 'Link cards to product detail pages', default: true },
    ],
  },
  {
    type: 'cart',
    name: 'Cart',
    description: 'Shopping cart contents with quantity controls and a checkout button. Data comes from the Cart context — no config needed for cart items.',
    category: 'commerce',
    fields: [
      { name: 'title', type: 'string', required: false, description: 'Section title', default: 'Your Cart' },
      { name: 'emptyMessage', type: 'string', required: false, description: 'Text when the cart is empty' },
      { name: 'checkoutButtonText', type: 'string', required: false, description: 'Checkout button label', default: 'Go to checkout' },
      { name: 'checkoutUrl', type: 'string', required: false, description: 'Checkout URL', default: '/checkout' },
      { name: 'showContinueShopping', type: 'boolean', required: false, description: 'Show a continue-shopping link', default: true },
      { name: 'continueShoppingUrl', type: 'string', required: false, description: 'Continue-shopping URL', default: '/' },
      { name: 'variant', type: 'string', required: false, description: 'Visual style', default: 'default', options: ['default', 'compact', 'minimal'] },
    ],
  },
  {
    type: 'smart-booking',
    name: 'Smart Booking',
    description: 'Embedded booking flow that reads services and availability from the Booking module and lets visitors pick a service and time slot inline.',
    category: 'commerce',
    fields: [
      { name: 'title', type: 'string', required: false, description: 'Section title', default: 'Book an appointment' },
      { name: 'description', type: 'string', required: false, description: 'Section description' },
      { name: 'submitButtonText', type: 'string', required: false, description: 'Submit button label', default: 'Request appointment' },
      { name: 'successMessage', type: 'string', required: false, description: 'Message after successful booking' },
      { name: 'variant', type: 'string', required: false, description: 'Visual style', default: 'card', options: ['default', 'card', 'minimal'] },
      { name: 'showPhoneField', type: 'boolean', required: false, description: "Include phone field in the booking form", default: true },
      { name: 'triggerWebhook', type: 'boolean', required: false, description: "Fire the booking automation webhook on submit", default: false },
    ],
  },
  // (kb-featured, kb-hub and kb-search were each declared a second time here.
  // Merged into the single entries above — see the "one entry per type" note
  // at the top of the array.)
  {
    type: 'terms',
    name: 'Contract Terms',
    description: 'Published contract terms (Allmänna villkor, Tjänstevillkor) as an expandable list with per-document PDF copies. Sourced from contract templates marked public — place on any page to give agreements a stable terms URL. Set Terms page slug in Site Settings to the page holding this block.',
    category: 'content',
    fields: [
      { name: 'title', type: 'string', required: false, description: 'Section title' },
      { name: 'subtitle', type: 'string', required: false, description: 'Section subtitle' },
      { name: 'showPrint', type: 'boolean', required: false, description: 'Offer a print/PDF copy per document', default: true },
    ],
  },
  {
    type: 'kb-accordion',
    name: 'KB Accordion',
    description: 'KB articles rendered as a filterable accordion. Great for inline FAQs on product/service pages, sourced from the KB module.',
    category: 'content',
    fields: [
      { name: 'title', type: 'string', required: false, description: 'Section title' },
      { name: 'subtitle', type: 'string', required: false, description: 'Section subtitle' },
      { name: 'categorySlug', type: 'string', required: false, description: 'Filter to a single KB category slug' },
      { name: 'maxItems', type: 'number', required: false, description: 'Max articles to show', default: 10 },
      { name: 'showCategory', type: 'boolean', required: false, description: 'Show category label per item', default: false },
      { name: 'allowMultiple', type: 'boolean', required: false, description: 'Allow multiple items open at once', default: false },
      { name: 'defaultOpen', type: 'string', required: false, description: 'Which items open initially', default: 'none', options: ['none', 'first', 'all'] },
      { name: 'variant', type: 'string', required: false, description: 'Visual style', default: 'default', options: ['default', 'bordered', 'minimal'] },
    ],
  },
  {
    type: 'handbook',
    name: 'Handbook',
    description: 'Employee/company handbook layout with chapter navigation and optional search. Data-driven from the Handbook module.',
    category: 'content',
    fields: [
      { name: 'title', type: 'string', required: false, description: 'Section title' },
      { name: 'subtitle', type: 'string', required: false, description: 'Section subtitle' },
      { name: 'showSearch', type: 'boolean', required: false, description: 'Show search bar', default: true },
      { name: 'showToc', type: 'boolean', required: false, description: 'Show table of contents', default: true },
      { name: 'maxChapters', type: 'number', required: false, description: 'Max chapters to render' },
      { name: 'layout', type: 'string', required: false, description: 'Layout style', default: 'sidebar', options: ['sidebar', 'accordion'] },
    ],
  },
  {
    type: 'contact',
    name: 'Contact',
    description: 'Contact section with heading and a contact form or contact-info card. Use as a page-level contact section.',
    category: 'interactive',
    fields: [
      { name: 'title', type: 'string', required: false, description: "Section title" },
      { name: 'showForm', type: 'boolean', required: false, description: "Render the contact form alongside the details" },
      { name: 'phone', type: 'string', required: false, description: "Phone number; rendered as a tel: link" },
      { name: 'email', type: 'string', required: false, description: "Email address; rendered as a mailto: link" },
      { name: 'address', type: 'string', required: false, description: "Postal address; line breaks are preserved" },
      { name: 'hours', type: 'array', required: false, description: "Opening hours rows", itemFields: [{ name: 'day', type: 'string', required: true, description: 'Day or range, e.g. "Monday-Friday"' }, { name: 'time', type: 'string', required: true, description: 'Hours, e.g. "08:00-17:00"' }] },
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

/**
 * Get all block types that are suitable for AI import.
 * Excludes blocks that require dynamic data (products, cart, kb-*, etc.)
 */
export function getImportableBlockTypes(): string[] {
  const excluded = ['products', 'cart', 'featured-product', 'kb-featured', 'kb-hub', 'kb-search', 'kb-accordion', 'smart-booking', 'handbook', 'consultant-matcher'];
  return BLOCK_REFERENCE
    .filter(b => !excluded.includes(b.type))
    .map(b => b.type);
}

/**
 * Generate AI schema for page import.
 * This is used by the migrate-page edge function.
 */
export function generateAIBlockSchema(): string {
  const importableTypes = getImportableBlockTypes();
  const blocks = BLOCK_REFERENCE.filter(b => importableTypes.includes(b.type));
  
  let schema = 'Available CMS block types:\n\n';
  
  blocks.forEach((block, index) => {
    const requiredFields = block.fields.filter(f => f.required);
    const optionalFields = block.fields.filter(f => !f.required);
    
    schema += `${index + 1}. ${block.type} - ${block.name}\n`;
    schema += `   Description: ${block.description}\n`;
    
    // Build data structure hint
    const dataHints: string[] = [];
    requiredFields.forEach(f => {
      if (f.type === 'array') {
        dataHints.push(`${f.name}: [...] (required)`);
      } else {
        dataHints.push(`${f.name}: ${f.type} (required)`);
      }
    });
    optionalFields.slice(0, 3).forEach(f => {
      if (f.options) {
        dataHints.push(`${f.name}?: "${f.options.join('" | "')}"`);
      } else {
        dataHints.push(`${f.name}?: ${f.type}`);
      }
    });
    
    schema += `   Data: { ${dataHints.join(', ')} }\n\n`;
  });
  
  return schema;
}

/**
 * Get block type icons mapping for UI.
 */
export function getBlockTypeIcons(): Record<string, string> {
  const iconMap: Record<string, string> = {
    hero: 'Layout',
    text: 'Type',
    image: 'Image',
    'two-column': 'Layout',
    'article-grid': 'FileText',
    'latest-posts': 'Newspaper',
    'link-grid': 'Layout',
    accordion: 'FileText',
    cta: 'Sparkles',
    quote: 'Type',
    stats: 'FileText',
    contact: 'FileText',
    separator: 'Layout',
    youtube: 'FileText',
    gallery: 'Image',
    'info-box': 'AlertCircle',
    embed: 'Globe',
    testimonials: 'Type',
    team: 'FileText',
    features: 'Layout',
    pricing: 'FileText',
    logos: 'Image',
    map: 'Globe',
    form: 'FileText',
    chat: 'FileText',
    newsletter: 'FileText',
    booking: 'FileText',
    popup: 'Layout',
    comparison: 'FileText',
    products: 'FileText',
    cart: 'FileText',
    'announcement-bar': 'Layout',
    tabs: 'Layout',
    marquee: 'Layout',
    table: 'FileText',
    countdown: 'FileText',
    progress: 'FileText',
    badge: 'FileText',
    'social-proof': 'FileText',
    'notification-toast': 'FileText',
    'floating-cta': 'Layout',
    timeline: 'FileText',
    'kb-featured': 'FileText',
    'kb-hub': 'FileText',
    'kb-search': 'FileText',
    'kb-accordion': 'FileText',
    'terms': 'ScrollText',
    'smart-booking': 'FileText',
  };
  return iconMap;
}

/**
 * Get block type labels mapping for UI.
 */
export function getBlockTypeLabels(): Record<string, string> {
  const labels: Record<string, string> = {};
  BLOCK_REFERENCE.forEach(block => {
    labels[block.type] = block.name;
  });
  return labels;
}
