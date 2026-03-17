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
// FlowWink Knowledge Base Articles (Agentic CMS Narrative)
// =====================================================

export const flowwinkKbCategories: TemplateKbCategory[] = [
  // ===== GETTING STARTED =====
  {
    name: 'Getting Started',
    slug: 'getting-started',
    description: 'Learn the basics of FlowWink and FlowPilot — the autonomous agent that runs your website.',
    icon: 'Rocket',
    articles: [
      {
        title: 'What is FlowWink?',
        slug: 'what-is-flowwink',
        question: 'What is FlowWink and what can I do with it?',
        answer_text: 'FlowWink is the first autonomous agentic CMS. Instead of managing your website manually, you set objectives and FlowPilot — an AI agent — operates your entire online presence. It writes content, qualifies leads, sends campaigns, books meetings, and learns from every interaction. FlowWink replaces four separate products: your CMS, chatbot, CRM, and marketing automation — with a single self-hosted platform.',
        is_featured: true,
        include_in_chat: true,
      },
      {
        title: 'What is FlowPilot?',
        slug: 'what-is-flowpilot',
        question: 'What is FlowPilot and how does it work?',
        answer_text: 'FlowPilot is an autonomous AI agent inspired by the OpenClaw framework. It has six core capabilities: Skill Engine (20+ registered tools), Persistent Memory (learns and remembers), Objectives (goal-driven operations), Autonomous Heartbeat (12h reflection cycles), Signal Automations (event-driven reactions), and Self-Evolution (creates new skills and updates its own instructions). You set objectives. FlowPilot executes.',
        is_featured: true,
        include_in_chat: true,
      },
      {
        title: 'Setting Your First Objective',
        slug: 'setting-first-objective',
        question: 'How do I set objectives for FlowPilot?',
        answer_text: 'Navigate to Admin → FlowPilot → Objectives. Click "New Objective" and describe your goal, e.g., "Publish 4 blog posts per month" or "Qualify all inbound leads within 5 minutes." Define success criteria and any constraints. FlowPilot breaks objectives into actions and tracks progress autonomously. Review progress in the Activity Feed.',
        is_featured: true,
        include_in_chat: true,
      },
      {
        title: 'Understanding User Roles',
        slug: 'user-roles',
        question: 'What are the different user roles in FlowWink?',
        answer_text: 'FlowWink has three roles: Writer – Can create and edit their own drafts, submit for review. Approver – Can review content, approve/reject submissions, publish content. Admin – Full access to all features including FlowPilot configuration, skills, objectives, and site settings. FlowPilot itself operates as a system-level agent with approval gating for sensitive actions.',
        include_in_chat: true,
      },
      {
        title: 'The Activity Feed',
        slug: 'activity-feed',
        question: 'How do I see what FlowPilot is doing?',
        answer_text: 'The Activity Feed (Admin → FlowPilot → Activity) shows every action FlowPilot takes — content drafted, leads qualified, emails sent, skills executed. Each entry includes what was done, why, input/output data, and duration. Actions requiring approval appear with Approve/Reject buttons. This is your command center for reviewing autonomous operations.',
        include_in_chat: true,
      },
    ],
  },
  
  // ===== FLOWPILOT SKILLS =====
  {
    name: 'FlowPilot Skills',
    slug: 'flowpilot-skills',
    description: 'Understand and manage FlowPilot\'s autonomous capabilities.',
    icon: 'Zap',
    articles: [
      {
        title: 'Skills Overview',
        slug: 'skills-overview',
        question: 'What are FlowPilot skills?',
        answer_text: 'Skills are FlowPilot\'s registered capabilities — modular tools defined in OpenAI function-calling format. Each skill has a name, description, input parameters, execution handler, scope (internal/external), and an approval requirement flag. FlowPilot ships with 30+ skills and can create new ones autonomously.',
        is_featured: true,
        include_in_chat: true,
      },
      {
        title: 'Built-in Skills',
        slug: 'built-in-skills',
        question: 'What skills does FlowPilot have out of the box?',
        answer_text: 'Built-in skills include: Content (create_page, publish_page, write_blog_post), CRM (qualify_lead, enrich_company, create_deal), Email (send_newsletter, add_subscriber), Booking (check_availability, confirm_booking), Knowledge (search_kb, update_article), and System (soul_update, skill_instruct, reflect). Enable or disable skills in Admin → FlowPilot → Skills.',
        is_featured: true,
        include_in_chat: true,
      },
      {
        title: 'Skill Scopes',
        slug: 'skill-scopes',
        question: 'What are internal and external skill scopes?',
        answer_text: 'Scope controls who can trigger a skill. "Internal" skills are only available to FlowPilot operating as an admin assistant. "External" skills can be invoked by the visitor-facing chat. Skills can also be set to "both." This prevents visitors from triggering administrative actions while allowing FlowPilot to serve both audiences safely.',
        include_in_chat: true,
      },
      {
        title: 'Approval Gating',
        slug: 'approval-gating',
        question: 'How does approval gating work for FlowPilot actions?',
        answer_text: 'Skills marked as "requires_approval" queue their output for human review before execution. For example, publishing a blog post gets queued — FlowPilot writes and prepares it, then waits for your approval. Lead qualification happens instantly, no approval needed. Configure approval requirements per skill in Admin → FlowPilot → Skills.',
        is_featured: true,
        include_in_chat: true,
      },
      {
        title: 'Creating Custom Skills',
        slug: 'creating-custom-skills',
        question: 'Can FlowPilot create new skills?',
        answer_text: 'Yes. When FlowPilot encounters a task no existing skill covers, it can propose a new one using the "skill_instruct" tool. It defines the skill\'s parameters, handler, and scope — then awaits admin approval to register it. You can also create skills manually in Admin → FlowPilot → Skills → New Skill.',
        include_in_chat: true,
      },
    ],
  },

  // ===== AUTONOMOUS OPERATIONS =====
  {
    name: 'Autonomous Operations',
    slug: 'autonomous-operations',
    description: 'How FlowPilot manages content, leads, campaigns, and more without manual intervention.',
    icon: 'Bot',
    articles: [
      {
        title: 'The Autonomous Loop',
        slug: 'autonomous-loop',
        question: 'What is the Autonomous Loop?',
        answer_text: 'FlowPilot operates in a continuous cycle: Heartbeat (triggers every 12h) → Reflect (reviews recent activity) → Plan (decides next actions based on objectives) → Execute (runs skills) → Log (records everything) → Learn (updates persistent memory). This loop runs without human intervention, making your website truly self-operating.',
        is_featured: true,
        include_in_chat: true,
      },
      {
        title: 'Persistent Memory',
        slug: 'persistent-memory',
        question: 'How does FlowPilot remember things?',
        answer_text: 'FlowPilot stores information in structured persistent memory with categories: brand (guidelines, tone), preferences (learned behaviors), context (recent decisions), and skills (execution patterns). Memory persists across sessions, making FlowPilot smarter over time. View memory entries in Admin → FlowPilot → Memory.',
        is_featured: true,
        include_in_chat: true,
      },
      {
        title: 'Signal Automations',
        slug: 'signal-automations',
        question: 'What are signal automations?',
        answer_text: 'Signals are event-driven triggers that activate FlowPilot skills instantly. When events occur — form submission, chat message, new subscriber, booking request — signals trigger appropriate skills: qualify the lead, send a welcome email, enrich company data. Configure signals in Admin → FlowPilot → Automations.',
        is_featured: true,
        include_in_chat: true,
      },
      {
        title: 'Self-Evolution',
        slug: 'self-evolution',
        question: 'Can FlowPilot modify itself?',
        answer_text: 'Yes. FlowPilot can update its own instructions (soul_update) and propose new skills (skill_instruct). If its approach is not producing results, it adjusts. If it discovers a recurring task with no skill, it proposes one. All self-modifications are logged and require admin approval.',
        include_in_chat: true,
      },
      {
        title: 'Content Autopilot',
        slug: 'content-autopilot',
        question: 'How does FlowPilot handle content creation?',
        answer_text: 'Set an objective like "Publish 4 blog posts per month about AI in healthcare." FlowPilot will: research topics using your existing content, draft posts matching your brand voice (from persistent memory), create SEO-optimized titles and meta descriptions, queue for your approval, and publish on schedule. It learns from your edits to improve future drafts.',
        include_in_chat: true,
      },
      {
        title: 'Lead Qualification Autopilot',
        slug: 'lead-qualification-autopilot',
        question: 'How does FlowPilot qualify leads automatically?',
        answer_text: 'When a lead arrives via form, chat, or newsletter signup, FlowPilot: scores based on behavior and profile, enriches company data from the domain, generates an AI qualification summary, assigns to the appropriate team member, and creates a deal if the score exceeds threshold. All within seconds, 24/7.',
        include_in_chat: true,
      },
    ],
  },

  // ===== PAGE EDITING =====
  {
    name: 'Page Editing',
    slug: 'page-editing',
    description: 'Master the block editor and create beautiful pages — or let FlowPilot create them for you.',
    icon: 'Edit3',
    articles: [
      {
        title: 'Block Types Overview',
        slug: 'block-types',
        question: 'What types of blocks are available in FlowWink?',
        answer_text: 'FlowWink offers 43+ block types: Layout blocks (Hero, Two Column, Separator), Content blocks (Text, Image, Gallery, Video), Interactive blocks (Form, Contact, Accordion, Tabs, Marquee, Table, Embed), Marketing blocks (CTA, Pricing, Testimonials, Stats, Countdown, Progress, Badge, Social Proof), Navigation blocks (Header, Footer, Link Grid, Announcement Bar), Notification blocks (Popup, Floating CTA, Notification Toast), and Special blocks (Products, Booking, Chat, Newsletter, KB blocks). FlowPilot can create and edit pages using these blocks autonomously.',
        is_featured: true,
        include_in_chat: true,
      },
      {
        title: 'Publishing Workflow',
        slug: 'publishing-workflow',
        question: 'How does the publishing workflow work?',
        answer_text: 'Content flows through Draft → Reviewing → Published → Archived. Writers and FlowPilot create drafts. Approvers review and authorize. FlowPilot can manage this entire pipeline autonomously — drafting content, submitting for review, and publishing approved content on schedule.',
        include_in_chat: true,
      },
      {
        title: 'Version History',
        slug: 'version-history',
        question: 'How does version history work?',
        answer_text: 'Every save creates a recoverable version — whether by a human editor or FlowPilot. View all versions, compare changes, and restore any previous version. This provides a complete audit trail of both manual and autonomous content changes.',
        include_in_chat: true,
      },
      {
        title: 'AI Text Assistant',
        slug: 'ai-text-assistant',
        question: 'How do I use the AI text generation in the editor?',
        answer_text: 'The AI Text Assistant (Cmd+J) helps write content faster: generate from keywords, improve grammar, expand or shorten content, translate, and summarize. It uses your brand context from FlowPilot\'s persistent memory for consistent voice. Available in every text editor across the platform.',
        is_featured: true,
        include_in_chat: true,
      },
      {
        title: 'SEO Settings',
        slug: 'seo-settings',
        question: 'How do I configure SEO for my pages?',
        answer_text: 'Each page has SEO settings: meta title, description, and Open Graph image. FlowWink auto-generates structured data, sitemaps, and LLMs.txt for AI search engines. FlowPilot can optimize SEO automatically when creating content, applying best practices from persistent memory.',
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
        title: 'FlowPilot Not Responding',
        slug: 'flowpilot-not-responding',
        question: 'FlowPilot is not responding or executing skills — what do I do?',
        answer_text: 'Check: 1) AI provider is configured and tested in Admin → Settings → Integrations, 2) Skills are enabled in Admin → FlowPilot → Skills, 3) Edge functions are deployed (check deployment status), 4) API keys have not expired, 5) Browser console (F12) for error messages. If using a local LLM, verify the endpoint is accessible.',
        is_featured: true,
        include_in_chat: true,
      },
      {
        title: 'Page Not Saving',
        slug: 'page-not-saving',
        question: 'Why is my page not saving?',
        answer_text: 'If your page is not saving: 1) Check Internet Connection, 2) Refresh the page, 3) Check browser console (F12) for errors, 4) Clear browser cache, 5) Try another browser. Auto-save runs continuously, so recent changes should be preserved even if you lose connection briefly.',
        include_in_chat: true,
      },
      {
        title: 'Approval Queue Issues',
        slug: 'approval-queue-issues',
        question: 'FlowPilot actions are stuck in the approval queue — what should I do?',
        answer_text: 'Check Admin → FlowPilot → Activity for pending approvals. Each entry shows what FlowPilot wants to do and why. Approve or reject actions. If too many actions require approval, consider adjusting skill approval settings — mark routine skills as auto-approved to reduce queue friction.',
        include_in_chat: true,
      },
      {
        title: 'Login Issues',
        slug: 'login-issues',
        question: 'I cannot log in to the admin panel',
        answer_text: 'Verify email and password are correct. Check caps lock. Try "Forgot Password" to reset. If using a self-hosted instance, verify the Supabase connection is active. Contact your administrator to verify your account is active.',
        include_in_chat: true,
      },
    ],
  },

  // ===== AI CONFIGURATION =====
  {
    name: 'AI Configuration',
    slug: 'ai-configuration',
    description: 'Configure AI providers that power FlowPilot and the visitor chat.',
    icon: 'Brain',
    articles: [
      {
        title: 'AI Providers Overview',
        slug: 'ai-providers',
        question: 'What AI providers does FlowWink support?',
        answer_text: 'FlowWink supports: 1) OpenAI (GPT models — recommended for most use cases), 2) Google Gemini (multimodal, large context), 3) Local LLM (self-hosted, OpenAI-compatible — for complete privacy), 4) N8N Webhook (custom AI workflows). Configure in Admin → Settings → Integrations. The same provider powers both FlowPilot autonomous operations and the visitor-facing chat.',
        is_featured: true,
        include_in_chat: true,
      },
      {
        title: 'Setting Up Local LLM',
        slug: 'local-llm-setup',
        question: 'How do I connect my own LLM for complete privacy?',
        answer_text: 'For complete data sovereignty: 1) Set up an OpenAI-compatible endpoint (Ollama, LM Studio, vLLM). 2) In Integrations, enable Local LLM. 3) Enter your endpoint URL (e.g., http://localhost:11434/v1). 4) Specify the model name. 5) Click Test Connection. Your content, leads, and customer data never leave your infrastructure. FlowPilot operates with the same capabilities regardless of provider.',
        is_featured: true,
        include_in_chat: true,
      },
      {
        title: 'Chat System Prompt',
        slug: 'chat-system-prompt',
        question: 'How do I customize FlowPilot\'s personality and behavior?',
        answer_text: 'In Admin → Chat Settings, customize the system prompt that defines FlowPilot\'s personality for visitor-facing chat. Set tone, boundaries, and knowledge scope. FlowPilot\'s internal personality evolves through the soul_update mechanism — it refines its own instructions based on accumulated experience.',
        include_in_chat: true,
      },
      {
        title: 'N8N AI Agent Integration',
        slug: 'n8n-ai-agent',
        question: 'How do I connect FlowWink to an N8N AI Agent?',
        answer_text: 'Create an N8N workflow with a Chat Trigger or Webhook node. Configure AI Agent with tools. Copy the webhook URL to FlowWink\'s N8N integration settings. This extends FlowPilot\'s capabilities with custom workflows — connecting to external services, databases, or specialized AI models.',
        include_in_chat: true,
      },
    ],
  },

  // ===== CHANNELS MANAGED =====
  {
    name: 'Channels FlowPilot Manages',
    slug: 'channels-managed',
    description: 'Content, CRM, email, bookings, e-commerce — all managed by one agent.',
    icon: 'Layers',
    articles: [
      {
        title: 'Blog & Content',
        slug: 'blog-content-channel',
        question: 'How does FlowPilot manage blog and content?',
        answer_text: 'FlowPilot writes, edits, schedules, and publishes blog posts and pages based on your objectives. It uses persistent memory to maintain brand voice, applies SEO best practices, and learns from your editorial feedback. Features: categories, tags, author profiles, RSS feed, featured posts, reading time, and rich text editing with 43+ block types.',
        is_featured: true,
        include_in_chat: true,
      },
      {
        title: 'CRM & Lead Management',
        slug: 'crm-lead-channel',
        question: 'How does FlowPilot manage leads and CRM?',
        answer_text: 'FlowPilot captures leads from forms, chat, and newsletter signups. It scores leads based on behavior, enriches company data from domains, generates AI qualification summaries, and manages deals through a Kanban pipeline (Proposal → Negotiation → Won/Lost). All 24/7 with instant response times.',
        is_featured: true,
        include_in_chat: true,
      },
      {
        title: 'Newsletter & Email',
        slug: 'newsletter-email-channel',
        question: 'How does FlowPilot handle email campaigns?',
        answer_text: 'FlowPilot manages subscriber lists, writes campaign content, and sends newsletters with open/click tracking. Signal automations trigger welcome sequences when new subscribers join. GDPR-compliant with double opt-in and one-click unsubscribe. Uses Resend for delivery.',
        is_featured: true,
        include_in_chat: true,
      },
      {
        title: 'Booking & Scheduling',
        slug: 'booking-channel',
        question: 'How does FlowPilot manage bookings?',
        answer_text: 'Visitors book appointments directly on your site. FlowPilot manages services, availability, confirmations, and follow-ups. It sends reminder emails, creates leads from bookings, and can reschedule or cancel when triggered by signals.',
        include_in_chat: true,
      },
      {
        title: 'E-Commerce & Products',
        slug: 'ecommerce-channel',
        question: 'How does FlowPilot handle e-commerce?',
        answer_text: 'FlowPilot manages product catalogs, processes orders via Stripe checkout, sends order confirmations, and tracks fulfillment. It can recommend products based on visitor behavior and trigger follow-up campaigns for completed purchases.',
        include_in_chat: true,
      },
      {
        title: 'Visitor Chat',
        slug: 'visitor-chat-channel',
        question: 'How does FlowPilot handle visitor conversations?',
        answer_text: 'FlowPilot powers an intelligent chat widget using Context Augmented Generation. It searches your knowledge base, pages, and blog posts to provide accurate answers. Complex questions are escalated to human agents. Chat conversations are logged, sentiment-analyzed, and can trigger CRM actions.',
        is_featured: true,
        include_in_chat: true,
      },
    ],
  },

  // ===== GLOBAL BLOCKS & BRANDING =====
  {
    name: 'Global Blocks & Branding',
    slug: 'global-blocks-branding',
    description: 'Manage site-wide elements, themes, and visual identity.',
    icon: 'Palette',
    articles: [
      {
        title: 'Global Blocks Overview',
        slug: 'global-blocks-overview',
        question: 'What are Global Blocks?',
        answer_text: 'Global Blocks are reusable elements across all pages: Header (navigation), Footer (links, branding), and Popup (modals for announcements or lead capture). Edit once, update everywhere. Access via Admin → Global Blocks.',
        is_featured: true,
        include_in_chat: true,
      },
      {
        title: 'Branding Settings',
        slug: 'branding-settings',
        question: 'How do I customize my site\'s look and feel?',
        answer_text: 'Go to Admin → Branding to configure site name, logo, favicon, primary color, fonts, and dark mode. Changes apply site-wide instantly. FlowPilot uses branding settings to maintain consistent visual identity when creating content or pages autonomously.',
        is_featured: true,
        include_in_chat: true,
      },
      {
        title: 'Dark Mode',
        slug: 'dark-mode',
        question: 'Does FlowWink support dark mode?',
        answer_text: 'Yes. Enable the theme toggle in the header to let visitors switch between light and dark modes. The site adapts colors, images, and contrast automatically. Set a default theme preference in branding settings.',
        include_in_chat: true,
      },
      {
        title: 'Brand Guide AI',
        slug: 'brand-guide-ai',
        question: 'What is Brand Guide AI?',
        answer_text: 'Brand Guide AI analyzes your website and extracts your brand identity — colors, fonts, tone, visual style. It feeds these into FlowPilot\'s persistent memory so all autonomous content matches your brand. Access from the Branding settings page.',
        include_in_chat: true,
      },
    ],
  },

  // ===== SELF-HOSTING & DEPLOYMENT =====
  {
    name: 'Self-Hosting & Deployment',
    slug: 'self-hosting',
    description: 'Run FlowWink and FlowPilot on your own infrastructure with Docker.',
    icon: 'Server',
    articles: [
      {
        title: 'Self-Hosting Overview',
        slug: 'self-hosting-overview',
        question: 'Can I self-host FlowWink?',
        answer_text: 'Yes. FlowWink is fully self-hostable using Docker. Your autonomous agent, your data, your AI — all on infrastructure you control. Benefits: complete data sovereignty, private LLM support, custom domain, no per-seat licensing, and no vendor lock-in. FlowPilot operates identically whether self-hosted or cloud-deployed.',
        is_featured: true,
        include_in_chat: true,
      },
      {
        title: 'Docker Quick Start',
        slug: 'docker-quickstart',
        question: 'How do I deploy FlowWink with Docker?',
        answer_text: 'Quick start: 1) Create docker-compose.yml with the FlowWink image, 2) Set environment variables for Supabase connection, 3) Run docker-compose up -d, 4) Access at localhost:8080, 5) Configure your AI provider, 6) Set your first FlowPilot objective. See docs/DOCKER-QUICKSTART.md for complete instructions.',
        is_featured: true,
        include_in_chat: true,
      },
      {
        title: 'Environment Variables',
        slug: 'environment-variables',
        question: 'What environment variables do I need?',
        answer_text: 'Required: VITE_SUPABASE_URL, VITE_SUPABASE_PUBLISHABLE_KEY. Optional: API keys for OpenAI, Gemini, Resend (email), Unsplash, Firecrawl. For private LLM: configure endpoint URL in integrations. All secrets are stored securely. FlowPilot works with any configured AI provider.',
        include_in_chat: true,
      },
      {
        title: 'Connecting Your Domain',
        slug: 'connecting-domain',
        question: 'How do I connect my custom domain?',
        answer_text: 'Configure your reverse proxy (nginx, Caddy, Traefik) to point to the FlowWink container. Add SSL with Let\'s Encrypt. Update your branding settings with the production domain for correct canonical URLs and sitemap generation.',
        include_in_chat: true,
      },
      {
        title: 'Upgrading FlowWink',
        slug: 'upgrading',
        question: 'How do I upgrade to a new version?',
        answer_text: 'Pull the latest Docker image and restart your container. Database migrations run automatically on startup. FlowPilot\'s persistent memory and skills are preserved across upgrades. Always backup your database before major upgrades. Check CHANGELOG.md for breaking changes.',
        include_in_chat: true,
      },
    ],
  },

  // ===== SECURITY & PRIVACY =====
  {
    name: 'Security & Privacy',
    slug: 'security-privacy',
    description: 'Data sovereignty, GDPR compliance, and audit trails in an autonomous system.',
    icon: 'Shield',
    articles: [
      {
        title: 'Security Model',
        slug: 'security-model',
        question: 'How does FlowWink handle security with an autonomous agent?',
        answer_text: 'FlowPilot respects all Row-Level Security policies and authentication constraints. AI-triggered actions follow the same security rules as manual operations. Skill scopes prevent unauthorized access. Approval gating adds human oversight for sensitive actions. Every action is logged in the audit trail.',
        is_featured: true,
        include_in_chat: true,
      },
      {
        title: 'GDPR Compliance',
        slug: 'gdpr-compliance',
        question: 'Is FlowWink GDPR compliant?',
        answer_text: 'When self-hosted with a private LLM, FlowWink is GDPR compliant by architecture — not policy. Your data, your AI, your infrastructure. No cross-border transfers. No third-party DPAs needed. Newsletter includes double opt-in and one-click unsubscribe. Complete data export available.',
        is_featured: true,
        include_in_chat: true,
      },
      {
        title: 'Audit Trail',
        slug: 'audit-trail',
        question: 'Is there a complete audit trail?',
        answer_text: 'Yes. Every action — manual or autonomous — is logged: who did it (user or FlowPilot), what was done, when, and why. View audit logs in Admin → Settings → Audit Log. This includes content changes, lead actions, email sends, skill executions, and self-evolution events.',
        include_in_chat: true,
      },
      {
        title: 'Private AI Setup',
        slug: 'private-ai-setup',
        question: 'How do I ensure my AI is completely private?',
        answer_text: 'Deploy FlowWink with Docker on your infrastructure. Configure a Local LLM (Ollama, LM Studio, vLLM) instead of cloud AI providers. Your prompts, content, lead data, and customer conversations never leave your network. FlowPilot\'s persistent memory is stored in your own database.',
        is_featured: true,
        include_in_chat: true,
      },
    ],
  },

  // ===== CONTENT BEST PRACTICES =====
  {
    name: 'Content Best Practices',
    slug: 'content-best-practices',
    description: 'Tips for effective content — whether written by you or FlowPilot.',
    icon: 'Lightbulb',
    articles: [
      {
        title: 'SEO Optimization',
        slug: 'seo-optimization',
        question: 'How does FlowWink handle SEO?',
        answer_text: 'Automatic SEO features: XML sitemap, RSS feed, canonical URLs, mobile-responsive design, structured data, and LLMs.txt for AI search engines. FlowPilot applies SEO best practices when creating content: keyword-rich titles under 60 characters, meta descriptions under 160 characters, proper heading hierarchy, and descriptive image alt text.',
        is_featured: true,
        include_in_chat: true,
      },
      {
        title: 'AEO: AI Search Optimization',
        slug: 'aeo-ai-search-optimization',
        question: 'What is Answer Engine Optimization (AEO)?',
        answer_text: 'AEO optimizes content for AI search engines that provide direct answers. FlowWink generates LLMs.txt automatically, and the Knowledge Base is inherently AEO-optimized with question-answer format. FlowPilot writes content that is both SEO and AEO friendly — structuring articles around specific questions with direct answers.',
        is_featured: true,
        include_in_chat: true,
      },
      {
        title: 'Setting Objectives for Content',
        slug: 'content-objectives',
        question: 'How should I configure content objectives for FlowPilot?',
        answer_text: 'Be specific with objectives: "Publish 4 blog posts per month about sustainable technology for CTOs" beats "Write some blog posts." Include: topic area, audience, frequency, tone, and any constraints. FlowPilot learns from your editorial feedback — editing a draft teaches it your preferences for future content.',
        include_in_chat: true,
      },
      {
        title: 'Conversion Optimization',
        slug: 'conversion-optimization',
        question: 'How do I get more visitors to take action?',
        answer_text: 'Clear CTAs: one primary CTA per page, action words, standout buttons. Reduce form friction: ask only essentials. Build trust: testimonials, customer logos, team photos. FlowPilot can analyze page performance and suggest improvements via the AEO analyzer and its reflection cycle.',
        include_in_chat: true,
      },
    ],
  },

  // ===== MODULES OVERVIEW =====
  {
    name: 'Modules Overview',
    slug: 'modules-overview',
    description: 'All available modules — each one a channel FlowPilot can operate.',
    icon: 'Package',
    articles: [
      {
        title: 'Available Modules',
        slug: 'available-modules',
        question: 'What modules are available in FlowWink?',
        answer_text: 'FlowWink modules (each operable by FlowPilot): Core (always on): Pages, Media Library, Global Elements. Content: Blog, Knowledge Base. Marketing: Newsletter, AI Chat, Forms. Sales: Leads, Deals, Companies, Products, Orders, Booking. System: Analytics, Webhooks, Users, FlowPilot. Toggle modules in Admin → Modules.',
        is_featured: true,
        include_in_chat: true,
      },
      {
        title: 'FlowPilot Module',
        slug: 'flowpilot-module',
        question: 'What is the FlowPilot module?',
        answer_text: 'The FlowPilot module is the autonomous agent control center. Manage skills, objectives, memory, automations, and activity logs. This is where you configure how your website runs itself — from setting goals to reviewing autonomous actions.',
        is_featured: true,
        include_in_chat: true,
      },
      {
        title: 'Analytics Module',
        slug: 'analytics-module',
        question: 'What is the Analytics module?',
        answer_text: 'Track page views, visitor stats, popular content, traffic sources, and geography. Privacy-focused with no third-party cookies. FlowPilot uses analytics data during its reflection cycle to evaluate content performance and adjust strategies.',
        include_in_chat: true,
      },
      {
        title: 'Webhooks Module',
        slug: 'webhooks-module',
        question: 'What are webhooks?',
        answer_text: 'Webhooks notify external services when events occur. Supported events: page/blog published, form submitted, order placed, subscriber added. FlowPilot\'s signal automations are the internal equivalent — both react to events, but signals trigger skills while webhooks call external URLs.',
        include_in_chat: true,
      },
    ],
  },

  // ===== OBJECTIVES & AUTOMATIONS =====
  {
    name: 'Objectives & Automations',
    slug: 'objectives-automations',
    description: 'Two cadences of autonomous operation — finite goals and recurring routines.',
    icon: 'Target',
    articles: [
      {
        title: 'Objectives Overview',
        slug: 'objectives-overview',
        question: 'What are FlowPilot objectives and how do they work?',
        answer_text: 'Objectives are high-level, finite goals with tracked progress. Create one in Admin → FlowPilot → Objectives. Define the goal, success criteria, and any constraints. FlowPilot decomposes the objective into steps, tracks progress via a structured JSONB field, and marks it complete when all criteria are met. Statuses: active, completed, paused, failed.',
        is_featured: true,
        include_in_chat: true,
      },
      {
        title: 'Automations Overview',
        slug: 'automations-overview',
        question: 'What are automations and how do I set one up?',
        answer_text: 'Automations are recurring skill executions on a cron schedule. Go to Admin → Skill Hub → Automations → New Automation. Select a trigger type (Cron Schedule), set the schedule (e.g., "0 9 * * 1" for every Monday at 9 AM), choose the skill to execute, and configure arguments. Automations run indefinitely until disabled.',
        is_featured: true,
        include_in_chat: true,
      },
      {
        title: 'Objectives vs Automations',
        slug: 'objectives-vs-automations',
        question: 'When should I use an objective versus an automation?',
        answer_text: 'Use objectives for finite, strategic work with a clear end state: "Research competitors and write a positioning memo." Use automations for ongoing operational routines: "Monitor competitor blog every Monday." Objectives complete when done. Automations run on schedule forever. They complement each other — an objective might discover that a recurring task needs an automation.',
        is_featured: true,
        include_in_chat: true,
      },
      {
        title: 'Objective Progress Tracking',
        slug: 'objective-progress',
        question: 'How does FlowPilot track objective progress?',
        answer_text: 'Each objective has a success_criteria JSONB field (the definition of done) and a progress JSONB field (current state). FlowPilot updates progress using objective_update_progress and objective_complete tools, creating a structured audit trail. View progress in Admin → FlowPilot → Objectives → click any objective.',
        include_in_chat: true,
      },
      {
        title: 'Cron Schedule Examples',
        slug: 'cron-schedule-examples',
        question: 'What are some common cron schedules for automations?',
        answer_text: 'Common schedules: "0 9 * * 1" = every Monday at 9 AM. "0 */12 * * *" = every 12 hours. "0 8 * * 1-5" = weekdays at 8 AM. "0 0 1 * *" = first of every month. "0 9 * * 1,4" = Monday and Thursday at 9 AM. Use these for competitor monitoring, content research, lead scoring, and performance reporting.',
        include_in_chat: true,
      },
    ],
  },

  // ===== A2A PROTOCOL =====
  {
    name: 'Agent-to-Agent (A2A)',
    slug: 'a2a-protocol',
    description: 'Connect FlowPilot with other AI agents for cross-boundary collaboration.',
    icon: 'Network',
    articles: [
      {
        title: 'A2A Overview',
        slug: 'a2a-overview',
        question: 'What is Agent-to-Agent (A2A) and how does FlowPilot use it?',
        answer_text: 'A2A is a peer-to-peer protocol that lets AI agents discover capabilities, exchange tasks, and collaborate across organizations. FlowPilot supports A2A natively — register peers in Admin → System → A2A Peers. Each peer has a URL endpoint, capabilities manifest, and separate inbound/outbound authentication tokens.',
        is_featured: true,
        include_in_chat: true,
      },
      {
        title: 'Registering an A2A Peer',
        slug: 'register-a2a-peer',
        question: 'How do I connect FlowPilot to another AI agent?',
        answer_text: 'Go to Admin → System → A2A Peers → Add Peer. Enter the peer name, URL endpoint, and capabilities. An outbound token is generated automatically. Share your inbound endpoint and token with the peer for bidirectional communication. Test the connection before enabling production traffic.',
        include_in_chat: true,
      },
      {
        title: 'A2A Security',
        slug: 'a2a-security',
        question: 'How is A2A communication secured?',
        answer_text: 'Each A2A peer uses separate inbound and outbound tokens. Inbound tokens are stored as hashes (never plaintext). Outbound tokens are generated using cryptographic random bytes. All communication is logged in a2a_activity with direction, payload, status, and duration for full auditability.',
        is_featured: true,
        include_in_chat: true,
      },
      {
        title: 'A2A Activity Log',
        slug: 'a2a-activity-log',
        question: 'How do I monitor A2A interactions?',
        answer_text: 'Every A2A interaction is logged in the a2a_activity table. View activity in Admin → System → A2A Activity. Each entry shows: peer name, direction (inbound/outbound), skill name, input/output data, status (pending/success/failed), duration in milliseconds, and any error messages.',
        include_in_chat: true,
      },
    ],
  },

  // ===== CONTENT API =====
  {
    name: 'Content API',
    slug: 'content-api',
    description: 'Consume your content via REST/GraphQL endpoints — headless CMS capabilities.',
    icon: 'Code',
    articles: [
      {
        title: 'Content API Overview',
        slug: 'content-api-overview',
        question: 'What is the Content API and how do I use it?',
        answer_text: 'The Content API (Admin → System → Content API) provides 20+ REST/GraphQL endpoints for consuming your content programmatically. Use it for mobile apps, external websites, newsletters, and AI integrations. The API Explorer lets you test endpoints interactively. Content is served in standardized Tiptap JSON format.',
        is_featured: true,
        include_in_chat: true,
      },
      {
        title: 'API Explorer',
        slug: 'api-explorer',
        question: 'How do I test Content API endpoints?',
        answer_text: 'Navigate to Admin → System → Content API. The interactive API Explorer shows all available endpoints with request/response previews. Click any endpoint to see the URL, parameters, and live response data. Copy endpoint URLs directly for use in your applications.',
        include_in_chat: true,
      },
      {
        title: 'Markdown Export for LLMs',
        slug: 'markdown-export-llms',
        question: 'Can I export content as Markdown for AI/LLM consumption?',
        answer_text: 'Yes. The Content API supports Markdown export optimized for LLMs. This includes LLMs.txt generation for AI search engine optimization (AEO). FlowWink automatically structures content for both traditional search engines and AI answer engines.',
        is_featured: true,
        include_in_chat: true,
      },
    ],
  },

  // ===== FLOWAGENT FRAMEWORK =====
  {
    name: 'FlowAgent Framework',
    slug: 'flowagent-framework',
    description: 'The 7-step autonomous reasoning engine that powers FlowPilot.',
    icon: 'Cpu',
    articles: [
      {
        title: 'The 7-Step Loop',
        slug: 'seven-step-loop',
        question: 'What is the FlowAgent 7-step loop?',
        answer_text: 'FlowAgent implements a 7-step autonomous reasoning loop: 1) Self-Heal — check system health, retry failed operations. 2) Propose — evaluate objectives and suggest next actions. 3) Plan — decompose proposals into specific skill calls. 4) Advance — execute skills via agent-execute. 5) Automate — identify patterns that should become recurring automations. 6) Reflect — evaluate what worked and what failed. 7) Remember — store learnings in persistent memory.',
        is_featured: true,
        include_in_chat: true,
      },
      {
        title: 'Shared Reasoning Engine',
        slug: 'shared-reasoning-engine',
        question: 'What is the agent-reason shared module?',
        answer_text: 'The agent-reason module is the centralized logic core that eliminates duplication between interactive tasks (Operate mode — responding to chat/commands) and autonomous tasks (Heartbeat — scheduled cycles). It handles unified LLM orchestration, context loading (Soul, Identity, Memories, Objectives, Instructions), and the iterative reasoning loop. This ensures consistent decision-making regardless of trigger.',
        is_featured: true,
        include_in_chat: true,
      },
      {
        title: 'Built-in Tools',
        slug: 'flowagent-built-in-tools',
        question: 'What tools does the FlowAgent reasoning engine have access to?',
        answer_text: 'FlowAgent has 26+ built-in tools across categories: Ecommerce (product management, order tracking), CRM (lead qualification, company enrichment, deal management), Content (blog writing, page creation, KB updates), Analytics (performance review, conversion analysis), System (soul update, skill instruct, memory management), and A2A (peer communication). The tool registry is database-driven and extensible.',
        include_in_chat: true,
      },
      {
        title: 'Signal Ingest API',
        slug: 'signal-ingest-api',
        question: 'How do external events trigger FlowPilot?',
        answer_text: 'The Signal Ingest API accepts token-authenticated events from external sources via the signal-dispatcher edge function. Database triggers fire signals for internal events (lead created, form submitted, booking made, blog published). Signals trigger matching automations, which execute skills. This creates a reactive layer on top of the proactive objective system.',
        is_featured: true,
        include_in_chat: true,
      },
    ],
  },

  // ===== WEBINARS MODULE =====
  {
    name: 'Webinars',
    slug: 'webinars',
    description: 'Host and manage webinar events with registration, scheduling, and follow-up.',
    icon: 'Video',
    articles: [
      {
        title: 'Webinars Overview',
        slug: 'webinars-overview',
        question: 'How do webinars work in FlowWink?',
        answer_text: 'The Webinars module lets you create events with registration forms, scheduling, and attendee management. Add webinar blocks to any page to display upcoming events. FlowPilot can manage event promotion, registration confirmations, and post-event follow-ups through its skill engine.',
        is_featured: true,
        include_in_chat: true,
      },
      {
        title: 'Creating a Webinar',
        slug: 'creating-webinar',
        question: 'How do I create and promote a webinar?',
        answer_text: 'Go to Admin → Webinars → New Webinar. Set the title, date, time, description, and registration link. Add a Webinar block to any page to display it. FlowPilot can automatically promote webinars via blog posts, newsletter campaigns, and chat recommendations to site visitors.',
        include_in_chat: true,
      },
    ],
  },

  // ===== CONSULTANT PROFILES =====
  {
    name: 'Consultant Profiles',
    slug: 'consultant-profiles',
    description: 'Manage consultant and team member profiles for agency and consulting templates.',
    icon: 'Users',
    articles: [
      {
        title: 'Consultant Profiles Overview',
        slug: 'consultant-profiles-overview',
        question: 'What are consultant profiles and how do they work?',
        answer_text: 'Consultant Profiles let you showcase team members with skills, experience, certifications, hourly rates, and availability status. Used in consulting and agency templates. Profiles support education history, portfolio links, LinkedIn URLs, and multi-language capabilities. Visitors can browse and filter consultants by skill, availability, and expertise.',
        is_featured: true,
        include_in_chat: true,
      },
      {
        title: 'Resume Matcher',
        slug: 'resume-matcher',
        question: 'What is the Resume Matcher feature?',
        answer_text: 'The Resume Matcher block allows visitors to upload a job description or requirements document, and FlowPilot matches it against your consultant profiles — scoring relevance based on skills, experience, and availability. This automates the talent-matching process for staffing agencies and consulting firms.',
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

// =====================================================
// FlowWink Agency Knowledge Base Articles
// =====================================================

export const agencyKbCategories: TemplateKbCategory[] = [
  {
    name: 'Getting Started',
    slug: 'getting-started',
    description: 'Set up FlowWink for your agency in minutes.',
    icon: 'Rocket',
    articles: [
      {
        title: '5-Minute Docker Setup',
        slug: 'docker-setup',
        question: 'How do I install FlowWink with Docker?',
        answer_text: 'FlowWink runs anywhere Docker runs. Quick setup: 1) Clone the repository, 2) Copy .env.example to .env and configure your database URL, 3) Run docker-compose up -d, 4) Access your instance at localhost:3000. The entire process takes under 5 minutes on a fresh server.',
        is_featured: true,
        include_in_chat: true,
      },
      {
        title: 'Your First Client Site',
        slug: 'first-client-site',
        question: 'How do I create a site for my first client?',
        answer_text: 'After installation: 1) Log into admin at /admin, 2) Navigate to Settings → Site Settings, 3) Configure the organization name and branding for your client, 4) Create pages using the visual block editor, 5) Set up a custom domain. You can duplicate this setup for each new client using Docker containers or database separation.',
        is_featured: true,
        include_in_chat: true,
      },
      {
        title: 'White-Labeling Guide',
        slug: 'white-labeling',
        question: 'How do I white-label FlowWink for my agency?',
        answer_text: 'FlowWink is fully white-labelable: 1) Replace the logo in Settings → Branding, 2) Customize colors and fonts to match your agency brand, 3) Configure custom domains per client, 4) Update email templates with your branding, 5) Customize the AI chat system prompt to reference your agency. There are no "Powered by" badges to remove.',
        include_in_chat: true,
      },
    ],
  },
  {
    name: 'Multi-Site Management',
    slug: 'multi-site',
    description: 'Managing multiple client sites efficiently.',
    icon: 'Layers',
    articles: [
      {
        title: 'Architecture Options',
        slug: 'architecture',
        question: 'How should I structure multiple client sites?',
        answer_text: 'Three approaches: 1) Single instance with shared database (simplest, best for related sites), 2) Single instance with separate databases per client (more isolation), 3) Separate Docker containers per client (complete isolation, easiest to transfer). Most agencies use approach 2 or 3 depending on client requirements.',
        is_featured: true,
        include_in_chat: true,
      },
      {
        title: 'Template Reuse',
        slug: 'template-reuse',
        question: 'Can I reuse page templates across clients?',
        answer_text: 'Yes! Create template pages in a "master" instance, then export and import them to client sites. Or use Global Blocks to create reusable components. Many agencies maintain a template library of common page layouts (service pages, about pages, contact pages) that can be customized per client.',
        include_in_chat: true,
      },
      {
        title: 'Client Onboarding',
        slug: 'onboarding',
        question: 'What is the best way to onboard new clients?',
        answer_text: 'Our recommended workflow: 1) Clone your agency template repository, 2) Configure client branding, 3) Import starter content, 4) Train client on the admin interface (most need only 30-minute walkthrough), 5) Set up their user account with appropriate permissions. Most agencies can complete client onboarding in under 2 hours.',
        include_in_chat: true,
      },
    ],
  },
  {
    name: 'Migrations',
    slug: 'migrations',
    description: 'Moving client sites from other platforms.',
    icon: 'ArrowRightLeft',
    articles: [
      {
        title: 'From WordPress',
        slug: 'from-wordpress',
        question: 'How do I migrate a client from WordPress?',
        answer_text: 'WordPress migration steps: 1) Export WordPress content using WP All Export or similar, 2) Use FlowWink import tool to bring in pages and posts, 3) Recreate the design using FlowWink blocks (often cleaner than the original), 4) Redirect old URLs to new slugs, 5) Test thoroughly before DNS cutover. Typical migration: 4-8 hours depending on site complexity.',
        is_featured: true,
        include_in_chat: true,
      },
      {
        title: 'From Webflow',
        slug: 'from-webflow',
        question: 'How do I migrate a client from Webflow?',
        answer_text: 'Webflow migration: 1) Export Webflow content (CMS items export to CSV), 2) Design is typically recreated in FlowWink (block-based approach is different), 3) Import blog posts and CMS content, 4) Set up redirects for URL changes, 5) Cancel Webflow subscription after successful cutover. Most agencies find FlowWink simpler to maintain than Webflow.',
        include_in_chat: true,
      },
      {
        title: 'From Squarespace',
        slug: 'from-squarespace',
        question: 'How do I migrate a client from Squarespace?',
        answer_text: 'Squarespace migration: 1) Export content using Squarespace export (limited to blog and pages), 2) Download all images manually, 3) Recreate pages in FlowWink using the block editor, 4) Import blog posts, 5) Test and cutover. Clients often appreciate the simpler FlowWink admin compared to Squarespace.',
        include_in_chat: true,
      },
    ],
  },
  {
    name: 'Pricing & Billing',
    slug: 'pricing',
    description: 'Understanding FlowWink costs for agencies.',
    icon: 'DollarSign',
    articles: [
      {
        title: 'Is FlowWink Really Free?',
        slug: 'is-it-free',
        question: 'Is FlowWink really free to use?',
        answer_text: 'Yes, FlowWink is 100% free and open source. You pay only for your infrastructure (VPS hosting, typically €10-50/month for multiple sites). There are no per-site fees, no user limits, no feature gates. The code is MIT licensed, meaning you can use, modify, and distribute it freely.',
        is_featured: true,
        include_in_chat: true,
      },
      {
        title: 'Infrastructure Costs',
        slug: 'infrastructure-costs',
        question: 'What are the typical infrastructure costs?',
        answer_text: 'Typical costs: 1) VPS hosting: €10-50/month depending on traffic, 2) Domain names: €10-15/year per client domain, 3) Email sending: Often free tier is sufficient. A €20/month VPS (Hetzner, DigitalOcean) can easily host 20+ client sites. That is €1 per site per month.',
        include_in_chat: true,
      },
      {
        title: 'Managed Hosting Option',
        slug: 'managed-hosting',
        question: 'Do you offer managed hosting?',
        answer_text: 'Yes, if you prefer not to manage infrastructure, we offer managed hosting starting at €49/site/month. This includes automatic updates, backups, monitoring, and priority support. Many agencies start self-hosted and move high-value clients to managed hosting for peace of mind.',
        include_in_chat: true,
      },
    ],
  },
];
