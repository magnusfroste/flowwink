// KB Category definition for templates
export interface TemplateKbCategory {
  name: string;
  slug: string;
  description?: string;
  icon?: string;
  articles: TemplateKbArticle[];
}

// KB Article definition for templates
// Note: answer_json is generated from answer_text at import using createDocumentFromText
export interface TemplateKbArticle {
  title: string;
  slug: string;
  question: string;
  answer_text: string;
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
        answer_text: 'PezCMS is a modern, open-source content management system built for speed, simplicity, and flexibility. It combines a visual block editor with a headless API, giving you the best of both worlds. Key features include: Visual Block Editor with 27+ block types, Headless API for custom frontends and mobile apps, Self-Hostable on your own infrastructure, AI-Powered content generation and chat, and Built-in Modules for blog, newsletter, CRM, knowledge base, and e-commerce.',
        is_featured: true,
        include_in_chat: true,
      },
      {
        title: 'Creating Your First Page',
        slug: 'creating-first-page',
        question: 'How do I create my first page in PezCMS?',
        answer_text: 'To create your first page: 1) Navigate to Admin → Pages, 2) Click New Page in the top right, 3) Enter a title for your page, 4) Click the + button to add blocks (Hero, Text, Images, etc.), 5) Arrange and edit blocks as needed, 6) Click Save to save as draft, 7) Click Publish when ready to go live. Tip: Every save creates a version you can restore later if needed.',
        is_featured: true,
        include_in_chat: true,
      },
      {
        title: 'Understanding User Roles',
        slug: 'user-roles',
        question: 'What are the different user roles in PezCMS?',
        answer_text: 'PezCMS has three roles: Writer – Can create and edit their own drafts, submit for review. Approver – Can review content, approve/reject submissions, publish content. Admin – Full access to all features including settings, users, and site configuration.',
        include_in_chat: true,
      },
      {
        title: 'Navigating the Admin',
        slug: 'navigating-admin',
        question: 'How do I navigate the PezCMS admin interface?',
        answer_text: 'The admin sidebar contains all main sections: Pages, Blog, Knowledge Base, CRM, Newsletter, Media Library, and Settings. Use the top bar for quick actions like creating new content. The dashboard shows recent activity and statistics.',
        include_in_chat: true,
      },
    ],
  },
  
  // ===== PAGE EDITING =====
  {
    name: 'Page Editing',
    slug: 'page-editing',
    description: 'Master the block editor and create beautiful pages.',
    icon: 'Edit3',
    articles: [
      {
        title: 'Block Types Overview',
        slug: 'block-types',
        question: 'What types of blocks are available in PezCMS?',
        answer_text: 'PezCMS offers 27+ block types: Layout blocks (Hero, Two Column, Separator), Content blocks (Text, Image, Gallery, Video), Interactive blocks (Form, Contact, Accordion, Tabs), Marketing blocks (CTA, Pricing, Testimonials, Stats), Navigation blocks (Header, Footer, Link Grid), and Special blocks (Products, Booking, Chat, Newsletter).',
        is_featured: true,
        include_in_chat: true,
      },
      {
        title: 'Publishing Workflow',
        slug: 'publishing-workflow',
        question: 'How does the publishing workflow work?',
        answer_text: 'Content goes through Draft → Reviewing → Published → Archived. Writers create drafts and submit for review. Approvers review and can approve, reject, or request changes. Approved content can be published immediately or scheduled. Tip: Use the Schedule feature to publish content at a specific date and time.',
        include_in_chat: true,
      },
      {
        title: 'Version History',
        slug: 'version-history',
        question: 'How does version history work?',
        answer_text: 'Every time you save a page, a new version is created automatically. Go to the Version History panel to see all versions, compare changes, and restore any previous version with one click. Note: Restoring a version creates a new version, so you never lose any history.',
        include_in_chat: true,
      },
      {
        title: 'Media Library',
        slug: 'media-library',
        question: 'How do I manage images and files?',
        answer_text: 'The Media Library stores all uploaded images and files. Access it via Admin → Media. You can upload files, organize them, and reuse them across multiple pages. Images are automatically optimized for web. Supported formats: JPG, PNG, GIF, WebP, SVG for images. PDF, DOC, DOCX, XLS, XLSX for documents.',
        include_in_chat: true,
      },
      {
        title: 'SEO Settings',
        slug: 'seo-settings',
        question: 'How do I configure SEO for my pages?',
        answer_text: 'Each page has SEO settings in the Page Settings dialog. Set the meta title, description, and Open Graph image. PezCMS automatically generates structured data and sitemaps for better search engine visibility. Automatic features include: Sitemap generation at /sitemap.xml, Structured data for rich snippets, and Semantic HTML for better crawling.',
        include_in_chat: true,
      },
      {
        title: 'Blog Management',
        slug: 'blog-management',
        question: 'How do I manage blog posts?',
        answer_text: 'Go to Admin → Blog to manage posts, categories, and tags. Create posts with the same block editor as pages. Set featured images, excerpts, and author information. Schedule posts for future publication. Features include: Categories & Tags for organization, Author profiles with bios and avatars, Featured posts highlighting, RSS Feed generation, and Reading time calculation.',
        include_in_chat: true,
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
        answer_text: 'If your page is not saving: 1) Check Internet Connection – Ensure you have a stable connection, 2) Refresh the Page – Sometimes a simple refresh resolves sync issues, 3) Check for Errors – Look at the browser console (F12) for error messages, 4) Clear Browser Cache – Old cached data can sometimes cause issues, 5) Try Another Browser – Rule out browser-specific issues. Note: Auto-save runs continuously, so recent changes should be preserved even if you lose connection.',
        is_featured: true,
        include_in_chat: true,
      },
      {
        title: 'Images Not Loading',
        slug: 'images-not-loading',
        question: 'Why are my images not showing?',
        answer_text: 'Check if the image URL is correct and accessible. For uploaded images, verify they exist in the Media Library. Large images may take time to load. Try re-uploading if the issue persists.',
        include_in_chat: true,
      },
      {
        title: 'Login Issues',
        slug: 'login-issues',
        question: 'I cannot log in to the admin panel',
        answer_text: 'First, verify your email and password are correct. Check if caps lock is on. Try the "Forgot Password" link to reset your password. If you still cannot log in, contact your administrator to verify your account is active.',
        include_in_chat: true,
      },
    ],
  },

  // ===== AI FEATURES =====
  {
    name: 'AI Features',
    slug: 'ai-features',
    description: 'Leverage AI for content creation and customer support.',
    icon: 'Sparkles',
    articles: [
      {
        title: 'AI Chat Widget',
        slug: 'ai-chat',
        question: 'How does the AI Chat work?',
        answer_text: 'The AI Chat provides intelligent responses based on your Knowledge Base articles and page content. Configure it in Admin → Chat Settings. Choose between Lovable AI (no API key needed), Private LLM (self-hosted), or N8N Webhook (custom integrations). The chat uses Context Augmented Generation to provide accurate answers from your content.',
        is_featured: true,
        include_in_chat: true,
      },
      {
        title: 'AI Text Assistant',
        slug: 'ai-text-assistant',
        question: 'How do I use the AI text generation?',
        answer_text: 'The AI Text Assistant helps you write content faster. In any text editor: 1) Click the AI button in the toolbar, 2) Choose an action (generate, improve, expand, shorten, translate), 3) Enter your prompt or select text to transform, 4) Review the generated content, 5) Accept to insert or regenerate for alternatives. Available actions include: Generate new content, Improve existing text, Expand or shorten content, Translate to other languages, and Fix grammar and spelling.',
        is_featured: true,
        include_in_chat: true,
      },
    ],
  },

  // ===== WEBHOOKS & AUTOMATION =====
  {
    name: 'Webhooks & Automation',
    slug: 'webhooks-automation',
    description: 'Connect PezCMS to external services and automate workflows.',
    icon: 'Webhook',
    articles: [
      {
        title: 'Webhooks Overview',
        slug: 'webhooks-overview',
        question: 'What are webhooks and how do they work?',
        answer_text: 'Webhooks allow PezCMS to notify external services when events occur. When a page is published, form submitted, or order placed, PezCMS sends an HTTP request to your specified URL with event data. Use webhooks to: Sync content to other systems, Trigger email notifications, Update CRM records, Start automation workflows.',
        is_featured: true,
        include_in_chat: true,
      },
      {
        title: 'Creating Webhooks',
        slug: 'creating-webhooks',
        question: 'How do I create a webhook?',
        answer_text: 'Go to Admin → Webhooks → New Webhook. Enter a name, the destination URL, and select which events should trigger it. Available events include: page.published, page.updated, page.deleted, blog_post.published, form.submitted, newsletter.subscribed, booking.submitted, order.created, order.paid.',
        is_featured: true,
        include_in_chat: true,
      },
      {
        title: 'Webhook Events',
        slug: 'webhook-events',
        question: 'What events can trigger webhooks?',
        answer_text: 'PezCMS supports events for pages (published, updated, deleted), blog posts (published, updated, deleted), forms (submitted), newsletter (subscribed, unsubscribed), bookings (submitted), and orders (created, paid, cancelled, refunded).',
        include_in_chat: true,
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
        answer_text: 'Yes! PezCMS is fully headless with a complete REST API. You can fetch pages, blog posts, products, and more. Use the API to build custom frontends, mobile apps, or integrate with other systems. Available endpoints include: Pages, Blog Posts, Products, Knowledge Base, and Settings.',
        is_featured: true,
        include_in_chat: true,
      },
      {
        title: 'Content API Endpoint',
        slug: 'content-api',
        question: 'How do I fetch content from the API?',
        answer_text: 'Use the /functions/v1/content-api endpoint with query parameters for type (page, post, product), slug, and status. Returns JSON with full content blocks that can be rendered in any framework.',
        is_featured: true,
        include_in_chat: true,
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
        answer_text: 'The CRM module helps you manage your sales pipeline with leads, deals, and companies. Track interactions, qualify prospects with AI, and convert leads into customers – all from within your CMS. Key components include: Leads (potential customers), Deals (sales opportunities), Companies (organizations), and Activities (notes, calls, meetings).',
        is_featured: true,
        include_in_chat: true,
      },
      {
        title: 'Managing Leads',
        slug: 'managing-leads',
        question: 'How do I manage leads in PezCMS?',
        answer_text: 'Go to Admin → Leads to see all leads. Leads are automatically created from form submissions. You can filter by status (Lead, Opportunity, Customer, Lost), assign leads to team members, and view lead scores. Lead sources include: Form submissions, Chat conversations, Newsletter signups, Manual entry, and CSV import.',
        is_featured: true,
        include_in_chat: true,
      },
      {
        title: 'Lead Scoring',
        slug: 'lead-scoring',
        question: 'How does lead scoring work?',
        answer_text: 'Leads are scored 0-100 based on activities like page views, form submissions, email opens, and chat engagement. Higher scores indicate more engaged prospects. AI qualification can automatically analyze and summarize lead potential. Scoring activities: Form submission (+20), Chat conversation (+15), Email opened (+5), Link clicked (+10), Pricing page viewed (+25), Booking made (+30).',
        include_in_chat: true,
      },
      {
        title: 'Creating Deals',
        slug: 'creating-deals',
        question: 'How do I create and manage deals?',
        answer_text: 'Click "Create Deal" from a lead\'s detail page. Enter the deal value, expected close date, and assign a product if applicable. Deals flow through stages: Proposal → Negotiation → Closed Won/Lost. Track activities and notes on each deal.',
        include_in_chat: true,
      },
      {
        title: 'Deal Pipeline',
        slug: 'deal-pipeline',
        question: 'How do I use the deal pipeline?',
        answer_text: 'The deal pipeline shows all deals organized by stage in a Kanban board. Drag deals between columns to update their stage. Click on a deal to view details, add notes, or log activities. Filter by date, value, or assigned user.',
        include_in_chat: true,
      },
      {
        title: 'Companies',
        slug: 'companies',
        question: 'How do I manage companies?',
        answer_text: 'Companies represent organizations in B2B sales. Link leads to companies to track all contacts at an organization. Use the "Enrich with AI" feature to automatically populate company details from their domain.',
        include_in_chat: true,
      },
    ],
  },

  // ===== CONTENT BEST PRACTICES =====
  {
    name: 'Content Best Practices',
    slug: 'content-best-practices',
    description: 'Tips for creating effective, SEO-friendly content.',
    icon: 'Lightbulb',
    articles: [
      {
        title: 'SEO Optimization',
        slug: 'seo-optimization',
        question: 'How do I optimize my content for search engines?',
        answer_text: 'On-Page SEO Essentials: Use title tags with primary keyword (under 60 characters), write compelling meta descriptions (under 160 characters), use proper heading structure (H1 for title, H2 for sections), add descriptive image alt text. URL Best Practices: Keep URLs short and descriptive, use hyphens not underscores, include target keywords. Technical SEO is automatic: XML sitemap, RSS feed, canonical URLs, mobile-responsive design, LLMs.txt.',
        is_featured: true,
        include_in_chat: true,
      },
      {
        title: 'AEO: Optimizing for AI Search',
        slug: 'aeo-ai-search-optimization',
        question: 'What is Answer Engine Optimization (AEO)?',
        answer_text: 'AEO optimizes content for AI-powered search engines that provide direct answers. Write clear, question-based content, use structured data, and ensure your knowledge base is comprehensive. Best practices: Structure articles around specific questions, provide direct answers in the first paragraph, follow with detailed explanations, use proper headings and lists. PezCMS AEO features: AEO Analyzer reviews your content, LLMs.txt provides AI-friendly content, Knowledge Base is already AEO-optimized.',
        is_featured: true,
        include_in_chat: true,
      },
      {
        title: 'Performance Optimization',
        slug: 'performance-optimization',
        question: 'How do I make my website faster?',
        answer_text: 'Image Optimization: Upload images at display size, use WebP or JPEG for photos, PezCMS auto-compresses uploads. Page Structure: Keep pages focused, use pagination for long lists, lazy load below-the-fold content. Monitor with: Google PageSpeed Insights, GTmetrix, WebPageTest.',
        include_in_chat: true,
      },
      {
        title: 'Writing for the Web',
        slug: 'writing-for-web',
        question: 'How should I write content for my website?',
        answer_text: 'Use short paragraphs (2-3 sentences), clear headings, and scannable formatting. Write at an 8th-grade reading level. Front-load important information. Use bullet lists to break up complex information. Bold key points. Give content room to breathe with white space. Write conversationally, address the reader as "you", avoid jargon, be specific.',
        include_in_chat: true,
      },
      {
        title: 'Conversion Optimization',
        slug: 'conversion-optimization',
        question: 'How do I get more visitors to take action?',
        answer_text: 'Clear CTAs: One primary CTA per page, use action words, make buttons stand out, repeat on long pages. Reduce Form Friction: Ask only for essentials, use smart defaults, show progress for multi-step forms. Build Trust: Display testimonials, show customer logos, include team photos, be transparent about pricing.',
        include_in_chat: true,
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
        answer_text: 'The Newsletter module enables email marketing directly from PezCMS. Collect subscribers, create campaigns, and track opens and clicks. Features: Newsletter block for signup forms, Subscriber management with import/export, Visual email editor, Open and click tracking, GDPR-compliant unsubscribe.',
        is_featured: true,
        include_in_chat: true,
      },
      {
        title: 'Managing Subscribers',
        slug: 'managing-subscribers',
        question: 'How do I manage newsletter subscribers?',
        answer_text: 'Go to Admin → Newsletter → Subscribers. View all subscribers, their status (pending, confirmed, unsubscribed), and signup date. Import subscribers via CSV, export for backup or migration. Subscribers are automatically added when they use the Newsletter signup block.',
        is_featured: true,
        include_in_chat: true,
      },
      {
        title: 'Creating Campaigns',
        slug: 'creating-campaigns',
        question: 'How do I create an email campaign?',
        answer_text: 'Go to Admin → Newsletter → Campaigns → New Campaign. Enter a subject line, write your email content using the visual editor, preview, and send. You can save as draft, schedule for later, or send immediately. The editor supports rich text, images, and links.',
        include_in_chat: true,
      },
      {
        title: 'Tracking Engagement',
        slug: 'tracking-engagement',
        question: 'How do I track email opens and clicks?',
        answer_text: 'Each campaign shows: Total sent, Open rate, Click rate, and Link-by-link click counts. PezCMS automatically tracks opens using a tracking pixel and rewrites links for click tracking. View detailed analytics on the campaign detail page.',
        include_in_chat: true,
      },
      {
        title: 'GDPR Compliance',
        slug: 'newsletter-gdpr',
        question: 'Is the newsletter GDPR compliant?',
        answer_text: 'Yes. PezCMS supports double opt-in (confirmation email before subscription), easy one-click unsubscribe in every email, data export for subscribers, and preference management. Configure these in Admin → Newsletter → Settings.',
        include_in_chat: true,
      },
    ],
  },

  // ===== GLOBAL BLOCKS =====
  {
    name: 'Global Blocks',
    slug: 'global-blocks',
    description: 'Manage headers, footers, and other reusable elements.',
    icon: 'Layout',
    articles: [
      {
        title: 'Global Blocks Overview',
        slug: 'global-blocks-overview',
        question: 'What are Global Blocks?',
        answer_text: 'Global Blocks are reusable elements that appear across all pages: Header (navigation bar), Footer (links, contact info, branding), and Popup (modals for announcements or lead capture). Edit once, update everywhere. Access via Admin → Global Blocks.',
        is_featured: true,
        include_in_chat: true,
      },
      {
        title: 'Managing Headers',
        slug: 'managing-headers',
        question: 'How do I create and customize the site header?',
        answer_text: 'Go to Admin → Global Blocks and create a Header block. Add your logo, navigation links, and optional CTA button. The header automatically appears on all public pages and includes mobile-responsive navigation. Options include: Logo (image or text), Navigation Style, CTA Button, and Theme Toggle.',
        is_featured: true,
        include_in_chat: true,
      },
      {
        title: 'Managing Footers',
        slug: 'managing-footers',
        question: 'How do I create and customize the site footer?',
        answer_text: 'Create a Footer block in Global Blocks. Add columns for navigation, contact information, social links, and copyright text. Choose from layout variants: Standard (multi-column), Minimal (simple copyright), or Centered (logo-focused).',
        include_in_chat: true,
      },
      {
        title: 'Creating Popups',
        slug: 'creating-popups',
        question: 'How do I create popup announcements or modals?',
        answer_text: 'Add a Popup block in Global Blocks. Configure trigger timing (delay, exit intent), display rules (once per session, always), and content. Great for promotions, cookie notices, or newsletter signups. Use sparingly – too many popups frustrate visitors.',
        include_in_chat: true,
      },
      {
        title: 'Enabling and Disabling Blocks',
        slug: 'enabling-disabling-blocks',
        question: 'How do I temporarily hide a global block?',
        answer_text: 'Toggle the Active switch on any global block to enable or disable it. Disabled blocks are preserved but not rendered on the site. Useful for seasonal content, A/B testing, or troubleshooting.',
        include_in_chat: true,
      },
      {
        title: 'Multiple Blocks Per Slot',
        slug: 'multiple-blocks-per-slot',
        question: 'Can I have multiple headers or footers?',
        answer_text: 'Yes, you can create multiple blocks for each slot, but only one can be active at a time. This lets you prepare alternative designs and switch between them instantly. Use cases: Campaign headers, holiday footers, event popups.',
        include_in_chat: true,
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
        answer_text: 'Go to Admin → Branding to configure your site name, logo, colors, and fonts. Changes apply site-wide instantly. Branding elements: Site Name, Logo, Favicon, Primary Color, Fonts, and Dark Mode settings.',
        is_featured: true,
        include_in_chat: true,
      },
      {
        title: 'Setting Up Your Logo',
        slug: 'setting-up-logo',
        question: 'How do I add my logo to the site?',
        answer_text: 'In Branding settings, upload your logo image. Recommended format is SVG or PNG with transparency. The logo appears in the header, favicon, and Open Graph images. Upload separate light and dark versions if your logo needs different colors for dark mode.',
        is_featured: true,
        include_in_chat: true,
      },
      {
        title: 'Color Customization',
        slug: 'color-customization',
        question: 'How do I change the site colors?',
        answer_text: 'Set the primary color in Branding settings. This color is used for buttons, links, accents, and highlights throughout the site. Use a color that matches your brand identity and has sufficient contrast for accessibility.',
        include_in_chat: true,
      },
      {
        title: 'Dark Mode',
        slug: 'dark-mode',
        question: 'Does PezCMS support dark mode?',
        answer_text: 'Yes! Enable the theme toggle in Global Blocks → Header to let visitors switch between light and dark modes. The site automatically adapts colors, images, and contrast. You can also set a default theme preference.',
        include_in_chat: true,
      },
      {
        title: 'Brand Guide AI',
        slug: 'brand-guide-ai',
        question: 'What is the Brand Guide AI feature?',
        answer_text: 'Brand Guide AI analyzes your website and extracts your brand identity including colors, fonts, tone of voice, and visual style. Use it to generate a brand guide document or ensure content consistency. Access it from the Branding settings page.',
        include_in_chat: true,
      },
    ],
  },

  // ===== BOOKING SYSTEM =====
  {
    name: 'Booking System',
    slug: 'booking-system',
    description: 'Accept appointments and manage your calendar.',
    icon: 'Calendar',
    articles: [
      {
        title: 'Booking Overview',
        slug: 'booking-overview',
        question: 'What is the Booking module?',
        answer_text: 'The Booking module lets visitors schedule appointments directly on your site. Define services with duration and pricing, set availability hours, block dates, and receive confirmation emails. Integrates with the CRM for lead tracking.',
        is_featured: true,
        include_in_chat: true,
      },
      {
        title: 'Setting Up Services',
        slug: 'setting-up-services',
        question: 'How do I create bookable services?',
        answer_text: 'Go to Admin → Booking → Services. Create services with: Name and description, Duration (15 min to 8 hours), Price (optional), and Color for calendar display. Multiple services can have different availability rules.',
        is_featured: true,
        include_in_chat: true,
      },
      {
        title: 'Managing Availability',
        slug: 'managing-availability',
        question: 'How do I set my available hours?',
        answer_text: 'In Booking → Availability, set your regular hours for each day of the week. Add exceptions for holidays or special days in the Blocked Dates section. Visitors only see times when you\'re available.',
        include_in_chat: true,
      },
      {
        title: 'Handling Bookings',
        slug: 'handling-bookings',
        question: 'How do I manage incoming bookings?',
        answer_text: 'View all bookings in Admin → Booking → Calendar. Filter by service, date, or status (pending, confirmed, cancelled). Click on a booking to view details, add internal notes, or cancel with a reason.',
        include_in_chat: true,
      },
      {
        title: 'Booking Notifications',
        slug: 'booking-notifications',
        question: 'Are there email confirmations for bookings?',
        answer_text: 'Yes, automatic emails are sent: Confirmation to customer when booking is made, reminder before appointment (configurable), and notification to admin of new bookings. Configure email templates in Settings.',
        include_in_chat: true,
      },
    ],
  },

  // ===== E-COMMERCE =====
  {
    name: 'E-Commerce',
    slug: 'e-commerce',
    description: 'Sell products and services with integrated payments.',
    icon: 'ShoppingCart',
    articles: [
      {
        title: 'E-Commerce Overview',
        slug: 'ecommerce-overview',
        question: 'Can I sell products with PezCMS?',
        answer_text: 'Yes! PezCMS includes e-commerce features: Product catalog with images and descriptions, Shopping cart functionality, Stripe checkout integration, Order management, and Webhook notifications for fulfillment.',
        is_featured: true,
        include_in_chat: true,
      },
      {
        title: 'Adding Products',
        slug: 'adding-products',
        question: 'How do I add products to my store?',
        answer_text: 'Go to Admin → Products → New Product. Enter: Name and description, Price (one-time or recurring), Image, Stripe Price ID (for checkout). Products appear in the Products block on your pages.',
        is_featured: true,
        include_in_chat: true,
      },
      {
        title: 'Stripe Integration',
        slug: 'stripe-integration',
        question: 'How do I connect Stripe for payments?',
        answer_text: 'Connect your Stripe account in Admin → Settings → Integrations. Create products and prices in Stripe, then copy the Price IDs to your PezCMS products. Checkout redirects to Stripe\'s secure payment page.',
        include_in_chat: true,
      },
      {
        title: 'Managing Orders',
        slug: 'managing-orders',
        question: 'How do I view and manage orders?',
        answer_text: 'All orders appear in Admin → Orders. View order details including customer info, items purchased, payment status, and totals. Orders update automatically via Stripe webhooks when payment succeeds.',
        include_in_chat: true,
      },
      {
        title: 'Order Notifications',
        slug: 'order-notifications',
        question: 'Are there order confirmation emails?',
        answer_text: 'Yes, automatic emails are sent when orders are placed and paid. Configure email templates in Settings. Use webhooks to trigger external fulfillment workflows.',
        include_in_chat: true,
      },
    ],
  },

  // ===== MODULES OVERVIEW =====
  {
    name: 'Modules Overview',
    slug: 'modules-overview',
    description: 'Learn about all available modules and how to enable/disable them.',
    icon: 'Package',
    articles: [
      {
        title: 'Available Modules',
        slug: 'available-modules',
        question: 'What modules are available in PezCMS?',
        answer_text: 'PezCMS includes these modules: Core (always on): Pages, Media Library, Global Elements. Content: Blog, Knowledge Base. Marketing: Newsletter, AI Chat, Forms. Sales: Leads, Deals, Companies, Products, Orders, Booking. System: Analytics, Webhooks, Users, Integrations. Go to Admin → Modules to toggle them on/off.',
        is_featured: true,
        include_in_chat: true,
      },
      {
        title: 'Pages Module',
        slug: 'pages-module',
        question: 'What is the Pages module?',
        answer_text: 'The Pages module is the core content creation system. It provides a visual block editor with 27+ block types, version history, scheduled publishing, and SEO settings. This is a core module and cannot be disabled.',
        is_featured: true,
        include_in_chat: true,
      },
      {
        title: 'Blog Module',
        slug: 'blog-module',
        question: 'What is the Blog module?',
        answer_text: 'A complete blogging platform with categories, tags, author profiles, RSS feed, and featured posts. Uses the same block editor as pages.',
        include_in_chat: true,
      },
      {
        title: 'Knowledge Base Module',
        slug: 'knowledge-base-module',
        question: 'What is the Knowledge Base module?',
        answer_text: 'Build a searchable FAQ or help center with categorized articles, search functionality, and AI Chat integration for intelligent article retrieval.',
        include_in_chat: true,
      },
      {
        title: 'AI Chat Module',
        slug: 'ai-chat-module',
        question: 'What is the AI Chat module?',
        answer_text: 'Add an intelligent chatbot using Context Augmented Generation based on your Knowledge Base, blog posts, and page content. Supports Lovable AI, Private LLM, or N8N Webhook providers.',
        include_in_chat: true,
      },
      {
        title: 'Newsletter Module',
        slug: 'newsletter-module',
        question: 'What is the Newsletter module?',
        answer_text: 'Email marketing with subscriber management, campaign creation, open/click tracking, and GDPR-compliant features. Uses Resend for delivery.',
        include_in_chat: true,
      },
      {
        title: 'Forms Module',
        slug: 'forms-module',
        question: 'What is the Forms module?',
        answer_text: 'Collect and manage form submissions from Contact and Form Builder blocks. Export data and optionally convert to leads.',
        include_in_chat: true,
      },
      {
        title: 'Leads Module',
        slug: 'leads-module',
        question: 'What is the Leads module?',
        answer_text: 'AI-driven lead management with automatic scoring, qualification summaries, and conversion to deals. Leads come from forms, newsletter, or manual entry.',
        include_in_chat: true,
      },
      {
        title: 'Deals Module',
        slug: 'deals-module',
        question: 'What is the Deals module?',
        answer_text: 'Sales pipeline management with Kanban board, stages (Proposal → Negotiation → Won/Lost), activity tracking, and value forecasting.',
        include_in_chat: true,
      },
      {
        title: 'Booking Module',
        slug: 'booking-module',
        question: 'What is the Booking module?',
        answer_text: 'Appointment scheduling with services, availability rules, calendar view, and email confirmations.',
        include_in_chat: true,
      },
      {
        title: 'Products & Orders Modules',
        slug: 'products-orders-modules',
        question: 'What are the Products and Orders modules?',
        answer_text: 'E-commerce functionality with product catalog, Stripe integration, shopping cart, checkout, and order management.',
        include_in_chat: true,
      },
      {
        title: 'Analytics Module',
        slug: 'analytics-module',
        question: 'What is the Analytics module?',
        answer_text: 'Track page views, visitor stats, popular content, and traffic sources. Privacy-focused with no third-party cookies.',
        include_in_chat: true,
      },
      {
        title: 'Global Elements Module',
        slug: 'global-elements-module',
        question: 'What is the Global Elements module?',
        answer_text: 'Manage headers, footers, and popups that appear site-wide. Edit once, update everywhere. This is a core module.',
        include_in_chat: true,
      },
      {
        title: 'Media Library Module',
        slug: 'media-library-module',
        question: 'What is the Media Library module?',
        answer_text: 'Centralized management for images and files. Includes auto-optimization, Unsplash integration, and image cropping. This is a core module.',
        include_in_chat: true,
      },
    ],
  },
];

// =====================================================
// KB CLASSIC - SEO-optimized, documentation-focused articles
// =====================================================

export const kbClassicCategories: TemplateKbCategory[] = [
  {
    name: 'Getting Started',
    slug: 'getting-started',
    description: 'Step-by-step guides to help you get started with our platform.',
    icon: 'Rocket',
    articles: [
      {
        title: 'Platform Overview',
        slug: 'platform-overview',
        question: 'What is this platform and what can I do with it?',
        answer_text: 'Our platform is a comprehensive solution designed to streamline your workflow. It provides tools for content management, team collaboration, and analytics. Key features include a visual editor, real-time collaboration, version history, and integrations with popular third-party services. The platform is built for scalability, supporting teams from solo creators to large enterprises.',
        is_featured: true,
        include_in_chat: true,
      },
      {
        title: 'Quick Start Guide',
        slug: 'quick-start',
        question: 'How do I get started quickly?',
        answer_text: 'Getting started takes just 5 minutes: 1) Create your account using email or social login. 2) Complete the onboarding wizard to set up your workspace. 3) Choose a template or start from scratch. 4) Invite team members if applicable. 5) Publish your first content. Our guided setup ensures you have everything configured correctly from day one.',
        is_featured: true,
        include_in_chat: true,
      },
      {
        title: 'Account Setup',
        slug: 'account-setup',
        question: 'How do I set up my account properly?',
        answer_text: 'To set up your account: Navigate to Settings → Profile to add your name, avatar, and bio. Set up two-factor authentication for security. Configure notification preferences. Connect any third-party integrations you need. Set your timezone and language preferences. Review billing information if on a paid plan.',
        include_in_chat: true,
      },
      {
        title: 'Understanding the Dashboard',
        slug: 'dashboard-guide',
        question: 'How do I navigate the dashboard?',
        answer_text: 'The dashboard is your central hub. The sidebar contains main navigation: Content, Media, Settings, and Analytics. The main area shows recent activity and quick actions. Use the search bar (Cmd/Ctrl+K) to quickly find anything. The top bar shows notifications and your profile menu. Customize widgets to show the metrics most important to you.',
        include_in_chat: true,
      },
    ],
  },
  {
    name: 'Account & Billing',
    slug: 'account-billing',
    description: 'Manage your subscription, payments, and account settings.',
    icon: 'CreditCard',
    articles: [
      {
        title: 'Pricing Plans Explained',
        slug: 'pricing-plans',
        question: 'What pricing plans are available?',
        answer_text: 'We offer three plans: Free (up to 3 projects, basic features), Professional ($29/month - unlimited projects, priority support, advanced analytics), and Enterprise (custom pricing - SSO, SLA, dedicated support). All paid plans include a 14-day free trial. Annual billing saves 20%. Educational and non-profit discounts available upon request.',
        is_featured: true,
        include_in_chat: true,
      },
      {
        title: 'Billing and Invoices',
        slug: 'billing-invoices',
        question: 'How do I access my invoices and billing information?',
        answer_text: 'Access billing at Settings → Billing. View current plan, next billing date, and payment method. Download past invoices in PDF format. Update payment method anytime. Set up billing alerts for usage thresholds. Add a billing email different from your account email if needed for accounting purposes.',
        include_in_chat: true,
      },
      {
        title: 'Cancellation and Refunds',
        slug: 'cancellation-refunds',
        question: 'How do I cancel my subscription?',
        answer_text: 'Cancel anytime from Settings → Billing → Cancel Plan. Your access continues until the end of the billing period. Data is retained for 30 days post-cancellation. Refunds are provided within 7 days of charge for unused annual plans. No refunds for monthly plans. You can export all your data before cancelling.',
        include_in_chat: true,
      },
    ],
  },
  {
    name: 'Features & Functionality',
    slug: 'features',
    description: 'Learn about all platform features in detail.',
    icon: 'Sparkles',
    articles: [
      {
        title: 'Content Editor Guide',
        slug: 'content-editor',
        question: 'How do I use the content editor?',
        answer_text: 'The content editor uses a block-based approach. Click + to add blocks: text, images, videos, embeds, and more. Drag blocks to reorder. Use / commands for quick insertion. The toolbar offers formatting options. Save drafts automatically or manually. Preview before publishing. Keyboard shortcuts speed up editing - press ? to see all available shortcuts.',
        is_featured: true,
        include_in_chat: true,
      },
      {
        title: 'Media Library',
        slug: 'media-library',
        question: 'How do I manage images and files?',
        answer_text: 'The Media Library stores all your uploads. Drag and drop files or click to upload. Organize with folders. Search by filename or tag. Images are automatically optimized for web. Edit images with built-in cropping and resizing. Access Unsplash integration for stock photos. Maximum file size is 50MB. Supported formats: JPG, PNG, GIF, WebP, PDF, SVG.',
        include_in_chat: true,
      },
      {
        title: 'Team Collaboration',
        slug: 'team-collaboration',
        question: 'How can my team work together?',
        answer_text: 'Invite team members via Settings → Team. Assign roles: Viewer (read-only), Editor (create/edit content), Admin (full access including settings). Leave comments on content for feedback. Use @mentions to notify team members. See who is currently editing with presence indicators. Track all changes in the activity log.',
        include_in_chat: true,
      },
      {
        title: 'Version History',
        slug: 'version-history',
        question: 'How does version history work?',
        answer_text: 'Every save creates a new version automatically. Access version history from the content editor toolbar. Compare any two versions side-by-side. Restore previous versions with one click. Versions are retained based on your plan: Free (7 days), Pro (90 days), Enterprise (unlimited). Restoring creates a new version, preserving the complete history.',
        include_in_chat: true,
      },
    ],
  },
  {
    name: 'Security & Privacy',
    slug: 'security-privacy',
    description: 'How we protect your data and privacy.',
    icon: 'Shield',
    articles: [
      {
        title: 'Security Measures',
        slug: 'security-measures',
        question: 'How is my data protected?',
        answer_text: 'We implement industry-standard security: AES-256 encryption at rest, TLS 1.3 in transit, regular security audits, penetration testing, and SOC 2 Type II compliance. Two-factor authentication available for all accounts. IP allowlisting for Enterprise. Automatic session timeout after inactivity. All access logged and auditable.',
        is_featured: true,
        include_in_chat: true,
      },
      {
        title: 'GDPR Compliance',
        slug: 'gdpr-compliance',
        question: 'Are you GDPR compliant?',
        answer_text: 'Yes, we are fully GDPR compliant. Data Processing Agreements available for all customers. Export your data anytime in standard formats. Right to deletion honored within 30 days. Data stored in EU data centers (Sweden, Germany) for EU customers. Privacy by design principles followed throughout development.',
        include_in_chat: true,
      },
      {
        title: 'Two-Factor Authentication',
        slug: 'two-factor-auth',
        question: 'How do I enable two-factor authentication?',
        answer_text: 'Enable 2FA at Settings → Security → Two-Factor Authentication. Choose between authenticator app (recommended) or SMS. Scan the QR code with your authenticator app (Google Authenticator, Authy, 1Password). Save your backup codes in a secure location. You can generate new backup codes anytime from the same settings page.',
        include_in_chat: true,
      },
    ],
  },
  {
    name: 'Troubleshooting',
    slug: 'troubleshooting',
    description: 'Solutions to common problems and issues.',
    icon: 'Wrench',
    articles: [
      {
        title: 'Common Issues',
        slug: 'common-issues',
        question: 'What should I do if something is not working?',
        answer_text: 'First steps: 1) Refresh the page (Ctrl/Cmd+Shift+R for hard refresh). 2) Clear browser cache and cookies. 3) Try a different browser. 4) Disable browser extensions. 5) Check our status page for outages. If issues persist, contact support with: browser/OS info, steps to reproduce, screenshots, and any error messages.',
        is_featured: true,
        include_in_chat: true,
      },
      {
        title: 'Password Reset',
        slug: 'password-reset',
        question: 'How do I reset my password?',
        answer_text: 'Click "Forgot Password" on the login page. Enter your email address. Check your inbox (and spam folder) for the reset link. The link expires after 1 hour. Choose a strong password (min 8 characters, mix of letters, numbers, symbols). If you do not receive the email, contact support.',
        include_in_chat: true,
      },
      {
        title: 'Contact Support',
        slug: 'contact-support',
        question: 'How do I get help from support?',
        answer_text: 'Multiple support options: In-app chat (click the support icon), Email support@example.com, Community forum for discussions, Priority support for Pro/Enterprise plans (response within 4 hours). When contacting support, include your account email, detailed description, and screenshots if applicable.',
        include_in_chat: true,
      },
    ],
  },
];

// =====================================================
// AI SUPPORT HUB - Concise, AI-context-optimized articles
// =====================================================

export const aiHubCategories: TemplateKbCategory[] = [
  {
    name: 'Quick Answers',
    slug: 'quick-answers',
    description: 'Fast answers to common questions.',
    icon: 'Zap',
    articles: [
      {
        title: 'Getting Started',
        slug: 'getting-started',
        question: 'How do I get started?',
        answer_text: 'Create account → Complete setup wizard → Choose template → Start creating. Takes under 5 minutes.',
        is_featured: true,
        include_in_chat: true,
      },
      {
        title: 'Pricing',
        slug: 'pricing',
        question: 'What does it cost?',
        answer_text: 'Free tier available. Pro: $29/mo. Enterprise: custom. 14-day trial on all paid plans. Annual saves 20%.',
        is_featured: true,
        include_in_chat: true,
      },
      {
        title: 'Integrations',
        slug: 'integrations',
        question: 'What integrations are available?',
        answer_text: 'Slack, GitHub, Figma, Notion, Zapier, Google Drive, and 50+ more. API available for custom integrations.',
        include_in_chat: true,
      },
      {
        title: 'Team Size',
        slug: 'team-size',
        question: 'How many team members can I add?',
        answer_text: 'Free: 1 user. Pro: 5 users ($10/extra). Enterprise: unlimited. All plans support viewer roles.',
        include_in_chat: true,
      },
    ],
  },
  {
    name: 'Account',
    slug: 'account',
    description: 'Account and billing help.',
    icon: 'User',
    articles: [
      {
        title: 'Change Plan',
        slug: 'change-plan',
        question: 'How do I upgrade or downgrade?',
        answer_text: 'Settings → Billing → Change Plan. Upgrades apply immediately, downgrades at next billing cycle.',
        include_in_chat: true,
      },
      {
        title: 'Cancel',
        slug: 'cancel',
        question: 'How do I cancel?',
        answer_text: 'Settings → Billing → Cancel. Access continues until period ends. Data kept 30 days.',
        include_in_chat: true,
      },
      {
        title: 'Invoices',
        slug: 'invoices',
        question: 'Where are my invoices?',
        answer_text: 'Settings → Billing → Invoice History. Download as PDF. Add billing email for automatic delivery.',
        include_in_chat: true,
      },
    ],
  },
  {
    name: 'Features',
    slug: 'features',
    description: 'How to use key features.',
    icon: 'Sparkles',
    articles: [
      {
        title: 'Editor',
        slug: 'editor',
        question: 'How do I use the editor?',
        answer_text: 'Click + to add blocks. Drag to reorder. Use / for quick commands. Auto-saves every 30 seconds.',
        include_in_chat: true,
      },
      {
        title: 'Collaboration',
        slug: 'collaboration',
        question: 'How do I collaborate with my team?',
        answer_text: 'Invite via Settings → Team. Use comments for feedback. @mention to notify. Real-time presence shows who is editing.',
        include_in_chat: true,
      },
      {
        title: 'Publishing',
        slug: 'publishing',
        question: 'How do I publish content?',
        answer_text: 'Click Publish button. Choose publish now or schedule. Preview before publishing. Unpublish anytime.',
        include_in_chat: true,
      },
    ],
  },
  {
    name: 'Security',
    slug: 'security',
    description: 'Security and privacy info.',
    icon: 'Shield',
    articles: [
      {
        title: '2FA',
        slug: 'two-factor',
        question: 'How do I enable 2FA?',
        answer_text: 'Settings → Security → Enable 2FA. Use authenticator app. Save backup codes securely.',
        include_in_chat: true,
      },
      {
        title: 'Data Security',
        slug: 'data-security',
        question: 'Is my data secure?',
        answer_text: 'AES-256 encryption. SOC 2 compliant. GDPR ready. EU data centers available. Regular security audits.',
        include_in_chat: true,
      },
    ],
  },
  {
    name: 'Support',
    slug: 'support',
    description: 'Get help when you need it.',
    icon: 'HeadphonesIcon',
    articles: [
      {
        title: 'Contact',
        slug: 'contact',
        question: 'How do I contact support?',
        answer_text: 'Chat widget (fastest), email support@example.com, or community forum. Pro/Enterprise: priority 4-hour response.',
        is_featured: true,
        include_in_chat: true,
      },
      {
        title: 'Issues',
        slug: 'issues',
        question: 'Something is not working',
        answer_text: 'Try: Hard refresh (Cmd+Shift+R), clear cache, different browser, disable extensions. Still broken? Chat with us.',
        include_in_chat: true,
      },
    ],
  },
];

// =====================================================
// HYBRID HELP CENTER - Balanced articles for both SEO and AI
// =====================================================

export const hybridHelpCategories: TemplateKbCategory[] = [
  {
    name: 'Getting Started',
    slug: 'getting-started',
    description: 'Everything you need to begin.',
    icon: 'Rocket',
    articles: [
      {
        title: 'Welcome Guide',
        slug: 'welcome',
        question: 'How do I get started with the platform?',
        answer_text: 'Welcome! Getting started is easy: Create your account, complete the setup wizard, choose a template or start blank, and publish your first content. The whole process takes about 5 minutes. Our AI assistant can guide you through any step.',
        is_featured: true,
        include_in_chat: true,
      },
      {
        title: 'Account Setup',
        slug: 'account-setup',
        question: 'How should I set up my account?',
        answer_text: 'Complete your profile in Settings → Profile: add name, avatar, and bio. Enable two-factor authentication for security. Configure notifications. Connect integrations you need. Set timezone and language preferences.',
        is_featured: true,
        include_in_chat: true,
      },
      {
        title: 'Dashboard Navigation',
        slug: 'dashboard-navigation',
        question: 'How do I navigate the dashboard?',
        answer_text: 'The sidebar contains main sections: Content, Media, Settings, Analytics. Use Cmd/Ctrl+K for quick search. The top bar shows notifications and your profile. Customize dashboard widgets to show metrics you care about.',
        include_in_chat: true,
      },
    ],
  },
  {
    name: 'Plans & Billing',
    slug: 'plans-billing',
    description: 'Pricing, payments, and subscriptions.',
    icon: 'CreditCard',
    articles: [
      {
        title: 'Pricing Overview',
        slug: 'pricing',
        question: 'What are the pricing options?',
        answer_text: 'Three plans: Free (3 projects, basic features), Professional ($29/mo, unlimited projects, priority support), Enterprise (custom, SSO, SLA). All paid plans include 14-day trial. Annual billing saves 20%.',
        is_featured: true,
        include_in_chat: true,
      },
      {
        title: 'Managing Subscription',
        slug: 'manage-subscription',
        question: 'How do I manage my subscription?',
        answer_text: 'Go to Settings → Billing to: view current plan, change plans (upgrade/downgrade), update payment method, download invoices, set billing alerts, and manage team seats.',
        include_in_chat: true,
      },
      {
        title: 'Cancellation',
        slug: 'cancellation',
        question: 'How do I cancel my subscription?',
        answer_text: 'Settings → Billing → Cancel Plan. Access continues until billing period ends. Data retained 30 days. Export your data first if needed. You can reactivate anytime.',
        include_in_chat: true,
      },
    ],
  },
  {
    name: 'Using the Platform',
    slug: 'using-platform',
    description: 'Features and functionality guides.',
    icon: 'Lightbulb',
    articles: [
      {
        title: 'Content Editor',
        slug: 'content-editor',
        question: 'How do I create and edit content?',
        answer_text: 'Use the block-based editor: click + to add blocks (text, images, video, etc). Drag blocks to reorder. Use / commands for quick insertion. Content auto-saves. Preview before publishing. Keyboard shortcuts available (press ? to see all).',
        is_featured: true,
        include_in_chat: true,
      },
      {
        title: 'Media Management',
        slug: 'media-management',
        question: 'How do I manage images and files?',
        answer_text: 'Media Library stores all uploads. Drag & drop or click to upload. Organize with folders. Images auto-optimized. Built-in editor for cropping. Unsplash integration for stock photos. Max 50MB per file.',
        include_in_chat: true,
      },
      {
        title: 'Team Collaboration',
        slug: 'team-collaboration',
        question: 'How can my team collaborate?',
        answer_text: 'Invite team via Settings → Team. Roles: Viewer (read), Editor (create/edit), Admin (full access). Leave comments, @mention teammates, see real-time presence, and track changes in activity log.',
        include_in_chat: true,
      },
      {
        title: 'Version Control',
        slug: 'version-control',
        question: 'How does version history work?',
        answer_text: 'Every save creates a version. Access history from editor toolbar. Compare versions side-by-side. Restore any version with one click. Retention: Free 7 days, Pro 90 days, Enterprise unlimited.',
        include_in_chat: true,
      },
    ],
  },
  {
    name: 'Security & Privacy',
    slug: 'security-privacy',
    description: 'How we protect your data.',
    icon: 'Shield',
    articles: [
      {
        title: 'Data Protection',
        slug: 'data-protection',
        question: 'How is my data protected?',
        answer_text: 'AES-256 encryption at rest, TLS 1.3 in transit. SOC 2 Type II certified. Regular security audits. 2FA available. Session timeout. All access logged. GDPR compliant with EU data centers.',
        is_featured: true,
        include_in_chat: true,
      },
      {
        title: 'Two-Factor Authentication',
        slug: 'two-factor-auth',
        question: 'How do I set up 2FA?',
        answer_text: 'Settings → Security → Two-Factor Authentication. Choose authenticator app (recommended) or SMS. Scan QR code. Save backup codes securely. Can regenerate codes anytime.',
        include_in_chat: true,
      },
    ],
  },
  {
    name: 'Help & Support',
    slug: 'help-support',
    description: 'Get assistance when you need it.',
    icon: 'HeadphonesIcon',
    articles: [
      {
        title: 'Getting Help',
        slug: 'getting-help',
        question: 'How do I get help?',
        answer_text: 'Multiple options: Ask our AI assistant (try it now!), use in-app chat, email support@example.com, or join community forums. Pro/Enterprise get priority support with 4-hour response time.',
        is_featured: true,
        include_in_chat: true,
      },
      {
        title: 'Troubleshooting',
        slug: 'troubleshooting',
        question: 'Something is not working correctly',
        answer_text: 'Try: 1) Hard refresh (Cmd+Shift+R), 2) Clear browser cache, 3) Try different browser, 4) Disable extensions. Still having issues? Chat with us and we will help.',
        include_in_chat: true,
      },
    ],
  },
];
