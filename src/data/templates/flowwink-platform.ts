/**
 * FlowWink Platform Template
 * 
 * The first autonomous agentic CMS. Your website runs itself.
 * Powered by FlowPilot — an OpenClaw-inspired autonomous agent with
 * persistent memory, self-evolving skills, and goal-driven objectives.
 * 
 * This is the "dogfooding" template - FlowWink built with FlowWink.
 * 
 * Page structure:
 *   Home             → Pitch + Pricing (convince & convert)
 *   FlowPilot        → The agent (differentiate, A2A)
 *   For Consultancies → Vertical elevator pitch (consult-agency best-of)
 *   For E-Commerce    → Vertical elevator pitch (digital-shop best-of)
 *   For Services      → Vertical elevator pitch (service-pro best-of)
 *   For Healthcare    → Vertical elevator pitch (securehealth best-of)
 */
import type { StarterTemplate } from './types';
import { flowwinkBlogPosts } from '../template-blog-posts';
import { flowwinkKbCategories } from '../template-kb-articles';

export const flowwinkPlatformTemplate: StarterTemplate = {
  id: 'flowwink-platform',
  name: 'FlowWink Platform',
  description: 'The first autonomous agentic CMS. Your website runs itself.',
  category: 'platform',
  icon: 'Bot',
  tagline: 'Set objectives. FlowPilot operates.',
  aiChatPosition: 'Embedded autonomous agent for site operations',
  blogPosts: flowwinkBlogPosts,
  kbCategories: flowwinkKbCategories,
  requiredModules: ['blog', 'knowledgeBase', 'chat', 'liveSupport', 'newsletter', 'leads', 'deals', 'companies', 'forms', 'ecommerce', 'bookings', 'analytics', 'contentApi', 'webinars', 'resume', 'tickets', 'federation', 'salesIntelligence', 'paidGrowth'],
  pages: [
    // ═══════════════════════════════════════════════════════════
    // HOME — The Pitch + Pricing (convince & convert in one scroll)
    // ═══════════════════════════════════════════════════════════
    {
      title: 'Home',
      slug: 'home',
      isHomePage: true,
      menu_order: 1,
      showInMenu: true,
      meta: {
        description: 'FlowWink is the first autonomous agentic CMS. FlowPilot writes your content, qualifies your leads, runs your campaigns, and learns from every interaction.',
        showTitle: false,
        titleAlignment: 'center',
      },
      blocks: [
        // ANNOUNCEMENT BAR
        {
          id: 'announcement-flowpilot',
          type: 'announcement-bar',
          data: {
            message: '🤖 Introducing FlowPilot — The first CMS that operates itself',
            linkText: 'Meet the agent',
            linkUrl: '/flowpilot',
            variant: 'gradient',
            dismissable: true,
            sticky: false,
          },
        },
        // HERO — The money shot
        {
          id: 'hero-main',
          type: 'hero',
          data: {
            title: 'Your Website Runs Itself',
            subtitle: 'FlowPilot is an autonomous AI agent that writes your content, qualifies your leads, runs your campaigns, and learns from every interaction. You set the objectives. It does the rest.',
            backgroundType: 'video',
            videoUrl: 'https://cdn.prod.website-files.com/673761996d53e695f4ec8cb6%2F67b84e27497ac9c515a29519_wassching%20opening-transcode.mp4',
            videoPosterUrl: 'https://images.pexels.com/photos/3861969/pexels-photo-3861969.jpeg?auto=compress&w=1920',
            heightMode: 'viewport',
            contentAlignment: 'center',
            overlayOpacity: 55,
            titleAnimation: 'slide-up',
            showScrollIndicator: true,
            primaryButton: { text: 'Meet FlowPilot', url: '#chat-hero-usp' },
            secondaryButton: { text: 'Self-Host Free', url: 'https://github.com/magnusfroste/flowwink' },
          },
        },
        // CHAT LAUNCHER — Talk to FlowPilot
        {
          id: 'chat-hero-usp',
          type: 'chat-launcher',
          data: {
            title: 'Talk to FlowPilot Right Now',
            subtitle: 'This isn\'t a FAQ bot. FlowPilot has read every page, blog post, and KB article on this site. It has memory. It learns. Ask it anything.',
            placeholder: 'Ask about autonomous operations, skills, self-hosting...',
            showQuickActions: true,
            quickActionCount: 4,
            variant: 'hero-integrated',
          },
        },
        // SECTION DIVIDER
        {
          id: 'divider-hero-stats',
          type: 'section-divider',
          data: { shape: 'wave', height: 'md' },
        },
        // STATS — The jaw-droppers
        {
          id: 'stats-hero',
          type: 'stats',
          data: {
            items: [
              { id: 's1', value: '58+', label: 'Block Types' },
              { id: 's2', value: '40+', label: 'Agent Skills' },
              { id: 's3', value: '22', label: 'Modules' },
              { id: 's4', value: '100%', label: 'Self-Hostable' },
            ],
            columns: 4,
            variant: 'minimal',
          },
        },
        // PARADIGM SHIFT — The investor/vision argument
        {
          id: 'two-col-paradigm',
          type: 'two-column',
          data: {
            eyebrow: 'THE AGENTIC WEB',
            title: 'SaaS Solved Distribution. It Never Solved the Work.',
            content: 'Every tool you pay for hands the work back to you. HubSpot, Webflow, Mailchimp — you still have to pick them up. That\'s not software that scales. That\'s software that delegates the burden.\n\nThe next generation of business software doesn\'t wait to be used. It acts.\n\nFlowWink is built native agentic from day one. Not a chatbot bolted onto a CMS. Not an AI button added to an existing product. An autonomous operator that runs your business while you sleep.',
            secondaryContent: '**Traditional SaaS**\nHuman → Tool → Result\n\n**FlowWink**\nHuman sets direction → Agent executes → Result',
            layout: 'text-text',
            contentFormat: 'markdown',
            primaryButton: { text: 'Meet FlowPilot', url: '/flowpilot' },
          },
        },
        // TIMELINE — How FlowPilot Works (3 steps — simple)
        {
          id: 'timeline-how',
          type: 'timeline',
          data: {
            title: 'How FlowPilot Works',
            subtitle: 'You direct. FlowPilot operates. You approve.',
            items: [
              {
                id: 'hw-1',
                title: 'You Set Objectives',
                description: '"Write 4 blog posts per month. Qualify all inbound leads. Send a weekly newsletter." Define what success looks like — FlowPilot figures out how.',
                icon: 'Target',
              },
              {
                id: 'hw-2',
                title: 'FlowPilot Operates',
                description: 'Writes content, scores leads, sends campaigns, books meetings, enriches companies, analyzes performance — autonomously, around the clock.',
                icon: 'Bot',
              },
              {
                id: 'hw-3',
                title: 'You Review & Approve',
                description: 'Every action is logged. Sensitive operations require your approval. Full human-in-the-loop when you want it, full autonomy when you don\'t.',
                icon: 'CheckCircle',
              },
            ],
            layout: 'horizontal',
          },
        },
        // QUICK LINKS — Use Cases
        {
          id: 'links-after-timeline',
          type: 'quick-links',
          data: {
            heading: 'See it in action for your industry',
            links: [
              { id: 'ql1-consult', label: 'Consultancies', url: '/for-consultancies' },
              { id: 'ql1-ecom', label: 'E-Commerce', url: '/for-ecommerce' },
              { id: 'ql1-services', label: 'Service Business', url: '/for-services' },
              { id: 'ql1-health', label: 'Healthcare', url: '/for-healthcare' },
            ],
            variant: 'dark',
            layout: 'split',
          },
        },
        // BENTO GRID — The Agent Brain
        {
          id: 'bento-agent-brain',
          type: 'bento-grid',
          data: {
            title: 'The Autonomous Loop',
            subtitle: 'FlowPilot isn\'t a chatbot bolted onto a CMS. It\'s an autonomous operator with memory, goals, and 40+ skills — replacing your CMS, chatbot, marketing automation, and CRM with a single intelligence that never stops working.',
            eyebrow: 'AGENTIC WEB',
            columns: 3,
            variant: 'glass',
            gap: 'md',
            staggeredReveal: true,
            items: [
              { id: 'bg-skills', title: 'Skill Engine', description: 'Content creation, lead qualification, email campaigns, ticket triage, SEO analysis — 40+ skills that execute autonomously. FlowPilot doesn\'t suggest. It acts. And when it needs a capability it doesn\'t have, it builds one.', icon: 'Zap', span: 'wide', accentColor: '#3B82F6' },
              { id: 'bg-memory', title: 'Deep Organizational Memory', description: 'Every conversation, every lead interaction, every content decision — stored as persistent memory. FlowPilot learns your brand voice, remembers what converts, and gets sharper with every interaction. This isn\'t context. It\'s institutional knowledge.\n\n• Brand voice calibration from real conversations\n• Lead scoring refined by conversion outcomes\n• Content performance patterns across channels\n• Seasonal trends and audience behavior shifts', icon: 'Brain', span: 'large', accentColor: '#8B5CF6' },
              { id: 'bg-objectives', title: 'Goal-Driven Execution', description: 'Define business objectives. FlowPilot decomposes them into tasks, prioritizes by impact, executes step-by-step, and reports progress. You set "where" — it figures out "how."', icon: 'Target', accentColor: '#10B981' },
              { id: 'bg-browser', title: 'Browser Control', description: 'Research competitors on LinkedIn. Read login-walled articles. Scrape pricing pages behind paywalls. FlowPilot uses a Chrome Extension relay to browse with your authenticated session — no API keys, no scraping hacks, just your real browser doing the work.\n\n• Competitor pricing and positioning analysis\n• LinkedIn profile enrichment for lead research\n• Industry news monitoring and trend detection\n• Authenticated access — no credentials stored server-side', icon: 'Globe', span: 'large', accentColor: '#F97316' },
              { id: 'bg-heartbeat', title: 'The 6-Hour Heartbeat', description: 'Four times daily, FlowPilot wakes up autonomously: evaluates objectives, plans next actions, advances goals, proposes new ones, checks automations, reflects on outcomes, and persists learnings. Morning briefing lands in your inbox. No prompts required.', icon: 'Activity', accentColor: '#F59E0B' },
              { id: 'bg-automations', title: 'Event-Driven Automation', description: 'Visitor asks a question → lead captured and scored. Blog post approved → distributed across channels. Form submitted → personalized follow-up sent. Every signal triggers intelligent action.', icon: 'GitBranch', accentColor: '#EC4899' },
              { id: 'bg-evolution', title: 'Self-Improving Intelligence', description: 'FlowPilot rewrites its own instructions based on outcomes. Skills that underperform get refined. New patterns get codified. The system doesn\'t just run — it evolves. Week over week, it becomes a better operator than the last version of itself.', icon: 'Sparkles', span: 'wide', accentColor: '#06B6D4' },
            ],
          },
        },
        // PARALLAX — The killer line
        {
          id: 'parallax-vision',
          type: 'parallax-section',
          data: {
            backgroundImage: 'https://images.pexels.com/photos/373543/pexels-photo-373543.jpeg?auto=compress&w=1920',
            title: 'Not a Chatbot. An Operator.',
            subtitle: 'FlowPilot doesn\'t wait for instructions. It has objectives, memory, and skills. It operates your entire digital presence while you sleep.',
            height: 'md',
            textColor: 'light',
            overlayOpacity: 65,
            contentAlignment: 'center',
          },
        },
        // QUICK LINKS — Go deeper on the agent
        {
          id: 'links-after-agent',
          type: 'quick-links',
          data: {
            heading: 'Explore the architecture',
            links: [
              { id: 'ql2-flowpilot', label: 'Explore FlowPilot', url: '/flowpilot' },
              { id: 'ql2-github', label: 'View Source on GitHub', url: 'https://github.com/magnusfroste/flowwink' },
            ],
            variant: 'muted',
            layout: 'split',
          },
        },
        // TESTIMONIALS
        {
          id: 'testimonials-main',
          type: 'testimonials',
          data: {
            title: 'What Happens When Your CMS Thinks For Itself',
            testimonials: [
              {
                id: 'test-1',
                content: 'FlowPilot wrote 12 blog posts last month while I focused on strategy. Each one matched our brand voice perfectly. I just reviewed and approved.',
                author: 'Emma Lindqvist',
                role: 'CMO',
                company: 'TechStart AB',
                rating: 5,
              },
              {
                id: 'test-2',
                content: 'We stopped manually qualifying leads. FlowPilot captures them from chat, enriches with company data, scores them, and routes to sales — all before we even open the CRM.',
                author: 'Marcus Andersson',
                role: 'Head of Sales',
                company: 'DigitalFlow',
                rating: 5,
              },
              {
                id: 'test-3',
                content: 'The self-hosting with private LLM was the dealbreaker. Patient data never leaves our infrastructure, but we still get autonomous content management.',
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
        // SOCIAL PROOF — What autonomy looks like in numbers
        {
          id: 'social-proof-live',
          type: 'social-proof',
          data: {
            title: 'Autonomous Operations in Production',
            subtitle: 'Real numbers from teams letting FlowPilot run their digital presence.',
            items: [
              { id: 'sp1', type: 'counter', label: 'Sites Running', value: '1,200', icon: 'globe' },
              { id: 'sp2', type: 'counter', label: 'Skills Executed', value: '48,500', icon: 'zap' },
              { id: 'sp3', type: 'rating', label: 'Approval Rate', value: '4.9', rating: 4.9, maxRating: 5 },
              { id: 'sp4', type: 'counter', label: 'GitHub Stars', value: '1,450', icon: 'star' },
            ],
            variant: 'cards',
            layout: 'horizontal',
            size: 'lg',
            animated: true,
            showLiveIndicator: true,
          },
        },
        {
          id: 'badge-trust',
          type: 'badge',
          data: {
            title: 'Built for Control & Compliance',
            subtitle: 'Autonomous doesn\'t mean uncontrolled.',
            badges: [
              { id: 'b1', title: 'Open Source', subtitle: 'MIT License', icon: 'star' },
              { id: 'b2', title: 'Self-Hosted', subtitle: 'Your Infrastructure', icon: 'check' },
              { id: 'b3', title: 'Private AI', subtitle: 'Your LLM, Your Data', icon: 'shield' },
              { id: 'b4', title: 'GDPR Ready', subtitle: 'Privacy First', icon: 'award' },
            ],
            variant: 'cards',
            columns: 4,
            size: 'md',
            showTitles: true,
            grayscale: false,
          },
        },
        // ─── PRICING SECTION (moved from /pricing) ───
        {
          id: 'countdown-launch',
          type: 'countdown',
          data: {
            title: 'Early Adopter Offer',
            subtitle: 'Get 30% off managed cloud for life – limited time',
            targetDate: '2026-06-30T23:59:59',
            expiredMessage: 'Early adopter pricing has ended',
            variant: 'cards',
            size: 'lg',
            showDays: true,
            showHours: true,
            showMinutes: true,
            showSeconds: true,
          },
        },
        {
          id: 'pricing-detailed',
          type: 'pricing',
          data: {
            title: 'Simple, Transparent Pricing',
            subtitle: 'FlowPilot agent included in every plan. No per-seat charges. No AI usage fees.',
            tiers: [
              {
                id: 'tier-self',
                name: 'Self-Hosted',
                price: 'Free',
                period: 'forever',
                description: 'Full FlowPilot agent. Your servers. Your LLM. Complete data sovereignty.',
                features: ['All CMS features + FlowPilot', 'Unlimited autonomous operations', 'Private LLM support (Ollama)', '30+ agent skills', 'Persistent memory & objectives', 'Community support'],
                buttonText: 'View on GitHub',
                buttonUrl: 'https://github.com/magnusfroste/flowwink',
              },
              {
                id: 'tier-managed',
                name: 'Managed Cloud',
                price: '€49',
                period: '/month',
                description: 'We run the infrastructure. FlowPilot runs your digital presence.',
                features: ['Everything in Self-Hosted', 'Automatic updates', 'Daily backups + SSL + CDN', 'Managed AI model access', 'Priority email support', '99.9% uptime SLA'],
                buttonText: 'Start Free Trial',
                buttonUrl: '#contact-form',
                highlighted: true,
                badge: 'Most Popular',
              },
              {
                id: 'tier-enterprise',
                name: 'Enterprise',
                price: 'Custom',
                description: 'Dedicated FlowPilot with custom skills and compliance support.',
                features: ['Everything in Managed', 'Dedicated infrastructure', 'Custom skill development', 'SSO (SAML/OIDC)', 'Dedicated success manager', 'Compliance & audit support'],
                buttonText: 'Contact Sales',
                buttonUrl: '#contact-form',
              },
            ],
            columns: 3,
            variant: 'cards',
          },
        },
        {
          id: 'table-comparison',
          type: 'table',
          data: {
            title: 'Detailed Feature Comparison',
            caption: 'See exactly what\'s included in each plan.',
            columns: [
              { id: 'col1', header: 'Feature', align: 'left' },
              { id: 'col2', header: 'Self-Hosted', align: 'center' },
              { id: 'col3', header: 'Managed Cloud', align: 'center' },
              { id: 'col4', header: 'Enterprise', align: 'center' },
            ],
            rows: [
              ['Pages & Content', 'Unlimited', 'Unlimited', 'Unlimited'],
              ['FlowPilot Agent', '✅', '✅', '✅'],
              ['Autonomous Skills', '30+', '30+', 'Custom'],
              ['Persistent Memory', '✅', '✅', '✅'],
              ['Private LLM Support', '✅', '✅', '✅'],
              ['Automatic Updates', '❌', '✅', '✅'],
              ['Managed Backups', '❌', '✅ Daily', '✅ Hourly'],
              ['SSL & CDN', '❌', '✅', '✅'],
              ['Uptime SLA', '❌', '99.9%', 'Custom'],
              ['SSO (SAML/OIDC)', '❌', '❌', '✅'],
              ['Custom Skills', '❌', '❌', '✅'],
              ['Support', 'Community', 'Priority Email', 'Dedicated Manager'],
            ],
            variant: 'striped',
            size: 'md',
            stickyHeader: true,
            highlightOnHover: true,
          },
        },
        // FAQ
        {
          id: 'accordion-faq',
          type: 'accordion',
          data: {
            title: 'Frequently Asked Questions',
            items: [
              { question: 'What is FlowPilot?', answer: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'FlowPilot is an autonomous AI agent built into FlowWink. Unlike chatbots that respond to prompts, FlowPilot has persistent memory, self-evolving skills, and goal-driven objectives. It operates your entire digital presence — content, CRM, email, bookings — continuously and autonomously.' }] }] } },
              { question: 'Is it safe to let an AI run my website?', answer: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Yes. FlowPilot has a full human-in-the-loop system. Every skill can be configured to require approval before execution. Every action is logged in the activity feed with full audit trails. You control what\'s autonomous and what requires your sign-off.' }] }] } },
              { question: 'Is self-hosted really free forever?', answer: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Yes! FlowWink is open source under the MIT license. You get the full FlowPilot agent, all skills, persistent memory — everything. The only costs are your own hosting and AI model API fees.' }] }] } },
              { question: 'Can I use my own AI model?', answer: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Absolutely. FlowWink supports OpenAI, Google Gemini, and local LLMs via Ollama or any OpenAI-compatible endpoint. Your data stays on your infrastructure for complete privacy.' }] }] } },
              { question: 'Can I migrate from self-hosted to managed?', answer: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Yes. We provide migration tools to move your content, agent memory, and settings to our managed infrastructure. The process is seamless.' }] }] } },
              { question: 'How is this different from ChatGPT + WordPress?', answer: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'ChatGPT is a conversation tool. FlowPilot is an operator. It has persistent memory that survives across sessions, objectives it tracks toward completion, skills it can execute autonomously, and a self-evolution mechanism. It\'s not just answering questions — it\'s running your business.' }] }] } },
            ],
          },
        },
        // QUICK LINKS — Evaluate
        {
          id: 'links-after-trust',
          type: 'quick-links',
          data: {
            heading: 'Ready to evaluate?',
            links: [
              { id: 'ql3-flowpilot', label: 'Deep Dive: FlowPilot', url: '/flowpilot' },
              { id: 'ql3-github', label: 'Self-Host Free', url: 'https://github.com/flowwink/flowwink' },
            ],
            variant: 'dark',
            layout: 'split',
          },
        },
        // CONTACT FORM
        {
          id: 'contact-form',
          type: 'form',
          data: {
            title: 'Get in Touch',
            subtitle: 'Start your free trial or ask us anything — we typically respond within a few hours.',
            formName: 'contact',
            fields: [
              { id: 'name', label: 'Name', type: 'text', required: true, placeholder: 'Your name' },
              { id: 'email', label: 'Email', type: 'email', required: true, placeholder: 'you@company.com' },
              { id: 'company', label: 'Company', type: 'text', required: false, placeholder: 'Company name (optional)' },
              { id: 'message', label: 'Message', type: 'textarea', required: true, placeholder: 'Tell us what you need...' },
            ],
            submitText: 'Send Message',
            successMessage: 'Thanks! We\'ll be in touch shortly.',
          },
        },
        // CTA — Final
        {
          id: 'cta-final',
          type: 'cta',
          data: {
            title: 'Stop Managing. Start Directing.',
            subtitle: 'Set objectives. FlowPilot operates. You approve. It\'s that simple.',
            buttonText: 'Self-Host Free',
            buttonUrl: 'https://github.com/magnusfroste/flowwink',
            secondaryButtonText: 'Start Trial',
            secondaryButtonUrl: '#contact-form',
            gradient: true,
          },
        },
        // FLOATING CTA
        {
          id: 'floating-cta-demo',
          type: 'floating-cta',
          data: {
            title: 'Talk to FlowPilot',
            subtitle: 'Live autonomous agent',
            buttonText: 'Try It Now',
            buttonUrl: '#chat-hero-usp',
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

    // ═══════════════════════════════════════════════════════════
    // FLOWPILOT — The Agent Deep Dive
    // ═══════════════════════════════════════════════════════════
    {
      title: 'FlowPilot',
      slug: 'flowpilot',
      menu_order: 2,
      showInMenu: true,
      meta: {
        description: 'Meet FlowPilot — the autonomous AI agent that operates your digital presence. Skills, memory, objectives, A2A protocol, and self-evolution.',
        showTitle: false,
        titleAlignment: 'center',
      },
      blocks: [
        {
          id: 'hero-flowpilot',
          type: 'hero',
          data: {
            title: 'Meet FlowPilot',
            subtitle: 'The first autonomous agent that doesn\'t just answer questions — it operates your entire digital presence. Content, CRM, campaigns, bookings — all running on objectives, memory, and self-evolving skills.',
            backgroundType: 'image',
            backgroundImage: 'https://images.pexels.com/photos/8386440/pexels-photo-8386440.jpeg?auto=compress&w=1920',
            heightMode: '80vh',
            contentAlignment: 'center',
            overlayOpacity: 65,
            titleAnimation: 'fade-in',
            primaryButton: { text: 'Talk to FlowPilot', url: '#chat-hero-usp' },
            secondaryButton: { text: 'See Pricing', url: '/#pricing-detailed' },
          },
        },
        // THE SOUL
        {
          id: 'twocol-soul',
          type: 'two-column',
          data: {
            eyebrow: 'AGENT ARCHITECTURE',
            title: 'The Soul of FlowPilot',
            accentText: 'Persistent Identity',
            accentPosition: 'end',
            leftColumn: {
              type: 'doc',
              content: [
                { type: 'paragraph', content: [{ type: 'text', text: 'Every FlowPilot instance has a soul — a persistent identity document that defines who it is, what it values, and how it behaves. The soul isn\'t a static prompt. It evolves based on experience.' }] },
                { type: 'paragraph', content: [{ type: 'text', text: 'When FlowPilot writes a blog post, it doesn\'t just follow instructions. It writes as itself — with a voice shaped by hundreds of past interactions, feedback loops, and self-reflections.' }] },
                { type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'bold' }], text: 'This is the difference between a tool and an operator.' }] },
              ],
            },
            rightColumn: {
              type: 'doc',
              content: [
                { type: 'heading', attrs: { level: 3 }, content: [{ type: 'text', text: '🧠 Soul Components' }] },
                { type: 'bulletList', content: [
                  { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'bold' }], text: 'Identity' }, { type: 'text', text: ' — Name, role, core personality traits' }] }] },
                  { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'bold' }], text: 'Values' }, { type: 'text', text: ' — What it prioritizes (accuracy, speed, empathy)' }] }] },
                  { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'bold' }], text: 'Communication Style' }, { type: 'text', text: ' — How it writes, responds, and interacts' }] }] },
                  { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'bold' }], text: 'Boundaries' }, { type: 'text', text: ' — What it won\'t do, even if asked' }] }] },
                  { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'bold' }], text: 'Self-Image' }, { type: 'text', text: ' — How it describes itself to visitors' }] }] },
                ]},
              ],
            },
            layout: '50-50',
          },
        },
        // SKILLS
        {
          id: 'features-skills',
          type: 'features',
          data: {
            title: '40+ Autonomous Skills',
            subtitle: 'Each skill is a capability FlowPilot can execute independently. Skills have instructions, parameters, and self-improving documentation. Including ticket triage and A2A federation.',
            features: [
              { id: 'sk-blog', icon: 'FileText', title: 'blog_write', description: 'Research topics, write posts in brand voice, add SEO metadata, schedule for publishing.' },
              { id: 'sk-lead', icon: 'UserPlus', title: 'lead_qualify', description: 'Score leads, enrich with company data, generate qualification summary and next steps.' },
              { id: 'sk-email', icon: 'Mail', title: 'newsletter_create', description: 'Segment audiences, write copy, design layout, schedule send at optimal time.' },
              { id: 'sk-reflect', icon: 'Brain', title: 'reflect', description: 'Analyze recent activity, identify patterns, suggest improvements, update memory.' },
              { id: 'sk-soul', icon: 'Heart', title: 'soul_update', description: 'Evolve personality, values, and behavioral patterns based on accumulated experience.' },
              { id: 'sk-instruct', icon: 'BookOpen', title: 'skill_instruct', description: 'Rewrite its own skill instructions to improve execution quality over time.' },
            ],
            columns: 3,
            layout: 'grid',
            variant: 'cards',
            iconStyle: 'square',
          },
        },
        // MEMORY
        {
          id: 'bento-memory',
          type: 'bento-grid',
          data: {
            eyebrow: 'PERSISTENT MEMORY',
            title: 'It Remembers Everything',
            subtitle: 'FlowPilot\'s memory isn\'t a conversation history. It\'s a structured knowledge base that grows with every interaction.',
            columns: 3,
            variant: 'glass',
            gap: 'md',
            staggeredReveal: true,
            items: [
              { id: 'mem-facts', title: 'Organizational Facts', description: 'Brand voice, product details, team info — everything FlowPilot needs to operate as a knowledgeable team member.', icon: 'BookOpen', span: 'wide', accentColor: '#8B5CF6' },
              { id: 'mem-patterns', title: 'Behavioral Patterns', description: 'What converts, what doesn\'t. Which headlines perform. Which lead sources are hottest. Patterns extracted from real data.', icon: 'TrendingUp', accentColor: '#10B981' },
              { id: 'mem-reflections', title: 'Self-Reflections', description: 'After every execution cycle, FlowPilot writes what it learned. These reflections shape future decisions.', icon: 'Brain', accentColor: '#3B82F6' },
              { id: 'mem-categories', title: 'Categorized & Searchable', description: 'Memory isn\'t a blob. It\'s structured: facts, patterns, reflections, instructions — each category with its own retrieval strategy.', icon: 'Database', span: 'wide', accentColor: '#F59E0B' },
            ],
          },
        },
        // A2A PROTOCOL
        {
          id: 'divider-a2a',
          type: 'section-divider',
          data: { shape: 'wave', height: 'md' },
        },
        {
          id: 'twocol-a2a',
          type: 'two-column',
          data: {
            eyebrow: 'AGENT-TO-AGENT PROTOCOL',
            title: 'Your Site Becomes a Participant in the',
            accentText: 'Agentic Web',
            accentPosition: 'end',
            leftColumn: {
              type: 'doc',
              content: [
                { type: 'paragraph', content: [{ type: 'text', text: 'The web is changing. Websites won\'t just be visited by humans — they\'ll be queried by other AI agents. Google\'s crawlers, shopping agents, recruitment bots, enterprise procurement systems.' }] },
                { type: 'paragraph', content: [{ type: 'text', text: 'FlowPilot implements the Agent-to-Agent protocol. External agents can query your site programmatically, and FlowPilot responds with structured data — not HTML pages, but rich, typed responses.' }] },
                { type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'bold' }], text: 'Your site doesn\'t get visited — it gets consulted.' }] },
              ],
            },
            rightColumn: {
              type: 'doc',
              content: [
                { type: 'heading', attrs: { level: 3 }, content: [{ type: 'text', text: '🌐 A2A Capabilities' }] },
                { type: 'bulletList', content: [
                  { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'bold' }], text: 'Skill Exposure' }, { type: 'text', text: ' — Publish your FlowPilot skills as queryable endpoints for external agents' }] }] },
                  { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'bold' }], text: 'Peer Discovery' }, { type: 'text', text: ' — Register and discover other FlowPilot instances for agent collaboration' }] }] },
                  { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'bold' }], text: 'Rich Responses' }, { type: 'text', text: ' — Not text — full blocks: profiles, products, booking widgets' }] }] },
                  { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'bold' }], text: 'Scoped & Auditable' }, { type: 'text', text: ' — Configure which agents can query, with what scope' }] }] },
                ]},
              ],
            },
            layout: '50-50',
          },
        },
        // BENTO — A2A in practice
        {
          id: 'bento-a2a',
          type: 'bento-grid',
          data: {
            eyebrow: 'USE CASES',
            title: 'A2A in the Real World',
            columns: 3,
            variant: 'bordered',
            gap: 'md',
            items: [
              { id: 'a2a-1', title: 'Recruitment Agents', description: '"Find me 3 senior React developers available in Q3." FlowPilot searches your CRM, scores for fit, and responds with structured profiles — not a webpage.', icon: 'UserCheck', span: 'wide', accentColor: '#3B82F6' },
              { id: 'a2a-2', title: 'Procurement Systems', description: 'Enterprise procurement agents query your product catalog, check availability, get pricing — all without a human touching a form.', icon: 'ShoppingCart', accentColor: '#8B5CF6' },
              { id: 'a2a-3', title: 'Rich Block Responses', description: 'A2A responses aren\'t just text. FlowPilot renders full blocks — a Resume block with ranked profiles, a product grid, a booking widget.', icon: 'LayoutGrid', accentColor: '#06B6D4' },
              { id: 'a2a-4', title: 'Context Persistence', description: 'Every A2A interaction is stored in memory. FlowPilot learns what external agents ask and improves its response quality over time.', icon: 'Brain', accentColor: '#10B981' },
              { id: 'a2a-5', title: 'Scoped & Auditable', description: 'Configure which agents can query your FlowPilot instance, with what scope. Every interaction is logged with full audit trail.', icon: 'Shield', span: 'wide', accentColor: '#F59E0B' },
            ],
          },
        },
        // RESUME BLOCK — A2A in practice
        {
          id: 'divider-resume',
          type: 'section-divider',
          data: { shape: 'curved', height: 'sm' },
        },
        {
          id: 'twocol-resume-block',
          type: 'two-column',
          data: {
            eyebrow: 'A2A IN PRACTICE',
            title: 'The Resume Block:',
            accentText: 'AI Matchmaking',
            accentPosition: 'end',
            leftColumn: {
              type: 'doc',
              content: [
                { type: 'paragraph', content: [{ type: 'text', text: 'A staffing agency. A client\'s recruiting AI sends a query: "Find me three senior React developers available in Q3."' }] },
                { type: 'paragraph', content: [{ type: 'text', text: 'FlowPilot doesn\'t return a webpage. It searches your consultant CRM, evaluates skills and availability, scores for fit — then responds with a rendered Resume block: structured profiles, ranked by relevance.' }] },
                { type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'bold' }], text: 'This is the agentic web in action. Your site doesn\'t get visited — it gets consulted.' }] },
              ],
            },
            rightColumn: {
              type: 'doc',
              content: [
                { type: 'heading', attrs: { level: 3 }, content: [{ type: 'text', text: '🧑‍💻 Use Cases' }] },
                { type: 'bulletList', content: [
                  { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'bold' }], text: 'Staffing & Consulting' }, { type: 'text', text: ' — Present matched candidates to client agents' }] }] },
                  { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'bold' }], text: 'Professional Services' }, { type: 'text', text: ' — Showcase team expertise to inbound A2A queries' }] }] },
                  { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'bold' }], text: 'Job Boards' }, { type: 'text', text: ' — Let recruitment agents query positions and profiles' }] }] },
                  { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'bold' }], text: 'Marketplaces' }, { type: 'text', text: ' — Surface the right service providers autonomously' }] }] },
                ]},
              ],
            },
            layout: '50-50',
          },
        },
        // RESUME DEMO
        {
          id: 'resume-demo',
          type: 'team',
          data: {
            title: 'Example: FlowPilot Resume Block Response',
            subtitle: '"Find me senior React consultants available for a 3-month project." — FlowPilot sourced, scored, and rendered these profiles autonomously from the CRM.',
            members: [
              { id: 'res-1', name: 'Elena Vasquez', role: 'Senior React Developer', image: '/templates/team/elena-vasquez.jpg', bio: '8 years React & TypeScript. Available from July. Match score: 97%.', linkedin: 'https://linkedin.com' },
              { id: 'res-2', name: 'Jonas Berg', role: 'Full-Stack Engineer', image: '/templates/team/jonas-berg.jpg', bio: '6 years React, Node.js, AWS. Available now. Match score: 94%.', linkedin: 'https://linkedin.com' },
              { id: 'res-3', name: 'Priya Nair', role: 'Frontend Architect', image: '/templates/team/priya-nair.jpg', bio: '10 years frontend, design systems, React Native. Part-time available. Match score: 91%.', linkedin: 'https://linkedin.com' },
            ],
            columns: 3,
            layout: 'grid',
            showBio: true,
            showSocial: true,
          },
        },
        // CTA
        {
          id: 'cta-flowpilot',
          type: 'cta',
          data: {
            title: 'Your Site. Your Agent. Your Web.',
            subtitle: 'FlowPilot turns your digital presence into an active participant in the agentic web. Not visited — consulted.',
            buttonText: 'Self-Host Free',
            buttonUrl: 'https://github.com/magnusfroste/flowwink',
            secondaryButtonText: 'See Pricing',
            secondaryButtonUrl: '/#pricing-detailed',
            gradient: true,
          },
        },
      ],
    },

    // ═══════════════════════════════════════════════════════════
    // FOR CONSULTANCIES — Vertical Elevator Pitch
    // ═══════════════════════════════════════════════════════════
    {
      title: 'For Consultancies',
      slug: 'for-consultancies',
      menu_order: 3,
      showInMenu: true,
      meta: {
        description: 'FlowWink for consulting firms — AI-powered consultant matching, live availability, and autonomous lead qualification.',
        showTitle: false,
        titleAlignment: 'center',
      },
      blocks: [
        // COMPACT HERO
        {
          id: 'hero-consult',
          type: 'hero',
          data: {
            title: 'The Consulting Firm That Never Sleeps',
            subtitle: 'FlowPilot knows every consultant profile, every assignment, every availability — updated in real time. Clients get answers instantly. You close deals faster.',
            backgroundType: 'image',
            backgroundImage: 'https://images.pexels.com/photos/3184291/pexels-photo-3184291.jpeg?auto=compress&w=1920',
            heightMode: '60vh',
            contentAlignment: 'center',
            overlayOpacity: 60,
            titleAnimation: 'slide-up',
            primaryButton: { text: 'Try the Matcher', url: '#consult-resume-matcher' },
            secondaryButton: { text: 'See Pricing', url: '/#pricing-detailed' },
            eyebrow: 'FlowWink for Consultancies',
          },
        },
        // CHAT LAUNCHER — vertical-specific
        {
          id: 'consult-chat',
          type: 'chat-launcher',
          data: {
            title: 'Ask FlowPilot About Consultants',
            subtitle: 'FlowPilot has live access to every consultant profile, their latest assignments, and real-time availability. Ask what you\'d ask a senior recruiter.',
            placeholder: 'Do you have senior React developers available this month with fintech experience?',
            showQuickActions: true,
            quickActionCount: 4,
            variant: 'hero-integrated',
          },
        },
        // RESUME MATCHER — the star block from consult-agency
        {
          id: 'consult-resume-matcher',
          type: 'resume-matcher',
          data: {
            title: 'Find the Right Consultant — Right Now',
            subtitle: 'Describe the role, tech stack, and context. FlowPilot searches the live roster — profiles updated as consultants check in — and returns the best matches with availability, scoring, and gap analysis.',
            placeholder: 'E.g. "We need a senior backend developer with Java and Spring Boot experience for a 6-month fintech project in Stockholm..."',
            buttonText: 'Find My Match',
          },
        },
        // STATS — consulting-specific
        {
          id: 'consult-stats',
          type: 'stats',
          data: {
            items: [
              { id: 'cs1', value: '300+', label: 'Senior Consultants', icon: 'Users' },
              { id: 'cs2', value: '48h', label: 'Average Match Time', icon: 'Clock' },
              { id: 'cs3', value: '95%', label: 'Client Retention', icon: 'TrendingUp' },
              { id: 'cs4', value: '1,200+', label: 'Successful Placements', icon: 'CheckCircle' },
            ],
            columns: 4,
            variant: 'cards',
          },
        },
        // TESTIMONIALS — consulting-specific
        {
          id: 'consult-testimonials',
          type: 'testimonials',
          data: {
            title: 'What Clients Say',
            subtitle: '95% of clients return for their next assignment. Here\'s why.',
            testimonials: [
              {
                id: 'ct1',
                content: 'We needed a senior cloud architect for a critical AWS migration. Within 36 hours we had a candidate on a call. He started Monday. The migration finished 3 weeks ahead of schedule.',
                author: 'Johan Eriksson',
                role: 'CTO',
                company: 'Volvo Group Digital',
                rating: 5,
              },
              {
                id: 'ct2',
                content: 'I asked their website "do you have React architects with healthcare experience available in Q3?" Within seconds I had three live profiles with current availability. No form, no callback, no waiting.',
                author: 'Dr. Anders Nilsson',
                role: 'Digital Director',
                company: 'Karolinska Digital',
                rating: 5,
              },
              {
                id: 'ct3',
                content: 'Three consultants in two years. Every single one has been exactly who they said they would be. No CV inflation, no surprises. The 48-hour promise is real.',
                author: 'Maria Lindqvist',
                role: 'Head of Engineering',
                company: 'Ericsson Software Technology',
                rating: 5,
              },
            ],
            layout: 'carousel',
            columns: 3,
            showRating: true,
            showAvatar: false,
            variant: 'cards',
            autoplay: true,
            autoplaySpeed: 6,
          },
        },
        // TABS — expertise areas
        {
          id: 'consult-tabs',
          type: 'tabs',
          data: {
            title: 'Expertise Areas',
            orientation: 'horizontal',
            variant: 'pills',
            tabs: [
              {
                id: 'tab-cloud',
                title: 'Cloud & DevOps',
                icon: 'Cloud',
                content: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'AWS, Azure, GCP — our cloud architects design resilient multi-cloud strategies. From Kubernetes orchestration to Terraform IaC, we staff the engineers who keep your infrastructure scalable and secure.' }] }] },
              },
              {
                id: 'tab-frontend',
                title: 'Frontend & Design',
                icon: 'Layout',
                content: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'React, Vue, Angular, Design Systems — our frontend specialists build accessible, performant user experiences. From component libraries to full redesigns, we match the right talent to your tech stack.' }] }] },
              },
              {
                id: 'tab-data',
                title: 'Data & AI',
                icon: 'Brain',
                content: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Machine learning engineers, data architects, and analytics specialists. From data pipelines to production ML models, our consultants turn raw data into business intelligence.' }] }] },
              },
              {
                id: 'tab-security',
                title: 'Security & Compliance',
                icon: 'Shield',
                content: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Penetration testers, security architects, and compliance experts. SOC 2, ISO 27001, GDPR — our specialists ensure your systems meet the highest security standards.' }] }] },
              },
            ],
          },
        },
        // CTA
        {
          id: 'cta-consult',
          type: 'cta',
          data: {
            title: 'Ready to Modernize Your Staffing?',
            subtitle: 'Self-host for free or start a managed trial. FlowPilot qualifies leads and matches consultants 24/7.',
            buttonText: 'See Pricing',
            buttonUrl: '/#pricing-detailed',
            secondaryButtonText: 'Self-Host Free',
            secondaryButtonUrl: 'https://github.com/magnusfroste/flowwink',
            gradient: true,
          },
        },
      ],
    },

    // ═══════════════════════════════════════════════════════════
    // FOR E-COMMERCE — Vertical Elevator Pitch
    // ═══════════════════════════════════════════════════════════
    {
      title: 'For E-Commerce',
      slug: 'for-ecommerce',
      menu_order: 4,
      showInMenu: true,
      meta: {
        description: 'FlowWink for e-commerce — AI shopping assistant, product catalog, Stripe checkout, and autonomous campaigns.',
        showTitle: false,
        titleAlignment: 'center',
      },
      blocks: [
        // COMPACT HERO
        {
          id: 'hero-ecom',
          type: 'hero',
          data: {
            title: 'Your Store With a Brain',
            subtitle: 'FlowPilot knows every product, recommends the right fit, handles checkout, and runs campaigns — all autonomously. Conversational commerce, not just a catalog.',
            backgroundType: 'image',
            backgroundImage: 'https://images.pexels.com/photos/5632399/pexels-photo-5632399.jpeg?auto=compress&w=1920',
            heightMode: '60vh',
            contentAlignment: 'center',
            overlayOpacity: 50,
            titleAnimation: 'slide-up',
            primaryButton: { text: 'Browse Products', url: '#ecom-products' },
            secondaryButton: { text: 'See Pricing', url: '/#pricing-detailed' },
            eyebrow: 'FlowWink for E-Commerce',
          },
        },
        // CHAT LAUNCHER — shopping assistant
        {
          id: 'ecom-chat',
          type: 'chat-launcher',
          data: {
            title: 'What Are You Looking For?',
            subtitle: 'Our AI knows every product — describe what you need and get personalized recommendations instantly.',
            placeholder: 'I need a pitch deck template for my SaaS startup...',
            showQuickActions: true,
            quickActionCount: 4,
            variant: 'hero-integrated',
          },
        },
        // PRODUCTS GRID — from digital-shop
        {
          id: 'ecom-products',
          type: 'products',
          data: {
            title: 'Shop Bestsellers',
            subtitle: 'Our most loved products — trusted by thousands of creators',
            productType: 'all',
            columns: 3,
            showFilters: false,
            showSearch: false,
            variant: 'cards',
          },
        },
        // BENTO — category showcase from digital-shop
        {
          id: 'ecom-bento',
          type: 'bento-grid',
          data: {
            title: 'Shop by Category',
            subtitle: 'Find exactly what you need',
            items: [
              {
                id: 'eb-templates',
                title: 'Templates',
                description: 'Professional pitch decks, brand kits, and social media packs. Download once, use forever.',
                image: 'https://images.pexels.com/photos/196644/pexels-photo-196644.jpeg?auto=compress&w=800',
                colSpan: 2,
                rowSpan: 2,
                ctaText: 'Browse Templates',
                ctaUrl: '#ecom-products',
              },
              {
                id: 'eb-courses',
                title: 'Online Courses',
                description: '40+ expert-led lessons. Learn at your pace, apply immediately.',
                image: '/templates/blog/team-brainstorming.jpg',
                colSpan: 1,
                rowSpan: 1,
                ctaText: 'Start Learning',
                ctaUrl: '#ecom-products',
              },
              {
                id: 'eb-tools',
                title: 'Design Systems',
                description: 'Production-ready UI kits and component libraries. Ship faster, stay consistent.',
                image: '/templates/misc/design-systems.jpg',
                colSpan: 1,
                rowSpan: 1,
                ctaText: 'Explore Tools',
                ctaUrl: '#ecom-products',
              },
            ],
            columns: 3,
            gap: 'md',
            variant: 'glass',
          },
        },
        // SOCIAL PROOF
        {
          id: 'ecom-social',
          type: 'social-proof',
          data: {
            title: 'Trusted by Creators',
            items: [
              { id: 'esp1', type: 'counter', label: 'Happy Customers', value: '10,000', icon: 'users' },
              { id: 'esp2', type: 'rating', label: 'Average Rating', value: '4.9', rating: 4.9, maxRating: 5 },
              { id: 'esp3', type: 'counter', label: 'Products Sold', value: '25,000', icon: 'package' },
            ],
            variant: 'cards',
            layout: 'horizontal',
            size: 'lg',
            animated: true,
          },
        },
        // MARQUEE — trusted by brands
        {
          id: 'ecom-marquee',
          type: 'marquee',
          data: {
            title: 'Trusted by Creators & Brands',
            items: [
              { id: 'em1', text: 'Shopify Migrants' },
              { id: 'em2', text: 'Indie Creators' },
              { id: 'em3', text: 'SaaS Companies' },
              { id: 'em4', text: 'Design Studios' },
              { id: 'em5', text: 'Digital Agencies' },
              { id: 'em6', text: 'Course Creators' },
            ],
            speed: 'normal',
            pauseOnHover: true,
            direction: 'left',
            variant: 'default',
          },
        },
        // CTA
        {
          id: 'cta-ecom',
          type: 'cta',
          data: {
            title: 'Launch Your AI-Powered Store',
            subtitle: 'Stripe checkout, product management, and autonomous campaigns — out of the box.',
            buttonText: 'See Pricing',
            buttonUrl: '/#pricing-detailed',
            secondaryButtonText: 'Self-Host Free',
            secondaryButtonUrl: 'https://github.com/magnusfroste/flowwink',
            gradient: true,
          },
        },
      ],
    },

    // ═══════════════════════════════════════════════════════════
    // FOR SERVICES — Vertical Elevator Pitch
    // ═══════════════════════════════════════════════════════════
    {
      title: 'For Service Business',
      slug: 'for-services',
      menu_order: 5,
      showInMenu: true,
      meta: {
        description: 'FlowWink for service businesses — online booking, real-time availability, and autonomous client management.',
        showTitle: false,
        titleAlignment: 'center',
      },
      blocks: [
        // COMPACT HERO
        {
          id: 'hero-services',
          type: 'hero',
          data: {
            title: 'Expert Service, Seamless Booking',
            subtitle: 'Skip the phone tag. Clients book online in under 60 seconds, FlowPilot confirms, reminds, and follows up — all autonomously.',
            backgroundType: 'video',
            videoUrl: 'https://videos.pexels.com/video-files/3209828/3209828-uhd_2560_1440_25fps.mp4',
            videoAutoplay: true,
            videoLoop: true,
            videoMuted: true,
            backgroundImage: 'https://images.pexels.com/photos/3184465/pexels-photo-3184465.jpeg?auto=compress&w=1920',
            heightMode: '60vh',
            contentAlignment: 'center',
            overlayOpacity: 60,
            titleAnimation: 'fade-in',
            primaryButton: { text: 'Book Appointment', url: '#services-booking' },
            secondaryButton: { text: 'See Pricing', url: '/#pricing-detailed' },
            eyebrow: 'FlowWink for Service Business',
          },
        },
        // CHAT LAUNCHER — service-specific
        {
          id: 'services-chat',
          type: 'chat-launcher',
          data: {
            title: 'Questions? Ask FlowPilot',
            subtitle: 'FlowPilot knows every service, every availability slot, and every FAQ. Get instant answers — no waiting.',
            placeholder: 'What services do you offer? Can I book for this Saturday?',
            showQuickActions: true,
            quickActionCount: 4,
            variant: 'hero-integrated',
          },
        },
        // TWO-COLUMN — conversational service narrative
        {
          id: 'services-two-col',
          type: 'two-column',
          data: {
            title: 'The Future of Service Business Is Conversational',
            content: {
              type: 'doc',
              content: [
                { type: 'paragraph', content: [{ type: 'text', text: 'Your clients don\'t want to navigate menus or fill out forms. They want to say what they need and get it done — instantly.' }] },
                { type: 'paragraph', content: [{ type: 'text', text: 'FlowPilot turns your website into a conversational operator. It knows your services, real-time availability, pricing, and policies. It books appointments, answers questions, and follows up — autonomously, 24/7.' }] },
                { type: 'paragraph', content: [{ type: 'text', text: 'No chatbot scripts. No decision trees. Just an AI that understands your business as well as your best receptionist — and never takes a day off.' }] },
              ],
            },
            imageUrl: 'https://images.pexels.com/photos/3184465/pexels-photo-3184465.jpeg?auto=compress&w=800',
            imageAlt: 'Professional service team collaborating',
            imagePosition: 'right',
            imageObjectFit: 'cover',
            imageRounded: 'xl',
            primaryButton: { text: 'Try It Now', url: '#services-chat' },
            verticalAlignment: 'center',
          },
        },
        // FEATURED CAROUSEL — from service-pro
        {
          id: 'services-carousel',
          type: 'featured-carousel',
          data: {
            slides: [
              {
                id: 'sc-consult',
                title: 'Expert Consultation',
                description: 'Get personalized advice from our team of experienced professionals.',
                image: 'https://images.pexels.com/photos/3184292/pexels-photo-3184292.jpeg?auto=compress&w=1200',
                ctaText: 'Book Now',
                ctaUrl: '#services-booking',
                textAlignment: 'left',
              },
              {
                id: 'sc-service',
                title: 'Premium Services',
                description: 'Quality craftsmanship delivered on time, every time.',
                image: 'https://images.pexels.com/photos/3184339/pexels-photo-3184339.jpeg?auto=compress&w=1200',
                ctaText: 'View Services',
                ctaUrl: '#services-features',
                textAlignment: 'left',
              },
              {
                id: 'sc-team',
                title: 'Dedicated Team',
                description: 'Skilled professionals committed to exceeding your expectations.',
                image: 'https://images.pexels.com/photos/3182812/pexels-photo-3182812.jpeg?auto=compress&w=1200',
                ctaText: 'Meet the Team',
                ctaUrl: '#services-features',
                textAlignment: 'left',
              },
            ],
            autoPlay: true,
            interval: 5000,
            height: 'md',
            transition: 'fade',
          },
        },
        // BENTO — service benefits from service-pro
        {
          id: 'services-bento',
          type: 'bento-grid',
          data: {
            title: 'Why Clients Keep Coming Back',
            subtitle: 'Every detail is designed around your experience — from first booking to final follow-up.',
            variant: 'bordered',
            items: [
              { id: 'sb1', icon: 'CalendarCheck', title: 'Instant Online Booking', description: 'Reserve any service 24/7 from your phone or desktop. Real-time availability, zero waiting on hold.', span: 'wide' },
              { id: 'sb2', icon: 'Shield', title: '100% Satisfaction Guarantee', description: 'If you\'re not delighted with the result, we\'ll make it right — no questions asked.' },
              { id: 'sb3', icon: 'Clock', title: 'Same-Day Appointments', description: 'Urgent need? We keep slots open daily for last-minute bookings so you\'re never left waiting.' },
              { id: 'sb4', icon: 'Star', title: '4.9-Star Rated Service', description: 'Consistently top-rated across Google, Yelp, and Trustpilot by thousands of verified clients.', span: 'wide' },
            ],
          },
        },
        // BOOKING WIDGET
        {
          id: 'services-booking',
          type: 'booking',
          data: {
            title: 'Book Your Appointment',
            subtitle: 'Choose a service and time that works for you. Instant confirmation.',
          },
        },
        // PROGRESS — service quality KPIs
        {
          id: 'services-progress',
          type: 'progress',
          data: {
            title: 'Our Track Record',
            subtitle: 'Numbers that speak for themselves.',
            items: [
              { id: 'sp1', label: 'Client Satisfaction', value: 98, color: 'hsl(142 71% 45%)' },
              { id: 'sp2', label: 'On-Time Delivery', value: 96, color: 'hsl(217 91% 60%)' },
              { id: 'sp3', label: 'Repeat Clients', value: 89, color: 'hsl(280 65% 60%)' },
              { id: 'sp4', label: 'Same-Day Availability', value: 75, color: 'hsl(35 92% 55%)' },
            ],
            showPercentage: true,
            animated: true,
            variant: 'default',
          },
        },
        // CTA
        {
          id: 'cta-services',
          type: 'cta',
          data: {
            title: 'Automate Your Service Business',
            subtitle: 'Online booking, autonomous follow-ups, and smart scheduling — all powered by FlowPilot.',
            buttonText: 'See Pricing',
            buttonUrl: '/#pricing-detailed',
            secondaryButtonText: 'Self-Host Free',
            secondaryButtonUrl: 'https://github.com/magnusfroste/flowwink',
            gradient: true,
          },
        },
      ],
    },

    // ═══════════════════════════════════════════════════════════
    // FOR HEALTHCARE — Vertical Elevator Pitch
    // ═══════════════════════════════════════════════════════════
    {
      title: 'For Healthcare',
      slug: 'for-healthcare',
      menu_order: 6,
      showInMenu: true,
      meta: {
        description: 'FlowWink for healthcare — HIPAA-compliant private AI, patient booking, and compliance-first design.',
        showTitle: false,
        titleAlignment: 'center',
      },
      blocks: [
        // COMPACT HERO
        {
          id: 'hero-health',
          type: 'hero',
          data: {
            title: 'Your Health, Your Privacy',
            subtitle: 'Trusted care with complete data security. FlowPilot runs on your servers with your private LLM — patient data never leaves your infrastructure.',
            backgroundType: 'video',
            videoUrl: 'https://videos.pexels.com/video-files/3195394/3195394-uhd_2560_1440_25fps.mp4',
            videoType: 'direct',
            videoPosterUrl: 'https://images.pexels.com/photos/247786/pexels-photo-247786.jpeg?auto=compress&w=1920',
            videoLoop: true,
            videoMuted: true,
            heightMode: '60vh',
            contentAlignment: 'center',
            overlayOpacity: 60,
            titleAnimation: 'slide-up',
            primaryButton: { text: 'Book Appointment', url: '#health-booking' },
            secondaryButton: { text: 'See Pricing', url: '/#pricing-detailed' },
            eyebrow: 'FlowWink for Healthcare',
          },
        },
        // CHAT LAUNCHER — healthcare-specific with privacy messaging
        {
          id: 'health-chat',
          type: 'chat-launcher',
          data: {
            title: 'Questions? Ask Our Private AI',
            subtitle: 'HIPAA-compliant — your data never leaves our servers. Powered by a private LLM on our own infrastructure.',
            placeholder: 'Ask about services, booking, or patient resources...',
            showQuickActions: true,
            quickActionCount: 4,
            variant: 'hero-integrated',
          },
        },
        // BADGE — compliance certifications from securehealth
        {
          id: 'health-badges',
          type: 'badge',
          data: {
            title: 'Trusted & Certified',
            subtitle: 'Your data security is our first priority.',
            badges: [
              { id: 'hb1', title: 'HIPAA Compliant', icon: 'shield' },
              { id: 'hb2', title: 'SOC 2 Type II', icon: 'check' },
              { id: 'hb3', title: 'JCI Accredited', icon: 'award' },
              { id: 'hb4', title: 'ISO 27001', icon: 'medal' },
            ],
            variant: 'minimal',
            columns: 4,
            size: 'md',
            showTitles: true,
            grayscale: false,
          },
        },
        // BOOKING
        {
          id: 'health-booking',
          type: 'booking',
          data: {
            title: 'Book Your Appointment',
            subtitle: 'Same-day appointments available. Choose your service and preferred time.',
          },
        },
        // ACCORDION FAQ — patient-focused from securehealth
        {
          id: 'health-faq',
          type: 'accordion',
          data: {
            title: 'Patient FAQ',
            items: [
              { question: 'Is the AI assistant private?', answer: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Yes! Unlike cloud-based AI services, our Private AI runs entirely on our own HIPAA-compliant servers. Your conversations and health questions never leave our secure infrastructure.' }] }] } },
              { question: 'How do I book an appointment?', answer: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'You can book appointments online 24/7 using our booking system. Simply select your service, choose an available time, and confirm. You\'ll receive an email confirmation immediately.' }] }] } },
              { question: 'What insurance do you accept?', answer: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'We accept most major insurance plans including Medicare, Blue Cross Blue Shield, Aetna, Cigna, and United Healthcare. Contact us to verify your specific coverage before your visit.' }] }] } },
              { question: 'How do I access my medical records?', answer: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'You can access your medical records through our secure patient portal. We use two-factor authentication and encrypted connections to protect your privacy.' }] }] } },
            ],
          },
        },
        // TABS — healthcare services
        {
          id: 'health-tabs',
          type: 'tabs',
          data: {
            title: 'Our Services',
            orientation: 'horizontal',
            variant: 'pills',
            tabs: [
              {
                id: 'tab-primary',
                title: 'Primary Care',
                icon: 'Heart',
                content: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Comprehensive primary care including annual physicals, chronic disease management, preventive screenings, and wellness consultations. Your first point of contact for all health concerns.' }] }] },
              },
              {
                id: 'tab-specialists',
                title: 'Specialists',
                icon: 'Stethoscope',
                content: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Board-certified specialists in cardiology, dermatology, orthopedics, and neurology. Referrals coordinated seamlessly through our integrated system — no paperwork, no delays.' }] }] },
              },
              {
                id: 'tab-telehealth',
                title: 'Telehealth',
                icon: 'Video',
                content: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Secure video consultations from the comfort of your home. HIPAA-compliant, end-to-end encrypted, and available same-day for urgent non-emergency concerns.' }] }] },
              },
            ],
          },
        },
        // CTA
        {
          id: 'cta-health',
          type: 'cta',
          data: {
            title: 'Private AI for Healthcare',
            subtitle: 'HIPAA-compliant, self-hosted, with full audit trails. The only CMS built for healthcare compliance.',
            buttonText: 'See Pricing',
            buttonUrl: '/#pricing-detailed',
            secondaryButtonText: 'Self-Host Free',
            secondaryButtonUrl: 'https://github.com/magnusfroste/flowwink',
            gradient: true,
          },
        },
      ],
    },
  ],

  // ═══════════════════════════════════════════════════════════
  // TEMPLATE DATA
  // ═══════════════════════════════════════════════════════════
  products: [
    {
      name: 'FlowWink Managed Cloud – Monthly',
      description: 'Fully managed FlowWink instance with FlowPilot agent, automatic updates, daily backups, SSL, CDN, and priority support.',
      price_cents: 4900,
      currency: 'EUR',
      type: 'recurring',
      image_url: 'https://images.pexels.com/photos/325229/pexels-photo-325229.jpeg?auto=compress&w=600',
      is_active: true,
    },
    {
      name: 'FlowWink Enterprise – Annual',
      description: 'Dedicated infrastructure, custom skills, SSO, compliance support, and a dedicated success manager.',
      price_cents: 99000,
      currency: 'EUR',
      type: 'recurring',
      image_url: 'https://images.pexels.com/photos/7567443/pexels-photo-7567443.jpeg?auto=compress&w=600',
      is_active: true,
    },
    {
      name: 'FlowPilot Custom Skill Pack',
      description: 'We build 5 custom FlowPilot skills tailored to your specific business workflow.',
      price_cents: 149900,
      currency: 'EUR',
      type: 'one_time',
      image_url: 'https://images.pexels.com/photos/8386440/pexels-photo-8386440.jpeg?auto=compress&w=600',
      is_active: true,
    },
    {
      name: 'FlowWink Migration Service',
      description: 'White-glove migration from WordPress, Webflow, or any CMS to FlowWink.',
      price_cents: 49900,
      currency: 'EUR',
      type: 'one_time',
      image_url: 'https://images.pexels.com/photos/1181467/pexels-photo-1181467.jpeg?auto=compress&w=600',
      is_active: true,
    },
  ],
  consultants: [
    {
      name: 'Elena Vasquez',
      title: 'Senior React Developer',
      skills: ['React', 'TypeScript', 'Node.js', 'GraphQL', 'AWS'],
      experience_years: 8,
      hourly_rate_cents: 15000,
      currency: 'EUR',
      availability: 'available',
      summary: 'Full-stack specialist with focus on React ecosystems and cloud architecture.',
      bio: 'Elena is a senior React developer with 8 years of experience building complex web applications. She specializes in TypeScript, GraphQL, and serverless architectures on AWS.',
      is_active: true,
    },
    {
      name: 'Jonas Berg',
      title: 'Cloud Architect',
      skills: ['AWS', 'Azure', 'Kubernetes', 'Terraform', 'Docker'],
      experience_years: 12,
      hourly_rate_cents: 18000,
      currency: 'EUR',
      availability: 'available',
      summary: 'Enterprise cloud architect specializing in multi-cloud strategies and infrastructure automation.',
      bio: 'Jonas has 12 years of experience designing and implementing cloud infrastructure for enterprise clients. He holds AWS Solutions Architect Professional and Azure Expert certifications.',
      is_active: true,
    },
    {
      name: 'Priya Nair',
      title: 'Frontend Architect',
      skills: ['React', 'Vue.js', 'Design Systems', 'Accessibility', 'Performance'],
      experience_years: 10,
      hourly_rate_cents: 16000,
      currency: 'EUR',
      availability: 'partially_available',
      summary: 'Frontend architecture expert with deep focus on design systems and web performance.',
      bio: 'Priya is a frontend architect with 10 years of experience building scalable design systems and optimizing web performance. She has led frontend teams at two unicorn startups.',
      is_active: true,
    },
    {
      name: 'Marcus Anderson',
      title: 'DevOps Engineer',
      skills: ['CI/CD', 'Docker', 'Kubernetes', 'GitHub Actions', 'Monitoring'],
      experience_years: 7,
      hourly_rate_cents: 14000,
      currency: 'EUR',
      availability: 'available',
      summary: 'DevOps specialist focused on CI/CD pipelines, container orchestration, and observability.',
      bio: 'Marcus builds and maintains CI/CD pipelines, container orchestration, and monitoring systems. He has automated deployment processes for teams of 5 to 500 engineers.',
      is_active: true,
    },
    {
      name: 'Sofia Bergqvist',
      title: 'AI/ML Engineer',
      skills: ['Python', 'PyTorch', 'LLMs', 'RAG', 'MLOps'],
      experience_years: 6,
      hourly_rate_cents: 17000,
      currency: 'EUR',
      availability: 'available',
      summary: 'AI/ML engineer specializing in LLM integration, RAG architectures, and production ML systems.',
      bio: 'Sofia designs and deploys production ML systems with focus on LLM integration and retrieval-augmented generation. She has built AI features used by millions of users.',
      is_active: true,
    },
  ],
  bookingServices: [
    {
      name: 'Product Demo',
      description: 'See FlowWink and FlowPilot in action. 30-minute live walkthrough of autonomous operations.',
      duration_minutes: 30,
      price_cents: 0,
      currency: 'EUR',
      is_active: true,
    },
    {
      name: 'Implementation Workshop',
      description: 'Hands-on workshop to set up FlowWink for your specific use case. Includes FlowPilot soul configuration.',
      duration_minutes: 120,
      price_cents: 29900,
      currency: 'EUR',
      is_active: true,
    },
    {
      name: 'Strategy Call',
      description: 'Deep-dive into your digital strategy. We help you define FlowPilot objectives and autonomous workflows.',
      duration_minutes: 60,
      price_cents: 14900,
      currency: 'EUR',
      is_active: true,
    },
  ],

  branding: {
    logo: '',
    organizationName: 'FlowWink',
    brandTagline: 'Set objectives. FlowPilot operates.',
    primaryColor: '238 84% 67%',
    secondaryColor: '240 10% 8%',
    accentColor: '174 84% 45%',
    headingFont: 'Plus Jakarta Sans',
    bodyFont: 'Inter',
    borderRadius: 'md',
    shadowIntensity: 'medium',
    allowThemeToggle: true,
    defaultTheme: 'dark',
  },

  chatSettings: {
    enabled: true,
    landingPageEnabled: true,
    widgetEnabled: true,
    widgetPosition: 'bottom-right',
    welcomeMessage: 'Hi! I\'m FlowPilot — the autonomous agent running this site. I\'ve read every page, blog post, and KB article. Ask me anything about FlowWink, pricing, or how autonomous operations work.',
    suggestedPrompts: [
      'What is FlowPilot?',
      'How does autonomous content work?',
      'Can I self-host for free?',
      'What AI models are supported?',
    ],
    includeContentAsContext: true,
    includedPageSlugs: ['*'],
    includeKbArticles: true,
    contentContextMaxTokens: 50000,
    showContextIndicator: true,
    toolCallingEnabled: true,
    allowGeneralKnowledge: true,
  },

  headerSettings: {
    variant: 'clean',
    stickyHeader: true,
    backgroundStyle: 'blur',
    headerShadow: 'sm',
    showBorder: false,
    headerHeight: 'tall',
    linkColorScheme: 'default',
  },

  footerSettings: {
    variant: 'full',
    email: 'hello@flowwink.com',
    showBrand: true,
    showQuickLinks: true,
    showContact: true,
    legalLinks: [
      { id: 'privacy', label: 'Privacy Policy', url: '/privacy-policy', enabled: true },
      { id: 'terms', label: 'Terms', url: '/terms-of-service', enabled: true },
    ],
  },

  seoSettings: {
    siteTitle: 'FlowWink',
    titleTemplate: '%s | FlowWink',
    defaultDescription: 'The first autonomous agentic CMS. FlowPilot writes your content, qualifies your leads, runs your campaigns, and learns from every interaction.',
    robotsIndex: true,
    robotsFollow: true,
    developmentMode: false,
  },

  aeoSettings: {
    enabled: true,
    organizationName: 'FlowWink',
    shortDescription: 'Open-source autonomous agentic CMS powered by FlowPilot — an AI agent with persistent memory, 30+ skills, and self-evolution.',
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
