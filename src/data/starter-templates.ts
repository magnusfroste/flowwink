import { ContentBlock, PageMeta, FooterBlockData } from '@/types/cms';
import { BrandingSettings, ChatSettings, SeoSettings, CookieBannerSettings } from '@/hooks/useSiteSettings';
import { 
  launchpadBlogPosts, 
  trustcorpBlogPosts, 
  securehealthBlogPosts, 
  momentumBlogPosts, 
  flowwinkBlogPosts 
} from './template-blog-posts';
import { 
  flowwinkKbCategories, 
  launchpadKbCategories, 
  trustcorpKbCategories, 
  securehealthKbCategories,
  kbClassicCategories,
  aiHubCategories,
  hybridHelpCategories,
  TemplateKbCategory 
} from './template-kb-articles';

// Help style for templates
export type HelpStyle = 'kb-classic' | 'ai-hub' | 'hybrid' | 'none';

// Page definition within a template
export interface TemplatePage {
  title: string;
  slug: string;
  isHomePage?: boolean;
  blocks: ContentBlock[];
  meta: PageMeta;
  menu_order?: number;
  showInMenu?: boolean;
}

// Blog post definition within a template
export interface TemplateBlogPost {
  title: string;
  slug: string;
  excerpt: string;
  featured_image?: string;
  featured_image_alt?: string;
  content: ContentBlock[];
  meta?: {
    description?: string;
  };
  is_featured?: boolean;
}

// Full site template
export interface StarterTemplate {
  id: string;
  name: string;
  description: string;
  category: 'startup' | 'enterprise' | 'compliance' | 'platform' | 'helpcenter';
  icon: string;
  tagline: string;
  aiChatPosition: string;
  helpStyle?: HelpStyle;
  
  // Multi-page support
  pages: TemplatePage[];
  
  // Blog posts (optional)
  blogPosts?: TemplateBlogPost[];
  
  // Knowledge Base (optional)
  kbCategories?: TemplateKbCategory[];
  
  // Site-wide settings
  branding: Partial<BrandingSettings>;
  chatSettings: Partial<ChatSettings>;
  footerSettings: Partial<FooterBlockData>;
  seoSettings: Partial<SeoSettings>;
  cookieBannerSettings: Partial<CookieBannerSettings>;
  
  // General settings
  siteSettings: {
    homepageSlug: string;
  };
}

// =====================================================
// LAUNCHPAD - Startup Template (4 pages)
// =====================================================
const launchpadPages: TemplatePage[] = [
  {
    title: 'Home',
    slug: 'home',
    isHomePage: true,
    menu_order: 1,
    showInMenu: true,
    meta: {
      description: 'Launch your vision with our cutting-edge platform',
      showTitle: false,
      titleAlignment: 'center',
    },
    blocks: [
      // ANNOUNCEMENT BAR - Top banner for announcements
      {
        id: 'announcement-launch',
        type: 'announcement-bar',
        data: {
          message: '🚀 We just launched v2.0 with AI-powered features!',
          linkText: 'See what\'s new',
          linkUrl: '/product',
          variant: 'gradient',
          dismissable: true,
          sticky: false,
        },
      },
      {
        id: 'hero-1',
        type: 'hero',
        data: {
          title: 'Launch Your Vision',
          subtitle: 'The platform that scales with your ambition. Build faster, iterate smarter, grow exponentially.',
          backgroundType: 'video',
          videoUrl: 'https://assets.mixkit.co/videos/preview/mixkit-abstract-technology-network-connections-27612-large.mp4',
          heightMode: 'viewport',
          contentAlignment: 'center',
          overlayOpacity: 70,
          titleAnimation: 'slide-up',
          showScrollIndicator: true,
          primaryButton: { text: 'Get Started Free', url: '/contact' },
          secondaryButton: { text: 'Learn More', url: '/product' },
        },
      },
      {
        id: 'stats-1',
        type: 'stats',
        data: {
          title: 'Trusted by Innovators',
          stats: [
            { value: '10K+', label: 'Active Users', icon: 'Users' },
            { value: '99.9%', label: 'Uptime SLA', icon: 'Shield' },
            { value: '50+', label: 'Integrations', icon: 'Plug' },
            { value: '24/7', label: 'Support', icon: 'HeadphonesIcon' },
          ],
        },
      },
      // LOGOS - Trusted by companies
      {
        id: 'logos-1',
        type: 'logos',
        data: {
          title: 'Trusted by Industry Leaders',
          logos: [
            { id: 'l1', name: 'TechCorp', logo: 'https://images.unsplash.com/photo-1611162617474-5b21e879e113?w=120&h=40&fit=crop' },
            { id: 'l2', name: 'InnovateCo', logo: 'https://images.unsplash.com/photo-1611162616305-c69b3fa7fbe0?w=120&h=40&fit=crop' },
            { id: 'l3', name: 'StartupX', logo: 'https://images.unsplash.com/photo-1611162618071-b39a2ec055fb?w=120&h=40&fit=crop' },
            { id: 'l4', name: 'CloudFirst', logo: 'https://images.unsplash.com/photo-1611162617213-7d7a39e9b1d7?w=120&h=40&fit=crop' },
            { id: 'l5', name: 'DataFlow', logo: 'https://images.unsplash.com/photo-1611162616475-46b635cb6868?w=120&h=40&fit=crop' },
          ],
          columns: 5,
          layout: 'grid',
          variant: 'grayscale',
          logoSize: 'md',
        },
      },
      {
        id: 'two-col-1',
        type: 'two-column',
        data: {
          content: {
            type: 'doc',
            content: [
              { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Built for Speed' }] },
              { type: 'paragraph', content: [{ type: 'text', text: 'Deploy in seconds, not hours. Our streamlined infrastructure means your ideas go live the moment they\'re ready.' }] },
              { type: 'bulletList', content: [
                { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'One-click deployments' }] }] },
                { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Auto-scaling infrastructure' }] }] },
                { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Global CDN included' }] }] },
              ]},
            ],
          },
          imageSrc: 'https://images.unsplash.com/photo-1551434678-e076c223a692?w=800',
          imageAlt: 'Team collaborating on laptop',
          imagePosition: 'right',
        },
      },
      // TESTIMONIALS - Social proof
      {
        id: 'testimonials-1',
        type: 'testimonials',
        data: {
          title: 'What Our Customers Say',
          testimonials: [
            {
              id: 't1',
              content: 'We went from idea to production in just 2 weeks. LaunchPad eliminated all the infrastructure headaches.',
              author: 'Sarah Chen',
              role: 'CTO',
              company: 'TechFlow',
              rating: 5,
            },
            {
              id: 't2',
              content: 'The best developer experience I\'ve ever had. The team actually listens to feedback and ships improvements weekly.',
              author: 'Marcus Lindberg',
              role: 'Lead Developer',
              company: 'InnovateCo',
              rating: 5,
            },
            {
              id: 't3',
              content: 'Scaled from 100 to 100,000 users without touching a single config file. It just works.',
              author: 'Emily Rodriguez',
              role: 'Founder',
              company: 'GrowthLab',
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
      // BADGE - Trust indicators
      {
        id: 'badge-trust',
        type: 'badge',
        data: {
          title: 'Trusted & Certified',
          subtitle: 'Built with security and compliance in mind',
          badges: [
            { id: 'b1', title: 'SOC 2 Type II', subtitle: 'Certified', icon: 'shield' },
            { id: 'b2', title: 'GDPR', subtitle: 'Compliant', icon: 'check' },
            { id: 'b3', title: '99.9%', subtitle: 'Uptime SLA', icon: 'award' },
            { id: 'b4', title: 'ISO 27001', subtitle: 'Certified', icon: 'medal' },
          ],
          variant: 'cards',
          columns: 4,
          size: 'md',
          showTitles: true,
        },
      },
      // NEWSLETTER - Email subscription
      {
        id: 'newsletter-1',
        type: 'newsletter',
        data: {
          title: 'Stay in the Loop',
          description: 'Get product updates, tips, and insights delivered to your inbox.',
          buttonText: 'Subscribe',
          successMessage: 'Thanks for subscribing! Check your email to confirm.',
          variant: 'default',
          showNameField: false,
        },
      },
      {
        id: 'cta-1',
        type: 'cta',
        data: {
          title: 'Ready to Launch?',
          subtitle: 'Join thousands of teams shipping faster with our platform.',
          buttonText: 'Start Building Today',
          buttonUrl: '/contact',
          gradient: true,
        },
      },
    ],
  },
  {
    title: 'Product',
    slug: 'product',
    menu_order: 2,
    showInMenu: true,
    meta: {
      description: 'Explore our powerful features designed for modern teams',
      showTitle: true,
      titleAlignment: 'center',
    },
    blocks: [
      {
        id: 'hero-1',
        type: 'hero',
        data: {
          title: 'Everything You Need to Ship Fast',
          subtitle: 'A complete toolkit for modern development teams. From idea to production in record time.',
          backgroundType: 'color',
          heightMode: '60vh',
          contentAlignment: 'center',
          overlayOpacity: 0,
          titleAnimation: 'fade-in',
        },
      },
      // FEATURES - Core capabilities
      {
        id: 'features-1',
        type: 'features',
        data: {
          title: 'Core Features',
          subtitle: 'Everything you need to build and scale.',
          features: [
            { id: 'f1', icon: 'Zap', title: 'Instant Deploy', description: 'Push to production in seconds with zero configuration.' },
            { id: 'f2', icon: 'Shield', title: 'Enterprise Security', description: 'SOC 2 compliant from day one with end-to-end encryption.' },
            { id: 'f3', icon: 'BarChart3', title: 'Analytics', description: 'Real-time insights and metrics to optimize performance.' },
            { id: 'f4', icon: 'Puzzle', title: 'Integrations', description: '50+ pre-built connectors to your favorite tools.' },
            { id: 'f5', icon: 'Users', title: 'Team Management', description: 'Collaborate seamlessly with role-based access control.' },
            { id: 'f6', icon: 'Cpu', title: 'AI-Powered', description: 'Smart automation built-in to accelerate your workflow.' },
          ],
          columns: 3,
          layout: 'grid',
          variant: 'cards',
          iconStyle: 'circle',
        },
      },
      // TIMELINE - How it works
      {
        id: 'timeline-1',
        type: 'timeline',
        data: {
          title: 'How It Works',
          subtitle: 'Get started in three simple steps.',
          steps: [
            { id: 's1', icon: 'Download', title: 'Sign Up', description: 'Create your account in under a minute. No credit card required.', date: 'Step 1' },
            { id: 's2', icon: 'Settings', title: 'Configure', description: 'Connect your tools and customize your workspace.', date: 'Step 2' },
            { id: 's3', icon: 'Rocket', title: 'Launch', description: 'Deploy your first project and start growing.', date: 'Step 3' },
          ],
          variant: 'horizontal',
          showDates: true,
        },
      },
      {
        id: 'two-col-1',
        type: 'two-column',
        data: {
          content: {
            type: 'doc',
            content: [
              { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Developer Experience First' }] },
              { type: 'paragraph', content: [{ type: 'text', text: 'We obsess over the details so you can focus on building. Every feature is designed to reduce friction and increase velocity.' }] },
            ],
          },
          imageSrc: 'https://images.unsplash.com/photo-1460925895917-afdab827c52f?w=800',
          imageAlt: 'Dashboard analytics',
          imagePosition: 'left',
        },
      },
      {
        id: 'two-col-2',
        type: 'two-column',
        data: {
          content: {
            type: 'doc',
            content: [
              { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Scale Without Limits' }] },
              { type: 'paragraph', content: [{ type: 'text', text: 'From your first 100 users to your first million. Our platform grows with you, automatically handling traffic spikes.' }] },
            ],
          },
          imageSrc: 'https://images.unsplash.com/photo-1551288049-bebda4e38f71?w=800',
          imageAlt: 'Growth chart',
          imagePosition: 'right',
        },
      },
      {
        id: 'cta-1',
        type: 'cta',
        data: {
          title: 'See It in Action',
          subtitle: 'Schedule a personalized demo with our team.',
          buttonText: 'Book Demo',
          buttonUrl: '/contact',
          gradient: true,
        },
      },
    ],
  },
  {
    title: 'Pricing',
    slug: 'pricing',
    menu_order: 3,
    showInMenu: true,
    meta: {
      description: 'Simple, transparent pricing that scales with you',
      showTitle: true,
      titleAlignment: 'center',
    },
    blocks: [
      {
        id: 'hero-1',
        type: 'hero',
        data: {
          title: 'Simple, Transparent Pricing',
          subtitle: 'Start free, scale as you grow. No hidden fees, no surprises.',
          backgroundType: 'color',
          heightMode: 'auto',
          contentAlignment: 'center',
          overlayOpacity: 0,
        },
      },
      // COUNTDOWN - Early bird urgency
      {
        id: 'countdown-earlybird',
        type: 'countdown',
        data: {
          title: 'Early Bird Pricing Ends Soon',
          subtitle: 'Lock in 30% off for life',
          targetDate: '2026-03-31T23:59:59',
          expiredMessage: 'Early bird pricing has ended',
          variant: 'cards',
          size: 'lg',
          showDays: true,
          showHours: true,
          showMinutes: true,
          showSeconds: true,
        },
      },
      // PRICING - Actual pricing tiers
      {
        id: 'pricing-1',
        type: 'pricing',
        data: {
          tiers: [
            {
              id: 'tier-free',
              name: 'Starter',
              price: 'Free',
              period: 'forever',
              description: 'Perfect for getting started and testing ideas.',
              features: ['1 project', '1,000 API calls/month', 'Community support', 'Basic analytics'],
              buttonText: 'Get Started',
              buttonUrl: '/contact',
            },
            {
              id: 'tier-pro',
              name: 'Pro',
              price: '$49',
              period: '/month',
              description: 'For growing teams who need more power.',
              features: ['Unlimited projects', '100,000 API calls/month', 'Priority support', 'Advanced analytics', 'Team collaboration', 'Custom domains'],
              buttonText: 'Start Free Trial',
              buttonUrl: '/contact',
              highlighted: true,
              badge: 'Most Popular',
            },
            {
              id: 'tier-team',
              name: 'Team',
              price: '$199',
              period: '/month',
              description: 'For organizations that need enterprise features.',
              features: ['Everything in Pro', 'Unlimited API calls', 'SSO & SAML', 'Dedicated support', 'SLA guarantee', 'Audit logs'],
              buttonText: 'Contact Sales',
              buttonUrl: '/contact',
            },
          ],
          columns: 3,
          variant: 'cards',
        },
      },
      // COMPARISON - Feature comparison
      {
        id: 'comparison-1',
        type: 'comparison',
        data: {
          title: 'Compare Plans',
          products: [
            { id: 'p1', name: 'Starter' },
            { id: 'p2', name: 'Pro', highlighted: true },
            { id: 'p3', name: 'Team' },
          ],
          features: [
            { id: 'f1', name: 'Projects', values: ['1', 'Unlimited', 'Unlimited'] },
            { id: 'f2', name: 'API Calls', values: ['1K/mo', '100K/mo', 'Unlimited'] },
            { id: 'f3', name: 'Team Members', values: ['1', '5', 'Unlimited'] },
            { id: 'f4', name: 'Custom Domains', values: [false, true, true] },
            { id: 'f5', name: 'Priority Support', values: [false, true, true] },
            { id: 'f6', name: 'SSO/SAML', values: [false, false, true] },
            { id: 'f7', name: 'SLA Guarantee', values: [false, false, true] },
          ],
          variant: 'striped',
          showPrices: false,
          showButtons: false,
          stickyHeader: false,
        },
      },
      {
        id: 'accordion-1',
        type: 'accordion',
        data: {
          title: 'Pricing FAQ',
          items: [
            { question: 'Can I try before I buy?', answer: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Absolutely! Our free tier includes everything you need to get started. No credit card required.' }] }] } },
            { question: 'What happens if I exceed my limits?', answer: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'We\'ll notify you before you hit any limits. You can upgrade anytime, and we\'ll never shut off your service unexpectedly.' }] }] } },
            { question: 'Do you offer discounts for startups?', answer: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Yes! We offer 50% off for the first year for qualifying startups. Contact us for details.' }] }] } },
            { question: 'Can I cancel anytime?', answer: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Yes, you can cancel your subscription at any time. We don\'t believe in lock-ins.' }] }] } },
          ],
        },
      },
      {
        id: 'cta-1',
        type: 'cta',
        data: {
          title: 'Ready to Get Started?',
          subtitle: 'Join thousands of teams already building with us.',
          buttonText: 'Start Free Trial',
          buttonUrl: '/contact',
          gradient: true,
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
        id: 'hero-1',
        type: 'hero',
        data: {
          title: 'Let\'s Talk',
          subtitle: 'Have questions? We\'d love to hear from you.',
          backgroundType: 'color',
          heightMode: 'auto',
          contentAlignment: 'center',
          overlayOpacity: 0,
        },
      },
      {
        id: 'chat-1',
        type: 'chat',
        data: {
          title: 'Quick Questions? Ask AI',
          height: 'sm',
          showSidebar: false,
          variant: 'card',
          initialPrompt: 'Hi! I\'m here to help you learn about our platform. What would you like to know?',
        },
      },
      // BOOKING - Schedule a demo
      {
        id: 'booking-1',
        type: 'booking',
        data: {
          title: 'Book a Demo',
          description: 'See LaunchPad in action with a personalized walkthrough.',
          mode: 'smart',
          submitButtonText: 'Confirm Booking',
          successMessage: 'Your demo is booked! We\'ll send you a confirmation email.',
          showPhoneField: true,
          variant: 'card',
        },
      },
      {
        id: 'contact-1',
        type: 'contact',
        data: {
          title: 'Get in Touch',
          email: 'hello@launchpad.io',
          phone: '+1 (555) 123-4567',
          address: 'San Francisco, CA',
          hours: [
            { day: 'Sales', time: 'Mon-Fri 9AM-6PM' },
            { day: 'Support', time: '24/7 Available' },
          ],
        },
      },
    ],
  },
  {
    title: 'Privacy Policy',
    slug: 'privacy-policy',
    menu_order: 99,
    showInMenu: false,
    meta: {
      description: 'How we collect, use and protect your personal data under GDPR',
      showTitle: true,
      titleAlignment: 'left',
    },
    blocks: [
      {
        id: 'text-1',
        type: 'text',
        data: {
          content: {
            type: 'doc',
            content: [
              { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Introduction' }] },
              { type: 'paragraph', content: [{ type: 'text', text: 'We are committed to protecting your privacy and handling your personal data with care. This policy describes how we collect, use, and protect your information in accordance with the General Data Protection Regulation (GDPR).' }] },
              { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Data Controller' }] },
              { type: 'paragraph', content: [{ type: 'text', text: 'LaunchPad Inc. is the data controller for the processing of your personal data. You can reach us at hello@launchpad.io.' }] },
              { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'What Data We Collect' }] },
              { type: 'paragraph', content: [{ type: 'text', text: 'We collect information that you provide to us, for example when you create an account, contact us, or use our services. This may include name, email address, phone number, and other relevant information.' }] },
              { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'How We Use Your Data' }] },
              { type: 'bulletList', content: [
                { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'To provide and improve our services' }] }] },
                { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'To communicate with you about your use of the service' }] }] },
                { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'To comply with legal obligations' }] }] },
                { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'To send relevant information and marketing (with your consent)' }] }] },
              ]},
              { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Your Rights' }] },
              { type: 'paragraph', content: [{ type: 'text', text: 'Under GDPR, you have the right to access, rectify, and erase your personal data. You also have the right to restrict processing, object to processing, and the right to data portability.' }] },
              { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Cookies' }] },
              { type: 'paragraph', content: [{ type: 'text', text: 'We use cookies to improve your experience on our website. You can manage your cookie preferences through your browser settings.' }] },
              { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Contact' }] },
              { type: 'paragraph', content: [{ type: 'text', text: 'Questions about how we handle your personal data? Contact us at hello@launchpad.io.' }] },
            ],
          },
        },
      },
    ],
  },
  {
    title: 'Terms of Service',
    slug: 'terms-of-service',
    menu_order: 100,
    showInMenu: false,
    meta: {
      description: 'Terms and conditions for using our services',
      showTitle: true,
      titleAlignment: 'left',
    },
    blocks: [
      {
        id: 'text-1',
        type: 'text',
        data: {
          content: {
            type: 'doc',
            content: [
              { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Agreement to Terms' }] },
              { type: 'paragraph', content: [{ type: 'text', text: 'By accessing or using LaunchPad services, you agree to be bound by these Terms of Service. If you disagree with any part of these terms, you may not access our services.' }] },
              { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Use of Service' }] },
              { type: 'paragraph', content: [{ type: 'text', text: 'You may use our services only for lawful purposes and in accordance with these Terms. You agree not to use our services in any way that violates applicable laws or regulations.' }] },
              { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Account Registration' }] },
              { type: 'paragraph', content: [{ type: 'text', text: 'To access certain features, you must register for an account. You are responsible for maintaining the confidentiality of your account credentials and for all activities under your account.' }] },
              { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Intellectual Property' }] },
              { type: 'paragraph', content: [{ type: 'text', text: 'The service and its original content, features, and functionality are owned by LaunchPad and are protected by international copyright, trademark, and other intellectual property laws.' }] },
              { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Limitation of Liability' }] },
              { type: 'paragraph', content: [{ type: 'text', text: 'LaunchPad shall not be liable for any indirect, incidental, special, consequential, or punitive damages resulting from your use of the service.' }] },
              { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Termination' }] },
              { type: 'paragraph', content: [{ type: 'text', text: 'We may terminate or suspend your account and access to the service immediately, without prior notice, for conduct that we believe violates these Terms or is harmful to other users, us, or third parties.' }] },
              { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Changes to Terms' }] },
              { type: 'paragraph', content: [{ type: 'text', text: 'We reserve the right to modify these terms at any time. We will notify users of any material changes by posting the new Terms on this page.' }] },
              { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Contact' }] },
              { type: 'paragraph', content: [{ type: 'text', text: 'Questions about these Terms? Contact us at hello@launchpad.io.' }] },
            ],
          },
        },
      },
    ],
  },
  {
    title: 'Cookie Policy',
    slug: 'cookie-policy',
    menu_order: 101,
    showInMenu: false,
    meta: {
      description: 'Information about how we use cookies on our website',
      showTitle: true,
      titleAlignment: 'left',
    },
    blocks: [
      {
        id: 'text-1',
        type: 'text',
        data: {
          content: {
            type: 'doc',
            content: [
              { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'What Are Cookies?' }] },
              { type: 'paragraph', content: [{ type: 'text', text: 'Cookies are small text files stored on your device when you visit our website. They help us provide you with a better experience by remembering your preferences and understanding how you use our platform.' }] },
              { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Types of Cookies We Use' }] },
              { type: 'heading', attrs: { level: 3 }, content: [{ type: 'text', text: 'Essential Cookies' }] },
              { type: 'paragraph', content: [{ type: 'text', text: 'Required for the website to function properly. These cookies enable core functionality such as security, authentication, and session management. You cannot opt out of these cookies.' }] },
              { type: 'heading', attrs: { level: 3 }, content: [{ type: 'text', text: 'Analytics Cookies' }] },
              { type: 'paragraph', content: [{ type: 'text', text: 'Help us understand how visitors interact with our website by collecting anonymous usage data. We use this information to improve our platform and user experience.' }] },
              { type: 'heading', attrs: { level: 3 }, content: [{ type: 'text', text: 'Functional Cookies' }] },
              { type: 'paragraph', content: [{ type: 'text', text: 'Remember your preferences and settings to provide enhanced, personalized features. These include language preferences and display settings.' }] },
              { type: 'heading', attrs: { level: 3 }, content: [{ type: 'text', text: 'Marketing Cookies' }] },
              { type: 'paragraph', content: [{ type: 'text', text: 'Used to track visitors across websites to display relevant advertisements. These cookies are set by our advertising partners and require your consent.' }] },
              { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Managing Your Cookie Preferences' }] },
              { type: 'paragraph', content: [{ type: 'text', text: 'You can manage your cookie preferences at any time through our cookie banner or your browser settings. Note that disabling certain cookies may affect website functionality.' }] },
              { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Third-Party Cookies' }] },
              { type: 'paragraph', content: [{ type: 'text', text: 'Some cookies are placed by third-party services that appear on our pages. We do not control these cookies. Please refer to the respective privacy policies of these providers for more information.' }] },
              { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Updates to This Policy' }] },
              { type: 'paragraph', content: [{ type: 'text', text: 'We may update this Cookie Policy from time to time. Any changes will be posted on this page with an updated revision date.' }] },
              { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Contact' }] },
              { type: 'paragraph', content: [{ type: 'text', text: 'Questions about our use of cookies? Contact us at hello@launchpad.io.' }] },
            ],
          },
        },
      },
    ],
  },
  {
    title: 'Help Center',
    slug: 'help',
    menu_order: 5,
    showInMenu: false,
    meta: {
      description: 'Get answers to frequently asked questions about LaunchPad',
      showTitle: true,
      titleAlignment: 'center',
    },
    blocks: [
      {
        id: 'hero-help',
        type: 'hero',
        data: {
          title: 'How Can We Help?',
          subtitle: 'Find answers to common questions or reach out to our support team.',
          backgroundType: 'color',
          heightMode: 'auto',
          contentAlignment: 'center',
        },
      },
      {
        id: 'accordion-getting-started',
        type: 'accordion',
        data: {
          title: 'Getting Started',
          items: [
            { question: 'How do I create an account?', answer: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Click "Get Started Free" on our homepage. Enter your email and create a password. You\'ll receive a confirmation email to verify your account.' }] }] } },
            { question: 'What\'s included in the free tier?', answer: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'The free tier includes 1 project, 1,000 API calls per month, community support, and basic analytics. No credit card required.' }] }] } },
            { question: 'How do I invite team members?', answer: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Go to Settings → Team → Invite Members. Enter their email addresses and select their role (viewer, editor, or admin).' }] }] } },
          ],
        },
      },
      {
        id: 'accordion-billing',
        type: 'accordion',
        data: {
          title: 'Billing & Subscriptions',
          items: [
            { question: 'What payment methods do you accept?', answer: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'We accept all major credit cards (Visa, Mastercard, American Express), PayPal, and bank transfers for annual plans.' }] }] } },
            { question: 'Can I cancel my subscription anytime?', answer: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Yes, you can cancel at any time. Your access continues until the end of your billing period. No hidden fees or cancellation charges.' }] }] } },
            { question: 'Do you offer refunds?', answer: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'We offer a 14-day money-back guarantee. If you\'re not satisfied, contact support within 14 days of purchase for a full refund.' }] }] } },
          ],
        },
      },
      {
        id: 'accordion-technical',
        type: 'accordion',
        data: {
          title: 'Technical Questions',
          items: [
            { question: 'What are the API rate limits?', answer: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Free: 1,000 calls/month. Pro: 100,000 calls/month. Team: Unlimited. Rate limits reset on the 1st of each month.' }] }] } },
            { question: 'Do you offer an uptime SLA?', answer: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Yes, we guarantee 99.9% uptime for Pro and Team plans. Check our status page at status.launchpad.io for real-time updates.' }] }] } },
            { question: 'How do I integrate with my existing tools?', answer: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'We offer 50+ pre-built integrations. Go to Settings → Integrations to connect Slack, GitHub, Jira, and more. Custom webhooks are also available.' }] }] } },
          ],
        },
      },
      {
        id: 'cta-help',
        type: 'cta',
        data: {
          title: 'Still Need Help?',
          subtitle: 'Our support team is available 24/7 to assist you.',
          buttonText: 'Contact Support',
          buttonUrl: '/contact',
          gradient: false,
        },
      },
    ],
  },
];

// =====================================================
// TRUSTCORP - Enterprise Template (5 pages)
// =====================================================
const trustcorpPages: TemplatePage[] = [
  {
    title: 'Home',
    slug: 'home',
    isHomePage: true,
    menu_order: 1,
    showInMenu: true,
    meta: {
      description: 'Enterprise solutions you can trust',
      showTitle: false,
      titleAlignment: 'center',
    },
    blocks: [
      {
        id: 'hero-1',
        type: 'hero',
        data: {
          title: 'Enterprise Solutions You Can Trust',
          subtitle: 'Powering organizations that demand excellence, security, and scalability.',
          backgroundType: 'video',
          videoType: 'direct',
          videoUrl: 'https://assets.mixkit.co/videos/preview/mixkit-aerial-view-of-city-traffic-at-night-11-large.mp4',
          videoPosterUrl: 'https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?w=1920',
          videoLoop: true,
          videoMuted: true,
          showVideoControls: false,
          overlayColor: 'dark',
          heightMode: '80vh',
          contentAlignment: 'center',
          overlayOpacity: 65,
          parallaxEffect: false,
          titleAnimation: 'fade-in',
          primaryButton: { text: 'Request Demo', url: '/contact' },
          secondaryButton: { text: 'Our Services', url: '/services' },
        },
      },
      // LOGOS - Enterprise clients
      {
        id: 'logos-1',
        type: 'logos',
        data: {
          title: 'Trusted by Industry Leaders',
          logos: [
            { id: 'l1', name: 'GlobalBank', logo: 'https://images.unsplash.com/photo-1611162617474-5b21e879e113?w=120&h=40&fit=crop' },
            { id: 'l2', name: 'TechCorp', logo: 'https://images.unsplash.com/photo-1611162616305-c69b3fa7fbe0?w=120&h=40&fit=crop' },
            { id: 'l3', name: 'HealthNet', logo: 'https://images.unsplash.com/photo-1611162618071-b39a2ec055fb?w=120&h=40&fit=crop' },
            { id: 'l4', name: 'IndustryCo', logo: 'https://images.unsplash.com/photo-1611162617213-7d7a39e9b1d7?w=120&h=40&fit=crop' },
            { id: 'l5', name: 'FinanceFirst', logo: 'https://images.unsplash.com/photo-1611162616475-46b635cb6868?w=120&h=40&fit=crop' },
            { id: 'l6', name: 'RetailMax', logo: 'https://images.unsplash.com/photo-1611162617263-4ec3060a058e?w=120&h=40&fit=crop' },
          ],
          columns: 6,
          layout: 'grid',
          variant: 'grayscale',
          logoSize: 'md',
        },
      },
      {
        id: 'link-grid-1',
        type: 'link-grid',
        data: {
          columns: 4,
          links: [
            { icon: 'Briefcase', title: 'Consulting', description: 'Strategic advisory services', url: '/services' },
            { icon: 'Server', title: 'Technology', description: 'Enterprise infrastructure', url: '/services' },
            { icon: 'BarChart3', title: 'Analytics', description: 'Data-driven insights', url: '/services' },
            { icon: 'HeadphonesIcon', title: 'Support', description: '24/7 dedicated assistance', url: '/contact' },
          ],
        },
      },
      {
        id: 'stats-1',
        type: 'stats',
        data: {
          title: 'Proven Track Record',
          stats: [
            { value: '25+', label: 'Years of Excellence', icon: 'Award' },
            { value: '500+', label: 'Enterprise Clients', icon: 'Building' },
            { value: '50', label: 'Countries Served', icon: 'Globe' },
            { value: '99.99%', label: 'Uptime SLA', icon: 'ShieldCheck' },
          ],
        },
      },
      // TESTIMONIALS - Enterprise social proof
      {
        id: 'testimonials-1',
        type: 'testimonials',
        data: {
          title: 'Client Testimonials',
          testimonials: [
            {
              id: 't1',
              content: 'TrustCorp transformed our operations completely. Their private AI solution gave us the capabilities we needed without compromising on data governance.',
              author: 'Michael Torres',
              role: 'CIO',
              company: 'Fortune 500 Manufacturer',
              rating: 5,
            },
            {
              id: 't2',
              content: 'The level of expertise and professionalism exceeded our expectations. They delivered a complex migration on time and under budget.',
              author: 'Sarah Williams',
              role: 'VP Technology',
              company: 'GlobalBank',
              rating: 5,
            },
            {
              id: 't3',
              content: 'Their commitment to data sovereignty was exactly what we needed. Finally, an enterprise solution that respects our compliance requirements.',
              author: 'Dr. James Chen',
              role: 'Chief Medical Officer',
              company: 'HealthNet',
              rating: 5,
            },
          ],
          layout: 'grid',
          columns: 3,
          showRating: true,
          showAvatar: false,
          variant: 'cards',
        },
      },
      // SOCIAL PROOF - Live enterprise metrics
      {
        id: 'social-proof-1',
        type: 'social-proof',
        data: {
          title: 'Real-Time Enterprise Metrics',
          items: [
            { id: 'sp1', type: 'counter', icon: 'users', label: 'Active Users', value: '2.5M', suffix: '+', animated: true },
            { id: 'sp2', type: 'rating', icon: 'star', label: 'Customer Satisfaction', value: '4.9', maxRating: 5, rating: 4.9 },
            { id: 'sp3', type: 'counter', icon: 'activity', label: 'Transactions/Day', value: '10M', suffix: '+' },
            { id: 'sp4', type: 'counter', icon: 'trending', label: 'Uptime This Year', value: '99.99', suffix: '%' },
          ],
          variant: 'cards',
          layout: 'grid',
          columns: 4,
          size: 'lg',
          animated: true,
          showIcons: true,
        },
      },
      {
        id: 'cta-1',
        type: 'cta',
        data: {
          title: 'Ready to Transform?',
          subtitle: 'Let\'s discuss how we can help your organization.',
          buttonText: 'Schedule Consultation',
          buttonUrl: '/contact',
          gradient: false,
        },
      },
    ],
  },
  {
    title: 'Services',
    slug: 'services',
    menu_order: 2,
    showInMenu: true,
    meta: {
      description: 'Comprehensive enterprise services tailored to your needs',
      showTitle: true,
      titleAlignment: 'center',
    },
    blocks: [
      {
        id: 'hero-1',
        type: 'hero',
        data: {
          title: 'Our Services',
          subtitle: 'Comprehensive solutions for enterprise challenges',
          backgroundType: 'color',
          heightMode: 'auto',
          contentAlignment: 'center',
          overlayOpacity: 0,
        },
      },
      {
        id: 'two-col-1',
        type: 'two-column',
        data: {
          content: {
            type: 'doc',
            content: [
              { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Strategic Consulting' }] },
              { type: 'paragraph', content: [{ type: 'text', text: 'Our experienced consultants work closely with your leadership team to develop strategies that drive growth, efficiency, and competitive advantage.' }] },
              { type: 'bulletList', content: [
                { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Digital transformation roadmaps' }] }] },
                { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Operational excellence programs' }] }] },
                { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Technology strategy development' }] }] },
              ]},
            ],
          },
          imageSrc: 'https://images.unsplash.com/photo-1552664730-d307ca884978?w=800',
          imageAlt: 'Team strategy meeting',
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
              { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Enterprise Technology' }] },
              { type: 'paragraph', content: [{ type: 'text', text: 'We design, build, and maintain the technology infrastructure that powers the world\'s leading organizations.' }] },
              { type: 'bulletList', content: [
                { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Cloud architecture & migration' }] }] },
                { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Private AI deployment' }] }] },
                { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Legacy system modernization' }] }] },
              ]},
            ],
          },
          imageSrc: 'https://images.unsplash.com/photo-1451187580459-43490279c0fa?w=800',
          imageAlt: 'Technology infrastructure',
          imagePosition: 'left',
        },
      },
      {
        id: 'info-box-1',
        type: 'info-box',
        data: {
          title: 'Data Sovereignty Guaranteed',
          content: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Our Private AI runs entirely on your infrastructure. Your data never leaves your servers, ensuring complete compliance with data protection regulations.' }] }] },
          variant: 'highlight',
        },
      },
      {
        id: 'cta-1',
        type: 'cta',
        data: {
          title: 'Explore Our Full Capabilities',
          subtitle: 'Every engagement is tailored to your unique needs.',
          buttonText: 'Contact Us',
          buttonUrl: '/contact',
          gradient: false,
        },
      },
    ],
  },
  {
    title: 'Case Studies',
    slug: 'case-studies',
    menu_order: 3,
    showInMenu: true,
    meta: {
      description: 'Real results from real clients',
      showTitle: true,
      titleAlignment: 'center',
    },
    blocks: [
      {
        id: 'hero-1',
        type: 'hero',
        data: {
          title: 'Client Success Stories',
          subtitle: 'Real results from industry leaders',
          backgroundType: 'color',
          heightMode: 'auto',
          contentAlignment: 'center',
          overlayOpacity: 0,
        },
      },
      {
        id: 'article-grid-1',
        type: 'article-grid',
        data: {
          title: 'Featured Case Studies',
          columns: 3,
          articles: [
            { title: 'GlobalBank: 40% Cost Reduction', excerpt: 'How we helped GlobalBank reduce operational costs while improving customer satisfaction.', image: 'https://images.unsplash.com/photo-1554224155-8d04cb21cd6c?w=600', url: '/contact' },
            { title: 'TechCorp: AI Transformation', excerpt: 'Deploying private AI across 30 global locations while maintaining data sovereignty.', image: 'https://images.unsplash.com/photo-1485827404703-89b55fcc595e?w=600', url: '/contact' },
            { title: 'HealthNet: HIPAA Compliance', excerpt: 'Modernizing healthcare IT infrastructure with full regulatory compliance.', image: 'https://images.unsplash.com/photo-1576091160399-112ba8d25d1d?w=600', url: '/contact' },
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
              { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'GlobalBank Case Study' }] },
              { type: 'paragraph', content: [{ type: 'text', text: 'GlobalBank faced mounting operational costs and declining customer satisfaction. Through our comprehensive digital transformation program, we helped them modernize legacy systems, implement AI-driven customer service, and achieve regulatory compliance across 30 markets.' }] },
              { type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'bold' }], text: 'Results: ' }, { type: 'text', text: '40% cost reduction, 25% improvement in customer satisfaction, 99.99% system uptime.' }] },
            ],
          },
          imageSrc: 'https://images.unsplash.com/photo-1554224155-8d04cb21cd6c?w=800',
          imageAlt: 'Business analysis',
          imagePosition: 'right',
        },
      },
      {
        id: 'quote-1',
        type: 'quote',
        data: {
          text: 'The TrustCorp team delivered beyond our expectations. They understood our unique challenges and built solutions that work.',
          author: 'Jennifer Walsh',
          source: 'COO, GlobalBank',
          variant: 'styled',
        },
      },
    ],
  },
  {
    title: 'About',
    slug: 'about',
    menu_order: 4,
    showInMenu: true,
    meta: {
      description: 'Learn about our company and mission',
      showTitle: true,
      titleAlignment: 'center',
    },
    blocks: [
      {
        id: 'hero-1',
        type: 'hero',
        data: {
          title: 'About TrustCorp',
          subtitle: '25 years of delivering excellence',
          backgroundType: 'image',
          backgroundImage: 'https://images.unsplash.com/photo-1497366216548-37526070297c?w=1920',
          heightMode: '60vh',
          contentAlignment: 'center',
          overlayOpacity: 60,
        },
      },
      {
        id: 'two-col-1',
        type: 'two-column',
        data: {
          content: {
            type: 'doc',
            content: [
              { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Our Mission' }] },
              { type: 'paragraph', content: [{ type: 'text', text: 'We exist to help enterprises navigate complexity with confidence. For over 25 years, we\'ve been the trusted partner for organizations that demand excellence, security, and results.' }] },
              { type: 'paragraph', content: [{ type: 'text', text: 'Our commitment to data sovereignty and privacy isn\'t just a feature — it\'s our foundation. In an era of cloud dependency, we give organizations control over their most sensitive operations.' }] },
            ],
          },
          imageSrc: 'https://images.unsplash.com/photo-1522071820081-009f0129c71c?w=800',
          imageAlt: 'Team collaboration',
          imagePosition: 'right',
        },
      },
      {
        id: 'stats-1',
        type: 'stats',
        data: {
          title: 'Our Impact',
          stats: [
            { value: '3,000+', label: 'Projects Delivered', icon: 'CheckCircle' },
            { value: '25K+', label: 'Professionals Trained', icon: 'GraduationCap' },
            { value: '12', label: 'Global Offices', icon: 'Globe' },
            { value: '98%', label: 'Client Retention', icon: 'Heart' },
          ],
        },
      },
      // TEAM - Leadership
      {
        id: 'team-1',
        type: 'team',
        data: {
          title: 'Leadership Team',
          subtitle: 'Meet the people driving TrustCorp forward.',
          members: [
            {
              id: 'm1',
              name: 'Robert Anderson',
              role: 'Chief Executive Officer',
              bio: '25+ years leading global enterprise transformations.',
              photo: 'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=300&h=300&fit=crop',
              social: { linkedin: 'https://linkedin.com' },
            },
            {
              id: 'm2',
              name: 'Dr. Elena Martinez',
              role: 'Chief Technology Officer',
              bio: 'Former CTO at Fortune 100, AI and security expert.',
              photo: 'https://images.unsplash.com/photo-1580489944761-15a19d654956?w=300&h=300&fit=crop',
              social: { linkedin: 'https://linkedin.com' },
            },
            {
              id: 'm3',
              name: 'James Whitmore',
              role: 'Chief Operations Officer',
              bio: 'Scaled operations across 50+ countries.',
              photo: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=300&h=300&fit=crop',
              social: { linkedin: 'https://linkedin.com' },
            },
            {
              id: 'm4',
              name: 'Sarah Lindqvist',
              role: 'Chief Client Officer',
              bio: 'Dedicated to exceptional client experiences.',
              photo: 'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?w=300&h=300&fit=crop',
              social: { linkedin: 'https://linkedin.com' },
            },
          ],
          columns: 4,
          layout: 'grid',
          variant: 'cards',
          showBio: true,
          showSocial: true,
        },
      },
      {
        id: 'cta-1',
        type: 'cta',
        data: {
          title: 'Join Our Team',
          subtitle: 'We\'re always looking for exceptional talent.',
          buttonText: 'View Careers',
          buttonUrl: '/contact',
          gradient: false,
        },
      },
    ],
  },
  {
    title: 'Contact',
    slug: 'contact',
    menu_order: 5,
    showInMenu: true,
    meta: {
      description: 'Connect with our enterprise team',
      showTitle: true,
      titleAlignment: 'center',
    },
    blocks: [
      {
        id: 'hero-1',
        type: 'hero',
        data: {
          title: 'Contact Our Team',
          subtitle: 'Let\'s discuss how we can help your organization',
          backgroundType: 'color',
          heightMode: 'auto',
          contentAlignment: 'center',
          overlayOpacity: 0,
        },
      },
      {
        id: 'chat-1',
        type: 'chat',
        data: {
          title: 'Private Enterprise Assistant',
          height: 'lg',
          showSidebar: false,
          variant: 'card',
          initialPrompt: 'Welcome to TrustCorp. I\'m your private AI assistant — all conversations are processed on your infrastructure. How can I help you today?',
        },
      },
      {
        id: 'contact-1',
        type: 'contact',
        data: {
          title: 'Contact Our Enterprise Team',
          phone: '+1 (800) TRUST-00',
          email: 'enterprise@trustcorp.com',
          address: '100 Enterprise Way, Suite 1000, New York, NY 10001',
          hours: [
            { day: 'Sales', time: '24/7 Available' },
            { day: 'Support', time: '24/7 Dedicated' },
            { day: 'Office', time: 'Mon-Fri 9AM-6PM' },
          ],
        },
      },
      {
        id: 'accordion-1',
        type: 'accordion',
        data: {
          title: 'Enterprise FAQ',
          items: [
            { question: 'How do you ensure data security?', answer: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'We employ multiple layers of security including end-to-end encryption, SOC 2 Type II compliance, and optional on-premise deployment.' }] }] } },
            { question: 'Can we deploy on our own infrastructure?', answer: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Yes, we offer full on-premise deployment options as well as private cloud solutions. Your data never has to leave your infrastructure.' }] }] } },
            { question: 'What SLAs do you offer?', answer: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Enterprise clients receive 99.99% uptime SLA with 24/7 dedicated support and named account managers.' }] }] } },
          ],
        },
      },
      // BOOKING - Schedule a consultation
      {
        id: 'booking-1',
        type: 'booking',
        data: {
          title: 'Schedule a Consultation',
          description: 'Speak with our enterprise solutions team about your specific needs.',
          mode: 'smart',
          submitButtonText: 'Confirm Booking',
          successMessage: 'Your consultation is booked! An enterprise specialist will reach out.',
          showPhoneField: true,
          variant: 'card',
        },
      },
    ],
  },
  {
    title: 'Privacy Policy',
    slug: 'privacy-policy',
    menu_order: 99,
    showInMenu: false,
    meta: {
      description: 'How we collect, use and protect your personal data under GDPR',
      showTitle: true,
      titleAlignment: 'left',
    },
    blocks: [
      {
        id: 'text-1',
        type: 'text',
        data: {
          content: {
            type: 'doc',
            content: [
              { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Introduction' }] },
              { type: 'paragraph', content: [{ type: 'text', text: 'TrustCorp is committed to protecting your privacy and handling your personal data with the highest standards. This policy describes how we collect, use, and protect your information in accordance with the General Data Protection Regulation (GDPR).' }] },
              { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Data Controller' }] },
              { type: 'paragraph', content: [{ type: 'text', text: 'TrustCorp Ltd. is the data controller for the processing of your personal data. You can reach us at contact@trustcorp.com.' }] },
              { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'What Data We Collect' }] },
              { type: 'paragraph', content: [{ type: 'text', text: 'We collect information provided in the context of business relationships, including contact details for company representatives, project-related information, and communication history.' }] },
              { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'How We Use Your Data' }] },
              { type: 'bulletList', content: [
                { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'To deliver contracted services and products' }] }] },
                { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'To manage client relationships and communication' }] }] },
                { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'To comply with legal and regulatory requirements' }] }] },
                { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'For business development and marketing (with consent)' }] }] },
              ]},
              { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Data Storage and Security' }] },
              { type: 'paragraph', content: [{ type: 'text', text: 'We store all data within the EU/EEA and apply industry-leading security measures including encryption, access control, and regular security audits.' }] },
              { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Your Rights' }] },
              { type: 'paragraph', content: [{ type: 'text', text: 'Under GDPR, you have the right to access, rectify, and erase your personal data. You also have the right to restrict processing, object to processing, and the right to data portability.' }] },
              { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Contact' }] },
              { type: 'paragraph', content: [{ type: 'text', text: 'For questions about personal data handling, contact our Data Protection Officer at privacy@trustcorp.com.' }] },
            ],
          },
        },
      },
    ],
  },
  {
    title: 'Terms of Service',
    slug: 'terms-of-service',
    menu_order: 100,
    showInMenu: false,
    meta: {
      description: 'Terms and conditions for using our enterprise services',
      showTitle: true,
      titleAlignment: 'left',
    },
    blocks: [
      {
        id: 'text-1',
        type: 'text',
        data: {
          content: {
            type: 'doc',
            content: [
              { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Agreement to Terms' }] },
              { type: 'paragraph', content: [{ type: 'text', text: 'By engaging TrustCorp services, you agree to be bound by these Terms of Service and our Master Service Agreement. These terms govern all business relationships with TrustCorp.' }] },
              { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Scope of Services' }] },
              { type: 'paragraph', content: [{ type: 'text', text: 'TrustCorp provides enterprise consulting, technology, and advisory services as described in individual Statements of Work. All services are performed in accordance with industry best practices.' }] },
              { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Confidentiality' }] },
              { type: 'paragraph', content: [{ type: 'text', text: 'Both parties agree to maintain strict confidentiality of all proprietary information exchanged during the engagement. This obligation survives the termination of any agreement.' }] },
              { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Intellectual Property' }] },
              { type: 'paragraph', content: [{ type: 'text', text: 'Unless otherwise specified in a Statement of Work, all pre-existing intellectual property remains with its original owner. Work product ownership is defined in individual project agreements.' }] },
              { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Data Security' }] },
              { type: 'paragraph', content: [{ type: 'text', text: 'TrustCorp maintains SOC 2 Type II certification and implements enterprise-grade security measures. All data processing complies with applicable data protection regulations including GDPR.' }] },
              { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Limitation of Liability' }] },
              { type: 'paragraph', content: [{ type: 'text', text: 'Liability is limited to the fees paid under the applicable Statement of Work. Neither party shall be liable for indirect, incidental, or consequential damages.' }] },
              { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Governing Law' }] },
              { type: 'paragraph', content: [{ type: 'text', text: 'These terms are governed by the laws of the jurisdiction specified in the Master Service Agreement, without regard to conflict of law principles.' }] },
              { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Contact' }] },
              { type: 'paragraph', content: [{ type: 'text', text: 'For questions about these Terms, contact our legal team at legal@trustcorp.com.' }] },
            ],
          },
        },
      },
    ],
  },
  {
    title: 'Cookie Policy',
    slug: 'cookie-policy',
    menu_order: 101,
    showInMenu: false,
    meta: {
      description: 'Information about how we use cookies for enterprise clients',
      showTitle: true,
      titleAlignment: 'left',
    },
    blocks: [
      {
        id: 'text-1',
        type: 'text',
        data: {
          content: {
            type: 'doc',
            content: [
              { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'What Are Cookies?' }] },
              { type: 'paragraph', content: [{ type: 'text', text: 'Cookies are small text files stored on your device when you visit our website. They help us provide secure, personalized experiences for our enterprise clients and visitors.' }] },
              { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Types of Cookies We Use' }] },
              { type: 'heading', attrs: { level: 3 }, content: [{ type: 'text', text: 'Essential Cookies' }] },
              { type: 'paragraph', content: [{ type: 'text', text: 'Required for secure operation of our enterprise services. These enable authentication, session management, and security features. Essential cookies cannot be disabled.' }] },
              { type: 'heading', attrs: { level: 3 }, content: [{ type: 'text', text: 'Analytics Cookies' }] },
              { type: 'paragraph', content: [{ type: 'text', text: 'Help us understand how enterprise clients interact with our platform. All analytics data is processed in compliance with GDPR and our data processing agreements.' }] },
              { type: 'heading', attrs: { level: 3 }, content: [{ type: 'text', text: 'Functional Cookies' }] },
              { type: 'paragraph', content: [{ type: 'text', text: 'Remember your preferences and settings across sessions. These include language preferences, dashboard configurations, and accessibility settings.' }] },
              { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Enterprise Data Sovereignty' }] },
              { type: 'paragraph', content: [{ type: 'text', text: 'For enterprise clients with on-premise deployments, cookie handling can be configured according to your organization policies. Contact your account manager for customization options.' }] },
              { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Managing Cookie Preferences' }] },
              { type: 'paragraph', content: [{ type: 'text', text: 'You can manage cookie preferences through our consent banner or your browser settings. Enterprise administrators can configure organization-wide cookie policies through the admin dashboard.' }] },
              { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Third-Party Services' }] },
              { type: 'paragraph', content: [{ type: 'text', text: 'We minimize third-party cookie usage. Any third-party services used are vetted for security and compliance with enterprise requirements.' }] },
              { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Contact' }] },
              { type: 'paragraph', content: [{ type: 'text', text: 'For questions about cookie usage or enterprise data handling, contact our privacy team at privacy@trustcorp.com.' }] },
            ],
          },
        },
      },
    ],
  },
  {
    title: 'Support Center',
    slug: 'support',
    menu_order: 6,
    showInMenu: true,
    meta: {
      description: 'Enterprise support center - Get help with our solutions and services',
      showTitle: true,
      titleAlignment: 'center',
    },
    blocks: [
      {
        id: 'hero-support',
        type: 'hero',
        data: {
          title: 'Enterprise Support Center',
          subtitle: 'Get the help you need from our dedicated enterprise team',
          backgroundType: 'color',
          heightMode: 'auto',
          contentAlignment: 'center',
          overlayOpacity: 0,
        },
      },
      {
        id: 'link-grid-support',
        type: 'link-grid',
        data: {
          columns: 3,
          links: [
            { icon: 'MessageSquare', title: 'Contact Support', description: 'Reach our enterprise support team directly', url: '/contact' },
            { icon: 'FileText', title: 'Documentation', description: 'Technical guides and API reference', url: '/case-studies' },
            { icon: 'Users', title: 'Account Manager', description: 'Connect with your dedicated account manager', url: '/contact' },
          ],
        },
      },
      {
        id: 'accordion-deployment',
        type: 'accordion',
        data: {
          title: 'Deployment & Infrastructure',
          items: [
            { question: 'What deployment options are available?', answer: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'We offer multiple deployment options including on-premise, private cloud, and hybrid solutions. All deployments include full data sovereignty guarantees and can be customized to meet your specific compliance requirements.' }] }] } },
            { question: 'What are the system requirements?', answer: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Requirements vary based on deployment type and scale. For on-premise installations, we provide detailed specifications. Our team will work with you to ensure optimal configuration for your infrastructure.' }] }] } },
            { question: 'How is maintenance handled?', answer: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Enterprise clients receive 24/7 monitoring and proactive maintenance. Updates are scheduled during your designated maintenance windows, and all changes are communicated in advance.' }] }] } },
          ],
        },
      },
      {
        id: 'accordion-security',
        type: 'accordion',
        data: {
          title: 'Security & Compliance',
          items: [
            { question: 'What security certifications do you hold?', answer: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'TrustCorp maintains SOC 2 Type II, ISO 27001, and GDPR compliance. For healthcare clients, we offer HIPAA-compliant configurations. Certification documentation is available upon request under NDA.' }] }] } },
            { question: 'How do you ensure data sovereignty?', answer: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'All data is processed and stored within your designated geographic region. Our private AI solutions run entirely on your infrastructure, ensuring complete data sovereignty. We never transmit data to external services without explicit authorization.' }] }] } },
            { question: 'What is your security incident response process?', answer: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Enterprise clients have access to our 24/7 Security Operations Center. Any potential security events are investigated immediately, with dedicated escalation paths and regular status updates until resolution.' }] }] } },
          ],
        },
      },
      {
        id: 'accordion-sla',
        type: 'accordion',
        data: {
          title: 'SLA & Support Levels',
          items: [
            { question: 'What SLA guarantees do you offer?', answer: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Enterprise clients receive 99.99% uptime SLA with financial guarantees. Critical issues have a 15-minute response time, with 4-hour resolution targets for P1 incidents.' }] }] } },
            { question: 'What support channels are available?', answer: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Enterprise support includes 24/7 phone and email support, dedicated Slack channel, video conferencing with technical experts, and on-site support for critical situations.' }] }] } },
            { question: 'Do we get a dedicated account manager?', answer: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Yes, all enterprise clients are assigned a dedicated account manager and technical account manager. They serve as your primary contacts for all business and technical matters.' }] }] } },
          ],
        },
      },
      {
        id: 'cta-support',
        type: 'cta',
        data: {
          title: 'Need Immediate Assistance?',
          subtitle: 'Our enterprise support team is available 24/7 for critical issues.',
          buttonText: 'Contact Support',
          buttonUrl: '/contact',
          gradient: false,
        },
      },
    ],
  },
];

// =====================================================
// SECUREHEALTH - Compliance Template (5 pages)
// =====================================================
const securehealthPages: TemplatePage[] = [
  {
    title: 'Home',
    slug: 'home',
    isHomePage: true,
    menu_order: 1,
    showInMenu: true,
    meta: {
      description: 'Your health, your privacy — trusted care with complete data security',
      showTitle: false,
      titleAlignment: 'center',
    },
    blocks: [
      {
        id: 'hero-1',
        type: 'hero',
        data: {
          title: 'Your Health, Your Privacy',
          subtitle: 'Trusted care with complete data security. Your information never leaves our servers.',
          backgroundType: 'image',
          backgroundImage: 'https://images.unsplash.com/photo-1538108149393-fbbd81895907?w=1920',
          heightMode: '60vh',
          contentAlignment: 'center',
          overlayOpacity: 55,
          titleAnimation: 'fade-in',
          primaryButton: { text: 'Book Appointment', url: '/book' },
          secondaryButton: { text: 'Our Services', url: '/services' },
        },
      },
      // BADGE - Trust indicators
      {
        id: 'badge-compliance',
        type: 'badge',
        data: {
          title: 'Trusted & Certified',
          badges: [
            { id: 'b1', title: 'HIPAA Compliant', icon: 'shield' },
            { id: 'b2', title: 'SOC 2 Type II', icon: 'check' },
            { id: 'b3', title: 'JCI Accredited', icon: 'award' },
            { id: 'b4', title: 'ISO 27001', icon: 'medal' },
          ],
          variant: 'minimal',
          columns: 4,
          size: 'md',
          showTitles: true,
          grayscale: false,
        },
      },
      {
        id: 'info-box-1',
        type: 'info-box',
        data: {
          title: 'Now Accepting New Patients',
          content: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Same-day appointments available. Call us or use our AI assistant to find the next available slot.' }] }] },
          variant: 'highlight',
        },
      },
      {
        id: 'link-grid-1',
        type: 'link-grid',
        data: {
          columns: 3,
          links: [
            { icon: 'Calendar', title: 'Book Appointment', description: 'Schedule your visit online', url: '/book' },
            { icon: 'MapPin', title: 'Find Us', description: 'Locations & directions', url: '/about' },
            { icon: 'Phone', title: 'Urgent Care', description: '24/7 medical helpline', url: '/contact' },
          ],
        },
      },
      {
        id: 'stats-1',
        type: 'stats',
        data: {
          title: 'Why Patients Trust Us',
          stats: [
            { value: '98%', label: 'Patient Satisfaction', icon: 'Heart' },
            { value: '<15min', label: 'Average Wait Time', icon: 'Clock' },
            { value: '25+', label: 'Specialists On Staff', icon: 'UserCheck' },
            { value: '10K+', label: 'Patients Annually', icon: 'Users' },
          ],
        },
      },
      // TESTIMONIALS - Patient reviews
      {
        id: 'testimonials-1',
        type: 'testimonials',
        data: {
          title: 'What Our Patients Say',
          testimonials: [
            {
              id: 't1',
              content: 'The care I received was exceptional. The staff was attentive and the AI assistant helped me find the right specialist quickly.',
              author: 'Maria S.',
              role: 'Patient',
              rating: 5,
            },
            {
              id: 't2',
              content: 'I was hesitant about using an AI for health questions, but knowing that my data stays private made all the difference.',
              author: 'Rebecca M.',
              role: 'Patient',
              rating: 5,
            },
            {
              id: 't3',
              content: 'Booking appointments is so easy now. The whole experience feels modern while still being personal and caring.',
              author: 'David L.',
              role: 'Patient',
              rating: 5,
            },
          ],
          layout: 'carousel',
          columns: 3,
          showRating: true,
          showAvatar: false,
          buttonUrl: '/book',
          gradient: false,
        },
      },
      // TABS - Medical services overview
      {
        id: 'tabs-services',
        type: 'tabs',
        data: {
          title: 'Our Medical Services',
          subtitle: 'Comprehensive care across all specialties',
          tabs: [
            {
              id: 'tab-primary',
              label: 'Primary Care',
              content: {
                type: 'doc',
                content: [
                  { type: 'heading', attrs: { level: 3 }, content: [{ type: 'text', text: 'General Medicine' }] },
                  { type: 'paragraph', content: [{ type: 'text', text: 'Routine checkups, preventive care, and treatment for common illnesses. Our primary care physicians are your first point of contact for all health concerns.' }] },
                  { type: 'bulletList', content: [
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Annual health screenings' }] }] },
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Chronic disease management' }] }] },
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Vaccinations and immunizations' }] }] },
                  ]},
                ],
              },
            },
            {
              id: 'tab-specialists',
              label: 'Specialists',
              content: {
                type: 'doc',
                content: [
                  { type: 'heading', attrs: { level: 3 }, content: [{ type: 'text', text: 'Expert Specialty Care' }] },
                  { type: 'paragraph', content: [{ type: 'text', text: 'Access to board-certified specialists across cardiology, orthopedics, neurology, and more. Coordinated care with your primary physician.' }] },
                  { type: 'bulletList', content: [
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Cardiology and heart health' }] }] },
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Orthopedics and sports medicine' }] }] },
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Neurology and mental health' }] }] },
                  ]},
                ],
              },
            },
            {
              id: 'tab-emergency',
              label: 'Emergency Care',
              content: {
                type: 'doc',
                content: [
                  { type: 'heading', attrs: { level: 3 }, content: [{ type: 'text', text: '24/7 Emergency Services' }] },
                  { type: 'paragraph', content: [{ type: 'text', text: 'State-of-the-art emergency department with experienced trauma teams. Open 24 hours a day, 365 days a year.' }] },
                  { type: 'bulletList', content: [
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Immediate triage and assessment' }] }] },
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Advanced diagnostic imaging' }] }] },
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Trauma and critical care' }] }] },
                  ]},
                ],
              },
            },
          ],
          orientation: 'horizontal',
          variant: 'pills',
        },
      },
    ],
  },
  {
    title: 'Services',
    slug: 'services',
    menu_order: 2,
    showInMenu: true,
    meta: {
      description: 'Comprehensive healthcare services for you and your family',
      showTitle: true,
      titleAlignment: 'center',
    },
    blocks: [
      {
        id: 'hero-1',
        type: 'hero',
        data: {
          title: 'Our Medical Services',
          subtitle: 'Comprehensive care for every stage of life',
          backgroundType: 'color',
          heightMode: 'auto',
          contentAlignment: 'center',
          overlayOpacity: 0,
        },
      },
      {
        id: 'link-grid-1',
        type: 'link-grid',
        data: {
          columns: 3,
          links: [
            { icon: 'HeartPulse', title: 'Primary Care', description: 'General health checkups and preventive care', url: '/services' },
            { icon: 'Stethoscope', title: 'Specialists', description: 'Expert care across all medical fields', url: '/services' },
            { icon: 'Baby', title: 'Pediatrics', description: 'Caring for children of all ages', url: '/services' },
            { icon: 'Brain', title: 'Mental Health', description: 'Private counseling and therapy', url: '/services' },
            { icon: 'Activity', title: 'Diagnostics', description: 'Advanced testing and imaging', url: '/services' },
            { icon: 'Pill', title: 'Pharmacy', description: 'On-site prescription services', url: '/contact' },
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
              { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Primary Care' }] },
              { type: 'paragraph', content: [{ type: 'text', text: 'Our primary care physicians provide comprehensive health management for patients of all ages. From annual wellness visits to managing chronic conditions, we\'re your first point of contact for all health concerns.' }] },
              { type: 'bulletList', content: [
                { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Annual wellness exams' }] }] },
                { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Chronic disease management' }] }] },
                { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Preventive screenings' }] }] },
              ]},
            ],
          },
          imageSrc: 'https://images.unsplash.com/photo-1631217868264-e5b90bb7e133?w=800',
          imageAlt: 'Doctor with patient',
          imagePosition: 'right',
        },
      },
      {
        id: 'info-box-1',
        type: 'info-box',
        data: {
          title: 'HIPAA Compliant • Your Data Stays Here',
          content: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Our Private AI runs entirely on our secure, HIPAA-compliant infrastructure. Your health information is never sent to external cloud services.' }] }] },
          variant: 'success',
        },
      },
      {
        id: 'cta-1',
        type: 'cta',
        data: {
          title: 'Ready to Schedule?',
          subtitle: 'Book your appointment today.',
          buttonText: 'Book Now',
          buttonUrl: '/book',
          gradient: false,
        },
      },
    ],
  },
  {
    title: 'About Us',
    slug: 'about',
    menu_order: 3,
    showInMenu: true,
    meta: {
      description: 'Learn about our practice and our commitment to privacy',
      showTitle: true,
      titleAlignment: 'center',
    },
    blocks: [
      {
        id: 'hero-1',
        type: 'hero',
        data: {
          title: 'About Our Practice',
          subtitle: '20+ years of compassionate, patient-centered care',
          backgroundType: 'image',
          backgroundImage: 'https://images.unsplash.com/photo-1519494026892-80bbd2d6fd0d?w=1920',
          heightMode: '60vh',
          contentAlignment: 'center',
          overlayOpacity: 60,
        },
      },
      {
        id: 'two-col-1',
        type: 'two-column',
        data: {
          content: {
            type: 'doc',
            content: [
              { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Our Story' }] },
              { type: 'paragraph', content: [{ type: 'text', text: 'For over 20 years, we\'ve been providing compassionate, patient-centered care to our community. Our team of board-certified specialists is committed to your health and well-being.' }] },
              { type: 'paragraph', content: [{ type: 'text', text: 'We believe that quality healthcare should come with complete privacy. That\'s why we\'ve invested in state-of-the-art, on-premise technology that keeps your data exactly where it belongs.' }] },
            ],
          },
          imageSrc: 'https://images.unsplash.com/photo-1631217868264-e5b90bb7e133?w=800',
          imageAlt: 'Medical team',
          imagePosition: 'right',
        },
      },
      {
        id: 'stats-1',
        type: 'stats',
        data: {
          title: 'Our Credentials',
          stats: [
            { value: '20+', label: 'Years of Experience', icon: 'Award' },
            { value: 'Board', label: 'Certified Physicians', icon: 'ShieldCheck' },
            { value: 'HIPAA', label: 'Full Compliance', icon: 'Lock' },
            { value: '5-Star', label: 'Patient Rating', icon: 'Star' },
          ],
        },
      },
      // TEAM - Medical staff
      {
        id: 'team-1',
        type: 'team',
        data: {
          title: 'Meet Our Doctors',
          subtitle: 'Board-certified specialists dedicated to your care.',
          members: [
            {
              id: 'm1',
              name: 'Dr. Sofia Berg',
              role: 'Medical Director',
              bio: 'Board-certified in Internal Medicine with 20+ years of experience.',
              photo: 'https://images.unsplash.com/photo-1559839734-2b71ea197ec2?w=300&h=300&fit=crop',
            },
            {
              id: 'm2',
              name: 'Dr. James Wilson',
              role: 'Cardiologist',
              bio: 'Specialist in cardiovascular health and preventive care.',
              photo: 'https://images.unsplash.com/photo-1612349317150-e413f6a5b16d?w=300&h=300&fit=crop',
            },
            {
              id: 'm3',
              name: 'Dr. Emily Chen',
              role: 'Pediatrician',
              bio: 'Caring for children of all ages with a gentle approach.',
              photo: 'https://images.unsplash.com/photo-1594824476967-48c8b964273f?w=300&h=300&fit=crop',
            },
            {
              id: 'm4',
              name: 'Dr. Michael Torres',
              role: 'Mental Health',
              bio: 'Psychiatrist specializing in anxiety and depression.',
              photo: 'https://images.unsplash.com/photo-1537368910025-700350fe46c7?w=300&h=300&fit=crop',
            },
          ],
          columns: 4,
          layout: 'grid',
          variant: 'cards',
          showBio: true,
          showSocial: false,
        },
      },
    ],
  },
  {
    title: 'Patient Resources',
    slug: 'resources',
    menu_order: 4,
    showInMenu: true,
    meta: {
      description: 'Helpful resources and frequently asked questions',
      showTitle: true,
      titleAlignment: 'center',
    },
    blocks: [
      {
        id: 'hero-1',
        type: 'hero',
        data: {
          title: 'Patient Resources',
          subtitle: 'Everything you need to know about your care',
          backgroundType: 'color',
          heightMode: 'auto',
          contentAlignment: 'center',
          overlayOpacity: 0,
        },
      },
      {
        id: 'chat-1',
        type: 'chat',
        data: {
          title: 'Private AI Health Assistant',
          height: 'lg',
          showSidebar: false,
          variant: 'card',
          initialPrompt: 'Hello! I\'m your private health assistant. I can help you book appointments, answer questions about our services, or provide general health information. All conversations are HIPAA-compliant. How can I help you today?',
        },
      },
      {
        id: 'accordion-1',
        type: 'accordion',
        data: {
          title: 'Common Questions',
          items: [
            { question: 'Is the AI assistant really private?', answer: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Yes. Unlike cloud-based AI services, our Private AI runs entirely on our own HIPAA-compliant servers. Your conversations never leave our secure infrastructure.' }] }] } },
            { question: 'What insurance do you accept?', answer: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'We accept most major insurance plans including Medicare, Blue Cross Blue Shield, Aetna, Cigna, and United Healthcare. Contact us to verify your coverage.' }] }] } },
            { question: 'How do I access my medical records?', answer: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'You can access your medical records through our secure patient portal. We use two-factor authentication and encrypted connections for privacy.' }] }] } },
            { question: 'Can I book appointments online?', answer: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Yes! Use our AI assistant or the booking button to schedule appointments 24/7.' }] }] } },
            { 
              question: 'Where are you located?', 
              answer: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'We have multiple locations throughout the region. Each facility features free parking and full accessibility.' }] }] },
              image: 'https://images.unsplash.com/photo-1519494026892-80bbd2d6fd0d?w=600',
              imageAlt: 'Modern medical facility',
            },
          ],
        },
      },
      {
        id: 'info-box-1',
        type: 'info-box',
        data: {
          title: 'Patient Portal',
          content: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Access your medical records, test results, and appointment history securely online. All data is encrypted and stored on our HIPAA-compliant servers.' }] }] },
          variant: 'default',
        },
      },
    ],
  },
  {
    title: 'Book Appointment',
    slug: 'book',
    menu_order: 5,
    showInMenu: true,
    meta: {
      description: 'Schedule your appointment online with our easy booking system',
      showTitle: false,
      titleAlignment: 'center',
    },
    blocks: [
      {
        id: 'hero-1',
        type: 'hero',
        data: {
          title: 'Book Your Appointment',
          subtitle: 'Choose your service, pick a time that works for you, and we\'ll take care of the rest.',
          backgroundType: 'image',
          backgroundImage: 'https://images.unsplash.com/photo-1576091160399-112ba8d25d1d?w=1920',
          heightMode: '60vh',
          contentAlignment: 'center',
          overlayOpacity: 55,
          titleAnimation: 'fade-in',
        },
      },
      {
        id: 'features-1',
        type: 'features',
        data: {
          title: 'How It Works',
          features: [
            { id: 'f1', icon: 'ClipboardList', title: '1. Choose Service', description: 'Select the type of appointment you need.' },
            { id: 'f2', icon: 'Calendar', title: '2. Pick a Time', description: 'Let us know your preferred date and time.' },
            { id: 'f3', icon: 'CheckCircle', title: '3. Confirmation', description: 'We\'ll call to confirm your appointment.' },
          ],
          columns: 3,
          layout: 'grid',
          variant: 'centered',
          iconStyle: 'circle',
        },
      },
      {
        id: 'booking-1',
        type: 'booking',
        data: {
          title: 'Book Your Appointment',
          description: 'Select a service and choose an available time slot.',
          mode: 'smart',
          submitButtonText: 'Confirm Appointment',
          successMessage: 'Your appointment is booked! Check your email for confirmation.',
          showPhoneField: true,
          triggerWebhook: true,
          variant: 'card',
        },
      },
      {
        id: 'info-box-1',
        type: 'info-box',
        data: {
          title: 'What to Bring',
          content: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Please bring your insurance card, a valid ID, and a list of current medications. New patients should arrive 15 minutes early to complete paperwork.' }] }] },
          variant: 'info',
        },
      },
      {
        id: 'accordion-1',
        type: 'accordion',
        data: {
          title: 'Appointment FAQ',
          items: [
            { question: 'How far in advance can I book?', answer: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'You can book appointments up to 3 months in advance. Same-day appointments may be available for urgent care needs.' }] }] } },
            { question: 'What if I need to cancel?', answer: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Please cancel at least 24 hours before your appointment. You can call us or use the patient portal to reschedule.' }] }] } },
            { question: 'Do you accept my insurance?', answer: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'We accept most major insurance plans. Contact us to verify your specific coverage before your visit.' }] }] } },
            { question: 'Can I request a specific doctor?', answer: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Yes! Include your preferred physician in the message field and we\'ll do our best to accommodate your request.' }] }] } },
          ],
        },
      },
      {
        id: 'contact-1',
        type: 'contact',
        data: {
          title: 'Prefer to Call?',
          phone: '+1 (555) 234-5678',
          email: 'appointments@securehealth.com',
          hours: [
            { day: 'Booking Line', time: 'Mon-Fri 7AM-7PM' },
            { day: 'Urgent Care', time: '24/7 Available' },
          ],
        },
      },
    ],
  },
  {
    title: 'Contact',
    slug: 'contact',
    menu_order: 6,
    showInMenu: true,
    meta: {
      description: 'Book an appointment or reach our care team',
      showTitle: true,
      titleAlignment: 'center',
    },
    blocks: [
      {
        id: 'hero-1',
        type: 'hero',
        data: {
          title: 'Contact Us',
          subtitle: 'We\'re here to help with your healthcare needs',
          backgroundType: 'color',
          heightMode: 'auto',
          contentAlignment: 'center',
          overlayOpacity: 0,
        },
      },
      {
        id: 'chat-1',
        type: 'chat',
        data: {
          title: 'Book with AI Assistant',
          height: 'md',
          showSidebar: false,
          variant: 'card',
          initialPrompt: 'Hi! I can help you book an appointment or answer questions about our services. All conversations are private and HIPAA-compliant. How can I help?',
        },
      },
      // BOOKING - Appointment form
      {
        id: 'booking-1',
        type: 'booking',
        data: {
          title: 'Book an Appointment',
          description: 'Select a service and choose your preferred time.',
          mode: 'smart',
          submitButtonText: 'Confirm Appointment',
          successMessage: 'Your appointment is confirmed! Check your email for details.',
          showPhoneField: true,
          variant: 'card',
        },
      },
      {
        id: 'contact-1',
        type: 'contact',
        data: {
          title: 'Contact Information',
          phone: '+1 (555) 234-5678',
          email: 'care@securehealth.com',
          address: '200 Medical Center Drive, Suite 100, Boston, MA 02115',
          hours: [
            { day: 'Monday - Friday', time: '7:00 AM - 7:00 PM' },
            { day: 'Saturday', time: '8:00 AM - 4:00 PM' },
            { day: 'Sunday', time: 'Closed (Urgent Care: 24/7)' },
            { day: 'Emergency', time: 'Call 911 or (555) 234-5679' },
          ],
        },
      },
      {
        id: 'info-box-1',
        type: 'info-box',
        data: {
          title: 'Emergency Care',
          content: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'For medical emergencies, please call 911 immediately. For urgent but non-emergency concerns outside of office hours, call our 24/7 nurse line.' }] }] },
          variant: 'warning',
        },
      },
    ],
  },
  {
    title: 'Patient FAQ',
    slug: 'faq',
    menu_order: 7,
    showInMenu: true,
    meta: {
      description: 'Frequently asked questions about our healthcare services, appointments, and patient care',
      showTitle: true,
      titleAlignment: 'center',
    },
    blocks: [
      {
        id: 'hero-faq',
        type: 'hero',
        data: {
          title: 'Patient FAQ',
          subtitle: 'Find answers to common questions about our services, appointments, and patient care',
          backgroundType: 'color',
          heightMode: 'auto',
          contentAlignment: 'center',
          overlayOpacity: 0,
        },
      },
      {
        id: 'accordion-appointments',
        type: 'accordion',
        data: {
          title: 'Appointments & Scheduling',
          items: [
            { question: 'How do I schedule an appointment?', answer: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'You can schedule an appointment online through our patient portal, by calling our office at +1 (555) 234-5678, or by using our AI assistant. Same-day appointments may be available for urgent needs.' }] }] } },
            { question: 'What should I bring to my first appointment?', answer: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Please bring your insurance card, a valid photo ID, a list of current medications, and any relevant medical records. New patients should arrive 15 minutes early to complete paperwork.' }] }] } },
            { question: 'How do I cancel or reschedule?', answer: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Please cancel or reschedule at least 24 hours before your appointment. You can do this through the patient portal, by calling our office, or using our AI assistant.' }] }] } },
            { question: 'Do you offer telehealth appointments?', answer: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Yes! We offer secure video consultations for many types of appointments. Ask about telehealth options when scheduling, or select "Video Visit" in our online booking system.' }] }] } },
          ],
        },
      },
      {
        id: 'accordion-insurance',
        type: 'accordion',
        data: {
          title: 'Insurance & Billing',
          items: [
            { question: 'What insurance plans do you accept?', answer: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'We accept most major insurance plans including Medicare, Blue Cross Blue Shield, Aetna, Cigna, United Healthcare, and many others. Contact us to verify your specific coverage before your visit.' }] }] } },
            { question: 'What if I don\'t have insurance?', answer: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'We offer self-pay options and payment plans for uninsured patients. Please speak with our billing department to discuss options that work for your situation.' }] }] } },
            { question: 'How do I access my billing statements?', answer: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'You can view and pay bills through our secure patient portal. Paper statements are also mailed monthly. For billing questions, contact our billing department directly.' }] }] } },
          ],
        },
      },
      {
        id: 'accordion-privacy',
        type: 'accordion',
        data: {
          title: 'Privacy & Records',
          items: [
            { question: 'Is my health information secure?', answer: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Yes. We are fully HIPAA compliant and use state-of-the-art encryption to protect your health information. All data is stored on our own secure servers and never shared with third parties without your consent.' }] }] } },
            { question: 'How do I access my medical records?', answer: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'You can access your medical records, test results, and appointment history through our secure patient portal. We use two-factor authentication for your protection.' }] }] } },
            { question: 'Is the AI assistant really private?', answer: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Yes. Unlike cloud-based AI services, our Private AI runs entirely on our own HIPAA-compliant servers. Your conversations never leave our secure infrastructure.' }] }] } },
          ],
        },
      },
      {
        id: 'accordion-services',
        type: 'accordion',
        data: {
          title: 'Services & Care',
          items: [
            { question: 'What services do you offer?', answer: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'We offer comprehensive primary care, specialist consultations (cardiology, dermatology, etc.), pediatric care, mental health services, diagnostic testing, preventive care, and 24/7 urgent care.' }] }] } },
            { question: 'Do you provide prescription refills?', answer: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Yes. Request prescription refills through the patient portal or by calling our office. Please allow 48-72 hours for processing. Some medications may require an appointment.' }] }] } },
            { question: 'Where are you located?', answer: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'We have multiple locations throughout the region, each featuring free parking and full accessibility. Visit our Contact page for addresses and directions to each facility.' }] }] } },
          ],
        },
      },
      {
        id: 'cta-faq',
        type: 'cta',
        data: {
          title: 'Still Have Questions?',
          subtitle: 'Our care team is here to help. Contact us or use our AI assistant.',
          buttonText: 'Contact Us',
          buttonUrl: '/contact',
          gradient: false,
        },
      },
    ],
  },
  {
    title: 'Privacy Policy',
    slug: 'privacy-policy',
    menu_order: 99,
    showInMenu: false,
    meta: {
      description: 'How we collect, use and protect your personal and health data under GDPR and HIPAA',
      showTitle: true,
      titleAlignment: 'left',
    },
    blocks: [
      {
        id: 'text-1',
        type: 'text',
        data: {
          content: {
            type: 'doc',
            content: [
              { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Introduction' }] },
              { type: 'paragraph', content: [{ type: 'text', text: 'SecureHealth is committed to protecting your privacy and handling your personal and health data with the highest level of security. This policy describes how we collect, use, and protect your information in accordance with the General Data Protection Regulation (GDPR) and HIPAA regulations.' }] },
              { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Data Controller' }] },
              { type: 'paragraph', content: [{ type: 'text', text: 'SecureHealth Inc. is the data controller for the processing of your personal data. You can reach our Data Protection Officer at privacy@securehealth.com.' }] },
              { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'What Data We Collect' }] },
              { type: 'paragraph', content: [{ type: 'text', text: 'We collect necessary information to provide you with high-quality care:' }] },
              { type: 'bulletList', content: [
                { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Identity information (name, social security number, contact details)' }] }] },
                { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Health and medical records (diagnoses, treatments, lab results)' }] }] },
                { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Appointment and communication history' }] }] },
              ]},
              { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Legal Basis for Processing' }] },
              { type: 'paragraph', content: [{ type: 'text', text: 'We process your personal data based on our legal obligation to maintain medical records and to perform tasks in the public interest within the healthcare sector.' }] },
              { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Data Protection and AI Assistant' }] },
              { type: 'paragraph', content: [{ type: 'text', text: 'Our AI assistant runs locally on our own servers. Your data never leaves our infrastructure and is not shared with external parties. This ensures full HIPAA/GDPR compliance for all conversations.' }] },
              { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Your Rights' }] },
              { type: 'paragraph', content: [{ type: 'text', text: 'You have the right to access your medical records, request correction of inaccurate information, and in certain cases request deletion or restriction of processing. Please note that medical records must be retained for a minimum of 10 years by law.' }] },
              { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Contact' }] },
              { type: 'paragraph', content: [{ type: 'text', text: 'Questions about how we handle your personal data? Contact our Data Protection Officer at privacy@securehealth.com or call our clinic.' }] },
            ],
          },
        },
      },
    ],
  },
  {
    title: 'Terms of Service',
    slug: 'terms-of-service',
    menu_order: 100,
    showInMenu: false,
    meta: {
      description: 'Terms and conditions for using our healthcare services',
      showTitle: true,
      titleAlignment: 'left',
    },
    blocks: [
      {
        id: 'text-1',
        type: 'text',
        data: {
          content: {
            type: 'doc',
            content: [
              { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Agreement to Terms' }] },
              { type: 'paragraph', content: [{ type: 'text', text: 'By using SecureHealth services, including our patient portal and AI health assistant, you agree to these Terms of Service. These terms are in addition to any consent forms signed during your care.' }] },
              { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Healthcare Services' }] },
              { type: 'paragraph', content: [{ type: 'text', text: 'SecureHealth provides medical services through licensed healthcare professionals. Our AI assistant provides general health information only and does not replace professional medical advice, diagnosis, or treatment.' }] },
              { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Patient Responsibilities' }] },
              { type: 'paragraph', content: [{ type: 'text', text: 'Patients are responsible for providing accurate health information, following prescribed treatment plans, and keeping scheduled appointments. Missed appointments may be subject to cancellation fees.' }] },
              { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Privacy and Confidentiality' }] },
              { type: 'paragraph', content: [{ type: 'text', text: 'Your health information is protected under HIPAA and applicable privacy laws. Our AI assistant processes all data locally on HIPAA-compliant servers. See our Privacy Policy for full details.' }] },
              { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Emergency Services' }] },
              { type: 'paragraph', content: [{ type: 'text', text: 'Our services are not intended for medical emergencies. If you experience a medical emergency, call 911 immediately or go to the nearest emergency room.' }] },
              { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Insurance and Payment' }] },
              { type: 'paragraph', content: [{ type: 'text', text: 'We accept most major insurance plans. Patients are responsible for co-pays, deductibles, and any services not covered by insurance. Payment is due at time of service unless other arrangements are made.' }] },
              { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Medical Records' }] },
              { type: 'paragraph', content: [{ type: 'text', text: 'Patients have the right to access their medical records through our secure patient portal. Records are retained in accordance with applicable laws and regulations.' }] },
              { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Contact' }] },
              { type: 'paragraph', content: [{ type: 'text', text: 'Questions about these Terms? Contact our patient services team at care@securehealth.com or call our main office.' }] },
            ],
          },
        },
      },
    ],
  },
  {
    title: 'Cookie Policy',
    slug: 'cookie-policy',
    menu_order: 101,
    showInMenu: false,
    meta: {
      description: 'Information about how we use cookies on our healthcare website',
      showTitle: true,
      titleAlignment: 'left',
    },
    blocks: [
      {
        id: 'text-1',
        type: 'text',
        data: {
          content: {
            type: 'doc',
            content: [
              { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'What Are Cookies?' }] },
              { type: 'paragraph', content: [{ type: 'text', text: 'Cookies are small text files stored on your device when you visit our website. We use cookies to provide secure, HIPAA-compliant services while respecting your privacy.' }] },
              { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Types of Cookies We Use' }] },
              { type: 'heading', attrs: { level: 3 }, content: [{ type: 'text', text: 'Essential Cookies' }] },
              { type: 'paragraph', content: [{ type: 'text', text: 'Required for secure access to our patient portal and healthcare services. These cookies enable authentication, session management, and security features required for HIPAA compliance.' }] },
              { type: 'heading', attrs: { level: 3 }, content: [{ type: 'text', text: 'Analytics Cookies' }] },
              { type: 'paragraph', content: [{ type: 'text', text: 'Help us understand how patients use our website to improve the experience. Analytics data is anonymized and never includes protected health information (PHI).' }] },
              { type: 'heading', attrs: { level: 3 }, content: [{ type: 'text', text: 'Functional Cookies' }] },
              { type: 'paragraph', content: [{ type: 'text', text: 'Remember your preferences such as language settings and accessibility options. These enhance your experience but do not store health information.' }] },
              { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'HIPAA Compliance' }] },
              { type: 'paragraph', content: [{ type: 'text', text: 'Our cookie usage is designed to comply with HIPAA regulations. Cookies never contain protected health information. All patient data is processed separately through our secure, HIPAA-compliant infrastructure.' }] },
              { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Patient Portal Cookies' }] },
              { type: 'paragraph', content: [{ type: 'text', text: 'When you access our patient portal, session cookies are used to maintain your secure login. These cookies are encrypted and expire when you log out or after a period of inactivity.' }] },
              { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Managing Cookie Preferences' }] },
              { type: 'paragraph', content: [{ type: 'text', text: 'You can manage non-essential cookie preferences through our cookie banner. Note that disabling essential cookies may prevent access to certain healthcare services.' }] },
              { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Contact' }] },
              { type: 'paragraph', content: [{ type: 'text', text: 'Questions about cookies or data privacy? Contact our privacy team at privacy@securehealth.com.' }] },
            ],
          },
        },
      },
    ],
  },
  {
    title: 'Accessibility',
    slug: 'accessibility',
    menu_order: 99,
    showInMenu: false,
    meta: {
      description: 'Our commitment to making healthcare accessible to everyone',
      showTitle: true,
      titleAlignment: 'left',
    },
    blocks: [
      {
        id: 'text-accessibility',
        type: 'text',
        data: {
          content: {
            type: 'doc',
            content: [
              { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Our Commitment to Accessibility' }] },
              { type: 'paragraph', content: [{ type: 'text', text: 'SecureHealth is committed to ensuring that our website and healthcare services are accessible to everyone, including individuals with disabilities. We strive to meet or exceed the requirements of the Americans with Disabilities Act (ADA) and Web Content Accessibility Guidelines (WCAG) 2.1 Level AA.' }] },
              { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Accessibility Features' }] },
              { type: 'paragraph', content: [{ type: 'text', text: 'Our website includes the following accessibility features:' }] },
              { type: 'bulletList', content: [
                { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Keyboard navigation support for all interactive elements' }] }] },
                { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Screen reader compatibility with proper ARIA labels and semantic HTML' }] }] },
                { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'High contrast text and adjustable font sizes' }] }] },
                { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Alternative text for all images and media' }] }] },
                { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Clear and consistent navigation structure' }] }] },
                { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Captions and transcripts for video and audio content' }] }] },
              ]},
              { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Physical Accessibility' }] },
              { type: 'paragraph', content: [{ type: 'text', text: 'All SecureHealth facilities are fully accessible and compliant with ADA requirements, including:' }] },
              { type: 'bulletList', content: [
                { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Wheelchair accessible entrances and examination rooms' }] }] },
                { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Accessible parking spaces close to building entrances' }] }] },
                { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Elevators in multi-story facilities' }] }] },
                { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Accessible restrooms on all floors' }] }] },
                { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Sign language interpretation available upon request' }] }] },
              ]},
              { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Assistive Technologies' }] },
              { type: 'paragraph', content: [{ type: 'text', text: 'We provide accommodations for patients who use assistive technologies including screen readers, magnification software, and voice recognition software. Please let us know your needs when scheduling your appointment.' }] },
              { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Feedback and Assistance' }] },
              { type: 'paragraph', content: [{ type: 'text', text: 'We are continually working to improve accessibility. If you encounter any barriers or have suggestions for improvement, please contact us:' }] },
              { type: 'bulletList', content: [
                { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Email: accessibility@securehealth.com' }] }] },
                { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Phone: +1 (555) 234-5680 (TTY available)' }] }] },
              ]},
              { type: 'paragraph', content: [{ type: 'text', text: 'We aim to respond to all accessibility inquiries within 2 business days and will work with you to provide the information or service you need in an accessible format.' }] },
            ],
          },
        },
      },
    ],
  },
];

// =====================================================
// MOMENTUM - Single-Page YC-Style Template
// =====================================================
const momentumPages: TemplatePage[] = [
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
      // Section 1: Hero (viewport height, video background)
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
      // Section 2: Stats (social proof)
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
      // MARQUEE - Tech stack showcase
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
      // Section 3: Link-Grid (features as bento-style cards)
      {
        id: 'link-grid-1',
        type: 'link-grid',
        data: {
          columns: 3,
          links: [
            { icon: 'Sparkles', title: 'AI Copilot', description: 'Code suggestions powered by the latest AI models. Write better code, faster.', url: '#features' },
            { icon: 'Rocket', title: 'Instant Deploy', description: 'Push to production in one click. Zero configuration, infinite possibilities.', url: '#features' },
            { icon: 'Shield', title: 'Enterprise Security', description: 'SOC 2 Type II, GDPR, and HIPAA compliant from day one.', url: '#features' },
            { icon: 'Blocks', title: 'Modular APIs', description: 'Build anything with composable blocks. Mix, match, and extend.', url: '#features' },
            { icon: 'Globe', title: 'Global Edge', description: '300+ edge locations worldwide. Your users get speed, everywhere.', url: '#features' },
            { icon: 'Users', title: 'Team Collaboration', description: 'Real-time editing, branching, and reviews. Built for modern teams.', url: '#features' },
          ],
        },
      },
      // Section 4: Two-Column (feature deep-dive #1)
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
      // Section 5: Two-Column (feature deep-dive #2, image left)
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
      // Section 6: Quote (testimonial)
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
      // Section 7: Accordion (FAQ section)
      {
        id: 'accordion-1',
        type: 'accordion',
        data: {
          title: 'Frequently Asked Questions',
          items: [
            { 
              question: 'How does pricing work?', 
              answer: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Start free with generous limits. As you scale, pay only for what you use. No surprises, no hidden fees. We also offer startup credits for qualifying companies.' }] }] } 
            },
            { 
              question: 'Is my data secure?', 
              answer: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Absolutely. We are SOC 2 Type II certified, GDPR compliant, and offer HIPAA-compliant options for healthcare companies. All data is encrypted at rest and in transit.' }] }] } 
            },
            { 
              question: 'Can I migrate from my current platform?', 
              answer: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Yes! We offer free migration assistance for teams coming from other platforms. Most migrations complete in under 24 hours with zero downtime.' }] }] } 
            },
            { 
              question: 'What kind of support do you offer?', 
              answer: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'All plans include community support. Pro and Enterprise plans include dedicated support with guaranteed response times and a named account manager.' }] }] } 
            },
          ],
        },
      },
      // Section 8: CTA (gradient, full-width)
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
  {
    title: 'Privacy Policy',
    slug: 'privacy-policy',
    menu_order: 99,
    showInMenu: false,
    meta: {
      description: 'How Momentum collects, uses, and protects your data',
      showTitle: true,
      titleAlignment: 'left',
    },
    blocks: [
      {
        id: 'text-privacy',
        type: 'text',
        data: {
          content: {
            type: 'doc',
            content: [
              { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Introduction' }] },
              { type: 'paragraph', content: [{ type: 'text', text: 'At Momentum, we take your privacy seriously. This Privacy Policy explains how we collect, use, disclose, and safeguard your information when you use our developer platform.' }] },
              { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Information We Collect' }] },
              { type: 'paragraph', content: [{ type: 'text', text: 'We collect information you provide directly, including account information (name, email, company), usage data, and content you create using our platform.' }] },
              { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'How We Use Your Information' }] },
              { type: 'paragraph', content: [{ type: 'text', text: 'We use collected information to provide and improve our services, communicate with you about your account, ensure platform security, and comply with legal obligations.' }] },
              { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Data Security' }] },
              { type: 'paragraph', content: [{ type: 'text', text: 'We implement industry-standard security measures including encryption at rest and in transit, regular security audits, and SOC 2 Type II compliance. Your code and data are protected with enterprise-grade security.' }] },
              { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Data Retention' }] },
              { type: 'paragraph', content: [{ type: 'text', text: 'We retain your data for as long as your account is active. Upon account deletion, we remove your data within 30 days, except where retention is required by law.' }] },
              { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Your Rights' }] },
              { type: 'paragraph', content: [{ type: 'text', text: 'You have the right to access, correct, or delete your personal data. You can export your data at any time through your account settings. Contact privacy@momentum.dev for data requests.' }] },
              { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Contact' }] },
              { type: 'paragraph', content: [{ type: 'text', text: 'Questions about this policy? Email us at privacy@momentum.dev.' }] },
            ],
          },
        },
      },
    ],
  },
  {
    title: 'Terms of Service',
    slug: 'terms-of-service',
    menu_order: 99,
    showInMenu: false,
    meta: {
      description: 'Terms and conditions for using the Momentum platform',
      showTitle: true,
      titleAlignment: 'left',
    },
    blocks: [
      {
        id: 'text-terms',
        type: 'text',
        data: {
          content: {
            type: 'doc',
            content: [
              { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Acceptance of Terms' }] },
              { type: 'paragraph', content: [{ type: 'text', text: 'By accessing or using Momentum, you agree to be bound by these Terms of Service and our Privacy Policy. If you disagree with any part of these terms, you may not use our services.' }] },
              { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Description of Service' }] },
              { type: 'paragraph', content: [{ type: 'text', text: 'Momentum provides a developer platform for building, deploying, and scaling applications. We reserve the right to modify, suspend, or discontinue any part of the service with notice.' }] },
              { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'User Accounts' }] },
              { type: 'paragraph', content: [{ type: 'text', text: 'You are responsible for maintaining the confidentiality of your account credentials and for all activities under your account. Notify us immediately of any unauthorized access.' }] },
              { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Acceptable Use' }] },
              { type: 'paragraph', content: [{ type: 'text', text: 'You agree not to use our platform for any unlawful purpose, to harm others, distribute malware, or violate any applicable laws or regulations.' }] },
              { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Intellectual Property' }] },
              { type: 'paragraph', content: [{ type: 'text', text: 'You retain ownership of content you create. You grant us a license to host and serve your content as necessary to provide the service. Momentum and its logo are our trademarks.' }] },
              { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Limitation of Liability' }] },
              { type: 'paragraph', content: [{ type: 'text', text: 'To the maximum extent permitted by law, Momentum shall not be liable for any indirect, incidental, special, or consequential damages arising from your use of the service.' }] },
              { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Termination' }] },
              { type: 'paragraph', content: [{ type: 'text', text: 'We may terminate or suspend your account for violations of these terms. You may terminate your account at any time through your account settings.' }] },
              { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Contact' }] },
              { type: 'paragraph', content: [{ type: 'text', text: 'Questions about these terms? Contact us at legal@momentum.dev.' }] },
            ],
          },
        },
      },
      // FLOATING CTA - Persistent conversion element
      {
        id: 'floating-cta-1',
        type: 'floating-cta',
        data: {
          text: 'Ready to ship faster?',
          buttonText: 'Start Building Free',
          buttonUrl: '#pricing',
          variant: 'pill',
          position: 'bottom',
          size: 'md',
          scrollThreshold: 300,
          hideOnScrollUp: false,
          closeable: true,
          closePersistent: true,
        },
      },
    ],
  },
];

// =====================================================
// MAIN EXPORT
// =====================================================
export const STARTER_TEMPLATES: StarterTemplate[] = [
  {
    id: 'launchpad',
    name: 'LaunchPad',
    description: 'Modern, conversion-focused template for SaaS and tech startups. Features bold hero with video support, social proof stats, and a helpful AI chat widget.',
    category: 'startup',
    icon: 'Rocket',
    tagline: 'Perfect for startups & SaaS',
    aiChatPosition: 'Small card widget for quick support',
    pages: launchpadPages,
    blogPosts: launchpadBlogPosts,
    kbCategories: launchpadKbCategories,
    branding: {
      organizationName: 'LaunchPad',
      brandTagline: 'Launch Your Vision',
      primaryColor: '250 84% 54%',
      headingFont: 'Space Grotesk',
      bodyFont: 'Inter',
      borderRadius: 'md',
      shadowIntensity: 'medium',
    },
    chatSettings: {
      enabled: true,
      aiProvider: 'openai',
      n8nWebhookUrl: '',
      widgetEnabled: true,
      widgetPosition: 'bottom-right',
      welcomeMessage: 'Hi! How can we help you today?',
      systemPrompt: 'You are a helpful assistant for a SaaS startup. Be friendly, concise, and help users understand the product.',
      suggestedPrompts: [
        'What does your product do?',
        'How much does it cost?',
        'Can I get a demo?',
      ],
    },
    footerSettings: {
      email: 'hello@launchpad.io',
      phone: '+46 8 123 456 78',
      address: 'Birger Jarlsgatan 57',
      postalCode: '113 56 Stockholm',
      weekdayHours: 'Mon-Fri 9-18',
      weekendHours: 'Closed',
      linkedin: 'https://linkedin.com/company/launchpad',
      twitter: 'https://twitter.com/launchpad',
      legalLinks: [
        { id: 'help', label: 'Help Center', url: '/help', enabled: true },
        { id: 'privacy', label: 'Privacy Policy', url: '/privacy-policy', enabled: true },
        { id: 'terms', label: 'Terms of Service', url: '/terms-of-service', enabled: true },
        { id: 'cookies', label: 'Cookie Policy', url: '/cookie-policy', enabled: true },
      ],
    },
    seoSettings: {
      siteTitle: 'LaunchPad',
      titleTemplate: '%s | LaunchPad',
      defaultDescription: 'The platform that scales with your ambition. Build faster, iterate smarter, grow exponentially.',
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
  },
  {
    id: 'momentum',
    name: 'Momentum',
    description: 'Stunning single-page template with YC-style dark gradient design. Bold typography, smooth animations, and maximum impact.',
    category: 'startup',
    icon: 'Zap',
    tagline: 'One page. Maximum impact.',
    aiChatPosition: 'Disabled for clean single-page experience',
    pages: momentumPages,
    blogPosts: momentumBlogPosts,
    branding: {
      organizationName: 'Momentum',
      brandTagline: 'Build the Future',
      primaryColor: '250 91% 64%',       // Vibrant purple (Linear-style)
      secondaryColor: '240 10% 10%',     // Near-black background
      accentColor: '180 100% 50%',       // Cyan accent
      headingFont: 'Plus Jakarta Sans',  // Modern geometric sans
      bodyFont: 'Inter',
      borderRadius: 'lg',
      shadowIntensity: 'medium',
      allowThemeToggle: false,           // Dark mode only for consistency
      defaultTheme: 'dark',              // Force dark mode for this template
    },
    chatSettings: {
      enabled: false,                    // Clean single-page feel
      widgetEnabled: false,
    },
    footerSettings: {
      email: 'hello@momentum.dev',
      phone: '',
      address: 'San Francisco, CA',
      postalCode: '',
      weekdayHours: '',
      weekendHours: '',
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
  },
  {
    id: 'trustcorp',
    name: 'TrustCorp',
    description: 'Professional template for established enterprises. Emphasizes trust, scale, and data sovereignty with a prominent private AI assistant.',
    category: 'enterprise',
    icon: 'Building2',
    tagline: 'For enterprises that demand excellence',
    aiChatPosition: 'Large embedded assistant with data sovereignty messaging',
    pages: trustcorpPages,
    blogPosts: trustcorpBlogPosts,
    kbCategories: trustcorpKbCategories,
    branding: {
      organizationName: 'TrustCorp',
      brandTagline: 'Enterprise Excellence',
      primaryColor: '220 70% 35%',
      headingFont: 'Playfair Display',
      bodyFont: 'Source Sans Pro',
      borderRadius: 'sm',
      shadowIntensity: 'subtle',
    },
    chatSettings: {
      enabled: true,
      aiProvider: 'n8n',
      n8nWebhookUrl: 'https://your-n8n-instance.com/webhook/chat',
      widgetEnabled: false,
      blockEnabled: true,
      welcomeMessage: 'Welcome to TrustCorp. How can I assist you today?',
      systemPrompt: 'You are a professional enterprise assistant. Be formal, knowledgeable, and emphasize data security and compliance.',
      suggestedPrompts: [
        'Tell me about your enterprise solutions',
        'How do you ensure data security?',
        'I need to speak with a consultant',
      ],
    },
    footerSettings: {
      email: 'contact@trustcorp.com',
      phone: '+46 8 555 000 00',
      address: 'Stureplan 4',
      postalCode: '114 35 Stockholm',
      weekdayHours: 'Mon-Fri 8-17',
      weekendHours: 'Closed',
      linkedin: 'https://linkedin.com/company/trustcorp',
      legalLinks: [
        { id: 'support', label: 'Support Center', url: '/support', enabled: true },
        { id: 'privacy', label: 'Privacy Policy', url: '/privacy-policy', enabled: true },
        { id: 'terms', label: 'Terms of Service', url: '/terms-of-service', enabled: true },
        { id: 'cookies', label: 'Cookie Policy', url: '/cookie-policy', enabled: true },
      ],
    },
    seoSettings: {
      siteTitle: 'TrustCorp',
      titleTemplate: '%s | TrustCorp',
      defaultDescription: 'Enterprise solutions that demand excellence, security, and scalability.',
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
  },
  {
    id: 'securehealth',
    name: 'SecureHealth',
    description: 'Compliance-first template for healthcare, legal, and finance. Features a prominent Private AI assistant with HIPAA-compliant messaging.',
    category: 'compliance',
    icon: 'ShieldCheck',
    tagline: 'For organizations where cloud AI is not an option',
    aiChatPosition: 'Full-height featured AI with explicit privacy messaging',
    pages: securehealthPages,
    blogPosts: securehealthBlogPosts,
    kbCategories: securehealthKbCategories,
    branding: {
      organizationName: 'SecureHealth',
      brandTagline: 'Your Health, Your Privacy',
      primaryColor: '199 89% 35%',
      headingFont: 'Merriweather',
      bodyFont: 'Open Sans',
      borderRadius: 'md',
      shadowIntensity: 'subtle',
    },
    chatSettings: {
      enabled: true,
      aiProvider: 'local',
      localEndpoint: 'https://your-local-llm.internal/v1',
      n8nWebhookUrl: '',
      widgetEnabled: true,
      widgetPosition: 'bottom-right',
      welcomeMessage: 'Hello! I\'m your private health assistant. How can I help?',
      systemPrompt: 'You are a HIPAA-compliant healthcare assistant. Be compassionate, informative, and always emphasize patient privacy. Never provide medical diagnoses.',
      suggestedPrompts: [
        'What services do you offer?',
        'How do I book an appointment?',
        'Is my data kept private?',
      ],
    },
    footerSettings: {
      email: 'info@securehealth.se',
      phone: '+46 8 700 00 00',
      address: 'Valhallavägen 91',
      postalCode: '114 28 Stockholm',
      weekdayHours: 'Mon-Fri 8-17',
      weekendHours: 'Emergency line 24/7',
      legalLinks: [
        { id: 'faq', label: 'Patient FAQ', url: '/faq', enabled: true },
        { id: 'privacy', label: 'Privacy Policy', url: '/privacy-policy', enabled: true },
        { id: 'terms', label: 'Terms of Service', url: '/terms-of-service', enabled: true },
        { id: 'cookies', label: 'Cookie Policy', url: '/cookie-policy', enabled: true },
        { id: 'accessibility', label: 'Accessibility', url: '/accessibility', enabled: true },
      ],
    },
    seoSettings: {
      siteTitle: 'SecureHealth',
      titleTemplate: '%s | SecureHealth',
      defaultDescription: 'HIPAA-compliant healthcare services with complete privacy. Your data stays on our servers.',
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
  },
  // =====================================================
  // FLOWWINK PLATFORM - SaaS Template (Dogfooding)
  // =====================================================
  {
    id: 'flowwink-platform',
    name: 'FlowWink Platform',
    description: 'Complete SaaS landing page template showcasing all CMS features. Built for platform businesses with pricing, comparisons, and feature highlights.',
    category: 'platform',
    icon: 'Blocks',
    tagline: 'The ultimate dogfood - built with FlowWink, for FlowWink',
    aiChatPosition: 'Embedded assistant for product questions',
    blogPosts: flowwinkBlogPosts,
    kbCategories: flowwinkKbCategories,
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
          // KB SEARCH - Hero variant for Knowledge Base integration
          {
            id: 'kb-search-hero',
            type: 'kb-search',
            data: {
              title: 'How can we help you?',
              subtitle: 'Search our documentation and knowledge base for answers.',
              placeholder: 'Search for answers...',
              buttonText: 'Search',
              variant: 'hero',
              showButton: true,
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
          // LOGOS - Trusted by
          {
            id: 'logos-trusted',
            type: 'logos',
            data: {
              title: 'Trusted by Modern Teams',
              logos: [
                { id: 'logo-1', name: 'TechCorp', logo: 'https://images.unsplash.com/photo-1611162617474-5b21e879e113?w=120&h=40&fit=crop' },
                { id: 'logo-2', name: 'StartupX', logo: 'https://images.unsplash.com/photo-1611162616305-c69b3fa7fbe0?w=120&h=40&fit=crop' },
                { id: 'logo-3', name: 'DigitalCo', logo: 'https://images.unsplash.com/photo-1611162618071-b39a2ec055fb?w=120&h=40&fit=crop' },
                { id: 'logo-4', name: 'InnovateLab', logo: 'https://images.unsplash.com/photo-1611162617213-7d7a39e9b1d7?w=120&h=40&fit=crop' },
                { id: 'logo-5', name: 'FutureTech', logo: 'https://images.unsplash.com/photo-1611162616475-46b635cb6868?w=120&h=40&fit=crop' },
              ],
              columns: 5,
              layout: 'grid',
              variant: 'grayscale',
              logoSize: 'md',
            },
          },
          // FEATURES - Complete CMS modules
          {
            id: 'features-modules',
            type: 'features',
            data: {
              title: 'Everything You Need',
              subtitle: 'A complete content platform with built-in modules that just work.',
              features: [
                {
                  id: 'mod-blog',
                  icon: 'FileText',
                  title: 'Blog Module',
                  description: 'Full-featured blog with categories, tags, authors, and SEO optimization. RSS feeds included.',
                },
                {
                  id: 'mod-newsletter',
                  icon: 'Mail',
                  title: 'Newsletter Module',
                  description: 'Built-in subscriber management, GDPR compliance, and email campaigns. No third-party needed.',
                },
                {
                  id: 'mod-crm',
                  icon: 'Users',
                  title: 'CRM Module',
                  description: 'Lead management, company tracking, and deal pipeline. Convert visitors to customers.',
                },
                {
                  id: 'mod-kb',
                  icon: 'Library',
                  title: 'Knowledge Base',
                  description: 'Structured FAQ with categories, full-text search, and AI chat integration for instant answers.',
                },
                {
                  id: 'mod-ecommerce',
                  icon: 'ShoppingCart',
                  title: 'E-commerce',
                  description: 'Products, orders, and Stripe checkout. Sell subscriptions or one-time purchases.',
                },
                {
                  id: 'mod-forms',
                  icon: 'ClipboardList',
                  title: 'Form Builder',
                  description: 'Drag-and-drop forms with validation, submissions tracking, and webhook integration.',
                },
                {
                  id: 'mod-media',
                  icon: 'Image',
                  title: 'Media Library',
                  description: 'Centralized asset management with image optimization, cropping, and Unsplash integration.',
                },
                {
                  id: 'mod-webhooks',
                  icon: 'Webhook',
                  title: 'Webhooks & API',
                  description: 'Connect to any service with webhooks. N8N templates included for common automations.',
                },
              ],
              columns: 4,
              layout: 'grid',
              variant: 'cards',
              iconStyle: 'square',
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
          // TESTIMONIALS - Social proof
          {
            id: 'testimonials-main',
            type: 'testimonials',
            data: {
              title: 'What Our Users Say',
              testimonials: [
                {
                  id: 'test-1',
                  content: 'Finally a CMS that gives us both a beautiful website AND the API flexibility we need. The AI chat feature has reduced our support tickets by 40%.',
                  author: 'Emma Lindqvist',
                  role: 'CTO',
                  company: 'TechStart AB',
                  rating: 5,
                },
                {
                  id: 'test-2',
                  content: 'We migrated from WordPress in an afternoon. The visual editor is intuitive, and the headless API lets us build our mobile app with the same content.',
                  author: 'Marcus Andersson',
                  role: 'Product Lead',
                  company: 'DigitalFlow',
                  rating: 5,
                },
                {
                  id: 'test-3',
                  content: 'The private LLM support was the dealbreaker for us. We needed AI features but couldn\'t send patient data to external services. FlowWink delivered.',
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
          // Hero
          {
            id: 'hero-features',
            type: 'hero',
            data: {
              title: 'Features That Matter',
              subtitle: 'Everything you need to manage content, engage visitors, and grow your business – with 27+ content blocks, editorial workflow, and AI-powered tools.',
              backgroundType: 'color',
              heightMode: 'auto',
              contentAlignment: 'center',
              overlayOpacity: 0,
              showScrollIndicator: true,
            },
          },
          // Stats - Block count highlight
          {
            id: 'stats-blocks',
            type: 'stats',
            data: {
              title: '',
              items: [
                { id: 'stat-blocks', value: '27+', label: 'Content Blocks' },
                { id: 'stat-roles', value: '3', label: 'Editorial Roles' },
                { id: 'stat-modules', value: '8', label: 'Built-in Modules' },
                { id: 'stat-api', value: '100%', label: 'API Coverage' },
              ],
              columns: 4,
              variant: 'cards',
            },
          },
          // Separator - Editorial Workflow
          {
            id: 'sep-workflow',
            type: 'separator',
            data: {
              variant: 'text',
              text: 'Editorial Workflow',
              icon: 'Users',
            },
          },
          // Timeline - Content Publishing Flow
          {
            id: 'timeline-workflow',
            type: 'timeline',
            data: {
              title: 'From Draft to Published',
              subtitle: 'A structured workflow that ensures quality and accountability.',
              items: [
                {
                  id: 'tw-1',
                  title: 'Draft',
                  description: 'Writer creates content using the visual editor. Every change is automatically saved and versioned.',
                  icon: 'PenLine',
                },
                {
                  id: 'tw-2',
                  title: 'Submit for Review',
                  description: 'When ready, the writer submits the content for approval. Reviewers are notified automatically.',
                  icon: 'Send',
                },
                {
                  id: 'tw-3',
                  title: 'Review & Approve',
                  description: 'Approvers review content, leave feedback, or approve for publishing. All feedback is tracked.',
                  icon: 'CheckCircle',
                },
                {
                  id: 'tw-4',
                  title: 'Publish',
                  description: 'Content goes live immediately or at a scheduled time. Previous versions remain accessible.',
                  icon: 'Globe',
                },
              ],
              layout: 'vertical',
            },
          },
          // Features - Roles
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
          // Two-Column - Version History
          {
            id: 'twocol-versions',
            type: 'two-column',
            data: {
              leftColumn: {
                type: 'doc',
                content: [
                  { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Version History & Rollback' }] },
                  { type: 'paragraph', content: [{ type: 'text', text: 'Every save creates a version. Every version is accessible forever.' }] },
                  { type: 'bulletList', content: [
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Compare any two versions side-by-side' }] }] },
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Restore previous versions with one click' }] }] },
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'See who made each change and when' }] }] },
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Full audit trail for compliance' }] }] },
                  ] },
                ],
              },
              rightColumn: {
                type: 'doc',
                content: [
                  { type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'italic' }], text: '📋 Version panel showing all previous saves with timestamps, authors, and one-click restore buttons.' }] },
                ],
              },
              layout: '60-40',
            },
          },
          // Info Box - Scheduled Publishing
          {
            id: 'info-scheduling',
            type: 'info-box',
            data: {
              variant: 'highlight',
              content: {
                type: 'doc',
                content: [
                  { type: 'heading', attrs: { level: 3 }, content: [{ type: 'text', text: '⏰ Scheduled Publishing' }] },
                  { type: 'paragraph', content: [{ type: 'text', text: 'Set a future publish date and time. Content goes live automatically – perfect for product launches, announcements, and coordinated campaigns. Timezone-aware scheduling ensures accuracy across regions.' }] },
                ],
              },
            },
          },
          // Separator - Knowledge Base
          {
            id: 'sep-kb',
            type: 'separator',
            data: {
              variant: 'text',
              text: 'Knowledge Base',
              icon: 'BookOpen',
            },
          },
          // Features - Knowledge Base
          {
            id: 'features-kb',
            type: 'features',
            data: {
              title: 'Built-in Help Center',
              subtitle: 'Create a searchable knowledge base that reduces support tickets.',
              features: [
                { id: 'kb-cat', icon: 'FolderTree', title: 'Hierarchical Categories', description: 'Organize articles into nested categories. Visitors find answers fast.' },
                { id: 'kb-search', icon: 'Search', title: 'Full-Text Search', description: 'Instant search across all articles. Results ranked by relevance.' },
                { id: 'kb-ai', icon: 'MessageCircle', title: 'AI Chat Integration', description: 'Chat widget automatically references KB content to answer visitor questions.' },
                { id: 'kb-visibility', icon: 'Eye', title: 'Public or Private', description: 'Control visibility per article. Internal docs stay internal.' },
              ],
              columns: 4,
              variant: 'minimal',
              iconStyle: 'circle',
            },
          },
          // Quote - KB benefit
          {
            id: 'quote-kb',
            type: 'quote',
            data: {
              quote: 'Our support tickets dropped 40% after launching the knowledge base. The AI chat answers most questions before they reach our inbox.',
              author: 'Content Manager',
              role: 'SaaS Company',
              variant: 'centered',
            },
          },
          // Separator - Visual Editor
          {
            id: 'sep-blocks',
            type: 'separator',
            data: {
              variant: 'text',
              text: '27+ Content Blocks',
              icon: 'LayoutGrid',
            },
          },
          // Accordion - All Block Types
          {
            id: 'accordion-blocks',
            type: 'accordion',
            data: {
              title: 'Explore All Block Types',
              items: [
                {
                  question: 'Text & Media (6 blocks)',
                  answer: {
                    type: 'doc',
                    content: [
                      { type: 'paragraph', content: [
                        { type: 'text', marks: [{ type: 'bold' }], text: 'Text' },
                        { type: 'text', text: ' – Rich text with formatting, links, and embedded media.' },
                      ] },
                      { type: 'paragraph', content: [
                        { type: 'text', marks: [{ type: 'bold' }], text: 'Image' },
                        { type: 'text', text: ' – Single images with captions, alt text, and responsive sizing.' },
                      ] },
                      { type: 'paragraph', content: [
                        { type: 'text', marks: [{ type: 'bold' }], text: 'Gallery' },
                        { type: 'text', text: ' – Grid, masonry, or carousel layouts for image collections.' },
                      ] },
                      { type: 'paragraph', content: [
                        { type: 'text', marks: [{ type: 'bold' }], text: 'YouTube' },
                        { type: 'text', text: ' – Embedded videos with lazy loading for performance.' },
                      ] },
                      { type: 'paragraph', content: [
                        { type: 'text', marks: [{ type: 'bold' }], text: 'Quote' },
                        { type: 'text', text: ' – Testimonials, pull quotes, or highlighted statements.' },
                      ] },
                      { type: 'paragraph', content: [
                        { type: 'text', marks: [{ type: 'bold' }], text: 'Logos' },
                        { type: 'text', text: ' – Client logos, partner badges, or trust indicators.' },
                      ] },
                    ],
                  },
                },
                {
                  question: 'Layout & Structure (5 blocks)',
                  answer: {
                    type: 'doc',
                    content: [
                      { type: 'paragraph', content: [
                        { type: 'text', marks: [{ type: 'bold' }], text: 'Hero' },
                        { type: 'text', text: ' – Full-width headers with backgrounds, CTAs, and animations.' },
                      ] },
                      { type: 'paragraph', content: [
                        { type: 'text', marks: [{ type: 'bold' }], text: 'Two-Column' },
                        { type: 'text', text: ' – Side-by-side content with flexible width ratios.' },
                      ] },
                      { type: 'paragraph', content: [
                        { type: 'text', marks: [{ type: 'bold' }], text: 'Separator' },
                        { type: 'text', text: ' – Visual dividers with lines, icons, or text labels.' },
                      ] },
                      { type: 'paragraph', content: [
                        { type: 'text', marks: [{ type: 'bold' }], text: 'Header' },
                        { type: 'text', text: ' – Site navigation with logo, menu, and optional CTA.' },
                      ] },
                      { type: 'paragraph', content: [
                        { type: 'text', marks: [{ type: 'bold' }], text: 'Footer' },
                        { type: 'text', text: ' – Site footer with links, social icons, and copyright.' },
                      ] },
                    ],
                  },
                },
                {
                  question: 'Navigation & Content (4 blocks)',
                  answer: {
                    type: 'doc',
                    content: [
                      { type: 'paragraph', content: [
                        { type: 'text', marks: [{ type: 'bold' }], text: 'Link Grid' },
                        { type: 'text', text: ' – Icon cards linking to internal or external pages.' },
                      ] },
                      { type: 'paragraph', content: [
                        { type: 'text', marks: [{ type: 'bold' }], text: 'Article Grid' },
                        { type: 'text', text: ' – Blog post previews in grid or list format.' },
                      ] },
                      { type: 'paragraph', content: [
                        { type: 'text', marks: [{ type: 'bold' }], text: 'Accordion' },
                        { type: 'text', text: ' – Collapsible FAQ sections or detailed content.' },
                      ] },
                      { type: 'paragraph', content: [
                        { type: 'text', marks: [{ type: 'bold' }], text: 'Timeline' },
                        { type: 'text', text: ' – Chronological events, process steps, or history.' },
                      ] },
                    ],
                  },
                },
                {
                  question: 'Information & Trust (6 blocks)',
                  answer: {
                    type: 'doc',
                    content: [
                      { type: 'paragraph', content: [
                        { type: 'text', marks: [{ type: 'bold' }], text: 'Features' },
                        { type: 'text', text: ' – Feature cards with icons, in grid or list layout.' },
                      ] },
                      { type: 'paragraph', content: [
                        { type: 'text', marks: [{ type: 'bold' }], text: 'Stats' },
                        { type: 'text', text: ' – Key metrics, numbers, and achievements.' },
                      ] },
                      { type: 'paragraph', content: [
                        { type: 'text', marks: [{ type: 'bold' }], text: 'Testimonials' },
                        { type: 'text', text: ' – Customer reviews with photos and ratings.' },
                      ] },
                      { type: 'paragraph', content: [
                        { type: 'text', marks: [{ type: 'bold' }], text: 'Team' },
                        { type: 'text', text: ' – Team member profiles with photos and social links.' },
                      ] },
                      { type: 'paragraph', content: [
                        { type: 'text', marks: [{ type: 'bold' }], text: 'Comparison' },
                        { type: 'text', text: ' – Feature comparison tables for products or plans.' },
                      ] },
                      { type: 'paragraph', content: [
                        { type: 'text', marks: [{ type: 'bold' }], text: 'Info Box' },
                        { type: 'text', text: ' – Highlighted tips, warnings, or callouts.' },
                      ] },
                    ],
                  },
                },
                {
                  question: 'Interaction & Conversion (6 blocks)',
                  answer: {
                    type: 'doc',
                    content: [
                      { type: 'paragraph', content: [
                        { type: 'text', marks: [{ type: 'bold' }], text: 'CTA' },
                        { type: 'text', text: ' – Call-to-action sections with buttons and gradient backgrounds.' },
                      ] },
                      { type: 'paragraph', content: [
                        { type: 'text', marks: [{ type: 'bold' }], text: 'Contact' },
                        { type: 'text', text: ' – Contact information with phone, email, and hours.' },
                      ] },
                      { type: 'paragraph', content: [
                        { type: 'text', marks: [{ type: 'bold' }], text: 'Form' },
                        { type: 'text', text: ' – Custom forms with validation and submission handling.' },
                      ] },
                      { type: 'paragraph', content: [
                        { type: 'text', marks: [{ type: 'bold' }], text: 'Newsletter' },
                        { type: 'text', text: ' – Email signup with GDPR-compliant double opt-in.' },
                      ] },
                      { type: 'paragraph', content: [
                        { type: 'text', marks: [{ type: 'bold' }], text: 'Booking' },
                        { type: 'text', text: ' – Appointment scheduling with calendar integration.' },
                      ] },
                      { type: 'paragraph', content: [
                        { type: 'text', marks: [{ type: 'bold' }], text: 'Pricing' },
                        { type: 'text', text: ' – Pricing tables with tiers, features, and CTAs.' },
                      ] },
                    ],
                  },
                },
                {
                  question: 'Utility (3 blocks)',
                  answer: {
                    type: 'doc',
                    content: [
                      { type: 'paragraph', content: [
                        { type: 'text', marks: [{ type: 'bold' }], text: 'Chat' },
                        { type: 'text', text: ' – Embedded AI chat widget that knows your content.' },
                      ] },
                      { type: 'paragraph', content: [
                        { type: 'text', marks: [{ type: 'bold' }], text: 'Map' },
                        { type: 'text', text: ' – Interactive maps with location markers.' },
                      ] },
                      { type: 'paragraph', content: [
                        { type: 'text', marks: [{ type: 'bold' }], text: 'Popup' },
                        { type: 'text', text: ' – Modal dialogs for announcements or forms.' },
                      ] },
                    ],
                  },
                },
              ],
            },
          },
          // Separator - AI Tools
          {
            id: 'sep-ai',
            type: 'separator',
            data: {
              variant: 'text',
              text: 'AI-Powered Tools',
              icon: 'Sparkles',
            },
          },
          // Features - AI
          {
            id: 'features-ai',
            type: 'features',
            data: {
              title: 'AI That Actually Helps',
              subtitle: 'Built-in AI tools that save time without compromising quality.',
              features: [
                { id: 'ai-text', icon: 'PenLine', title: 'Text Generation', description: 'Generate drafts, expand ideas, or rewrite content in different tones.' },
                { id: 'ai-translate', icon: 'Languages', title: 'Translation', description: 'Translate content to any language while preserving formatting and links.' },
                { id: 'ai-brand', icon: 'Palette', title: 'Brand Guide', description: 'Analyze any URL and extract colors, fonts, and style recommendations.' },
                { id: 'ai-migrate', icon: 'FileInput', title: 'Content Migration', description: 'Import from WordPress, Webflow, or any HTML with structure preserved.' },
                { id: 'ai-chat', icon: 'MessageCircle', title: 'Chat Widget', description: 'Embedded chat that answers questions using your KB and page content.' },
                { id: 'ai-private', icon: 'Lock', title: 'Private LLM', description: 'Connect your own LLM for data sovereignty. OpenAI, Anthropic, or local.' },
              ],
              columns: 3,
              variant: 'cards',
              iconStyle: 'circle',
            },
          },
          // Separator - Developer
          {
            id: 'sep-dev',
            type: 'separator',
            data: {
              variant: 'text',
              text: 'Developer Friendly',
              icon: 'Code',
            },
          },
          // Features - API & Integrations
          {
            id: 'features-api',
            type: 'features',
            data: {
              title: 'Head + Headless',
              subtitle: 'Beautiful website included – or use the API for your own frontend.',
              features: [
                { id: 'api-rest', icon: 'Globe', title: 'REST API', description: 'Full API access to all content. Pages, posts, media, settings – everything.' },
                { id: 'api-webhooks', icon: 'Webhook', title: 'Webhooks', description: 'Trigger external services on publish, update, delete. Build automations.' },
                { id: 'api-n8n', icon: 'GitBranch', title: 'N8N Templates', description: 'Pre-built automation flows for common integrations. One-click setup.' },
                { id: 'api-rss', icon: 'Rss', title: 'RSS Feeds', description: 'Automatic RSS generation for blogs. Integrates with any feed reader.' },
              ],
              columns: 4,
              variant: 'minimal',
              iconStyle: 'circle',
            },
          },
          // Link Grid - Resources
          {
            id: 'links-dev',
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
          // CTA - Final
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
      // ===== DEMO PAGE =====
      {
        title: 'Demo',
        slug: 'demo',
        menu_order: 3,
        showInMenu: true,
        meta: {
          description: 'Try FlowWink live - Explore the visual editor, content blocks, and publishing workflow. No signup required.',
          showTitle: true,
          titleAlignment: 'center',
        },
        blocks: [
          // Hero
          {
            id: 'hero-demo',
            type: 'hero',
            data: {
              title: 'See FlowWink in Action',
              subtitle: 'Explore every feature below. This entire page was built with FlowWink – what you see is what you get.',
              backgroundType: 'color',
              heightMode: 'auto',
              contentAlignment: 'center',
              overlayOpacity: 0,
              primaryButton: { text: 'Try the Admin', url: '/admin' },
              secondaryButton: { text: 'View Source', url: 'https://github.com/flowwink/flowwink' },
            },
          },
          // Info Box - How This Works
          {
            id: 'info-demo-intro',
            type: 'info-box',
            data: {
              variant: 'highlight',
              content: {
                type: 'doc',
                content: [
                  { type: 'heading', attrs: { level: 3 }, content: [{ type: 'text', text: '👋 Welcome to the Interactive Demo' }] },
                  { type: 'paragraph', content: [{ type: 'text', text: 'This page showcases every block type available in FlowWink. Scroll through to see how each block looks and behaves. Then click "Try the Admin" above to create your own pages.' }] },
                ],
              },
            },
          },
          // Separator - Visual Editor
          {
            id: 'sep-editor',
            type: 'separator',
            data: {
              variant: 'text',
              text: 'Visual Editor',
              icon: 'Palette',
            },
          },
          // Two-Column - Editor Overview
          {
            id: 'twocol-editor',
            type: 'two-column',
            data: {
              leftColumn: {
                type: 'doc',
                content: [
                  { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Drag, Drop, Done' }] },
                  { type: 'paragraph', content: [{ type: 'text', text: 'The visual editor is the heart of FlowWink. Add blocks, arrange them, edit content – all in real-time with instant preview.' }] },
                  { type: 'heading', attrs: { level: 3 }, content: [{ type: 'text', text: 'How It Works' }] },
                  { type: 'orderedList', content: [
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'bold' }], text: 'Add a Block' }, { type: 'text', text: ' – Click the + button and choose from 27+ block types' }] }] },
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'bold' }], text: 'Edit Content' }, { type: 'text', text: ' – Click any text to edit. Upload images. Configure settings.' }] }] },
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'bold' }], text: 'Rearrange' }, { type: 'text', text: ' – Drag blocks to reorder. Move sections around freely.' }] }] },
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'bold' }], text: 'Preview' }, { type: 'text', text: ' – See exactly how it looks on desktop, tablet, and mobile.' }] }] },
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'bold' }], text: 'Publish' }, { type: 'text', text: ' – One click to go live. Or schedule for later.' }] }] },
                  ] },
                ],
              },
              rightColumn: {
                type: 'doc',
                content: [
                  { type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'italic' }], text: '🖼️ The editor panel shows a live preview on the right and block controls on the left. Every change is auto-saved.' }] },
                ],
              },
              layout: '60-40',
            },
          },
          // Separator - Block Showcase
          {
            id: 'sep-blocks-demo',
            type: 'separator',
            data: {
              variant: 'text',
              text: 'Block Showcase',
              icon: 'LayoutGrid',
            },
          },
          // Text - Block Intro
          {
            id: 'text-blocks-intro',
            type: 'text',
            data: {
              content: {
                type: 'doc',
                content: [
                  { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Every Block Type, Live' }] },
                  { type: 'paragraph', content: [{ type: 'text', text: 'Below you will find examples of the most popular block types. Each one is fully customizable – colors, layouts, content, and behavior.' }] },
                ],
              },
            },
          },
          // Block Types Overview
          {
            id: 'demo-block-overview',
            type: 'features',
            data: {
              title: '27+ Block Types Available',
              subtitle: 'From simple text to complex e-commerce – build any page with drag-and-drop blocks.',
              features: [
                { id: 'cat-content', icon: 'FileText', title: 'Content', description: 'Hero, Text, Image, Quote, Separator, Two-Column, Info Box' },
                { id: 'cat-showcase', icon: 'LayoutGrid', title: 'Showcase', description: 'Features, Stats, Timeline, Gallery, Logos, Team, Testimonials' },
                { id: 'cat-commerce', icon: 'ShoppingCart', title: 'E-commerce', description: 'Pricing, Products, Cart, Comparison' },
                { id: 'cat-forms', icon: 'ClipboardList', title: 'Forms', description: 'Contact, Form Builder, Newsletter, Booking' },
                { id: 'cat-navigation', icon: 'Navigation', title: 'Navigation', description: 'Header, Footer, Link Grid, Accordion' },
                { id: 'cat-media', icon: 'Play', title: 'Media', description: 'YouTube, Map, Article Grid' },
                { id: 'cat-ai', icon: 'Sparkles', title: 'AI', description: 'Chat Widget, AI Text Assistant' },
                { id: 'cat-interactive', icon: 'MousePointer', title: 'Interactive', description: 'Popup, CTA Buttons' },
              ],
              columns: 4,
              variant: 'minimal',
              iconStyle: 'square',
            },
          },
          // Features Block Example
          {
            id: 'demo-features',
            type: 'features',
            data: {
              title: 'Features Block',
              subtitle: 'Showcase capabilities with icon cards. Grid or list layout.',
              features: [
                { id: 'demo-f1', icon: 'Zap', title: 'Fast', description: 'Optimized for speed. No bloat, no lag.' },
                { id: 'demo-f2', icon: 'Shield', title: 'Secure', description: 'Row-level security. GDPR compliant.' },
                { id: 'demo-f3', icon: 'Sparkles', title: 'AI-Powered', description: 'Generate, translate, optimize content.' },
                { id: 'demo-f4', icon: 'Code', title: 'Developer Friendly', description: 'Full API access. Webhooks. Open source.' },
              ],
              columns: 4,
              variant: 'cards',
              iconStyle: 'circle',
            },
          },
          // Stats Block Example
          {
            id: 'demo-stats',
            type: 'stats',
            data: {
              title: 'Stats Block',
              items: [
                { id: 'demo-s1', value: '99.9%', label: 'Uptime' },
                { id: 'demo-s2', value: '< 100ms', label: 'Response Time' },
                { id: 'demo-s3', value: '50k+', label: 'Pages Served' },
                { id: 'demo-s4', value: '24/7', label: 'Support' },
              ],
              columns: 4,
              variant: 'minimal',
            },
          },
          // Testimonials Block Example
          {
            id: 'demo-testimonials',
            type: 'testimonials',
            data: {
              title: 'Testimonials Block',
              testimonials: [
                {
                  id: 'demo-t1',
                  content: 'The visual editor is incredibly intuitive. Our marketing team creates landing pages without any developer help.',
                  author: 'Anna Svensson',
                  role: 'Marketing Director',
                  company: 'TechCorp',
                  rating: 5,
                },
                {
                  id: 'demo-t2',
                  content: 'We switched from WordPress and never looked back. The API is exactly what we needed for our mobile app.',
                  author: 'Erik Johansson',
                  role: 'Lead Developer',
                  company: 'AppStudio',
                  rating: 5,
                },
                {
                  id: 'demo-t3',
                  content: 'Self-hosting was a breeze. The documentation is excellent and the community is incredibly helpful.',
                  author: 'Maria Lindgren',
                  role: 'DevOps Engineer',
                  company: 'CloudNative',
                  rating: 5,
                },
              ],
              layout: 'grid',
              columns: 3,
              showRating: true,
              showAvatar: false,
              variant: 'cards',
            },
          },
          // Team Block Example
          {
            id: 'demo-team',
            type: 'team',
            data: {
              title: 'Team Block',
              subtitle: 'Showcase your team members with photos, roles, and social links.',
              members: [
                {
                  id: 'team-1',
                  name: 'Anna Eriksson',
                  role: 'CEO & Founder',
                  image: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=400',
                  bio: 'Visionary leader with 15 years in tech.',
                  linkedin: 'https://linkedin.com',
                  twitter: 'https://twitter.com',
                },
                {
                  id: 'team-2',
                  name: 'Erik Lindberg',
                  role: 'CTO',
                  image: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=400',
                  bio: 'Full-stack developer and architecture expert.',
                  linkedin: 'https://linkedin.com',
                  github: 'https://github.com',
                },
                {
                  id: 'team-3',
                  name: 'Sofia Bergström',
                  role: 'Head of Design',
                  image: 'https://images.unsplash.com/photo-1438761681033-6461ffad8d80?w=400',
                  bio: 'Award-winning UX designer.',
                  linkedin: 'https://linkedin.com',
                  twitter: 'https://twitter.com',
                },
                {
                  id: 'team-4',
                  name: 'Marcus Johansson',
                  role: 'Lead Developer',
                  image: 'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=400',
                  bio: 'Open source contributor and mentor.',
                  linkedin: 'https://linkedin.com',
                  github: 'https://github.com',
                },
              ],
              columns: 4,
              layout: 'grid',
              showBio: true,
              showSocial: true,
            },
          },
          // Accordion Block Example
          {
            id: 'demo-accordion',
            type: 'accordion',
            data: {
              title: 'Accordion Block',
              items: [
                {
                  question: 'How does the FAQ block work?',
                  answer: {
                    type: 'doc',
                    content: [
                      { type: 'paragraph', content: [{ type: 'text', text: 'Add questions and answers. Visitors click to expand. Great for reducing support tickets and improving SEO with structured FAQ markup.' }] },
                    ],
                  },
                },
                {
                  question: 'Can I add images and links inside answers?',
                  answer: {
                    type: 'doc',
                    content: [
                      { type: 'paragraph', content: [{ type: 'text', text: 'Yes! Answers support rich text formatting including bold, italic, links, images, and even code blocks. Full flexibility.' }] },
                    ],
                  },
                },
                {
                  question: 'Is this good for SEO?',
                  answer: {
                    type: 'doc',
                    content: [
                      { type: 'paragraph', content: [{ type: 'text', text: 'Absolutely. FlowWink automatically generates FAQ structured data (JSON-LD) for accordion blocks, helping your content appear in Google rich results.' }] },
                    ],
                  },
                },
              ],
            },
          },
          // Gallery Block Example
          {
            id: 'demo-gallery',
            type: 'gallery',
            data: {
              title: 'Gallery Block',
              images: [
                { id: 'gal-1', url: 'https://images.unsplash.com/photo-1517694712202-14dd9538aa97?w=600', alt: 'Code on laptop', caption: 'Developer workspace' },
                { id: 'gal-2', url: 'https://images.unsplash.com/photo-1460925895917-afdab827c52f?w=600', alt: 'Analytics dashboard', caption: 'Data visualization' },
                { id: 'gal-3', url: 'https://images.unsplash.com/photo-1551434678-e076c223a692?w=600', alt: 'Team collaboration', caption: 'Team meeting' },
                { id: 'gal-4', url: 'https://images.unsplash.com/photo-1522071820081-009f0129c71c?w=600', alt: 'Office space', caption: 'Modern office' },
              ],
              layout: 'grid',
              columns: 4,
              showCaptions: true,
              lightbox: true,
            },
          },
          // Timeline Block Example
          {
            id: 'demo-timeline',
            type: 'timeline',
            data: {
              title: 'Timeline Block',
              subtitle: 'Perfect for showing processes, history, or roadmaps.',
              items: [
                { id: 'tl-1', title: 'Step 1: Plan', description: 'Define your content structure and goals.', icon: 'Lightbulb' },
                { id: 'tl-2', title: 'Step 2: Build', description: 'Create pages with the visual editor.', icon: 'Hammer' },
                { id: 'tl-3', title: 'Step 3: Review', description: 'Submit for approval and get feedback.', icon: 'CheckCircle' },
                { id: 'tl-4', title: 'Step 4: Launch', description: 'Publish to the world with one click.', icon: 'Rocket' },
              ],
              layout: 'horizontal',
            },
          },
          // Comparison Block Example
          {
            id: 'demo-comparison',
            type: 'comparison',
            data: {
              title: 'Comparison Block',
              products: [
                { id: 'c-basic', name: 'Basic', price: 'Free' },
                { id: 'c-pro', name: 'Pro', price: '$49/mo', highlighted: true },
                { id: 'c-ent', name: 'Enterprise', price: 'Custom' },
              ],
              features: [
                { id: 'cf-1', name: 'Pages', values: ['10', 'Unlimited', 'Unlimited'] },
                { id: 'cf-2', name: 'Users', values: ['1', '5', 'Unlimited'] },
                { id: 'cf-3', name: 'API Access', values: [false, true, true] },
                { id: 'cf-4', name: 'Priority Support', values: [false, true, true] },
                { id: 'cf-5', name: 'Custom Domain', values: [false, true, true] },
              ],
              variant: 'bordered',
              showPrices: true,
              showButtons: false,
            },
          },
          // Separator - E-commerce & Forms
          {
            id: 'sep-ecommerce',
            type: 'separator',
            data: {
              variant: 'text',
              text: 'E-commerce & Forms',
              icon: 'ShoppingCart',
            },
          },
          // Pricing Block Example
          {
            id: 'demo-pricing',
            type: 'pricing',
            data: {
              title: 'Pricing Block',
              subtitle: 'Show pricing tiers with features and CTAs. Can link directly to products for checkout.',
              tiers: [
                {
                  id: 'price-starter',
                  name: 'Starter',
                  price: 'Free',
                  description: 'Perfect for testing and small projects.',
                  features: ['1 site', 'Community support', 'All core features'],
                  buttonText: 'Get Started',
                  buttonUrl: '/contact',
                },
                {
                  id: 'price-pro',
                  name: 'Pro',
                  price: '$49/mo',
                  description: 'For growing businesses.',
                  features: ['Unlimited sites', 'Priority support', 'API access', 'Custom domain'],
                  buttonText: 'Start Free Trial',
                  buttonUrl: '/contact',
                  highlighted: true,
                  badge: 'Popular',
                },
                {
                  id: 'price-enterprise',
                  name: 'Enterprise',
                  price: 'Custom',
                  description: 'For organizations with specific requirements.',
                  features: ['Dedicated infrastructure', 'SLA', 'SSO', 'Onboarding'],
                  buttonText: 'Contact Sales',
                  buttonUrl: '/contact',
                },
              ],
              columns: 3,
              variant: 'cards',
            },
          },
          // Products Block Example
          {
            id: 'demo-products',
            type: 'products',
            data: {
              title: 'Products Block',
              subtitle: 'Display products from your database with prices and add-to-cart functionality.',
              columns: 3,
              productType: 'all',
              showDescription: true,
              buttonText: 'Add to Cart',
            },
          },
          // Cart Block Example
          {
            id: 'demo-cart',
            type: 'cart',
            data: {
              title: 'Cart Block',
              subtitle: 'Display shopping cart with items, quantities, and checkout button.',
              showImage: true,
              showQuantity: true,
              checkoutButtonText: 'Proceed to Checkout',
              emptyCartMessage: 'Your cart is empty. Add products above to see the cart in action.',
            },
          },
          // Booking Block Example
          {
            id: 'demo-booking',
            type: 'booking',
            data: {
              title: 'Booking Block',
              description: 'Let visitors book meetings, appointments, or consultations directly from your site.',
              mode: 'smart',
              submitButtonText: 'Confirm Booking',
              successMessage: 'Your booking is confirmed! Check your email for details.',
              showPhoneField: true,
              variant: 'card',
            },
          },
          // Form Block Example
          {
            id: 'demo-form',
            type: 'form',
            data: {
              title: 'Form Block',
              subtitle: 'Build custom forms with any fields. Submissions saved to database and trigger webhooks.',
              formName: 'Demo Contact Form',
              fields: [
                { id: 'field-name', type: 'text', label: 'Full Name', placeholder: 'Enter your name', required: true },
                { id: 'field-email', type: 'email', label: 'Email', placeholder: 'your@email.com', required: true },
                { id: 'field-company', type: 'text', label: 'Company', placeholder: 'Company name', required: false },
                { id: 'field-subject', type: 'select', label: 'Subject', options: ['General Inquiry', 'Support', 'Sales', 'Partnership'], required: true },
                { id: 'field-message', type: 'textarea', label: 'Message', placeholder: 'How can we help?', required: true },
              ],
              submitButtonText: 'Send Message',
              successMessage: 'Thank you for your message! We will respond within 24 hours.',
            },
          },
          // Newsletter Block Example
          {
            id: 'demo-newsletter',
            type: 'newsletter',
            data: {
              title: 'Newsletter Block',
              subtitle: 'Grow your audience with email signups. Double opt-in, GDPR compliant.',
              placeholder: 'Enter your email address',
              buttonText: 'Subscribe',
              successMessage: 'Check your inbox to confirm your subscription!',
              showNameField: true,
              namePlaceholder: 'Your name (optional)',
            },
          },
          // Separator - Contact & Location
          {
            id: 'sep-contact',
            type: 'separator',
            data: {
              variant: 'text',
              text: 'Contact & Location',
              icon: 'MapPin',
            },
          },
          // Contact Block Example
          {
            id: 'demo-contact',
            type: 'contact',
            data: {
              title: 'Contact Block',
              subtitle: 'Display contact information with icons. Email, phone, address, and social links.',
              email: 'hello@example.com',
              phone: '+46 70 123 45 67',
              address: 'Storgatan 1, 111 22 Stockholm',
              showIcons: true,
              layout: 'horizontal',
            },
          },
          // Map Block Example
          {
            id: 'demo-map',
            type: 'map',
            data: {
              title: 'Map Block',
              subtitle: 'Embed Google Maps or Mapbox to show your location.',
              latitude: 59.3293,
              longitude: 18.0686,
              zoom: 14,
              height: 300,
              showMarker: true,
              markerTitle: 'Our Office',
            },
          },
          // Logos Block Example
          {
            id: 'demo-logos',
            type: 'logos',
            data: {
              title: 'Logos Block',
              subtitle: 'Show client logos, partners, or integrations.',
              logos: [
                { id: 'logo-1', name: 'Company A', url: 'https://via.placeholder.com/150x50?text=Logo+1' },
                { id: 'logo-2', name: 'Company B', url: 'https://via.placeholder.com/150x50?text=Logo+2' },
                { id: 'logo-3', name: 'Company C', url: 'https://via.placeholder.com/150x50?text=Logo+3' },
                { id: 'logo-4', name: 'Company D', url: 'https://via.placeholder.com/150x50?text=Logo+4' },
                { id: 'logo-5', name: 'Company E', url: 'https://via.placeholder.com/150x50?text=Logo+5' },
              ],
              layout: 'grid',
              columns: 5,
              grayscale: true,
            },
          },
          // Separator - AI Features
          {
            id: 'sep-ai-demo',
            type: 'separator',
            data: {
              variant: 'text',
              text: 'AI Features',
              icon: 'Sparkles',
            },
          },
          // Chat Block Example
          {
            id: 'demo-chat',
            type: 'chat',
            data: {
              title: 'Chat Block',
              subtitle: 'Embed an AI chatbot that answers questions using your content and knowledge base.',
              placeholder: 'Ask me anything about FlowWink...',
              welcomeMessage: 'Hi! I am the FlowWink assistant. Ask me about features, pricing, or how to get started.',
              showHistory: true,
            },
          },
          // Separator - Media
          {
            id: 'sep-media-demo',
            type: 'separator',
            data: {
              variant: 'text',
              text: 'Media',
              icon: 'Play',
            },
          },
          // YouTube Block Example
          {
            id: 'demo-youtube',
            type: 'youtube',
            data: {
              url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
              title: 'YouTube Block',
              autoplay: false,
              loop: false,
              mute: false,
              controls: true,
            },
          },
          // Image Block Example
          {
            id: 'demo-image',
            type: 'image',
            data: {
              src: 'https://images.unsplash.com/photo-1498050108023-c5249f4df085?w=1200',
              alt: 'Developer working on code with multiple monitors',
              caption: 'Image Block – Display images with optional captions. Supports alt text for accessibility and SEO.',
            },
          },
          // Quote Block Example
          {
            id: 'demo-quote',
            type: 'quote',
            data: {
              quote: 'The best CMS is the one your team actually uses. FlowWink is simple enough for marketers and powerful enough for developers.',
              author: 'Product Team',
              role: 'FlowWink',
              variant: 'centered',
            },
          },
          // Separator - Workflow
          {
            id: 'sep-workflow-demo',
            type: 'separator',
            data: {
              variant: 'text',
              text: 'Publishing Workflow',
              icon: 'GitBranch',
            },
          },
          // Features - Workflow Steps
          {
            id: 'demo-workflow',
            type: 'features',
            data: {
              title: 'From Draft to Published',
              subtitle: 'Every piece of content goes through a structured workflow.',
              features: [
                { id: 'wf-1', icon: 'PenLine', title: '1. Create', description: 'Writers create content using the visual editor. Auto-save ensures nothing is lost.' },
                { id: 'wf-2', icon: 'Send', title: '2. Submit', description: 'When ready, submit for review. Approvers are notified automatically.' },
                { id: 'wf-3', icon: 'MessageSquare', title: '3. Review', description: 'Approvers provide feedback or approve. Comments are tracked.' },
                { id: 'wf-4', icon: 'Globe', title: '4. Publish', description: 'Approved content goes live immediately or at a scheduled time.' },
              ],
              columns: 4,
              variant: 'minimal',
              iconStyle: 'circle',
            },
          },
          // Info Box - Version Control
          {
            id: 'info-versions',
            type: 'info-box',
            data: {
              variant: 'info',
              content: {
                type: 'doc',
                content: [
                  { type: 'heading', attrs: { level: 3 }, content: [{ type: 'text', text: '💾 Every Save is a Version' }] },
                  { type: 'paragraph', content: [{ type: 'text', text: 'Made a mistake? No problem. Every save creates a version you can restore with one click. Compare any two versions side-by-side to see exactly what changed.' }] },
                ],
              },
            },
          },
          // ===========================================
          // NEW BLOCK TYPES - Interactive & Conversion
          // ===========================================
          // Separator - Interactive Blocks
          {
            id: 'sep-interactive',
            type: 'separator',
            data: {
              variant: 'text',
              text: 'Interactive & Conversion Blocks',
              icon: 'Sparkles',
            },
          },
          // Info Box - Introduction
          {
            id: 'info-interactive-intro',
            type: 'info-box',
            data: {
              variant: 'highlight',
              content: {
                type: 'doc',
                content: [
                  { type: 'heading', attrs: { level: 3 }, content: [{ type: 'text', text: '✨ New Block Types' }] },
                  { type: 'paragraph', content: [{ type: 'text', text: 'These blocks add interactivity, urgency, and social proof to your pages. Perfect for landing pages, product launches, and conversion optimization.' }] },
                ],
              },
            },
          },
          // Announcement Bar Demo
          {
            id: 'demo-announcement',
            type: 'announcement-bar',
            data: {
              message: '🎉 Announcement Bar – Display important updates, promotions, or alerts at the top of your page.',
              linkText: 'Learn more',
              linkUrl: '#',
              variant: 'gradient',
              dismissable: true,
              sticky: false,
            },
          },
          // Tabs Demo
          {
            id: 'demo-tabs',
            type: 'tabs',
            data: {
              title: 'Tabs Block',
              subtitle: 'Organize content into switchable panels. Perfect for feature comparisons, multi-step guides, or categorized content.',
              tabs: [
                {
                  id: 'tab-features',
                  title: 'Features',
                  icon: 'Star',
                  content: {
                    type: 'doc',
                    content: [
                      { type: 'paragraph', content: [{ type: 'text', text: 'Each tab can contain rich text content, lists, links, and more. This is the Features tab.' }] },
                      { type: 'bulletList', content: [
                        { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Horizontal and vertical orientations' }] }] },
                        { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Underline, pills, or boxed variants' }] }] },
                        { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Optional icons for each tab' }] }] },
                      ]},
                    ],
                  },
                },
                {
                  id: 'tab-pricing',
                  title: 'Pricing',
                  icon: 'CreditCard',
                  content: {
                    type: 'doc',
                    content: [
                      { type: 'paragraph', content: [{ type: 'text', text: 'This is the Pricing tab. You could show pricing details, comparison, or FAQs here.' }] },
                    ],
                  },
                },
                {
                  id: 'tab-support',
                  title: 'Support',
                  icon: 'HeadphonesIcon',
                  content: {
                    type: 'doc',
                    content: [
                      { type: 'paragraph', content: [{ type: 'text', text: 'This is the Support tab. Add contact info, help resources, or FAQs.' }] },
                    ],
                  },
                },
              ],
              orientation: 'horizontal',
              variant: 'underline',
            },
          },
          // Marquee Demo
          {
            id: 'demo-marquee',
            type: 'marquee',
            data: {
              items: [
                { id: 'mq1', text: 'Marquee Block', icon: '🎠' },
                { id: 'mq2', text: 'Scrolling text that runs continuously', icon: '📢' },
                { id: 'mq3', text: 'Great for announcements', icon: '✨' },
                { id: 'mq4', text: 'Partner logos', icon: '🤝' },
                { id: 'mq5', text: 'Tech stack display', icon: '💻' },
              ],
              speed: 'normal',
              direction: 'left',
              pauseOnHover: true,
              variant: 'gradient',
              separator: '•',
            },
          },
          // Countdown Demo
          {
            id: 'demo-countdown',
            type: 'countdown',
            data: {
              title: 'Countdown Block',
              subtitle: 'Create urgency with live countdowns. Perfect for product launches, sales, or event registrations.',
              targetDate: '2025-12-31T23:59:59',
              expiredMessage: 'The countdown has ended!',
              variant: 'cards',
              size: 'lg',
              showDays: true,
              showHours: true,
              showMinutes: true,
              showSeconds: true,
            },
          },
          // Progress Demo
          {
            id: 'demo-progress',
            type: 'progress',
            data: {
              title: 'Progress Block',
              subtitle: 'Show funding goals, skill levels, or project completion status.',
              items: [
                { id: 'prog1', label: 'Funding Goal', value: 75, color: 'primary' },
                { id: 'prog2', label: 'Development', value: 90 },
                { id: 'prog3', label: 'Documentation', value: 60 },
              ],
              variant: 'default',
              size: 'md',
              showLabels: true,
              showPercentage: true,
              animated: true,
            },
          },
          // Badge Demo
          {
            id: 'demo-badge',
            type: 'badge',
            data: {
              title: 'Badge Block',
              subtitle: 'Display certifications, awards, or trust indicators.',
              badges: [
                { id: 'bdg1', title: 'SOC 2 Certified', icon: 'shield' },
                { id: 'bdg2', title: 'GDPR Compliant', icon: 'check' },
                { id: 'bdg3', title: 'ISO 27001', icon: 'award' },
                { id: 'bdg4', title: '99.9% Uptime', icon: 'medal' },
              ],
              variant: 'default',
              columns: 4,
              size: 'md',
              showTitles: true,
              grayscale: false,
            },
          },
          // Table Demo
          {
            id: 'demo-table',
            type: 'table',
            data: {
              title: 'Table Block',
              caption: 'Display structured data in a clean, responsive table format.',
              columns: [
                { id: 'col1', header: 'Feature', align: 'left' },
                { id: 'col2', header: 'Starter', align: 'center' },
                { id: 'col3', header: 'Pro', align: 'center' },
                { id: 'col4', header: 'Enterprise', align: 'center' },
              ],
              rows: [
                ['Pages', '10', 'Unlimited', 'Unlimited'],
                ['Users', '1', '5', 'Unlimited'],
                ['API Access', '❌', '✅', '✅'],
                ['Support', 'Community', 'Priority', 'Dedicated'],
              ],
              variant: 'striped',
              size: 'md',
              stickyHeader: true,
              highlightOnHover: true,
            },
          },
          // Embed Demo (Info Box since it requires external setup)
          {
            id: 'info-embed',
            type: 'info-box',
            data: {
              variant: 'info',
              content: {
                type: 'doc',
                content: [
                  { type: 'heading', attrs: { level: 3 }, content: [{ type: 'text', text: '🔗 Embed Block' }] },
                  { type: 'paragraph', content: [{ type: 'text', text: 'Embed external content from Figma, CodePen, Loom, and more. Just paste the embed code or URL, and the block handles the rest.' }] },
                ],
              },
            },
          },
          // Social Proof Demo
          {
            id: 'demo-social-proof',
            type: 'social-proof',
            data: {
              title: 'Social Proof Block',
              subtitle: 'Show live metrics, ratings, and activity to build trust.',
              items: [
                { id: 'sp1', type: 'counter', label: 'Happy Customers', value: 12500, icon: 'users' },
                { id: 'sp2', type: 'rating', label: 'Average Rating', value: 4.9, maxRating: 5 },
                { id: 'sp3', type: 'counter', label: 'Projects Completed', value: 3200, icon: 'folder' },
              ],
              variant: 'cards',
              layout: 'horizontal',
              size: 'lg',
              animated: true,
              showLiveIndicator: false,
            },
          },
          // Notification Toast (Info Box)
          {
            id: 'info-notification',
            type: 'info-box',
            data: {
              variant: 'warning',
              content: {
                type: 'doc',
                content: [
                  { type: 'heading', attrs: { level: 3 }, content: [{ type: 'text', text: '🔔 Notification Toast Block' }] },
                  { type: 'paragraph', content: [{ type: 'text', text: 'Display dynamic notifications showing recent signups, purchases, or activity. Creates FOMO and social proof. This block is dynamic and shows randomly timed notifications – it cannot be fully demonstrated in a static page.' }] },
                ],
              },
            },
          },
          // Floating CTA (Info Box)
          {
            id: 'info-floating-cta',
            type: 'info-box',
            data: {
              variant: 'default',
              content: {
                type: 'doc',
                content: [
                  { type: 'heading', attrs: { level: 3 }, content: [{ type: 'text', text: '📌 Floating CTA Block' }] },
                  { type: 'paragraph', content: [{ type: 'text', text: 'A call-to-action that appears when users scroll down. Sticky bars, floating buttons, or slide-in panels. Configurable trigger points and positions. This block only appears on scroll, so it cannot be fully demonstrated in a static showcase.' }] },
                ],
              },
            },
          },
          // Separator - Try It
          {
            id: 'sep-try',
            type: 'separator',
            data: {
              variant: 'text',
              text: 'Try It Yourself',
              icon: 'MousePointer',
            },
          },
          // Two-Column - CTA
          {
            id: 'twocol-try',
            type: 'two-column',
            data: {
              leftColumn: {
                type: 'doc',
                content: [
                  { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Ready to Build?' }] },
                  { type: 'paragraph', content: [{ type: 'text', text: 'The best way to understand FlowWink is to use it. Click the button to access the admin panel and start creating.' }] },
                  { type: 'bulletList', content: [
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'No signup required for the demo' }] }] },
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Full access to all features' }] }] },
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Your changes are saved locally' }] }] },
                  ] },
                ],
              },
              rightColumn: {
                type: 'doc',
                content: [
                  { type: 'heading', attrs: { level: 3 }, content: [{ type: 'text', text: 'Quick Links' }] },
                  { type: 'bulletList', content: [
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: '→ Admin Dashboard: /admin' }] }] },
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: '→ Page Editor: /admin/pages' }] }] },
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: '→ Blog Manager: /admin/blog' }] }] },
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: '→ Media Library: /admin/media' }] }] },
                  ] },
                ],
              },
              layout: '50-50',
            },
          },
          // CTA
          {
            id: 'cta-demo',
            type: 'cta',
            data: {
              title: 'Start Building Now',
              subtitle: 'Access the full admin panel and create your first page in minutes.',
              buttonText: 'Open Admin Panel',
              buttonUrl: '/admin',
              secondaryButtonText: 'Self-Host Free',
              secondaryButtonUrl: 'https://github.com/flowwink/flowwink',
              gradient: true,
            },
          },
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
          {
            id: 'hero-pricing',
            type: 'hero',
            data: {
              title: 'Simple, Transparent Pricing',
              subtitle: 'No hidden fees, no per-seat charges. Self-host for free or let us manage everything.',
              backgroundType: 'color',
              heightMode: 'auto',
              contentAlignment: 'center',
              overlayOpacity: 0,
            },
          },
          {
            id: 'pricing-detailed',
            type: 'pricing',
            data: {
              title: '',
              tiers: [
                {
                  id: 'tier-self',
                  name: 'Self-Hosted',
                  price: 'Free',
                  period: 'forever',
                  description: 'Perfect for developers and organizations with DevOps capabilities.',
                  features: [
                    'All CMS features',
                    'Unlimited pages & users',
                    'Private LLM support',
                    'Full API access',
                    'Community support',
                    'GitHub issues',
                  ],
                  buttonText: 'View on GitHub',
                  buttonUrl: 'https://github.com/flowwink/flowwink',
                },
                {
                  id: 'tier-managed',
                  name: 'Managed Cloud',
                  price: '€49',
                  period: '/month',
                  description: 'Everything included. We handle infrastructure, you focus on content.',
                  features: [
                    'Everything in Self-Hosted',
                    'Automatic updates',
                    'Daily backups',
                    'SSL certificates',
                    'Global CDN',
                    'Priority email support',
                    '99.9% uptime SLA',
                  ],
                  buttonText: 'Start Free Trial',
                  buttonUrl: '/contact',
                  highlighted: true,
                  badge: 'Most Popular',
                },
                {
                  id: 'tier-enterprise',
                  name: 'Enterprise',
                  price: 'Custom',
                  description: 'For large organizations with specific requirements.',
                  features: [
                    'Everything in Managed',
                    'Dedicated infrastructure',
                    'Custom SLA',
                    'SSO (SAML/OIDC)',
                    'Dedicated success manager',
                    'Custom integrations',
                    'Training sessions',
                  ],
                  buttonText: 'Contact Sales',
                  buttonUrl: '/contact',
                },
              ],
              columns: 3,
              variant: 'cards',
            },
          },
          {
            id: 'accordion-faq',
            type: 'accordion',
            data: {
              title: 'Frequently Asked Questions',
              items: [
                {
                  question: 'Is self-hosted really free forever?',
                  answer: {
                    type: 'doc',
                    content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Yes! FlowWink is open source under the MIT license. You can run it on your own servers indefinitely without any licensing fees. The only costs are your own hosting and infrastructure.' }] }],
                  },
                },
                {
                  question: 'What\'s included in managed cloud?',
                  answer: {
                    type: 'doc',
                    content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Everything. We handle server management, updates, security patches, backups, SSL certificates, and CDN distribution. You get a fully managed FlowWink instance that\'s always up-to-date.' }] }],
                  },
                },
                {
                  question: 'Can I migrate from self-hosted to managed?',
                  answer: {
                    type: 'doc',
                    content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Absolutely. We provide migration tools to move your content and settings to our managed infrastructure. The process is seamless and we\'ll assist you through it.' }] }],
                  },
                },
                {
                  question: 'Do you offer discounts for startups or nonprofits?',
                  answer: {
                    type: 'doc',
                    content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Yes! We offer 50% off managed plans for qualifying startups and registered nonprofits. Contact us with your details and we\'ll set you up.' }] }],
                  },
                },
              ],
            },
          },
        ],
      },
      // ===== WHY FLOWWINK PAGE =====
      {
        title: 'Why FlowWink',
        slug: 'why-flowwink',
        menu_order: 5,
        showInMenu: true,
        meta: {
          description: 'Compare FlowWink to WordPress, Webflow, and Contentful. See why teams switch and how to migrate.',
          showTitle: true,
          titleAlignment: 'center',
        },
        blocks: [
          // Hero
          {
            id: 'hero-why',
            type: 'hero',
            data: {
              title: 'Why Teams Switch to FlowWink',
              subtitle: 'Compare features, understand tradeoffs, and see detailed migration paths from your current platform.',
              backgroundType: 'color',
              heightMode: 'auto',
              contentAlignment: 'center',
              overlayOpacity: 0,
            },
          },
          // Stats - Social Proof
          {
            id: 'stats-switch',
            type: 'stats',
            data: {
              title: '',
              items: [
                { id: 'stat-migrate', value: '2hrs', label: 'Average Migration Time' },
                { id: 'stat-cost', value: '60%', label: 'Cost Reduction' },
                { id: 'stat-dev', value: '3x', label: 'Faster Development' },
                { id: 'stat-sat', value: '98%', label: 'Would Recommend' },
              ],
              columns: 4,
              variant: 'cards',
            },
          },
          // Separator - vs WordPress
          {
            id: 'sep-wordpress',
            type: 'separator',
            data: {
              variant: 'text',
              text: 'vs WordPress',
              icon: 'FileCode',
            },
          },
          // Two-Column - WordPress Comparison
          {
            id: 'twocol-wordpress',
            type: 'two-column',
            data: {
              leftColumn: {
                type: 'doc',
                content: [
                  { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'WordPress Limitations' }] },
                  { type: 'bulletList', content: [
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'bold' }], text: 'Security vulnerabilities' }, { type: 'text', text: ' – Plugins and themes are common attack vectors. Constant patching required.' }] }] },
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'bold' }], text: 'No real headless' }, { type: 'text', text: ' – REST API exists but was bolted on. Not designed for omnichannel.' }] }] },
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'bold' }], text: 'Plugin dependency' }, { type: 'text', text: ' – Need 10+ plugins for basics. Each adds complexity and risk.' }] }] },
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'bold' }], text: 'Performance issues' }, { type: 'text', text: ' – Database-heavy architecture. Caching plugins are band-aids.' }] }] },
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'bold' }], text: 'No built-in workflow' }, { type: 'text', text: ' – Editorial review requires additional plugins.' }] }] },
                  ] },
                ],
              },
              rightColumn: {
                type: 'doc',
                content: [
                  { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'FlowWink Advantages' }] },
                  { type: 'bulletList', content: [
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'bold' }], text: 'Modern security' }, { type: 'text', text: ' – Built on Supabase with Row Level Security. No plugin vulnerabilities.' }] }] },
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'bold' }], text: 'API-first design' }, { type: 'text', text: ' – Full REST API from day one. Use the website OR the API OR both.' }] }] },
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'bold' }], text: 'All-in-one' }, { type: 'text', text: ' – Blog, newsletter, CRM, forms, KB – all built in. No plugins needed.' }] }] },
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'bold' }], text: 'Fast by default' }, { type: 'text', text: ' – Modern React frontend. Edge functions. No optimization needed.' }] }] },
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'bold' }], text: 'Editorial workflow' }, { type: 'text', text: ' – Writer/Approver/Admin roles, version history, scheduled publishing.' }] }] },
                  ] },
                ],
              },
              layout: '50-50',
            },
          },
          // Accordion - WordPress Migration Guide
          {
            id: 'accordion-wp-migrate',
            type: 'accordion',
            data: {
              title: 'WordPress Migration Guide',
              items: [
                {
                  question: 'Step 1: Export WordPress Content',
                  answer: {
                    type: 'doc',
                    content: [
                      { type: 'paragraph', content: [{ type: 'text', text: 'Go to WordPress Admin → Tools → Export. Select "All content" and download the XML file. This includes posts, pages, comments, custom fields, categories, tags, and media references.' }] },
                    ],
                  },
                },
                {
                  question: 'Step 2: Import to FlowWink',
                  answer: {
                    type: 'doc',
                    content: [
                      { type: 'paragraph', content: [{ type: 'text', text: 'In FlowWink Admin, go to Pages → Import → WordPress. Upload your XML file. AI will analyze the content and convert it to structured blocks. Posts become blog posts, pages become pages, categories and tags are preserved.' }] },
                    ],
                  },
                },
                {
                  question: 'Step 3: Review and Adjust',
                  answer: {
                    type: 'doc',
                    content: [
                      { type: 'paragraph', content: [{ type: 'text', text: 'Review each imported page in the visual editor. AI does most of the heavy lifting, but you may want to adjust block types, update images, and refine formatting. Media files are automatically downloaded and stored.' }] },
                    ],
                  },
                },
                {
                  question: 'Step 4: Set Up Redirects',
                  answer: {
                    type: 'doc',
                    content: [
                      { type: 'paragraph', content: [{ type: 'text', text: 'FlowWink generates a redirect map from your old WordPress URLs to new slugs. Configure your web server or CDN to redirect traffic. We provide Nginx and Cloudflare configuration examples.' }] },
                    ],
                  },
                },
                {
                  question: 'Step 5: DNS Cutover',
                  answer: {
                    type: 'doc',
                    content: [
                      { type: 'paragraph', content: [{ type: 'text', text: 'Update your DNS to point to FlowWink. If self-hosting, point to your server. If using managed cloud, we provide the destination. TTL should be set low before cutover for fast propagation.' }] },
                    ],
                  },
                },
              ],
            },
          },
          // Quote - WordPress switcher
          {
            id: 'quote-wordpress',
            type: 'quote',
            data: {
              quote: 'We spent more time updating plugins than creating content. FlowWink migration took a weekend, and we have not looked back.',
              author: 'Marcus Andersson',
              role: 'Digital Director, TechStart AB',
              variant: 'centered',
            },
          },
          // Separator - vs Webflow
          {
            id: 'sep-webflow',
            type: 'separator',
            data: {
              variant: 'text',
              text: 'vs Webflow',
              icon: 'Layout',
            },
          },
          // Two-Column - Webflow Comparison
          {
            id: 'twocol-webflow',
            type: 'two-column',
            data: {
              leftColumn: {
                type: 'doc',
                content: [
                  { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Webflow Limitations' }] },
                  { type: 'bulletList', content: [
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'bold' }], text: 'No headless option' }, { type: 'text', text: ' – Content locked to Webflow. Cannot power mobile apps or custom frontends.' }] }] },
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'bold' }], text: 'Expensive at scale' }, { type: 'text', text: ' – CMS plans start at $23/mo, but add forms, e-commerce, and costs multiply.' }] }] },
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'bold' }], text: 'Vendor lock-in' }, { type: 'text', text: ' – Cannot export and self-host. Your site lives on their servers only.' }] }] },
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'bold' }], text: 'Limited CRM' }, { type: 'text', text: ' – Form submissions only. No lead scoring, pipelines, or automation.' }] }] },
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'bold' }], text: 'No AI features' }, { type: 'text', text: ' – No built-in AI chat, content generation, or translation.' }] }] },
                  ] },
                ],
              },
              rightColumn: {
                type: 'doc',
                content: [
                  { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'FlowWink Advantages' }] },
                  { type: 'bulletList', content: [
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'bold' }], text: 'Head + Headless' }, { type: 'text', text: ' – Beautiful website included AND full API. Power any frontend from one source.' }] }] },
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'bold' }], text: 'Self-host free' }, { type: 'text', text: ' – Open source. No per-seat charges. Managed cloud available if preferred.' }] }] },
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'bold' }], text: 'Full ownership' }, { type: 'text', text: ' – Your data, your servers, your rules. Export anytime, host anywhere.' }] }] },
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'bold' }], text: 'Built-in CRM' }, { type: 'text', text: ' – Lead management, company tracking, deal pipeline, activity history.' }] }] },
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'bold' }], text: 'AI everywhere' }, { type: 'text', text: ' – Chat widget, content generation, translation, brand analysis, migration.' }] }] },
                  ] },
                ],
              },
              layout: '50-50',
            },
          },
          // Accordion - Webflow Migration Guide
          {
            id: 'accordion-webflow-migrate',
            type: 'accordion',
            data: {
              title: 'Webflow Migration Guide',
              items: [
                {
                  question: 'Step 1: Export Webflow Content',
                  answer: {
                    type: 'doc',
                    content: [
                      { type: 'paragraph', content: [{ type: 'text', text: 'Webflow CMS content can be exported as CSV. Go to your Collection, click the three dots, and export. For pages, you will need to copy content manually or use our AI import.' }] },
                    ],
                  },
                },
                {
                  question: 'Step 2: AI Page Import',
                  answer: {
                    type: 'doc',
                    content: [
                      { type: 'paragraph', content: [{ type: 'text', text: 'For each Webflow page, use FlowWink Import → URL. Paste the live Webflow URL. AI analyzes the page structure and converts it to FlowWink blocks. Hero sections, feature grids, testimonials – all converted automatically.' }] },
                    ],
                  },
                },
                {
                  question: 'Step 3: Import CMS Collections',
                  answer: {
                    type: 'doc',
                    content: [
                      { type: 'paragraph', content: [{ type: 'text', text: 'Upload your exported CSVs to FlowWink. Blog posts go to the Blog module, team members to Team blocks, testimonials to Testimonials blocks. Field mapping is automatic with manual override options.' }] },
                    ],
                  },
                },
                {
                  question: 'Step 4: Recreate Interactions',
                  answer: {
                    type: 'doc',
                    content: [
                      { type: 'paragraph', content: [{ type: 'text', text: 'FlowWink supports common animations: fade-in, slide-up, scale. For complex Webflow interactions, you may need to simplify or use custom CSS. Most marketing sites work perfectly with our built-in options.' }] },
                    ],
                  },
                },
                {
                  question: 'Step 5: Form Setup',
                  answer: {
                    type: 'doc',
                    content: [
                      { type: 'paragraph', content: [{ type: 'text', text: 'Recreate your forms in FlowWink Form Builder. All submissions are stored and can trigger webhooks, feed into the CRM, or send emails. No per-submission fees like Webflow charges.' }] },
                    ],
                  },
                },
              ],
            },
          },
          // Quote - Webflow switcher
          {
            id: 'quote-webflow',
            type: 'quote',
            data: {
              quote: 'Webflow was great for design, but we needed an API for our mobile app. FlowWink gives us both – the visual builder AND the headless flexibility.',
              author: 'Emma Lindqvist',
              role: 'CTO, DigitalFlow',
              variant: 'centered',
            },
          },
          // Separator - vs Contentful
          {
            id: 'sep-contentful',
            type: 'separator',
            data: {
              variant: 'text',
              text: 'vs Contentful',
              icon: 'Database',
            },
          },
          // Two-Column - Contentful Comparison
          {
            id: 'twocol-contentful',
            type: 'two-column',
            data: {
              leftColumn: {
                type: 'doc',
                content: [
                  { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Contentful Limitations' }] },
                  { type: 'bulletList', content: [
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'bold' }], text: 'No website included' }, { type: 'text', text: ' – Pure headless. You must build every frontend from scratch.' }] }] },
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'bold' }], text: 'Expensive pricing' }, { type: 'text', text: ' – Free tier is limited. Team plans start at $300/month. Enterprise is custom.' }] }] },
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'bold' }], text: 'Complex content modeling' }, { type: 'text', text: ' – Powerful but steep learning curve. Non-technical users struggle.' }] }] },
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'bold' }], text: 'No built-in modules' }, { type: 'text', text: ' – No blog, newsletter, CRM, or forms. Everything must be built custom.' }] }] },
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'bold' }], text: 'Cannot self-host' }, { type: 'text', text: ' – SaaS only. No option to run on your infrastructure.' }] }] },
                  ] },
                ],
              },
              rightColumn: {
                type: 'doc',
                content: [
                  { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'FlowWink Advantages' }] },
                  { type: 'bulletList', content: [
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'bold' }], text: 'Website included' }, { type: 'text', text: ' – Beautiful, responsive site out of the box. API available when you need it.' }] }] },
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'bold' }], text: 'Self-host free' }, { type: 'text', text: ' – Open source forever. Managed cloud at €49/mo if you prefer.' }] }] },
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'bold' }], text: 'Visual block editor' }, { type: 'text', text: ' – No learning curve. Drag blocks, edit content, publish. Anyone can use it.' }] }] },
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'bold' }], text: 'Modules included' }, { type: 'text', text: ' – Blog, newsletter, CRM, forms, KB – ready to use immediately.' }] }] },
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'bold' }], text: 'Full data control' }, { type: 'text', text: ' – Run on your servers. Connect your own database. Private LLM support.' }] }] },
                  ] },
                ],
              },
              layout: '50-50',
            },
          },
          // Accordion - Contentful Migration Guide
          {
            id: 'accordion-contentful-migrate',
            type: 'accordion',
            data: {
              title: 'Contentful Migration Guide',
              items: [
                {
                  question: 'Step 1: Export Content Types',
                  answer: {
                    type: 'doc',
                    content: [
                      { type: 'paragraph', content: [{ type: 'text', text: 'Use Contentful CLI to export your content types and entries: contentful space export --space-id YOUR_SPACE. This creates a JSON file with all your content models and data.' }] },
                    ],
                  },
                },
                {
                  question: 'Step 2: Map Content Types to Blocks',
                  answer: {
                    type: 'doc',
                    content: [
                      { type: 'paragraph', content: [{ type: 'text', text: 'Review your Contentful content types. Most map directly to FlowWink blocks: Rich Text → Text Block, Media → Image/Gallery, References → Article Grid. Custom types may need manual mapping.' }] },
                    ],
                  },
                },
                {
                  question: 'Step 3: Import via JSON',
                  answer: {
                    type: 'doc',
                    content: [
                      { type: 'paragraph', content: [{ type: 'text', text: 'In FlowWink Admin → Import → JSON. Upload your Contentful export. The importer transforms Contentful structure to FlowWink blocks. Blog entries become blog posts, page entries become pages.' }] },
                    ],
                  },
                },
                {
                  question: 'Step 4: Rebuild Frontend (or Use Built-in)',
                  answer: {
                    type: 'doc',
                    content: [
                      { type: 'paragraph', content: [{ type: 'text', text: 'If you had a custom frontend with Contentful, you can keep using it – just point API calls to FlowWink instead. Or use our built-in website and skip frontend maintenance entirely.' }] },
                    ],
                  },
                },
                {
                  question: 'Step 5: Update Integrations',
                  answer: {
                    type: 'doc',
                    content: [
                      { type: 'paragraph', content: [{ type: 'text', text: 'Replace Contentful webhooks with FlowWink webhooks. Same events, similar payload structure. Update any external services that were calling Contentful APIs to use FlowWink endpoints.' }] },
                    ],
                  },
                },
              ],
            },
          },
          // Quote - Contentful switcher
          {
            id: 'quote-contentful',
            type: 'quote',
            data: {
              quote: 'Contentful was overkill for our needs. We were paying $300/month and still had to build a frontend. FlowWink does everything for €49.',
              author: 'Dr. Sofia Berg',
              role: 'Director, HealthTech Nordic',
              variant: 'centered',
            },
          },
          // Separator - Full Comparison
          {
            id: 'sep-compare',
            type: 'separator',
            data: {
              variant: 'text',
              text: 'Feature Comparison',
              icon: 'Table',
            },
          },
          // Comparison Table
          {
            id: 'comparison-full',
            type: 'comparison',
            data: {
              title: '',
              products: [
                { id: 'pez', name: 'FlowWink', highlighted: true },
                { id: 'wordpress', name: 'WordPress' },
                { id: 'webflow', name: 'Webflow' },
                { id: 'contentful', name: 'Contentful' },
              ],
              features: [
                { id: 'f-website', name: 'Built-in Website', values: [true, true, true, false] },
                { id: 'f-api', name: 'Headless API', values: [true, 'Limited', false, true] },
                { id: 'f-selfhost', name: 'Self-Hostable', values: [true, true, false, false] },
                { id: 'f-opensource', name: 'Open Source', values: [true, true, false, false] },
                { id: 'f-visual', name: 'Visual Block Editor', values: [true, 'Plugins', true, false] },
                { id: 'f-workflow', name: 'Editorial Workflow', values: [true, 'Plugins', false, true] },
                { id: 'f-versions', name: 'Version History', values: [true, 'Plugins', true, true] },
                { id: 'f-blog', name: 'Built-in Blog', values: [true, true, true, false] },
                { id: 'f-newsletter', name: 'Newsletter Module', values: [true, 'Plugins', false, false] },
                { id: 'f-crm', name: 'CRM / Leads', values: [true, 'Plugins', false, false] },
                { id: 'f-forms', name: 'Form Builder', values: [true, 'Plugins', true, false] },
                { id: 'f-kb', name: 'Knowledge Base', values: [true, 'Plugins', false, false] },
                { id: 'f-ecommerce', name: 'E-commerce / Products', values: [true, 'Plugins', true, false] },
                { id: 'f-ai-chat', name: 'AI Chat Widget', values: [true, false, false, false] },
                { id: 'f-ai-content', name: 'AI Content Tools', values: [true, false, false, false] },
                { id: 'f-private-llm', name: 'Private LLM Support', values: [true, false, false, false] },
                { id: 'f-webhooks', name: 'Webhooks', values: [true, 'Plugins', true, true] },
                { id: 'f-price', name: 'Starting Price', values: ['Free', 'Free', '$23/mo', '$300/mo'] },
              ],
              variant: 'striped',
              showPrices: false,
              showButtons: false,
              stickyHeader: true,
            },
          },
          // Info Box - Migration Help
          {
            id: 'info-help',
            type: 'info-box',
            data: {
              variant: 'info',
              content: {
                type: 'doc',
                content: [
                  { type: 'heading', attrs: { level: 3 }, content: [{ type: 'text', text: 'Need Help Migrating?' }] },
                  { type: 'paragraph', content: [{ type: 'text', text: 'Our team offers free migration consultations for teams considering the switch. We will review your current setup, create a migration plan, and answer any technical questions. Book a call or reach out on Discord.' }] },
                ],
              },
            },
          },
          // CTA
          {
            id: 'cta-why',
            type: 'cta',
            data: {
              title: 'Ready to Make the Switch?',
              subtitle: 'Try the demo, explore the code, or book a personalized walkthrough.',
              buttonText: 'Launch Demo',
              buttonUrl: '/demo',
              secondaryButtonText: 'Book a Call',
              secondaryButtonUrl: '/contact',
              gradient: true,
            },
          },
        ],
      },
      // ===== ROADMAP PAGE =====
      {
        title: 'Roadmap',
        slug: 'roadmap',
        menu_order: 6,
        showInMenu: true,
        meta: {
          description: 'FlowWink product roadmap - See upcoming features, completed milestones, and vote on what we build next.',
          showTitle: true,
          titleAlignment: 'center',
        },
        blocks: [
          // Hero
          {
            id: 'hero-roadmap',
            type: 'hero',
            data: {
              title: 'Product Roadmap',
              subtitle: 'See where we are headed, what we have shipped, and help shape the future of FlowWink.',
              backgroundType: 'color',
              heightMode: 'auto',
              contentAlignment: 'center',
              overlayOpacity: 0,
            },
          },
          // Stats - Progress
          {
            id: 'stats-roadmap',
            type: 'stats',
            data: {
              title: '',
              items: [
                { id: 'stat-shipped', value: '47', label: 'Features Shipped' },
                { id: 'stat-progress', value: '8', label: 'In Progress' },
                { id: 'stat-planned', value: '12', label: 'Planned' },
                { id: 'stat-votes', value: '1.2k', label: 'Community Votes' },
              ],
              columns: 4,
              variant: 'cards',
            },
          },
          // Separator - In Progress
          {
            id: 'sep-progress',
            type: 'separator',
            data: {
              variant: 'text',
              text: 'In Progress',
              icon: 'Loader',
            },
          },
          // Features - Currently Building
          {
            id: 'features-progress',
            type: 'features',
            data: {
              title: 'Currently Building',
              subtitle: 'Features actively in development. Expected in the next 1-2 releases.',
              features: [
                { id: 'prog-1', icon: 'Globe', title: 'Multi-language Content', description: 'Native localization with AI translation. Manage content in multiple languages from one place.' },
                { id: 'prog-2', icon: 'GitBranch', title: 'Content Staging', description: 'Preview changes before publishing. Share staging links with stakeholders for review.' },
                { id: 'prog-3', icon: 'Smartphone', title: 'Mobile App Preview', description: 'See how content looks on mobile devices. Real-time preview in the editor.' },
                { id: 'prog-4', icon: 'Plug', title: 'Plugin System', description: 'Extend FlowWink with custom blocks and integrations. Community plugin marketplace.' },
              ],
              columns: 2,
              variant: 'cards',
              iconStyle: 'circle',
            },
          },
          // Separator - Planned
          {
            id: 'sep-planned',
            type: 'separator',
            data: {
              variant: 'text',
              text: 'Planned',
              icon: 'Calendar',
            },
          },
          // Features - Planned
          {
            id: 'features-planned',
            type: 'features',
            data: {
              title: 'Coming Soon',
              subtitle: 'Confirmed for future releases. Priorities may shift based on community feedback.',
              features: [
                { id: 'plan-1', icon: 'Users', title: 'Team Workspaces', description: 'Separate workspaces for different teams or projects. Role-based access per workspace.' },
                { id: 'plan-2', icon: 'BarChart3', title: 'Built-in Analytics', description: 'Page views, engagement metrics, and content performance. No external tools needed.' },
                { id: 'plan-3', icon: 'Workflow', title: 'Advanced Workflows', description: 'Custom approval chains with multiple reviewers. Conditional logic and notifications.' },
                { id: 'plan-4', icon: 'Blocks', title: 'Custom Block Builder', description: 'Create your own block types visually. Define fields, styling, and behavior.' },
                { id: 'plan-5', icon: 'Bot', title: 'AI Content Assistant', description: 'Proactive suggestions while you write. SEO recommendations and readability analysis.' },
              ],
              columns: 3,
              variant: 'minimal',
              iconStyle: 'circle',
            },
          },
          // Separator - Completed
          {
            id: 'sep-completed',
            type: 'separator',
            data: {
              variant: 'text',
              text: 'Recently Shipped',
              icon: 'CheckCircle',
            },
          },
          // Timeline - Completed Milestones
          {
            id: 'timeline-shipped',
            type: 'timeline',
            data: {
              title: 'Milestones',
              items: [
                {
                  id: 'mile-0',
                  title: 'v2.1 - E-commerce & Pricing',
                  description: 'Products, orders, Stripe checkout, pricing blocks with product linking, and cart functionality.',
                  icon: 'ShoppingCart',
                  date: 'January 2025',
                },
                {
                  id: 'mile-1',
                  title: 'v2.0 - Knowledge Base Module',
                  description: 'Hierarchical categories, full-text search, AI chat integration, and public/private visibility controls.',
                  icon: 'BookOpen',
                  date: 'December 2024',
                },
                {
                  id: 'mile-2',
                  title: 'v1.9 - Editorial Workflow',
                  description: 'Writer/Approver/Admin roles, version history, scheduled publishing, and audit trails.',
                  icon: 'Users',
                  date: 'November 2024',
                },
                {
                  id: 'mile-3',
                  title: 'v1.8 - CRM Module',
                  description: 'Lead management, company tracking, deal pipeline, and activity history.',
                  icon: 'Briefcase',
                  date: 'October 2024',
                },
                {
                  id: 'mile-4',
                  title: 'v1.7 - AI Chat Widget',
                  description: 'Embedded chat that answers questions using KB and page content. Private LLM support.',
                  icon: 'MessageCircle',
                  date: 'September 2024',
                },
                {
                  id: 'mile-5',
                  title: 'v1.6 - Newsletter Module',
                  description: 'Subscriber management, campaign editor, open/click tracking, and GDPR-compliant double opt-in.',
                  icon: 'Mail',
                  date: 'August 2024',
                },
                {
                  id: 'mile-6',
                  title: 'v1.5 - Headless API',
                  description: 'Full REST API for all content. Pages, posts, media, settings – everything accessible programmatically.',
                  icon: 'Code',
                  date: 'July 2024',
                },
              ],
              layout: 'vertical',
            },
          },
          // Separator - Vote
          {
            id: 'sep-vote',
            type: 'separator',
            data: {
              variant: 'text',
              text: 'Community Voting',
              icon: 'Vote',
            },
          },
          // Text - Voting Intro
          {
            id: 'text-vote-intro',
            type: 'text',
            data: {
              content: {
                type: 'doc',
                content: [
                  { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Help Shape the Future' }] },
                  { type: 'paragraph', content: [{ type: 'text', text: 'FlowWink is built in the open. Your votes directly influence what we build next. The most-requested features move up the priority list.' }] },
                ],
              },
            },
          },
          // Features - Vote Items
          {
            id: 'features-vote',
            type: 'features',
            data: {
              title: 'Top Requested Features',
              subtitle: 'Vote on GitHub Discussions to show your support.',
              features: [
                { id: 'vote-1', icon: 'Star', title: 'GraphQL API', description: 'Alternative to REST for flexible queries. Popular with React/Next.js teams.', url: 'https://github.com/flowwink/flowwink/discussions/123' },
                { id: 'vote-2', icon: 'Star', title: 'Real-time Collaboration', description: 'Multiple editors working on the same page simultaneously. Google Docs-style.', url: 'https://github.com/flowwink/flowwink/discussions/124' },
                { id: 'vote-3', icon: 'Star', title: 'A/B Testing', description: 'Test different versions of content. Automatic winner selection based on metrics.', url: 'https://github.com/flowwink/flowwink/discussions/125' },
                { id: 'vote-4', icon: 'Star', title: 'Content Scheduling Calendar', description: 'Visual calendar for scheduled content. Drag-and-drop rescheduling.', url: 'https://github.com/flowwink/flowwink/discussions/126' },
                { id: 'vote-5', icon: 'Star', title: 'White-label Admin', description: 'Customize the admin panel with your own branding. Remove all FlowWink references.', url: 'https://github.com/flowwink/flowwink/discussions/127' },
                { id: 'vote-6', icon: 'Star', title: 'Import from Notion', description: 'One-click import from Notion pages and databases. Preserve structure and formatting.', url: 'https://github.com/flowwink/flowwink/discussions/128' },
              ],
              columns: 3,
              variant: 'cards',
              iconStyle: 'none',
              showLinks: true,
            },
          },
          // Link Grid - Participate
          {
            id: 'links-participate',
            type: 'link-grid',
            data: {
              title: 'Get Involved',
              links: [
                { id: 'part-1', icon: 'Github', title: 'GitHub Discussions', description: 'Vote and propose features', url: 'https://github.com/flowwink/flowwink/discussions' },
                { id: 'part-2', icon: 'MessageCircle', title: 'Discord Community', description: 'Chat with the team', url: 'https://discord.gg/flowwink' },
                { id: 'part-3', icon: 'History', title: 'Changelog', description: 'Detailed release notes', url: 'https://github.com/flowwink/flowwink/releases' },
                { id: 'part-4', icon: 'GitPullRequest', title: 'Contribute', description: 'Submit a PR', url: 'https://github.com/flowwink/flowwink/contribute' },
              ],
              columns: 4,
            },
          },
          // Quote - Community
          {
            id: 'quote-community',
            type: 'quote',
            data: {
              quote: 'I suggested the Knowledge Base module on Discord. Three months later, it shipped. This team actually listens.',
              author: 'Community Member',
              role: 'GitHub Contributor',
              variant: 'centered',
            },
          },
          // CTA
          {
            id: 'cta-roadmap',
            type: 'cta',
            data: {
              title: 'Have a Feature Request?',
              subtitle: 'Open a discussion on GitHub or join our Discord to share your ideas.',
              buttonText: 'Open Discussion',
              buttonUrl: 'https://github.com/flowwink/flowwink/discussions/new',
              secondaryButtonText: 'Join Discord',
              secondaryButtonUrl: 'https://discord.gg/flowwink',
              gradient: true,
            },
          },
        ],
      },
      // ===== CONTACT PAGE =====
      {
        title: 'Contact',
        slug: 'contact',
        menu_order: 7,
        showInMenu: true,
        meta: {
          description: 'Get in touch with the FlowWink team - we\'re here to help with questions, demos, and enterprise inquiries.',
          showTitle: true,
          titleAlignment: 'center',
        },
        blocks: [
          {
            id: 'hero-contact',
            type: 'hero',
            data: {
              title: 'Let\'s Talk',
              subtitle: 'Questions about FlowWink? Want a personalized demo? We\'re here to help.',
              backgroundType: 'color',
              heightMode: 'auto',
              contentAlignment: 'center',
              overlayOpacity: 0,
            },
          },
          {
            id: 'booking-demo',
            type: 'booking',
            data: {
              title: 'Book a Demo',
              description: 'See FlowWink in action with a personalized walkthrough tailored to your needs.',
              mode: 'smart',
              submitButtonText: 'Confirm Demo',
              successMessage: 'Your demo is booked! We\'ll send you a confirmation email.',
              showPhoneField: true,
              variant: 'card',
            },
          },
          {
            id: 'chat-support',
            type: 'chat',
            data: {
              title: 'Quick Questions? Ask AI',
              height: 'sm',
              showSidebar: false,
              variant: 'card',
              initialPrompt: 'Hi! I can answer questions about FlowWink features, pricing, and deployment options. What would you like to know?',
            },
          },
          {
            id: 'contact-info',
            type: 'contact',
            data: {
              title: 'Other Ways to Reach Us',
              email: 'hello@flowwink.com',
              phone: '+46 70 123 45 67',
              hours: [
                { day: 'Sales & Demos', time: 'Mon-Fri 9-17 CET' },
                { day: 'Community Support', time: 'GitHub 24/7' },
              ],
            },
          },
        ],
      },
      // ===== DOCUMENTATION PAGE =====
      {
        title: 'Documentation',
        slug: 'docs',
        menu_order: 5,
        showInMenu: true,
        meta: {
          description: 'FlowWink developer documentation - API reference, self-hosting guide, webhooks, and integration resources.',
          showTitle: true,
          titleAlignment: 'center',
        },
        blocks: [
          // Hero
          {
            id: 'hero-docs',
            type: 'hero',
            data: {
              title: 'Documentation',
              subtitle: 'Everything you need to integrate, customize, and deploy FlowWink.',
              backgroundType: 'color',
              heightMode: 'auto',
              contentAlignment: 'center',
              overlayOpacity: 0,
            },
          },
          // Link Grid - Quick Navigation
          {
            id: 'links-quicknav',
            type: 'link-grid',
            data: {
              title: 'Quick Links',
              links: [
                { id: 'nav-api', icon: 'Code', title: 'API Reference', description: 'REST endpoints for all content', url: '#api-reference' },
                { id: 'nav-selfhost', icon: 'Server', title: 'Self-Hosting', description: 'Deploy on your infrastructure', url: '#self-hosting' },
                { id: 'nav-webhooks', icon: 'Webhook', title: 'Webhooks', description: 'Event-driven integrations', url: '#webhooks' },
                { id: 'nav-migration', icon: 'FileInput', title: 'Migration', description: 'Import from other platforms', url: '#migration' },
              ],
              columns: 4,
            },
          },
          // Separator - API Reference
          {
            id: 'sep-api',
            type: 'separator',
            data: {
              variant: 'text',
              text: 'API Reference',
              icon: 'Code',
            },
          },
          // Text - API Overview
          {
            id: 'text-api-overview',
            type: 'text',
            data: {
              content: {
                type: 'doc',
                content: [
                  { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'REST API' }] },
                  { type: 'paragraph', content: [{ type: 'text', text: 'FlowWink provides a complete REST API for accessing all content programmatically. Use it to build custom frontends, mobile apps, or integrate with other services.' }] },
                  { type: 'heading', attrs: { level: 3 }, content: [{ type: 'text', text: 'Base URL' }] },
                  { type: 'codeBlock', attrs: { language: 'text' }, content: [{ type: 'text', text: 'https://your-instance.com/api/v1' }] },
                  { type: 'heading', attrs: { level: 3 }, content: [{ type: 'text', text: 'Authentication' }] },
                  { type: 'paragraph', content: [{ type: 'text', text: 'All API requests require authentication via Bearer token. Generate API keys in the Admin panel under Settings.' }] },
                  { type: 'codeBlock', attrs: { language: 'bash' }, content: [{ type: 'text', text: 'curl -H "Authorization: Bearer YOUR_API_KEY" \\\n  https://your-instance.com/api/v1/pages' }] },
                ],
              },
            },
          },
          // Accordion - API Endpoints
          {
            id: 'accordion-endpoints',
            type: 'accordion',
            data: {
              title: 'Endpoints',
              items: [
                {
                  question: 'Pages',
                  answer: {
                    type: 'doc',
                    content: [
                      { type: 'paragraph', content: [
                        { type: 'text', marks: [{ type: 'code' }], text: 'GET /pages' },
                        { type: 'text', text: ' – List all published pages' },
                      ] },
                      { type: 'paragraph', content: [
                        { type: 'text', marks: [{ type: 'code' }], text: 'GET /pages/:slug' },
                        { type: 'text', text: ' – Get page by slug with all blocks' },
                      ] },
                      { type: 'paragraph', content: [
                        { type: 'text', marks: [{ type: 'code' }], text: 'GET /pages/:id/versions' },
                        { type: 'text', text: ' – Get version history for a page' },
                      ] },
                    ],
                  },
                },
                {
                  question: 'Blog Posts',
                  answer: {
                    type: 'doc',
                    content: [
                      { type: 'paragraph', content: [
                        { type: 'text', marks: [{ type: 'code' }], text: 'GET /blog/posts' },
                        { type: 'text', text: ' – List published posts (paginated)' },
                      ] },
                      { type: 'paragraph', content: [
                        { type: 'text', marks: [{ type: 'code' }], text: 'GET /blog/posts/:slug' },
                        { type: 'text', text: ' – Get post by slug with content' },
                      ] },
                      { type: 'paragraph', content: [
                        { type: 'text', marks: [{ type: 'code' }], text: 'GET /blog/categories' },
                        { type: 'text', text: ' – List all categories' },
                      ] },
                      { type: 'paragraph', content: [
                        { type: 'text', marks: [{ type: 'code' }], text: 'GET /blog/tags' },
                        { type: 'text', text: ' – List all tags' },
                      ] },
                    ],
                  },
                },
                {
                  question: 'Knowledge Base',
                  answer: {
                    type: 'doc',
                    content: [
                      { type: 'paragraph', content: [
                        { type: 'text', marks: [{ type: 'code' }], text: 'GET /kb/categories' },
                        { type: 'text', text: ' – List KB categories' },
                      ] },
                      { type: 'paragraph', content: [
                        { type: 'text', marks: [{ type: 'code' }], text: 'GET /kb/articles' },
                        { type: 'text', text: ' – List published articles' },
                      ] },
                      { type: 'paragraph', content: [
                        { type: 'text', marks: [{ type: 'code' }], text: 'GET /kb/articles/:slug' },
                        { type: 'text', text: ' – Get article by slug' },
                      ] },
                      { type: 'paragraph', content: [
                        { type: 'text', marks: [{ type: 'code' }], text: 'GET /kb/search?q=query' },
                        { type: 'text', text: ' – Full-text search across articles' },
                      ] },
                    ],
                  },
                },
                {
                  question: 'Media',
                  answer: {
                    type: 'doc',
                    content: [
                      { type: 'paragraph', content: [
                        { type: 'text', marks: [{ type: 'code' }], text: 'GET /media' },
                        { type: 'text', text: ' – List all media files' },
                      ] },
                      { type: 'paragraph', content: [
                        { type: 'text', marks: [{ type: 'code' }], text: 'GET /media/:id' },
                        { type: 'text', text: ' – Get media file metadata and URL' },
                      ] },
                      { type: 'paragraph', content: [
                        { type: 'text', marks: [{ type: 'code' }], text: 'POST /media' },
                        { type: 'text', text: ' – Upload new media file (multipart/form-data)' },
                      ] },
                    ],
                  },
                },
                {
                  question: 'Settings',
                  answer: {
                    type: 'doc',
                    content: [
                      { type: 'paragraph', content: [
                        { type: 'text', marks: [{ type: 'code' }], text: 'GET /settings/site' },
                        { type: 'text', text: ' – Get site settings (name, logo, etc.)' },
                      ] },
                      { type: 'paragraph', content: [
                        { type: 'text', marks: [{ type: 'code' }], text: 'GET /settings/navigation' },
                        { type: 'text', text: ' – Get navigation menu structure' },
                      ] },
                      { type: 'paragraph', content: [
                        { type: 'text', marks: [{ type: 'code' }], text: 'GET /settings/branding' },
                        { type: 'text', text: ' – Get branding (colors, fonts, etc.)' },
                      ] },
                    ],
                  },
                },
              ],
            },
          },
          // Separator - Self-Hosting
          {
            id: 'sep-selfhost',
            type: 'separator',
            data: {
              variant: 'text',
              text: 'Self-Hosting',
              icon: 'Server',
            },
          },
          // Two-Column - Self-Hosting Overview
          {
            id: 'twocol-selfhost',
            type: 'two-column',
            data: {
              leftColumn: {
                type: 'doc',
                content: [
                  { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Deploy on Your Infrastructure' }] },
                  { type: 'paragraph', content: [{ type: 'text', text: 'FlowWink is fully self-hostable. Run it on your own servers for complete control over your data and infrastructure.' }] },
                  { type: 'heading', attrs: { level: 3 }, content: [{ type: 'text', text: 'Requirements' }] },
                  { type: 'bulletList', content: [
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Node.js 18+ or Bun' }] }] },
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'PostgreSQL 14+ (or Supabase)' }] }] },
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: '1GB RAM minimum, 2GB recommended' }] }] },
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: '10GB disk space for media storage' }] }] },
                  ] },
                ],
              },
              rightColumn: {
                type: 'doc',
                content: [
                  { type: 'heading', attrs: { level: 3 }, content: [{ type: 'text', text: 'Quick Start' }] },
                  { type: 'codeBlock', attrs: { language: 'bash' }, content: [{ type: 'text', text: '# Clone the repository\ngit clone https://github.com/flowwink/flowwink\ncd flowwink\n\n# Install dependencies\nnpm install\n\n# Configure environment\ncp .env.example .env\n# Edit .env with your database URL\n\n# Run migrations\nnpm run db:migrate\n\n# Start the server\nnpm run start' }] },
                ],
              },
              layout: '50-50',
            },
          },
          // Features - Deployment Options
          {
            id: 'features-deploy',
            type: 'features',
            data: {
              title: 'Deployment Options',
              features: [
                { id: 'deploy-docker', icon: 'Container', title: 'Docker', description: 'Official Docker image for containerized deployments. Works with Docker Compose, Kubernetes, or any container platform.', url: 'https://hub.docker.com/r/flowwink/flowwink' },
                { id: 'deploy-vercel', icon: 'Triangle', title: 'Vercel', description: 'One-click deploy to Vercel. Connect your GitHub repo and deploy automatically on every push.' },
                { id: 'deploy-railway', icon: 'Train', title: 'Railway', description: 'Deploy with Railway for managed PostgreSQL and automatic scaling. Template available.' },
                { id: 'deploy-vps', icon: 'Server', title: 'VPS / Bare Metal', description: 'Run on any Linux server with Node.js. Use PM2 or systemd for process management.' },
              ],
              columns: 4,
              variant: 'cards',
              iconStyle: 'circle',
              showLinks: true,
            },
          },
          // Accordion - Self-Hosting FAQ
          {
            id: 'accordion-selfhost',
            type: 'accordion',
            data: {
              title: 'Self-Hosting FAQ',
              items: [
                {
                  question: 'Can I use my own database?',
                  answer: {
                    type: 'doc',
                    content: [
                      { type: 'paragraph', content: [{ type: 'text', text: 'Yes! FlowWink works with any PostgreSQL 14+ database. You can use a managed service like Supabase, Neon, or AWS RDS, or run your own PostgreSQL instance.' }] },
                    ],
                  },
                },
                {
                  question: 'How do I configure a private LLM?',
                  answer: {
                    type: 'doc',
                    content: [
                      { type: 'paragraph', content: [{ type: 'text', text: 'Set the AI_PROVIDER environment variable to your preferred provider (openai, anthropic, ollama, or custom). For local LLMs, point AI_BASE_URL to your Ollama or LM Studio endpoint.' }] },
                    ],
                  },
                },
                {
                  question: 'Is there an update mechanism?',
                  answer: {
                    type: 'doc',
                    content: [
                      { type: 'paragraph', content: [{ type: 'text', text: 'Pull the latest code from GitHub and run migrations. We recommend testing updates in a staging environment first. Database migrations are backward-compatible.' }] },
                    ],
                  },
                },
                {
                  question: 'How do I set up SSL?',
                  answer: {
                    type: 'doc',
                    content: [
                      { type: 'paragraph', content: [{ type: 'text', text: 'Use a reverse proxy like Nginx or Caddy with automatic SSL via Let\'s Encrypt. Caddy is recommended for simplicity. Most cloud platforms handle SSL automatically.' }] },
                    ],
                  },
                },
              ],
            },
          },
          // Separator - Webhooks
          {
            id: 'sep-webhooks',
            type: 'separator',
            data: {
              variant: 'text',
              text: 'Webhooks',
              icon: 'Webhook',
            },
          },
          // Text - Webhooks
          {
            id: 'text-webhooks',
            type: 'text',
            data: {
              content: {
                type: 'doc',
                content: [
                  { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Event-Driven Integrations' }] },
                  { type: 'paragraph', content: [{ type: 'text', text: 'Webhooks notify external services when content changes. Use them to trigger builds, sync data, or automate workflows.' }] },
                  { type: 'heading', attrs: { level: 3 }, content: [{ type: 'text', text: 'Supported Events' }] },
                ],
              },
            },
          },
          // Features - Webhook Events
          {
            id: 'features-events',
            type: 'features',
            data: {
              title: '',
              features: [
                { id: 'ev-publish', icon: 'Globe', title: 'page.published', description: 'Fired when a page is published' },
                { id: 'ev-update', icon: 'RefreshCw', title: 'page.updated', description: 'Fired when a published page is updated' },
                { id: 'ev-delete', icon: 'Trash2', title: 'page.deleted', description: 'Fired when a page is deleted' },
                { id: 'ev-blog-pub', icon: 'FileText', title: 'blog_post.published', description: 'Fired when a blog post is published' },
                { id: 'ev-blog-upd', icon: 'Edit', title: 'blog_post.updated', description: 'Fired when a blog post is updated' },
                { id: 'ev-form', icon: 'ClipboardList', title: 'form.submitted', description: 'Fired when a form is submitted' },
                { id: 'ev-newsletter', icon: 'Mail', title: 'newsletter.subscribed', description: 'Fired when someone subscribes' },
                { id: 'ev-booking', icon: 'Calendar', title: 'booking.submitted', description: 'Fired when a booking is made' },
              ],
              columns: 4,
              variant: 'minimal',
              iconStyle: 'none',
            },
          },
          // Text - Webhook Payload
          {
            id: 'text-webhook-payload',
            type: 'text',
            data: {
              content: {
                type: 'doc',
                content: [
                  { type: 'heading', attrs: { level: 3 }, content: [{ type: 'text', text: 'Payload Format' }] },
                  { type: 'codeBlock', attrs: { language: 'json' }, content: [{ type: 'text', text: '{\n  "event": "page.published",\n  "timestamp": "2024-01-15T10:30:00Z",\n  "data": {\n    "id": "uuid",\n    "title": "Page Title",\n    "slug": "page-slug",\n    "status": "published"\n  }\n}' }] },
                  { type: 'heading', attrs: { level: 3 }, content: [{ type: 'text', text: 'Security' }] },
                  { type: 'paragraph', content: [{ type: 'text', text: 'Webhooks include an HMAC signature in the X-Webhook-Signature header. Verify this signature against your webhook secret to ensure authenticity.' }] },
                ],
              },
            },
          },
          // Info Box - N8N
          {
            id: 'info-n8n',
            type: 'info-box',
            data: {
              variant: 'info',
              content: {
                type: 'doc',
                content: [
                  { type: 'heading', attrs: { level: 3 }, content: [{ type: 'text', text: 'N8N Integration Templates' }] },
                  { type: 'paragraph', content: [{ type: 'text', text: 'We provide pre-built N8N workflow templates for common integrations: Slack notifications, email alerts, CRM sync, and static site rebuilds. Import them from the Admin panel under Webhooks.' }] },
                ],
              },
            },
          },
          // Separator - Migration
          {
            id: 'sep-migration',
            type: 'separator',
            data: {
              variant: 'text',
              text: 'Migration',
              icon: 'FileInput',
            },
          },
          // Features - Migration Sources
          {
            id: 'features-migration',
            type: 'features',
            data: {
              title: 'Import from Anywhere',
              subtitle: 'AI-powered migration converts your content to structured blocks automatically.',
              features: [
                { id: 'mig-wp', icon: 'FileCode', title: 'WordPress', description: 'Import posts, pages, and media. Categories and tags are preserved. Featured images are downloaded.' },
                { id: 'mig-webflow', icon: 'Layout', title: 'Webflow', description: 'Convert Webflow pages to FlowWink blocks. Styles are mapped to our design system.' },
                { id: 'mig-html', icon: 'Code', title: 'Any HTML', description: 'Paste any URL and AI converts the content to structured blocks. Works with any website.' },
                { id: 'mig-json', icon: 'Braces', title: 'JSON Import', description: 'Import content from any source using our JSON schema. Full control over mapping.' },
              ],
              columns: 4,
              variant: 'cards',
              iconStyle: 'circle',
            },
          },
          // Text - Migration Steps
          {
            id: 'text-migration',
            type: 'text',
            data: {
              content: {
                type: 'doc',
                content: [
                  { type: 'heading', attrs: { level: 3 }, content: [{ type: 'text', text: 'Migration Process' }] },
                  { type: 'orderedList', content: [
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Go to Admin → Pages → Import' }] }] },
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Enter the URL of the page to import' }] }] },
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'AI analyzes and converts the content to blocks' }] }] },
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Review and adjust the imported content' }] }] },
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Publish when ready' }] }] },
                  ] },
                ],
              },
            },
          },
          // Separator - Resources
          {
            id: 'sep-resources',
            type: 'separator',
            data: {
              variant: 'text',
              text: 'Resources',
              icon: 'BookOpen',
            },
          },
          // Link Grid - Resources
          {
            id: 'links-resources',
            type: 'link-grid',
            data: {
              title: '',
              links: [
                { id: 'res-github', icon: 'Github', title: 'GitHub Repository', description: 'Source code, issues, and discussions', url: 'https://github.com/flowwink/flowwink' },
                { id: 'res-discord', icon: 'MessageCircle', title: 'Discord Community', description: 'Get help from the community', url: 'https://discord.gg/flowwink' },
                { id: 'res-changelog', icon: 'History', title: 'Changelog', description: 'See what is new in each release', url: 'https://github.com/flowwink/flowwink/releases' },
                { id: 'res-roadmap', icon: 'Map', title: 'Roadmap', description: 'Upcoming features and priorities', url: 'https://github.com/flowwink/flowwink/projects' },
              ],
              columns: 4,
            },
          },
          // CTA
          {
            id: 'cta-docs',
            type: 'cta',
            data: {
              title: 'Ready to Get Started?',
              subtitle: 'Try the demo or deploy your own instance today.',
              buttonText: 'Launch Demo',
              buttonUrl: '/demo',
              secondaryButtonText: 'View on GitHub',
              secondaryButtonUrl: 'https://github.com/flowwink/flowwink',
              gradient: true,
            },
          },
        ],
      },
      // ===== PRIVACY POLICY =====
      {
        title: 'Privacy Policy',
        slug: 'privacy-policy',
        menu_order: 99,
        showInMenu: false,
        meta: {
          description: 'FlowWink Privacy Policy - How we collect, use, and protect your personal data.',
          showTitle: true,
          titleAlignment: 'left',
        },
        blocks: [
          {
            id: 'text-privacy',
            type: 'text',
            data: {
              content: {
                type: 'doc',
                content: [
                  { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Introduction' }] },
                  { type: 'paragraph', content: [{ type: 'text', text: 'FlowWink AB ("we", "us", or "our") is committed to protecting your privacy. This policy describes how we collect, use, and protect your personal information when you use our website and services.' }] },
                  { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Data Controller' }] },
                  { type: 'paragraph', content: [{ type: 'text', text: 'FlowWink AB is the data controller for the processing of your personal data. Contact us at privacy@flowwink.com for any questions.' }] },
                  { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'What Data We Collect' }] },
                  { type: 'paragraph', content: [{ type: 'text', text: 'We collect information you provide when creating an account, contacting us, or subscribing to our newsletter. This includes name, email, company name, and any other information you choose to provide.' }] },
                  { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Your Rights' }] },
                  { type: 'paragraph', content: [{ type: 'text', text: 'Under GDPR, you have the right to access, rectify, erase, and port your personal data. You can also object to processing or request restriction. Contact us to exercise these rights.' }] },
                ],
              },
            },
          },
        ],
      },
      // ===== HELP CENTER =====
      {
        title: 'Help',
        slug: 'help',
        menu_order: 5,
        showInMenu: true,
        meta: {
          description: 'Find answers to common questions about FlowWink. Search our knowledge base or contact support.',
          showTitle: false,
          titleAlignment: 'center',
        },
        blocks: [
          {
            id: 'kb-hub-main',
            type: 'kb-hub',
            data: {
              title: 'How can we help?',
              subtitle: 'Search our knowledge base or browse by category to find the answers you need.',
              searchPlaceholder: 'Search for answers...',
              showSearch: true,
              showCategories: true,
              showArticles: true,
              showContactCta: true,
              ctaTitle: 'Still have questions?',
              ctaDescription: 'Our team is here to help. Get in touch and we will respond within 24 hours.',
              ctaButtonText: 'Contact Support',
              ctaButtonUrl: '/contact',
              variant: 'default',
            },
          },
        ],
      },
      // ===== TERMS OF SERVICE =====
      {
        title: 'Terms of Service',
        slug: 'terms-of-service',
        menu_order: 100,
        showInMenu: false,
        meta: {
          description: 'FlowWink Terms of Service - Terms and conditions for using our platform.',
          showTitle: true,
          titleAlignment: 'left',
        },
        blocks: [
          {
            id: 'text-terms',
            type: 'text',
            data: {
              content: {
                type: 'doc',
                content: [
                  { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Agreement to Terms' }] },
                  { type: 'paragraph', content: [{ type: 'text', text: 'By accessing or using FlowWink, you agree to be bound by these Terms of Service. If you disagree with any part of these terms, you may not access our services.' }] },
                  { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Use of Service' }] },
                  { type: 'paragraph', content: [{ type: 'text', text: 'You may use our services only for lawful purposes and in accordance with these Terms. You agree not to use our services in any way that violates applicable laws or regulations.' }] },
                  { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Open Source License' }] },
                  { type: 'paragraph', content: [{ type: 'text', text: 'FlowWink is open source software licensed under the MIT License. You are free to use, modify, and distribute the software according to the license terms.' }] },
                  { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Managed Services' }] },
                  { type: 'paragraph', content: [{ type: 'text', text: 'Our managed cloud services are provided as-is. We strive for 99.9% uptime but are not liable for service interruptions beyond our control.' }] },
                ],
              },
            },
          },
        ],
      },
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
      widgetEnabled: true,
      widgetPosition: 'bottom-right',
      blockEnabled: true,
      welcomeMessage: 'Hi! I can answer questions about FlowWink. What would you like to know?',
      systemPrompt: 'You are the FlowWink assistant. Help users understand the product, features, and pricing. Be helpful, concise, and friendly. FlowWink is a complete CMS with both traditional website features and headless API capabilities.',
      suggestedPrompts: [
        'What is FlowWink?',
        'How much does it cost?',
        'Can I self-host FlowWink?',
        'Does it support headless API?',
      ],
    },
    footerSettings: {
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
    cookieBannerSettings: {
      enabled: true,
    },
    siteSettings: {
      homepageSlug: 'home',
    },
  },
];

export function getTemplateById(id: string): StarterTemplate | undefined {
  return STARTER_TEMPLATES.find(t => t.id === id);
}

export function getTemplatesByCategory(category: StarterTemplate['category']): StarterTemplate[] {
  return STARTER_TEMPLATES.filter(t => t.category === category);
}

// =====================================================
// BLANK TEMPLATE - Starting point for new templates
// =====================================================
/**
 * Blank Template
 * 
 * Use this as a starting point for creating new templates.
 * Copy this structure and customize it for your needs.
 * 
 * See docs/TEMPLATE-AUTHORING.md for complete documentation.
 */
export const BLANK_TEMPLATE: StarterTemplate = {
  // ===== Basic Info =====
  id: 'blank',                          // Unique ID (lowercase, dashes)
  name: 'Blank Template',               // Display name
  description: 'A minimal starting point for creating your own template.',
  category: 'startup',                  // startup | enterprise | compliance | platform
  icon: 'FileText',                     // Lucide icon name
  tagline: 'Start from scratch',        // One-liner
  aiChatPosition: 'bottom-right',

  // ===== Pages =====
  // At minimum, you need one page. Mark one as isHomePage: true
  pages: [
    {
      title: 'Home',
      slug: 'home',
      isHomePage: true,                 // This is the homepage
      menu_order: 1,
      showInMenu: true,
      meta: {
        description: 'Welcome to our website',
        showTitle: false,
        titleAlignment: 'center',
      },
      blocks: [
        // Hero block - the main banner
        {
          id: 'hero-1',
          type: 'hero',
          data: {
            title: 'Your Headline Here',
            subtitle: 'Add a compelling subtitle that explains your value proposition.',
            backgroundType: 'color',
            heightMode: 'viewport',
            contentAlignment: 'center',
            primaryButton: { text: 'Get Started', url: '/contact' },
          },
        },
        // Text block - for content
        {
          id: 'text-1',
          type: 'text',
          data: {
            content: {
              type: 'doc',
              content: [
                {
                  type: 'heading',
                  attrs: { level: 2 },
                  content: [{ type: 'text', text: 'About Us' }],
                },
                {
                  type: 'paragraph',
                  content: [{ type: 'text', text: 'Add your content here. Use the text() or heading() helpers from template-helpers.ts for easier content creation.' }],
                },
              ],
            },
          },
        },
        // CTA block - call to action
        {
          id: 'cta-1',
          type: 'cta',
          data: {
            title: 'Ready to Start?',
            subtitle: 'Contact us today.',
            buttonText: 'Contact Us',
            buttonUrl: '/contact',
            gradient: true,
          },
        },
      ],
    },
    {
      title: 'Contact',
      slug: 'contact',
      menu_order: 2,
      showInMenu: true,
      meta: {
        description: 'Get in touch with us',
        showTitle: true,
        titleAlignment: 'center',
      },
      blocks: [
        {
          id: 'hero-1',
          type: 'hero',
          data: {
            title: 'Contact Us',
            subtitle: 'We\'d love to hear from you.',
            backgroundType: 'color',
            heightMode: 'auto',
            contentAlignment: 'center',
          },
        },
        {
          id: 'form-1',
          type: 'form',
          data: {
            title: 'Send us a message',
            submitButtonText: 'Send',
            successMessage: 'Thanks! We\'ll be in touch soon.',
            fields: [
              { id: 'name', type: 'text', label: 'Name', required: true },
              { id: 'email', type: 'email', label: 'Email', required: true },
              { id: 'message', type: 'textarea', label: 'Message', required: true },
            ],
          },
        },
      ],
    },
  ],

  // ===== Optional: Blog Posts =====
  // blogPosts: [],

  // ===== Optional: Knowledge Base =====
  // kbCategories: [],

  // ===== Branding Settings =====
  branding: {
    organizationName: 'My Site',
    brandTagline: 'Your tagline here',
    primaryColor: '217 91% 60%',            // Blue in HSL
    headingFont: 'Inter',
    bodyFont: 'Inter',
    borderRadius: 'md',
  },

  // ===== Chat Settings =====
  chatSettings: {
    enabled: true,
    widgetPosition: 'bottom-right',
    welcomeMessage: 'Hi! How can I help you today?',
    placeholder: 'Type your message...',
    systemPrompt: 'You are a helpful assistant. Answer questions about our company and services.',
    suggestedPrompts: [
      'What services do you offer?',
      'How can I get started?',
    ],
  },

  // ===== Footer Settings =====
  footerSettings: {
    phone: '',
    email: 'hello@example.com',
    address: '',
    postalCode: '',
    weekdayHours: '',
    weekendHours: '',
    showBrand: true,
    showQuickLinks: true,
    showContact: true,
    showHours: false,
  },

  // ===== SEO Settings =====
  seoSettings: {
    siteTitle: 'My Site',
    titleTemplate: '%s | My Site',
    defaultDescription: 'Welcome to our website.',
    robotsIndex: true,
    robotsFollow: true,
  },

  // ===== Cookie Banner =====
  cookieBannerSettings: {
    enabled: false,
  },

  // ===== Site Settings =====
  siteSettings: {
    homepageSlug: 'home',
  },
};

// =====================================================
// KB CLASSIC - SEO-focused Help Center Template
// =====================================================
const kbClassicPages: TemplatePage[] = [
  {
    title: 'Home',
    slug: 'home',
    isHomePage: true,
    menu_order: 1,
    showInMenu: true,
    meta: {
      description: 'Welcome to our Help Center - find answers to all your questions.',
      showTitle: false,
      titleAlignment: 'center',
    },
    blocks: [
      {
        id: 'hero-1',
        type: 'hero',
        data: {
          title: 'How can we help you?',
          subtitle: 'Search our knowledge base or browse categories below.',
          backgroundType: 'color',
          heightMode: 'auto',
          contentAlignment: 'center',
          overlayOpacity: 0,
          titleAnimation: 'fade-in',
        },
      },
      {
        id: 'kb-search-1',
        type: 'kb-search',
        data: {
          placeholder: 'Search for answers...',
          variant: 'hero',
          showPopularSearches: true,
          popularSearches: ['getting started', 'pricing', 'billing', 'security'],
        },
      },
      {
        id: 'kb-featured-1',
        type: 'kb-featured',
        data: {
          title: 'Popular Articles',
          subtitle: 'Quick answers to common questions',
          maxItems: 4,
          showCategory: true,
          layout: 'grid',
          columns: 2,
        },
      },
      {
        id: 'cta-1',
        type: 'cta',
        data: {
          title: 'Still have questions?',
          subtitle: 'Our support team is here to help.',
          buttonText: 'Contact Support',
          buttonUrl: '/contact',
          gradient: false,
        },
      },
    ],
  },
  {
    title: 'Help Center',
    slug: 'help',
    menu_order: 2,
    showInMenu: true,
    meta: {
      description: 'Browse our complete knowledge base with guides and tutorials.',
      showTitle: true,
      titleAlignment: 'center',
    },
    blocks: [
      {
        id: 'kb-search-1',
        type: 'kb-search',
        data: {
          placeholder: 'Search articles...',
          variant: 'compact',
          showPopularSearches: false,
        },
      },
      {
        id: 'kb-hub-1',
        type: 'kb-hub',
        data: {
          title: 'Knowledge Base',
          subtitle: 'Find answers organized by topic',
          showSearch: false,
          showCategories: true,
          layout: 'accordion',
          showContactCta: false,
        },
      },
    ],
  },
  {
    title: 'FAQ',
    slug: 'faq',
    menu_order: 3,
    showInMenu: true,
    meta: {
      description: 'Frequently asked questions about our platform.',
      showTitle: true,
      titleAlignment: 'center',
    },
    blocks: [
      {
        id: 'hero-1',
        type: 'hero',
        data: {
          title: 'Frequently Asked Questions',
          subtitle: 'Quick answers to the most common questions.',
          backgroundType: 'color',
          heightMode: 'auto',
          contentAlignment: 'center',
        },
      },
      {
        id: 'accordion-1',
        type: 'accordion',
        data: {
          title: 'General Questions',
          items: [
            { question: 'What is this platform?', answer: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Our platform is a comprehensive solution designed for modern teams. It provides tools for content management, collaboration, and analytics.' }] }] } },
            { question: 'How do I get started?', answer: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Create an account, complete the setup wizard, and you will be ready to go in under 5 minutes.' }] }] } },
            { question: 'Is there a free trial?', answer: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Yes! All paid plans include a 14-day free trial. No credit card required.' }] }] } },
          ],
        },
      },
      {
        id: 'accordion-2',
        type: 'accordion',
        data: {
          title: 'Billing & Account',
          items: [
            { question: 'What payment methods do you accept?', answer: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'We accept all major credit cards, PayPal, and bank transfers for annual plans.' }] }] } },
            { question: 'Can I cancel anytime?', answer: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Yes, you can cancel your subscription at any time. Your access will continue until the end of the billing period.' }] }] } },
            { question: 'How do I upgrade my plan?', answer: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Go to Settings → Billing → Change Plan. Upgrades take effect immediately.' }] }] } },
          ],
        },
      },
      {
        id: 'cta-1',
        type: 'cta',
        data: {
          title: 'Did not find your answer?',
          subtitle: 'Contact our support team for personalized help.',
          buttonText: 'Contact Us',
          buttonUrl: '/contact',
          gradient: false,
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
      description: 'Contact our support team.',
      showTitle: true,
      titleAlignment: 'center',
    },
    blocks: [
      {
        id: 'hero-1',
        type: 'hero',
        data: {
          title: 'Contact Us',
          subtitle: 'We are here to help. Send us a message and we will respond as soon as possible.',
          backgroundType: 'color',
          heightMode: 'auto',
          contentAlignment: 'center',
        },
      },
      {
        id: 'form-1',
        type: 'form',
        data: {
          title: 'Send a Message',
          description: 'Fill out the form below and we will get back to you within 24 hours.',
          fields: [
            { id: 'name', type: 'text', label: 'Name', placeholder: 'Your name', required: true, width: 'half' },
            { id: 'email', type: 'email', label: 'Email', placeholder: 'you@example.com', required: true, width: 'half' },
            { id: 'subject', type: 'text', label: 'Subject', placeholder: 'How can we help?', required: true, width: 'full' },
            { id: 'message', type: 'textarea', label: 'Message', placeholder: 'Describe your issue or question...', required: true, width: 'full' },
          ],
          submitButtonText: 'Send Message',
          successMessage: 'Thank you! We will get back to you within 24 hours.',
          variant: 'card',
        },
      },
      {
        id: 'contact-1',
        type: 'contact',
        data: {
          title: 'Other Ways to Reach Us',
          email: 'support@example.com',
          phone: '+1 (555) 123-4567',
          hours: [
            { day: 'Monday - Friday', time: '9:00 AM - 6:00 PM' },
            { day: 'Saturday - Sunday', time: 'Closed' },
          ],
        },
      },
    ],
  },
];

const kbClassicTemplate: StarterTemplate = {
  id: 'kb-classic',
  name: 'KB Classic',
  description: 'SEO-optimized help center with comprehensive knowledge base, structured FAQ, and traditional support form. Ideal for documentation-heavy organizations.',
  category: 'helpcenter',
  icon: 'BookOpen',
  tagline: 'SEO-focused documentation',
  aiChatPosition: 'No AI chat - pure documentation',
  helpStyle: 'kb-classic',
  pages: kbClassicPages,
  kbCategories: kbClassicCategories,
  branding: {
    organizationName: 'Help Center',
    brandTagline: 'Find answers fast',
    primaryColor: '220 70% 50%',
    headingFont: 'Inter',
    bodyFont: 'Inter',
    borderRadius: 'md',
    shadowIntensity: 'subtle',
  },
  chatSettings: {
    enabled: false,
    widgetEnabled: false,
  },
  footerSettings: {
    email: 'support@example.com',
    phone: '+1 (555) 123-4567',
    showBrand: true,
    showQuickLinks: true,
    showContact: true,
    showHours: true,
    weekdayHours: 'Mon-Fri 9-18',
    weekendHours: 'Closed',
  },
  seoSettings: {
    siteTitle: 'Help Center',
    titleTemplate: '%s | Help Center',
    defaultDescription: 'Find answers to your questions in our comprehensive knowledge base.',
    robotsIndex: true,
    robotsFollow: true,
  },
  cookieBannerSettings: {
    enabled: true,
  },
  siteSettings: {
    homepageSlug: 'home',
  },
};

// =====================================================
// AI SUPPORT HUB - Chat-focused Template
// =====================================================
const aiHubPages: TemplatePage[] = [
  {
    title: 'Home',
    slug: 'home',
    isHomePage: true,
    menu_order: 1,
    showInMenu: true,
    meta: {
      description: 'Get instant AI-powered support - ask any question and get answers in seconds.',
      showTitle: false,
      titleAlignment: 'center',
    },
    blocks: [
      {
        id: 'hero-1',
        type: 'hero',
        data: {
          title: 'Ask Our AI Assistant',
          subtitle: 'Get instant answers to your questions, 24/7.',
          backgroundType: 'color',
          heightMode: 'auto',
          contentAlignment: 'center',
          overlayOpacity: 0,
          titleAnimation: 'slide-up',
        },
      },
      {
        id: 'chat-1',
        type: 'chat',
        data: {
          title: '',
          height: 'lg',
          showSidebar: false,
          variant: 'card',
          initialPrompt: 'Hi! I am your AI assistant. Ask me anything about our platform, pricing, features, or how to get started. I am here to help 24/7!',
        },
      },
      {
        id: 'kb-featured-1',
        type: 'kb-featured',
        data: {
          title: 'Popular Topics',
          subtitle: 'Quick answers to common questions',
          maxItems: 3,
          showCategory: false,
          layout: 'list',
          columns: 1,
        },
      },
      {
        id: 'cta-1',
        type: 'cta',
        data: {
          title: 'Prefer to talk to a human?',
          subtitle: 'Our support team is available for complex questions.',
          buttonText: 'Book a Call',
          buttonUrl: '/contact',
          gradient: true,
        },
      },
    ],
  },
  {
    title: 'Contact',
    slug: 'contact',
    menu_order: 2,
    showInMenu: true,
    meta: {
      description: 'Schedule a call with our support team.',
      showTitle: true,
      titleAlignment: 'center',
    },
    blocks: [
      {
        id: 'hero-1',
        type: 'hero',
        data: {
          title: 'Talk to Our Team',
          subtitle: 'For complex issues, schedule a personalized support call.',
          backgroundType: 'color',
          heightMode: 'auto',
          contentAlignment: 'center',
        },
      },
      {
        id: 'booking-1',
        type: 'booking',
        data: {
          title: 'Schedule a Support Call',
          description: 'Choose a time that works for you.',
          mode: 'smart',
          submitButtonText: 'Confirm Call',
          successMessage: 'Your call is booked! We\'ll reach out at the scheduled time.',
          showPhoneField: true,
          variant: 'card',
        },
      },
    ],
  },
];

const aiHubTemplate: StarterTemplate = {
  id: 'ai-support-hub',
  name: 'AI Support Hub',
  description: 'Modern, AI-first support experience with prominent chat interface. Perfect for tech companies and startups prioritizing conversational support.',
  category: 'helpcenter',
  icon: 'Bot',
  tagline: 'AI-powered conversations',
  aiChatPosition: 'Prominent embedded chat',
  helpStyle: 'ai-hub',
  pages: aiHubPages,
  kbCategories: aiHubCategories,
  branding: {
    organizationName: 'Support Hub',
    brandTagline: 'Instant AI Support',
    primaryColor: '262 83% 58%',
    headingFont: 'Space Grotesk',
    bodyFont: 'Inter',
    borderRadius: 'lg',
    shadowIntensity: 'medium',
  },
  chatSettings: {
    enabled: true,
    aiProvider: 'openai',
    widgetEnabled: true,
    widgetPosition: 'bottom-right',
    welcomeMessage: 'Hey! 👋 Ask me anything.',
    systemPrompt: 'You are a helpful, friendly AI support assistant. Be concise and direct. Help users quickly find answers.',
    suggestedPrompts: [
      'How do I get started?',
      'What are the pricing plans?',
      'How do I contact support?',
    ],
  },
  footerSettings: {
    email: 'hello@example.com',
    showBrand: true,
    showQuickLinks: true,
    showContact: true,
    showHours: false,
  },
  seoSettings: {
    siteTitle: 'Support Hub',
    titleTemplate: '%s | Support Hub',
    defaultDescription: 'Get instant AI-powered support 24/7.',
    robotsIndex: true,
    robotsFollow: true,
  },
  cookieBannerSettings: {
    enabled: false,
  },
  siteSettings: {
    homepageSlug: 'home',
  },
};

// =====================================================
// HYBRID HELP CENTER - Combination Template
// =====================================================
const hybridHelpPages: TemplatePage[] = [
  {
    title: 'Home',
    slug: 'home',
    isHomePage: true,
    menu_order: 1,
    showInMenu: true,
    meta: {
      description: 'Welcome to our Help Center - search our knowledge base or chat with AI for instant answers.',
      showTitle: false,
      titleAlignment: 'center',
    },
    blocks: [
      {
        id: 'kb-search-1',
        type: 'kb-search',
        data: {
          placeholder: 'Search for answers...',
          variant: 'hero',
          showPopularSearches: true,
          popularSearches: ['getting started', 'pricing', 'account', 'features'],
        },
      },
      {
        id: 'chat-1',
        type: 'chat',
        data: {
          title: 'Can\'t find what you need? Ask AI',
          height: 'sm',
          showSidebar: false,
          variant: 'embedded',
          initialPrompt: 'Hi! I can help you find answers quickly. What would you like to know?',
        },
      },
      {
        id: 'kb-hub-1',
        type: 'kb-hub',
        data: {
          title: 'Browse by Category',
          subtitle: '',
          showSearch: false,
          showCategories: true,
          layout: 'cards',
          showContactCta: true,
          contactCtaTitle: 'Need more help?',
          contactCtaLink: '/contact',
          contactCtaButtonText: 'Contact Support',
          showChat: true,
        },
      },
    ],
  },
  {
    title: 'Help Center',
    slug: 'help',
    menu_order: 2,
    showInMenu: true,
    meta: {
      description: 'Complete knowledge base with guides, tutorials, and answers.',
      showTitle: true,
      titleAlignment: 'center',
    },
    blocks: [
      {
        id: 'kb-search-1',
        type: 'kb-search',
        data: {
          placeholder: 'Search articles...',
          variant: 'compact',
          showPopularSearches: false,
        },
      },
      {
        id: 'kb-hub-1',
        type: 'kb-hub',
        data: {
          title: '',
          subtitle: '',
          showSearch: false,
          showCategories: true,
          layout: 'accordion',
          showContactCta: false,
        },
      },
    ],
  },
  {
    title: 'Contact',
    slug: 'contact',
    menu_order: 3,
    showInMenu: true,
    meta: {
      description: 'Get in touch with our support team.',
      showTitle: true,
      titleAlignment: 'center',
    },
    blocks: [
      {
        id: 'hero-1',
        type: 'hero',
        data: {
          title: 'We are here to help',
          subtitle: 'Chat with AI, send us a message, or schedule a call.',
          backgroundType: 'color',
          heightMode: 'auto',
          contentAlignment: 'center',
        },
      },
      {
        id: 'chat-1',
        type: 'chat',
        data: {
          title: 'Quick Question? Ask AI',
          height: 'sm',
          showSidebar: false,
          variant: 'card',
          initialPrompt: 'Hi! How can I help you today?',
        },
      },
      {
        id: 'form-1',
        type: 'form',
        data: {
          title: 'Send a Message',
          description: 'For complex issues, our team will respond within 24 hours.',
          fields: [
            { id: 'name', type: 'text', label: 'Name', placeholder: 'Your name', required: true, width: 'half' },
            { id: 'email', type: 'email', label: 'Email', placeholder: 'you@example.com', required: true, width: 'half' },
            { id: 'message', type: 'textarea', label: 'How can we help?', placeholder: 'Describe your issue...', required: true, width: 'full' },
          ],
          submitButtonText: 'Send',
          successMessage: 'Thanks! We will get back to you soon.',
          variant: 'card',
        },
      },
      {
        id: 'contact-1',
        type: 'contact',
        data: {
          title: 'Other Options',
          email: 'support@example.com',
          hours: [
            { day: 'AI Assistant', time: 'Available 24/7' },
            { day: 'Human Support', time: 'Mon-Fri 9-18' },
          ],
        },
      },
    ],
  },
];

const hybridHelpTemplate: StarterTemplate = {
  id: 'hybrid-help-center',
  name: 'Hybrid Help Center',
  description: 'Best of both worlds: searchable knowledge base combined with AI chat. Ideal for SaaS, e-commerce, and service businesses.',
  category: 'helpcenter',
  icon: 'Layers',
  tagline: 'KB + AI combined',
  aiChatPosition: 'Embedded + floating widget',
  helpStyle: 'hybrid',
  pages: hybridHelpPages,
  kbCategories: hybridHelpCategories,
  branding: {
    organizationName: 'Help Center',
    brandTagline: 'Answers made easy',
    primaryColor: '173 80% 40%',
    headingFont: 'Inter',
    bodyFont: 'Inter',
    borderRadius: 'md',
    shadowIntensity: 'medium',
  },
  chatSettings: {
    enabled: true,
    aiProvider: 'openai',
    widgetEnabled: true,
    widgetPosition: 'bottom-right',
    welcomeMessage: 'Hi! Search our help center or ask me anything.',
    systemPrompt: 'You are a helpful support assistant. Help users find answers in the knowledge base or answer their questions directly. Be friendly and helpful.',
    suggestedPrompts: [
      'How do I get started?',
      'What are your pricing plans?',
      'How can I contact support?',
    ],
  },
  footerSettings: {
    email: 'support@example.com',
    phone: '+1 (555) 123-4567',
    showBrand: true,
    showQuickLinks: true,
    showContact: true,
    showHours: true,
    weekdayHours: 'Mon-Fri 9-18',
    weekendHours: 'AI: 24/7',
  },
  seoSettings: {
    siteTitle: 'Help Center',
    titleTemplate: '%s | Help Center',
    defaultDescription: 'Find answers in our knowledge base or chat with AI for instant help.',
    robotsIndex: true,
    robotsFollow: true,
  },
  cookieBannerSettings: {
    enabled: true,
  },
  siteSettings: {
    homepageSlug: 'home',
  },
};

// =====================================================
// HELP CENTER TEMPLATES EXPORT
// =====================================================
export const HELP_CENTER_TEMPLATES: StarterTemplate[] = [
  kbClassicTemplate,
  aiHubTemplate,
  hybridHelpTemplate,
];

// Add help center templates to main export
STARTER_TEMPLATES.push(...HELP_CENTER_TEMPLATES);

// =====================================================
// SERVICEPRO - Service Business Template
// =====================================================
const serviceProPages: TemplatePage[] = [
  {
    title: 'Home',
    slug: 'home',
    isHomePage: true,
    menu_order: 1,
    showInMenu: true,
    meta: {
      description: 'Professional services delivered with excellence',
      showTitle: false,
      titleAlignment: 'center',
    },
    blocks: [
      {
        id: 'hero-1',
        type: 'hero',
        data: {
          title: 'Professional Services You Can Trust',
          subtitle: 'Book online in seconds. Get the care and attention you deserve from our expert team.',
          backgroundType: 'image',
          backgroundImage: 'https://images.unsplash.com/photo-1521791136064-7986c2920216?w=1920',
          heightMode: '70vh',
          contentAlignment: 'center',
          overlayOpacity: 50,
          titleAnimation: 'fade-in',
          primaryButton: { text: 'Book Now', url: '/book' },
          secondaryButton: { text: 'Our Services', url: '/services' },
        },
      },
      {
        id: 'stats-1',
        type: 'stats',
        data: {
          title: 'Why Choose Us',
          stats: [
            { value: '5000+', label: 'Happy Clients', icon: 'Users' },
            { value: '10+', label: 'Years Experience', icon: 'Award' },
            { value: '4.9', label: 'Average Rating', icon: 'Star' },
            { value: '24h', label: 'Response Time', icon: 'Clock' },
          ],
        },
      },
      {
        id: 'features-1',
        type: 'features',
        data: {
          title: 'Our Services',
          subtitle: 'We offer a wide range of professional services tailored to your needs.',
          features: [
            { id: 'f1', icon: 'Sparkles', title: 'Consultation', description: 'Expert advice and guidance for your unique situation.' },
            { id: 'f2', icon: 'Clock', title: 'Flexible Scheduling', description: 'Book appointments that fit your busy lifestyle.' },
            { id: 'f3', icon: 'Shield', title: 'Guaranteed Quality', description: 'We stand behind every service we provide.' },
            { id: 'f4', icon: 'HeadphonesIcon', title: '24/7 Support', description: 'Our team is always here when you need us.' },
          ],
          columns: 4,
          layout: 'grid',
          variant: 'cards',
          iconStyle: 'circle',
        },
      },
      {
        id: 'testimonials-1',
        type: 'testimonials',
        data: {
          title: 'What Our Clients Say',
          testimonials: [
            {
              id: 't1',
              content: 'Exceptional service from start to finish. Booking was easy and the team was incredibly professional.',
              author: 'Emma Wilson',
              role: 'Client',
              rating: 5,
            },
            {
              id: 't2',
              content: 'I\'ve been a regular customer for 3 years. The quality and attention to detail is unmatched.',
              author: 'David Chen',
              role: 'Client',
              rating: 5,
            },
            {
              id: 't3',
              content: 'Finally, a service that respects my time. Easy online booking and they\'re always punctual.',
              author: 'Sarah Johnson',
              role: 'Client',
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
      // MARQUEE - Client logos
      {
        id: 'marquee-clients',
        type: 'marquee',
        data: {
          items: [
            { id: 'm1', text: 'TechCorp', icon: '🏢' },
            { id: 'm2', text: 'StartupX', icon: '🚀' },
            { id: 'm3', text: 'DesignCo', icon: '🎨' },
            { id: 'm4', text: 'MediaHub', icon: '📱' },
            { id: 'm5', text: 'FinanceFirst', icon: '💼' },
            { id: 'm6', text: 'HealthPlus', icon: '🏥' },
          ],
          speed: 'normal',
          direction: 'left',
          pauseOnHover: true,
          variant: 'default',
          separator: '•',
        },
      },
      // PROGRESS - Service quality metrics
      {
        id: 'progress-metrics',
        type: 'progress',
        data: {
          title: 'Our Service Quality',
          subtitle: 'Metrics that matter to our clients',
          items: [
            { id: 'p1', label: 'Customer Satisfaction', value: 98, color: 'hsl(142, 76%, 36%)', icon: 'Heart' },
            { id: 'p2', label: 'On-Time Delivery', value: 95, color: 'hsl(221, 83%, 53%)', icon: 'Clock' },
            { id: 'p3', label: 'Repeat Customers', value: 87, color: 'hsl(262, 83%, 58%)', icon: 'Users' },
            { id: 'p4', label: 'Project Success Rate', value: 92, color: 'hsl(47, 96%, 53%)', icon: 'CheckCircle' },
          ],
          variant: 'default',
          size: 'md',
          showPercentage: true,
          showLabels: true,
          animated: true,
          animationDuration: 2000,
        },
      },
      {
        id: 'cta-1',
        type: 'cta',
        data: {
          title: 'Ready to Get Started?',
          subtitle: 'Book your appointment online in just a few clicks.',
          buttonText: 'Book Now',
          buttonUrl: '/book',
          gradient: true,
        },
      },
    ],
  },
  {
    title: 'Services',
    slug: 'services',
    menu_order: 2,
    showInMenu: true,
    meta: {
      description: 'Explore our range of professional services',
      showTitle: true,
      titleAlignment: 'center',
    },
    blocks: [
      {
        id: 'hero-1',
        type: 'hero',
        data: {
          title: 'Our Services',
          subtitle: 'Professional solutions for every need',
          backgroundType: 'color',
          heightMode: 'auto',
          contentAlignment: 'center',
        },
      },
      {
        id: 'features-1',
        type: 'features',
        data: {
          title: '',
          features: [
            { id: 'f1', icon: 'Sparkles', title: 'Basic Consultation', description: 'Perfect for first-time clients. 30-minute session to understand your needs and recommend solutions.' },
            { id: 'f2', icon: 'Star', title: 'Premium Service', description: 'Our most popular option. 60-minute comprehensive session with personalized recommendations.' },
            { id: 'f3', icon: 'Crown', title: 'VIP Package', description: 'The complete experience. 90-minute session with priority scheduling and follow-up support.' },
          ],
          columns: 3,
          layout: 'grid',
          variant: 'cards',
          iconStyle: 'circle',
        },
      },
      {
        id: 'pricing-1',
        type: 'pricing',
        data: {
          tiers: [
            {
              id: 'tier-basic',
              name: 'Basic',
              price: '$49',
              period: 'per session',
              description: '30-minute consultation',
              features: ['Initial assessment', 'Basic recommendations', 'Email follow-up'],
              buttonText: 'Book Basic',
              buttonUrl: '/book',
            },
            {
              id: 'tier-premium',
              name: 'Premium',
              price: '$99',
              period: 'per session',
              description: '60-minute comprehensive',
              features: ['Full assessment', 'Personalized plan', 'Priority scheduling', '7-day support'],
              buttonText: 'Book Premium',
              buttonUrl: '/book',
              highlighted: true,
              badge: 'Most Popular',
            },
            {
              id: 'tier-vip',
              name: 'VIP',
              price: '$199',
              period: 'per session',
              description: '90-minute VIP experience',
              features: ['Everything in Premium', 'Extended session', 'Same-day booking', '30-day support', 'Priority rebooking'],
              buttonText: 'Book VIP',
              buttonUrl: '/book',
            },
          ],
          columns: 3,
          variant: 'cards',
        },
      },
      {
        id: 'cta-1',
        type: 'cta',
        data: {
          title: 'Not Sure Which Service?',
          subtitle: 'Contact us for a free consultation to find the right fit.',
          buttonText: 'Get in Touch',
          buttonUrl: '/contact',
          gradient: false,
        },
      },
    ],
  },
  {
    title: 'Book',
    slug: 'book',
    menu_order: 3,
    showInMenu: true,
    meta: {
      description: 'Book your appointment online',
      showTitle: false,
      titleAlignment: 'center',
    },
    blocks: [
      {
        id: 'hero-1',
        type: 'hero',
        data: {
          title: 'Book Your Appointment',
          subtitle: 'Choose a service and select a time that works for you',
          backgroundType: 'color',
          heightMode: 'auto',
          contentAlignment: 'center',
        },
      },
      {
        id: 'booking-1',
        type: 'booking',
        data: {
          title: '',
          mode: 'smart',
          variant: 'card',
          showPhoneField: true,
          submitButtonText: 'Confirm Booking',
          successMessage: 'Your booking is confirmed! We\'ll send you a confirmation email shortly.',
          triggerWebhook: false,
        },
      },
      {
        id: 'text-1',
        type: 'text',
        data: {
          content: {
            type: 'doc',
            content: [
              { type: 'heading', attrs: { level: 3 }, content: [{ type: 'text', text: 'Booking Policy' }] },
              { type: 'paragraph', content: [{ type: 'text', text: 'Please arrive 10 minutes before your scheduled appointment. Cancellations must be made at least 24 hours in advance to avoid a cancellation fee. For any questions about your booking, please contact us.' }] },
            ],
          },
          alignment: 'center',
        },
      },
    ],
  },
  {
    title: 'About',
    slug: 'about',
    menu_order: 4,
    showInMenu: true,
    meta: {
      description: 'Learn about our team and mission',
      showTitle: true,
      titleAlignment: 'center',
    },
    blocks: [
      {
        id: 'hero-1',
        type: 'hero',
        data: {
          title: 'About Us',
          subtitle: 'Dedicated professionals committed to your success',
          backgroundType: 'color',
          heightMode: 'auto',
          contentAlignment: 'center',
        },
      },
      {
        id: 'two-col-1',
        type: 'two-column',
        data: {
          content: {
            type: 'doc',
            content: [
              { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Our Story' }] },
              { type: 'paragraph', content: [{ type: 'text', text: 'Founded with a simple mission: to provide exceptional service that puts clients first. Over the years, we\'ve grown from a small practice to a trusted name in professional services.' }] },
              { type: 'paragraph', content: [{ type: 'text', text: 'What sets us apart is our commitment to quality and our personal approach. Every client is unique, and we take the time to understand your specific needs.' }] },
            ],
          },
          imageSrc: 'https://images.unsplash.com/photo-1522071820081-009f0129c71c?w=800',
          imageAlt: 'Our team',
          imagePosition: 'right',
        },
      },
      {
        id: 'team-1',
        type: 'team',
        data: {
          title: 'Meet Our Team',
          members: [
            { id: 'm1', name: 'Alex Thompson', role: 'Founder & Lead', bio: '15+ years of experience in the industry.' },
            { id: 'm2', name: 'Sarah Mitchell', role: 'Senior Specialist', bio: 'Certified expert with a passion for excellence.' },
            { id: 'm3', name: 'James Rodriguez', role: 'Client Relations', bio: 'Dedicated to ensuring every client has a great experience.' },
          ],
          columns: 3,
          showBio: true,
          showSocial: false,
          variant: 'cards',
        },
      },
    ],
  },
  {
    title: 'Contact',
    slug: 'contact',
    menu_order: 5,
    showInMenu: true,
    meta: {
      description: 'Get in touch with our team',
      showTitle: true,
      titleAlignment: 'center',
    },
    blocks: [
      {
        id: 'hero-1',
        type: 'hero',
        data: {
          title: 'Contact Us',
          subtitle: 'We\'d love to hear from you',
          backgroundType: 'color',
          heightMode: 'auto',
          contentAlignment: 'center',
        },
      },
      {
        id: 'two-col-1',
        type: 'two-column',
        data: {
          content: {
            type: 'doc',
            content: [
              { type: 'heading', attrs: { level: 3 }, content: [{ type: 'text', text: 'Get in Touch' }] },
              { type: 'paragraph', content: [{ type: 'text', text: 'Have a question? Want to learn more about our services? We\'re here to help.' }] },
              { type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'bold' }], text: 'Email: ' }, { type: 'text', text: 'hello@servicepro.com' }] },
              { type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'bold' }], text: 'Phone: ' }, { type: 'text', text: '+1 (555) 123-4567' }] },
              { type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'bold' }], text: 'Hours: ' }, { type: 'text', text: 'Mon-Fri 9am-6pm' }] },
            ],
          },
          imageSrc: '',
          imageAlt: '',
          imagePosition: 'right',
        },
      },
      {
        id: 'form-1',
        type: 'form',
        data: {
          title: 'Send us a Message',
          fields: [
            { id: 'name', type: 'text', label: 'Name', placeholder: 'Your name', required: true, width: 'half' },
            { id: 'email', type: 'email', label: 'Email', placeholder: 'you@example.com', required: true, width: 'half' },
            { id: 'phone', type: 'phone', label: 'Phone', placeholder: 'Your phone number', required: false, width: 'full' },
            { id: 'message', type: 'textarea', label: 'Message', placeholder: 'How can we help you?', required: true, width: 'full' },
          ],
          submitButtonText: 'Send Message',
          successMessage: 'Thanks for reaching out! We\'ll get back to you within 24 hours.',
          variant: 'card',
        },
      },
      {
        id: 'contact-1',
        type: 'contact',
        data: {
          title: 'Visit Us',
          address: '123 Main Street, Suite 100',
          email: 'hello@servicepro.com',
          phone: '+1 (555) 123-4567',
          hours: [
            { day: 'Monday - Friday', time: '9:00 AM - 6:00 PM' },
            { day: 'Saturday', time: '10:00 AM - 4:00 PM' },
            { day: 'Sunday', time: 'Closed' },
          ],
        },
      },
    ],
  },
];

const serviceProTemplate: StarterTemplate = {
  id: 'service-pro',
  name: 'ServicePro',
  description: 'Modern template for service businesses. Features smart booking with real-time availability, service showcase, and online scheduling.',
  category: 'startup',
  icon: 'CalendarCheck',
  tagline: 'Perfect for service businesses',
  aiChatPosition: 'Widget for quick questions',
  helpStyle: 'none',
  pages: serviceProPages,
  branding: {
    organizationName: 'ServicePro',
    brandTagline: 'Professional Services You Can Trust',
    primaryColor: '220 70% 50%',
    headingFont: 'Plus Jakarta Sans',
    bodyFont: 'Inter',
    borderRadius: 'md',
    shadowIntensity: 'medium',
  },
  chatSettings: {
    enabled: true,
    aiProvider: 'openai',
    widgetEnabled: true,
    widgetPosition: 'bottom-right',
    welcomeMessage: 'Hi! How can we help you today?',
    systemPrompt: 'You are a helpful assistant for a service business. Help users book appointments, answer questions about services, and provide information. Be friendly and professional.',
    suggestedPrompts: [
      'What services do you offer?',
      'How do I book an appointment?',
      'What are your hours?',
    ],
  },
  footerSettings: {
    email: 'hello@servicepro.com',
    phone: '+1 (555) 123-4567',
    address: '123 Main Street, Suite 100',
    weekdayHours: 'Mon-Fri 9-18',
    weekendHours: 'Sat 10-16',
    showHours: true,
    showQuickLinks: true,
    showContact: true,
    legalLinks: [
      { id: 'privacy', label: 'Privacy Policy', url: '/privacy-policy', enabled: true },
      { id: 'terms', label: 'Terms of Service', url: '/terms-of-service', enabled: true },
    ],
  },
  seoSettings: {
    siteTitle: 'ServicePro',
    titleTemplate: '%s | ServicePro',
    defaultDescription: 'Professional services delivered with excellence. Book online in seconds.',
    robotsIndex: true,
    robotsFollow: true,
  },
  cookieBannerSettings: {
    enabled: true,
  },
  siteSettings: {
    homepageSlug: 'home',
  },
};

// Add ServicePro template to main export
STARTER_TEMPLATES.push(serviceProTemplate);

// =====================================================
// DIGITAL SHOP - E-commerce Template
// =====================================================

const digitalShopPages: TemplatePage[] = [
  // ===== HOME PAGE =====
  {
    title: 'Home',
    slug: 'home',
    isHomePage: true,
    menu_order: 1,
    showInMenu: true,
    meta: {
      description: 'Premium digital products and online courses. Instant delivery, lifetime access.',
      showTitle: false,
      titleAlignment: 'center',
    },
    blocks: [
      // HERO - Shop hero
      {
        id: 'hero-shop',
        type: 'hero',
        data: {
          title: 'Premium Digital Products',
          subtitle: 'Courses, templates, and tools to grow your business. Instant delivery, lifetime access.',
          backgroundType: 'gradient',
          heightMode: 'auto',
          contentAlignment: 'center',
          overlayOpacity: 0,
          primaryButton: { text: 'Browse Products', url: '#products' },
          secondaryButton: { text: 'View Cart', url: '/cart' },
        },
      },
      // STATS - Social proof
      {
        id: 'stats-proof',
        type: 'stats',
        data: {
          title: '',
          items: [
            { id: 'stat-1', value: '10,000+', label: 'Happy Customers' },
            { id: 'stat-2', value: '50+', label: 'Digital Products' },
            { id: 'stat-3', value: '4.9/5', label: 'Average Rating' },
            { id: 'stat-4', value: '24/7', label: 'Instant Delivery' },
          ],
          columns: 4,
          variant: 'minimal',
        },
      },
      // PRODUCTS - Featured products
      {
        id: 'products-featured',
        type: 'products',
        data: {
          title: 'Featured Products',
          subtitle: 'Our most popular digital products and courses',
          productType: 'featured',
          columns: 3,
          showFilters: false,
          showSearch: false,
          variant: 'cards',
        },
      },
      // FEATURES - Why buy from us
      {
        id: 'features-benefits',
        type: 'features',
        data: {
          title: 'Why Choose Us',
          features: [
            {
              id: 'benefit-1',
              icon: 'Zap',
              title: 'Instant Delivery',
              description: 'Get access immediately after purchase. No waiting, no shipping.',
            },
            {
              id: 'benefit-2',
              icon: 'Shield',
              title: 'Secure Payments',
              description: 'Powered by Stripe. Your payment information is always safe.',
            },
            {
              id: 'benefit-3',
              icon: 'RefreshCw',
              title: 'Lifetime Updates',
              description: 'Get all future updates and improvements for free.',
            },
            {
              id: 'benefit-4',
              icon: 'MessageSquare',
              title: 'Expert Support',
              description: 'Questions? Our team is here to help via email or chat.',
            },
          ],
          columns: 4,
          layout: 'grid',
          variant: 'minimal',
          iconStyle: 'circle',
        },
      },
      // PRODUCTS - All products
      {
        id: 'products-all',
        type: 'products',
        data: {
          title: 'All Products',
          subtitle: 'Browse our complete collection',
          productType: 'all',
          columns: 3,
          showFilters: true,
          showSearch: true,
          variant: 'cards',
        },
      },
      // TESTIMONIALS - Customer reviews
      {
        id: 'testimonials-reviews',
        type: 'testimonials',
        data: {
          title: 'What Our Customers Say',
          testimonials: [
            {
              id: 'test-1',
              content: 'Best investment I made this year. The quality is outstanding and the support is incredible.',
              author: 'Sarah Johnson',
              role: 'Entrepreneur',
              rating: 5,
            },
            {
              id: 'test-2',
              content: 'Instant delivery, lifetime access, and regular updates. Exactly what I was looking for.',
              author: 'Michael Chen',
              role: 'Designer',
              rating: 5,
            },
            {
              id: 'test-3',
              content: 'The templates saved me weeks of work. Worth every penny!',
              author: 'Emma Davis',
              role: 'Developer',
              rating: 5,
            },
          ],
          layout: 'grid',
          columns: 3,
          showRating: true,
          showAvatar: false,
          variant: 'cards',
        },
      },
      // FAQ - Common questions
      {
        id: 'faq-shop',
        type: 'accordion',
        data: {
          title: 'Frequently Asked Questions',
          items: [
            {
              id: 'faq-1',
              title: 'How does delivery work?',
              content: 'After purchase, you\'ll receive an email with download links and access instructions. Everything is instant - no waiting!',
            },
            {
              id: 'faq-2',
              title: 'What payment methods do you accept?',
              content: 'We accept all major credit cards (Visa, Mastercard, American Express) via Stripe. All payments are secure and encrypted.',
            },
            {
              id: 'faq-3',
              title: 'Do you offer refunds?',
              content: 'Yes! We offer a 30-day money-back guarantee. If you\'re not satisfied, just email us for a full refund.',
            },
            {
              id: 'faq-4',
              title: 'Can I use these products commercially?',
              content: 'Yes! All our products come with a commercial license. Use them in client projects, sell websites built with them, etc.',
            },
            {
              id: 'faq-5',
              title: 'Do I get updates?',
              content: 'Absolutely! All purchases include lifetime updates. When we improve a product, you get the new version for free.',
            },
          ],
          variant: 'default',
        },
      },
      // CTA - Final push
      {
        id: 'cta-shop',
        type: 'cta',
        data: {
          title: 'Ready to Get Started?',
          subtitle: 'Browse our products and find the perfect solution for your needs.',
          buttonText: 'Browse Products',
          buttonUrl: '#products',
          gradient: true,
        },
      },
    ],
  },
  // ===== CART PAGE =====
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
          emptyMessage: 'Your cart is empty. Browse our products to get started!',
          checkoutButtonText: 'Proceed to Checkout',
          continueShoppingText: 'Continue Shopping',
          continueShoppingUrl: '/',
        },
      },
    ],
  },
  // ===== ABOUT PAGE =====
  {
    title: 'About',
    slug: 'about',
    menu_order: 3,
    showInMenu: true,
    meta: {
      description: 'Learn about our mission and values',
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
              { type: 'paragraph', content: [{ type: 'text', text: 'We create premium digital products that help entrepreneurs and creators build better businesses. Every product is crafted with care, tested thoroughly, and supported by our expert team.' }] },
              { type: 'heading', attrs: { level: 3 }, content: [{ type: 'text', text: 'Our Mission' }] },
              { type: 'paragraph', content: [{ type: 'text', text: 'To provide high-quality digital products that save time, increase productivity, and help our customers succeed.' }] },
              { type: 'heading', attrs: { level: 3 }, content: [{ type: 'text', text: 'Why Choose Us' }] },
              { type: 'bulletList', content: [
                { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'bold' }], text: 'Quality First: ' }, { type: 'text', text: 'Every product is meticulously crafted and tested' }] }] },
                { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'bold' }], text: 'Instant Delivery: ' }, { type: 'text', text: 'Get access immediately after purchase' }] }] },
                { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'bold' }], text: 'Lifetime Updates: ' }, { type: 'text', text: 'All future improvements included free' }] }] },
                { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'bold' }], text: 'Expert Support: ' }, { type: 'text', text: 'Our team is here to help you succeed' }] }] },
              ] },
            ],
          },
        },
      },
    ],
  },
  // ===== CONTACT PAGE =====
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

const digitalShopTemplate: StarterTemplate = {
  id: 'digital-shop',
  name: 'Digital Shop',
  description: 'E-commerce template for selling digital products. Features product showcase, shopping cart, Stripe checkout, and order management.',
  category: 'platform',
  icon: 'ShoppingBag',
  tagline: 'Perfect for digital product stores',
  aiChatPosition: 'Widget for customer support',
  helpStyle: 'none',
  pages: digitalShopPages,
  branding: {
    organizationName: 'Digital Shop',
    brandTagline: 'Premium Digital Products',
    primaryColor: '262 80% 50%',
    headingFont: 'Plus Jakarta Sans',
    bodyFont: 'Inter',
    borderRadius: 'lg',
    shadowIntensity: 'medium',
  },
  chatSettings: {
    enabled: true,
    aiProvider: 'openai',
    widgetEnabled: true,
    widgetPosition: 'bottom-right',
    welcomeMessage: 'Hi! Need help finding the perfect product?',
    systemPrompt: 'You are a helpful assistant for a digital products store. Help customers find products, answer questions about delivery, licensing, and refunds. Be friendly and helpful.',
    suggestedPrompts: [
      'What products do you offer?',
      'How does delivery work?',
      'Do you offer refunds?',
    ],
  },
  footerSettings: {
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
    defaultDescription: 'Premium digital products and online courses. Instant delivery, lifetime access.',
    robotsIndex: true,
    robotsFollow: true,
  },
  cookieBannerSettings: {
    enabled: true,
  },
  siteSettings: {
    homepageSlug: 'home',
  },
};

// Add Digital Shop template to main export
STARTER_TEMPLATES.push(digitalShopTemplate);
