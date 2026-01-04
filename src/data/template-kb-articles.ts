import { ContentBlock } from '@/types/cms';

// KB Category definition for templates
export interface TemplateKbCategory {
  name: string;
  slug: string;
  description?: string;
  icon?: string;
  articles: TemplateKbArticle[];
}

// KB Article definition for templates
export interface TemplateKbArticle {
  title: string;
  slug: string;
  question: string;
  answer_text: string;
  answer_json?: ContentBlock[];
  is_featured?: boolean;
  include_in_chat?: boolean;
}

// =====================================================
// LaunchPad Knowledge Base Articles (SaaS/Startup)
// =====================================================

export const launchpadKbCategories: TemplateKbCategory[] = [
  {
    name: 'Getting Started',
    slug: 'getting-started',
    description: 'Get up and running with LaunchPad quickly.',
    icon: 'Rocket',
    articles: [
      {
        title: 'Quick Start Guide',
        slug: 'quick-start',
        question: 'How do I get started with LaunchPad?',
        answer_text: 'Welcome to LaunchPad! Getting started is easy: 1) Create your account, 2) Set up your first project, 3) Invite your team, and 4) Start building. Our intuitive interface guides you through each step.',
        is_featured: true,
        include_in_chat: true,
      },
      {
        title: 'Creating Your First Project',
        slug: 'first-project',
        question: 'How do I create my first project?',
        answer_text: 'To create your first project, click "New Project" from your dashboard. Enter a project name, choose a template or start blank, then configure your settings. Your project will be ready in seconds.',
        include_in_chat: true,
      },
      {
        title: 'Inviting Team Members',
        slug: 'invite-team',
        question: 'How do I invite my team?',
        answer_text: 'Go to Settings → Team and click "Invite Member". Enter their email address and select their role (Admin, Editor, or Viewer). They will receive an invitation email with instructions to join.',
        include_in_chat: true,
      },
    ],
  },
  {
    name: 'Account & Billing',
    slug: 'account-billing',
    description: 'Manage your subscription and billing.',
    icon: 'CreditCard',
    articles: [
      {
        title: 'Pricing Plans',
        slug: 'pricing',
        question: 'What plans are available?',
        answer_text: 'We offer three plans: Starter (free, up to 3 projects), Pro ($29/mo, unlimited projects, priority support), and Enterprise (custom pricing, dedicated support, SLA). All plans include a 14-day free trial.',
        is_featured: true,
        include_in_chat: true,
      },
      {
        title: 'Upgrading Your Plan',
        slug: 'upgrade',
        question: 'How do I upgrade my plan?',
        answer_text: 'Navigate to Settings → Billing and click "Upgrade Plan". Select your new plan and enter payment details. Your new features are available immediately, and billing is prorated.',
        include_in_chat: true,
      },
      {
        title: 'Cancellation Policy',
        slug: 'cancel',
        question: 'How do I cancel my subscription?',
        answer_text: 'You can cancel anytime from Settings → Billing → Cancel Subscription. Your access continues until the end of your billing period. Data is retained for 30 days after cancellation.',
        include_in_chat: true,
      },
    ],
  },
  {
    name: 'Integrations',
    slug: 'integrations',
    description: 'Connect LaunchPad with your favorite tools.',
    icon: 'Plug',
    articles: [
      {
        title: 'Available Integrations',
        slug: 'available',
        question: 'What integrations are available?',
        answer_text: 'LaunchPad integrates with popular tools including Slack, GitHub, Jira, Figma, Notion, Google Drive, and Zapier. Pro and Enterprise plans unlock additional integrations and custom API access.',
        is_featured: true,
        include_in_chat: true,
      },
      {
        title: 'Setting Up Webhooks',
        slug: 'webhooks',
        question: 'How do I set up webhooks?',
        answer_text: 'Go to Settings → Webhooks → Add Webhook. Enter your endpoint URL, select which events to listen for (e.g., project.created, task.completed), and save. Test webhooks with our built-in debugger.',
        include_in_chat: true,
      },
    ],
  },
];

// =====================================================
// TrustCorp Knowledge Base Articles (Enterprise)
// =====================================================

export const trustcorpKbCategories: TemplateKbCategory[] = [
  {
    name: 'Enterprise Solutions',
    slug: 'enterprise-solutions',
    description: 'Learn about our enterprise-grade offerings.',
    icon: 'Building2',
    articles: [
      {
        title: 'Enterprise Overview',
        slug: 'overview',
        question: 'What enterprise solutions do you offer?',
        answer_text: 'TrustCorp offers comprehensive enterprise solutions including custom deployments, dedicated infrastructure, 24/7 support, SLA guarantees, and tailored integrations. Contact our enterprise team for a personalized assessment.',
        is_featured: true,
        include_in_chat: true,
      },
      {
        title: 'On-Premise Deployment',
        slug: 'on-premise',
        question: 'Can I deploy on my own infrastructure?',
        answer_text: 'Yes, TrustCorp supports full on-premise deployment. Our team will work with your IT department to install, configure, and maintain the platform on your servers, ensuring complete data sovereignty.',
        include_in_chat: true,
      },
      {
        title: 'Custom Integrations',
        slug: 'custom-integrations',
        question: 'Do you offer custom integrations?',
        answer_text: 'Our enterprise team specializes in building custom integrations for your existing systems including ERP, CRM, LDAP/Active Directory, and proprietary databases. We ensure seamless data flow across your organization.',
        include_in_chat: true,
      },
    ],
  },
  {
    name: 'Security & Compliance',
    slug: 'security-compliance',
    description: 'Our commitment to data security and regulatory compliance.',
    icon: 'Shield',
    articles: [
      {
        title: 'Security Certifications',
        slug: 'certifications',
        question: 'What security certifications do you have?',
        answer_text: 'TrustCorp maintains ISO 27001, SOC 2 Type II, and CSA STAR certifications. Our security practices undergo annual third-party audits. We also comply with GDPR, CCPA, and industry-specific regulations.',
        is_featured: true,
        include_in_chat: true,
      },
      {
        title: 'GDPR Compliance',
        slug: 'gdpr',
        question: 'Are you GDPR compliant?',
        answer_text: 'Yes, TrustCorp is fully GDPR compliant. We provide Data Processing Agreements, support data subject requests, maintain EU data centers, and implement privacy-by-design principles across our platform.',
        include_in_chat: true,
      },
      {
        title: 'Data Residency',
        slug: 'data-residency',
        question: 'Where is my data stored?',
        answer_text: 'We offer data residency options in EU (Sweden, Germany), US (East/West), and APAC (Singapore). Enterprise customers can specify data location requirements. On-premise deployment ensures data never leaves your network.',
        include_in_chat: true,
      },
    ],
  },
  {
    name: 'API Documentation',
    slug: 'api-documentation',
    description: 'Technical documentation for developers.',
    icon: 'Code',
    articles: [
      {
        title: 'API Overview',
        slug: 'api-overview',
        question: 'How do I use the API?',
        answer_text: 'Our REST API provides full access to all platform features. Get your API key from Settings → API Keys, then use our SDKs (JavaScript, Python, Java) or make direct HTTP requests. Full documentation available at docs.trustcorp.com.',
        is_featured: true,
        include_in_chat: true,
      },
      {
        title: 'Authentication',
        slug: 'authentication',
        question: 'How does API authentication work?',
        answer_text: 'We support API key authentication for server-to-server communication and OAuth 2.0 for user-delegated access. Enterprise customers can also use SAML SSO and certificate-based authentication.',
        include_in_chat: true,
      },
      {
        title: 'Rate Limits',
        slug: 'rate-limits',
        question: 'What are the API rate limits?',
        answer_text: 'Standard API limits are 1000 requests/minute. Enterprise plans offer configurable limits up to 10,000 requests/minute. Bulk operations and webhooks don\'t count toward limits. Contact us for custom requirements.',
        include_in_chat: true,
      },
    ],
  },
];

// =====================================================
// SecureHealth Knowledge Base Articles (Healthcare/Compliance)
// =====================================================

export const securehealthKbCategories: TemplateKbCategory[] = [
  {
    name: 'Patient Information',
    slug: 'patient-information',
    description: 'Important information for our patients.',
    icon: 'HeartPulse',
    articles: [
      {
        title: 'New Patient Registration',
        slug: 'registration',
        question: 'How do I register as a new patient?',
        answer_text: 'To register as a new patient, click "Book Appointment" and select "New Patient Registration". Complete the online form with your personal and insurance information. Bring a valid ID and insurance card to your first visit.',
        is_featured: true,
        include_in_chat: true,
      },
      {
        title: 'Preparing for Your Visit',
        slug: 'prepare-visit',
        question: 'How should I prepare for my appointment?',
        answer_text: 'Please arrive 15 minutes early for paperwork. Bring your ID, insurance card, current medications list, and any relevant medical records. Wear comfortable clothing and avoid eating 2 hours before blood tests.',
        include_in_chat: true,
      },
      {
        title: 'Patient Portal Access',
        slug: 'portal-access',
        question: 'How do I access my patient portal?',
        answer_text: 'After registration, you\'ll receive an email with your portal login. Use it to view test results, request prescription refills, message your care team, and schedule appointments. Call our helpline if you need login assistance.',
        include_in_chat: true,
      },
    ],
  },
  {
    name: 'Insurance & Billing',
    slug: 'insurance-billing',
    description: 'Information about insurance and payment options.',
    icon: 'Wallet',
    articles: [
      {
        title: 'Accepted Insurance',
        slug: 'accepted-insurance',
        question: 'What insurance plans do you accept?',
        answer_text: 'We accept most major insurance plans including Folksam, Trygg-Hansa, If, Skandia, and Region Stockholm. Contact our billing department to verify your specific plan. We also accept international insurance with prior approval.',
        is_featured: true,
        include_in_chat: true,
      },
      {
        title: 'Payment Options',
        slug: 'payment-options',
        question: 'What payment methods do you accept?',
        answer_text: 'We accept credit/debit cards, Swish, bank transfer, and invoice payment. Payment is expected at time of service. Payment plans are available for larger expenses. Financial assistance may be available for qualifying patients.',
        include_in_chat: true,
      },
      {
        title: 'Understanding Your Bill',
        slug: 'understanding-bill',
        question: 'How do I understand my medical bill?',
        answer_text: 'Your bill shows: service date, procedure codes, total charges, insurance payment, and your balance. The "Explanation of Benefits" from your insurer details covered amounts. Our billing team can walk you through any questions.',
        include_in_chat: true,
      },
    ],
  },
  {
    name: 'Privacy & Security',
    slug: 'privacy-security',
    description: 'How we protect your health information.',
    icon: 'Lock',
    articles: [
      {
        title: 'HIPAA Compliance',
        slug: 'hipaa',
        question: 'How do you ensure HIPAA compliance?',
        answer_text: 'We maintain strict HIPAA compliance through encrypted data storage, access controls, staff training, and regular audits. Only authorized healthcare providers access your records for treatment purposes.',
        is_featured: true,
        include_in_chat: true,
      },
      {
        title: 'Data Protection',
        slug: 'data-protection',
        question: 'How is my health data protected?',
        answer_text: 'Your health data is encrypted at rest and in transit using AES-256. We use on-premise servers in Sweden, ensuring your data never leaves the country. Multi-factor authentication protects all access points.',
        include_in_chat: true,
      },
      {
        title: 'Your Privacy Rights',
        slug: 'privacy-rights',
        question: 'What are my privacy rights?',
        answer_text: 'You have the right to: access your medical records, request corrections, know who accessed your data, restrict certain disclosures, and file complaints. Request a copy of our privacy practices at any time.',
        include_in_chat: true,
      },
    ],
  },
];

// =====================================================
// PezCMS Knowledge Base Articles
// =====================================================

export const pezcmsKbCategories: TemplateKbCategory[] = [
  // ===== GETTING STARTED =====
  {
    name: 'Getting Started',
    slug: 'getting-started',
    description: 'Learn the basics of PezCMS and get up and running quickly.',
    icon: 'Rocket',
    articles: [
      {
        title: 'What is PezCMS?',
        slug: 'what-is-pezcms',
        question: 'What is PezCMS and what can I do with it?',
        answer_text: 'PezCMS is a modern, open-source content management system built for speed, simplicity, and flexibility. It combines a visual block editor with a headless API, giving you the best of both worlds.',
        is_featured: true,
        include_in_chat: true,
        answer_json: [
          {
            id: 'kb-intro',
            type: 'text',
            data: {
              content: {
                type: 'doc',
                content: [
                  { type: 'paragraph', content: [{ type: 'text', text: 'PezCMS is a modern, open-source content management system built for speed, simplicity, and flexibility. It combines a visual block editor with a headless API, giving you the best of both worlds.' }] },
                  { type: 'heading', attrs: { level: 3 }, content: [{ type: 'text', text: 'Key Features' }] },
                  { type: 'bulletList', content: [
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'bold' }], text: 'Visual Block Editor' }, { type: 'text', text: ' – Drag-and-drop interface with 27+ block types' }] }] },
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'bold' }], text: 'Headless API' }, { type: 'text', text: ' – Full REST API for custom frontends and mobile apps' }] }] },
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'bold' }], text: 'Self-Hostable' }, { type: 'text', text: ' – Run on your own infrastructure with full control' }] }] },
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'bold' }], text: 'AI-Powered' }, { type: 'text', text: ' – Built-in AI chat, content generation, and translation' }] }] },
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'bold' }], text: 'Built-in Modules' }, { type: 'text', text: ' – Blog, newsletter, CRM, knowledge base, and e-commerce ready to use' }] }] },
                  ] },
                ],
              },
            },
          },
        ],
      },
      {
        title: 'Creating Your First Page',
        slug: 'creating-first-page',
        question: 'How do I create my first page in PezCMS?',
        answer_text: 'Go to Admin → Pages → New Page. Enter a title, choose a template or start blank, then add blocks using the + button. Click Save when done, then Publish to make it live.',
        is_featured: true,
        include_in_chat: true,
        answer_json: [
          {
            id: 'kb-first-page',
            type: 'text',
            data: {
              content: {
                type: 'doc',
                content: [
                  { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Creating Your First Page' }] },
                  { type: 'orderedList', content: [
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Navigate to ' }, { type: 'text', marks: [{ type: 'bold' }], text: 'Admin → Pages' }] }] },
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Click ' }, { type: 'text', marks: [{ type: 'bold' }], text: 'New Page' }, { type: 'text', text: ' in the top right' }] }] },
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Enter a title for your page' }] }] },
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Click the ' }, { type: 'text', marks: [{ type: 'bold' }], text: '+ button' }, { type: 'text', text: ' to add blocks (Hero, Text, Images, etc.)' }] }] },
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Arrange and edit blocks as needed' }] }] },
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Click ' }, { type: 'text', marks: [{ type: 'bold' }], text: 'Save' }, { type: 'text', text: ' to save as draft' }] }] },
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Click ' }, { type: 'text', marks: [{ type: 'bold' }], text: 'Publish' }, { type: 'text', text: ' when ready to go live' }] }] },
                  ] },
                  { type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'italic' }], text: 'Tip: Every save creates a version you can restore later if needed.' }] },
                ],
              },
            },
          },
        ],
      },
      {
        title: 'Understanding User Roles',
        slug: 'user-roles',
        question: 'What are the different user roles in PezCMS?',
        answer_text: 'PezCMS has three roles: Writer (create and edit own drafts), Approver (review and publish content), and Admin (full access including settings and users).',
        include_in_chat: true,
        answer_json: [
          {
            id: 'kb-roles',
            type: 'text',
            data: {
              content: {
                type: 'doc',
                content: [
                  { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'User Roles Explained' }] },
                  { type: 'paragraph', content: [{ type: 'text', text: 'PezCMS uses a role-based access control system with three levels:' }] },
                  { type: 'heading', attrs: { level: 3 }, content: [{ type: 'text', text: 'Writer' }] },
                  { type: 'bulletList', content: [
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Create new pages and blog posts' }] }] },
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Edit their own draft content' }] }] },
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Submit content for review' }] }] },
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Access the media library' }] }] },
                  ] },
                  { type: 'heading', attrs: { level: 3 }, content: [{ type: 'text', text: 'Approver' }] },
                  { type: 'bulletList', content: [
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'All Writer permissions' }] }] },
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Review and approve content from writers' }] }] },
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Publish and unpublish pages' }] }] },
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Manage leads and deals in CRM' }] }] },
                  ] },
                  { type: 'heading', attrs: { level: 3 }, content: [{ type: 'text', text: 'Admin' }] },
                  { type: 'bulletList', content: [
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Full access to all features' }] }] },
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Manage users and roles' }] }] },
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Configure site settings and branding' }] }] },
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Set up webhooks and integrations' }] }] },
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Delete content and manage products' }] }] },
                  ] },
                ],
              },
            },
          },
        ],
      },
      {
        title: 'Navigation and Menu',
        slug: 'navigation-menu',
        question: 'How do I manage the navigation menu?',
        answer_text: 'Go to Admin → Menu Order to drag and reorder menu items. Pages are automatically added to the menu when created. Toggle "Show in Menu" in page settings to hide pages from navigation.',
        include_in_chat: true,
        answer_json: [
          {
            id: 'kb-navigation',
            type: 'text',
            data: {
              content: {
                type: 'doc',
                content: [
                  { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Managing Your Navigation Menu' }] },
                  { type: 'paragraph', content: [{ type: 'text', text: 'The navigation menu is automatically generated from your pages. Here\'s how to customize it:' }] },
                  { type: 'heading', attrs: { level: 3 }, content: [{ type: 'text', text: 'Reordering Menu Items' }] },
                  { type: 'orderedList', content: [
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Navigate to ' }, { type: 'text', marks: [{ type: 'bold' }], text: 'Admin → Menu Order' }] }] },
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Drag pages up or down to change their order' }] }] },
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Changes are saved automatically' }] }] },
                  ] },
                  { type: 'heading', attrs: { level: 3 }, content: [{ type: 'text', text: 'Hiding Pages from Menu' }] },
                  { type: 'bulletList', content: [
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Open the page in the editor' }] }] },
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Click ' }, { type: 'text', marks: [{ type: 'bold' }], text: 'Page Settings' }, { type: 'text', text: ' (gear icon)' }] }] },
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Toggle ' }, { type: 'text', marks: [{ type: 'bold' }], text: '"Show in Menu"' }, { type: 'text', text: ' off' }] }] },
                  ] },
                  { type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'italic' }], text: 'Tip: Hidden pages are still accessible via direct URL – useful for landing pages or thank-you pages.' }] },
                ],
              },
            },
          },
        ],
      },
    ],
  },
  
  // ===== CONTENT MANAGEMENT =====
  {
    name: 'Content Management',
    slug: 'content-management',
    description: 'Learn how to create, edit, and publish content effectively.',
    icon: 'FileText',
    articles: [
      {
        title: 'Block Types Overview',
        slug: 'block-types',
        question: 'What block types are available in PezCMS?',
        answer_text: 'PezCMS offers 27+ block types including Hero, Text, Image, Gallery, Features, Stats, Testimonials, Pricing, Forms, Newsletter, Map, YouTube, Chat, and many more. Each block is fully customizable.',
        is_featured: true,
        include_in_chat: true,
        answer_json: [
          {
            id: 'kb-blocks',
            type: 'text',
            data: {
              content: {
                type: 'doc',
                content: [
                  { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Available Block Types' }] },
                  { type: 'paragraph', content: [{ type: 'text', text: 'PezCMS provides a comprehensive library of content blocks:' }] },
                  { type: 'heading', attrs: { level: 3 }, content: [{ type: 'text', text: 'Content Blocks' }] },
                  { type: 'paragraph', content: [{ type: 'text', text: 'Hero, Text, Image, Quote, Separator, Two-Column, Info Box' }] },
                  { type: 'heading', attrs: { level: 3 }, content: [{ type: 'text', text: 'Showcase Blocks' }] },
                  { type: 'paragraph', content: [{ type: 'text', text: 'Features, Stats, Timeline, Gallery, Logos, Team, Testimonials' }] },
                  { type: 'heading', attrs: { level: 3 }, content: [{ type: 'text', text: 'E-commerce Blocks' }] },
                  { type: 'paragraph', content: [{ type: 'text', text: 'Pricing, Products, Cart, Comparison' }] },
                  { type: 'heading', attrs: { level: 3 }, content: [{ type: 'text', text: 'Form Blocks' }] },
                  { type: 'paragraph', content: [{ type: 'text', text: 'Contact, Form Builder, Newsletter, Booking' }] },
                  { type: 'heading', attrs: { level: 3 }, content: [{ type: 'text', text: 'Navigation Blocks' }] },
                  { type: 'paragraph', content: [{ type: 'text', text: 'Header, Footer, Link Grid, Accordion' }] },
                  { type: 'heading', attrs: { level: 3 }, content: [{ type: 'text', text: 'Media Blocks' }] },
                  { type: 'paragraph', content: [{ type: 'text', text: 'YouTube, Map, Article Grid' }] },
                  { type: 'heading', attrs: { level: 3 }, content: [{ type: 'text', text: 'AI & Interactive' }] },
                  { type: 'paragraph', content: [{ type: 'text', text: 'Chat Widget, Popup, CTA Buttons' }] },
                ],
              },
            },
          },
        ],
      },
      {
        title: 'Publishing Workflow',
        slug: 'publishing-workflow',
        question: 'How does the publishing workflow work?',
        answer_text: 'Content goes through Draft → Reviewing → Published. Writers create drafts and submit for review. Approvers review and can approve, reject, or request changes. Approved content can be published immediately or scheduled.',
        include_in_chat: true,
        answer_json: [
          {
            id: 'kb-workflow',
            type: 'text',
            data: {
              content: {
                type: 'doc',
                content: [
                  { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Publishing Workflow' }] },
                  { type: 'paragraph', content: [{ type: 'text', text: 'PezCMS uses a structured workflow to ensure content quality:' }] },
                  { type: 'orderedList', content: [
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'bold' }], text: 'Draft' }, { type: 'text', text: ' – Content is being created. Only visible to the author and admins.' }] }] },
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'bold' }], text: 'Reviewing' }, { type: 'text', text: ' – Submitted for approval. Approvers can review, comment, and make changes.' }] }] },
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'bold' }], text: 'Published' }, { type: 'text', text: ' – Live on the website. Visible to all visitors.' }] }] },
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'bold' }], text: 'Archived' }, { type: 'text', text: ' – Removed from the site but preserved for reference.' }] }] },
                  ] },
                  { type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'italic' }], text: 'Tip: Use the Schedule feature to publish content at a specific date and time.' }] },
                ],
              },
            },
          },
        ],
      },
      {
        title: 'Version History',
        slug: 'version-history',
        question: 'How does version history work?',
        answer_text: 'Every time you save a page, a new version is created automatically. Go to the Version History panel to see all versions, compare changes, and restore any previous version with one click.',
        include_in_chat: true,
        answer_json: [
          {
            id: 'kb-version-history',
            type: 'text',
            data: {
              content: {
                type: 'doc',
                content: [
                  { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Version History' }] },
                  { type: 'paragraph', content: [{ type: 'text', text: 'PezCMS automatically tracks every save, giving you complete revision control.' }] },
                  { type: 'heading', attrs: { level: 3 }, content: [{ type: 'text', text: 'How It Works' }] },
                  { type: 'bulletList', content: [
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'bold' }], text: 'Automatic Saves' }, { type: 'text', text: ' – Every save creates a new version' }] }] },
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'bold' }], text: 'Timestamps' }, { type: 'text', text: ' – Each version shows when it was saved and by whom' }] }] },
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'bold' }], text: 'Full Content' }, { type: 'text', text: ' – Versions include all blocks, text, and settings' }] }] },
                  ] },
                  { type: 'heading', attrs: { level: 3 }, content: [{ type: 'text', text: 'Viewing History' }] },
                  { type: 'orderedList', content: [
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Open a page in the editor' }] }] },
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Click the ' }, { type: 'text', marks: [{ type: 'bold' }], text: 'Version History' }, { type: 'text', text: ' button (clock icon)' }] }] },
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Browse through previous versions' }] }] },
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Click ' }, { type: 'text', marks: [{ type: 'bold' }], text: 'Restore' }, { type: 'text', text: ' to revert to any version' }] }] },
                  ] },
                  { type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'italic' }], text: 'Note: Restoring a version creates a new version, so you never lose any history.' }] },
                ],
              },
            },
          },
        ],
      },
      {
        title: 'Media Library',
        slug: 'media-library',
        question: 'How do I manage images and files?',
        answer_text: 'The Media Library stores all uploaded images and files. Access it via Admin → Media. You can upload files, organize them, and reuse them across multiple pages. Images are automatically optimized for web.',
        include_in_chat: true,
        answer_json: [
          {
            id: 'kb-media-library',
            type: 'text',
            data: {
              content: {
                type: 'doc',
                content: [
                  { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Media Library' }] },
                  { type: 'paragraph', content: [{ type: 'text', text: 'The Media Library is your central hub for all images and files.' }] },
                  { type: 'heading', attrs: { level: 3 }, content: [{ type: 'text', text: 'Features' }] },
                  { type: 'bulletList', content: [
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'bold' }], text: 'Upload' }, { type: 'text', text: ' – Drag and drop or click to upload images and files' }] }] },
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'bold' }], text: 'Search' }, { type: 'text', text: ' – Find files quickly by name' }] }] },
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'bold' }], text: 'Reuse' }, { type: 'text', text: ' – Use the same image across multiple pages' }] }] },
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'bold' }], text: 'Optimization' }, { type: 'text', text: ' – Images are automatically optimized for web performance' }] }] },
                  ] },
                  { type: 'heading', attrs: { level: 3 }, content: [{ type: 'text', text: 'Uploading Files' }] },
                  { type: 'orderedList', content: [
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Navigate to ' }, { type: 'text', marks: [{ type: 'bold' }], text: 'Admin → Media' }] }] },
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Click ' }, { type: 'text', marks: [{ type: 'bold' }], text: 'Upload' }, { type: 'text', text: ' or drag files onto the page' }] }] },
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Files are uploaded and ready to use immediately' }] }] },
                  ] },
                  { type: 'heading', attrs: { level: 3 }, content: [{ type: 'text', text: 'Supported Formats' }] },
                  { type: 'paragraph', content: [{ type: 'text', text: 'Images: JPG, PNG, GIF, WebP, SVG. Documents: PDF, DOC, DOCX, XLS, XLSX.' }] },
                  { type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'italic' }], text: 'Tip: Use descriptive file names for better organization and SEO.' }] },
                ],
              },
            },
          },
        ],
      },
      {
        title: 'SEO Settings',
        slug: 'seo-settings',
        question: 'How do I configure SEO for my pages?',
        answer_text: 'Each page has SEO settings in the Page Settings dialog. Set the meta title, description, and Open Graph image. PezCMS automatically generates structured data and sitemaps for better search engine visibility.',
        include_in_chat: true,
        answer_json: [
          {
            id: 'kb-seo-settings',
            type: 'text',
            data: {
              content: {
                type: 'doc',
                content: [
                  { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'SEO Settings' }] },
                  { type: 'paragraph', content: [{ type: 'text', text: 'Optimize your pages for search engines with built-in SEO tools.' }] },
                  { type: 'heading', attrs: { level: 3 }, content: [{ type: 'text', text: 'Page SEO Options' }] },
                  { type: 'bulletList', content: [
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'bold' }], text: 'Meta Title' }, { type: 'text', text: ' – The title shown in search results (keep under 60 characters)' }] }] },
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'bold' }], text: 'Meta Description' }, { type: 'text', text: ' – Summary shown in search results (keep under 160 characters)' }] }] },
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'bold' }], text: 'Open Graph Image' }, { type: 'text', text: ' – Image shown when sharing on social media' }] }] },
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'bold' }], text: 'Canonical URL' }, { type: 'text', text: ' – Specify the preferred URL for duplicate content' }] }] },
                  ] },
                  { type: 'heading', attrs: { level: 3 }, content: [{ type: 'text', text: 'Configuring SEO' }] },
                  { type: 'orderedList', content: [
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Open a page in the editor' }] }] },
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Click ' }, { type: 'text', marks: [{ type: 'bold' }], text: 'Page Settings' }, { type: 'text', text: ' (gear icon)' }] }] },
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Fill in the SEO fields' }] }] },
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Save your changes' }] }] },
                  ] },
                  { type: 'heading', attrs: { level: 3 }, content: [{ type: 'text', text: 'Automatic Features' }] },
                  { type: 'bulletList', content: [
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Sitemap generation at /sitemap.xml' }] }] },
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Structured data for rich snippets' }] }] },
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Semantic HTML for better crawling' }] }] },
                  ] },
                ],
              },
            },
          },
        ],
      },
      {
        title: 'Blog Management',
        slug: 'blog-management',
        question: 'How do I manage blog posts?',
        answer_text: 'Go to Admin → Blog to manage posts, categories, and tags. Create posts with the same block editor as pages. Set featured images, excerpts, and author information. Schedule posts for future publication.',
        include_in_chat: true,
        answer_json: [
          {
            id: 'kb-blog-management',
            type: 'text',
            data: {
              content: {
                type: 'doc',
                content: [
                  { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Blog Management' }] },
                  { type: 'paragraph', content: [{ type: 'text', text: 'PezCMS includes a full-featured blog with categories, tags, and scheduling.' }] },
                  { type: 'heading', attrs: { level: 3 }, content: [{ type: 'text', text: 'Creating a Blog Post' }] },
                  { type: 'orderedList', content: [
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Navigate to ' }, { type: 'text', marks: [{ type: 'bold' }], text: 'Admin → Blog → Posts' }] }] },
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Click ' }, { type: 'text', marks: [{ type: 'bold' }], text: 'New Post' }] }] },
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Enter a title and write your content using the block editor' }] }] },
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Add a featured image and excerpt' }] }] },
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Assign categories and tags' }] }] },
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Save as draft or publish' }] }] },
                  ] },
                  { type: 'heading', attrs: { level: 3 }, content: [{ type: 'text', text: 'Blog Features' }] },
                  { type: 'bulletList', content: [
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'bold' }], text: 'Categories' }, { type: 'text', text: ' – Organize posts by topic' }] }] },
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'bold' }], text: 'Tags' }, { type: 'text', text: ' – Add keywords for filtering' }] }] },
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'bold' }], text: 'Authors' }, { type: 'text', text: ' – Assign authors with bios and avatars' }] }] },
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'bold' }], text: 'Scheduling' }, { type: 'text', text: ' – Schedule posts for future publication' }] }] },
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'bold' }], text: 'Featured Posts' }, { type: 'text', text: ' – Highlight important posts' }] }] },
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'bold' }], text: 'RSS Feed' }, { type: 'text', text: ' – Automatic RSS feed at /blog/rss.xml' }] }] },
                  ] },
                  { type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'italic' }], text: 'Tip: Use the Article Grid block to display blog posts on any page.' }] },
                ],
              },
            },
          },
        ],
      },
    ],
  },
  
  // ===== TROUBLESHOOTING =====
  {
    name: 'Troubleshooting',
    slug: 'troubleshooting',
    description: 'Common issues and how to resolve them.',
    icon: 'Wrench',
    articles: [
      {
        title: 'Page Not Saving',
        slug: 'page-not-saving',
        question: 'Why is my page not saving?',
        answer_text: 'Check your internet connection first. If connected, try refreshing the page. Auto-save runs every few seconds, so your work should be preserved. If issues persist, check browser console for errors.',
        is_featured: true,
        include_in_chat: true,
        answer_json: [
          {
            id: 'kb-not-saving',
            type: 'text',
            data: {
              content: {
                type: 'doc',
                content: [
                  { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Page Not Saving – Troubleshooting' }] },
                  { type: 'paragraph', content: [{ type: 'text', text: 'If your page is not saving, try these steps:' }] },
                  { type: 'orderedList', content: [
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'bold' }], text: 'Check Internet Connection' }, { type: 'text', text: ' – Ensure you have a stable connection' }] }] },
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'bold' }], text: 'Refresh the Page' }, { type: 'text', text: ' – Sometimes a simple refresh resolves sync issues' }] }] },
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'bold' }], text: 'Check for Errors' }, { type: 'text', text: ' – Look at the browser console (F12) for error messages' }] }] },
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'bold' }], text: 'Clear Browser Cache' }, { type: 'text', text: ' – Old cached data can sometimes cause issues' }] }] },
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'bold' }], text: 'Try Another Browser' }, { type: 'text', text: ' – Rule out browser-specific issues' }] }] },
                  ] },
                  { type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'italic' }], text: 'Note: Auto-save runs continuously, so recent changes should be preserved even if you lose connection.' }] },
                ],
              },
            },
          },
        ],
      },
      {
        title: 'Images Not Loading',
        slug: 'images-not-loading',
        question: 'Why are my images not showing?',
        answer_text: 'Check if the image URL is correct and accessible. For uploaded images, verify they exist in the Media Library. Large images may take time to load. Try re-uploading if the issue persists.',
        include_in_chat: true,
      },
      {
        title: 'Cannot Publish Page',
        slug: 'cannot-publish',
        question: 'Why can I not publish my page?',
        answer_text: 'Only users with Approver or Admin roles can publish pages. Writers must submit pages for review first. Check your user role in the profile settings or contact an admin to request publishing permissions.',
        include_in_chat: true,
      },
      {
        title: 'Slow Performance',
        slug: 'slow-performance',
        question: 'Why is the admin panel slow?',
        answer_text: 'Large pages with many blocks can slow down the editor. Try breaking long pages into multiple pages. Optimize images before uploading. Clear browser cache and disable browser extensions that might interfere.',
        include_in_chat: true,
      },
      {
        title: 'Login Issues',
        slug: 'login-issues',
        question: 'I cannot log in to the admin panel',
        answer_text: 'Verify your email and password are correct. Use the "Forgot Password" link to reset if needed. Check if your account has been deactivated by an admin. Clear cookies and try again.',
        include_in_chat: true,
      },
      {
        title: 'Form Submissions Missing',
        slug: 'form-submissions-missing',
        question: 'Where are my form submissions?',
        answer_text: 'Form submissions are stored in Admin → Form Submissions. Only Admin users can view submissions. Check if the form block has a unique ID. Verify that webhooks are configured if you expect external notifications.',
        include_in_chat: true,
      },
      {
        title: 'AI Chat Not Responding',
        slug: 'ai-chat-not-responding',
        question: 'Why is the AI chat not working?',
        answer_text: 'The AI chat requires proper API configuration. Check that the AI settings are configured in Admin → Settings → Chat. Verify the API key is valid. Some features require a connected LLM provider.',
        include_in_chat: true,
      },
    ],
  },
  
  // ===== AI FEATURES =====
  {
    name: 'AI Features',
    slug: 'ai-features',
    description: 'Learn how to use AI-powered features for content creation and customer engagement.',
    icon: 'Sparkles',
    articles: [
      {
        title: 'AI Chat Widget',
        slug: 'ai-chat-widget',
        question: 'How do I add an AI chat widget to my site?',
        answer_text: 'Add the Chat block to any page or enable the global chat widget in Admin → Settings → Chat. The AI uses your Knowledge Base articles to answer visitor questions automatically.',
        is_featured: true,
        include_in_chat: true,
        answer_json: [
          {
            id: 'kb-ai-chat',
            type: 'text',
            data: {
              content: {
                type: 'doc',
                content: [
                  { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'AI Chat Widget Setup' }] },
                  { type: 'paragraph', content: [{ type: 'text', text: 'PezCMS includes a powerful AI-powered chat widget that can answer visitor questions automatically using your content.' }] },
                  { type: 'heading', attrs: { level: 3 }, content: [{ type: 'text', text: 'Setup Options' }] },
                  { type: 'orderedList', content: [
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'bold' }], text: 'Global Widget' }, { type: 'text', text: ' – Enable in Admin → Settings → Chat to show on all pages' }] }] },
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'bold' }], text: 'Page Block' }, { type: 'text', text: ' – Add the Chat block to specific pages' }] }] },
                  ] },
                  { type: 'heading', attrs: { level: 3 }, content: [{ type: 'text', text: 'Knowledge Sources' }] },
                  { type: 'bulletList', content: [
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Knowledge Base articles marked "Include in Chat"' }] }] },
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Published pages and blog posts' }] }] },
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Custom system prompts from settings' }] }] },
                  ] },
                  { type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'italic' }], text: 'Tip: The more Knowledge Base articles you create, the smarter your chat becomes!' }] },
                ],
              },
            },
          },
        ],
      },
      {
        title: 'AI Text Generation',
        slug: 'ai-text-generation',
        question: 'How do I use AI to generate content?',
        answer_text: 'In any text editor, click the AI assistant icon (sparkle) to generate or improve content. You can ask AI to write, rewrite, summarize, translate, or adjust tone. Works in pages, blog posts, and newsletters.',
        is_featured: true,
        include_in_chat: true,
        answer_json: [
          {
            id: 'kb-ai-text',
            type: 'text',
            data: {
              content: {
                type: 'doc',
                content: [
                  { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'AI Content Generation' }] },
                  { type: 'paragraph', content: [{ type: 'text', text: 'PezCMS includes built-in AI writing assistance to help you create content faster.' }] },
                  { type: 'heading', attrs: { level: 3 }, content: [{ type: 'text', text: 'Available AI Actions' }] },
                  { type: 'bulletList', content: [
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'bold' }], text: 'Generate' }, { type: 'text', text: ' – Create new content from a prompt or topic' }] }] },
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'bold' }], text: 'Improve' }, { type: 'text', text: ' – Enhance existing text for clarity and impact' }] }] },
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'bold' }], text: 'Shorten' }, { type: 'text', text: ' – Condense long text while keeping key points' }] }] },
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'bold' }], text: 'Expand' }, { type: 'text', text: ' – Add more detail and depth to your content' }] }] },
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'bold' }], text: 'Translate' }, { type: 'text', text: ' – Convert content to other languages' }] }] },
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'bold' }], text: 'Change Tone' }, { type: 'text', text: ' – Adjust from formal to casual, or professional to friendly' }] }] },
                  ] },
                  { type: 'heading', attrs: { level: 3 }, content: [{ type: 'text', text: 'How to Use' }] },
                  { type: 'orderedList', content: [
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Open any text editor in PezCMS' }] }] },
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Click the sparkle icon (✨) in the toolbar' }] }] },
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Select an action or type a custom prompt' }] }] },
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Review and apply the generated content' }] }] },
                  ] },
                ],
              },
            },
          },
        ],
      },
      {
        title: 'AI Lead Qualification',
        slug: 'ai-lead-qualification',
        question: 'How does AI lead qualification work?',
        answer_text: 'When leads are created from forms, the AI analyzes the submission and scores the lead based on quality signals. It generates a summary and identifies key interests. View AI insights on each lead\'s detail page.',
        include_in_chat: true,
      },
      {
        title: 'Brand Analysis',
        slug: 'ai-brand-analysis',
        question: 'What is AI brand analysis?',
        answer_text: 'In Admin → Settings → Branding, click "Analyze Brand" to have AI review your website and suggest brand guidelines including colors, fonts, tone of voice, and style recommendations based on your content.',
        include_in_chat: true,
      },
      {
        title: 'AEO Analyzer',
        slug: 'aeo-analyzer',
        question: 'What is the AEO (Answer Engine Optimization) analyzer?',
        answer_text: 'The AEO Analyzer reviews your content to ensure it is optimized for AI search engines and answer boxes. It suggests improvements to make your content more likely to appear as AI-generated answers in search results.',
        include_in_chat: true,
      },
    ],
  },
  
  // ===== WEBHOOKS =====
  {
    name: 'Webhooks',
    slug: 'webhooks',
    description: 'Connect PezCMS to external services with real-time event notifications.',
    icon: 'Webhook',
    articles: [
      {
        title: 'What Are Webhooks?',
        slug: 'what-are-webhooks',
        question: 'What are webhooks and how do they work?',
        answer_text: 'Webhooks send real-time HTTP notifications to external services when events occur in PezCMS. For example, when a form is submitted or a page is published, PezCMS can notify your CRM, email service, or automation tool.',
        is_featured: true,
        include_in_chat: true,
        answer_json: [
          {
            id: 'kb-webhooks-intro',
            type: 'text',
            data: {
              content: {
                type: 'doc',
                content: [
                  { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Understanding Webhooks' }] },
                  { type: 'paragraph', content: [{ type: 'text', text: 'Webhooks are automated messages sent from PezCMS to external services when specific events occur. They enable real-time integrations without polling.' }] },
                  { type: 'heading', attrs: { level: 3 }, content: [{ type: 'text', text: 'How It Works' }] },
                  { type: 'orderedList', content: [
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'An event occurs in PezCMS (e.g., form submitted)' }] }] },
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'PezCMS sends an HTTP POST request to your webhook URL' }] }] },
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Your service receives the data and takes action' }] }] },
                  ] },
                  { type: 'heading', attrs: { level: 3 }, content: [{ type: 'text', text: 'Common Use Cases' }] },
                  { type: 'bulletList', content: [
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Sync form submissions to your CRM' }] }] },
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Trigger email sequences when someone subscribes' }] }] },
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Notify Slack when content is published' }] }] },
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Update external systems when orders are placed' }] }] },
                  ] },
                ],
              },
            },
          },
        ],
      },
      {
        title: 'Creating a Webhook',
        slug: 'creating-webhook',
        question: 'How do I create a webhook?',
        answer_text: 'Go to Admin → Webhooks → Add Webhook. Enter a name, the destination URL, select which events to subscribe to, and optionally add custom headers and a secret for signature verification.',
        is_featured: true,
        include_in_chat: true,
        answer_json: [
          {
            id: 'kb-create-webhook',
            type: 'text',
            data: {
              content: {
                type: 'doc',
                content: [
                  { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Creating a Webhook' }] },
                  { type: 'orderedList', content: [
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Navigate to ' }, { type: 'text', marks: [{ type: 'bold' }], text: 'Admin → Webhooks' }] }] },
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Click ' }, { type: 'text', marks: [{ type: 'bold' }], text: 'Add Webhook' }] }] },
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Enter a descriptive name (e.g., "CRM Sync")' }] }] },
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Paste your destination URL' }] }] },
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Select one or more events to trigger the webhook' }] }] },
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Optionally add custom headers for authentication' }] }] },
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Optionally add a secret for HMAC signature verification' }] }] },
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Click Save to activate the webhook' }] }] },
                  ] },
                ],
              },
            },
          },
        ],
      },
      {
        title: 'Webhook Events',
        slug: 'webhook-events',
        question: 'What webhook events are available?',
        answer_text: 'PezCMS supports events for pages (published, updated, deleted), blog posts (published, updated, deleted), forms (submitted), newsletter (subscribed, unsubscribed), bookings (submitted), and orders (created, paid, cancelled, refunded).',
        include_in_chat: true,
        answer_json: [
          {
            id: 'kb-webhook-events',
            type: 'text',
            data: {
              content: {
                type: 'doc',
                content: [
                  { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Available Webhook Events' }] },
                  { type: 'heading', attrs: { level: 3 }, content: [{ type: 'text', text: 'Content Events' }] },
                  { type: 'bulletList', content: [
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'code' }], text: 'page.published' }, { type: 'text', text: ' – When a page is published' }] }] },
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'code' }], text: 'page.updated' }, { type: 'text', text: ' – When a published page is updated' }] }] },
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'code' }], text: 'page.deleted' }, { type: 'text', text: ' – When a page is deleted' }] }] },
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'code' }], text: 'blog_post.published' }, { type: 'text', text: ' – When a blog post is published' }] }] },
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'code' }], text: 'blog_post.updated' }, { type: 'text', text: ' – When a blog post is updated' }] }] },
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'code' }], text: 'blog_post.deleted' }, { type: 'text', text: ' – When a blog post is deleted' }] }] },
                  ] },
                  { type: 'heading', attrs: { level: 3 }, content: [{ type: 'text', text: 'Form & Marketing Events' }] },
                  { type: 'bulletList', content: [
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'code' }], text: 'form.submitted' }, { type: 'text', text: ' – When a form is submitted' }] }] },
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'code' }], text: 'newsletter.subscribed' }, { type: 'text', text: ' – When someone subscribes' }] }] },
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'code' }], text: 'newsletter.unsubscribed' }, { type: 'text', text: ' – When someone unsubscribes' }] }] },
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'code' }], text: 'booking.submitted' }, { type: 'text', text: ' – When a booking is made' }] }] },
                  ] },
                  { type: 'heading', attrs: { level: 3 }, content: [{ type: 'text', text: 'Order Events' }] },
                  { type: 'bulletList', content: [
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'code' }], text: 'order.created' }, { type: 'text', text: ' – When an order is created' }] }] },
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'code' }], text: 'order.paid' }, { type: 'text', text: ' – When payment is confirmed' }] }] },
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'code' }], text: 'order.cancelled' }, { type: 'text', text: ' – When an order is cancelled' }] }] },
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'code' }], text: 'order.refunded' }, { type: 'text', text: ' – When an order is refunded' }] }] },
                  ] },
                ],
              },
            },
          },
        ],
      },
      {
        title: 'Webhook Security',
        slug: 'webhook-security',
        question: 'How do I secure my webhooks?',
        answer_text: 'Use the secret field when creating a webhook. PezCMS will include an HMAC-SHA256 signature in the X-Webhook-Signature header. Verify this signature on your server to ensure requests are authentic.',
        include_in_chat: true,
      },
      {
        title: 'Webhook Logs',
        slug: 'webhook-logs',
        question: 'How do I debug webhook issues?',
        answer_text: 'Each webhook shows delivery logs with status codes, response times, and error messages. Click on a webhook to view its history. Failed deliveries show the error and can be retried manually.',
        include_in_chat: true,
      },
      {
        title: 'n8n Integration',
        slug: 'n8n-integration',
        question: 'How do I connect PezCMS to n8n?',
        answer_text: 'n8n is a workflow automation tool. Create a webhook trigger in n8n, copy the URL, then create a webhook in PezCMS pointing to that URL. Select the events you want to trigger your n8n workflow.',
        include_in_chat: true,
      },
    ],
  },
  
  // ===== API INTEGRATION =====
  {
    name: 'API Integration',
    slug: 'api-integration',
    description: 'Use the headless API to build custom frontends and integrations.',
    icon: 'Code',
    articles: [
      {
        title: 'API Overview',
        slug: 'api-overview',
        question: 'Does PezCMS have an API?',
        answer_text: 'Yes! PezCMS is fully headless with a complete REST API. You can fetch pages, blog posts, products, and more. Use the API to build custom frontends, mobile apps, or integrate with other systems.',
        is_featured: true,
        include_in_chat: true,
        answer_json: [
          {
            id: 'kb-api-overview',
            type: 'text',
            data: {
              content: {
                type: 'doc',
                content: [
                  { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'PezCMS Headless API' }] },
                  { type: 'paragraph', content: [{ type: 'text', text: 'PezCMS provides a complete REST API for building custom experiences:' }] },
                  { type: 'heading', attrs: { level: 3 }, content: [{ type: 'text', text: 'Available Endpoints' }] },
                  { type: 'bulletList', content: [
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'bold' }], text: 'Pages' }, { type: 'text', text: ' – Fetch published pages with full content' }] }] },
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'bold' }], text: 'Blog Posts' }, { type: 'text', text: ' – List and retrieve blog posts with categories/tags' }] }] },
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'bold' }], text: 'Products' }, { type: 'text', text: ' – Access product catalog for e-commerce' }] }] },
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'bold' }], text: 'Knowledge Base' }, { type: 'text', text: ' – Query KB categories and articles' }] }] },
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'bold' }], text: 'Settings' }, { type: 'text', text: ' – Retrieve site settings and navigation' }] }] },
                  ] },
                  { type: 'heading', attrs: { level: 3 }, content: [{ type: 'text', text: 'Use Cases' }] },
                  { type: 'bulletList', content: [
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Build a custom React/Vue/Next.js frontend' }] }] },
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Create native mobile apps for iOS and Android' }] }] },
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Integrate content into existing applications' }] }] },
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Generate static sites with any framework' }] }] },
                  ] },
                ],
              },
            },
          },
        ],
      },
      {
        title: 'Content API Endpoint',
        slug: 'content-api',
        question: 'How do I fetch content from the API?',
        answer_text: 'Use the /functions/v1/content-api endpoint with query parameters for type (page, post, product), slug, and status. Returns JSON with full content blocks that can be rendered in any framework.',
        is_featured: true,
        include_in_chat: true,
        answer_json: [
          {
            id: 'kb-content-api',
            type: 'text',
            data: {
              content: {
                type: 'doc',
                content: [
                  { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Content API Usage' }] },
                  { type: 'heading', attrs: { level: 3 }, content: [{ type: 'text', text: 'Endpoint' }] },
                  { type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'code' }], text: 'GET /functions/v1/content-api' }] },
                  { type: 'heading', attrs: { level: 3 }, content: [{ type: 'text', text: 'Query Parameters' }] },
                  { type: 'bulletList', content: [
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'code' }], text: 'type' }, { type: 'text', text: ' – Content type: page, post, product' }] }] },
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'code' }], text: 'slug' }, { type: 'text', text: ' – URL slug of the content' }] }] },
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'code' }], text: 'status' }, { type: 'text', text: ' – Filter by status (published, draft)' }] }] },
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'code' }], text: 'limit' }, { type: 'text', text: ' – Number of items to return' }] }] },
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'code' }], text: 'offset' }, { type: 'text', text: ' – Pagination offset' }] }] },
                  ] },
                  { type: 'heading', attrs: { level: 3 }, content: [{ type: 'text', text: 'Example Request' }] },
                  { type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'code' }], text: 'curl "https://your-site.com/functions/v1/content-api?type=page&slug=home"' }] },
                ],
              },
            },
          },
        ],
      },
      {
        title: 'RSS Feed',
        slug: 'rss-feed',
        question: 'Does PezCMS have an RSS feed?',
        answer_text: 'Yes, the blog has an automatic RSS feed at /functions/v1/blog-rss. The feed includes published posts with titles, excerpts, dates, and links. Use it for podcast apps, feed readers, or syndication.',
        include_in_chat: true,
      },
      {
        title: 'Sitemap',
        slug: 'sitemap',
        question: 'Is there an automatic sitemap?',
        answer_text: 'Yes, PezCMS generates a sitemap.xml automatically at /functions/v1/sitemap-xml. It includes all published pages, blog posts, and categories. Submit it to Google Search Console for better indexing.',
        include_in_chat: true,
      },
      {
        title: 'LLMs.txt',
        slug: 'llms-txt',
        question: 'What is LLMs.txt?',
        answer_text: 'LLMs.txt is a standard for providing AI-friendly content to large language models. PezCMS generates this automatically at /functions/v1/llms-txt, helping AI search engines understand and reference your content.',
        include_in_chat: true,
      },
      {
        title: 'Authentication',
        slug: 'api-authentication',
        question: 'How do I authenticate API requests?',
        answer_text: 'Public endpoints like content-api and blog-rss are open by default. For protected operations, include the Supabase anon key in the Authorization header. Admin operations require a logged-in user session.',
        include_in_chat: true,
      },
    ],
  },

  // ===== CRM MODULE =====
  {
    name: 'CRM Module',
    slug: 'crm-module',
    description: 'Manage leads, deals, and companies with the built-in CRM.',
    icon: 'Users',
    articles: [
      {
        title: 'CRM Overview',
        slug: 'crm-overview',
        question: 'What is the CRM module in PezCMS?',
        answer_text: 'The CRM module helps you manage your sales pipeline with leads, deals, and companies. Track interactions, qualify prospects with AI, and convert leads into customers – all from within your CMS.',
        is_featured: true,
        include_in_chat: true,
        answer_json: [
          {
            id: 'kb-crm-overview',
            type: 'text',
            data: {
              content: {
                type: 'doc',
                content: [
                  { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'CRM Module Overview' }] },
                  { type: 'paragraph', content: [{ type: 'text', text: 'PezCMS includes a built-in CRM (Customer Relationship Management) system that integrates directly with your content and forms.' }] },
                  { type: 'heading', attrs: { level: 3 }, content: [{ type: 'text', text: 'Key Components' }] },
                  { type: 'bulletList', content: [
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'bold' }], text: 'Leads' }, { type: 'text', text: ' – Potential customers collected from forms, chat, or manual entry' }] }] },
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'bold' }], text: 'Deals' }, { type: 'text', text: ' – Sales opportunities with value, stage, and expected close date' }] }] },
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'bold' }], text: 'Companies' }, { type: 'text', text: ' – Organizations linked to leads for B2B tracking' }] }] },
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'bold' }], text: 'Activities' }, { type: 'text', text: ' – Notes, calls, meetings, and tasks tracked per deal' }] }] },
                  ] },
                  { type: 'heading', attrs: { level: 3 }, content: [{ type: 'text', text: 'AI-Powered Features' }] },
                  { type: 'bulletList', content: [
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Automatic lead qualification and scoring' }] }] },
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'AI-generated lead summaries' }] }] },
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Company data enrichment' }] }] },
                  ] },
                ],
              },
            },
          },
        ],
      },
      {
        title: 'Managing Leads',
        slug: 'managing-leads',
        question: 'How do I manage leads in PezCMS?',
        answer_text: 'Go to Admin → Leads to see all leads. Leads are automatically created from form submissions. You can filter by status (Lead, Opportunity, Customer, Lost), assign leads to team members, and view lead scores.',
        is_featured: true,
        include_in_chat: true,
        answer_json: [
          {
            id: 'kb-leads',
            type: 'text',
            data: {
              content: {
                type: 'doc',
                content: [
                  { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Managing Leads' }] },
                  { type: 'paragraph', content: [{ type: 'text', text: 'Leads are the starting point of your sales pipeline. Here\'s how to work with them effectively.' }] },
                  { type: 'heading', attrs: { level: 3 }, content: [{ type: 'text', text: 'Lead Sources' }] },
                  { type: 'bulletList', content: [
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'bold' }], text: 'Form submissions' }, { type: 'text', text: ' – Automatically captured from contact and booking forms' }] }] },
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'bold' }], text: 'Chat conversations' }, { type: 'text', text: ' – Captured when visitors provide their email in chat' }] }] },
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'bold' }], text: 'Newsletter signups' }, { type: 'text', text: ' – Optionally converted to leads' }] }] },
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'bold' }], text: 'Manual entry' }, { type: 'text', text: ' – Create leads directly in the CRM' }] }] },
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'bold' }], text: 'CSV import' }, { type: 'text', text: ' – Bulk import leads from spreadsheets' }] }] },
                  ] },
                  { type: 'heading', attrs: { level: 3 }, content: [{ type: 'text', text: 'Lead Statuses' }] },
                  { type: 'orderedList', content: [
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'bold' }], text: 'Lead' }, { type: 'text', text: ' – New, unqualified contact' }] }] },
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'bold' }], text: 'Opportunity' }, { type: 'text', text: ' – Qualified and showing interest' }] }] },
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'bold' }], text: 'Customer' }, { type: 'text', text: ' – Converted to paying customer' }] }] },
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'bold' }], text: 'Lost' }, { type: 'text', text: ' – Did not convert' }] }] },
                  ] },
                  { type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'italic' }], text: 'Tip: Use AI qualification to automatically score and prioritize leads based on their activity and profile.' }] },
                ],
              },
            },
          },
        ],
      },
      {
        title: 'Lead Scoring',
        slug: 'lead-scoring',
        question: 'How does lead scoring work?',
        answer_text: 'Leads are scored 0-100 based on activities like page views, form submissions, email opens, and chat engagement. Higher scores indicate more engaged prospects. AI qualification can automatically analyze and summarize lead potential.',
        include_in_chat: true,
        answer_json: [
          {
            id: 'kb-lead-scoring',
            type: 'text',
            data: {
              content: {
                type: 'doc',
                content: [
                  { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Lead Scoring' }] },
                  { type: 'paragraph', content: [{ type: 'text', text: 'Lead scores help you prioritize which prospects to focus on. Scores are calculated based on engagement.' }] },
                  { type: 'heading', attrs: { level: 3 }, content: [{ type: 'text', text: 'Scoring Activities' }] },
                  { type: 'bulletList', content: [
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'bold' }], text: 'Form submission' }, { type: 'text', text: ' – +20 points' }] }] },
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'bold' }], text: 'Chat conversation' }, { type: 'text', text: ' – +15 points' }] }] },
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'bold' }], text: 'Email opened' }, { type: 'text', text: ' – +5 points' }] }] },
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'bold' }], text: 'Link clicked' }, { type: 'text', text: ' – +10 points' }] }] },
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'bold' }], text: 'Pricing page viewed' }, { type: 'text', text: ' – +25 points' }] }] },
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'bold' }], text: 'Booking made' }, { type: 'text', text: ' – +30 points' }] }] },
                  ] },
                  { type: 'heading', attrs: { level: 3 }, content: [{ type: 'text', text: 'AI Qualification' }] },
                  { type: 'paragraph', content: [{ type: 'text', text: 'Click "Qualify with AI" on any lead to get an AI-generated analysis including:' }] },
                  { type: 'bulletList', content: [
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Summary of lead activities and interests' }] }] },
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Recommended next actions' }] }] },
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Potential value assessment' }] }] },
                  ] },
                ],
              },
            },
          },
        ],
      },
      {
        title: 'Creating Deals',
        slug: 'creating-deals',
        question: 'How do I create and manage deals?',
        answer_text: 'Deals represent sales opportunities. Create a deal from a lead by clicking "Create Deal" on the lead detail page. Set the value, expected close date, and product. Track deals through stages: Proposal → Negotiation → Closed Won/Lost.',
        is_featured: true,
        include_in_chat: true,
        answer_json: [
          {
            id: 'kb-deals',
            type: 'text',
            data: {
              content: {
                type: 'doc',
                content: [
                  { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Managing Deals' }] },
                  { type: 'paragraph', content: [{ type: 'text', text: 'Deals track your sales pipeline from initial interest to closed revenue.' }] },
                  { type: 'heading', attrs: { level: 3 }, content: [{ type: 'text', text: 'Creating a Deal' }] },
                  { type: 'orderedList', content: [
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Go to a lead detail page or Admin → Deals' }] }] },
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Click "Create Deal" or "New Deal"' }] }] },
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Enter the deal value and currency' }] }] },
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Set the expected close date' }] }] },
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Optionally link to a product' }] }] },
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Add notes about the opportunity' }] }] },
                  ] },
                  { type: 'heading', attrs: { level: 3 }, content: [{ type: 'text', text: 'Deal Stages' }] },
                  { type: 'bulletList', content: [
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'bold' }], text: 'Proposal' }, { type: 'text', text: ' – Initial offer sent to the prospect' }] }] },
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'bold' }], text: 'Negotiation' }, { type: 'text', text: ' – Active discussions on terms' }] }] },
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'bold' }], text: 'Closed Won' }, { type: 'text', text: ' – Deal completed successfully' }] }] },
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'bold' }], text: 'Closed Lost' }, { type: 'text', text: ' – Deal did not close' }] }] },
                  ] },
                  { type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'italic' }], text: 'Tip: Use the Kanban view to drag deals between stages visually.' }] },
                ],
              },
            },
          },
        ],
      },
      {
        title: 'Deal Kanban Board',
        slug: 'deal-kanban',
        question: 'How do I use the deal Kanban board?',
        answer_text: 'The Kanban board shows deals organized by stage in columns. Drag deals between columns to update their stage. Click a deal card to view details. The board shows total pipeline value and expected revenue per stage.',
        include_in_chat: true,
      },
      {
        title: 'Deal Activities',
        slug: 'deal-activities',
        question: 'How do I track activities on deals?',
        answer_text: 'Each deal has an activity timeline. Add notes, log calls, schedule meetings, or create tasks. Activities are timestamped and linked to the user who created them. Use activities to track all interactions with the prospect.',
        include_in_chat: true,
        answer_json: [
          {
            id: 'kb-deal-activities',
            type: 'text',
            data: {
              content: {
                type: 'doc',
                content: [
                  { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Tracking Deal Activities' }] },
                  { type: 'paragraph', content: [{ type: 'text', text: 'Keep a complete history of interactions on each deal with the activity timeline.' }] },
                  { type: 'heading', attrs: { level: 3 }, content: [{ type: 'text', text: 'Activity Types' }] },
                  { type: 'bulletList', content: [
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'bold' }], text: 'Note' }, { type: 'text', text: ' – Free-form text notes about the deal' }] }] },
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'bold' }], text: 'Call' }, { type: 'text', text: ' – Log phone calls with outcomes' }] }] },
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'bold' }], text: 'Meeting' }, { type: 'text', text: ' – Schedule and track meetings' }] }] },
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'bold' }], text: 'Email' }, { type: 'text', text: ' – Record email correspondence' }] }] },
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'bold' }], text: 'Task' }, { type: 'text', text: ' – Create follow-up tasks with due dates' }] }] },
                  ] },
                  { type: 'heading', attrs: { level: 3 }, content: [{ type: 'text', text: 'Adding Activities' }] },
                  { type: 'orderedList', content: [
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Open a deal detail page' }] }] },
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Click "Add Activity"' }] }] },
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Select the activity type' }] }] },
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Enter details and save' }] }] },
                  ] },
                ],
              },
            },
          },
        ],
      },
      {
        title: 'Managing Companies',
        slug: 'managing-companies',
        question: 'How do I manage companies in the CRM?',
        answer_text: 'Companies group leads from the same organization. Go to Admin → Companies to view all companies. Link leads to companies for B2B tracking. Companies can be enriched with AI to pull industry, size, and other data.',
        is_featured: true,
        include_in_chat: true,
        answer_json: [
          {
            id: 'kb-companies',
            type: 'text',
            data: {
              content: {
                type: 'doc',
                content: [
                  { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Managing Companies' }] },
                  { type: 'paragraph', content: [{ type: 'text', text: 'Companies help you organize leads by organization for B2B sales tracking.' }] },
                  { type: 'heading', attrs: { level: 3 }, content: [{ type: 'text', text: 'Company Information' }] },
                  { type: 'bulletList', content: [
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'bold' }], text: 'Name' }, { type: 'text', text: ' – Company name' }] }] },
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'bold' }], text: 'Domain' }, { type: 'text', text: ' – Website domain for matching leads' }] }] },
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'bold' }], text: 'Industry' }, { type: 'text', text: ' – Business sector' }] }] },
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'bold' }], text: 'Size' }, { type: 'text', text: ' – Number of employees' }] }] },
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'bold' }], text: 'Website' }, { type: 'text', text: ' – Full website URL' }] }] },
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'bold' }], text: 'Address' }, { type: 'text', text: ' – Physical location' }] }] },
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'bold' }], text: 'Phone' }, { type: 'text', text: ' – Contact number' }] }] },
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'bold' }], text: 'Notes' }, { type: 'text', text: ' – Internal notes about the company' }] }] },
                  ] },
                  { type: 'heading', attrs: { level: 3 }, content: [{ type: 'text', text: 'AI Enrichment' }] },
                  { type: 'paragraph', content: [{ type: 'text', text: 'Click "Enrich with AI" to automatically populate company data based on the domain. This uses web scraping to find public information about the company.' }] },
                ],
              },
            },
          },
        ],
      },
      {
        title: 'Linking Leads to Companies',
        slug: 'linking-leads-companies',
        question: 'How do I link leads to companies?',
        answer_text: 'On a lead detail page, use the Company dropdown to select or create a company. Leads are automatically matched to companies based on email domain when possible. View all leads from a company on the company detail page.',
        include_in_chat: true,
      },
      {
        title: 'Importing Leads',
        slug: 'importing-leads',
        question: 'How do I import leads from a CSV file?',
        answer_text: 'Go to Admin → Leads and click "Import CSV". Upload a CSV file with columns for email, name, phone, and source. Map your columns to the correct fields and import. Duplicate emails are detected and skipped.',
        include_in_chat: true,
        answer_json: [
          {
            id: 'kb-csv-import',
            type: 'text',
            data: {
              content: {
                type: 'doc',
                content: [
                  { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Importing Leads from CSV' }] },
                  { type: 'paragraph', content: [{ type: 'text', text: 'Bulk import leads from spreadsheets or other CRM systems.' }] },
                  { type: 'heading', attrs: { level: 3 }, content: [{ type: 'text', text: 'CSV Format' }] },
                  { type: 'paragraph', content: [{ type: 'text', text: 'Your CSV should include these columns:' }] },
                  { type: 'bulletList', content: [
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'code' }], text: 'email' }, { type: 'text', text: ' (required) – Contact email address' }] }] },
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'code' }], text: 'name' }, { type: 'text', text: ' – Full name' }] }] },
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'code' }], text: 'phone' }, { type: 'text', text: ' – Phone number' }] }] },
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'code' }], text: 'source' }, { type: 'text', text: ' – Where the lead came from' }] }] },
                  ] },
                  { type: 'heading', attrs: { level: 3 }, content: [{ type: 'text', text: 'Import Steps' }] },
                  { type: 'orderedList', content: [
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Go to Admin → Leads' }] }] },
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Click "Import CSV"' }] }] },
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Upload your CSV file' }] }] },
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Map columns to lead fields' }] }] },
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Review and confirm import' }] }] },
                  ] },
                  { type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'italic' }], text: 'Note: Duplicate emails are automatically detected and skipped to prevent duplicates.' }] },
                ],
              },
            },
          },
        ],
      },
      {
        title: 'Exporting CRM Data',
        slug: 'exporting-crm',
        question: 'How do I export leads, deals, or companies?',
        answer_text: 'Each CRM section has an "Export CSV" button. Click it to download all records as a CSV file. You can filter the view first to export only matching records. Use exports for backups or analysis.',
        include_in_chat: true,
      },
      {
        title: 'CRM Dashboard',
        slug: 'crm-dashboard',
        question: 'What insights does the CRM dashboard show?',
        answer_text: 'The admin dashboard shows key CRM metrics: total leads, leads needing review, pipeline value, deals by stage, and recent activities. Use it to get a quick overview of your sales pipeline health.',
        include_in_chat: true,
      },
    ],
  },
  
  // ===== BEST PRACTICES =====
  {
    name: 'Best Practices',
    slug: 'best-practices',
    description: 'Expert guidance on content strategy, SEO, and performance optimization.',
    icon: 'Award',
    articles: [
      {
        title: 'Content Strategy Fundamentals',
        slug: 'content-strategy-fundamentals',
        question: 'How do I develop an effective content strategy?',
        answer_text: 'Start by defining your audience and goals. Create a content calendar, maintain consistent publishing schedules, and measure what works. Focus on quality over quantity.',
        is_featured: true,
        include_in_chat: true,
        answer_json: [
          {
            id: 'kb-content-strategy',
            type: 'text',
            data: {
              content: {
                type: 'doc',
                content: [
                  { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Building Your Content Strategy' }] },
                  { type: 'paragraph', content: [{ type: 'text', text: 'A solid content strategy aligns your publishing efforts with business goals and audience needs.' }] },
                  { type: 'heading', attrs: { level: 3 }, content: [{ type: 'text', text: 'Step 1: Define Your Audience' }] },
                  { type: 'bulletList', content: [
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Who are you writing for? Create 2-3 audience personas' }] }] },
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'What problems do they need solved?' }] }] },
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Where do they consume content? (Search, social, email)' }] }] },
                  ] },
                  { type: 'heading', attrs: { level: 3 }, content: [{ type: 'text', text: 'Step 2: Set Measurable Goals' }] },
                  { type: 'bulletList', content: [
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'bold' }], text: 'Traffic' }, { type: 'text', text: ' – Organic visits, page views, time on site' }] }] },
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'bold' }], text: 'Engagement' }, { type: 'text', text: ' – Comments, shares, newsletter signups' }] }] },
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'bold' }], text: 'Conversion' }, { type: 'text', text: ' – Leads generated, demos booked, sales' }] }] },
                  ] },
                  { type: 'heading', attrs: { level: 3 }, content: [{ type: 'text', text: 'Step 3: Create a Content Calendar' }] },
                  { type: 'paragraph', content: [{ type: 'text', text: 'Consistency matters more than volume. Start with a sustainable schedule:' }] },
                  { type: 'bulletList', content: [
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Blog posts: 1-2 per week' }] }] },
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Landing pages: Monthly updates' }] }] },
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Knowledge base: Continuous improvement based on support tickets' }] }] },
                  ] },
                  { type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'italic' }], text: 'Tip: Use the scheduled publishing feature to maintain consistency even during busy periods.' }] },
                ],
              },
            },
          },
        ],
      },
      {
        title: 'SEO Optimization Guide',
        slug: 'seo-optimization-guide',
        question: 'How do I optimize my content for search engines?',
        answer_text: 'Focus on keyword research, compelling meta descriptions, proper heading structure, and quality content. Use the built-in SEO settings for each page and leverage the automatic sitemap generation.',
        is_featured: true,
        include_in_chat: true,
        answer_json: [
          {
            id: 'kb-seo-guide',
            type: 'text',
            data: {
              content: {
                type: 'doc',
                content: [
                  { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'SEO Optimization in PezCMS' }] },
                  { type: 'paragraph', content: [{ type: 'text', text: 'Search engine optimization helps your content get discovered. Here are the key practices.' }] },
                  { type: 'heading', attrs: { level: 3 }, content: [{ type: 'text', text: 'On-Page SEO Essentials' }] },
                  { type: 'bulletList', content: [
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'bold' }], text: 'Title Tags' }, { type: 'text', text: ' – Include your primary keyword, keep under 60 characters' }] }] },
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'bold' }], text: 'Meta Descriptions' }, { type: 'text', text: ' – Compelling summary under 160 characters with a call to action' }] }] },
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'bold' }], text: 'Heading Structure' }, { type: 'text', text: ' – Use H1 for title, H2 for sections, H3 for subsections' }] }] },
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'bold' }], text: 'Image Alt Text' }, { type: 'text', text: ' – Describe images for accessibility and search engines' }] }] },
                  ] },
                  { type: 'heading', attrs: { level: 3 }, content: [{ type: 'text', text: 'URL Best Practices' }] },
                  { type: 'bulletList', content: [
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Keep URLs short and descriptive' }] }] },
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Use hyphens, not underscores' }] }] },
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Include your target keyword' }] }] },
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Avoid unnecessary words (the, a, and)' }] }] },
                  ] },
                  { type: 'heading', attrs: { level: 3 }, content: [{ type: 'text', text: 'Technical SEO (Automatic)' }] },
                  { type: 'paragraph', content: [{ type: 'text', text: 'PezCMS handles these automatically:' }] },
                  { type: 'bulletList', content: [
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'XML sitemap at /functions/v1/sitemap-xml' }] }] },
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'RSS feed for blog posts' }] }] },
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Canonical URLs to prevent duplicate content' }] }] },
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Mobile-responsive design' }] }] },
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'LLMs.txt for AI search engines' }] }] },
                  ] },
                ],
              },
            },
          },
        ],
      },
      {
        title: 'AEO: Optimizing for AI Search',
        slug: 'aeo-ai-search-optimization',
        question: 'What is Answer Engine Optimization (AEO)?',
        answer_text: 'AEO optimizes content for AI-powered search engines that provide direct answers. Write clear, question-based content, use structured data, and ensure your knowledge base is comprehensive.',
        is_featured: true,
        include_in_chat: true,
        answer_json: [
          {
            id: 'kb-aeo',
            type: 'text',
            data: {
              content: {
                type: 'doc',
                content: [
                  { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Answer Engine Optimization (AEO)' }] },
                  { type: 'paragraph', content: [{ type: 'text', text: 'AI search engines like ChatGPT, Perplexity, and Google SGE provide direct answers instead of links. AEO ensures your content gets cited.' }] },
                  { type: 'heading', attrs: { level: 3 }, content: [{ type: 'text', text: 'Why AEO Matters' }] },
                  { type: 'paragraph', content: [{ type: 'text', text: 'Traditional SEO optimizes for rankings. AEO optimizes for being the answer. When AI cites your content, you get qualified traffic from users who already trust you.' }] },
                  { type: 'heading', attrs: { level: 3 }, content: [{ type: 'text', text: 'AEO Best Practices' }] },
                  { type: 'bulletList', content: [
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'bold' }], text: 'Question-Based Content' }, { type: 'text', text: ' – Structure articles around specific questions' }] }] },
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'bold' }], text: 'Clear, Concise Answers' }, { type: 'text', text: ' – Provide direct answers in the first paragraph' }] }] },
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'bold' }], text: 'Authoritative Depth' }, { type: 'text', text: ' – Follow with detailed explanations and examples' }] }] },
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'bold' }], text: 'Structured Data' }, { type: 'text', text: ' – Use proper headings, lists, and formatting' }] }] },
                  ] },
                  { type: 'heading', attrs: { level: 3 }, content: [{ type: 'text', text: 'PezCMS AEO Features' }] },
                  { type: 'bulletList', content: [
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'AEO Analyzer reviews your content and suggests improvements' }] }] },
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'LLMs.txt endpoint provides AI-friendly content summaries' }] }] },
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Knowledge Base structure is already AEO-optimized' }] }] },
                  ] },
                ],
              },
            },
          },
        ],
      },
      {
        title: 'Performance Optimization',
        slug: 'performance-optimization',
        question: 'How do I make my website faster?',
        answer_text: 'Optimize images before uploading, use lazy loading for below-the-fold content, minimize the number of blocks per page, and leverage browser caching. PezCMS automatically optimizes images on upload.',
        include_in_chat: true,
        answer_json: [
          {
            id: 'kb-performance',
            type: 'text',
            data: {
              content: {
                type: 'doc',
                content: [
                  { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Performance Optimization Tips' }] },
                  { type: 'paragraph', content: [{ type: 'text', text: 'Fast websites rank better, convert more, and provide better user experiences.' }] },
                  { type: 'heading', attrs: { level: 3 }, content: [{ type: 'text', text: 'Image Optimization' }] },
                  { type: 'bulletList', content: [
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'bold' }], text: 'Right Size' }, { type: 'text', text: ' – Upload images at the size they will be displayed' }] }] },
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'bold' }], text: 'Format' }, { type: 'text', text: ' – Use WebP or JPEG for photos, PNG for graphics with transparency' }] }] },
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'bold' }], text: 'Compression' }, { type: 'text', text: ' – PezCMS automatically compresses uploads' }] }] },
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'bold' }], text: 'Alt Text' }, { type: 'text', text: ' – Always add descriptive alt text for accessibility' }] }] },
                  ] },
                  { type: 'heading', attrs: { level: 3 }, content: [{ type: 'text', text: 'Page Structure' }] },
                  { type: 'bulletList', content: [
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Keep pages focused – avoid cramming everything onto one page' }] }] },
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Use pagination for long lists (blog, products)' }] }] },
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Lazy load images and videos below the fold' }] }] },
                  ] },
                  { type: 'heading', attrs: { level: 3 }, content: [{ type: 'text', text: 'Monitoring Performance' }] },
                  { type: 'paragraph', content: [{ type: 'text', text: 'Use these free tools to measure your site speed:' }] },
                  { type: 'bulletList', content: [
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Google PageSpeed Insights' }] }] },
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'GTmetrix' }] }] },
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'WebPageTest' }] }] },
                  ] },
                ],
              },
            },
          },
        ],
      },
      {
        title: 'Writing for the Web',
        slug: 'writing-for-web',
        question: 'How should I write content for my website?',
        answer_text: 'Use short paragraphs, clear headings, and scannable formatting. Write at an 8th-grade reading level. Front-load important information and break up text with lists, images, and white space.',
        include_in_chat: true,
        answer_json: [
          {
            id: 'kb-web-writing',
            type: 'text',
            data: {
              content: {
                type: 'doc',
                content: [
                  { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Writing Effective Web Content' }] },
                  { type: 'paragraph', content: [{ type: 'text', text: 'People read differently online. They scan, skip, and skim. Write accordingly.' }] },
                  { type: 'heading', attrs: { level: 3 }, content: [{ type: 'text', text: 'The Inverted Pyramid' }] },
                  { type: 'paragraph', content: [{ type: 'text', text: 'Put the most important information first. Many readers only see the first paragraph – make it count.' }] },
                  { type: 'heading', attrs: { level: 3 }, content: [{ type: 'text', text: 'Formatting for Scanners' }] },
                  { type: 'bulletList', content: [
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'bold' }], text: 'Short Paragraphs' }, { type: 'text', text: ' – 2-3 sentences maximum' }] }] },
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'bold' }], text: 'Descriptive Headings' }, { type: 'text', text: ' – Tell readers what the section contains' }] }] },
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'bold' }], text: 'Bullet Lists' }, { type: 'text', text: ' – Break up complex information' }] }] },
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'bold' }], text: 'Bold Key Points' }, { type: 'text', text: ' – Help scanners find important information' }] }] },
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'bold' }], text: 'White Space' }, { type: 'text', text: ' – Give content room to breathe' }] }] },
                  ] },
                  { type: 'heading', attrs: { level: 3 }, content: [{ type: 'text', text: 'Voice and Tone' }] },
                  { type: 'bulletList', content: [
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Write like you speak – conversational, not formal' }] }] },
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Use "you" to address the reader directly' }] }] },
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Avoid jargon unless your audience expects it' }] }] },
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Be specific – "5 minutes" beats "quick"' }] }] },
                  ] },
                ],
              },
            },
          },
        ],
      },
      {
        title: 'Conversion Optimization',
        slug: 'conversion-optimization',
        question: 'How do I get more visitors to take action?',
        answer_text: 'Use clear calls-to-action, reduce friction in forms, build trust with testimonials, and ensure fast page loads. Test different headlines, button text, and layouts to see what works best.',
        include_in_chat: true,
        answer_json: [
          {
            id: 'kb-conversion',
            type: 'text',
            data: {
              content: {
                type: 'doc',
                content: [
                  { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Conversion Rate Optimization' }] },
                  { type: 'paragraph', content: [{ type: 'text', text: 'Getting traffic is only half the battle. Converting visitors into leads and customers requires intentional design.' }] },
                  { type: 'heading', attrs: { level: 3 }, content: [{ type: 'text', text: 'Clear Calls-to-Action' }] },
                  { type: 'bulletList', content: [
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'One primary CTA per page – make the desired action obvious' }] }] },
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Use action words: "Get Started," "Book Demo," "Download Guide"' }] }] },
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Make buttons stand out with contrasting colors' }] }] },
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Repeat CTAs on long pages' }] }] },
                  ] },
                  { type: 'heading', attrs: { level: 3 }, content: [{ type: 'text', text: 'Reduce Form Friction' }] },
                  { type: 'bulletList', content: [
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Ask only for essential information' }] }] },
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Use smart defaults and autofill when possible' }] }] },
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Show progress for multi-step forms' }] }] },
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Explain why you need each field' }] }] },
                  ] },
                  { type: 'heading', attrs: { level: 3 }, content: [{ type: 'text', text: 'Build Trust' }] },
                  { type: 'bulletList', content: [
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Display testimonials and case studies' }] }] },
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Show logos of customers or media mentions' }] }] },
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Include team photos and bios' }] }] },
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Be transparent about pricing' }] }] },
                  ] },
                  { type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'italic' }], text: 'Tip: Use the Stats and Testimonials blocks to build social proof throughout your pages.' }] },
                ],
              },
            },
          },
        ],
      },
      {
        title: 'Content Maintenance',
        slug: 'content-maintenance',
        question: 'How often should I update my content?',
        answer_text: 'Review cornerstone content quarterly. Update blog posts with new information annually. Remove or redirect outdated pages. Fresh content signals relevance to search engines and builds trust with visitors.',
        include_in_chat: true,
      },
      {
        title: 'Accessibility Guidelines',
        slug: 'accessibility-guidelines',
        question: 'How do I make my content accessible?',
        answer_text: 'Use descriptive alt text for images, ensure sufficient color contrast, write clear link text, and use proper heading hierarchy. Accessible content reaches more people and improves SEO.',
        include_in_chat: true,
      },
    ],
  },

  // ===== NEWSLETTER MODULE =====
  {
    name: 'Newsletter',
    slug: 'newsletter',
    description: 'Create email campaigns, manage subscribers, and track engagement.',
    icon: 'Mail',
    articles: [
      {
        title: 'Newsletter Overview',
        slug: 'newsletter-overview',
        question: 'What can I do with the Newsletter module?',
        answer_text: 'The Newsletter module lets you build and send email campaigns, manage subscriber lists, and track opens, clicks, and engagement. It includes GDPR-compliant subscription management and detailed analytics.',
        is_featured: true,
        include_in_chat: true,
        answer_json: [
          {
            id: 'kb-newsletter-overview',
            type: 'text',
            data: {
              content: {
                type: 'doc',
                content: [
                  { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Newsletter Module Overview' }] },
                  { type: 'paragraph', content: [{ type: 'text', text: 'The Newsletter module provides a complete email marketing solution built into PezCMS:' }] },
                  { type: 'heading', attrs: { level: 3 }, content: [{ type: 'text', text: 'Key Features' }] },
                  { type: 'bulletList', content: [
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'bold' }], text: 'Visual Campaign Builder' }, { type: 'text', text: ' – Create beautiful emails using the same block editor as pages' }] }] },
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'bold' }], text: 'Subscriber Management' }, { type: 'text', text: ' – Import, segment, and manage your email list' }] }] },
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'bold' }], text: 'Analytics Dashboard' }, { type: 'text', text: ' – Track opens, clicks, and engagement in real-time' }] }] },
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'bold' }], text: 'GDPR Compliance' }, { type: 'text', text: ' – Double opt-in, unsubscribe links, and data export' }] }] },
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'bold' }], text: 'Scheduling' }, { type: 'text', text: ' – Send immediately or schedule for optimal delivery times' }] }] },
                  ] },
                  { type: 'paragraph', content: [{ type: 'text', text: 'Access the Newsletter module via ' }, { type: 'text', marks: [{ type: 'bold' }], text: 'Admin → Newsletter' }, { type: 'text', text: '.' }] },
                ],
              },
            },
          },
        ],
      },
      {
        title: 'Creating a Campaign',
        slug: 'creating-campaign',
        question: 'How do I create and send a newsletter campaign?',
        answer_text: 'Go to Admin → Newsletter → New Campaign. Enter a subject line, compose your content using the visual editor, preview your email, then send immediately or schedule for later. The system tracks delivery and engagement automatically.',
        is_featured: true,
        include_in_chat: true,
        answer_json: [
          {
            id: 'kb-creating-campaign',
            type: 'text',
            data: {
              content: {
                type: 'doc',
                content: [
                  { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Creating a Newsletter Campaign' }] },
                  { type: 'paragraph', content: [{ type: 'text', text: 'Follow these steps to create and send your email campaign:' }] },
                  { type: 'orderedList', content: [
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Navigate to ' }, { type: 'text', marks: [{ type: 'bold' }], text: 'Admin → Newsletter' }] }] },
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Click ' }, { type: 'text', marks: [{ type: 'bold' }], text: 'New Campaign' }] }] },
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Enter a compelling ' }, { type: 'text', marks: [{ type: 'bold' }], text: 'subject line' }, { type: 'text', text: ' (keep it under 50 characters)' }] }] },
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Compose your email content using the visual editor' }] }] },
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Preview your email to check formatting' }] }] },
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Choose to ' }, { type: 'text', marks: [{ type: 'bold' }], text: 'Send Now' }, { type: 'text', text: ' or ' }, { type: 'text', marks: [{ type: 'bold' }], text: 'Schedule' }, { type: 'text', text: ' for later' }] }] },
                  ] },
                  { type: 'heading', attrs: { level: 3 }, content: [{ type: 'text', text: 'Best Practices' }] },
                  { type: 'bulletList', content: [
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Keep subject lines concise and action-oriented' }] }] },
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Use a clear call-to-action in every email' }] }] },
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Test on mobile – most emails are read on phones' }] }] },
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Send at optimal times (Tuesday-Thursday, 10am-2pm)' }] }] },
                  ] },
                ],
              },
            },
          },
        ],
      },
      {
        title: 'Managing Subscribers',
        slug: 'managing-subscribers',
        question: 'How do I manage my newsletter subscribers?',
        answer_text: 'View and manage subscribers in Admin → Newsletter → Subscribers. You can see subscriber status, export lists, delete subscribers, and view their subscription history. Subscribers can self-manage via the GDPR management page.',
        include_in_chat: true,
        answer_json: [
          {
            id: 'kb-managing-subscribers',
            type: 'text',
            data: {
              content: {
                type: 'doc',
                content: [
                  { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Managing Newsletter Subscribers' }] },
                  { type: 'paragraph', content: [{ type: 'text', text: 'The subscriber management dashboard gives you full control over your email list:' }] },
                  { type: 'heading', attrs: { level: 3 }, content: [{ type: 'text', text: 'Subscriber Statuses' }] },
                  { type: 'bulletList', content: [
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'bold' }], text: 'Pending' }, { type: 'text', text: ' – Signed up but hasn\'t confirmed email (double opt-in)' }] }] },
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'bold' }], text: 'Confirmed' }, { type: 'text', text: ' – Active subscriber who can receive emails' }] }] },
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'bold' }], text: 'Unsubscribed' }, { type: 'text', text: ' – Opted out and won\'t receive future emails' }] }] },
                  ] },
                  { type: 'heading', attrs: { level: 3 }, content: [{ type: 'text', text: 'Management Actions' }] },
                  { type: 'bulletList', content: [
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'bold' }], text: 'Export' }, { type: 'text', text: ' – Download subscriber list as CSV' }] }] },
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'bold' }], text: 'Delete' }, { type: 'text', text: ' – Remove subscriber permanently (GDPR compliant)' }] }] },
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'bold' }], text: 'View History' }, { type: 'text', text: ' – See when they subscribed and their preferences' }] }] },
                  ] },
                  { type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'italic' }], text: 'Subscribers can manage their own data via the /newsletter/manage page with email verification.' }] },
                ],
              },
            },
          },
        ],
      },
      {
        title: 'Collecting Subscribers',
        slug: 'collecting-subscribers',
        question: 'How do I add a newsletter signup form to my site?',
        answer_text: 'Use the Newsletter block in any page to add a signup form. Choose from default, card, or minimal styles. Optionally collect names alongside emails. All signups go through double opt-in confirmation.',
        include_in_chat: true,
        answer_json: [
          {
            id: 'kb-collecting-subscribers',
            type: 'text',
            data: {
              content: {
                type: 'doc',
                content: [
                  { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Adding Newsletter Signup Forms' }] },
                  { type: 'paragraph', content: [{ type: 'text', text: 'The Newsletter block makes it easy to grow your email list:' }] },
                  { type: 'orderedList', content: [
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Edit any page and click the ' }, { type: 'text', marks: [{ type: 'bold' }], text: '+ button' }] }] },
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Select ' }, { type: 'text', marks: [{ type: 'bold' }], text: 'Newsletter' }, { type: 'text', text: ' from the block types' }] }] },
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Choose a style variant: Default (with background), Card, or Minimal' }] }] },
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Customize the title, description, and button text' }] }] },
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Optionally enable the Name field' }] }] },
                  ] },
                  { type: 'heading', attrs: { level: 3 }, content: [{ type: 'text', text: 'Placement Tips' }] },
                  { type: 'bulletList', content: [
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Add to footer for site-wide visibility' }] }] },
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Place after valuable content (blog posts, resources)' }] }] },
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Use in popups for higher conversion rates' }] }] },
                  ] },
                ],
              },
            },
          },
        ],
      },
      {
        title: 'Tracking Analytics',
        slug: 'tracking-analytics',
        question: 'How do I track newsletter performance and analytics?',
        answer_text: 'Each campaign shows detailed analytics including sent count, open rate, click rate, and unique opens/clicks. View aggregate stats on the Newsletter dashboard. Link clicks are tracked to show which content resonates.',
        include_in_chat: true,
        answer_json: [
          {
            id: 'kb-tracking-analytics',
            type: 'text',
            data: {
              content: {
                type: 'doc',
                content: [
                  { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Newsletter Analytics' }] },
                  { type: 'paragraph', content: [{ type: 'text', text: 'Understanding your email performance helps you improve engagement over time:' }] },
                  { type: 'heading', attrs: { level: 3 }, content: [{ type: 'text', text: 'Key Metrics' }] },
                  { type: 'bulletList', content: [
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'bold' }], text: 'Sent Count' }, { type: 'text', text: ' – Number of emails successfully delivered' }] }] },
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'bold' }], text: 'Open Rate' }, { type: 'text', text: ' – Percentage of recipients who opened the email' }] }] },
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'bold' }], text: 'Unique Opens' }, { type: 'text', text: ' – Number of individual recipients who opened' }] }] },
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'bold' }], text: 'Click Rate' }, { type: 'text', text: ' – Percentage who clicked any link in the email' }] }] },
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'bold' }], text: 'Unique Clicks' }, { type: 'text', text: ' – Number of individuals who clicked' }] }] },
                  ] },
                  { type: 'heading', attrs: { level: 3 }, content: [{ type: 'text', text: 'Benchmarks' }] },
                  { type: 'bulletList', content: [
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Average open rate: 20-25%' }] }] },
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Average click rate: 2-5%' }] }] },
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Good performers exceed 30% opens and 5% clicks' }] }] },
                  ] },
                  { type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'italic' }], text: 'Tip: Test different subject lines and send times to improve your metrics.' }] },
                ],
              },
            },
          },
        ],
      },
      {
        title: 'GDPR Compliance',
        slug: 'gdpr-compliance',
        question: 'Is the newsletter module GDPR compliant?',
        answer_text: 'Yes. PezCMS includes double opt-in confirmation, automatic unsubscribe links, data export functionality, and complete data deletion. Subscribers can manage their preferences via a secure self-service page.',
        include_in_chat: true,
        answer_json: [
          {
            id: 'kb-gdpr-compliance',
            type: 'text',
            data: {
              content: {
                type: 'doc',
                content: [
                  { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'GDPR Compliance' }] },
                  { type: 'paragraph', content: [{ type: 'text', text: 'The Newsletter module is designed with privacy regulations in mind:' }] },
                  { type: 'heading', attrs: { level: 3 }, content: [{ type: 'text', text: 'Built-in Compliance Features' }] },
                  { type: 'bulletList', content: [
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'bold' }], text: 'Double Opt-in' }, { type: 'text', text: ' – Subscribers must confirm their email before receiving newsletters' }] }] },
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'bold' }], text: 'Unsubscribe Links' }, { type: 'text', text: ' – Every email includes a one-click unsubscribe option' }] }] },
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'bold' }], text: 'Data Export' }, { type: 'text', text: ' – Subscribers can download all their stored data' }] }] },
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'bold' }], text: 'Right to Erasure' }, { type: 'text', text: ' – Complete data deletion on request' }] }] },
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'bold' }], text: 'Self-Service Portal' }, { type: 'text', text: ' – Secure page at /newsletter/manage for subscriber control' }] }] },
                  ] },
                  { type: 'heading', attrs: { level: 3 }, content: [{ type: 'text', text: 'Subscriber Rights' }] },
                  { type: 'paragraph', content: [{ type: 'text', text: 'Subscribers can visit /newsletter/manage, enter their email, and receive a secure link to:' }] },
                  { type: 'bulletList', content: [
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'View their subscription status and history' }] }] },
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Export their personal data as JSON' }] }] },
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Permanently delete all their data' }] }] },
                  ] },
                ],
              },
            },
          },
        ],
      },
      {
        title: 'Email Delivery Setup',
        slug: 'email-delivery-setup',
        question: 'How do I configure email delivery for newsletters?',
        answer_text: 'Newsletter sending requires a Resend API key configured in your environment. Go to Settings → Integrations to add your RESEND_API_KEY. Resend handles email delivery with high deliverability and real-time tracking.',
        include_in_chat: true,
        answer_json: [
          {
            id: 'kb-email-delivery',
            type: 'text',
            data: {
              content: {
                type: 'doc',
                content: [
                  { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Email Delivery Configuration' }] },
                  { type: 'paragraph', content: [{ type: 'text', text: 'PezCMS uses Resend for reliable email delivery with high inbox placement rates.' }] },
                  { type: 'heading', attrs: { level: 3 }, content: [{ type: 'text', text: 'Setup Steps' }] },
                  { type: 'orderedList', content: [
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Create an account at ' }, { type: 'text', marks: [{ type: 'bold' }], text: 'resend.com' }] }] },
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Verify your sending domain for better deliverability' }] }] },
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Generate an API key in the Resend dashboard' }] }] },
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Add the ' }, { type: 'text', marks: [{ type: 'bold' }], text: 'RESEND_API_KEY' }, { type: 'text', text: ' to your environment secrets' }] }] },
                  ] },
                  { type: 'heading', attrs: { level: 3 }, content: [{ type: 'text', text: 'Deliverability Tips' }] },
                  { type: 'bulletList', content: [
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Set up SPF, DKIM, and DMARC records for your domain' }] }] },
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Use a consistent "from" address' }] }] },
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Avoid spam trigger words in subject lines' }] }] },
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Keep your subscriber list clean by removing bounces' }] }] },
                  ] },
                ],
              },
            },
          },
        ],
      },
    ],
  },

  // ===== GLOBAL BLOCKS =====
  {
    name: 'Global Blocks',
    slug: 'global-blocks',
    description: 'Manage reusable header, footer, and popup components across your site.',
    icon: 'LayoutTemplate',
    articles: [
      {
        title: 'Global Blocks Overview',
        slug: 'global-blocks-overview',
        question: 'What are Global Blocks and how do they work?',
        answer_text: 'Global Blocks are reusable components that appear across multiple pages. Headers and footers are the most common examples. Edit once, update everywhere – saving time and ensuring consistency.',
        is_featured: true,
        include_in_chat: true,
        answer_json: [
          {
            id: 'kb-global-overview',
            type: 'text',
            data: {
              content: {
                type: 'doc',
                content: [
                  { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Global Blocks Overview' }] },
                  { type: 'paragraph', content: [{ type: 'text', text: 'Global Blocks let you create components that appear consistently across your entire site:' }] },
                  { type: 'heading', attrs: { level: 3 }, content: [{ type: 'text', text: 'Available Slots' }] },
                  { type: 'bulletList', content: [
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'bold' }], text: 'Header' }, { type: 'text', text: ' – Navigation bar at the top of every page' }] }] },
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'bold' }], text: 'Footer' }, { type: 'text', text: ' – Site footer with links, contact info, and branding' }] }] },
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'bold' }], text: 'Popup' }, { type: 'text', text: ' – Modal overlays for announcements, promotions, or lead capture' }] }] },
                  ] },
                  { type: 'heading', attrs: { level: 3 }, content: [{ type: 'text', text: 'Key Benefits' }] },
                  { type: 'bulletList', content: [
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Edit once, update everywhere' }] }] },
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Maintain consistent branding across all pages' }] }] },
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Enable/disable blocks without deleting them' }] }] },
                  ] },
                  { type: 'paragraph', content: [{ type: 'text', text: 'Access Global Blocks via ' }, { type: 'text', marks: [{ type: 'bold' }], text: 'Admin → Global Blocks' }, { type: 'text', text: '.' }] },
                ],
              },
            },
          },
        ],
      },
      {
        title: 'Managing Headers',
        slug: 'managing-headers',
        question: 'How do I create and customize the site header?',
        answer_text: 'Go to Admin → Global Blocks and create a Header block. Add your logo, navigation links, and optional CTA button. The header automatically appears on all public pages and includes mobile-responsive navigation.',
        is_featured: true,
        include_in_chat: true,
        answer_json: [
          {
            id: 'kb-managing-headers',
            type: 'text',
            data: {
              content: {
                type: 'doc',
                content: [
                  { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Managing Site Headers' }] },
                  { type: 'paragraph', content: [{ type: 'text', text: 'Create a professional header that appears on every page:' }] },
                  { type: 'orderedList', content: [
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Go to ' }, { type: 'text', marks: [{ type: 'bold' }], text: 'Admin → Global Blocks' }] }] },
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Click ' }, { type: 'text', marks: [{ type: 'bold' }], text: 'New Block' }, { type: 'text', text: ' and select Header as the slot' }] }] },
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Upload your logo or enter your site name' }] }] },
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Navigation links are pulled from your published pages automatically' }] }] },
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Add an optional CTA button (e.g., "Contact Us", "Get Started")' }] }] },
                  ] },
                  { type: 'heading', attrs: { level: 3 }, content: [{ type: 'text', text: 'Header Options' }] },
                  { type: 'bulletList', content: [
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'bold' }], text: 'Logo' }, { type: 'text', text: ' – Upload an image or use text-based branding' }] }] },
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'bold' }], text: 'Navigation Style' }, { type: 'text', text: ' – Horizontal links with mobile hamburger menu' }] }] },
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'bold' }], text: 'CTA Button' }, { type: 'text', text: ' – Prominent action button with custom text and link' }] }] },
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'bold' }], text: 'Theme Toggle' }, { type: 'text', text: ' – Optional dark/light mode switcher' }] }] },
                  ] },
                ],
              },
            },
          },
        ],
      },
      {
        title: 'Managing Footers',
        slug: 'managing-footers',
        question: 'How do I create and customize the site footer?',
        answer_text: 'Create a Footer block in Global Blocks. Add columns for navigation, contact information, social links, and copyright text. Choose from multiple layout variants to match your design.',
        include_in_chat: true,
        answer_json: [
          {
            id: 'kb-managing-footers',
            type: 'text',
            data: {
              content: {
                type: 'doc',
                content: [
                  { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Managing Site Footers' }] },
                  { type: 'paragraph', content: [{ type: 'text', text: 'Build a comprehensive footer with all essential information:' }] },
                  { type: 'heading', attrs: { level: 3 }, content: [{ type: 'text', text: 'Footer Elements' }] },
                  { type: 'bulletList', content: [
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'bold' }], text: 'Company Info' }, { type: 'text', text: ' – Logo, description, and tagline' }] }] },
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'bold' }], text: 'Navigation Columns' }, { type: 'text', text: ' – Grouped links (Products, Company, Resources, etc.)' }] }] },
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'bold' }], text: 'Contact Details' }, { type: 'text', text: ' – Address, phone, and email' }] }] },
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'bold' }], text: 'Social Links' }, { type: 'text', text: ' – Icons linking to your social profiles' }] }] },
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'bold' }], text: 'Copyright' }, { type: 'text', text: ' – Legal text with auto-updating year' }] }] },
                  ] },
                  { type: 'heading', attrs: { level: 3 }, content: [{ type: 'text', text: 'Layout Variants' }] },
                  { type: 'bulletList', content: [
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'bold' }], text: 'Standard' }, { type: 'text', text: ' – Multi-column layout with all sections' }] }] },
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'bold' }], text: 'Minimal' }, { type: 'text', text: ' – Simple copyright and essential links only' }] }] },
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'bold' }], text: 'Centered' }, { type: 'text', text: ' – Logo-focused design with centered content' }] }] },
                  ] },
                ],
              },
            },
          },
        ],
      },
      {
        title: 'Creating Popups',
        slug: 'creating-popups',
        question: 'How do I create popup announcements or modals?',
        answer_text: 'Add a Popup block in Global Blocks. Configure trigger timing (delay, exit intent), display rules (once per session, always), and content. Great for promotions, cookie notices, or newsletter signups.',
        include_in_chat: true,
        answer_json: [
          {
            id: 'kb-creating-popups',
            type: 'text',
            data: {
              content: {
                type: 'doc',
                content: [
                  { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Creating Popup Modals' }] },
                  { type: 'paragraph', content: [{ type: 'text', text: 'Popups capture attention for important announcements or conversions:' }] },
                  { type: 'heading', attrs: { level: 3 }, content: [{ type: 'text', text: 'Popup Configuration' }] },
                  { type: 'bulletList', content: [
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'bold' }], text: 'Title & Content' }, { type: 'text', text: ' – Headline and body text for your message' }] }] },
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'bold' }], text: 'Image' }, { type: 'text', text: ' – Optional visual to grab attention' }] }] },
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'bold' }], text: 'CTA Button' }, { type: 'text', text: ' – Action button with custom text and link' }] }] },
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'bold' }], text: 'Delay' }, { type: 'text', text: ' – Seconds to wait before showing' }] }] },
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'bold' }], text: 'Frequency' }, { type: 'text', text: ' – Show once per session or every page load' }] }] },
                  ] },
                  { type: 'heading', attrs: { level: 3 }, content: [{ type: 'text', text: 'Common Use Cases' }] },
                  { type: 'bulletList', content: [
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Newsletter signup incentives' }] }] },
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Limited-time promotions or sales' }] }] },
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Important announcements or updates' }] }] },
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Exit-intent offers' }] }] },
                  ] },
                  { type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'italic' }], text: 'Tip: Use sparingly – too many popups frustrate visitors.' }] },
                ],
              },
            },
          },
        ],
      },
      {
        title: 'Enabling and Disabling Blocks',
        slug: 'enabling-disabling-blocks',
        question: 'How do I temporarily hide a global block?',
        answer_text: 'Toggle the Active switch on any global block to enable or disable it. Disabled blocks are preserved but not rendered on the site. Useful for seasonal content or testing new designs.',
        include_in_chat: true,
        answer_json: [
          {
            id: 'kb-enabling-disabling',
            type: 'text',
            data: {
              content: {
                type: 'doc',
                content: [
                  { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Enabling and Disabling Blocks' }] },
                  { type: 'paragraph', content: [{ type: 'text', text: 'Control which global blocks appear on your site without deleting them:' }] },
                  { type: 'heading', attrs: { level: 3 }, content: [{ type: 'text', text: 'How to Toggle' }] },
                  { type: 'orderedList', content: [
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Go to ' }, { type: 'text', marks: [{ type: 'bold' }], text: 'Admin → Global Blocks' }] }] },
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Find the block you want to toggle' }] }] },
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Click the ' }, { type: 'text', marks: [{ type: 'bold' }], text: 'Active toggle' }, { type: 'text', text: ' to enable/disable' }] }] },
                  ] },
                  { type: 'heading', attrs: { level: 3 }, content: [{ type: 'text', text: 'When to Use' }] },
                  { type: 'bulletList', content: [
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'bold' }], text: 'Seasonal Content' }, { type: 'text', text: ' – Holiday promotions, event announcements' }] }] },
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'bold' }], text: 'A/B Testing' }, { type: 'text', text: ' – Compare different header or footer designs' }] }] },
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'bold' }], text: 'Maintenance' }, { type: 'text', text: ' – Hide elements while making updates' }] }] },
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'bold' }], text: 'Troubleshooting' }, { type: 'text', text: ' – Isolate issues by disabling blocks' }] }] },
                  ] },
                ],
              },
            },
          },
        ],
      },
      {
        title: 'Multiple Blocks Per Slot',
        slug: 'multiple-blocks-per-slot',
        question: 'Can I have multiple headers or footers?',
        answer_text: 'Yes, you can create multiple blocks for each slot, but only one can be active at a time. This lets you prepare alternative designs and switch between them instantly without rebuilding.',
        include_in_chat: true,
        answer_json: [
          {
            id: 'kb-multiple-blocks',
            type: 'text',
            data: {
              content: {
                type: 'doc',
                content: [
                  { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Multiple Blocks Per Slot' }] },
                  { type: 'paragraph', content: [{ type: 'text', text: 'Create variations for different scenarios:' }] },
                  { type: 'heading', attrs: { level: 3 }, content: [{ type: 'text', text: 'How It Works' }] },
                  { type: 'bulletList', content: [
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Create multiple blocks for the same slot (e.g., two headers)' }] }] },
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Only one block per slot can be active' }] }] },
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Activating one automatically deactivates others in that slot' }] }] },
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Switch instantly without rebuilding content' }] }] },
                  ] },
                  { type: 'heading', attrs: { level: 3 }, content: [{ type: 'text', text: 'Example Use Cases' }] },
                  { type: 'bulletList', content: [
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'bold' }], text: 'Campaign Headers' }, { type: 'text', text: ' – Special header for product launches' }] }] },
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'bold' }], text: 'Holiday Footers' }, { type: 'text', text: ' – Seasonal footer with festive branding' }] }] },
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'bold' }], text: 'Event Popups' }, { type: 'text', text: ' – Different popups for different promotions' }] }] },
                  ] },
                ],
              },
            },
          },
        ],
      },
    ],
  },

  // ===== BRANDING & THEMING =====
  {
    name: 'Branding & Theming',
    slug: 'branding-theming',
    description: 'Customize colors, fonts, logos, and visual identity across your site.',
    icon: 'Palette',
    articles: [
      {
        title: 'Branding Overview',
        slug: 'branding-overview',
        question: 'How do I customize the look and feel of my site?',
        answer_text: 'Go to Admin → Branding to configure your site name, logo, colors, and fonts. Changes apply site-wide instantly, ensuring consistent branding across all pages.',
        is_featured: true,
        include_in_chat: true,
        answer_json: [
          {
            id: 'kb-branding-overview',
            type: 'text',
            data: {
              content: {
                type: 'doc',
                content: [
                  { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Branding Overview' }] },
                  { type: 'paragraph', content: [{ type: 'text', text: 'The Branding settings let you define your visual identity:' }] },
                  { type: 'heading', attrs: { level: 3 }, content: [{ type: 'text', text: 'Branding Elements' }] },
                  { type: 'bulletList', content: [
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'bold' }], text: 'Site Name' }, { type: 'text', text: ' – Your brand or company name' }] }] },
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'bold' }], text: 'Logo' }, { type: 'text', text: ' – Primary logo for header and branding' }] }] },
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'bold' }], text: 'Favicon' }, { type: 'text', text: ' – Small icon shown in browser tabs' }] }] },
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'bold' }], text: 'Color Palette' }, { type: 'text', text: ' – Primary, secondary, and accent colors' }] }] },
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'bold' }], text: 'Typography' }, { type: 'text', text: ' – Heading and body font families' }] }] },
                  ] },
                  { type: 'paragraph', content: [{ type: 'text', text: 'Access branding settings via ' }, { type: 'text', marks: [{ type: 'bold' }], text: 'Admin → Branding' }, { type: 'text', text: '.' }] },
                ],
              },
            },
          },
        ],
      },
      {
        title: 'Setting Up Your Logo',
        slug: 'setting-up-logo',
        question: 'How do I add my logo to the site?',
        answer_text: 'Go to Admin → Branding and upload your logo image. For best results, use a PNG with transparent background. The logo appears in the header, footer, and anywhere branding is displayed.',
        is_featured: true,
        include_in_chat: true,
        answer_json: [
          {
            id: 'kb-setting-up-logo',
            type: 'text',
            data: {
              content: {
                type: 'doc',
                content: [
                  { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Setting Up Your Logo' }] },
                  { type: 'paragraph', content: [{ type: 'text', text: 'Your logo is central to your brand identity:' }] },
                  { type: 'heading', attrs: { level: 3 }, content: [{ type: 'text', text: 'Logo Requirements' }] },
                  { type: 'bulletList', content: [
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'bold' }], text: 'Format' }, { type: 'text', text: ' – PNG (preferred for transparency) or SVG' }] }] },
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'bold' }], text: 'Size' }, { type: 'text', text: ' – Recommended 200-400px wide, auto height' }] }] },
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'bold' }], text: 'Background' }, { type: 'text', text: ' – Transparent for flexibility on different backgrounds' }] }] },
                  ] },
                  { type: 'heading', attrs: { level: 3 }, content: [{ type: 'text', text: 'Upload Steps' }] },
                  { type: 'orderedList', content: [
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Navigate to ' }, { type: 'text', marks: [{ type: 'bold' }], text: 'Admin → Branding' }] }] },
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Click on the logo upload area' }] }] },
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Select your logo file from your computer' }] }] },
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Click ' }, { type: 'text', marks: [{ type: 'bold' }], text: 'Save' }, { type: 'text', text: ' to apply changes' }] }] },
                  ] },
                  { type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'italic' }], text: 'Tip: Also upload a favicon (small square icon) for browser tabs.' }] },
                ],
              },
            },
          },
        ],
      },
      {
        title: 'Configuring Colors',
        slug: 'configuring-colors',
        question: 'How do I change the color scheme of my site?',
        answer_text: 'In Admin → Branding, set your primary color (main brand color), secondary color (accents), and background colors. PezCMS automatically generates complementary shades for buttons, links, and UI elements.',
        include_in_chat: true,
        answer_json: [
          {
            id: 'kb-configuring-colors',
            type: 'text',
            data: {
              content: {
                type: 'doc',
                content: [
                  { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Configuring Colors' }] },
                  { type: 'paragraph', content: [{ type: 'text', text: 'Define your color palette for consistent branding:' }] },
                  { type: 'heading', attrs: { level: 3 }, content: [{ type: 'text', text: 'Color Settings' }] },
                  { type: 'bulletList', content: [
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'bold' }], text: 'Primary Color' }, { type: 'text', text: ' – Main brand color used for buttons, links, and accents' }] }] },
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'bold' }], text: 'Secondary Color' }, { type: 'text', text: ' – Supporting color for secondary actions and highlights' }] }] },
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'bold' }], text: 'Accent Color' }, { type: 'text', text: ' – Used for special elements and call-to-action emphasis' }] }] },
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'bold' }], text: 'Background' }, { type: 'text', text: ' – Page background color' }] }] },
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'bold' }], text: 'Text Color' }, { type: 'text', text: ' – Default text color for readability' }] }] },
                  ] },
                  { type: 'heading', attrs: { level: 3 }, content: [{ type: 'text', text: 'Best Practices' }] },
                  { type: 'bulletList', content: [
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Ensure sufficient contrast between text and background' }] }] },
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Use your primary color sparingly for maximum impact' }] }] },
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Test colors in both light and dark modes' }] }] },
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Consider accessibility – aim for WCAG AA compliance' }] }] },
                  ] },
                ],
              },
            },
          },
        ],
      },
      {
        title: 'Typography and Fonts',
        slug: 'typography-fonts',
        question: 'How do I change the fonts on my site?',
        answer_text: 'Go to Admin → Branding and select fonts for headings and body text. Choose from Google Fonts or system fonts. Different fonts for headings and body create visual hierarchy and interest.',
        include_in_chat: true,
        answer_json: [
          {
            id: 'kb-typography-fonts',
            type: 'text',
            data: {
              content: {
                type: 'doc',
                content: [
                  { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Typography and Fonts' }] },
                  { type: 'paragraph', content: [{ type: 'text', text: 'Typography shapes your brand personality:' }] },
                  { type: 'heading', attrs: { level: 3 }, content: [{ type: 'text', text: 'Font Settings' }] },
                  { type: 'bulletList', content: [
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'bold' }], text: 'Heading Font' }, { type: 'text', text: ' – Used for H1-H6 headings, often more distinctive' }] }] },
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'bold' }], text: 'Body Font' }, { type: 'text', text: ' – Used for paragraphs and general text, prioritize readability' }] }] },
                  ] },
                  { type: 'heading', attrs: { level: 3 }, content: [{ type: 'text', text: 'Font Pairing Tips' }] },
                  { type: 'bulletList', content: [
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Pair a decorative heading font with a clean body font' }] }] },
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Limit to 2-3 fonts maximum for cohesion' }] }] },
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Consider font loading speed – fewer weights load faster' }] }] },
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Test on mobile – some fonts are less readable on small screens' }] }] },
                  ] },
                  { type: 'heading', attrs: { level: 3 }, content: [{ type: 'text', text: 'Popular Combinations' }] },
                  { type: 'bulletList', content: [
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Playfair Display (headings) + Inter (body) – Classic elegance' }] }] },
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Montserrat (headings) + Open Sans (body) – Modern professional' }] }] },
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Poppins (both) – Clean and versatile' }] }] },
                  ] },
                ],
              },
            },
          },
        ],
      },
      {
        title: 'Dark Mode Support',
        slug: 'dark-mode-support',
        question: 'Does PezCMS support dark mode?',
        answer_text: 'Yes, PezCMS includes built-in dark mode. Visitors can toggle between light and dark themes using the theme switcher. Colors automatically adapt to maintain readability and visual appeal.',
        include_in_chat: true,
        answer_json: [
          {
            id: 'kb-dark-mode',
            type: 'text',
            data: {
              content: {
                type: 'doc',
                content: [
                  { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Dark Mode Support' }] },
                  { type: 'paragraph', content: [{ type: 'text', text: 'PezCMS provides seamless dark mode for better user experience:' }] },
                  { type: 'heading', attrs: { level: 3 }, content: [{ type: 'text', text: 'How It Works' }] },
                  { type: 'bulletList', content: [
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Visitors can toggle themes via the theme switcher' }] }] },
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'System preference detection automatically applies preferred theme' }] }] },
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Theme preference is saved for return visits' }] }] },
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'All blocks and components adapt automatically' }] }] },
                  ] },
                  { type: 'heading', attrs: { level: 3 }, content: [{ type: 'text', text: 'Design Considerations' }] },
                  { type: 'bulletList', content: [
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Use logos with transparent backgrounds that work on both themes' }] }] },
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Avoid pure white (#fff) or pure black (#000) for softer contrast' }] }] },
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Test images and graphics in both modes' }] }] },
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Consider providing alternate logo versions if needed' }] }] },
                  ] },
                ],
              },
            },
          },
        ],
      },
      {
        title: 'Brand Consistency',
        slug: 'brand-consistency',
        question: 'How do I maintain consistent branding across all pages?',
        answer_text: 'Use Global Blocks for headers and footers, set brand colors and fonts in Branding settings, and use the same image styles throughout. PezCMS applies your branding automatically to all components.',
        include_in_chat: true,
        answer_json: [
          {
            id: 'kb-brand-consistency',
            type: 'text',
            data: {
              content: {
                type: 'doc',
                content: [
                  { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Maintaining Brand Consistency' }] },
                  { type: 'paragraph', content: [{ type: 'text', text: 'Consistent branding builds trust and recognition:' }] },
                  { type: 'heading', attrs: { level: 3 }, content: [{ type: 'text', text: 'Consistency Checklist' }] },
                  { type: 'bulletList', content: [
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'bold' }], text: 'Logo Usage' }, { type: 'text', text: ' – Same logo placement and size across pages' }] }] },
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'bold' }], text: 'Color Palette' }, { type: 'text', text: ' – Stick to defined brand colors' }] }] },
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'bold' }], text: 'Typography' }, { type: 'text', text: ' – Use the same fonts consistently' }] }] },
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'bold' }], text: 'Image Style' }, { type: 'text', text: ' – Similar photography style and treatments' }] }] },
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'bold' }], text: 'Voice and Tone' }, { type: 'text', text: ' – Consistent writing style across content' }] }] },
                  ] },
                  { type: 'heading', attrs: { level: 3 }, content: [{ type: 'text', text: 'PezCMS Features That Help' }] },
                  { type: 'bulletList', content: [
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Global Blocks ensure headers and footers are identical everywhere' }] }] },
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Branding settings apply colors and fonts site-wide' }] }] },
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Media Library keeps all assets organized in one place' }] }] },
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'AI writing assistant can match your brand voice' }] }] },
                  ] },
                ],
              },
            },
          },
        ],
      },
      {
        title: 'Favicon Setup',
        slug: 'favicon-setup',
        question: 'How do I add a favicon to my site?',
        answer_text: 'Upload a favicon in Admin → Branding. Use a square image (recommended 512x512px) in PNG format. The favicon appears in browser tabs, bookmarks, and mobile home screens.',
        include_in_chat: true,
        answer_json: [
          {
            id: 'kb-favicon-setup',
            type: 'text',
            data: {
              content: {
                type: 'doc',
                content: [
                  { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Favicon Setup' }] },
                  { type: 'paragraph', content: [{ type: 'text', text: 'A favicon is the small icon that represents your site:' }] },
                  { type: 'heading', attrs: { level: 3 }, content: [{ type: 'text', text: 'Favicon Requirements' }] },
                  { type: 'bulletList', content: [
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'bold' }], text: 'Size' }, { type: 'text', text: ' – 512x512px recommended (auto-scaled for different uses)' }] }] },
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'bold' }], text: 'Format' }, { type: 'text', text: ' – PNG or ICO format' }] }] },
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'bold' }], text: 'Shape' }, { type: 'text', text: ' – Square aspect ratio' }] }] },
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'bold' }], text: 'Design' }, { type: 'text', text: ' – Simple, recognizable at small sizes' }] }] },
                  ] },
                  { type: 'heading', attrs: { level: 3 }, content: [{ type: 'text', text: 'Where Favicons Appear' }] },
                  { type: 'bulletList', content: [
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Browser tabs' }] }] },
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Bookmark lists' }] }] },
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Mobile home screen shortcuts' }] }] },
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Search engine results (sometimes)' }] }] },
                  ] },
                  { type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'italic' }], text: 'Tip: Use a simplified version of your logo or a single iconic element.' }] },
                ],
              },
            },
          },
        ],
      },
    ],
  },

  // ===== MODULES OVERVIEW =====
  {
    name: 'Modules Overview',
    slug: 'modules-overview',
    description: 'Comprehensive guide to all available PezCMS modules and their features.',
    icon: 'LayoutGrid',
    articles: [
      {
        title: 'Modules System',
        slug: 'modules-system',
        question: 'What is the PezCMS modules system?',
        answer_text: 'PezCMS uses a modular architecture where features can be enabled or disabled based on your needs. This keeps the admin interface clean and focused while allowing you to expand functionality as required.',
        is_featured: true,
        include_in_chat: true,
        answer_json: [
          {
            id: 'kb-modules-system',
            type: 'text',
            data: {
              content: {
                type: 'doc',
                content: [
                  { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'PezCMS Modules System' }] },
                  { type: 'paragraph', content: [{ type: 'text', text: 'PezCMS is built on a modular architecture that lets you enable only the features you need:' }] },
                  { type: 'heading', attrs: { level: 3 }, content: [{ type: 'text', text: 'Module Categories' }] },
                  { type: 'bulletList', content: [
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'bold' }], text: 'Content' }, { type: 'text', text: ' – Pages, Blog, Knowledge Base' }] }] },
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'bold' }], text: 'Communication' }, { type: 'text', text: ' – AI Chat, Newsletter' }] }] },
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'bold' }], text: 'Data' }, { type: 'text', text: ' – Forms, Leads, Deals, Companies, Products, Orders, Media Library' }] }] },
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'bold' }], text: 'System' }, { type: 'text', text: ' – Content Hub, Global Elements' }] }] },
                  ] },
                  { type: 'heading', attrs: { level: 3 }, content: [{ type: 'text', text: 'Managing Modules' }] },
                  { type: 'orderedList', content: [
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Go to ' }, { type: 'text', marks: [{ type: 'bold' }], text: 'Admin → Modules' }] }] },
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Toggle modules on/off as needed' }] }] },
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Core modules (Pages, Media Library) cannot be disabled' }] }] },
                  ] },
                  { type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'italic' }], text: 'Tip: Start with core modules and enable additional ones as your needs grow.' }] },
                ],
              },
            },
          },
        ],
      },
      {
        title: 'Pages Module',
        slug: 'pages-module',
        question: 'What is the Pages module?',
        answer_text: 'The Pages module is the core content creation system in PezCMS. It provides a visual block editor for creating web pages with 27+ block types, version history, scheduled publishing, and SEO settings.',
        is_featured: true,
        include_in_chat: true,
        answer_json: [
          {
            id: 'kb-pages-module',
            type: 'text',
            data: {
              content: {
                type: 'doc',
                content: [
                  { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Pages Module' }] },
                  { type: 'paragraph', content: [{ type: 'text', text: 'The Pages module is the foundation of PezCMS, enabling visual content creation:' }] },
                  { type: 'heading', attrs: { level: 3 }, content: [{ type: 'text', text: 'Key Features' }] },
                  { type: 'bulletList', content: [
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'bold' }], text: 'Block Editor' }, { type: 'text', text: ' – Drag-and-drop interface with 27+ block types' }] }] },
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'bold' }], text: 'Version History' }, { type: 'text', text: ' – Every save creates a restorable version' }] }] },
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'bold' }], text: 'Scheduled Publishing' }, { type: 'text', text: ' – Set pages to go live at specific times' }] }] },
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'bold' }], text: 'SEO Settings' }, { type: 'text', text: ' – Meta titles, descriptions, and Open Graph images' }] }] },
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'bold' }], text: 'Preview Mode' }, { type: 'text', text: ' – See changes before publishing' }] }] },
                  ] },
                  { type: 'heading', attrs: { level: 3 }, content: [{ type: 'text', text: 'Page Status Flow' }] },
                  { type: 'paragraph', content: [{ type: 'text', text: 'Draft → Reviewing → Published → Archived' }] },
                  { type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'italic' }], text: 'This is a core module and cannot be disabled.' }] },
                ],
              },
            },
          },
        ],
      },
      {
        title: 'Blog Module',
        slug: 'blog-module',
        question: 'What is the Blog module?',
        answer_text: 'The Blog module provides full blogging capabilities with categories, tags, author profiles, RSS feed, and featured posts. It uses the same block editor as pages for creating rich blog content.',
        include_in_chat: true,
        answer_json: [
          {
            id: 'kb-blog-module',
            type: 'text',
            data: {
              content: {
                type: 'doc',
                content: [
                  { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Blog Module' }] },
                  { type: 'paragraph', content: [{ type: 'text', text: 'A complete blogging platform built into PezCMS:' }] },
                  { type: 'heading', attrs: { level: 3 }, content: [{ type: 'text', text: 'Features' }] },
                  { type: 'bulletList', content: [
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'bold' }], text: 'Categories & Tags' }, { type: 'text', text: ' – Organize posts with hierarchical categories and flexible tags' }] }] },
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'bold' }], text: 'Author Profiles' }, { type: 'text', text: ' – Show author bio, photo, and other posts' }] }] },
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'bold' }], text: 'Featured Posts' }, { type: 'text', text: ' – Highlight important articles' }] }] },
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'bold' }], text: 'RSS Feed' }, { type: 'text', text: ' – Auto-generated feed for subscribers' }] }] },
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'bold' }], text: 'Reading Time' }, { type: 'text', text: ' – Automatic reading time calculation' }] }] },
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'bold' }], text: 'SEO Optimized' }, { type: 'text', text: ' – Built-in SEO settings per post' }] }] },
                  ] },
                  { type: 'heading', attrs: { level: 3 }, content: [{ type: 'text', text: 'Access' }] },
                  { type: 'paragraph', content: [{ type: 'text', text: 'Navigate to Admin → Blog to manage posts, categories, and tags.' }] },
                ],
              },
            },
          },
        ],
      },
      {
        title: 'Knowledge Base Module',
        slug: 'knowledge-base-module',
        question: 'What is the Knowledge Base module?',
        answer_text: 'The Knowledge Base module creates a structured FAQ or help center with categorized articles, search functionality, and optional AI Chat integration for intelligent article retrieval.',
        include_in_chat: true,
        answer_json: [
          {
            id: 'kb-knowledge-base-module',
            type: 'text',
            data: {
              content: {
                type: 'doc',
                content: [
                  { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Knowledge Base Module' }] },
                  { type: 'paragraph', content: [{ type: 'text', text: 'Build a searchable FAQ or help center for your users:' }] },
                  { type: 'heading', attrs: { level: 3 }, content: [{ type: 'text', text: 'Features' }] },
                  { type: 'bulletList', content: [
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'bold' }], text: 'Categories' }, { type: 'text', text: ' – Organize articles by topic with custom icons' }] }] },
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'bold' }], text: 'Rich Content' }, { type: 'text', text: ' – Full block editor for article content' }] }] },
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'bold' }], text: 'Search' }, { type: 'text', text: ' – Built-in search across all articles' }] }] },
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'bold' }], text: 'Feedback' }, { type: 'text', text: ' – Users can rate articles as helpful or not' }] }] },
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'bold' }], text: 'AI Integration' }, { type: 'text', text: ' – Articles can power the AI Chat for automatic answers' }] }] },
                  ] },
                  { type: 'heading', attrs: { level: 3 }, content: [{ type: 'text', text: 'AI Chat Integration' }] },
                  { type: 'paragraph', content: [{ type: 'text', text: 'Toggle "Include in Chat" on articles to use them as context for the AI Chat widget. This enables intelligent, contextual responses based on your knowledge base.' }] },
                ],
              },
            },
          },
        ],
      },
      {
        title: 'AI Chat Module',
        slug: 'ai-chat-module',
        question: 'What is the AI Chat module?',
        answer_text: 'The AI Chat module adds an intelligent chatbot to your site. It uses Context Augmented Generation (CAG) to answer questions based on your Knowledge Base articles, blog posts, and page content.',
        include_in_chat: true,
        answer_json: [
          {
            id: 'kb-ai-chat-module',
            type: 'text',
            data: {
              content: {
                type: 'doc',
                content: [
                  { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'AI Chat Module' }] },
                  { type: 'paragraph', content: [{ type: 'text', text: 'Add an intelligent chatbot that understands your content:' }] },
                  { type: 'heading', attrs: { level: 3 }, content: [{ type: 'text', text: 'Features' }] },
                  { type: 'bulletList', content: [
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'bold' }], text: 'Context Augmented Generation' }, { type: 'text', text: ' – Answers based on your actual content' }] }] },
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'bold' }], text: 'Multiple Providers' }, { type: 'text', text: ' – Lovable AI, Private LLM, or N8N Webhook' }] }] },
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'bold' }], text: 'Conversation History' }, { type: 'text', text: ' – Maintains context across messages' }] }] },
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'bold' }], text: 'Widget or Page' }, { type: 'text', text: ' – Deploy as floating widget or dedicated page' }] }] },
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'bold' }], text: 'Customizable' }, { type: 'text', text: ' – Brand colors, welcome message, and suggested questions' }] }] },
                  ] },
                  { type: 'heading', attrs: { level: 3 }, content: [{ type: 'text', text: 'AI Providers' }] },
                  { type: 'bulletList', content: [
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'bold' }], text: 'Lovable AI' }, { type: 'text', text: ' – No API key required, built-in models' }] }] },
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'bold' }], text: 'Private LLM' }, { type: 'text', text: ' – Self-hosted for HIPAA compliance' }] }] },
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'bold' }], text: 'N8N Webhook' }, { type: 'text', text: ' – Connect to external AI agents' }] }] },
                  ] },
                ],
              },
            },
          },
        ],
      },
      {
        title: 'Newsletter Module',
        slug: 'newsletter-module',
        question: 'What is the Newsletter module?',
        answer_text: 'The Newsletter module enables email marketing with subscriber management, campaign creation, open/click tracking, and GDPR-compliant features like double opt-in and easy unsubscription.',
        include_in_chat: true,
        answer_json: [
          {
            id: 'kb-newsletter-module',
            type: 'text',
            data: {
              content: {
                type: 'doc',
                content: [
                  { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Newsletter Module' }] },
                  { type: 'paragraph', content: [{ type: 'text', text: 'Full-featured email marketing built into PezCMS:' }] },
                  { type: 'heading', attrs: { level: 3 }, content: [{ type: 'text', text: 'Features' }] },
                  { type: 'bulletList', content: [
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'bold' }], text: 'Subscriber Management' }, { type: 'text', text: ' – Import, export, and segment subscribers' }] }] },
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'bold' }], text: 'Campaign Editor' }, { type: 'text', text: ' – Visual editor for creating emails' }] }] },
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'bold' }], text: 'Tracking' }, { type: 'text', text: ' – Open rates, click rates, and link analytics' }] }] },
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'bold' }], text: 'Scheduling' }, { type: 'text', text: ' – Send immediately or schedule for later' }] }] },
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'bold' }], text: 'GDPR Compliant' }, { type: 'text', text: ' – Double opt-in, easy unsubscribe, data export' }] }] },
                  ] },
                  { type: 'heading', attrs: { level: 3 }, content: [{ type: 'text', text: 'Integration' }] },
                  { type: 'paragraph', content: [{ type: 'text', text: 'Uses Resend for email delivery. Add the Newsletter block to any page to collect subscribers.' }] },
                ],
              },
            },
          },
        ],
      },
      {
        title: 'Forms Module',
        slug: 'forms-module',
        question: 'What is the Forms module?',
        answer_text: 'The Forms module collects and manages form submissions from Contact blocks and Form Builder blocks on your pages. View submissions, export data, and optionally convert them to leads.',
        include_in_chat: true,
        answer_json: [
          {
            id: 'kb-forms-module',
            type: 'text',
            data: {
              content: {
                type: 'doc',
                content: [
                  { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Forms Module' }] },
                  { type: 'paragraph', content: [{ type: 'text', text: 'Collect and manage form submissions from your website:' }] },
                  { type: 'heading', attrs: { level: 3 }, content: [{ type: 'text', text: 'Features' }] },
                  { type: 'bulletList', content: [
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'bold' }], text: 'Submission Inbox' }, { type: 'text', text: ' – View all form submissions in one place' }] }] },
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'bold' }], text: 'Form Builder' }, { type: 'text', text: ' – Create custom forms with various field types' }] }] },
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'bold' }], text: 'Contact Forms' }, { type: 'text', text: ' – Pre-built contact form block' }] }] },
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'bold' }], text: 'Export' }, { type: 'text', text: ' – Download submissions as CSV' }] }] },
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'bold' }], text: 'Lead Conversion' }, { type: 'text', text: ' – Optionally create leads from submissions' }] }] },
                  ] },
                  { type: 'heading', attrs: { level: 3 }, content: [{ type: 'text', text: 'Form Blocks' }] },
                  { type: 'paragraph', content: [{ type: 'text', text: 'Use the Contact block for quick contact forms, or the Form Builder block for custom forms with multiple field types.' }] },
                ],
              },
            },
          },
        ],
      },
      {
        title: 'Leads Module',
        slug: 'leads-module',
        question: 'What is the Leads module?',
        answer_text: 'The Leads module provides AI-driven lead management with automatic scoring, qualification summaries, status tracking, and conversion to deals. Leads can come from forms, newsletter signups, or manual entry.',
        include_in_chat: true,
        answer_json: [
          {
            id: 'kb-leads-module',
            type: 'text',
            data: {
              content: {
                type: 'doc',
                content: [
                  { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Leads Module' }] },
                  { type: 'paragraph', content: [{ type: 'text', text: 'AI-powered lead management for sales teams:' }] },
                  { type: 'heading', attrs: { level: 3 }, content: [{ type: 'text', text: 'Features' }] },
                  { type: 'bulletList', content: [
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'bold' }], text: 'AI Qualification' }, { type: 'text', text: ' – Automatic lead scoring and summary generation' }] }] },
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'bold' }], text: 'Status Pipeline' }, { type: 'text', text: ' – Lead → Opportunity → Customer/Lost' }] }] },
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'bold' }], text: 'Activity Tracking' }, { type: 'text', text: ' – Log calls, emails, and meetings' }] }] },
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'bold' }], text: 'Company Linking' }, { type: 'text', text: ' – Associate leads with companies' }] }] },
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'bold' }], text: 'Deal Conversion' }, { type: 'text', text: ' – Convert qualified leads to deals' }] }] },
                  ] },
                  { type: 'heading', attrs: { level: 3 }, content: [{ type: 'text', text: 'Lead Sources' }] },
                  { type: 'paragraph', content: [{ type: 'text', text: 'Leads can be created from form submissions, newsletter signups, chat conversations, CSV import, or manual entry.' }] },
                ],
              },
            },
          },
        ],
      },
      {
        title: 'Deals Module',
        slug: 'deals-module',
        question: 'What is the Deals module?',
        answer_text: 'The Deals module provides pipeline management for sales opportunities. Track deal value, stage, expected close date, and associated products. View deals in a Kanban board or list view.',
        include_in_chat: true,
        answer_json: [
          {
            id: 'kb-deals-module',
            type: 'text',
            data: {
              content: {
                type: 'doc',
                content: [
                  { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Deals Module' }] },
                  { type: 'paragraph', content: [{ type: 'text', text: 'Visual pipeline management for sales opportunities:' }] },
                  { type: 'heading', attrs: { level: 3 }, content: [{ type: 'text', text: 'Features' }] },
                  { type: 'bulletList', content: [
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'bold' }], text: 'Kanban Board' }, { type: 'text', text: ' – Drag-and-drop deal management' }] }] },
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'bold' }], text: 'Deal Stages' }, { type: 'text', text: ' – Proposal → Negotiation → Won/Lost' }] }] },
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'bold' }], text: 'Value Tracking' }, { type: 'text', text: ' – Track deal value in any currency' }] }] },
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'bold' }], text: 'Activity Timeline' }, { type: 'text', text: ' – Log activities and schedule follow-ups' }] }] },
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'bold' }], text: 'Product Linking' }, { type: 'text', text: ' – Associate deals with products' }] }] },
                  ] },
                  { type: 'heading', attrs: { level: 3 }, content: [{ type: 'text', text: 'Pipeline Stages' }] },
                  { type: 'paragraph', content: [{ type: 'text', text: 'Proposal → Negotiation → Closed Won / Closed Lost' }] },
                ],
              },
            },
          },
        ],
      },
      {
        title: 'Companies Module',
        slug: 'companies-module',
        question: 'What is the Companies module?',
        answer_text: 'The Companies module manages organization records with contact information, industry, size, and associated leads. It includes AI-powered company enrichment to automatically populate company details.',
        include_in_chat: true,
        answer_json: [
          {
            id: 'kb-companies-module',
            type: 'text',
            data: {
              content: {
                type: 'doc',
                content: [
                  { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Companies Module' }] },
                  { type: 'paragraph', content: [{ type: 'text', text: 'Manage organization records and contacts:' }] },
                  { type: 'heading', attrs: { level: 3 }, content: [{ type: 'text', text: 'Features' }] },
                  { type: 'bulletList', content: [
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'bold' }], text: 'Company Profiles' }, { type: 'text', text: ' – Store name, website, industry, size, and address' }] }] },
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'bold' }], text: 'AI Enrichment' }, { type: 'text', text: ' – Automatically populate company details from domain' }] }] },
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'bold' }], text: 'Lead Association' }, { type: 'text', text: ' – Link multiple leads to one company' }] }] },
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'bold' }], text: 'Notes' }, { type: 'text', text: ' – Add internal notes about each company' }] }] },
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'bold' }], text: 'Search & Filter' }, { type: 'text', text: ' – Find companies by name, industry, or domain' }] }] },
                  ] },
                  { type: 'heading', attrs: { level: 3 }, content: [{ type: 'text', text: 'AI Company Enrichment' }] },
                  { type: 'paragraph', content: [{ type: 'text', text: 'Enter a company domain and PezCMS will automatically look up industry, size, and other public information.' }] },
                ],
              },
            },
          },
        ],
      },
      {
        title: 'Products Module',
        slug: 'products-module',
        question: 'What is the Products module?',
        answer_text: 'The Products module manages your product catalog with pricing, descriptions, and images. Products can be one-time or recurring (subscriptions) and integrate with Stripe for payments.',
        include_in_chat: true,
        answer_json: [
          {
            id: 'kb-products-module',
            type: 'text',
            data: {
              content: {
                type: 'doc',
                content: [
                  { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Products Module' }] },
                  { type: 'paragraph', content: [{ type: 'text', text: 'Manage your product catalog for deals and e-commerce:' }] },
                  { type: 'heading', attrs: { level: 3 }, content: [{ type: 'text', text: 'Features' }] },
                  { type: 'bulletList', content: [
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'bold' }], text: 'Product Catalog' }, { type: 'text', text: ' – Name, description, price, and images' }] }] },
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'bold' }], text: 'Pricing Types' }, { type: 'text', text: ' – One-time purchases or recurring subscriptions' }] }] },
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'bold' }], text: 'Stripe Integration' }, { type: 'text', text: ' – Sync products with Stripe for checkout' }] }] },
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'bold' }], text: 'Sort Order' }, { type: 'text', text: ' – Control display order on the frontend' }] }] },
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'bold' }], text: 'Active/Inactive' }, { type: 'text', text: ' – Toggle product visibility' }] }] },
                  ] },
                  { type: 'heading', attrs: { level: 3 }, content: [{ type: 'text', text: 'Display Options' }] },
                  { type: 'paragraph', content: [{ type: 'text', text: 'Use the Products block or Pricing block to display products on your pages. Add the Cart block for a complete e-commerce experience.' }] },
                ],
              },
            },
          },
        ],
      },
      {
        title: 'Orders Module',
        slug: 'orders-module',
        question: 'What is the Orders module?',
        answer_text: 'The Orders module tracks e-commerce transactions processed through Stripe. View order details, customer information, payment status, and order items. Requires the Products module.',
        include_in_chat: true,
        answer_json: [
          {
            id: 'kb-orders-module',
            type: 'text',
            data: {
              content: {
                type: 'doc',
                content: [
                  { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Orders Module' }] },
                  { type: 'paragraph', content: [{ type: 'text', text: 'Track and manage e-commerce transactions:' }] },
                  { type: 'heading', attrs: { level: 3 }, content: [{ type: 'text', text: 'Features' }] },
                  { type: 'bulletList', content: [
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'bold' }], text: 'Order Dashboard' }, { type: 'text', text: ' – View all orders with status and totals' }] }] },
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'bold' }], text: 'Order Details' }, { type: 'text', text: ' – Customer info, line items, and payment details' }] }] },
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'bold' }], text: 'Status Tracking' }, { type: 'text', text: ' – Pending, Paid, Cancelled, Refunded' }] }] },
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'bold' }], text: 'Email Confirmations' }, { type: 'text', text: ' – Automatic order confirmation emails' }] }] },
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'bold' }], text: 'Webhooks' }, { type: 'text', text: ' – Trigger actions on order events' }] }] },
                  ] },
                  { type: 'heading', attrs: { level: 3 }, content: [{ type: 'text', text: 'Dependencies' }] },
                  { type: 'paragraph', content: [{ type: 'text', text: 'The Orders module requires the Products module to be enabled. Orders are created automatically when customers complete Stripe checkout.' }] },
                ],
              },
            },
          },
        ],
      },
      {
        title: 'Content Hub Module',
        slug: 'content-hub-module',
        question: 'What is the Content Hub module?',
        answer_text: 'The Content Hub module provides a headless CMS API for accessing your content programmatically. It includes REST endpoints for pages, blog posts, and other content types.',
        include_in_chat: true,
        answer_json: [
          {
            id: 'kb-content-hub-module',
            type: 'text',
            data: {
              content: {
                type: 'doc',
                content: [
                  { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Content Hub Module' }] },
                  { type: 'paragraph', content: [{ type: 'text', text: 'Headless CMS capabilities for developers:' }] },
                  { type: 'heading', attrs: { level: 3 }, content: [{ type: 'text', text: 'Features' }] },
                  { type: 'bulletList', content: [
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'bold' }], text: 'REST API' }, { type: 'text', text: ' – Access all content via REST endpoints' }] }] },
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'bold' }], text: 'Content Types' }, { type: 'text', text: ' – Pages, blog posts, products, KB articles' }] }] },
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'bold' }], text: 'Block JSON' }, { type: 'text', text: ' – Raw block data for custom rendering' }] }] },
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'bold' }], text: 'API Explorer' }, { type: 'text', text: ' – Interactive documentation in the admin' }] }] },
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'bold' }], text: 'Edge Caching' }, { type: 'text', text: ' – Fast response times via CDN caching' }] }] },
                  ] },
                  { type: 'heading', attrs: { level: 3 }, content: [{ type: 'text', text: 'Use Cases' }] },
                  { type: 'paragraph', content: [{ type: 'text', text: 'Build mobile apps, custom frontends, or integrate PezCMS content into existing applications.' }] },
                ],
              },
            },
          },
        ],
      },
      {
        title: 'Global Elements Module',
        slug: 'global-elements-module',
        question: 'What is the Global Elements module?',
        answer_text: 'The Global Elements module manages reusable components like headers and footers that appear on all pages. Edit once, update everywhere. Supports multiple variants for different page types.',
        include_in_chat: true,
        answer_json: [
          {
            id: 'kb-global-elements-module',
            type: 'text',
            data: {
              content: {
                type: 'doc',
                content: [
                  { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Global Elements Module' }] },
                  { type: 'paragraph', content: [{ type: 'text', text: 'Manage reusable components that appear site-wide:' }] },
                  { type: 'heading', attrs: { level: 3 }, content: [{ type: 'text', text: 'Available Elements' }] },
                  { type: 'bulletList', content: [
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'bold' }], text: 'Header' }, { type: 'text', text: ' – Site navigation and logo' }] }] },
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'bold' }], text: 'Footer' }, { type: 'text', text: ' – Links, copyright, and contact info' }] }] },
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'bold' }], text: 'Popup' }, { type: 'text', text: ' – Promotional overlays and modals' }] }] },
                  ] },
                  { type: 'heading', attrs: { level: 3 }, content: [{ type: 'text', text: 'Benefits' }] },
                  { type: 'bulletList', content: [
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Edit once, update everywhere' }] }] },
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Ensures consistent branding' }] }] },
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Reduces maintenance time' }] }] },
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Supports multiple variants' }] }] },
                  ] },
                  { type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'italic' }], text: 'Access via Admin → Global Elements' }] },
                ],
              },
            },
          },
        ],
      },
      {
        title: 'Media Library Module',
        slug: 'media-library-module',
        question: 'What is the Media Library module?',
        answer_text: 'The Media Library module provides centralized management for all images and files. Upload, organize, and reuse media across pages. Includes automatic image optimization and Unsplash integration.',
        include_in_chat: true,
        answer_json: [
          {
            id: 'kb-media-library-module',
            type: 'text',
            data: {
              content: {
                type: 'doc',
                content: [
                  { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Media Library Module' }] },
                  { type: 'paragraph', content: [{ type: 'text', text: 'Central hub for all your media assets:' }] },
                  { type: 'heading', attrs: { level: 3 }, content: [{ type: 'text', text: 'Features' }] },
                  { type: 'bulletList', content: [
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'bold' }], text: 'Upload & Organize' }, { type: 'text', text: ' – Drag-and-drop uploads with folder organization' }] }] },
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'bold' }], text: 'Image Optimization' }, { type: 'text', text: ' – Automatic compression and format conversion' }] }] },
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'bold' }], text: 'Unsplash Integration' }, { type: 'text', text: ' – Search and use royalty-free stock photos' }] }] },
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'bold' }], text: 'Image Cropping' }, { type: 'text', text: ' – Crop images to specific dimensions' }] }] },
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'bold' }], text: 'Reuse Anywhere' }, { type: 'text', text: ' – Pick from library in any image block' }] }] },
                  ] },
                  { type: 'heading', attrs: { level: 3 }, content: [{ type: 'text', text: 'Supported Formats' }] },
                  { type: 'paragraph', content: [{ type: 'text', text: 'JPEG, PNG, GIF, WebP, SVG, and PDF files.' }] },
                  { type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'italic' }], text: 'This is a core module and cannot be disabled.' }] },
                ],
              },
            },
          },
        ],
      },
    ],
  },
];
