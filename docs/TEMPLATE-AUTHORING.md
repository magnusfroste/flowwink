# Template Authoring Guide

This guide helps content managers create new site templates for PezCMS. No TypeScript experience required - just follow the examples and patterns.

## Quick Start

1. **Copy the blank template** from `src/data/starter-templates.ts`
2. **Edit the basic info** (name, description, category)
3. **Add your pages** using the block reference below
4. **Test by importing** in Admin → Settings → Quick Start

## Template Structure

A template has this structure:

```typescript
const myTemplate: StarterTemplate = {
  // Basic Info
  id: 'my-template',           // Unique ID (lowercase, dashes)
  name: 'My Template',         // Display name
  description: 'A great site', // Short description
  category: 'startup',         // startup | enterprise | compliance | platform
  icon: 'Rocket',              // Lucide icon name
  tagline: 'Build fast',       // One-liner
  aiChatPosition: 'bottom-right',
  
  // Pages (required)
  pages: [...],
  
  // Optional content
  blogPosts: [...],
  kbCategories: [...],
  
  // Settings
  branding: {...},
  chatSettings: {...},
  footerSettings: {...},
  seoSettings: {...},
  cookieBannerSettings: {...},
  siteSettings: { homepageSlug: 'home' },
};
```

## Creating Pages

Each page needs:

```typescript
{
  title: 'About Us',
  slug: 'about',              // URL path (lowercase, dashes)
  isHomePage: false,          // Only one page should be true
  menu_order: 2,              // Order in navigation
  showInMenu: true,           // Show in nav bar
  meta: {
    description: 'Learn about our company',
    showTitle: false,         // Hide page title
    titleAlignment: 'center', // left | center
  },
  blocks: [...]               // Content blocks
}
```

## Content Blocks

### Using Helper Functions (Recommended)

Import helpers for easier content creation:

```typescript
import { text, heading, paragraph, bulletList } from '@/lib/template-helpers';

// Simple text block
{
  id: 'text-1',
  type: 'text',
  data: {
    content: text('Hello world! This is a paragraph.'),
  },
}

// With heading
{
  id: 'text-2',
  type: 'text',
  data: {
    content: heading('Our Mission', 
      'We believe in making the web better.',
      'Every day, we work to simplify complexity.'
    ),
  },
}

// Bullet list
{
  id: 'text-3',
  type: 'text',
  data: {
    content: bulletList(
      'Fast deployment',
      'Easy to use',
      'Scalable'
    ),
  },
}
```

### Block Reference

#### Hero Block
Large banner section at top of page.

```typescript
{
  id: 'hero-1',
  type: 'hero',
  data: {
    title: 'Welcome',                    // Required
    subtitle: 'Your tagline here',       // Optional
    backgroundType: 'color',             // color | image | video
    imageSrc: 'https://...',            // For image background
    videoUrl: 'https://...',            // For video background
    heightMode: 'viewport',              // viewport | 60vh | auto
    contentAlignment: 'center',          // left | center
    overlayOpacity: 70,                  // 0-100
    titleAnimation: 'slide-up',          // none | fade-in | slide-up
    showScrollIndicator: true,           // Show down arrow
    primaryButton: { text: 'Get Started', url: '/contact' },
    secondaryButton: { text: 'Learn More', url: '/about' },
  },
}
```

#### Text Block
Rich text content.

```typescript
{
  id: 'text-1',
  type: 'text',
  data: {
    content: text('Your content here...'),
    alignment: 'left',   // left | center | right
    maxWidth: 'prose',   // prose | full
  },
}
```

#### Two-Column Block
Text with image side by side.

```typescript
{
  id: 'two-col-1',
  type: 'two-column',
  data: {
    content: heading('Feature Title', 'Description paragraph...'),
    imageSrc: 'https://...',
    imageAlt: 'Description for accessibility',
    imagePosition: 'right',  // left | right
  },
}
```

#### Features Block
Grid of feature cards.

```typescript
{
  id: 'features-1',
  type: 'features',
  data: {
    title: 'Our Features',
    subtitle: 'What makes us different',
    columns: 3,                // 2 | 3 | 4
    layout: 'grid',           // grid | list
    variant: 'cards',         // cards | minimal | centered
    iconStyle: 'circle',      // circle | square | none
    features: [
      { 
        id: 'f1',
        icon: 'Zap',          // Lucide icon name
        title: 'Fast',
        description: 'Lightning quick performance.',
      },
      // ... more features
    ],
  },
}
```

#### Stats Block
Key numbers and metrics.

```typescript
{
  id: 'stats-1',
  type: 'stats',
  data: {
    title: 'By the Numbers',
    stats: [
      { value: '10K+', label: 'Users', icon: 'Users' },
      { value: '99.9%', label: 'Uptime', icon: 'Shield' },
      { value: '24/7', label: 'Support', icon: 'Headphones' },
    ],
  },
}
```

#### CTA Block
Call-to-action section.

```typescript
{
  id: 'cta-1',
  type: 'cta',
  data: {
    title: 'Ready to Start?',
    subtitle: 'Join thousands of happy customers.',
    buttonText: 'Get Started',
    buttonUrl: '/contact',
    gradient: true,          // Use gradient background
  },
}
```

#### Testimonials Block
Customer quotes.

```typescript
{
  id: 'testimonials-1',
  type: 'testimonials',
  data: {
    title: 'What Customers Say',
    layout: 'carousel',      // carousel | grid
    columns: 3,
    showRating: true,
    showAvatar: false,
    variant: 'cards',        // cards | minimal | bubbles
    autoplay: true,
    autoplaySpeed: 5,        // seconds
    testimonials: [
      {
        id: 't1',
        content: 'Amazing product! Highly recommended.',
        author: 'Jane Doe',
        role: 'CEO',
        company: 'TechCorp',
        rating: 5,
        avatar: 'https://...',  // optional
      },
      // ... more testimonials
    ],
  },
}
```

#### Pricing Block
Pricing tiers.

```typescript
{
  id: 'pricing-1',
  type: 'pricing',
  data: {
    columns: 3,
    variant: 'cards',
    tiers: [
      {
        id: 'free',
        name: 'Free',
        price: '$0',
        period: '/month',
        description: 'For individuals',
        features: ['Feature 1', 'Feature 2'],
        buttonText: 'Get Started',
        buttonUrl: '/signup',
      },
      {
        id: 'pro',
        name: 'Pro',
        price: '$29',
        period: '/month',
        description: 'For teams',
        features: ['Everything in Free', 'Pro feature 1'],
        buttonText: 'Start Trial',
        buttonUrl: '/signup',
        highlighted: true,    // Highlight this tier
        badge: 'Popular',     // Optional badge
      },
    ],
  },
}
```

#### Accordion Block
FAQ or expandable sections.

```typescript
{
  id: 'accordion-1',
  type: 'accordion',
  data: {
    title: 'FAQ',
    items: [
      {
        question: 'How do I get started?',
        answer: text('Simply sign up and follow the wizard.'),
      },
      {
        question: 'Is there a free trial?',
        answer: text('Yes, we offer a 14-day free trial.'),
      },
    ],
  },
}
```

#### Form Block
Contact or signup form.

```typescript
{
  id: 'form-1',
  type: 'form',
  data: {
    title: 'Contact Us',
    submitButtonText: 'Send Message',
    successMessage: 'Thanks! We\'ll be in touch.',
    fields: [
      { id: 'name', type: 'text', label: 'Name', required: true },
      { id: 'email', type: 'email', label: 'Email', required: true },
      { id: 'message', type: 'textarea', label: 'Message', required: true },
    ],
  },
}
```

#### Logos Block
Partner/client logos.

```typescript
{
  id: 'logos-1',
  type: 'logos',
  data: {
    title: 'Trusted By',
    columns: 5,
    layout: 'grid',           // grid | carousel
    variant: 'grayscale',     // grayscale | color
    logoSize: 'md',           // sm | md | lg
    logos: [
      { id: 'l1', name: 'Company', logo: 'https://...' },
      // ... more logos
    ],
  },
}
```

#### Team Block
Team member grid.

```typescript
{
  id: 'team-1',
  type: 'team',
  data: {
    title: 'Our Team',
    columns: 4,
    variant: 'cards',
    showRole: true,
    showBio: true,
    members: [
      {
        id: 'm1',
        name: 'Jane Doe',
        role: 'CEO',
        bio: 'Founder with 20 years experience.',
        image: 'https://...',
        linkedin: 'https://linkedin.com/in/...',
      },
      // ... more members
    ],
  },
}
```

#### Image Block
Single image with caption.

```typescript
{
  id: 'image-1',
  type: 'image',
  data: {
    src: 'https://...',
    alt: 'Description for accessibility',
    caption: 'Optional caption text',
    aspectRatio: '16:9',     // 16:9 | 4:3 | 1:1 | auto
    size: 'large',           // small | medium | large | full
  },
}
```

#### Gallery Block
Image gallery grid.

```typescript
{
  id: 'gallery-1',
  type: 'gallery',
  data: {
    title: 'Our Work',
    columns: 3,
    gap: 'md',
    images: [
      { id: 'g1', src: 'https://...', alt: 'Image 1', caption: 'Optional' },
      // ... more images
    ],
  },
}
```

#### Timeline Block
Step-by-step or chronological.

```typescript
{
  id: 'timeline-1',
  type: 'timeline',
  data: {
    title: 'How It Works',
    variant: 'horizontal',   // horizontal | vertical | alternating
    showDates: true,
    steps: [
      { id: 's1', icon: 'Download', title: 'Sign Up', description: 'Create account.', date: 'Step 1' },
      { id: 's2', icon: 'Settings', title: 'Configure', description: 'Set up workspace.', date: 'Step 2' },
      { id: 's3', icon: 'Rocket', title: 'Launch', description: 'Go live!', date: 'Step 3' },
    ],
  },
}
```

#### Quote Block
Highlighted quote.

```typescript
{
  id: 'quote-1',
  type: 'quote',
  data: {
    quote: 'The best way to predict the future is to create it.',
    author: 'Peter Drucker',
    role: 'Management Consultant',
    variant: 'large',        // simple | large | card
  },
}
```

#### Separator Block
Visual divider.

```typescript
{
  id: 'separator-1',
  type: 'separator',
  data: {
    style: 'line',           // line | dots | gradient | none
    spacing: 'md',           // sm | md | lg
  },
}
```

#### Chat Block
Embedded AI chat.

```typescript
{
  id: 'chat-1',
  type: 'chat',
  data: {
    title: 'Ask AI',
    height: 'md',            // sm | md | lg
    variant: 'card',         // embedded | card | floating
    showSidebar: false,
    initialPrompt: 'Hi! How can I help?',
  },
}
```

#### Map Block
Google Maps embed.

```typescript
{
  id: 'map-1',
  type: 'map',
  data: {
    address: '1 Infinite Loop, Cupertino, CA',
    zoom: 15,
    height: 400,
    showMarker: true,
  },
}
```

## Settings

### Branding

```typescript
branding: {
  siteName: 'My Site',
  tagline: 'Building the future',
  logo: 'https://...',           // URL or leave empty
  logoHeight: 40,
  primaryColor: '#3B82F6',
  primaryColorDark: '#60A5FA',
  fontHeadings: 'Inter',
  fontBody: 'Inter',
  borderRadius: 'md',            // none | sm | md | lg | full
  buttonStyle: 'solid',          // solid | outline | ghost
  favicon: 'https://...',
}
```

### Chat Settings

```typescript
chatSettings: {
  enabled: true,
  widgetPosition: 'bottom-right',
  welcomeMessage: 'Hi! How can I help?',
  placeholder: 'Type your message...',
  systemPrompt: 'You are a helpful assistant for [Company]...',
  suggestedQuestions: ['What do you offer?', 'How does pricing work?'],
  collectEmailAfterMessages: 3,
  emailRequired: false,
}
```

### Footer Settings

```typescript
footerSettings: {
  companyName: 'My Company',
  tagline: 'Building great products',
  columns: [
    {
      id: 'col1',
      title: 'Product',
      links: [
        { label: 'Features', url: '/product' },
        { label: 'Pricing', url: '/pricing' },
      ],
    },
    // ... more columns
  ],
  showSocial: true,
  socialLinks: {
    twitter: 'https://twitter.com/...',
    linkedin: 'https://linkedin.com/company/...',
    github: 'https://github.com/...',
  },
  showNewsletter: true,
  newsletterTitle: 'Stay Updated',
  legalLinks: [
    { label: 'Privacy', url: '/privacy' },
    { label: 'Terms', url: '/terms' },
  ],
}
```

### SEO Settings

```typescript
seoSettings: {
  defaultTitle: 'My Site',
  titleSuffix: ' | My Site',
  defaultDescription: 'We build great products.',
  ogImage: 'https://...',
  twitterHandle: '@mysite',
}
```

## Blog Posts

```typescript
blogPosts: [
  {
    title: 'Getting Started Guide',
    slug: 'getting-started',
    excerpt: 'Learn how to set up your first project...',
    featured_image: 'https://...',
    featured_image_alt: 'Screenshot of dashboard',
    is_featured: true,
    meta: { description: 'A complete guide to getting started.' },
    content: [
      {
        id: 'text-1',
        type: 'text',
        data: {
          content: heading('Introduction', 
            'Welcome to our platform...',
            'In this guide, you\'ll learn...'
          ),
        },
      },
      // ... more blocks
    ],
  },
],
```

## Knowledge Base

```typescript
kbCategories: [
  {
    id: 'getting-started',
    name: 'Getting Started',
    slug: 'getting-started',
    description: 'First steps with our platform',
    icon: 'Rocket',
    sort_order: 1,
    articles: [
      {
        title: 'Quick Start',
        slug: 'quick-start',
        question: 'How do I get started?',
        answer_text: 'Create an account and follow the wizard...',
        is_featured: true,
        include_in_chat: true,
      },
      // ... more articles
    ],
  },
],
```

## Tips & Best Practices

### Content Guidelines
- **Keep text concise** - Web readers scan, so use short paragraphs
- **Use headings** - Break content into scannable sections  
- **Add images** - Visual content increases engagement
- **Include CTAs** - Guide users to take action

### Block Ordering
A typical page structure:
1. Hero (main banner)
2. Stats or Logos (social proof)
3. Features (what you offer)
4. Two-Column sections (detailed explanations)
5. Testimonials (customer proof)
6. CTA (call to action)

### Image Guidelines
- Use high-quality images (1200px+ width)
- Optimize for web (< 500KB per image)
- Always include alt text for accessibility
- Use consistent aspect ratios

### Available Icons
Icons use [Lucide](https://lucide.dev/icons) names. Popular ones:
- Navigation: `Home`, `Menu`, `ChevronRight`, `ArrowRight`
- Actions: `Download`, `Upload`, `Send`, `Search`
- Objects: `Rocket`, `Shield`, `Zap`, `Star`
- People: `Users`, `User`, `Building`
- Tech: `Code`, `Database`, `Cloud`, `Server`

## Troubleshooting

### Common Errors

**"Invalid block type"**
→ Check that `type` matches a valid block name from the reference above.

**"Missing required field"**  
→ Ensure all required fields are present. Use the validator to check.

**"Content not rendering"**
→ Rich text must be in Tiptap format. Use `text()` helper instead of plain strings.

**"Images not showing"**
→ Check that image URLs are valid and accessible (not blocked by CORS).

## Getting Help

- Check existing templates for examples
- Use the template validator to catch errors
- Ask in the community Discord

---

*Last updated: 2025*
