import { ContentBlock, PageMeta } from '@/types/cms';
import { BrandingSettings, ChatSettings, FooterSettings, SeoSettings, CookieBannerSettings } from '@/hooks/useSiteSettings';

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

// Full site template
export interface StarterTemplate {
  id: string;
  name: string;
  description: string;
  category: 'startup' | 'enterprise' | 'compliance';
  icon: string;
  tagline: string;
  aiChatPosition: string;
  
  // Multi-page support
  pages: TemplatePage[];
  
  // Site-wide settings
  branding: Partial<BrandingSettings>;
  chatSettings: Partial<ChatSettings>;
  footerSettings: Partial<FooterSettings>;
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
      {
        id: 'quote-1',
        type: 'quote',
        data: {
          text: 'We went from idea to production in just 2 weeks. LaunchPad eliminated all the infrastructure headaches.',
          author: 'Sarah Chen',
          source: 'CTO, TechFlow',
          variant: 'styled',
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
      {
        id: 'link-grid-1',
        type: 'link-grid',
        data: {
          columns: 3,
          links: [
            { icon: 'Zap', title: 'Instant Deploy', description: 'Push to production in seconds', url: '/produkt' },
            { icon: 'Shield', title: 'Enterprise Security', description: 'SOC 2 compliant from day one', url: '/produkt' },
            { icon: 'BarChart3', title: 'Analytics', description: 'Real-time insights and metrics', url: '/produkt' },
            { icon: 'Puzzle', title: 'Integrations', description: '50+ pre-built connectors', url: '/produkt' },
            { icon: 'Users', title: 'Team Management', description: 'Collaborate seamlessly', url: '/produkt' },
            { icon: 'Cpu', title: 'AI-Powered', description: 'Smart automation built-in', url: '/produkt' },
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
      {
        id: 'stats-1',
        type: 'stats',
        data: {
          title: 'Choose Your Plan',
          stats: [
            { value: 'Free', label: 'Starter Plan', icon: 'Rocket' },
            { value: '$49/mo', label: 'Pro Plan', icon: 'Zap' },
            { value: '$199/mo', label: 'Team Plan', icon: 'Users' },
            { value: 'Custom', label: 'Enterprise', icon: 'Building' },
          ],
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
      {
        id: 'quote-1',
        type: 'quote',
        data: {
          text: 'TrustCorp transformed our operations completely. Their private AI solution gave us the capabilities we needed without compromising on data governance.',
          author: 'Michael Torres',
          source: 'CIO, Fortune 500 Manufacturer',
          variant: 'styled',
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
          primaryButton: { text: 'Book Appointment', url: '/kontakt' },
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
            { icon: 'Calendar', title: 'Book Appointment', description: 'Schedule your visit online', url: '/kontakt' },
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
      {
        id: 'cta-1',
        type: 'cta',
        data: {
          title: 'Your Health Journey Starts Here',
          subtitle: 'Experience healthcare that puts your privacy first.',
          buttonText: 'Book Appointment',
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
          buttonUrl: '/kontakt',
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
      {
        id: 'quote-1',
        type: 'quote',
        data: {
          text: 'I was hesitant about using an AI for health questions, but knowing that my data stays private made all the difference.',
          author: 'Rebecca M.',
          source: 'Patient',
          variant: 'styled',
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
    title: 'Contact',
    slug: 'kontakt',
    menu_order: 5,
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
];

export function getTemplateById(id: string): StarterTemplate | undefined {
  return STARTER_TEMPLATES.find(t => t.id === id);
}

export function getTemplatesByCategory(category: StarterTemplate['category']): StarterTemplate[] {
  return STARTER_TEMPLATES.filter(t => t.category === category);
}
