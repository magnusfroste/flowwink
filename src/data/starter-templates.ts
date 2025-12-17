import { ContentBlock, PageMeta } from '@/types/cms';
import { BrandingSettings, ChatSettings, FooterSettings } from '@/hooks/useSiteSettings';

// Page definition within a template
export interface TemplatePage {
  title: string;
  slug: string;
  isHomePage?: boolean;
  blocks: ContentBlock[];
  meta: PageMeta;
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
          primaryButton: { text: 'Get Started Free', url: '/signup' },
          secondaryButton: { text: 'Watch Demo', url: '#demo' },
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
          buttonUrl: '/signup',
          gradient: true,
        },
      },
    ],
  },
  {
    title: 'Product',
    slug: 'produkt',
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
            { icon: 'Zap', title: 'Instant Deploy', description: 'Push to production in seconds', url: '#deploy' },
            { icon: 'Shield', title: 'Enterprise Security', description: 'SOC 2 compliant from day one', url: '#security' },
            { icon: 'BarChart3', title: 'Analytics', description: 'Real-time insights and metrics', url: '#analytics' },
            { icon: 'Puzzle', title: 'Integrations', description: '50+ pre-built connectors', url: '#integrations' },
            { icon: 'Users', title: 'Team Management', description: 'Collaborate seamlessly', url: '#teams' },
            { icon: 'Cpu', title: 'AI-Powered', description: 'Smart automation built-in', url: '#ai' },
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
          buttonUrl: '/signup',
          gradient: true,
        },
      },
    ],
  },
  {
    title: 'Contact',
    slug: 'kontakt',
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
    title: 'Integritetspolicy',
    slug: 'integritetspolicy',
    meta: {
      description: 'Information om hur vi hanterar dina personuppgifter enligt GDPR',
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
              { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Inledning' }] },
              { type: 'paragraph', content: [{ type: 'text', text: 'Vi värnar om din integritet och arbetar aktivt för att skydda dina personuppgifter. Denna policy beskriver hur vi samlar in, använder och skyddar information om dig i enlighet med dataskyddsförordningen (GDPR).' }] },
              { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Personuppgiftsansvarig' }] },
              { type: 'paragraph', content: [{ type: 'text', text: 'LaunchPad AB är personuppgiftsansvarig för behandlingen av dina personuppgifter. Du når oss på hello@launchpad.io.' }] },
              { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Vilka uppgifter samlar vi in?' }] },
              { type: 'paragraph', content: [{ type: 'text', text: 'Vi samlar in uppgifter som du lämnar till oss, exempelvis när du registrerar ett konto, kontaktar oss eller använder våra tjänster. Detta kan inkludera namn, e-postadress, telefonnummer och annan relevant information.' }] },
              { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Hur använder vi uppgifterna?' }] },
              { type: 'bulletList', content: [
                { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'För att tillhandahålla och förbättra våra tjänster' }] }] },
                { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'För att kommunicera med dig om din användning av tjänsten' }] }] },
                { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'För att uppfylla rättsliga förpliktelser' }] }] },
                { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'För att skicka relevant information och marknadsföring (med ditt samtycke)' }] }] },
              ]},
              { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Dina rättigheter' }] },
              { type: 'paragraph', content: [{ type: 'text', text: 'Enligt GDPR har du rätt att begära tillgång till, rättelse av och radering av dina personuppgifter. Du har också rätt att begära begränsning av behandling, invända mot behandling samt rätt till dataportabilitet.' }] },
              { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Cookies' }] },
              { type: 'paragraph', content: [{ type: 'text', text: 'Vi använder cookies för att förbättra din upplevelse på vår webbplats. Du kan hantera dina cookie-inställningar via din webbläsare.' }] },
              { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Kontakt' }] },
              { type: 'paragraph', content: [{ type: 'text', text: 'Har du frågor om vår hantering av personuppgifter? Kontakta oss på hello@launchpad.io.' }] },
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
            { title: 'GlobalBank: 40% Cost Reduction', excerpt: 'How we helped GlobalBank reduce operational costs while improving customer satisfaction.', image: 'https://images.unsplash.com/photo-1554224155-8d04cb21cd6c?w=600', url: '#globalbank' },
            { title: 'TechCorp: AI Transformation', excerpt: 'Deploying private AI across 30 global locations while maintaining data sovereignty.', image: 'https://images.unsplash.com/photo-1485827404703-89b55fcc595e?w=600', url: '#techcorp' },
            { title: 'HealthNet: HIPAA Compliance', excerpt: 'Modernizing healthcare IT infrastructure with full regulatory compliance.', image: 'https://images.unsplash.com/photo-1576091160399-112ba8d25d1d?w=600', url: '#healthnet' },
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
    title: 'Integritetspolicy',
    slug: 'integritetspolicy',
    meta: {
      description: 'Information om hur vi hanterar dina personuppgifter enligt GDPR',
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
              { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Inledning' }] },
              { type: 'paragraph', content: [{ type: 'text', text: 'TrustCorp AB värnar om din integritet och arbetar aktivt för att skydda dina personuppgifter. Denna policy beskriver hur vi samlar in, använder och skyddar information om dig i enlighet med dataskyddsförordningen (GDPR).' }] },
              { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Personuppgiftsansvarig' }] },
              { type: 'paragraph', content: [{ type: 'text', text: 'TrustCorp AB är personuppgiftsansvarig för behandlingen av dina personuppgifter. Du når oss på contact@trustcorp.com.' }] },
              { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Vilka uppgifter samlar vi in?' }] },
              { type: 'paragraph', content: [{ type: 'text', text: 'Vi samlar in uppgifter som du lämnar till oss i samband med affärsrelationer, exempelvis kontaktuppgifter för företagsrepresentanter, projektrelaterad information och kommunikationshistorik.' }] },
              { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Hur använder vi uppgifterna?' }] },
              { type: 'bulletList', content: [
                { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'För att leverera avtalade tjänster och produkter' }] }] },
                { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'För att hantera kundrelationer och kommunikation' }] }] },
                { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'För att uppfylla rättsliga och regulatoriska krav' }] }] },
                { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'För affärsutveckling och marknadsföring (med samtycke)' }] }] },
              ]},
              { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Datalagring och säkerhet' }] },
              { type: 'paragraph', content: [{ type: 'text', text: 'Vi lagrar all data inom EU/EES och tillämpar branschledande säkerhetsåtgärder inklusive kryptering, åtkomstkontroll och regelbundna säkerhetsgranskningar.' }] },
              { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Dina rättigheter' }] },
              { type: 'paragraph', content: [{ type: 'text', text: 'Enligt GDPR har du rätt att begära tillgång till, rättelse av och radering av dina personuppgifter. Du har också rätt att begära begränsning av behandling, invända mot behandling samt rätt till dataportabilitet.' }] },
              { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Kontakt' }] },
              { type: 'paragraph', content: [{ type: 'text', text: 'För frågor om personuppgiftshantering, kontakta vårt dataskyddsombud på privacy@trustcorp.com.' }] },
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
            { icon: 'HeartPulse', title: 'Primary Care', description: 'General health checkups and preventive care', url: '#primary' },
            { icon: 'Stethoscope', title: 'Specialists', description: 'Expert care across all medical fields', url: '#specialists' },
            { icon: 'Baby', title: 'Pediatrics', description: 'Caring for children of all ages', url: '#pediatrics' },
            { icon: 'Brain', title: 'Mental Health', description: 'Private counseling and therapy', url: '#mental' },
            { icon: 'Activity', title: 'Diagnostics', description: 'Advanced testing and imaging', url: '#diagnostics' },
            { icon: 'Pill', title: 'Pharmacy', description: 'On-site prescription services', url: '#pharmacy' },
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
    title: 'Integritetspolicy',
    slug: 'integritetspolicy',
    meta: {
      description: 'Information om hur vi hanterar dina personuppgifter och patientdata enligt GDPR',
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
              { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Inledning' }] },
              { type: 'paragraph', content: [{ type: 'text', text: 'SecureHealth värnar om din integritet och hanterar dina personuppgifter och patientdata med högsta möjliga säkerhet. Denna policy beskriver hur vi samlar in, använder och skyddar information om dig i enlighet med dataskyddsförordningen (GDPR) och patientdatalagen.' }] },
              { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Personuppgiftsansvarig' }] },
              { type: 'paragraph', content: [{ type: 'text', text: 'SecureHealth AB är personuppgiftsansvarig för behandlingen av dina personuppgifter. Du når vårt dataskyddsombud på privacy@securehealth.se.' }] },
              { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Vilka uppgifter samlar vi in?' }] },
              { type: 'paragraph', content: [{ type: 'text', text: 'Vi samlar in nödvändiga uppgifter för att kunna ge dig vård av hög kvalitet:' }] },
              { type: 'bulletList', content: [
                { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Identitetsuppgifter (namn, personnummer, kontaktuppgifter)' }] }] },
                { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Hälso- och sjukvårdsuppgifter (journaler, diagnoser, behandlingar)' }] }] },
                { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Boknings- och kommunikationshistorik' }] }] },
              ]},
              { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Rättslig grund för behandling' }] },
              { type: 'paragraph', content: [{ type: 'text', text: 'Vi behandlar dina personuppgifter med stöd av vår rättsliga skyldighet att föra patientjournal enligt patientdatalagen, samt för att utföra uppgifter av allmänt intresse inom hälso- och sjukvårdsområdet.' }] },
              { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Dataskydd och AI-assistenten' }] },
              { type: 'paragraph', content: [{ type: 'text', text: 'Vår AI-assistent körs lokalt på våra egna servrar. Din data lämnar aldrig vår infrastruktur och delas inte med externa parter. Detta säkerställer full HIPAA/GDPR-efterlevnad för alla konversationer.' }] },
              { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Dina rättigheter' }] },
              { type: 'paragraph', content: [{ type: 'text', text: 'Du har rätt att ta del av dina journaluppgifter, begära rättelse av felaktiga uppgifter, samt i vissa fall begära radering eller begränsning av behandling. Observera att patientjournaler enligt lag måste bevaras i minst 10 år.' }] },
              { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Kontakt' }] },
              { type: 'paragraph', content: [{ type: 'text', text: 'Har du frågor om hur vi hanterar dina personuppgifter? Kontakta vårt dataskyddsombud på privacy@securehealth.se eller ring vår vårdcentral.' }] },
            ],
          },
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
      primaryColor: '250 84% 54%',
      headingFont: 'Space Grotesk',
      bodyFont: 'Inter',
      borderRadius: 'md',
      shadowIntensity: 'medium',
    },
    chatSettings: {
      enabled: true,
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
        { id: 'privacy', label: 'Integritetspolicy', url: '/integritetspolicy', enabled: true },
      ],
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
      primaryColor: '220 70% 35%',
      headingFont: 'Playfair Display',
      bodyFont: 'Source Sans Pro',
      borderRadius: 'sm',
      shadowIntensity: 'subtle',
    },
    chatSettings: {
      enabled: true,
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
        { id: 'privacy', label: 'Integritetspolicy', url: '/integritetspolicy', enabled: true },
      ],
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
      primaryColor: '199 89% 35%',
      headingFont: 'Merriweather',
      bodyFont: 'Open Sans',
      borderRadius: 'md',
      shadowIntensity: 'subtle',
    },
    chatSettings: {
      enabled: true,
      widgetEnabled: true,
      widgetPosition: 'bottom-right',
      welcomeMessage: 'Hello! I\'m your private health assistant. How can I help?',
      systemPrompt: 'You are a HIPAA-compliant healthcare assistant. Be compassionate, informative, and always emphasize patient privacy. Never provide medical diagnoses.',
      aiProvider: 'local',
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
        { id: 'privacy', label: 'Integritetspolicy', url: '/integritetspolicy', enabled: true },
        { id: 'accessibility', label: 'Tillgänglighet', url: '/tillganglighet', enabled: true },
      ],
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
