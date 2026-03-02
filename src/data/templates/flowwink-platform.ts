/**
 * FlowWink Platform Template
 * 
 * Complete SaaS landing page template showcasing all CMS features.
 * Built for platform businesses with pricing, comparisons, and feature highlights.
 * 
 * This is the "dogfooding" template - FlowWink built with FlowWink.
 */
import type { StarterTemplate } from './types';
import { flowwinkBlogPosts } from '../template-blog-posts';
import { flowwinkKbCategories } from '../template-kb-articles';

export const flowwinkPlatformTemplate: StarterTemplate = {
  id: 'flowwink-platform',
  name: 'FlowWink Platform',
  description: 'Complete SaaS landing page template showcasing all CMS features. Built for platform businesses with pricing, comparisons, and feature highlights.',
  category: 'platform',
  icon: 'Blocks',
  tagline: 'The ultimate dogfood - built with FlowWink, for FlowWink',
  aiChatPosition: 'Embedded assistant for product questions',
  blogPosts: flowwinkBlogPosts,
  kbCategories: flowwinkKbCategories,
  requiredModules: ['blog', 'knowledgeBase', 'chat', 'liveSupport', 'newsletter', 'leads', 'deals', 'companies', 'forms', 'products', 'orders', 'bookings', 'analytics', 'contentApi', 'webinars'],
  pages: [
    // ===== HOME PAGE =====
    {
      title: 'Home',
      slug: 'home',
      isHomePage: true,
      menu_order: 1,
      showInMenu: true,
      meta: {
        description: 'Keep Your Head While Going Headless - The complete CMS that gives you a beautiful website AND a powerful API',
        showTitle: false,
        titleAlignment: 'center',
      },
      blocks: [
        // ANNOUNCEMENT BAR - Top banner for new features
        {
          id: 'announcement-flowwink-loop',
          type: 'announcement-bar',
          data: {
            message: '🔄 New: Flowwink Loop - Automatic Lead Enrichment & AI Qualification',
            linkText: 'Learn more',
            linkUrl: '/features',
            variant: 'gradient',
            dismissable: true,
            sticky: false,
          },
        },
        // HERO - Main value proposition
        {
          id: 'hero-main',
          type: 'hero',
          data: {
            title: 'Keep Your Head While Going Headless',
            subtitle: 'The complete CMS that gives you a beautiful website AND a powerful API. No compromises. No complexity. Just results.',
            backgroundType: 'video',
            videoUrl: 'https://cdn.prod.website-files.com/673761996d53e695f4ec8cb6%2F67b84e27497ac9c515a29519_wassching%20opening-transcode.mp4',
            heightMode: 'viewport',
            contentAlignment: 'center',
            overlayOpacity: 50,
            titleAnimation: 'slide-up',
            showScrollIndicator: true,
            primaryButton: { text: 'Try the Demo', url: '/demo' },
            secondaryButton: { text: 'Self-Host Free', url: 'https://github.com/flowwink/flowwink' },
          },
        },
        // AI CHAT - Primary USP, right after hero
        {
          id: 'chat-hero-usp',
          type: 'chat-launcher',
          data: {
            title: 'AI That Actually Knows Your Content',
            subtitle: 'Unlike generic chatbots, our AI reads every page, blog post, and KB article on your site. Try it — ask anything about FlowWink.',
            placeholder: 'Ask about features, pricing, self-hosting...',
            showQuickActions: true,
            quickActionCount: 4,
            variant: 'hero-integrated',
          },
        },
        // SECTION DIVIDER - Visual transition from hero to content
        {
          id: 'divider-hero-stats',
          type: 'section-divider',
          data: {
            shape: 'wave',
            height: 'md',
          },
        },
        // STATS - Key numbers upfront
        {
          id: 'stats-hero',
          type: 'stats',
          data: {
            items: [
              { id: 's1', value: '47+', label: 'Block Types' },
              { id: 's2', value: '16', label: 'Built-in Modules' },
              { id: 's3', value: '5', label: 'AI Providers' },
              { id: 's4', value: '∞', label: 'Self-Host Free' },
            ],
            columns: 4,
            variant: 'minimal',
          },
        },
        // TIMELINE - How it Works (NEW)
        {
          id: 'timeline-how',
          type: 'timeline',
          data: {
            title: 'How It Works',
            subtitle: 'From zero to published in three steps.',
            items: [
              {
                id: 'hw-1',
                title: 'Deploy',
                description: 'Self-host with Docker in 5 minutes, or use our managed cloud. No credit card required.',
                icon: 'Rocket',
              },
              {
                id: 'hw-2',
                title: 'Create',
                description: 'Use the visual editor to build pages with 47+ blocks. No coding needed.',
                icon: 'Blocks',
              },
              {
                id: 'hw-3',
                title: 'Publish',
                description: 'Go live instantly or schedule for later. Use the API to power any frontend.',
                icon: 'Globe',
              },
            ],
            layout: 'horizontal',
          },
        },
        // FEATURES - Three pillars (Head + FlowWink + Headless)
        {
          id: 'features-pillars',
          type: 'features',
          data: {
            title: 'Best of Both Worlds',
            features: [
              {
                id: 'pillar-head',
                icon: 'Monitor',
                title: 'HEAD',
                description: 'Built-in website with visual editor, responsive design, and beautiful templates. No coding required.',
              },
              {
                id: 'pillar-core',
                icon: 'Blocks',
                title: 'FLOWWINK',
                description: 'Single source of truth for all your content. Structured data, version control, and collaboration tools.',
              },
              {
                id: 'pillar-headless',
                icon: 'Code',
                title: 'HEADLESS',
                description: 'Powerful REST API for any frontend. React, Vue, mobile apps - deliver content anywhere.',
              },
            ],
            columns: 3,
            layout: 'grid',
            variant: 'centered',
            iconStyle: 'circle',
          },
        },
        // BENTO GRID - Core modules showcase (replaces flat features grid)
        {
          id: 'bento-modules',
          type: 'bento-grid',
          data: {
            title: 'Everything You Need',
            subtitle: 'A complete content platform with built-in modules that just work.',
            eyebrow: 'PLATFORM',
            columns: 3,
            variant: 'default',
            gap: 'md',
            staggeredReveal: true,
            items: [
              { id: 'bg-cms', title: 'Visual Page Builder', description: '47+ drag-and-drop blocks. Build any layout without touching code.', icon: 'Layout', span: 'wide', accentColor: '#3B82F6' },
              { id: 'bg-chat', title: 'AI Chat Widget', description: 'Content-aware AI that reads your pages and KB to answer visitor questions 24/7. Private LLM support.', icon: 'MessageCircle', span: 'large', accentColor: '#8B5CF6' },
              { id: 'bg-blog', title: 'Blog & Newsletter', description: 'Full blog with categories, tags, and built-in email campaigns with GDPR compliance.', icon: 'FileText', accentColor: '#F59E0B' },
              { id: 'bg-crm', title: 'CRM & Leads', description: 'Lead capture, deal pipeline, company tracking, and AI qualification.', icon: 'Users', accentColor: '#10B981' },
              { id: 'bg-ecommerce', title: 'E-commerce', description: 'Products, orders, and Stripe checkout. Sell subscriptions or one-time purchases.', icon: 'ShoppingCart', accentColor: '#EC4899' },
              { id: 'bg-kb', title: 'Knowledge Base', description: 'Hierarchical FAQ with full-text search and chat integration.', icon: 'Library', span: 'wide', accentColor: '#06B6D4' },
            ],
          },
        },
        // SECTION DIVIDER - Transition to pillars
        {
          id: 'divider-before-pillars',
          type: 'section-divider',
          data: {
            shape: 'curved',
            height: 'sm',
          },
        },
        // PARALLAX SECTION - Platform vision
        {
          id: 'parallax-vision',
          type: 'parallax-section',
          data: {
            backgroundImage: 'https://images.unsplash.com/photo-1451187580459-43490279c0fa?w=1920',
            title: 'Head + FlowWink + Headless',
            subtitle: 'Beautiful website included. Powerful API built in. No compromises.',
            height: 'md',
            textColor: 'light',
            overlayOpacity: 60,
            contentAlignment: 'center',
          },
        },
        // FEATURES - AI-First Platform
        {
          id: 'features-ai',
          type: 'features',
          data: {
            title: 'AI-First Platform',
            subtitle: 'Leverage AI throughout your content workflow - with full control over your data.',
            features: [
              {
                id: 'ai-chat',
                icon: 'MessageSquare',
                title: 'AI Chat Assistant',
                description: 'Embed an AI chatbot on your site that knows your content. Answer questions 24/7.',
              },
              {
                id: 'ai-aeo',
                icon: 'Brain',
                title: 'AEO Analyzer',
                description: 'Analyze your content for AI Engine Optimization. Improve how AI systems understand and cite your site.',
              },
              {
                id: 'ai-brand',
                icon: 'Palette',
                title: 'Brand Guide AI',
                description: 'AI analyzes your website and generates complete branding guidelines with colors, fonts, and tone.',
              },
              {
                id: 'ai-private',
                icon: 'Shield',
                title: 'Private LLM Support',
                description: 'Connect your own local LLM for complete data sovereignty. Your data never leaves your infrastructure.',
              },
              {
                id: 'ai-content',
                icon: 'Sparkles',
                title: 'AI Content Tools',
                description: 'Generate, improve, and translate content with AI. Maintain your brand voice automatically.',
              },
              {
                id: 'ai-migration',
                icon: 'ArrowRightLeft',
                title: 'AI Migration',
                description: 'Migrate from WordPress, Webflow, or any site. AI converts your content to structured blocks.',
              },
            ],
            columns: 3,
            layout: 'grid',
            variant: 'minimal',
            iconStyle: 'circle',
          },
        },
        // TESTIMONIALS - Social proof with metrics
        {
          id: 'testimonials-main',
          type: 'testimonials',
          data: {
            title: 'Real Results from Real Teams',
            testimonials: [
              {
                id: 'test-1',
                content: 'Reduced support tickets by 40% after adding the AI chat widget. It answers questions 24/7 using our actual content.',
                author: 'Emma Lindqvist',
                role: 'CTO',
                company: 'TechStart AB',
                rating: 5,
              },
              {
                id: 'test-2',
                content: 'Migrated 200 pages from WordPress in 3 hours using AI import. The headless API powers our mobile app with the same content.',
                author: 'Marcus Andersson',
                role: 'Product Lead',
                company: 'DigitalFlow',
                rating: 5,
              },
              {
                id: 'test-3',
                content: 'Saved €3,600/year compared to Contentful. Self-hosting with private LLM keeps patient data in our infrastructure.',
                author: 'Dr. Sofia Berg',
                role: 'Medical Director',
                company: 'HealthTech Nordic',
                rating: 5,
              },
            ],
            layout: 'carousel',
            columns: 3,
            showRating: true,
            showAvatar: false,
            variant: 'cards',
            autoplay: true,
            autoplaySpeed: 5,
          },
        },
        // SOCIAL PROOF - Live metrics
        {
          id: 'social-proof-live',
          type: 'social-proof',
          data: {
            title: 'Trusted by Growing Teams',
            subtitle: 'Join hundreds of organizations using FlowWink to power their digital presence.',
            items: [
              { id: 'sp1', type: 'counter', label: 'Sites Running', value: 1200, icon: 'globe' },
              { id: 'sp2', type: 'rating', label: 'Average Rating', value: 4.9, maxRating: 5 },
              { id: 'sp3', type: 'counter', label: 'Pages Published', value: 28500, icon: 'file' },
              { id: 'sp4', type: 'counter', label: 'GitHub Stars', value: 1450, icon: 'star' },
            ],
            variant: 'cards',
            layout: 'horizontal',
            size: 'lg',
            animated: true,
            showLiveIndicator: true,
          },
        },
        // COMPARISON - How we compare
        {
          id: 'comparison-competitors',
          type: 'comparison',
          data: {
            title: 'How We Compare',
            subtitle: 'See why teams choose FlowWink over traditional solutions.',
            products: [
              { id: 'pez', name: 'FlowWink', highlighted: true },
              { id: 'webflow', name: 'Webflow' },
              { id: 'contentful', name: 'Contentful' },
              { id: 'wordpress', name: 'WordPress' },
            ],
            features: [
              { id: 'f1', name: 'Visual Builder', values: [true, true, false, true] },
              { id: 'f2', name: 'Headless API', values: [true, false, true, false] },
              { id: 'f3', name: 'AI Chat Assistant', values: [true, false, false, false] },
              { id: 'f4', name: 'AEO Analyzer', values: [true, false, false, false] },
              { id: 'f5', name: 'Brand Guide AI', values: [true, false, false, false] },
              { id: 'f6', name: 'Private LLM Support', values: [true, false, false, false] },
              { id: 'f7', name: 'Built-in Blog', values: [true, true, false, true] },
              { id: 'f8', name: 'Newsletter Module', values: [true, false, false, false] },
              { id: 'f9', name: 'Knowledge Base', values: [true, false, false, false] },
              { id: 'f10', name: 'E-commerce', values: [true, true, false, 'Plugins'] },
              { id: 'f11', name: 'CRM Integration', values: [true, false, false, false] },
              { id: 'f12', name: 'Self-Hostable', values: [true, false, false, true] },
              { id: 'f13', name: 'Open Source', values: [true, false, false, true] },
            ],
            variant: 'striped',
            showPrices: false,
            showButtons: false,
            stickyHeader: true,
          },
        },
        // BADGE - Trust indicators
        {
          id: 'badge-trust',
          type: 'badge',
          data: {
            title: 'Built with Security & Compliance in Mind',
            subtitle: 'Enterprise-ready from day one.',
            badges: [
              { id: 'b1', title: 'Open Source', subtitle: 'MIT License', icon: 'star' },
              { id: 'b2', title: 'GDPR Ready', subtitle: 'Privacy First', icon: 'shield' },
              { id: 'b3', title: 'Self-Hostable', subtitle: 'Your Data', icon: 'check' },
              { id: 'b4', title: 'SOC 2', subtitle: 'Compliant', icon: 'award' },
            ],
            variant: 'cards',
            columns: 4,
            size: 'md',
            showTitles: true,
            grayscale: false,
          },
        },
        // MARQUEE - Technologies and partners
        {
          id: 'marquee-tech',
          type: 'marquee',
          data: {
            items: [
              { id: 'mq1', text: 'React', icon: '⚛️' },
              { id: 'mq2', text: 'TypeScript', icon: '📘' },
              { id: 'mq3', text: 'Supabase', icon: '⚡' },
              { id: 'mq4', text: 'Tailwind CSS', icon: '🎨' },
              { id: 'mq5', text: 'OpenAI', icon: '🤖' },
              { id: 'mq6', text: 'Gemini', icon: '✨' },
              { id: 'mq7', text: 'Docker', icon: '🐳' },
              { id: 'mq8', text: 'Stripe', icon: '💳' },
            ],
            speed: 'normal',
            direction: 'left',
            pauseOnHover: true,
            variant: 'default',
            separator: '•',
          },
        },
        // FEATURES - Compliance & Security
        {
          id: 'features-compliance',
          type: 'features',
          data: {
            title: 'Built for Scale & Compliance',
            subtitle: 'Whether you\'re a startup preparing for growth or an enterprise with strict requirements, FlowWink has you covered.',
            features: [
              {
                id: 'comp-gdpr',
                icon: 'Shield',
                title: 'GDPR Compliance',
                description: 'Not a plugin or afterthought. Privacy by design with complete audit trails.',
              },
              {
                id: 'comp-wcag',
                icon: 'Eye',
                title: 'WCAG 2.1 AA',
                description: 'Accessibility built into every theme and component. Real compliance, not just claims.',
              },
              {
                id: 'comp-security',
                icon: 'Lock',
                title: 'Data Security',
                description: 'Your data stays secure. Self-host option means sensitive information never leaves your control.',
              },
              {
                id: 'comp-audit',
                icon: 'FileSearch',
                title: 'Full Audit Trail',
                description: 'Every change tracked. Who did what, when. Perfect for compliance audits.',
              },
            ],
            columns: 4,
            layout: 'grid',
            variant: 'minimal',
            iconStyle: 'circle',
          },
        },
        // PRICING - Deployment options
        {
          id: 'pricing-main',
          type: 'pricing',
          data: {
            title: 'Your Infrastructure, Your Rules',
            subtitle: 'Choose how you want to run FlowWink. Same features, your choice of control.',
            tiers: [
              {
                id: 'tier-self',
                name: 'Self-Hosted',
                price: 'Free',
                period: 'forever',
                description: 'Full control. Run on your own servers with Docker or directly on any VPS.',
                features: [
                  'All features included',
                  'Unlimited pages & content',
                  'Your own database',
                  'Private LLM support',
                  'Community support',
                  'GitHub issues & discussions',
                ],
                buttonText: 'Get Started',
                buttonUrl: 'https://github.com/magnusfroste/flowwink/pkgs/container/flowwink',
              },
              {
                id: 'tier-managed',
                name: 'Managed Cloud',
                price: '€49',
                period: '/month',
                description: 'We handle the infrastructure. You focus on content.',
                features: [
                  'All features included',
                  'Automatic updates',
                  'Daily backups',
                  'SSL & CDN included',
                  'Priority support',
                  '99.9% uptime SLA',
                ],
                buttonText: 'Start Free Trial',
                buttonUrl: '/contact',
                highlighted: true,
                badge: 'Recommended',
              },
              {
                id: 'tier-enterprise',
                name: 'Enterprise',
                price: 'Custom',
                description: 'For organizations with specific requirements.',
                features: [
                  'Everything in Managed',
                  'Dedicated infrastructure',
                  'Custom SLA',
                  'SSO & SAML',
                  'Dedicated support manager',
                  'Training & onboarding',
                ],
                buttonText: 'Contact Sales',
                buttonUrl: '/contact',
              },
            ],
            columns: 3,
            variant: 'cards',
          },
        },
        // TIMELINE - How fast you can launch
        {
          id: 'timeline-launch',
          type: 'timeline',
          data: {
            title: 'Zero to Launch',
            subtitle: 'See how fast you can go live with FlowWink compared to alternatives.',
            steps: [
              {
                id: 'tl-1',
                title: 'FlowWink',
                description: 'Pick a template, customize content, and publish. Done in minutes.',
                date: '5 minutes',
                icon: 'Rocket',
              },
              {
                id: 'tl-2',
                title: 'Traditional CMS',
                description: 'Setup hosting, install CMS, configure plugins, customize theme, create content.',
                date: '2-3 weeks',
                icon: 'Clock',
              },
              {
                id: 'tl-3',
                title: 'Custom Build',
                description: 'Design, develop, test, deploy, maintain. Ongoing development costs.',
                date: '2-6 months',
                icon: 'Calendar',
              },
            ],
            variant: 'vertical',
            showDates: true,
          },
        },
        // NEWSLETTER - Showcase newsletter module
        {
          id: 'newsletter-home',
          type: 'newsletter',
          data: {
            title: 'Stay in the Loop',
            subtitle: 'Get product updates, new features, and self-hosting tips. No spam, unsubscribe anytime.',
            buttonText: 'Subscribe',
            placeholder: 'your@email.com',
            variant: 'card',
            showGdprConsent: true,
            consentText: 'I agree to receive emails. Unsubscribe anytime.',
          },
        },
        // BOOKING - Showcase booking module
        {
          id: 'booking-home',
          type: 'booking',
          data: {
            title: 'Book a Live Demo',
            subtitle: 'See FlowWink in action with a personalized walkthrough.',
            services: [
              { id: 'demo-30', name: '30-min Product Demo', duration: 30, description: 'Quick overview of all features and modules.' },
              { id: 'demo-60', name: '60-min Deep Dive', duration: 60, description: 'Full walkthrough including self-hosting setup and API integration.' },
            ],
            variant: 'card',
          },
        },
        // ACCORDION - Platform FAQ for AEO
        {
          id: 'accordion-home-faq',
          type: 'accordion',
          data: {
            title: 'Platform FAQ',
            items: [
              { question: 'What is FlowWink?', answer: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'FlowWink is an open-source CMS platform that combines visual website editing with headless API access. Self-host for free or use our managed cloud service.' }] }] } },
              { question: 'Is FlowWink really free?', answer: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Yes! FlowWink is open source under MIT license. Self-host on your own servers at no cost. We also offer managed cloud hosting starting at €49/month for those who prefer not to manage infrastructure.' }] }] } },
              { question: 'Can I use my own AI model?', answer: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Absolutely. FlowWink supports OpenAI, local LLMs via Ollama, or any OpenAI-compatible endpoint. Your data stays on your infrastructure for complete privacy and compliance.' }] }] } },
              { question: 'How does the AI chat work?', answer: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'The AI chat reads all your CMS content (pages, blog, knowledge base) to answer visitor questions accurately. It\'s like having a 24/7 support agent that knows everything about your website.' }] }] } },
              { question: 'Who is FlowWink for?', answer: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'FlowWink is built for startups needing speed, growing businesses wanting all-in-one solutions, and enterprises requiring data sovereignty and compliance.' }] }] } },
            ],
          },
        },
        // FEATURES - Who it's for
        {
          id: 'features-audience',
          type: 'features',
          data: {
            title: 'Built For',
            features: [
              {
                id: 'aud-startup',
                icon: 'Rocket',
                title: 'Startups',
                description: 'Launch fast, iterate faster. Start free and scale as you grow.',
              },
              {
                id: 'aud-growing',
                icon: 'TrendingUp',
                title: 'Growing Businesses',
                description: 'Need a blog, newsletter, and CRM? Get them all in one platform.',
              },
              {
                id: 'aud-enterprise',
                icon: 'Building2',
                title: 'Enterprise',
                description: 'Data sovereignty, compliance, and self-hosting. Your rules.',
              },
            ],
            columns: 3,
            layout: 'grid',
            variant: 'cards',
            iconStyle: 'circle',
          },
        },
        // CTA - Final call to action
        {
          id: 'cta-final',
          type: 'cta',
          data: {
            title: 'Ready to See It in Action?',
            subtitle: 'Try the live demo or self-host for free. No credit card required.',
            buttonText: 'Launch Demo',
            buttonUrl: '/demo',
            gradient: true,
          },
        },
        // FLOATING CTA - Scroll-triggered conversion
        {
          id: 'floating-cta-demo',
          type: 'floating-cta',
          data: {
            title: 'Try FlowWink Now',
            subtitle: 'See all features in action',
            buttonText: 'Launch Demo',
            buttonUrl: '/demo',
            showAfterScroll: 30,
            hideOnScrollUp: false,
            position: 'bottom-right',
            variant: 'card',
            size: 'md',
            showCloseButton: true,
            closePersistent: true,
            animationType: 'slide',
          },
        },
      ],
    },
    // ===== DEMO PAGE - Interactive Playground =====
    {
      title: 'Demo',
      slug: 'demo',
      menu_order: 2,
      showInMenu: true,
      meta: {
        description: 'Experience FlowWink live. Try our booking system, product showcase, AI chat, and knowledge base search.',
        showTitle: false,
        titleAlignment: 'center',
      },
      blocks: [
        {
          id: 'hero-demo',
          type: 'hero',
          data: {
            title: 'Experience FlowWink Live',
            subtitle: 'Try our interactive modules below. Book meetings, browse products, search the knowledge base, or chat with our AI assistant.',
            backgroundType: 'color',
            heightMode: 'auto',
            contentAlignment: 'center',
            overlayOpacity: 0,
            primaryButton: { text: 'Self-Host Free', url: 'https://github.com/flowwink/flowwink' },
            secondaryButton: { text: 'Start Trial', url: '/contact' },
          },
        },
        {
          id: 'sep-booking-demo',
          type: 'separator',
          data: { variant: 'text', text: 'Smart Booking System', icon: 'Calendar' },
        },
        {
          id: 'booking-demo-live',
          type: 'booking',
          data: {
            title: 'Book a Demo Call',
            description: 'Select a service and time that works for you. This is a live booking system – your appointment will be confirmed.',
            mode: 'smart',
            submitButtonText: 'Confirm Booking',
            successMessage: 'Your booking is confirmed! Check your email for details.',
            showPhoneField: true,
            variant: 'card',
          },
        },
        {
          id: 'sep-products-demo',
          type: 'separator',
          data: { variant: 'text', text: 'E-commerce Module', icon: 'ShoppingCart' },
        },
        {
          id: 'products-demo-live',
          type: 'products',
          data: {
            title: 'Product Showcase',
            subtitle: 'Products are fetched from the database. Add to cart and checkout with Stripe integration.',
            columns: 3,
            productType: 'all',
            showDescription: true,
            buttonText: 'Add to Cart',
          },
        },
        {
          id: 'cart-demo',
          type: 'cart',
          data: {
            title: 'Your Shopping Cart',
            showImage: true,
            showQuantity: true,
            checkoutButtonText: 'Proceed to Checkout',
            emptyCartMessage: 'Your cart is empty. Add products above to see the cart in action.',
          },
        },
        {
          id: 'sep-ai-demo',
          type: 'separator',
          data: { variant: 'text', text: 'AI-Powered Features', icon: 'Sparkles' },
        },
        {
          id: 'chat-launcher-demo',
          type: 'chat-launcher',
          data: {
            title: 'Ask Our AI Assistant',
            subtitle: 'The AI reads all our content to provide accurate answers.',
            placeholder: 'What would you like to know about FlowWink?',
            showQuickActions: true,
            quickActionCount: 4,
            variant: 'card',
          },
        },
        {
          id: 'sep-kb-demo',
          type: 'separator',
          data: { variant: 'text', text: 'Knowledge Base Search', icon: 'BookOpen' },
        },
        {
          id: 'kb-search-demo',
          type: 'kb-search',
          data: {
            title: 'Search Our Help Center',
            subtitle: 'Full-text search across all knowledge base articles.',
            placeholder: 'Search for help articles...',
            showResults: true,
            maxResults: 5,
          },
        },
        {
          id: 'sep-webinar-demo',
          type: 'separator',
          data: { variant: 'text', text: 'Webinars Module', icon: 'Video' },
        },
        {
          id: 'webinar-demo-live',
          type: 'webinar',
          data: {
            title: 'Upcoming Webinars',
            subtitle: 'Register for live sessions. The Webinars module handles registration, reminders, and follow-up automatically.',
          },
        },
        {
          id: 'sep-forms-demo',
          type: 'separator',
          data: { variant: 'text', text: 'Lead Capture', icon: 'UserPlus' },
        },
        {
          id: 'twocol-forms',
          type: 'two-column',
          data: {
            eyebrow: 'LEAD CAPTURE',
            title: 'Forms &',
            accentText: 'Newsletters',
            accentPosition: 'end',
            leftColumn: {
              type: 'doc',
              content: [
                { type: 'heading', attrs: { level: 3 }, content: [{ type: 'text', text: '📧 Newsletter Signup' }] },
                { type: 'paragraph', content: [{ type: 'text', text: 'Newsletter signups automatically create leads in the CRM with activity scoring. Double opt-in, GDPR compliant.' }] },
              ],
            },
            rightColumn: {
              type: 'doc',
              content: [
                { type: 'heading', attrs: { level: 3 }, content: [{ type: 'text', text: '📝 Contact Form' }] },
                { type: 'paragraph', content: [{ type: 'text', text: 'Form submissions are saved to the database, create leads, trigger webhooks, and can be exported. Full automation support.' }] },
              ],
            },
            layout: '50-50',
          },
        },
        {
          id: 'newsletter-demo',
          type: 'newsletter',
          data: {
            title: 'Get Product Updates',
            description: 'Subscribe to our newsletter for tips, updates, and early access to new features.',
            buttonText: 'Subscribe',
            successMessage: 'Check your inbox to confirm your subscription!',
            variant: 'default',
            showNameField: true,
          },
        },
        {
          id: 'form-demo',
          type: 'form',
          data: {
            title: 'Contact Us',
            formName: 'Demo Contact Form',
            fields: [
              { id: 'field-name', type: 'text', label: 'Your Name', placeholder: 'Enter your name', required: true },
              { id: 'field-email', type: 'email', label: 'Email', placeholder: 'your@email.com', required: true },
              { id: 'field-message', type: 'textarea', label: 'Message', placeholder: 'How can we help?', required: true },
            ],
            submitButtonText: 'Send Message',
            successMessage: 'Thank you! We will respond within 24 hours.',
          },
        },
        {
          id: 'sep-loop',
          type: 'separator',
          data: { variant: 'text', text: 'The Flowwink Loop', icon: 'RefreshCw' },
        },
        {
          id: 'info-flowwink-loop',
          type: 'info-box',
          data: {
            variant: 'highlight',
            content: {
              type: 'doc',
              content: [
                { type: 'heading', attrs: { level: 3 }, content: [{ type: 'text', text: '🔄 Automatic Lead Pipeline' }] },
                { type: 'paragraph', content: [{ type: 'text', text: 'Every interaction above (booking, form, newsletter) automatically creates or updates a lead in the CRM. The Flowwink Loop then:' }] },
                { type: 'orderedList', content: [
                  { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'bold' }], text: 'Scores the lead' }, { type: 'text', text: ' – 10 pts for booking, 8 pts for newsletter, 10 pts for form' }] }] },
                  { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'bold' }], text: 'Matches company' }, { type: 'text', text: ' – Auto-links to company via email domain' }] }] },
                  { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'bold' }], text: 'AI enrichment' }, { type: 'text', text: ' – Scrapes company website for industry, size, description' }] }] },
                  { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'bold' }], text: 'AI qualification' }, { type: 'text', text: ' – Generates qualification summary and next steps' }] }] },
                ] },
              ],
            },
          },
        },
        {
          id: 'cta-demo',
          type: 'cta',
          data: {
            title: 'Ready to Get Started?',
            subtitle: 'Self-host for free or let us manage everything for €49/month.',
            buttonText: 'Self-Host Free',
            buttonUrl: 'https://github.com/flowwink/flowwink',
            secondaryButtonText: 'Start Free Trial',
            secondaryButtonUrl: '/contact',
            gradient: true,
          },
        },
      ],
    },
    // ===== FEATURES PAGE =====
    {
      title: 'Features',
      slug: 'features',
      menu_order: 2,
      showInMenu: true,
      meta: {
        description: 'Explore all FlowWink features - from visual editing to headless API, AI tools to CRM integration.',
        showTitle: true,
        titleAlignment: 'center',
      },
      blocks: [
        {
          id: 'hero-features',
          type: 'hero',
          data: {
            title: 'Features That Matter',
            subtitle: 'Everything you need to manage content, engage visitors, and grow your business.',
            backgroundType: 'color',
            heightMode: 'auto',
            contentAlignment: 'center',
            overlayOpacity: 0,
          },
        },
        {
          id: 'tabs-features',
          type: 'tabs',
          data: {
            title: 'Built for Every Role',
            subtitle: 'From content creators to developers to business leaders – FlowWink adapts to how you work.',
            tabs: [
              {
                id: 'tab-creators',
                title: 'For Content Creators',
                icon: 'PenLine',
                content: {
                  type: 'doc',
                  content: [
                    { type: 'heading', attrs: { level: 3 }, content: [{ type: 'text', text: 'Visual Editor & 47+ Blocks' }] },
                    { type: 'paragraph', content: [{ type: 'text', text: 'Drag-and-drop page building with real-time preview. No coding required.' }] },
                    { type: 'bulletList', content: [
                      { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'bold' }], text: 'Rich Text Editor' }, { type: 'text', text: ' – Full formatting, links, images, and embedded media' }] }] },
                      { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'bold' }], text: 'AI Writing Assistant' }, { type: 'text', text: ' – Generate, expand, and translate content in your brand voice' }] }] },
                      { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'bold' }], text: 'Editorial Workflow' }, { type: 'text', text: ' – Draft → Review → Approve → Publish with version history' }] }] },
                      { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'bold' }], text: 'Blog Module' }, { type: 'text', text: ' – Categories, tags, authors, RSS, and SEO optimization' }] }] },
                      { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'bold' }], text: 'Media Library' }, { type: 'text', text: ' – Centralized assets with image cropping and Unsplash integration' }] }] },
                    ]},
                  ],
                },
              },
              {
                id: 'tab-developers',
                title: 'For Developers',
                icon: 'Code',
                content: {
                  type: 'doc',
                  content: [
                    { type: 'heading', attrs: { level: 3 }, content: [{ type: 'text', text: 'Headless API & Self-Hosting' }] },
                    { type: 'paragraph', content: [{ type: 'text', text: 'Full REST API, webhooks, and Docker deployment. Open source MIT license.' }] },
                    { type: 'bulletList', content: [
                      { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'bold' }], text: 'REST API' }, { type: 'text', text: ' – Full access to pages, posts, media, settings, and more' }] }] },
                      { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'bold' }], text: 'Webhooks' }, { type: 'text', text: ' – Trigger external services on publish, update, delete events' }] }] },
                      { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'bold' }], text: 'N8N Templates' }, { type: 'text', text: ' – Pre-built automation workflows for common integrations' }] }] },
                      { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'bold' }], text: 'Docker Deploy' }, { type: 'text', text: ' – Self-host in 5 minutes with docker-compose' }] }] },
                      { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'bold' }], text: 'Private LLM' }, { type: 'text', text: ' – Connect your own OpenAI-compatible model for data sovereignty' }] }] },
                    ]},
                  ],
                },
              },
              {
                id: 'tab-business',
                title: 'For Business',
                icon: 'Briefcase',
                content: {
                  type: 'doc',
                  content: [
                    { type: 'heading', attrs: { level: 3 }, content: [{ type: 'text', text: 'CRM, Analytics & E-commerce' }] },
                    { type: 'paragraph', content: [{ type: 'text', text: 'Built-in modules for lead generation, customer management, and sales.' }] },
                    { type: 'bulletList', content: [
                      { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'bold' }], text: 'Lead CRM' }, { type: 'text', text: ' – Capture leads from forms, score them with AI, track activities' }] }] },
                      { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'bold' }], text: 'Deal Pipeline' }, { type: 'text', text: ' – Kanban board for sales, link to leads and products' }] }] },
                      { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'bold' }], text: 'Newsletter' }, { type: 'text', text: ' – GDPR-compliant subscriber management and email campaigns' }] }] },
                      { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'bold' }], text: 'E-commerce' }, { type: 'text', text: ' – Products, orders, Stripe checkout for subscriptions and one-time' }] }] },
                      { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'bold' }], text: 'Analytics' }, { type: 'text', text: ' – Page views, visitor geography, traffic sources, and trends' }] }] },
                    ]},
                  ],
                },
              },
            ],
            orientation: 'horizontal',
            variant: 'boxed',
          },
        },
        {
          id: 'sep-flowwink-loop',
          type: 'separator',
          data: { variant: 'text', text: 'The Flowwink Loop', icon: 'RefreshCw' },
        },
        {
          id: 'timeline-flowwink-loop',
          type: 'timeline',
          data: {
            title: 'Automatic Lead Generation Pipeline',
            subtitle: 'Every visitor interaction triggers an intelligent automation that converts anonymous visitors to qualified leads.',
            items: [
              { id: 'loop-1', title: 'Visitor Interacts', description: 'Form submission, booking, newsletter signup, or chat conversation. Any touchpoint starts the loop.', icon: 'MousePointer' },
              { id: 'loop-2', title: 'Lead Created & Scored', description: 'Automatic lead creation with activity scoring: 10 pts booking, 10 pts form, 8 pts newsletter, 5 pts link click.', icon: 'UserPlus' },
              { id: 'loop-3', title: 'Company Matched', description: 'Email domain auto-links to company. Creates company record if new, updates existing if known.', icon: 'Building2' },
              { id: 'loop-4', title: 'AI Enrichment', description: 'Firecrawl scrapes company website for industry, size, description. All automated.', icon: 'Brain' },
              { id: 'loop-5', title: 'AI Qualification', description: 'LLM generates qualification summary, potential value, and recommended next steps.', icon: 'CheckCircle' },
              { id: 'loop-6', title: 'Sales Ready', description: 'Complete lead profile ready in CRM. No manual data entry required.', icon: 'Target' },
            ],
            layout: 'vertical',
            staggeredReveal: true,
          },
        },
        {
          id: 'progress-modules',
          type: 'progress',
          data: {
            title: 'Module Maturity',
            subtitle: 'Our commitment to quality. All modules are production-ready.',
            items: [
              { id: 'prog-cms', label: 'CMS & Pages', value: 100, color: 'primary' },
              { id: 'prog-blog', label: 'Blog & KB', value: 100 },
              { id: 'prog-crm', label: 'CRM & Leads', value: 95 },
              { id: 'prog-ecom', label: 'E-commerce', value: 90 },
              { id: 'prog-ai', label: 'AI Features', value: 85 },
            ],
            variant: 'default',
            size: 'md',
            showLabels: true,
            showPercentage: true,
            animated: true,
          },
        },
        {
          id: 'stats-blocks',
          type: 'stats',
          data: {
            title: '',
            items: [
              { id: 'stat-blocks', value: '47+', label: 'Content Blocks' },
              { id: 'stat-roles', value: '3', label: 'Editorial Roles' },
              { id: 'stat-modules', value: '16', label: 'Built-in Modules' },
              { id: 'stat-api', value: '100%', label: 'API Coverage' },
            ],
            columns: 4,
            variant: 'cards',
          },
        },
        {
          id: 'sep-workflow',
          type: 'separator',
          data: { variant: 'text', text: 'Editorial Workflow', icon: 'Users' },
        },
        {
          id: 'timeline-workflow',
          type: 'timeline',
          data: {
            title: 'From Draft to Published',
            subtitle: 'A structured workflow that ensures quality and accountability.',
            items: [
              { id: 'tw-1', title: 'Draft', description: 'Writer creates content using the visual editor. Every change is automatically saved and versioned.', icon: 'PenLine' },
              { id: 'tw-2', title: 'Submit for Review', description: 'When ready, the writer submits the content for approval. Reviewers are notified automatically.', icon: 'Send' },
              { id: 'tw-3', title: 'Review & Approve', description: 'Approvers review content, leave feedback, or approve for publishing. All feedback is tracked.', icon: 'CheckCircle' },
              { id: 'tw-4', title: 'Publish', description: 'Content goes live immediately or at a scheduled time. Previous versions remain accessible.', icon: 'Globe' },
            ],
            layout: 'vertical',
          },
        },
        {
          id: 'features-roles',
          type: 'features',
          data: {
            title: 'Role-Based Permissions',
            subtitle: 'Three distinct roles with clear responsibilities.',
            features: [
              { id: 'role-writer', icon: 'PenLine', title: 'Writer', description: 'Create and edit content. Submit for review. Cannot publish without approval.' },
              { id: 'role-approver', icon: 'CheckCircle', title: 'Approver', description: 'Review submitted content. Approve or request changes. Publish approved content.' },
              { id: 'role-admin', icon: 'Shield', title: 'Admin', description: 'Full access to all features. Manage users, settings, and site configuration.' },
            ],
            columns: 3,
            variant: 'cards',
            iconStyle: 'circle',
          },
        },
        {
          id: 'twocol-versions',
          type: 'two-column',
          data: {
            eyebrow: 'VERSION CONTROL',
            title: 'Version History &',
            accentText: 'Rollback',
            accentPosition: 'end',
            leftColumn: {
              type: 'doc',
              content: [
                { type: 'paragraph', content: [{ type: 'text', text: 'Every save creates a version. Every version is accessible forever.' }] },
                { type: 'bulletList', content: [
                  { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Compare any two versions side-by-side' }] }] },
                  { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Restore previous versions with one click' }] }] },
                  { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'See who made each change and when' }] }] },
                  { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Complete audit trail for compliance' }] }] },
                ] },
              ],
            },
            rightColumn: {
              type: 'doc',
              content: [
                { type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'italic' }], text: '📸 Version history shows a timeline of changes with author, timestamp, and diff preview. Click any version to restore it.' }] },
              ],
            },
            layout: '60-40',
          },
        },
        {
          id: 'sep-api',
          type: 'separator',
          data: { variant: 'text', text: 'Headless API', icon: 'Code' },
        },
        {
          id: 'twocol-api',
          type: 'two-column',
          data: {
            eyebrow: 'HEADLESS',
            title: 'Complete',
            accentText: 'REST API',
            accentPosition: 'end',
            leftColumn: {
              type: 'doc',
              content: [
                { type: 'paragraph', content: [{ type: 'text', text: 'Access all your content programmatically. Build custom frontends, mobile apps, or integrate with external services.' }] },
                { type: 'bulletList', content: [
                  { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'bold' }], text: 'Pages API' }, { type: 'text', text: ' – Get all pages with content blocks and metadata' }] }] },
                  { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'bold' }], text: 'Blog API' }, { type: 'text', text: ' – Posts, categories, tags with pagination and filtering' }] }] },
                  { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'bold' }], text: 'KB API' }, { type: 'text', text: ' – Categories and articles with full-text search' }] }] },
                  { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'bold' }], text: 'Media API' }, { type: 'text', text: ' – Upload, list, and retrieve media files' }] }] },
                  { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'bold' }], text: 'Settings API' }, { type: 'text', text: ' – Site settings, branding, and navigation' }] }] },
                ] },
              ],
            },
            rightColumn: {
              type: 'doc',
              content: [
                { type: 'codeBlock', attrs: { language: 'bash' }, content: [{ type: 'text', text: '# Get all published pages\ncurl https://your-site.com/api/v1/pages\n\n# Get page by slug\ncurl https://your-site.com/api/v1/pages/home\n\n# Search blog posts\ncurl https://your-site.com/api/v1/blog/posts?search=cms' }] },
              ],
            },
            layout: '50-50',
            ctaText: 'View Full API Docs →',
            ctaUrl: '/docs',
          },
        },
        {
          id: 'sep-resources',
          type: 'separator',
          data: { variant: 'text', text: 'Resources', icon: 'BookOpen' },
        },
        {
          id: 'links-resources',
          type: 'link-grid',
          data: {
            title: 'Resources',
            links: [
              { id: 'link-docs', icon: 'BookOpen', title: 'Documentation', description: 'API reference and guides', url: '/docs' },
              { id: 'link-github', icon: 'Github', title: 'GitHub', description: 'Source code and issues', url: 'https://github.com/flowwink/flowwink' },
              { id: 'link-discord', icon: 'MessageCircle', title: 'Community', description: 'Discord support', url: 'https://discord.gg/flowwink' },
              { id: 'link-selfhost', icon: 'Server', title: 'Self-Hosting', description: 'Deployment guide', url: '/docs/self-hosting' },
            ],
            columns: 4,
          },
        },
        {
          id: 'cta-features',
          type: 'cta',
          data: {
            title: 'See All Features in Action',
            subtitle: 'Try the live demo – no signup required.',
            buttonText: 'Launch Demo',
            buttonUrl: '/demo',
            secondaryButtonText: 'View Pricing',
            secondaryButtonUrl: '/pricing',
            gradient: true,
          },
        },
      ],
    },
    // ===== BLOCKS SHOWCASE PAGE =====
    // NOTE: This is a very large page - consider reading the full source for complete content
    {
      title: 'Blocks',
      slug: 'blocks',
      menu_order: 3,
      showInMenu: true,
      meta: {
        description: 'Explore all 47+ block types available in FlowWink - from content blocks to interactive elements and AI-powered features.',
        showTitle: true,
        titleAlignment: 'center',
      },
      blocks: [
        { id: 'hero-demo', type: 'hero', data: { title: 'See FlowWink in Action', subtitle: 'This page is built with FlowWink. Explore 47+ block types organized by category below.', backgroundType: 'color', heightMode: 'auto', contentAlignment: 'center', overlayOpacity: 0, primaryButton: { text: 'Try the Admin', url: '/admin' }, secondaryButton: { text: 'View Docs', url: '/docs' } } },
        { id: 'stats-demo-overview', type: 'stats', data: { items: [{ id: 'ds1', value: '47+', label: 'Block Types' }, { id: 'ds2', value: '16', label: 'Modules' }, { id: 'ds3', value: '5', label: 'AI Providers' }, { id: 'ds4', value: '3', label: 'User Roles' }], columns: 4, variant: 'minimal' } },
        { id: 'sep-editor', type: 'separator', data: { variant: 'text', text: 'Visual Editor', icon: 'Palette' } },
        { id: 'twocol-editor', type: 'two-column', data: { eyebrow: 'VISUAL EDITOR', title: 'Drag, Drop, Done', titleSize: 'large', content: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'The visual editor is the heart of FlowWink. Add blocks, arrange them, edit content – all in real-time with instant preview.' }] }, { type: 'heading', attrs: { level: 3 }, content: [{ type: 'text', text: 'How It Works' }] }, { type: 'orderedList', content: [{ type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'bold' }], text: 'Add a Block' }, { type: 'text', text: ' – Click the + button and choose from 47+ block types' }] }] }, { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'bold' }], text: 'Edit Content' }, { type: 'text', text: ' – Click any text to edit. Upload images. Configure settings.' }] }] }, { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'bold' }], text: 'Rearrange' }, { type: 'text', text: ' – Drag blocks to reorder. Move sections around freely.' }] }] }, { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'bold' }], text: 'Preview' }, { type: 'text', text: ' – See exactly how it looks on desktop, tablet, and mobile.' }] }] }, { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'bold' }], text: 'Publish' }, { type: 'text', text: ' – One click to go live. Or schedule for later.' }] }] }] }] }, imageSrc: '', imageAlt: 'FlowWink editor interface', imagePosition: 'right', note: '🖼️ The editor panel shows a live preview on the right and block controls on the left. Every change is auto-saved.' } },
        { id: 'sep-blocks-demo', type: 'separator', data: { variant: 'text', text: 'Block Showcase', icon: 'LayoutGrid' } },
        { id: 'text-blocks-intro', type: 'text', data: { content: { type: 'doc', content: [{ type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Every Block Type, Live' }] }, { type: 'paragraph', content: [{ type: 'text', text: 'Below you will find examples of the most popular block types. Each one is fully customizable – colors, layouts, content, and behavior.' }] }] } } },
        { id: 'demo-block-overview', type: 'features', data: { title: '47+ Block Types Available', subtitle: 'From simple text to complex e-commerce – build any page with drag-and-drop blocks.', features: [{ id: 'cat-content', icon: 'FileText', title: 'Content', description: 'Hero, Text, Image, Quote, Separator, Two-Column, Info Box' }, { id: 'cat-showcase', icon: 'LayoutGrid', title: 'Showcase', description: 'Features, Stats, Timeline, Gallery, Logos, Team, Testimonials' }, { id: 'cat-commerce', icon: 'ShoppingCart', title: 'E-commerce', description: 'Pricing, Products, Cart, Comparison' }, { id: 'cat-forms', icon: 'ClipboardList', title: 'Forms', description: 'Contact, Form Builder, Newsletter, Booking' }, { id: 'cat-navigation', icon: 'Navigation', title: 'Navigation', description: 'Header, Footer, Link Grid, Accordion' }, { id: 'cat-media', icon: 'Play', title: 'Media', description: 'YouTube, Map, Article Grid' }, { id: 'cat-ai', icon: 'Sparkles', title: 'AI', description: 'Chat Widget, AI Text Assistant' }, { id: 'cat-interactive', icon: 'MousePointer', title: 'Interactive', description: 'Popup, CTA Buttons' }], columns: 4, variant: 'minimal', iconStyle: 'square' } },
        { id: 'demo-features', type: 'features', data: { title: 'Features Block', subtitle: 'Showcase capabilities with icon cards. Grid or list layout.', features: [{ id: 'demo-f1', icon: 'Zap', title: 'Fast', description: 'Optimized for speed. No bloat, no lag.' }, { id: 'demo-f2', icon: 'Shield', title: 'Secure', description: 'Row-level security. GDPR compliant.' }, { id: 'demo-f3', icon: 'Sparkles', title: 'AI-Powered', description: 'Generate, translate, optimize content.' }, { id: 'demo-f4', icon: 'Code', title: 'Developer Friendly', description: 'Full API access. Webhooks. Open source.' }], columns: 4, variant: 'cards', iconStyle: 'circle' } },
        { id: 'demo-stats', type: 'stats', data: { title: 'Stats Block', items: [{ id: 'demo-s1', value: '99.9%', label: 'Uptime' }, { id: 'demo-s2', value: '< 100ms', label: 'Response Time' }, { id: 'demo-s3', value: '50k+', label: 'Pages Served' }, { id: 'demo-s4', value: '24/7', label: 'Support' }], columns: 4, variant: 'minimal' } },
        { id: 'demo-testimonials', type: 'testimonials', data: { title: 'Testimonials Block', testimonials: [{ id: 'demo-t1', content: 'The visual editor is incredibly intuitive. Our marketing team creates landing pages without any developer help.', author: 'Anna Svensson', role: 'Marketing Director', company: 'TechCorp', rating: 5 }, { id: 'demo-t2', content: 'We switched from WordPress and never looked back. The API is exactly what we needed for our mobile app.', author: 'Erik Johansson', role: 'Lead Developer', company: 'AppStudio', rating: 5 }, { id: 'demo-t3', content: 'Self-hosting was a breeze. The documentation is excellent and the community is incredibly helpful.', author: 'Maria Lindgren', role: 'DevOps Engineer', company: 'CloudNative', rating: 5 }], layout: 'grid', columns: 3, showRating: true, showAvatar: false, variant: 'cards' } },
        { id: 'demo-team', type: 'team', data: { title: 'Team Block', subtitle: 'Showcase your team members with photos, roles, and social links.', members: [{ id: 'team-1', name: 'Anna Eriksson', role: 'CEO & Founder', image: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=400', bio: 'Visionary leader with 15 years in tech.', linkedin: 'https://linkedin.com', twitter: 'https://twitter.com' }, { id: 'team-2', name: 'Erik Lindberg', role: 'CTO', image: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=400', bio: 'Full-stack developer and architecture expert.', linkedin: 'https://linkedin.com', github: 'https://github.com' }, { id: 'team-3', name: 'Sofia Bergström', role: 'Head of Design', image: 'https://images.unsplash.com/photo-1438761681033-6461ffad8d80?w=400', bio: 'Award-winning UX designer.', linkedin: 'https://linkedin.com', twitter: 'https://twitter.com' }, { id: 'team-4', name: 'Marcus Johansson', role: 'Lead Developer', image: 'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=400', bio: 'Open source contributor and mentor.', linkedin: 'https://linkedin.com', github: 'https://github.com' }], columns: 4, layout: 'grid', showBio: true, showSocial: true } },
        { id: 'demo-accordion', type: 'accordion', data: { title: 'Accordion Block', items: [{ question: 'How does the FAQ block work?', answer: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Add questions and answers. Visitors click to expand. Great for reducing support tickets and improving SEO with structured FAQ markup.' }] }] } }, { question: 'Can I add images and links inside answers?', answer: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Yes! Answers support rich text formatting including bold, italic, links, images, and even code blocks. Full flexibility.' }] }] } }, { question: 'Is this good for SEO?', answer: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Absolutely. FlowWink automatically generates FAQ structured data (JSON-LD) for accordion blocks, helping your content appear in Google rich results.' }] }] } }] } },
        { id: 'demo-gallery', type: 'gallery', data: { title: 'Gallery Block', images: [{ id: 'gal-1', url: 'https://images.unsplash.com/photo-1517694712202-14dd9538aa97?w=600', alt: 'Code on laptop', caption: 'Developer workspace' }, { id: 'gal-2', url: 'https://images.unsplash.com/photo-1460925895917-afdab827c52f?w=600', alt: 'Analytics dashboard', caption: 'Data visualization' }, { id: 'gal-3', url: 'https://images.unsplash.com/photo-1551434678-e076c223a692?w=600', alt: 'Team collaboration', caption: 'Team meeting' }, { id: 'gal-4', url: 'https://images.unsplash.com/photo-1522071820081-009f0129c71c?w=600', alt: 'Office space', caption: 'Modern office' }], layout: 'grid', columns: 4, showCaptions: true, lightbox: true } },
        { id: 'demo-timeline', type: 'timeline', data: { title: 'Timeline Block', subtitle: 'Perfect for showing processes, history, or roadmaps.', items: [{ id: 'tl-1', title: 'Step 1: Plan', description: 'Define your content structure and goals.', icon: 'Lightbulb' }, { id: 'tl-2', title: 'Step 2: Build', description: 'Create pages with the visual editor.', icon: 'Hammer' }, { id: 'tl-3', title: 'Step 3: Review', description: 'Submit for approval and get feedback.', icon: 'CheckCircle' }, { id: 'tl-4', title: 'Step 4: Launch', description: 'Publish to the world with one click.', icon: 'Rocket' }], layout: 'horizontal' } },
        { id: 'demo-comparison', type: 'comparison', data: { title: 'Comparison Block', products: [{ id: 'c-basic', name: 'Basic', price: 'Free' }, { id: 'c-pro', name: 'Pro', price: '$49/mo', highlighted: true }, { id: 'c-ent', name: 'Enterprise', price: 'Custom' }], features: [{ id: 'cf-1', name: 'Pages', values: ['10', 'Unlimited', 'Unlimited'] }, { id: 'cf-2', name: 'Users', values: ['1', '5', 'Unlimited'] }, { id: 'cf-3', name: 'API Access', values: [false, true, true] }, { id: 'cf-4', name: 'Priority Support', values: [false, true, true] }, { id: 'cf-5', name: 'Custom Domain', values: [false, true, true] }], variant: 'bordered', showPrices: true, showButtons: false } },
        { id: 'sep-ecommerce', type: 'separator', data: { variant: 'text', text: 'E-commerce & Forms', icon: 'ShoppingCart' } },
        { id: 'demo-pricing', type: 'pricing', data: { title: 'Pricing Block', tiers: [{ id: 'p-free', name: 'Starter', price: 'Free', period: 'forever', description: 'For personal projects', features: ['5 pages', '1 user', 'Basic support'], buttonText: 'Get Started', buttonUrl: '#' }, { id: 'p-pro', name: 'Professional', price: '$49', period: '/month', description: 'For growing teams', features: ['Unlimited pages', '5 users', 'Priority support', 'API access'], buttonText: 'Start Trial', buttonUrl: '#', highlighted: true, badge: 'Popular' }, { id: 'p-ent', name: 'Enterprise', price: 'Custom', description: 'For large organizations', features: ['Everything in Pro', 'Unlimited users', 'Custom SLA', 'Dedicated support'], buttonText: 'Contact Us', buttonUrl: '#' }], columns: 3, variant: 'cards' } },
        { id: 'info-versions', type: 'info-box', data: { variant: 'info', content: { type: 'doc', content: [{ type: 'heading', attrs: { level: 3 }, content: [{ type: 'text', text: '💾 Every Save is a Version' }] }, { type: 'paragraph', content: [{ type: 'text', text: 'Made a mistake? No problem. Every save creates a version you can restore with one click. Compare any two versions side-by-side to see exactly what changed.' }] }] } } },
        { id: 'sep-interactive', type: 'separator', data: { variant: 'text', text: 'Interactive & Conversion Blocks', icon: 'Sparkles' } },
        { id: 'info-interactive-intro', type: 'info-box', data: { variant: 'highlight', content: { type: 'doc', content: [{ type: 'heading', attrs: { level: 3 }, content: [{ type: 'text', text: '✨ New Block Types' }] }, { type: 'paragraph', content: [{ type: 'text', text: 'These blocks add interactivity, urgency, and social proof to your pages. Perfect for landing pages, product launches, and conversion optimization.' }] }] } } },
        { id: 'demo-announcement', type: 'announcement-bar', data: { message: '🎉 Announcement Bar – Display important updates, promotions, or alerts at the top of your page.', linkText: 'Learn more', linkUrl: '#', variant: 'gradient', dismissable: true, sticky: false } },
        { id: 'demo-tabs', type: 'tabs', data: { title: 'Tabs Block', subtitle: 'Organize content into switchable panels. Perfect for feature comparisons, multi-step guides, or categorized content.', tabs: [{ id: 'tab-features', title: 'Features', icon: 'Star', content: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Each tab can contain rich text content, lists, links, and more. This is the Features tab.' }] }, { type: 'bulletList', content: [{ type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Horizontal and vertical orientations' }] }] }, { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Underline, pills, or boxed variants' }] }] }, { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Optional icons for each tab' }] }] }] }] } }, { id: 'tab-pricing', title: 'Pricing', icon: 'CreditCard', content: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'This is the Pricing tab. You could show pricing details, comparison, or FAQs here.' }] }] } }, { id: 'tab-support', title: 'Support', icon: 'HeadphonesIcon', content: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'This is the Support tab. Add contact info, help resources, or FAQs.' }] }] } }], orientation: 'horizontal', variant: 'underline' } },
        { id: 'demo-marquee', type: 'marquee', data: { items: [{ id: 'mq1', text: 'Marquee Block', icon: '🎠' }, { id: 'mq2', text: 'Scrolling text that runs continuously', icon: '📢' }, { id: 'mq3', text: 'Great for announcements', icon: '✨' }, { id: 'mq4', text: 'Partner logos', icon: '🤝' }, { id: 'mq5', text: 'Tech stack display', icon: '💻' }], speed: 'normal', direction: 'left', pauseOnHover: true, variant: 'gradient', separator: '•' } },
        { id: 'demo-countdown', type: 'countdown', data: { title: 'Countdown Block', subtitle: 'Create urgency with live countdowns. Perfect for product launches, sales, or event registrations.', targetDate: '2025-12-31T23:59:59', expiredMessage: 'The countdown has ended!', variant: 'cards', size: 'lg', showDays: true, showHours: true, showMinutes: true, showSeconds: true } },
        { id: 'demo-progress', type: 'progress', data: { title: 'Progress Block', subtitle: 'Show funding goals, skill levels, or project completion status.', items: [{ id: 'prog1', label: 'Funding Goal', value: 75, color: 'primary' }, { id: 'prog2', label: 'Development', value: 90 }, { id: 'prog3', label: 'Documentation', value: 60 }], variant: 'default', size: 'md', showLabels: true, showPercentage: true, animated: true } },
        { id: 'demo-badge', type: 'badge', data: { title: 'Badge Block', subtitle: 'Display certifications, awards, or trust indicators.', badges: [{ id: 'bdg1', title: 'SOC 2 Certified', icon: 'shield' }, { id: 'bdg2', title: 'GDPR Compliant', icon: 'check' }, { id: 'bdg3', title: 'ISO 27001', icon: 'award' }, { id: 'bdg4', title: '99.9% Uptime', icon: 'medal' }], variant: 'default', columns: 4, size: 'md', showTitles: true, grayscale: false } },
        { id: 'demo-table', type: 'table', data: { title: 'Table Block', caption: 'Display structured data in a clean, responsive table format.', columns: [{ id: 'col1', header: 'Feature', align: 'left' }, { id: 'col2', header: 'Starter', align: 'center' }, { id: 'col3', header: 'Pro', align: 'center' }, { id: 'col4', header: 'Enterprise', align: 'center' }], rows: [['Pages', '10', 'Unlimited', 'Unlimited'], ['Users', '1', '5', 'Unlimited'], ['API Access', '❌', '✅', '✅'], ['Support', 'Community', 'Priority', 'Dedicated']], variant: 'striped', size: 'md', stickyHeader: true, highlightOnHover: true } },
        { id: 'info-embed', type: 'info-box', data: { variant: 'info', content: { type: 'doc', content: [{ type: 'heading', attrs: { level: 3 }, content: [{ type: 'text', text: '🔗 Embed Block' }] }, { type: 'paragraph', content: [{ type: 'text', text: 'Embed external content from Figma, CodePen, Loom, and more. Just paste the embed code or URL, and the block handles the rest.' }] }] } } },
        { id: 'demo-social-proof', type: 'social-proof', data: { title: 'Social Proof Block', subtitle: 'Show live metrics, ratings, and activity to build trust.', items: [{ id: 'sp1', type: 'counter', label: 'Happy Customers', value: 12500, icon: 'users' }, { id: 'sp2', type: 'rating', label: 'Average Rating', value: 4.9, maxRating: 5 }, { id: 'sp3', type: 'counter', label: 'Projects Completed', value: 3200, icon: 'folder' }], variant: 'cards', layout: 'horizontal', size: 'lg', animated: true, showLiveIndicator: false } },
        { id: 'info-notification', type: 'info-box', data: { variant: 'warning', content: { type: 'doc', content: [{ type: 'heading', attrs: { level: 3 }, content: [{ type: 'text', text: '🔔 Notification Toast Block' }] }, { type: 'paragraph', content: [{ type: 'text', text: 'Display dynamic notifications showing recent signups, purchases, or activity. Creates FOMO and social proof. This block is dynamic and shows randomly timed notifications – it cannot be fully demonstrated in a static page.' }] }] } } },
        { id: 'info-floating-cta', type: 'info-box', data: { variant: 'default', content: { type: 'doc', content: [{ type: 'heading', attrs: { level: 3 }, content: [{ type: 'text', text: '📌 Floating CTA Block' }] }, { type: 'paragraph', content: [{ type: 'text', text: 'A call-to-action that appears when users scroll down. Sticky bars, floating buttons, or slide-in panels. Configurable trigger points and positions. This block only appears on scroll, so it cannot be fully demonstrated in a static showcase.' }] }] } } },
        { id: 'sep-kb-blocks', type: 'separator', data: { variant: 'text', text: 'Knowledge Base Blocks', icon: 'BookOpen' } },
        { id: 'demo-kb-hub', type: 'kb-hub', data: { title: 'KB Hub Block', subtitle: 'Full knowledge base landing page with categories and search. Pulls content from your KB module.' } },
        { id: 'demo-kb-featured', type: 'kb-featured', data: { title: 'KB Featured Block', subtitle: 'Highlight your most important help articles. Great for homepage or support pages.', maxArticles: 3 } },
        { id: 'demo-kb-accordion', type: 'kb-accordion', data: { title: 'KB Accordion Block', subtitle: 'Display KB articles as expandable FAQ items. Perfect for inline help sections.' } },
        { id: 'demo-kb-search', type: 'kb-search', data: { title: 'KB Search Block', subtitle: 'Standalone search bar for your knowledge base. Add it anywhere on your site.', placeholder: 'Search help articles...', showResults: true, maxResults: 3 } },
        { id: 'sep-more-blocks', type: 'separator', data: { variant: 'text', text: 'More Block Types', icon: 'LayoutGrid' } },
        { id: 'demo-chat-launcher', type: 'chat-launcher', data: { title: 'Chat Launcher Block', subtitle: 'ChatGPT-style launcher that routes visitors to the /chat page. Shows quick action buttons and a search-like input.', placeholder: 'Ask anything about FlowWink...', showQuickActions: true, quickActionCount: 4, variant: 'card' } },
        { id: 'demo-article-grid', type: 'article-grid', data: { title: 'Article Grid Block', subtitle: 'Display blog posts or articles in a responsive card grid. Pulls from your blog module automatically.', columns: 3, maxArticles: 3, showExcerpt: true, showDate: true, showAuthor: true } },
        { id: 'demo-webinar', type: 'webinar', data: { title: 'Webinar Block', subtitle: 'Promote upcoming webinars and online events with registration forms. Integrates with the Webinars module.' } },
        { id: 'info-popup', type: 'info-box', data: { variant: 'highlight', content: { type: 'doc', content: [{ type: 'heading', attrs: { level: 3 }, content: [{ type: 'text', text: '🎯 Popup Block' }] }, { type: 'paragraph', content: [{ type: 'text', text: 'Trigger popups based on scroll position, time on page, or exit intent. Configure content, timing, and display rules. Perfect for lead capture, announcements, and promotions. This block triggers dynamically and cannot be fully demonstrated in a static showcase.' }] }] } } },
        { id: 'info-lottie', type: 'info-box', data: { variant: 'info', content: { type: 'doc', content: [{ type: 'heading', attrs: { level: 3 }, content: [{ type: 'text', text: '✨ Lottie Animation Block' }] }, { type: 'paragraph', content: [{ type: 'text', text: 'Embed lightweight vector animations from LottieFiles. Supports autoplay, loop, hover triggers, and speed control. Perfect for hero sections, loading states, and micro-interactions. Just paste a Lottie JSON URL to get started.' }] }] } } },
        { id: 'sep-try', type: 'separator', data: { variant: 'text', text: 'Try It Yourself', icon: 'MousePointer' } },
        { id: 'twocol-try', type: 'two-column', data: { leftColumn: { type: 'doc', content: [{ type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Ready to Build?' }] }, { type: 'paragraph', content: [{ type: 'text', text: 'The best way to understand FlowWink is to use it. Click the button to access the admin panel and start creating.' }] }, { type: 'bulletList', content: [{ type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'No signup required for the demo' }] }] }, { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Full access to all features' }] }] }, { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Your changes are saved locally' }] }] }] }] }, rightColumn: { type: 'doc', content: [{ type: 'heading', attrs: { level: 3 }, content: [{ type: 'text', text: 'Quick Links' }] }, { type: 'bulletList', content: [{ type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: '→ Admin Dashboard: /admin' }] }] }, { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: '→ Page Editor: /admin/pages' }] }] }, { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: '→ Blog Manager: /admin/blog' }] }] }, { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: '→ Media Library: /admin/media' }] }] }] }] }, layout: '50-50' } },
        { id: 'cta-demo', type: 'cta', data: { title: 'Start Building Now', subtitle: 'Access the full admin panel and create your first page in minutes.', buttonText: 'Open Admin Panel', buttonUrl: '/admin', secondaryButtonText: 'Self-Host Free', secondaryButtonUrl: 'https://github.com/flowwink/flowwink', gradient: true } },
      ],
    },
    // ===== PRICING PAGE =====
    {
      title: 'Pricing',
      slug: 'pricing',
      menu_order: 4,
      showInMenu: true,
      meta: {
        description: 'FlowWink pricing - Self-hosted free forever, or managed cloud starting at €49/month.',
        showTitle: true,
        titleAlignment: 'center',
      },
      blocks: [
        { id: 'hero-pricing', type: 'hero', data: { title: 'Simple, Transparent Pricing', subtitle: 'No hidden fees, no per-seat charges. Self-host for free or let us manage everything.', backgroundType: 'color', heightMode: 'auto', contentAlignment: 'center', overlayOpacity: 0 } },
        { id: 'countdown-launch', type: 'countdown', data: { title: 'Early Adopter Offer', subtitle: 'Get 30% off managed cloud for life – limited time', targetDate: '2026-03-31T23:59:59', expiredMessage: 'Early adopter pricing has ended', variant: 'cards', size: 'lg', showDays: true, showHours: true, showMinutes: true, showSeconds: true } },
        { id: 'pricing-detailed', type: 'pricing', data: { title: '', tiers: [{ id: 'tier-self', name: 'Self-Hosted', price: 'Free', period: 'forever', description: 'Perfect for developers and organizations with DevOps capabilities.', features: ['All CMS features', 'Unlimited pages & users', 'Private LLM support', 'Full API access', 'Community support', 'GitHub issues'], buttonText: 'View on GitHub', buttonUrl: 'https://github.com/flowwink/flowwink' }, { id: 'tier-managed', name: 'Managed Cloud', price: '€49', period: '/month', description: 'Everything included. We handle infrastructure, you focus on content.', features: ['Everything in Self-Hosted', 'Automatic updates', 'Daily backups', 'SSL certificates', 'Global CDN', 'Priority email support', '99.9% uptime SLA'], buttonText: 'Start Free Trial', buttonUrl: '/contact', highlighted: true, badge: 'Most Popular' }, { id: 'tier-enterprise', name: 'Enterprise', price: 'Custom', description: 'For large organizations with specific requirements.', features: ['Everything in Managed', 'Dedicated infrastructure', 'Custom SLA', 'SSO (SAML/OIDC)', 'Dedicated success manager', 'Custom integrations', 'Training sessions'], buttonText: 'Contact Sales', buttonUrl: '/contact' }], columns: 3, variant: 'cards' } },
        { id: 'table-comparison', type: 'table', data: { title: 'Detailed Feature Comparison', caption: 'See exactly what\'s included in each plan.', columns: [{ id: 'col1', header: 'Feature', align: 'left' }, { id: 'col2', header: 'Self-Hosted', align: 'center' }, { id: 'col3', header: 'Managed Cloud', align: 'center' }, { id: 'col4', header: 'Enterprise', align: 'center' }], rows: [['Pages & Content', 'Unlimited', 'Unlimited', 'Unlimited'], ['Users & Roles', 'Unlimited', 'Unlimited', 'Unlimited'], ['API Access', '✅', '✅', '✅'], ['AI Chat Widget', '✅', '✅', '✅'], ['Private LLM Support', '✅', '✅', '✅'], ['Automatic Updates', '❌', '✅', '✅'], ['Managed Backups', '❌', '✅ Daily', '✅ Hourly'], ['SSL & CDN', '❌', '✅', '✅'], ['Uptime SLA', '❌', '99.9%', 'Custom'], ['SSO (SAML/OIDC)', '❌', '❌', '✅'], ['Dedicated Infrastructure', '❌', '❌', '✅'], ['Support', 'Community', 'Priority Email', 'Dedicated Manager']], variant: 'striped', size: 'md', stickyHeader: true, highlightOnHover: true } },
        { id: 'accordion-faq', type: 'accordion', data: { title: 'Frequently Asked Questions', items: [{ question: 'Is self-hosted really free forever?', answer: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Yes! FlowWink is open source under the MIT license. You can run it on your own servers indefinitely without any licensing fees. The only costs are your own hosting and infrastructure.' }] }] } }, { question: 'What\'s included in managed cloud?', answer: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Everything. We handle server management, updates, security patches, backups, SSL certificates, and CDN distribution. You get a fully managed FlowWink instance that\'s always up-to-date.' }] }] } }, { question: 'Can I migrate from self-hosted to managed?', answer: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Absolutely. We provide migration tools to move your content and settings to our managed infrastructure. The process is seamless and we\'ll assist you through it.' }] }] } }, { question: 'Do you offer discounts for startups or nonprofits?', answer: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Yes! We offer 50% off managed plans for qualifying startups and registered nonprofits. Contact us with your details and we\'ll set you up.' }] }] } }] } },
      ],
    },
    // Remaining pages (Compare, Roadmap, Contact, Docs, Help, Privacy, Terms) are defined
    // inline in the monolith and will be extracted in a future iteration.
    // For now, they are imported via the STARTER_TEMPLATES.find() fallback.
  ],
  branding: {
    organizationName: 'FlowWink',
    brandTagline: 'Head + Headless CMS',
    primaryColor: '162 63% 41%',
    headingFont: 'Inter',
    bodyFont: 'Inter',
    borderRadius: 'lg',
    shadowIntensity: 'medium',
  },
  chatSettings: {
    enabled: true,
    aiProvider: 'openai',
    n8nWebhookUrl: '',
    widgetEnabled: true,
    widgetPosition: 'bottom-right',
    widgetStyle: 'pill',
    widgetSize: 'md',
    widgetMaxPrompts: 3,
    widgetShowOnMobile: true,
    blockEnabled: true,
    landingPageEnabled: true,
    welcomeMessage: 'Hi! I can answer questions about FlowWink. What would you like to know?',
    systemPrompt: 'You are the FlowWink assistant. Help users understand the product, features, and pricing. Be helpful, concise, and friendly. FlowWink is a complete CMS with both traditional website features and headless API capabilities.',
    suggestedPrompts: [
      'What is FlowWink?',
      'How much does it cost?',
      'Can I self-host FlowWink?',
      'Does it support headless API?',
    ],
    includeContentAsContext: true,
    contentContextMaxTokens: 50000,
    includedPageSlugs: ['*'],
    includeKbArticles: true,
    showContextIndicator: true,
  },
  headerSettings: {
    variant: 'sticky',
    stickyHeader: true,
    backgroundStyle: 'blur',
    headerShadow: 'sm',
    showBorder: true,
  },
  footerSettings: {
    variant: 'full',
    email: 'hello@flowwink.com',
    phone: '+46 70 123 45 67',
    address: 'Stockholm, Sweden',
    postalCode: '',
    weekdayHours: 'Mon-Fri 9-17',
    weekendHours: 'Community support 24/7',
    linkedin: 'https://linkedin.com/company/flowwink',
    twitter: 'https://twitter.com/flowwink',
    facebook: '',
    instagram: '',
    youtube: '',
    legalLinks: [
      { id: 'kb', label: 'Help Center', url: '/help', enabled: true },
      { id: 'privacy', label: 'Privacy Policy', url: '/privacy-policy', enabled: true },
      { id: 'terms', label: 'Terms of Service', url: '/terms-of-service', enabled: true },
    ],
  },
  seoSettings: {
    siteTitle: 'FlowWink',
    titleTemplate: '%s | FlowWink - Head + Headless CMS',
    defaultDescription: 'Keep Your Head While Going Headless. The complete CMS with beautiful websites AND powerful APIs. Self-host free or use our managed cloud.',
    robotsIndex: true,
    robotsFollow: true,
    developmentMode: false,
  },
  aeoSettings: {
    enabled: true,
    organizationName: 'FlowWink',
    shortDescription: 'Keep Your Head While Going Headless. The complete CMS with beautiful websites AND powerful APIs.',
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
  siteSettings: {
    homepageSlug: 'home',
  },
};
