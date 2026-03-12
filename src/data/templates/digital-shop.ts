/**
 * Digital Shop Template - Premium E-commerce
 * 
 * Editorial-first e-commerce template inspired by Shopify Impulse theme.
 * Features story-driven layout, bento grid categories, and premium branding.
 */
import type { StarterTemplate, TemplatePage, TemplateProduct } from './types';
import { digitalShopBlogPosts } from '@/data/template-blog-posts';

const digitalShopPages: TemplatePage[] = [
  {
    title: 'Home',
    slug: 'home',
    isHomePage: true,
    menu_order: 1,
    showInMenu: true,
    meta: {
      description: 'Curated digital products for modern creators. Templates, courses, and tools — instant delivery.',
      showTitle: false,
      titleAlignment: 'center',
    },
    blocks: [
      // ── Marquee: energy + urgency ──
      {
        id: 'marquee-promo',
        type: 'marquee',
        data: {
          text: 'LIMITED TIME: 20% OFF ALL TEMPLATES  •  FREE INSTANT DELIVERY  •  LIFETIME UPDATES INCLUDED  •  JOIN 10,000+ CREATORS',
          speed: 'medium',
          direction: 'left',
          variant: 'default',
          pauseOnHover: true,
        },
      },

      // ── Hero: full-bleed, minimal, editorial ──
      {
        id: 'hero-editorial',
        type: 'hero',
        data: {
          title: 'Curate Your Digital Workspace',
          subtitle: 'Premium templates, courses, and tools — crafted for creators who ship.',
          backgroundType: 'image',
          backgroundImage: 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=1920&q=80',
          heightMode: '80vh',
          contentAlignment: 'center',
          overlayOpacity: 45,
          titleAnimation: 'slide-up',
          primaryButton: { text: 'Shop Collection', url: '#products' },
        },
      },

      // ── Trust bar: immediate confidence ──
      {
        id: 'trust-bar',
        type: 'badge',
        data: {
          title: '',
          badges: [
            { id: 'tb1', title: 'Instant Delivery', icon: 'star' },
            { id: 'tb2', title: 'Secure Checkout', icon: 'shield' },
            { id: 'tb3', title: '30-Day Guarantee', icon: 'award' },
            { id: 'tb4', title: 'Lifetime Updates', icon: 'check' },
          ],
          variant: 'minimal',
          columns: 4,
          size: 'sm',
          showTitles: true,
          grayscale: false,
        },
      },

      // ── Two-column: hero product editorial ──
      {
        id: 'editorial-hero-product',
        type: 'two-column',
        data: {
          eyebrow: 'Featured',
          title: 'The Creator Toolkit',
          accentText: 'Everything you need to launch.',
          content: {
            type: 'doc',
            content: [
              { type: 'paragraph', content: [{ type: 'text', text: '50+ professionally designed templates for presentations, pitch decks, and brand assets. Built with modern design principles — ready to customize and ship.' }] },
            ],
          },
          image: 'https://images.unsplash.com/photo-1586281380349-632531db7ed4?w=800&q=80',
          imageAlt: 'Creator Toolkit product showcase',
          imageSide: 'left',
          imageAspectRatio: '4:5',
          imageObjectFit: 'cover',
          imageRounded: 'xl',
          primaryButton: { text: 'View Product — $49', url: '/products' },
          verticalAlignment: 'center',
        },
      },

      // ── Divider ──
      {
        id: 'divider-1',
        type: 'section-divider',
        data: {
          shape: 'wave',
          height: 'sm',
        },
      },

      // ── Products grid: bestsellers ──
      {
        id: 'products-bestsellers',
        type: 'products',
        data: {
          title: 'Shop Bestsellers',
          subtitle: 'Our most popular products, loved by thousands of creators',
          productType: 'all',
          columns: 3,
          showFilters: false,
          showSearch: false,
          variant: 'cards',
        },
      },

      // ── Parallax: lifestyle break ──
      {
        id: 'parallax-lifestyle',
        type: 'parallax-section',
        data: {
          backgroundImage: 'https://images.unsplash.com/photo-1497366216548-37526070297c?w=1920&q=80',
          title: 'Built for Creators Who Ship Fast',
          subtitle: 'Stop designing from scratch. Start with premium foundations.',
          height: 'md',
          overlayOpacity: 50,
          contentAlignment: 'center',
          primaryButton: { text: 'Browse All Products', url: '#products' },
        },
      },

      // ── Bento grid: category showcase ──
      {
        id: 'bento-categories',
        type: 'bento-grid',
        data: {
          title: 'Shop by Category',
          subtitle: 'Find exactly what you need',
          items: [
            {
              id: 'bento-templates',
              title: 'Templates',
              description: 'Pitch decks, brand kits, and more',
              image: 'https://images.unsplash.com/photo-1586281380349-632531db7ed4?w=800&q=80',
              colSpan: 2,
              rowSpan: 2,
              ctaText: 'Browse',
              ctaUrl: '#products',
            },
            {
              id: 'bento-courses',
              title: 'Courses',
              description: '40+ video lessons from experts',
              image: 'https://images.unsplash.com/photo-1552664730-d307ca884978?w=600&q=80',
              colSpan: 1,
              rowSpan: 1,
              ctaText: 'Learn',
              ctaUrl: '#products',
            },
            {
              id: 'bento-tools',
              title: 'Design Tools',
              description: 'UI kits, icons, and systems',
              image: 'https://images.unsplash.com/photo-1561070791-2526d30994b5?w=600&q=80',
              colSpan: 1,
              rowSpan: 1,
              ctaText: 'Explore',
              ctaUrl: '#products',
            },
          ],
          columns: 3,
          gap: 'md',
          variant: 'glass',
        },
      },

      // ── Testimonials ──
      {
        id: 'testimonials-social',
        type: 'testimonials',
        data: {
          title: 'Loved by 10,000+ Creators',
          testimonials: [
            { id: 't1', content: 'These templates saved me weeks of work. The quality is on another level — I use them for every client project now.', author: 'Sarah Johnson', role: 'Freelance Designer', rating: 5 },
            { id: 't2', content: 'Instant delivery and lifetime updates? This is how every digital product should work. Absolutely worth it.', author: 'Michael Chen', role: 'Startup Founder', rating: 5 },
            { id: 't3', content: 'The Growth Masterclass completely transformed my marketing strategy. Revenue up 3x in two months.', author: 'Emma Davis', role: 'Creator & Coach', rating: 5 },
          ],
          layout: 'grid',
          columns: 3,
          showRating: true,
          showAvatar: false,
          variant: 'cards',
        },
      },

      // ── Two-column: membership upsell ──
      {
        id: 'editorial-membership',
        type: 'two-column',
        data: {
          eyebrow: 'Membership',
          title: 'Go Pro',
          accentText: '$29/month — access everything.',
          content: {
            type: 'doc',
            content: [
              { type: 'paragraph', content: [{ type: 'text', text: 'Unlock our entire catalog with a Pro Membership. New products added weekly, priority support, and exclusive member-only releases. Cancel anytime.' }] },
            ],
          },
          image: 'https://images.unsplash.com/photo-1553729459-efe14ef6055d?w=800&q=80',
          imageAlt: 'Pro Membership showcase',
          imageSide: 'right',
          imageAspectRatio: '4:5',
          imageObjectFit: 'cover',
          imageRounded: 'xl',
          primaryButton: { text: 'Start Pro Membership', url: '/products' },
          verticalAlignment: 'center',
        },
      },

      // ── Newsletter ──
      {
        id: 'newsletter-signup',
        type: 'form',
        data: {
          title: 'Join 10,000+ Creators',
          subtitle: 'Get early access to new products, exclusive discounts, and weekly design inspiration.',
          fields: [
            { id: 'email', type: 'email', label: 'Email', placeholder: 'you@example.com', required: true, width: 'full' },
          ],
          submitButtonText: 'Subscribe',
          successMessage: 'Welcome aboard! Check your inbox for a special welcome gift.',
          variant: 'card',
        },
      },

      // ── Blog ──
      {
        id: 'article-grid-blog',
        type: 'article-grid',
        data: {
          title: 'From the Blog',
          subtitle: 'Tips and strategies for digital creators',
          columns: 3,
          limit: 3,
          showExcerpt: true,
          showImage: true,
        },
      },

      // ── FAQ ──
      {
        id: 'faq-shop',
        type: 'accordion',
        data: {
          title: 'Questions & Answers',
          items: [
            { question: 'How does instant delivery work?', answer: 'After purchase, you\'ll receive download links and access instructions via email immediately. No waiting required.' },
            { question: 'What payment methods do you accept?', answer: 'We accept Visa, Mastercard, and American Express via Stripe. All payments are secure and encrypted.' },
            { question: 'Do you offer refunds?', answer: 'Yes — 30-day money-back guarantee, no questions asked. Just email us.' },
            { question: 'Can I use products commercially?', answer: 'Absolutely. All products include a commercial license for client work and personal projects.' },
            { question: 'What\'s included with Pro Membership?', answer: 'Full access to every product in our catalog, new weekly releases, priority support, and member-only exclusives. Cancel anytime.' },
          ],
          variant: 'default',
        },
      },

      // ── Social proof toast ──
      {
        id: 'notification-purchases',
        type: 'notification-toast',
        data: {
          notifications: [
            { id: 'n1', type: 'purchase', title: 'New Purchase', message: 'Sarah from NYC just bought Creator Toolkit' },
            { id: 'n2', type: 'purchase', title: 'New Purchase', message: 'James from London bought Design System Pro' },
            { id: 'n3', type: 'purchase', title: 'New Purchase', message: 'Emma from Sydney joined Pro Membership' },
            { id: 'n4', type: 'signup', title: 'New Member', message: 'A new Pro Member just joined from Berlin' },
          ],
          variant: 'default',
          position: 'bottom-left',
          displayDuration: 4000,
          delayBetween: 12000,
          initialDelay: 6000,
          animationType: 'slide',
        },
      },
    ],
  },
  {
    title: 'Shopping Cart',
    slug: 'cart',
    menu_order: 2,
    showInMenu: false,
    meta: {
      description: 'Review your cart and proceed to checkout',
      showTitle: true,
      titleAlignment: 'center',
    },
    blocks: [
      {
        id: 'cart-block',
        type: 'cart',
        data: {
          title: 'Your Cart',
          emptyMessage: 'Your cart is empty. Browse our collection to get started!',
          checkoutButtonText: 'Proceed to Checkout',
          continueShoppingText: 'Continue Shopping',
          continueShoppingUrl: '/',
        },
      },
    ],
  },
  {
    title: 'About',
    slug: 'about',
    menu_order: 3,
    showInMenu: true,
    meta: {
      description: 'Our story and mission',
      showTitle: true,
      titleAlignment: 'center',
    },
    blocks: [
      {
        id: 'text-about',
        type: 'text',
        data: {
          content: {
            type: 'doc',
            content: [
              { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Our Story' }] },
              { type: 'paragraph', content: [{ type: 'text', text: 'We create premium digital products that help creators and entrepreneurs build better businesses. Every product is crafted with care, tested thoroughly, and supported by our team.' }] },
              { type: 'heading', attrs: { level: 3 }, content: [{ type: 'text', text: 'Our Mission' }] },
              { type: 'paragraph', content: [{ type: 'text', text: 'To provide high-quality digital products that save time, increase productivity, and help our customers succeed.' }] },
            ],
          },
        },
      },
    ],
  },
  {
    title: 'Contact',
    slug: 'contact',
    menu_order: 4,
    showInMenu: true,
    meta: {
      description: 'Get in touch with our team',
      showTitle: true,
      titleAlignment: 'center',
    },
    blocks: [
      {
        id: 'form-contact',
        type: 'form',
        data: {
          title: 'Send us a Message',
          fields: [
            { id: 'name', type: 'text', label: 'Name', placeholder: 'Your name', required: true, width: 'half' },
            { id: 'email', type: 'email', label: 'Email', placeholder: 'you@example.com', required: true, width: 'half' },
            { id: 'subject', type: 'text', label: 'Subject', placeholder: 'What is this about?', required: true, width: 'full' },
            { id: 'message', type: 'textarea', label: 'Message', placeholder: 'Your message...', required: true, width: 'full' },
          ],
          submitButtonText: 'Send Message',
          successMessage: 'Thanks for reaching out! We\'ll get back to you within 24 hours.',
          variant: 'card',
        },
      },
      {
        id: 'contact-info',
        type: 'contact',
        data: {
          title: 'Other Ways to Reach Us',
          email: 'hello@digitalshop.com',
          phone: '+1 (555) 123-4567',
          hours: [
            { day: 'Monday - Friday', time: '9:00 AM - 6:00 PM EST' },
            { day: 'Saturday - Sunday', time: 'Email support only' },
          ],
        },
      },
    ],
  },
];

const digitalShopProducts: TemplateProduct[] = [
  {
    name: 'Creator Toolkit',
    description: '50+ professionally designed templates for presentations, pitch decks, and brand assets. Ready to customize and ship.',
    price_cents: 4900,
    currency: 'USD',
    type: 'one_time',
    image_url: 'https://images.unsplash.com/photo-1586281380349-632531db7ed4?w=400&h=300&fit=crop',
    is_active: true,
  },
  {
    name: 'Design System Pro',
    description: 'Complete UI kit with 500+ components for web and mobile. Figma & Sketch included. Built for modern teams.',
    price_cents: 7900,
    currency: 'USD',
    type: 'one_time',
    image_url: 'https://images.unsplash.com/photo-1561070791-2526d30994b5?w=400&h=300&fit=crop',
    is_active: true,
  },
  {
    name: 'Growth Masterclass',
    description: '40+ video lessons on SEO, paid ads, and social media. Learn the strategies behind 7-figure creator businesses.',
    price_cents: 19900,
    currency: 'USD',
    type: 'one_time',
    image_url: 'https://images.unsplash.com/photo-1552664730-d307ca884978?w=400&h=300&fit=crop',
    is_active: true,
  },
  {
    name: 'Pro Membership',
    description: 'Access every product in our catalog. New releases weekly, priority support, and member-only exclusives.',
    price_cents: 2900,
    currency: 'USD',
    type: 'recurring',
    image_url: 'https://images.unsplash.com/photo-1553729459-efe14ef6055d?w=400&h=300&fit=crop',
    is_active: true,
  },
];

export const digitalShopTemplate: StarterTemplate = {
  id: 'digital-shop',
  name: 'Digital Shop',
  description: 'Premium e-commerce template for digital products. Editorial-first layout with story-driven product showcases, bento grid categories, and Stripe checkout.',
  category: 'platform',
  icon: 'ShoppingBag',
  tagline: 'Premium digital product store',
  aiChatPosition: 'Widget for customer support',
  helpStyle: 'none',
  pages: digitalShopPages,
  requiredModules: ['products', 'orders', 'chat', 'forms', 'blog'],
  blogPosts: digitalShopBlogPosts,
  products: digitalShopProducts,
  branding: {
    organizationName: 'Digital Shop',
    brandTagline: 'Curated Digital Products',
    primaryColor: '220 50% 20%',
    accentColor: '40 90% 55%',
    headingFont: 'Playfair Display',
    bodyFont: 'Inter',
    borderRadius: 'lg',
    shadowIntensity: 'medium',
  },
  chatSettings: {
    enabled: true,
    aiProvider: 'openai',
    landingPageEnabled: false,
    widgetEnabled: true,
    widgetPosition: 'bottom-right',
    welcomeMessage: 'Hi! Looking for the perfect product? I can help you find it.',
    systemPrompt: 'You are a helpful sales assistant for a premium digital product store. Help users find products, answer questions about purchases, and provide support. Be friendly, concise, and helpful.',
    suggestedPrompts: [
      'What do you recommend for beginners?',
      'Tell me about Pro Membership',
      'How does delivery work?',
    ],
    includeContentAsContext: true,
    includedPageSlugs: ['*'],
    includeKbArticles: false,
    contentContextMaxTokens: 30000,
    showContextIndicator: false,
  },
  headerSettings: {
    variant: 'sticky',
    stickyHeader: true,
    backgroundStyle: 'blur',
    headerShadow: 'sm',
    showBorder: false,
  },
  footerSettings: {
    variant: 'full',
    email: 'hello@digitalshop.com',
    phone: '+1 (555) 123-4567',
    showHours: true,
    weekdayHours: 'Mon-Fri 9-18 EST',
    weekendHours: 'Email only',
    showQuickLinks: true,
    showContact: true,
    legalLinks: [
      { id: 'privacy', label: 'Privacy Policy', url: '/privacy-policy', enabled: true },
      { id: 'terms', label: 'Terms of Service', url: '/terms-of-service', enabled: true },
      { id: 'refunds', label: 'Refund Policy', url: '/refund-policy', enabled: true },
    ],
  },
  seoSettings: {
    siteTitle: 'Digital Shop',
    titleTemplate: '%s | Digital Shop',
    defaultDescription: 'Curated digital products for modern creators. Templates, courses, and tools — instant delivery, lifetime access.',
    robotsIndex: true,
    robotsFollow: true,
  },
  aeoSettings: {
    enabled: true,
    organizationName: 'Digital Shop',
    shortDescription: 'Curated digital products for modern creators. Instant delivery, lifetime access.',
    schemaOrgEnabled: true,
    schemaOrgType: 'Organization',
    faqSchemaEnabled: true,
    articleSchemaEnabled: true,
    sitemapEnabled: true,
    llmsTxtEnabled: true,
    llmsFullTxtEnabled: true,
  },
  cookieBannerSettings: {
    enabled: true,
  },
  flowpilot: {
    objectives: [
      { goal: 'Drive product sales through content marketing', success_criteria: { monthly_orders: 10 }, constraints: { promote_own_products: true } },
      { goal: 'Write product-focused blog posts to improve SEO', success_criteria: { published_posts: 8 } },
    ],
    prioritySkills: ['write_blog_post', 'lookup_order', 'analyze_analytics', 'add_lead'],
    soul: {
      purpose: 'I help this digital shop grow revenue by creating product content, tracking orders, and engaging customers.',
      tone: 'Friendly, conversion-focused. Clear product communication.',
    },
  },
  siteSettings: {
    homepageSlug: 'home',
  },
};
