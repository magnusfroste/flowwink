/**
 * Digital Shop Template - Premium E-commerce
 * 
 * Editorial-first e-commerce template inspired by Shopify Impulse theme.
 * Conversational commerce with AI shopping assistant, story-driven product 
 * showcases, bento grid categories, and social proof throughout.
 */
import type { StarterTemplate, TemplatePage, TemplateProduct } from './types';
import { digitalShopBlogPosts } from '@/data/template-blog-posts';

// ═══════════════════════════════════════════════
// PAGES
// ═══════════════════════════════════════════════

const digitalShopPages: TemplatePage[] = [
  // ─────────────────────────────────
  // HOME
  // ─────────────────────────────────
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
      // 1 ── Marquee: urgency + energy ──
      {
        id: 'marquee-promo',
        type: 'marquee',
        data: {
          text: 'SUMMER SALE: 30% OFF EVERYTHING  •  FREE INSTANT DELIVERY  •  LIFETIME UPDATES  •  10,000+ HAPPY CREATORS  •  30-DAY MONEY BACK',
          speed: 'medium',
          direction: 'left',
          variant: 'default',
          pauseOnHover: true,
        },
      },

      // 2 ── Hero: full-bleed editorial ──
      {
        id: 'hero-editorial',
        type: 'hero',
        data: {
          title: 'Curate Your\nDigital Workspace',
          subtitle: 'Premium templates, courses, and tools — crafted for creators who ship fast and look great doing it.',
          backgroundType: 'image',
          backgroundImage: 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=1920&q=80',
          heightMode: '70vh',
          contentAlignment: 'center',
          overlayOpacity: 50,
          titleAnimation: 'slide-up',
          primaryButton: { text: 'Shop Collection', url: '#products-bestsellers' },
          secondaryButton: { text: 'Ask AI Assistant', url: '#ai-assistant-hero' },
        },
        spacing: { marginBottom: 'lg' },
      },

      // 3 ── Stats: instant social proof ──
      {
        id: 'stats-social-proof',
        type: 'stats',
        data: {
          title: '',
          items: [
            { id: 's1', value: '10,000+', label: 'Creators Served' },
            { id: 's2', value: '50+', label: 'Premium Products' },
            { id: 's3', value: '4.9★', label: 'Average Rating' },
            { id: 's4', value: '<5min', label: 'Avg. Delivery Time' },
          ],
          columns: 4,
          variant: 'minimal',
        },
      },

      // 4 ── AI Shopping Assistant: conversational commerce ──
      {
        id: 'ai-assistant-hero',
        type: 'ai-assistant',
        data: {
          title: 'What are you building?',
          subtitle: 'Our AI knows every product — describe your project and get personalized recommendations.',
          placeholder: 'I need a pitch deck template for my SaaS startup...',
          variant: 'card',
          iconStyle: 'search',
          showBadge: true,
          badgeText: 'AI-Powered Shopping',
          suggestedPrompts: [
            'Best template for a startup?',
            'Compare your design kits',
            'What\'s included in Pro?',
            'Recommend for beginners',
          ],
        },
      },

      // 5 ── Section divider ──
      {
        id: 'divider-hero-products',
        type: 'section-divider',
        data: { shape: 'wave', height: 'sm' },
      },

      // 6 ── Two-column: featured product editorial ──
      {
        id: 'editorial-hero-product',
        type: 'two-column',
        data: {
          eyebrow: 'Editor\'s Pick',
          title: 'The Creator Toolkit',
          accentText: 'Everything you need to launch — in one pack.',
          content: {
            type: 'doc',
            content: [
              { type: 'paragraph', content: [{ type: 'text', text: '50+ professionally designed templates for presentations, pitch decks, and brand assets. Built with modern design principles and used by teams at fast-growing startups worldwide.' }] },
              { type: 'bulletList', content: [
                { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: '50+ ready-to-use templates' }] }] },
                { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Figma, Keynote & PowerPoint' }] }] },
                { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Free lifetime updates' }] }] },
              ] },
            ],
          },
          image: 'https://images.unsplash.com/photo-1586281380349-632531db7ed4?w=800&q=80',
          imageAlt: 'Creator Toolkit — 50+ premium templates',
          imageSide: 'left',
          imageAspectRatio: '4:5',
          imageObjectFit: 'cover',
          imageRounded: 'xl',
          primaryButton: { text: 'View Product — $49', url: '/products' },
          verticalAlignment: 'center',
        },
      },

      // 7 ── Products grid: bestsellers ──
      {
        id: 'products-bestsellers',
        type: 'products',
        data: {
          title: 'Shop Bestsellers',
          subtitle: 'Our most loved products — trusted by thousands of creators',
          productType: 'all',
          columns: 3,
          showFilters: false,
          showSearch: false,
          variant: 'cards',
        },
      },

      // 8 ── Parallax: lifestyle break ──
      {
        id: 'parallax-lifestyle',
        type: 'parallax-section',
        data: {
          backgroundImage: 'https://images.unsplash.com/photo-1497366216548-37526070297c?w=1920&q=80',
          title: 'Built for Creators Who Ship Fast',
          subtitle: 'Stop designing from scratch. Start with premium foundations and launch in hours, not weeks.',
          height: 'md',
          overlayOpacity: 55,
          contentAlignment: 'center',
          primaryButton: { text: 'Browse All Products', url: '#products-bestsellers' },
        },
      },

      // 9 ── Bento grid: category showcase ──
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
              description: 'Professional pitch decks, brand kits, and social media packs used by 10,000+ creators. Download once, use forever.',
              image: 'https://images.unsplash.com/photo-1586281380349-632531db7ed4?w=800&q=80',
              colSpan: 2,
              rowSpan: 2,
              ctaText: 'Browse Templates',
              ctaUrl: '#products-bestsellers',
            },
            {
              id: 'bento-courses',
              title: 'Online Courses',
              description: '40+ expert-led lessons taught by industry practitioners. Learn at your pace, apply immediately.',
              image: 'https://images.unsplash.com/photo-1552664730-d307ca884978?w=600&q=80',
              colSpan: 1,
              rowSpan: 1,
              ctaText: 'Start Learning',
              ctaUrl: '#products-bestsellers',
            },
            {
              id: 'bento-tools',
              title: 'Design Systems',
              description: 'Production-ready UI kits, icon packs, and component libraries for Figma and code. Ship faster, stay consistent.',
              image: 'https://images.unsplash.com/photo-1561070791-2526d30994b5?w=600&q=80',
              colSpan: 1,
              rowSpan: 1,
              ctaText: 'Explore Tools',
              ctaUrl: '#products-bestsellers',
            },
          ],
          columns: 3,
          gap: 'md',
          variant: 'glass',
        },
      },

      // 10 ── Testimonials ──
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

      // 11 ── Two-column: membership upsell ──
      {
        id: 'editorial-membership',
        type: 'two-column',
        data: {
          eyebrow: 'Pro Membership',
          title: 'Unlock Everything',
          accentText: '$29/month — full catalog access. Cancel anytime.',
          content: {
            type: 'doc',
            content: [
              { type: 'paragraph', content: [{ type: 'text', text: 'Get instant access to our entire catalog with a Pro Membership. New products added weekly, priority support, exclusive member-only releases, and early access to everything we create.' }] },
              { type: 'bulletList', content: [
                { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Access all 50+ products instantly' }] }] },
                { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'New releases every week' }] }] },
                { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Priority support & member exclusives' }] }] },
              ] },
            ],
          },
          image: 'https://images.unsplash.com/photo-1553729459-efe14ef6055d?w=800&q=80',
          imageAlt: 'Pro Membership — unlock everything',
          imageSide: 'right',
          imageAspectRatio: '4:5',
          imageObjectFit: 'cover',
          imageRounded: 'xl',
          primaryButton: { text: 'Start Pro — $29/mo', url: '/products' },
          verticalAlignment: 'center',
        },
      },

      // 12 ── AI Assistant: mid-page conversational ──
      {
        id: 'ai-assistant-midpage',
        type: 'ai-assistant',
        data: {
          title: 'Still not sure?',
          subtitle: 'Describe your project and our AI will find the perfect product match.',
          placeholder: 'I\'m building a SaaS dashboard and need...',
          variant: 'minimal',
          iconStyle: 'shopping',
          showBadge: false,
          suggestedPrompts: [
            'I need a UI kit for a SaaS app',
            'What course is best for marketing?',
            'Compare Creator Toolkit vs Design System Pro',
          ],
        },
      },

      // 13 ── Social proof: real-time activity ──
      {
        id: 'social-proof-activity',
        type: 'social-proof',
        data: {
          title: '',
          items: [
            { id: 'sp1', type: 'counter', icon: 'users', label: 'Happy Customers', value: '10K', suffix: '+' },
            { id: 'sp2', type: 'rating', icon: 'star', label: 'Average Rating', value: '4.9', maxRating: 5, rating: 4.9 },
            { id: 'sp3', type: 'activity', icon: 'eye', label: 'Recent Activity', text: '47 purchases in the last hour' },
          ],
          variant: 'minimal',
          layout: 'horizontal',
          size: 'sm',
          animated: true,
        },
      },

      // 14 ── Trust badges ──
      {
        id: 'trust-bar',
        type: 'badge',
        data: {
          title: 'Shop with Confidence',
          badges: [
            { id: 'tb1', title: 'Instant Delivery', icon: 'star' },
            { id: 'tb2', title: 'Stripe Verified', icon: 'shield' },
            { id: 'tb3', title: '30-Day Guarantee', icon: 'award' },
            { id: 'tb4', title: 'Lifetime Updates', icon: 'check' },
            { id: 'tb5', title: 'Commercial License', icon: 'trophy' },
          ],
          variant: 'minimal',
          columns: 5,
          size: 'sm',
          showTitles: true,
          grayscale: false,
        },
      },

      // 15 ── Newsletter ──
      {
        id: 'newsletter-signup',
        type: 'form',
        data: {
          title: 'Join 10,000+ Creators',
          subtitle: 'Get early access to new products, exclusive discounts, and weekly design inspiration. No spam, ever.',
          fields: [
            { id: 'email', type: 'email', label: 'Email', placeholder: 'you@example.com', required: true, width: 'full' },
          ],
          submitButtonText: 'Subscribe — It\'s Free',
          successMessage: 'Welcome aboard! Check your inbox for a special welcome gift.',
          variant: 'card',
        },
      },

      // 16 ── Blog ──
      {
        id: 'article-grid-blog',
        type: 'article-grid',
        data: {
          title: 'From the Blog',
          subtitle: 'Tips, strategies, and behind-the-scenes for digital creators',
          columns: 3,
          limit: 3,
          showExcerpt: true,
          showImage: true,
        },
      },

      // 17 ── FAQ ──
      {
        id: 'faq-shop',
        type: 'accordion',
        data: {
          title: 'Questions & Answers',
          items: [
            { question: 'How does instant delivery work?', answer: 'After purchase, you\'ll receive download links and access instructions via email immediately. No waiting, no shipping — everything is digital and instant.' },
            { question: 'What payment methods do you accept?', answer: 'We accept Visa, Mastercard, and American Express via Stripe. All payments are secure, encrypted, and PCI compliant.' },
            { question: 'Do you offer refunds?', answer: 'Yes — 30-day money-back guarantee, no questions asked. Just email us and we\'ll process your refund within 24 hours.' },
            { question: 'Can I use products commercially?', answer: 'Absolutely. Every product includes a commercial license. Use them in client projects, sell websites built with them, or use them in your business.' },
            { question: 'What\'s included with Pro Membership?', answer: 'Full access to every product in our catalog (50+), new weekly releases, priority support, member-only exclusives, and early access to upcoming products. Cancel anytime.' },
            { question: 'How do lifetime updates work?', answer: 'When we improve a product, you get the updated version for free — forever. No extra cost, no re-purchase needed.' },
          ],
          variant: 'default',
        },
      },

      // 18 ── Final CTA ──
      {
        id: 'cta-final',
        type: 'cta',
        data: {
          title: 'Ready to Ship Faster?',
          subtitle: 'Join thousands of creators who build better products with our premium digital tools.',
          buttonText: 'Browse Collection',
          buttonUrl: '#products-bestsellers',
          gradient: true,
        },
      },

      // 19 ── Social proof toast (background) ──
      {
        id: 'notification-purchases',
        type: 'notification-toast',
        data: {
          notifications: [
            { id: 'n1', type: 'purchase', title: 'New Purchase', message: 'Sarah from NYC just bought Creator Toolkit' },
            { id: 'n2', type: 'purchase', title: 'New Purchase', message: 'James from London bought Design System Pro' },
            { id: 'n3', type: 'purchase', title: 'New Purchase', message: 'Emma from Sydney joined Pro Membership' },
            { id: 'n4', type: 'signup', title: 'New Member', message: 'A new Pro Member just joined from Berlin' },
            { id: 'n5', type: 'purchase', title: 'New Purchase', message: 'Alex from Toronto bought Growth Masterclass' },
          ],
          variant: 'default',
          position: 'bottom-left',
          displayDuration: 4000,
          delayBetween: 15000,
          initialDelay: 8000,
          animationType: 'slide',
        },
      },

      // 20 ── Floating CTA: persistent cart ──
      {
        id: 'floating-cart',
        type: 'floating-cta',
        data: {
          text: 'View Cart',
          url: '/cart',
          icon: 'shopping-cart',
          position: 'bottom-right',
          variant: 'pill',
          showOnScroll: true,
          scrollThreshold: 400,
        },
      },
    ],
  },

  // ─────────────────────────────────
  // CART
  // ─────────────────────────────────
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

  // ─────────────────────────────────
  // ABOUT
  // ─────────────────────────────────
  {
    title: 'About',
    slug: 'about',
    menu_order: 3,
    showInMenu: true,
    meta: {
      description: 'Our story, mission, and values — learn what drives us',
      showTitle: false,
      titleAlignment: 'center',
    },
    blocks: [
      {
        id: 'hero-about',
        type: 'hero',
        data: {
          title: 'Built by Creators,\nfor Creators',
          subtitle: 'We believe digital tools should be beautiful, accessible, and empowering.',
          backgroundType: 'image',
          backgroundImage: 'https://images.unsplash.com/photo-1522071820081-009f0129c71c?w=1920&q=80',
          heightMode: '50vh',
          contentAlignment: 'center',
          overlayOpacity: 55,
        },
      },
      {
        id: 'about-story',
        type: 'two-column',
        data: {
          eyebrow: 'Our Story',
          title: 'From Side Project to 10,000+ Customers',
          content: {
            type: 'doc',
            content: [
              { type: 'paragraph', content: [{ type: 'text', text: 'We started as a small team of designers and developers frustrated with the quality of digital products on the market. Every template felt generic. Every course felt outdated. So we decided to build something better.' }] },
              { type: 'paragraph', content: [{ type: 'text', text: 'Today, we serve over 10,000 creators worldwide — from solo freelancers to fast-growing startups. Every product is crafted with obsessive attention to detail, tested thoroughly, and supported by our dedicated team.' }] },
            ],
          },
          image: 'https://images.unsplash.com/photo-1552664730-d307ca884978?w=800&q=80',
          imageAlt: 'Our team collaborating',
          imageSide: 'right',
          imageAspectRatio: '3:2',
          imageObjectFit: 'cover',
          imageRounded: 'xl',
          verticalAlignment: 'center',
        },
      },
      {
        id: 'about-values',
        type: 'features',
        data: {
          title: 'What We Stand For',
          features: [
            { id: 'v1', icon: 'Sparkles', title: 'Quality Over Quantity', description: 'We\'d rather have 50 exceptional products than 500 mediocre ones.' },
            { id: 'v2', icon: 'Zap', title: 'Instant Everything', description: 'No waiting. Digital delivery means you get access the moment you buy.' },
            { id: 'v3', icon: 'Heart', title: 'Creator-First', description: 'Everything we build is designed by creators, for creators.' },
            { id: 'v4', icon: 'Shield', title: 'No Risk', description: '30-day money-back guarantee on everything. Your satisfaction is non-negotiable.' },
          ],
          columns: 4,
          layout: 'grid',
          variant: 'minimal',
          iconStyle: 'circle',
        },
      },
      {
        id: 'about-stats',
        type: 'stats',
        data: {
          title: 'By the Numbers',
          items: [
            { id: 'as1', value: '10,000+', label: 'Customers Worldwide' },
            { id: 'as2', value: '50+', label: 'Premium Products' },
            { id: 'as3', value: '4.9/5', label: 'Average Rating' },
            { id: 'as4', value: '98%', label: 'Satisfaction Rate' },
          ],
          columns: 4,
          variant: 'default',
        },
      },
    ],
  },

  // ─────────────────────────────────
  // CONTACT
  // ─────────────────────────────────
  {
    title: 'Contact',
    slug: 'contact',
    menu_order: 4,
    showInMenu: true,
    meta: {
      description: 'Get in touch with our team — we typically respond within 24 hours',
      showTitle: true,
      titleAlignment: 'center',
    },
    blocks: [
      {
        id: 'contact-ai',
        type: 'ai-assistant',
        data: {
          title: 'Quick Answers',
          subtitle: 'Ask our AI assistant before sending a message — it can help with most questions instantly.',
          placeholder: 'How do refunds work?',
          variant: 'minimal',
          iconStyle: 'sparkles',
          showBadge: false,
          suggestedPrompts: [
            'How does delivery work?',
            'Do you offer refunds?',
            'Can I use products commercially?',
          ],
        },
      },
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

// ═══════════════════════════════════════════════
// PRODUCTS
// ═══════════════════════════════════════════════

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
    name: 'Social Media Pack',
    description: '200+ Instagram, LinkedIn, and Twitter templates. Consistent branding across every platform.',
    price_cents: 3900,
    currency: 'USD',
    type: 'one_time',
    image_url: 'https://images.unsplash.com/photo-1611162617474-5b21e879e113?w=400&h=300&fit=crop',
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

// ═══════════════════════════════════════════════
// TEMPLATE EXPORT
// ═══════════════════════════════════════════════

export const digitalShopTemplate: StarterTemplate = {
  id: 'digital-shop',
  name: 'Digital Shop',
  description: 'Premium e-commerce template with AI shopping assistant, editorial product showcases, bento grid categories, and Stripe checkout.',
  category: 'platform',
  icon: 'ShoppingBag',
  tagline: 'Premium digital product store with AI concierge',
  aiChatPosition: 'Widget for customer support',
  helpStyle: 'none',
  pages: digitalShopPages,
  requiredModules: ['products', 'orders', 'chat', 'forms', 'blog'],
  blogPosts: digitalShopBlogPosts,
  products: digitalShopProducts,
  branding: {
    logo: '',
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
    welcomeMessage: 'Hi! I\'m your personal shopping assistant. I know every product in our catalog — what are you looking for?',
    systemPrompt: 'You are a knowledgeable shopping concierge for a premium digital product store. You know every product intimately. Help users find the perfect product by understanding their needs. Be conversational, specific with product recommendations, and mention prices. Suggest the Pro Membership when appropriate. Keep answers concise but helpful.',
    suggestedPrompts: [
      'What do you recommend for beginners?',
      'Tell me about Pro Membership',
      'I need templates for a startup',
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
      { goal: 'Drive product sales through content marketing and AI recommendations', success_criteria: { monthly_orders: 10 }, constraints: { promote_own_products: true } },
      { goal: 'Write product-focused blog posts to improve SEO', success_criteria: { published_posts: 8 } },
      { goal: 'Increase Pro Membership conversions via personalized chat interactions', success_criteria: { monthly_subscriptions: 5 } },
    ],
    prioritySkills: ['write_blog_post', 'lookup_order', 'analyze_analytics', 'add_lead'],
    soul: {
      purpose: 'I help this digital shop grow revenue by creating product content, providing personalized shopping assistance, tracking orders, and engaging customers through conversational commerce.',
      tone: 'Friendly, knowledgeable, conversion-focused. Like a trusted friend who happens to know everything about design tools.',
    },
  },
  siteSettings: {
    homepageSlug: 'home',
  },
};
