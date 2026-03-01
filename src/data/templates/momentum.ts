/**
 * Momentum Template
 * 
 * Stunning single-page template with YC-style dark gradient design.
 * Bold typography, smooth animations, and maximum impact.
 */
import type { StarterTemplate } from './types';

const momentumPages: StarterTemplate['pages'] = [
  {
    title: 'Home',
    slug: 'home',
    isHomePage: true,
    menu_order: 1,
    showInMenu: true,
    meta: {
      description: 'Ship faster. Scale smarter. The developer platform that turns ideas into production.',
      showTitle: false,
      titleAlignment: 'center',
    },
    blocks: [
      {
        id: 'announcement-launch',
        type: 'announcement-bar',
        data: {
          message: '🚀 Now in public beta — Start building free today',
          linkText: 'Get Started',
          linkUrl: '#pricing',
          variant: 'gradient',
          dismissable: true,
          sticky: false,
        },
      },
      {
        id: 'hero-1',
        type: 'hero',
        data: {
          title: 'Ship faster. Scale smarter.',
          subtitle: 'The developer platform that turns ideas into production in minutes, not months. Join 50,000+ teams building the future.',
          backgroundType: 'video',
          videoUrl: 'https://assets.mixkit.co/videos/preview/mixkit-digital-animation-of-futuristic-devices-99786-large.mp4',
          heightMode: 'viewport',
          contentAlignment: 'center',
          overlayOpacity: 85,
          titleAnimation: 'slide-up',
          showScrollIndicator: true,
          primaryButton: { text: 'Start Building Free', url: '#pricing' },
          secondaryButton: { text: 'Watch Demo', url: '#features' },
        },
      },
      {
        id: 'divider-hero',
        type: 'section-divider',
        data: {
          shape: 'diagonal',
          height: 'md',
          color: 'hsl(240, 10%, 10%)',
          bgColor: 'transparent',
        },
      },
      {
        id: 'stats-1',
        type: 'stats',
        data: {
          title: 'Trusted by developers worldwide',
          stats: [
            { value: '50K+', label: 'Active Projects', icon: 'Folder' },
            { value: '99.9%', label: 'Uptime SLA', icon: 'Shield' },
            { value: '150+', label: 'Integrations', icon: 'Puzzle' },
            { value: '<1s', label: 'Deploy Time', icon: 'Zap' },
          ],
        },
      },
      {
        id: 'marquee-tech',
        type: 'marquee',
        data: {
          items: [
            { id: 'm1', text: 'React', icon: '⚛️' },
            { id: 'm2', text: 'TypeScript', icon: '📘' },
            { id: 'm3', text: 'Tailwind', icon: '🎨' },
            { id: 'm4', text: 'Supabase', icon: '⚡' },
            { id: 'm5', text: 'Vite', icon: '🚀' },
            { id: 'm6', text: 'AI-Powered', icon: '✨' },
          ],
          speed: 'normal',
          direction: 'left',
          pauseOnHover: true,
          variant: 'default',
          separator: '•',
        },
      },
      {
        id: 'bento-features',
        type: 'bento-grid',
        data: {
          columns: 3,
          variant: 'glass',
          gap: 'md',
          staggeredReveal: true,
          items: [
            { id: 'bg1', title: 'AI Copilot', description: 'Code suggestions powered by the latest AI models. Write better code, faster.', icon: 'Sparkles', span: 'wide', accentColor: '#A855F7' },
            { id: 'bg2', title: 'Instant Deploy', description: 'Push to production in one click. Zero configuration, infinite possibilities.', icon: 'Rocket', accentColor: '#F97316' },
            { id: 'bg3', title: 'Enterprise Security', description: 'SOC 2 Type II, GDPR, and HIPAA compliant from day one.', icon: 'Shield', accentColor: '#22C55E' },
            { id: 'bg4', title: 'Modular APIs', description: 'Build anything with composable blocks. Mix, match, and extend.', icon: 'Blocks', accentColor: '#3B82F6' },
            { id: 'bg5', title: 'Global Edge', description: '300+ edge locations worldwide. Your users get speed, everywhere.', icon: 'Globe', span: 'wide', accentColor: '#06B6D4' },
            { id: 'bg6', title: 'Team Collaboration', description: 'Real-time editing, branching, and reviews. Built for modern teams.', icon: 'Users', accentColor: '#EC4899' },
          ],
        },
      },
      {
        id: 'two-col-1',
        type: 'two-column',
        data: {
          content: {
            type: 'doc',
            content: [
              { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'AI-Powered Development' }] },
              { type: 'paragraph', content: [{ type: 'text', text: 'Stop writing boilerplate. Our AI understands your codebase and generates production-ready code that actually works.' }] },
              { type: 'bulletList', content: [
                { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Context-aware code completion' }] }] },
                { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Automatic documentation generation' }] }] },
                { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Intelligent refactoring suggestions' }] }] },
                { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Built-in security scanning' }] }] },
              ]},
            ],
          },
          imageSrc: 'https://images.unsplash.com/photo-1555066931-4365d14bab8c?w=800',
          imageAlt: 'Code on screen',
          imagePosition: 'right',
        },
      },
      {
        id: 'two-col-2',
        type: 'two-column',
        data: {
          content: {
            type: 'doc',
            content: [
              { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Enterprise-Grade Infrastructure' }] },
              { type: 'paragraph', content: [{ type: 'text', text: 'From your first 100 users to your first 100 million. Auto-scaling, self-healing infrastructure that just works.' }] },
              { type: 'bulletList', content: [
                { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Auto-scaling compute' }] }] },
                { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Global CDN included' }] }] },
                { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'DDoS protection' }] }] },
                { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Automatic failover' }] }] },
              ]},
            ],
          },
          imageSrc: 'https://images.unsplash.com/photo-1558494949-ef010cbdcc31?w=800',
          imageAlt: 'Server infrastructure',
          imagePosition: 'left',
        },
      },
      {
        id: 'parallax-tech',
        type: 'parallax-section',
        data: {
          backgroundImage: 'https://images.unsplash.com/photo-1518770660439-4636190af475?w=1920',
          title: 'Built for the Future',
          subtitle: 'Infrastructure that scales from your first user to your first million.',
          height: 'sm',
          textColor: 'light',
          overlayOpacity: 70,
          contentAlignment: 'center',
        },
      },
      {
        id: 'social-proof-dev',
        type: 'social-proof',
        data: {
          title: 'Developer Activity',
          items: [
            { id: 'sp1', type: 'counter', icon: 'users', label: 'Active Developers', value: '50K', suffix: '+' },
            { id: 'sp2', type: 'rating', icon: 'star', label: 'Developer Rating', value: '4.9', maxRating: 5, rating: 4.9 },
            { id: 'sp3', type: 'activity', icon: 'eye', label: 'Deploys Today', text: '12,847 deploys in the last 24h' },
          ],
          variant: 'minimal',
          layout: 'horizontal',
          size: 'md',
          animated: true,
        },
      },
      {
        id: 'quote-1',
        type: 'quote',
        data: {
          text: 'We went from idea to YC Demo Day in 6 weeks. Momentum handled all the infrastructure complexity so we could focus on building our product.',
          author: 'Alex Chen',
          source: 'Co-founder, Series A Startup',
          variant: 'styled',
        },
      },
      {
        id: 'chat-launcher-home',
        type: 'chat-launcher',
        data: {
          title: 'Quick Question?',
          placeholder: 'Ask about features, pricing, or getting started...',
          showQuickActions: true,
          quickActionCount: 3,
          variant: 'minimal',
        },
      },
      {
        id: 'accordion-1',
        type: 'accordion',
        data: {
          title: 'Frequently Asked Questions',
          items: [
            { question: 'How does pricing work?', answer: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Start free with generous limits. As you scale, pay only for what you use. No surprises, no hidden fees. We also offer startup credits for qualifying companies.' }] }] } },
            { question: 'Is my data secure?', answer: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Absolutely. We are SOC 2 Type II certified, GDPR compliant, and offer HIPAA-compliant options for healthcare companies. All data is encrypted at rest and in transit.' }] }] } },
            { question: 'Can I migrate from my current platform?', answer: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Yes! We offer free migration assistance for teams coming from other platforms. Most migrations complete in under 24 hours with zero downtime.' }] }] } },
            { question: 'What kind of support do you offer?', answer: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'All plans include community support. Pro and Enterprise plans include dedicated support with guaranteed response times and a named account manager.' }] }] } },
          ],
        },
      },
      {
        id: 'cta-1',
        type: 'cta',
        data: {
          title: 'Ready to ship?',
          subtitle: 'Join 50,000+ developers building the next generation of applications.',
          buttonText: 'Start Building Free',
          buttonUrl: '#pricing',
          gradient: true,
        },
      },
    ],
  },
];

export const momentumTemplate: StarterTemplate = {
  id: 'momentum',
  name: 'Momentum',
  description: 'Stunning single-page template with YC-style dark gradient design. Bold typography, smooth animations, and maximum impact.',
  category: 'startup',
  icon: 'Zap',
  tagline: 'One page. Maximum impact.',
  aiChatPosition: 'Disabled for clean single-page experience',
  pages: momentumPages,
  requiredModules: ['forms', 'leads'],
  branding: {
    organizationName: 'Momentum',
    brandTagline: 'Build the Future',
    primaryColor: '250 91% 64%',
    secondaryColor: '240 10% 10%',
    accentColor: '180 100% 50%',
    headingFont: 'Plus Jakarta Sans',
    bodyFont: 'Inter',
    borderRadius: 'lg',
    shadowIntensity: 'medium',
    allowThemeToggle: false,
    defaultTheme: 'dark',
  },
  chatSettings: {
    enabled: false,
    widgetEnabled: false,
  },
  headerSettings: {
    variant: 'clean',
    stickyHeader: false,
    backgroundStyle: 'transparent',
    headerShadow: 'none',
    showBorder: false,
    headerHeight: 'tall',
    linkColorScheme: 'contrast',
  },
  footerSettings: {
    variant: 'minimal',
    email: 'hello@momentum.dev',
    phone: '',
    address: 'San Francisco, CA',
    postalCode: '',
    weekdayHours: '',
    weekendHours: '',
    showBrand: true,
    showQuickLinks: false,
    showContact: false,
    showHours: false,
    legalLinks: [
      { id: 'privacy', label: 'Privacy', url: '/privacy-policy', enabled: true },
      { id: 'terms', label: 'Terms', url: '/terms-of-service', enabled: true },
    ],
  },
  seoSettings: {
    siteTitle: 'Momentum',
    titleTemplate: '%s | Momentum',
    defaultDescription: 'Ship faster. Scale smarter. The developer platform that turns ideas into production in minutes.',
    robotsIndex: true,
    robotsFollow: true,
    developmentMode: false,
  },
  cookieBannerSettings: {
    enabled: true,
  },
  siteSettings: {
    homepageSlug: 'home',
  },
};
