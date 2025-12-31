import { ContentBlock, PageMeta, FooterBlockData } from '@/types/cms';
import { BrandingSettings, ChatSettings, SeoSettings, CookieBannerSettings } from '@/hooks/useSiteSettings';
import { 
  launchpadBlogPosts, 
  trustcorpBlogPosts, 
  securehealthBlogPosts, 
  momentumBlogPosts, 
  pezcmsBlogPosts 
} from './template-blog-posts';

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
  category: 'startup' | 'enterprise' | 'compliance' | 'platform';
  icon: string;
  tagline: string;
  aiChatPosition: string;
  
  // Multi-page support
  pages: TemplatePage[];
  
  // Blog posts (optional)
  blogPosts?: TemplateBlogPost[];
  
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
    slug: 'hem',
    isHomePage: true,
    menu_order: 1,
    showInMenu: true,
    meta: {
      description: 'Launch your vision with our cutting-edge platform',
      showTitle: false,
      titleAlignment: 'center',
    },
    blocks: [
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
          primaryButton: { text: 'Get Started Free', url: '/kontakt' },
          secondaryButton: { text: 'Learn More', url: '/produkt' },
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
      {
        id: 'cta-1',
        type: 'cta',
        data: {
          title: 'Ready to Launch?',
          subtitle: 'Join thousands of teams shipping faster with our platform.',
          buttonText: 'Start Building Today',
          buttonUrl: '/kontakt',
          gradient: true,
        },
      },
    ],
  },
  {
    title: 'Product',
    slug: 'produkt',
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
          buttonUrl: '/kontakt',
          gradient: true,
        },
      },
    ],
  },
  {
    title: 'Pricing',
    slug: 'priser',
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
              buttonUrl: '/kontakt',
            },
            {
              id: 'tier-pro',
              name: 'Pro',
              price: '$49',
              period: '/month',
              description: 'For growing teams who need more power.',
              features: ['Unlimited projects', '100,000 API calls/month', 'Priority support', 'Advanced analytics', 'Team collaboration', 'Custom domains'],
              buttonText: 'Start Free Trial',
              buttonUrl: '/kontakt',
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
              buttonUrl: '/kontakt',
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
          buttonUrl: '/kontakt',
          gradient: true,
        },
      },
    ],
  },
  {
    title: 'Contact',
    slug: 'kontakt',
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
          mode: 'form',
          submitButtonText: 'Request Demo',
          successMessage: 'Thanks! We\'ll be in touch within 24 hours.',
          showPhoneField: true,
          showDatePicker: false,
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
];

// =====================================================
// TRUSTCORP - Enterprise Template (5 pages)
// =====================================================
const trustcorpPages: TemplatePage[] = [
  {
    title: 'Home',
    slug: 'hem',
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
          backgroundType: 'image',
          backgroundImage: 'https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?w=1920',
          heightMode: '80vh',
          contentAlignment: 'center',
          overlayOpacity: 65,
          parallaxEffect: true,
          titleAnimation: 'fade-in',
          primaryButton: { text: 'Request Demo', url: '/kontakt' },
          secondaryButton: { text: 'Our Services', url: '/tjanster' },
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
            { icon: 'Briefcase', title: 'Consulting', description: 'Strategic advisory services', url: '/tjanster' },
            { icon: 'Server', title: 'Technology', description: 'Enterprise infrastructure', url: '/tjanster' },
            { icon: 'BarChart3', title: 'Analytics', description: 'Data-driven insights', url: '/tjanster' },
            { icon: 'HeadphonesIcon', title: 'Support', description: '24/7 dedicated assistance', url: '/kontakt' },
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
      {
        id: 'cta-1',
        type: 'cta',
        data: {
          title: 'Ready to Transform?',
          subtitle: 'Let\'s discuss how we can help your organization.',
          buttonText: 'Schedule Consultation',
          buttonUrl: '/kontakt',
          gradient: false,
        },
      },
    ],
  },
  {
    title: 'Services',
    slug: 'tjanster',
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
          buttonUrl: '/kontakt',
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
            { title: 'GlobalBank: 40% Cost Reduction', excerpt: 'How we helped GlobalBank reduce operational costs while improving customer satisfaction.', image: 'https://images.unsplash.com/photo-1554224155-8d04cb21cd6c?w=600', url: '/kontakt' },
            { title: 'TechCorp: AI Transformation', excerpt: 'Deploying private AI across 30 global locations while maintaining data sovereignty.', image: 'https://images.unsplash.com/photo-1485827404703-89b55fcc595e?w=600', url: '/kontakt' },
            { title: 'HealthNet: HIPAA Compliance', excerpt: 'Modernizing healthcare IT infrastructure with full regulatory compliance.', image: 'https://images.unsplash.com/photo-1576091160399-112ba8d25d1d?w=600', url: '/kontakt' },
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
    slug: 'om-oss',
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
          buttonUrl: '/kontakt',
          gradient: false,
        },
      },
    ],
  },
  {
    title: 'Contact',
    slug: 'kontakt',
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
];

// =====================================================
// SECUREHEALTH - Compliance Template (5 pages)
// =====================================================
const securehealthPages: TemplatePage[] = [
  {
    title: 'Home',
    slug: 'hem',
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
          primaryButton: { text: 'Book Appointment', url: '/boka' },
          secondaryButton: { text: 'Our Services', url: '/tjanster' },
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
            { icon: 'Calendar', title: 'Book Appointment', description: 'Schedule your visit online', url: '/boka' },
            { icon: 'MapPin', title: 'Find Us', description: 'Locations & directions', url: '/om-oss' },
            { icon: 'Phone', title: 'Urgent Care', description: '24/7 medical helpline', url: '/kontakt' },
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
          variant: 'cards',
          autoplay: true,
          autoplaySpeed: 5,
        },
      },
      {
        id: 'cta-1',
        type: 'cta',
        data: {
          title: 'Your Health Journey Starts Here',
          subtitle: 'Experience healthcare that puts your privacy first.',
          buttonText: 'Book Appointment',
          buttonUrl: '/boka',
          gradient: false,
        },
      },
    ],
  },
  {
    title: 'Services',
    slug: 'tjanster',
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
            { icon: 'HeartPulse', title: 'Primary Care', description: 'General health checkups and preventive care', url: '/tjanster' },
            { icon: 'Stethoscope', title: 'Specialists', description: 'Expert care across all medical fields', url: '/tjanster' },
            { icon: 'Baby', title: 'Pediatrics', description: 'Caring for children of all ages', url: '/tjanster' },
            { icon: 'Brain', title: 'Mental Health', description: 'Private counseling and therapy', url: '/tjanster' },
            { icon: 'Activity', title: 'Diagnostics', description: 'Advanced testing and imaging', url: '/tjanster' },
            { icon: 'Pill', title: 'Pharmacy', description: 'On-site prescription services', url: '/kontakt' },
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
          buttonUrl: '/boka',
          gradient: false,
        },
      },
    ],
  },
  {
    title: 'About Us',
    slug: 'om-oss',
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
    slug: 'resurser',
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
    slug: 'boka',
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
          title: 'Request Your Appointment',
          description: 'Select a service and provide your details. We\'ll contact you within 24 hours to confirm.',
          mode: 'form',
          showServiceSelector: true,
          services: [
            { id: 'srv-1', name: 'Primary Care Visit', duration: '30 min', description: 'General checkup or health concerns' },
            { id: 'srv-2', name: 'Specialist Consultation', duration: '45 min', description: 'Cardiology, Dermatology, etc.' },
            { id: 'srv-3', name: 'Pediatric Appointment', duration: '30 min', description: 'Care for children and adolescents' },
            { id: 'srv-4', name: 'Mental Health Session', duration: '60 min', description: 'Counseling or therapy session' },
            { id: 'srv-5', name: 'Diagnostic Testing', duration: '15-60 min', description: 'Lab work, imaging, or screenings' },
          ],
          submitButtonText: 'Request Appointment',
          successMessage: 'Thank you! We\'ll call you within 24 hours to confirm your appointment time.',
          showPhoneField: true,
          showDatePicker: true,
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
    slug: 'kontakt',
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
          title: 'Request an Appointment',
          description: 'Fill out the form below and we\'ll contact you to confirm your appointment.',
          mode: 'form',
          submitButtonText: 'Request Appointment',
          successMessage: 'Thank you! We\'ll call you within 24 hours to confirm your appointment.',
          showPhoneField: true,
          showDatePicker: false,
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
];

// =====================================================
// MOMENTUM - Single-Page YC-Style Template
// =====================================================
const momentumPages: TemplatePage[] = [
  {
    title: 'Home',
    slug: 'hem',
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
      aiProvider: 'lovable',
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
      homepageSlug: 'hem',
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
        { id: 'privacy', label: 'Privacy', url: '/privacy', enabled: true },
        { id: 'terms', label: 'Terms', url: '/terms', enabled: true },
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
      homepageSlug: 'hem',
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
      homepageSlug: 'hem',
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
      homepageSlug: 'hem',
    },
  },
  // =====================================================
  // PEZCMS PLATFORM - SaaS Template (Dogfooding)
  // =====================================================
  {
    id: 'pezcms-platform',
    name: 'PezCMS Platform',
    description: 'Complete SaaS landing page template showcasing all CMS features. Built for platform businesses with pricing, comparisons, and feature highlights.',
    category: 'platform',
    icon: 'Blocks',
    tagline: 'The ultimate dogfood - built with PezCMS, for PezCMS',
    aiChatPosition: 'Embedded assistant for product questions',
    blogPosts: pezcmsBlogPosts,
    pages: [
      // ===== HOME PAGE =====
      {
        title: 'Home',
        slug: 'hem',
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
              secondaryButton: { text: 'Self-Host Free', url: 'https://github.com/pezcms/pezcms' },
            },
          },
          // FEATURES - Three pillars (Head + PezCMS + Headless)
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
                  title: 'PEZCMS',
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
              columns: 3,
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
              columns: 4,
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
                  content: 'The private LLM support was the dealbreaker for us. We needed AI features but couldn\'t send patient data to external services. PezCMS delivered.',
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
              subtitle: 'See why teams choose PezCMS over traditional solutions.',
              products: [
                { id: 'pez', name: 'PezCMS', highlighted: true },
                { id: 'webflow', name: 'Webflow' },
                { id: 'contentful', name: 'Contentful' },
                { id: 'wordpress', name: 'WordPress' },
              ],
              features: [
                { id: 'f1', name: 'Visual Builder', values: [true, true, false, true] },
                { id: 'f2', name: 'Headless API', values: [true, false, true, false] },
                { id: 'f3', name: 'AI Chat Assistant', values: [true, false, false, false] },
                { id: 'f4', name: 'Private LLM Support', values: [true, false, false, false] },
                { id: 'f5', name: 'Built-in Blog', values: [true, true, false, true] },
                { id: 'f6', name: 'Newsletter Module', values: [true, false, false, false] },
                { id: 'f7', name: 'CRM Integration', values: [true, false, false, false] },
                { id: 'f8', name: 'Self-Hostable', values: [true, false, false, true] },
                { id: 'f9', name: 'GDPR Compliant', values: [true, true, true, 'Depends'] },
                { id: 'f10', name: 'Open Source', values: [true, false, false, true] },
              ],
              variant: 'striped',
              showPrices: false,
              showButtons: false,
              stickyHeader: true,
            },
          },
          // PRICING - Deployment options
          {
            id: 'pricing-main',
            type: 'pricing',
            data: {
              title: 'Your Infrastructure, Your Rules',
              subtitle: 'Choose how you want to run PezCMS. Same features, your choice of control.',
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
                  buttonUrl: 'https://github.com/pezcms/pezcms',
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
                  buttonUrl: '/kontakt',
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
                  buttonUrl: '/kontakt',
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
              subtitle: 'See how fast you can go live with PezCMS compared to alternatives.',
              steps: [
                {
                  id: 'tl-1',
                  title: 'PezCMS',
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
        slug: 'funktioner',
        menu_order: 2,
        showInMenu: true,
        meta: {
          description: 'Explore all PezCMS features - from visual editing to headless API, AI tools to CRM integration.',
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
                { id: 'link-github', icon: 'Github', title: 'GitHub', description: 'Source code and issues', url: 'https://github.com/pezcms/pezcms' },
                { id: 'link-discord', icon: 'MessageCircle', title: 'Community', description: 'Discord support', url: 'https://discord.gg/pezcms' },
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
              secondaryButtonUrl: '/priser',
              gradient: true,
            },
          },
        ],
      },
      // ===== PRICING PAGE =====
      {
        title: 'Pricing',
        slug: 'priser',
        menu_order: 3,
        showInMenu: true,
        meta: {
          description: 'PezCMS pricing - Self-hosted free forever, or managed cloud starting at €49/month.',
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
                  buttonUrl: 'https://github.com/pezcms/pezcms',
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
                  buttonUrl: '/kontakt',
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
                  buttonUrl: '/kontakt',
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
                    content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Yes! PezCMS is open source under the MIT license. You can run it on your own servers indefinitely without any licensing fees. The only costs are your own hosting and infrastructure.' }] }],
                  },
                },
                {
                  question: 'What\'s included in managed cloud?',
                  answer: {
                    type: 'doc',
                    content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Everything. We handle server management, updates, security patches, backups, SSL certificates, and CDN distribution. You get a fully managed PezCMS instance that\'s always up-to-date.' }] }],
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
      // ===== CONTACT PAGE =====
      {
        title: 'Contact',
        slug: 'kontakt',
        menu_order: 4,
        showInMenu: true,
        meta: {
          description: 'Get in touch with the PezCMS team - we\'re here to help with questions, demos, and enterprise inquiries.',
          showTitle: true,
          titleAlignment: 'center',
        },
        blocks: [
          {
            id: 'hero-contact',
            type: 'hero',
            data: {
              title: 'Let\'s Talk',
              subtitle: 'Questions about PezCMS? Want a personalized demo? We\'re here to help.',
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
              description: 'See PezCMS in action with a personalized walkthrough tailored to your needs.',
              mode: 'form',
              submitButtonText: 'Request Demo',
              successMessage: 'Thank you! We\'ll be in touch within 24 hours to schedule your demo.',
              showPhoneField: true,
              showDatePicker: false,
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
              initialPrompt: 'Hi! I can answer questions about PezCMS features, pricing, and deployment options. What would you like to know?',
            },
          },
          {
            id: 'contact-info',
            type: 'contact',
            data: {
              title: 'Other Ways to Reach Us',
              email: 'hello@pezcms.com',
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
          description: 'PezCMS developer documentation - API reference, self-hosting guide, webhooks, and integration resources.',
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
              subtitle: 'Everything you need to integrate, customize, and deploy PezCMS.',
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
                  { type: 'paragraph', content: [{ type: 'text', text: 'PezCMS provides a complete REST API for accessing all content programmatically. Use it to build custom frontends, mobile apps, or integrate with other services.' }] },
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
                  { type: 'paragraph', content: [{ type: 'text', text: 'PezCMS is fully self-hostable. Run it on your own servers for complete control over your data and infrastructure.' }] },
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
                  { type: 'codeBlock', attrs: { language: 'bash' }, content: [{ type: 'text', text: '# Clone the repository\ngit clone https://github.com/pezcms/pezcms\ncd pezcms\n\n# Install dependencies\nnpm install\n\n# Configure environment\ncp .env.example .env\n# Edit .env with your database URL\n\n# Run migrations\nnpm run db:migrate\n\n# Start the server\nnpm run start' }] },
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
                { id: 'deploy-docker', icon: 'Container', title: 'Docker', description: 'Official Docker image for containerized deployments. Works with Docker Compose, Kubernetes, or any container platform.', url: 'https://hub.docker.com/r/pezcms/pezcms' },
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
                      { type: 'paragraph', content: [{ type: 'text', text: 'Yes! PezCMS works with any PostgreSQL 14+ database. You can use a managed service like Supabase, Neon, or AWS RDS, or run your own PostgreSQL instance.' }] },
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
                { id: 'mig-webflow', icon: 'Layout', title: 'Webflow', description: 'Convert Webflow pages to PezCMS blocks. Styles are mapped to our design system.' },
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
                { id: 'res-github', icon: 'Github', title: 'GitHub Repository', description: 'Source code, issues, and discussions', url: 'https://github.com/pezcms/pezcms' },
                { id: 'res-discord', icon: 'MessageCircle', title: 'Discord Community', description: 'Get help from the community', url: 'https://discord.gg/pezcms' },
                { id: 'res-changelog', icon: 'History', title: 'Changelog', description: 'See what is new in each release', url: 'https://github.com/pezcms/pezcms/releases' },
                { id: 'res-roadmap', icon: 'Map', title: 'Roadmap', description: 'Upcoming features and priorities', url: 'https://github.com/pezcms/pezcms/projects' },
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
              secondaryButtonUrl: 'https://github.com/pezcms/pezcms',
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
          description: 'PezCMS Privacy Policy - How we collect, use, and protect your personal data.',
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
                  { type: 'paragraph', content: [{ type: 'text', text: 'PezCMS AB ("we", "us", or "our") is committed to protecting your privacy. This policy describes how we collect, use, and protect your personal information when you use our website and services.' }] },
                  { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Data Controller' }] },
                  { type: 'paragraph', content: [{ type: 'text', text: 'PezCMS AB is the data controller for the processing of your personal data. Contact us at privacy@pezcms.com for any questions.' }] },
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
      // ===== TERMS OF SERVICE =====
      {
        title: 'Terms of Service',
        slug: 'terms-of-service',
        menu_order: 100,
        showInMenu: false,
        meta: {
          description: 'PezCMS Terms of Service - Terms and conditions for using our platform.',
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
                  { type: 'paragraph', content: [{ type: 'text', text: 'By accessing or using PezCMS, you agree to be bound by these Terms of Service. If you disagree with any part of these terms, you may not access our services.' }] },
                  { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Use of Service' }] },
                  { type: 'paragraph', content: [{ type: 'text', text: 'You may use our services only for lawful purposes and in accordance with these Terms. You agree not to use our services in any way that violates applicable laws or regulations.' }] },
                  { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Open Source License' }] },
                  { type: 'paragraph', content: [{ type: 'text', text: 'PezCMS is open source software licensed under the MIT License. You are free to use, modify, and distribute the software according to the license terms.' }] },
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
      organizationName: 'PezCMS',
      brandTagline: 'Head + Headless CMS',
      primaryColor: '162 63% 41%',
      headingFont: 'Inter',
      bodyFont: 'Inter',
      borderRadius: 'lg',
      shadowIntensity: 'medium',
    },
    chatSettings: {
      enabled: true,
      aiProvider: 'lovable',
      widgetEnabled: true,
      widgetPosition: 'bottom-right',
      blockEnabled: true,
      welcomeMessage: 'Hi! I can answer questions about PezCMS. What would you like to know?',
      systemPrompt: 'You are the PezCMS assistant. Help users understand the product, features, and pricing. Be helpful, concise, and friendly. PezCMS is a complete CMS with both traditional website features and headless API capabilities.',
      suggestedPrompts: [
        'What is PezCMS?',
        'How much does it cost?',
        'Can I self-host PezCMS?',
        'Does it support headless API?',
      ],
    },
    footerSettings: {
      email: 'hello@pezcms.com',
      phone: '+46 70 123 45 67',
      address: 'Stockholm, Sweden',
      postalCode: '',
      weekdayHours: 'Mon-Fri 9-17',
      weekendHours: 'Community support 24/7',
      linkedin: 'https://linkedin.com/company/pezcms',
      twitter: 'https://twitter.com/pezcms',
      facebook: '',
      instagram: '',
      youtube: '',
      legalLinks: [
        { id: 'privacy', label: 'Privacy Policy', url: '/privacy-policy', enabled: true },
        { id: 'terms', label: 'Terms of Service', url: '/terms-of-service', enabled: true },
      ],
    },
    seoSettings: {
      siteTitle: 'PezCMS',
      titleTemplate: '%s | PezCMS - Head + Headless CMS',
      defaultDescription: 'Keep Your Head While Going Headless. The complete CMS with beautiful websites AND powerful APIs. Self-host free or use our managed cloud.',
      robotsIndex: true,
      robotsFollow: true,
      developmentMode: false,
    },
    cookieBannerSettings: {
      enabled: true,
    },
    siteSettings: {
      homepageSlug: 'hem',
    },
  },
];

export function getTemplateById(id: string): StarterTemplate | undefined {
  return STARTER_TEMPLATES.find(t => t.id === id);
}

export function getTemplatesByCategory(category: StarterTemplate['category']): StarterTemplate[] {
  return STARTER_TEMPLATES.filter(t => t.category === category);
}
