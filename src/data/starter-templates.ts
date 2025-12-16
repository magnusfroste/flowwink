import { ContentBlock, PageMeta } from '@/types/cms';

export interface StarterTemplate {
  id: string;
  name: string;
  description: string;
  category: 'startup' | 'enterprise' | 'compliance';
  icon: string;
  tagline: string;
  aiChatPosition: string;
  blocks: ContentBlock[];
  meta: PageMeta;
  suggestedBranding?: {
    primaryColor: string;
    headingFont: string;
    bodyFont: string;
  };
}

export const STARTER_TEMPLATES: StarterTemplate[] = [
  {
    id: 'launchpad',
    name: 'LaunchPad',
    description: 'Modern, conversion-focused template for SaaS and tech startups. Features bold hero with video support, social proof stats, and a helpful AI chat widget.',
    category: 'startup',
    icon: 'Rocket',
    tagline: 'Perfect for startups & SaaS',
    aiChatPosition: 'Small card widget for quick support',
    suggestedBranding: {
      primaryColor: '250 84% 54%',
      headingFont: 'Space Grotesk',
      bodyFont: 'Inter',
    },
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
              { type: 'paragraph', content: [{ type: 'text', text: 'Deploy in seconds, not hours. Our streamlined infrastructure means your ideas go live the moment they\'re ready. No complex setup, no waiting around.' }] },
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
        id: 'two-col-2',
        type: 'two-column',
        data: {
          content: {
            type: 'doc',
            content: [
              { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Scale Without Limits' }] },
              { type: 'paragraph', content: [{ type: 'text', text: 'From your first 100 users to your first million. Our platform grows with you, automatically handling traffic spikes and optimizing performance.' }] },
              { type: 'bulletList', content: [
                { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Automatic load balancing' }] }] },
                { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Real-time analytics' }] }] },
                { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Zero downtime upgrades' }] }] },
              ]},
            ],
          },
          imageSrc: 'https://images.unsplash.com/photo-1460925895917-afdab827c52f?w=800',
          imageAlt: 'Dashboard analytics',
          imagePosition: 'left',
        },
      },
      {
        id: 'separator-1',
        type: 'separator',
        data: { style: 'space', spacing: 'lg' },
      },
      {
        id: 'quote-1',
        type: 'quote',
        data: {
          text: 'We went from idea to production in just 2 weeks. LaunchPad eliminated all the infrastructure headaches so we could focus on what matters — building a great product.',
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
        id: 'accordion-1',
        type: 'accordion',
        data: {
          title: 'Frequently Asked Questions',
          items: [
            { question: 'How do I get started?', answer: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Sign up for a free account and you can start building immediately. No credit card required for the starter plan.' }] }] } },
            { question: 'What integrations do you support?', answer: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'We support 50+ integrations including Slack, GitHub, Jira, Salesforce, and more. Our API allows custom integrations as well.' }] }] } },
            { question: 'Is there a free tier?', answer: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Yes! Our free tier includes everything you need to get started. Upgrade when you\'re ready to scale.' }] }] } },
            { question: 'How does pricing work?', answer: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'We offer simple, usage-based pricing. Pay only for what you use, with no hidden fees or long-term contracts.' }] }] } },
            { question: 'Do you offer enterprise plans?', answer: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Yes, we offer custom enterprise plans with dedicated support, SLAs, and additional security features. Contact our sales team for details.' }] }] } },
          ],
        },
      },
      {
        id: 'contact-1',
        type: 'contact',
        data: {
          title: 'Get in Touch',
          email: 'hello@launchpad.io',
          phone: '+1 (555) 123-4567',
        },
      },
    ],
  },
  {
    id: 'trustcorp',
    name: 'TrustCorp',
    description: 'Professional template for established enterprises. Emphasizes trust, scale, and data sovereignty with a prominent private AI assistant.',
    category: 'enterprise',
    icon: 'Building2',
    tagline: 'For enterprises that demand excellence',
    aiChatPosition: 'Large embedded assistant with data sovereignty messaging',
    suggestedBranding: {
      primaryColor: '220 70% 35%',
      headingFont: 'Playfair Display',
      bodyFont: 'Source Sans Pro',
    },
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
          primaryButton: { text: 'Request Demo', url: '/demo' },
          secondaryButton: { text: 'Contact Sales', url: '/contact' },
        },
      },
      {
        id: 'link-grid-1',
        type: 'link-grid',
        data: {
          columns: 4,
          links: [
            { icon: 'Briefcase', title: 'Consulting', description: 'Strategic advisory services', url: '/services/consulting' },
            { icon: 'Server', title: 'Technology', description: 'Enterprise infrastructure', url: '/services/technology' },
            { icon: 'BarChart3', title: 'Analytics', description: 'Data-driven insights', url: '/services/analytics' },
            { icon: 'HeadphonesIcon', title: 'Support', description: '24/7 dedicated assistance', url: '/services/support' },
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
        id: 'separator-1',
        type: 'separator',
        data: { style: 'ornament', spacing: 'md' },
      },
      {
        id: 'two-col-1',
        type: 'two-column',
        data: {
          content: {
            type: 'doc',
            content: [
              { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Case Study: GlobalBank' }] },
              { type: 'paragraph', content: [{ type: 'text', text: 'How we helped GlobalBank reduce operational costs by 40% while improving customer satisfaction scores by 25%.' }] },
              { type: 'paragraph', content: [{ type: 'text', text: 'Through our comprehensive digital transformation program, GlobalBank modernized their legacy systems, implemented AI-driven customer service, and achieved regulatory compliance across 30 markets.' }] },
            ],
          },
          imageSrc: 'https://images.unsplash.com/photo-1554224155-8d04cb21cd6c?w=800',
          imageAlt: 'Business analysis dashboard',
          imagePosition: 'right',
        },
      },
      {
        id: 'gallery-1',
        type: 'gallery',
        data: {
          images: [
            { src: 'https://images.unsplash.com/photo-1560179707-f14e90ef3623?w=400', alt: 'Client logo placeholder', caption: 'Fortune 500 Client' },
            { src: 'https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?w=400', alt: 'Enterprise building', caption: 'Global Enterprise' },
            { src: 'https://images.unsplash.com/photo-1497366216548-37526070297c?w=400', alt: 'Modern office', caption: 'Tech Leader' },
            { src: 'https://images.unsplash.com/photo-1497366811353-6870744d04b2?w=400', alt: 'Corporate office', caption: 'Financial Institution' },
          ],
          layout: 'grid',
          columns: 4,
        },
      },
      {
        id: 'article-grid-1',
        type: 'article-grid',
        data: {
          title: 'Thought Leadership',
          columns: 3,
          articles: [
            { title: 'The Future of Enterprise AI', excerpt: 'How private AI models are transforming enterprise operations while maintaining data sovereignty.', image: 'https://images.unsplash.com/photo-1485827404703-89b55fcc595e?w=600', url: '/blog/future-of-ai' },
            { title: 'Data Security Best Practices', excerpt: 'Essential strategies for protecting sensitive data in an increasingly connected world.', image: 'https://images.unsplash.com/photo-1563986768609-322da13575f3?w=600', url: '/blog/data-security' },
            { title: 'Digital Transformation Guide', excerpt: 'A comprehensive roadmap for enterprises embarking on their digital transformation journey.', image: 'https://images.unsplash.com/photo-1451187580459-43490279c0fa?w=600', url: '/blog/digital-transformation' },
          ],
        },
      },
      {
        id: 'separator-2',
        type: 'separator',
        data: { style: 'line', spacing: 'md' },
      },
      {
        id: 'quote-1',
        type: 'quote',
        data: {
          text: 'TrustCorp transformed our operations completely. Their private AI solution gave us the capabilities we needed without compromising on our strict data governance requirements.',
          author: 'Michael Torres',
          source: 'CIO, Fortune 500 Manufacturer',
          variant: 'styled',
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
        id: 'info-box-1',
        type: 'info-box',
        data: {
          title: 'Data Sovereignty Guaranteed',
          content: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Our Private AI runs entirely on your infrastructure. Your data never leaves your servers, ensuring complete compliance with data protection regulations.' }] }] },
          variant: 'highlight',
        },
      },
      {
        id: 'accordion-1',
        type: 'accordion',
        data: {
          title: 'Enterprise FAQ',
          items: [
            { question: 'How do you ensure data security?', answer: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'We employ multiple layers of security including end-to-end encryption, SOC 2 Type II compliance, and optional on-premise deployment for maximum control.' }] }] } },
            { question: 'What compliance certifications do you have?', answer: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'We maintain SOC 2 Type II, ISO 27001, GDPR compliance, and can support industry-specific requirements like HIPAA and PCI-DSS.' }] }] } },
            { question: 'Can we deploy on our own infrastructure?', answer: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Yes, we offer full on-premise deployment options as well as private cloud solutions. Your data never has to leave your infrastructure.' }] }] } },
            { question: 'What SLAs do you offer?', answer: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Enterprise clients receive 99.99% uptime SLA with 24/7 dedicated support, guaranteed response times, and named account managers.' }] }] } },
            { question: 'How does your AI maintain privacy?', answer: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Our Private AI models can be deployed entirely within your infrastructure. No data is sent to external servers, ensuring complete confidentiality.' }] }] } },
            { question: 'Do you offer custom integrations?', answer: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Yes, our professional services team can build custom integrations with your existing enterprise systems, including legacy applications.' }] }] } },
          ],
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
    ],
  },
  {
    id: 'securehealth',
    name: 'SecureHealth',
    description: 'Compliance-first template for healthcare, legal, and finance. Features a prominent Private AI assistant with HIPAA-compliant messaging.',
    category: 'compliance',
    icon: 'ShieldCheck',
    tagline: 'For organizations where cloud AI is not an option',
    aiChatPosition: 'Full-height featured AI with explicit privacy messaging',
    suggestedBranding: {
      primaryColor: '199 89% 35%',
      headingFont: 'Merriweather',
      bodyFont: 'Open Sans',
    },
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
          primaryButton: { text: 'Book Appointment', url: '/booking' },
          secondaryButton: { text: 'Patient Portal', url: '/portal' },
        },
      },
      {
        id: 'info-box-1',
        type: 'info-box',
        data: {
          title: 'Now Accepting New Patients',
          content: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Same-day appointments available. Call us or use our AI assistant to find the next available slot that works for you.' }] }] },
          variant: 'highlight',
        },
      },
      {
        id: 'link-grid-1',
        type: 'link-grid',
        data: {
          columns: 3,
          links: [
            { icon: 'Calendar', title: 'Book Appointment', description: 'Schedule your visit online', url: '/booking' },
            { icon: 'MapPin', title: 'Find Us', description: 'Locations & directions', url: '/locations' },
            { icon: 'Phone', title: 'Urgent Care', description: '24/7 medical helpline', url: '/urgent' },
          ],
        },
      },
      {
        id: 'chat-1',
        type: 'chat',
        data: {
          title: 'Private AI Health Assistant',
          height: 'full',
          showSidebar: false,
          variant: 'card',
          initialPrompt: 'Hello! I\'m your private health assistant. I can help you book appointments, answer questions about our services, or provide general health information. All conversations are HIPAA-compliant and your data stays on our secure servers. How can I help you today?',
        },
      },
      {
        id: 'info-box-2',
        type: 'info-box',
        data: {
          title: 'HIPAA Compliant • Your Data Stays Here',
          content: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Our Private AI runs entirely on our secure, HIPAA-compliant infrastructure. Your health information is never sent to external cloud services or third parties. Complete privacy, complete peace of mind.' }] }] },
          variant: 'success',
        },
      },
      {
        id: 'separator-1',
        type: 'separator',
        data: { style: 'space', spacing: 'md' },
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
        id: 'two-col-1',
        type: 'two-column',
        data: {
          content: {
            type: 'doc',
            content: [
              { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'About Our Practice' }] },
              { type: 'paragraph', content: [{ type: 'text', text: 'For over 20 years, we\'ve been providing compassionate, patient-centered care to our community. Our team of board-certified specialists is committed to your health and well-being.' }] },
              { type: 'paragraph', content: [{ type: 'text', text: 'We believe that quality healthcare should come with complete privacy. That\'s why we\'ve invested in state-of-the-art, on-premise technology that keeps your data exactly where it belongs — under our care and yours.' }] },
            ],
          },
          imageSrc: 'https://images.unsplash.com/photo-1631217868264-e5b90bb7e133?w=800',
          imageAlt: 'Medical team',
          imagePosition: 'right',
        },
      },
      {
        id: 'quote-1',
        type: 'quote',
        data: {
          text: 'I was hesitant about using an AI for health questions, but knowing that my data stays private made all the difference. The assistant helped me find the right specialist and book an appointment in minutes.',
          author: 'Rebecca M.',
          source: 'Patient',
          variant: 'styled',
        },
      },
      {
        id: 'accordion-1',
        type: 'accordion',
        data: {
          title: 'Common Questions',
          items: [
            { question: 'Is the AI assistant really private?', answer: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Yes. Unlike cloud-based AI services, our Private AI runs entirely on our own HIPAA-compliant servers. Your conversations and health information never leave our secure infrastructure.' }] }] } },
            { question: 'What insurance do you accept?', answer: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'We accept most major insurance plans including Medicare, Blue Cross Blue Shield, Aetna, Cigna, and United Healthcare. Contact us to verify your specific coverage.' }] }] } },
            { question: 'How do I access my medical records?', answer: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'You can access your medical records through our secure patient portal. For privacy reasons, we use two-factor authentication and encrypted connections.' }] }] } },
            { question: 'Can I book appointments online?', answer: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Yes! Use our AI assistant above or the booking button to schedule appointments 24/7. You\'ll receive confirmation via your preferred contact method.' }] }] } },
            { 
              question: 'Where are you located?', 
              answer: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'We have multiple locations throughout the region. Each facility features free parking and full accessibility. See our locations page for addresses and directions.' }] }] },
              image: 'https://images.unsplash.com/photo-1519494026892-80bbd2d6fd0d?w=600',
              imageAlt: 'Modern medical facility',
            },
          ],
        },
      },
      {
        id: 'youtube-1',
        type: 'youtube',
        data: {
          url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
          title: 'Take a Virtual Tour of Our Facility',
          controls: true,
        },
      },
      {
        id: 'contact-1',
        type: 'contact',
        data: {
          title: 'Contact Us',
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
    ],
  },
];

export function getTemplateById(id: string): StarterTemplate | undefined {
  return STARTER_TEMPLATES.find(t => t.id === id);
}

export function getTemplatesByCategory(category: StarterTemplate['category']): StarterTemplate[] {
  return STARTER_TEMPLATES.filter(t => t.category === category);
}
