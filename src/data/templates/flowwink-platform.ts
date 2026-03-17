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
 *   Home       → Pitch (convince)
 *   Demo       → Try everything (interact with live modules)
 *   Features   → Deep dive (inform, compare)
 *   FlowPilot  → The agent (differentiate, A2A)
 *   Blocks     → Block catalog (showcase all block types)
 *   Pricing    → Convert (plans, FAQ, CTA)
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
  requiredModules: ['blog', 'knowledgeBase', 'chat', 'liveSupport', 'newsletter', 'leads', 'deals', 'companies', 'forms', 'ecommerce', 'bookings', 'analytics', 'contentApi', 'webinars'],
  pages: [
    // ═══════════════════════════════════════════════════════════
    // HOME — The Pitch (convince visitors in one scroll)
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
            linkText: 'See how it works',
            linkUrl: '/features',
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
              { id: 's2', value: '30+', label: 'Agent Skills' },
              { id: 's3', value: '21', label: 'Modules' },
              { id: 's4', value: '100%', label: 'Self-Hostable' },
            ],
            columns: 4,
            variant: 'minimal',
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
        // BENTO GRID — The Agent Brain
        {
          id: 'bento-agent-brain',
          type: 'bento-grid',
          data: {
            title: 'Built for the Agentic Web',
            subtitle: 'Your website stopped being a brochure. FlowPilot is the autonomous operator running your entire digital presence — 24/7, no prompts needed.',
            eyebrow: 'AGENTIC WEB',
            columns: 3,
            variant: 'glass',
            gap: 'md',
            staggeredReveal: true,
            items: [
              { id: 'bg-skills', title: 'Skill Engine', description: '30+ built-in skills across content, CRM, email, and analytics. FlowPilot doesn\'t just suggest — it executes. And it can forge new skills for itself.', icon: 'Zap', span: 'wide', accentColor: '#3B82F6' },
              { id: 'bg-memory', title: 'Persistent Memory', description: 'Not session context — deep organizational memory. FlowPilot knows your brand voice, remembers every lead, recalls past decisions. The longer it runs, the sharper it gets.', icon: 'Brain', span: 'large', accentColor: '#8B5CF6' },
              { id: 'bg-objectives', title: 'Objectives & Goals', description: 'Set the destination. FlowPilot maps the route, executes step by step, and reports back.', icon: 'Target', accentColor: '#10B981' },
              { id: 'bg-heartbeat', title: 'Autonomous Heartbeat', description: 'Every 12 hours, FlowPilot reviews performance, reflects on what to improve, and queues the next moves.', icon: 'Activity', accentColor: '#F59E0B' },
              { id: 'bg-automations', title: 'Signal Automations', description: 'New lead → qualified in seconds. Post published → distributed instantly. Form submitted → follow-up sent.', icon: 'GitBranch', accentColor: '#EC4899' },
              { id: 'bg-evolution', title: 'Self-Evolution', description: 'FlowPilot rewrites its own instructions, upgrades its skill behavior, and evolves based on what actually works.', icon: 'Sparkles', span: 'wide', accentColor: '#06B6D4' },
            ],
          },
        },
        // PARALLAX — The killer line
        {
          id: 'parallax-vision',
          type: 'parallax-section',
          data: {
            backgroundImage: 'https://images.unsplash.com/photo-1451187580459-43490279c0fa?w=1920',
            title: 'Not a Chatbot. An Operator.',
            subtitle: 'FlowPilot doesn\'t wait for instructions. It has objectives, memory, and skills. It operates your entire digital presence while you sleep.',
            height: 'md',
            textColor: 'light',
            overlayOpacity: 65,
            contentAlignment: 'center',
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
        // SOCIAL PROOF + BADGES — Trust section
        {
          id: 'social-proof-live',
          type: 'social-proof',
          data: {
            title: 'Autonomous Operations in Production',
            subtitle: 'Real numbers from teams letting FlowPilot run their digital presence.',
            items: [
              { id: 'sp1', type: 'counter', label: 'Sites Running', value: 1200, icon: 'globe' },
              { id: 'sp2', type: 'counter', label: 'Skills Executed', value: 48500, icon: 'zap' },
              { id: 'sp3', type: 'rating', label: 'Approval Rate', value: 4.9, maxRating: 5 },
              { id: 'sp4', type: 'counter', label: 'GitHub Stars', value: 1450, icon: 'star' },
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
        // CTA — Final
        {
          id: 'cta-final',
          type: 'cta',
          data: {
            title: 'Stop Managing. Start Directing.',
            subtitle: 'Set objectives. FlowPilot operates. You approve. It\'s that simple.',
            buttonText: 'Try It Live',
            buttonUrl: '/demo',
            secondaryButtonText: 'View Pricing',
            secondaryButtonUrl: '/pricing',
            gradient: true,
          },
        },
        // FLOATING CTA
        {
          id: 'floating-cta-demo',
          type: 'floating-cta',
          data: {
            title: 'See FlowPilot Operate',
            subtitle: 'Live autonomous demo',
            buttonText: 'Watch Demo',
            buttonUrl: '/demo',
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
    // DEMO — Try Everything (interactive playground)
    // ═══════════════════════════════════════════════════════════
    {
      title: 'Demo',
      slug: 'demo',
      menu_order: 2,
      showInMenu: true,
      meta: {
        description: 'Experience FlowWink live. See FlowPilot operate — booking, e-commerce, AI chat, and knowledge base in action.',
        showTitle: false,
        titleAlignment: 'center',
      },
      blocks: [
        {
          id: 'hero-demo',
          type: 'hero',
          data: {
            title: 'Experience FlowPilot Live',
            subtitle: 'Every module below is managed by FlowPilot. Book meetings, browse products, search the knowledge base, or talk to the agent directly.',
            backgroundType: 'color',
            heightMode: 'auto',
            contentAlignment: 'center',
            overlayOpacity: 0,
            primaryButton: { text: 'Self-Host Free', url: 'https://github.com/magnusfroste/flowwink' },
            secondaryButton: { text: 'Start Trial', url: '/contact' },
          },
        },
        // — WALKTHROUGH VIDEO —
        {
          id: 'demo-video',
          type: 'youtube',
          data: {
            url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
            title: 'See FlowPilot Operate in 3 Minutes',
            autoplay: false,
            loop: false,
            mute: false,
            controls: true,
          },
        },
        // — ADMIN SCREENSHOT GALLERY —
        {
          id: 'demo-gallery',
          type: 'gallery',
          data: {
            layout: 'grid',
            columns: 3,
            images: [
              {
                src: 'https://images.unsplash.com/photo-1551288049-bebda4e38f71?w=800&q=80',
                alt: 'FlowPilot Copilot — AI chat operating autonomously',
                caption: 'FlowPilot Copilot — real-time autonomous chat',
              },
              {
                src: 'https://images.unsplash.com/photo-1460925895917-afdab827c52f?w=800&q=80',
                alt: 'Lead Pipeline with AI enrichment and scoring',
                caption: 'Lead Pipeline — AI enrichment & scoring',
              },
              {
                src: 'https://images.unsplash.com/photo-1518186285589-2f7649de83e0?w=800&q=80',
                alt: 'Skill Hub with 15+ autonomous skills',
                caption: 'Skill Hub — 15+ autonomous skills',
              },
              {
                src: 'https://images.unsplash.com/photo-1504868584819-f8e8b4b6d7e3?w=800&q=80',
                alt: 'Objectives decomposition and progress tracking',
                caption: 'Objectives — goal decomposition & tracking',
              },
              {
                src: 'https://images.unsplash.com/photo-1551434678-e076c223a692?w=800&q=80',
                alt: 'Activity feed showing autonomous agent actions',
                caption: 'Activity Feed — full audit trail',
              },
              {
                src: 'https://images.unsplash.com/photo-1555949963-aa79dcee981c?w=800&q=80',
                alt: 'Content Authority with competitor monitoring',
                caption: 'Content Authority — AI-driven publishing',
              },
            ],
          },
        },
        // — PLATFORM STATS —
        {
          id: 'demo-stats',
          type: 'stats',
          data: {
            title: 'The Platform at a Glance',
            subtitle: 'Everything FlowPilot manages autonomously — zero manual steps.',
            columns: 4,
            stats: [
              { value: '21', label: 'Modules', description: 'Versioned & Zod-validated' },
              { value: '30+', label: 'Skills', description: 'Autonomous agent capabilities' },
              { value: '7-Step', label: 'Reasoning Loop', description: 'Self-Heal → Remember' },
              { value: '58+', label: 'Block Types', description: 'Visual content building' },
            ],
          },
        },
        // — TRY IT YOURSELF —
        {
          id: 'sep-try-it',
          type: 'separator',
          data: { variant: 'text', text: 'Try It Yourself', icon: 'Sparkles' },
        },
        // — SMART BOOKING —
        {
          id: 'sep-booking-demo',
          type: 'separator',
          data: { variant: 'text', text: 'Smart Booking System', icon: 'Calendar' },
        },
        {
          id: 'booking-demo-live',
          type: 'booking',
          data: {
            title: 'Book a Demo Call',
            description: 'Select a service and time that works for you. This is a live booking system – your appointment will be confirmed.',
            mode: 'smart',
            submitButtonText: 'Confirm Booking',
            successMessage: 'Your booking is confirmed! Check your email for details.',
            showPhoneField: true,
            variant: 'card',
          },
        },
        // — E-COMMERCE —
        {
          id: 'sep-products-demo',
          type: 'separator',
          data: { variant: 'text', text: 'E-commerce Module', icon: 'ShoppingCart' },
        },
        {
          id: 'products-demo-live',
          type: 'products',
          data: {
            title: 'Product Showcase',
            subtitle: 'Products are fetched from the database. Add to cart and checkout with Stripe integration.',
            columns: 3,
            productType: 'all',
            showDescription: true,
            buttonText: 'Add to Cart',
          },
        },
        {
          id: 'cart-demo',
          type: 'cart',
          data: {
            title: 'Your Shopping Cart',
            showImage: true,
            showQuantity: true,
            checkoutButtonText: 'Proceed to Checkout',
            emptyCartMessage: 'Your cart is empty. Add products above to see the cart in action.',
          },
        },
        // — FLOWPILOT AGENT —
        {
          id: 'sep-ai-demo',
          type: 'separator',
          data: { variant: 'text', text: 'FlowPilot Agent', icon: 'Bot' },
        },
        {
          id: 'chat-launcher-demo',
          type: 'chat-launcher',
          data: {
            title: 'Talk to FlowPilot',
            subtitle: 'The autonomous agent reads all site content and has persistent memory. This is not a chatbot.',
            placeholder: 'Ask anything about FlowWink...',
            showQuickActions: true,
            quickActionCount: 4,
            variant: 'card',
          },
        },
        // — KNOWLEDGE BASE —
        {
          id: 'sep-kb-demo',
          type: 'separator',
          data: { variant: 'text', text: 'Knowledge Base', icon: 'BookOpen' },
        },
        {
          id: 'kb-search-demo',
          type: 'kb-search',
          data: {
            title: 'Search Help Center',
            subtitle: 'Full-text search across all knowledge base articles.',
            placeholder: 'Search for help articles...',
            showResults: true,
            maxResults: 5,
          },
        },
        // — WEBINARS —
        {
          id: 'sep-webinar-demo',
          type: 'separator',
          data: { variant: 'text', text: 'Webinars Module', icon: 'Video' },
        },
        {
          id: 'webinar-demo-live',
          type: 'webinar',
          data: {
            title: 'Upcoming Webinars',
            subtitle: 'Register for live sessions. FlowPilot handles registration, reminders, and follow-up automatically.',
          },
        },
        // — LEAD CAPTURE —
        {
          id: 'sep-forms-demo',
          type: 'separator',
          data: { variant: 'text', text: 'Lead Capture', icon: 'UserPlus' },
        },
        {
          id: 'newsletter-demo',
          type: 'newsletter',
          data: {
            title: 'Get Product Updates',
            description: 'Subscribe to our newsletter for tips, updates, and early access to new features.',
            buttonText: 'Subscribe',
            successMessage: 'Check your inbox to confirm your subscription!',
            variant: 'default',
            showNameField: true,
          },
        },
        {
          id: 'form-demo',
          type: 'form',
          data: {
            title: 'Contact Us',
            formName: 'Demo Contact Form',
            fields: [
              { id: 'field-name', type: 'text', label: 'Your Name', placeholder: 'Enter your name', required: true },
              { id: 'field-email', type: 'email', label: 'Email', placeholder: 'your@email.com', required: true },
              { id: 'field-message', type: 'textarea', label: 'Message', placeholder: 'How can we help?', required: true },
            ],
            submitButtonText: 'Send Message',
            successMessage: 'Thank you! We will respond within 24 hours.',
          },
        },
        // — AUTONOMOUS PIPELINE —
        {
          id: 'sep-loop',
          type: 'separator',
          data: { variant: 'text', text: 'The Autonomous Pipeline', icon: 'Bot' },
        },
        {
          id: 'info-flowpilot-loop',
          type: 'info-box',
          data: {
            variant: 'highlight',
            content: {
              type: 'doc',
              content: [
                { type: 'heading', attrs: { level: 3 }, content: [{ type: 'text', text: '🤖 FlowPilot\'s Autonomous Pipeline' }] },
                { type: 'paragraph', content: [{ type: 'text', text: 'Every interaction above triggers FlowPilot\'s autonomous lead pipeline:' }] },
                { type: 'orderedList', content: [
                  { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'bold' }], text: 'Captures the lead' }, { type: 'text', text: ' — from any touchpoint (chat, form, booking, newsletter)' }] }] },
                  { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'bold' }], text: 'Scores & matches company' }, { type: 'text', text: ' — auto-links via email domain, creates company record if new' }] }] },
                  { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'bold' }], text: 'AI enrichment' }, { type: 'text', text: ' — scrapes company website for industry, size, description' }] }] },
                  { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'bold' }], text: 'AI qualification' }, { type: 'text', text: ' — generates summary, potential value, and next steps' }] }] },
                  { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'bold' }], text: 'Logs to activity feed' }, { type: 'text', text: ' — full audit trail, every step visible in admin' }] }] },
                ] },
              ],
            },
          },
        },
        {
          id: 'cta-demo',
          type: 'cta',
          data: {
            title: 'Ready to Let FlowPilot Operate?',
            subtitle: 'Self-host for free or start a managed trial. Autonomous operations included.',
            buttonText: 'Self-Host Free',
            buttonUrl: 'https://github.com/magnusfroste/flowwink',
            secondaryButtonText: 'Start Trial',
            secondaryButtonUrl: '/contact',
            gradient: true,
          },
        },
      ],
    },

    // ═══════════════════════════════════════════════════════════
    // FEATURES — Deep Dive (inform, compare)
    // ═══════════════════════════════════════════════════════════
    {
      title: 'Features',
      slug: 'features',
      menu_order: 3,
      showInMenu: true,
      meta: {
        description: 'FlowPilot: 30+ autonomous skills, persistent memory, self-evolving architecture. The complete feature set for the first agentic CMS.',
        showTitle: false,
        titleAlignment: 'center',
      },
      blocks: [
        {
          id: 'hero-features',
          type: 'hero',
          data: {
            title: 'The Anatomy of an Autonomous Agent',
            subtitle: 'FlowPilot isn\'t one feature. It\'s an architecture. Skills, memory, objectives, automations, and self-evolution — working together to operate your digital presence.',
            backgroundType: 'color',
            heightMode: 'auto',
            contentAlignment: 'center',
            overlayOpacity: 0,
            primaryButton: { text: 'Try It Live', url: '/demo' },
            secondaryButton: { text: 'Self-Host', url: 'https://github.com/magnusfroste/flowwink' },
          },
        },
        // TABS — For Founders / Marketing / Compliance
        {
          id: 'tabs-audiences',
          type: 'tabs',
          data: {
            title: 'Built For Every Role',
            tabs: [
              {
                id: 'tab-founders',
                title: 'For Founders',
                icon: 'Rocket',
                content: {
                  type: 'doc',
                  content: [
                    { type: 'heading', attrs: { level: 3 }, content: [{ type: 'text', text: 'Set Objectives, FlowPilot Executes' }] },
                    { type: 'paragraph', content: [{ type: 'text', text: 'You\'re building a company, not managing a CMS. Define what you need and let FlowPilot handle the rest.' }] },
                    { type: 'bulletList', content: [
                      { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'bold' }], text: 'Content Pipeline' }, { type: 'text', text: ' — "Write 4 blog posts per month" → FlowPilot researches, drafts, and queues for your approval' }] }] },
                      { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'bold' }], text: 'Lead Qualification' }, { type: 'text', text: ' — Every inbound lead is scored, enriched, and qualified before it hits your inbox' }] }] },
                      { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'bold' }], text: 'Activity Feed' }, { type: 'text', text: ' — One dashboard showing everything FlowPilot did while you were building product' }] }] },
                      { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'bold' }], text: 'Self-Host Free' }, { type: 'text', text: ' — No vendor lock-in. Own your data, your agent, your infrastructure' }] }] },
                    ]},
                  ],
                },
              },
              {
                id: 'tab-marketing',
                title: 'For Marketing',
                icon: 'Megaphone',
                content: {
                  type: 'doc',
                  content: [
                    { type: 'heading', attrs: { level: 3 }, content: [{ type: 'text', text: 'Autonomous Campaigns & Content' }] },
                    { type: 'paragraph', content: [{ type: 'text', text: 'FlowPilot is the marketing team member that never sleeps, never forgets, and actually follows the brand guide.' }] },
                    { type: 'bulletList', content: [
                      { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'bold' }], text: 'AI Content Generation' }, { type: 'text', text: ' — Blog posts, newsletters, and landing pages in your brand voice' }] }] },
                      { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'bold' }], text: 'Email Campaigns' }, { type: 'text', text: ' — Segment audiences, write subject lines, send at optimal times' }] }] },
                      { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'bold' }], text: 'Lead Scoring & CRM' }, { type: 'text', text: ' — Every touchpoint tracked, scored, and enriched automatically' }] }] },
                      { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'bold' }], text: 'AEO Optimization' }, { type: 'text', text: ' — Content optimized for AI search engines, not just Google' }] }] },
                    ]},
                  ],
                },
              },
              {
                id: 'tab-compliance',
                title: 'For Compliance',
                icon: 'Shield',
                content: {
                  type: 'doc',
                  content: [
                    { type: 'heading', attrs: { level: 3 }, content: [{ type: 'text', text: 'Private AI, Full Audit Trail' }] },
                    { type: 'paragraph', content: [{ type: 'text', text: 'Autonomous doesn\'t mean uncontrolled. Every action logged. Every skill gated. Your data, your infrastructure.' }] },
                    { type: 'bulletList', content: [
                      { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'bold' }], text: 'Private LLM' }, { type: 'text', text: ' — Connect Ollama or any OpenAI-compatible model. Data never leaves your servers.' }] }] },
                      { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'bold' }], text: 'Full Audit Trail' }, { type: 'text', text: ' — Every agent action logged with inputs, outputs, timestamps, and user context' }] }] },
                      { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'bold' }], text: 'Approval Gating' }, { type: 'text', text: ' — Configure which skills require human approval before execution' }] }] },
                      { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'bold' }], text: 'GDPR Ready' }, { type: 'text', text: ' — Cookie consent, data export, right to deletion — built in, not bolted on' }] }] },
                    ]},
                  ],
                },
              },
            ],
            orientation: 'horizontal',
            variant: 'boxed',
          },
        },
        // WHAT FLOWPILOT MANAGES — 6 channels
        {
          id: 'features-channels',
          type: 'features',
          data: {
            title: 'What FlowPilot Manages',
            subtitle: 'Six channels. One autonomous operator. Zero manual work.',
            features: [
              { id: 'ch-content', icon: 'FileText', title: 'Content & Blog', description: 'Writes, edits, schedules, and publishes blog posts. Maintains brand voice. Optimizes for SEO and AEO.' },
              { id: 'ch-crm', icon: 'Users', title: 'Lead CRM', description: 'Captures leads from every touchpoint. Scores, qualifies, enriches with company data. Moves deals through the pipeline.' },
              { id: 'ch-email', icon: 'Mail', title: 'Email Campaigns', description: 'Creates newsletters, writes subject lines, segments audiences, sends at optimal times. Full GDPR compliance.' },
              { id: 'ch-booking', icon: 'Calendar', title: 'Bookings', description: 'Schedules meetings, sends confirmations and reminders, handles rescheduling. Connects calendar to CRM.' },
              { id: 'ch-ecommerce', icon: 'ShoppingCart', title: 'E-commerce', description: 'Manages products, processes orders, handles Stripe checkout. Tracks revenue and conversion.' },
              { id: 'ch-analytics', icon: 'Activity', title: 'Analytics & Reflection', description: 'Monitors traffic, analyzes trends, identifies opportunities. Generates reports and suggests improvements.' },
            ],
            columns: 3,
            layout: 'grid',
            variant: 'centered',
            iconStyle: 'circle',
          },
        },
        // THE AUTONOMOUS LOOP — Detailed (6 steps)
        {
          id: 'sep-autonomous-loop',
          type: 'separator',
          data: { variant: 'text', text: 'The Autonomous Loop', icon: 'Bot' },
        },
        {
          id: 'timeline-autonomous-loop',
          type: 'timeline',
          data: {
            title: 'The Autonomous Loop',
            subtitle: 'A continuous cycle of reflection, planning, execution, and evolution. This is how FlowPilot operates — with or without you.',
            items: [
              { id: 'loop-1', title: 'Heartbeat', description: 'Every 12 hours, FlowPilot wakes up. It checks objectives, reviews recent activity, and prepares to act.', icon: 'Activity' },
              { id: 'loop-2', title: 'Reflect', description: 'What happened since last cycle? What succeeded? What failed? Patterns are extracted and stored in memory.', icon: 'Brain' },
              { id: 'loop-3', title: 'Plan', description: 'Match objectives to available skills. Prioritize by impact. Respect constraints and approval requirements.', icon: 'Target' },
              { id: 'loop-4', title: 'Execute', description: 'Run skills: write content, qualify leads, send campaigns, update CRM. Each execution is logged with full context.', icon: 'Zap' },
              { id: 'loop-5', title: 'Log', description: 'Every action recorded in the activity feed. Inputs, outputs, duration, status. Complete audit trail.', icon: 'FileText' },
              { id: 'loop-6', title: 'Learn & Evolve', description: 'Update memory with new facts. Rewrite skill instructions based on results. Evolve soul and behavior patterns.', icon: 'Sparkles' },
            ],
            layout: 'vertical',
            staggeredReveal: true,
          },
        },
        // SKILLS SHOWCASE
        {
          id: 'features-skills',
          type: 'features',
          data: {
            title: '30+ Autonomous Skills',
            subtitle: 'Each skill is a capability FlowPilot can execute independently. Skills have instructions, parameters, and self-improving documentation.',
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
        // PROGRESS — Module maturity
        {
          id: 'progress-modules',
          type: 'progress',
          data: {
            title: 'Agentic Module Maturity',
            subtitle: 'How far along each autonomous capability is.',
            items: [
              { id: 'prog-skills', label: 'Skill Engine', value: 100, color: 'primary' },
              { id: 'prog-memory', label: 'Persistent Memory', value: 100 },
              { id: 'prog-objectives', label: 'Objectives & Goals', value: 95 },
              { id: 'prog-automations', label: 'Signal Automations', value: 90 },
              { id: 'prog-evolution', label: 'Self-Evolution', value: 85 },
              { id: 'prog-multiagent', label: 'Multi-Agent Orchestration', value: 40 },
            ],
            variant: 'default',
            size: 'md',
            showLabels: true,
            showPercentage: true,
            animated: true,
          },
        },
        // COMPARISON — FlowWink vs Everything Else (moved from Home)
        {
          id: 'comparison-competitors',
          type: 'comparison',
          data: {
            title: 'FlowWink Replaces Four Products',
            subtitle: 'Traditional CMS + Chatbot + Marketing Automation + CRM — all in one autonomous platform.',
            products: [
              { id: 'fw', name: 'FlowWink', highlighted: true },
              { id: 'cms', name: 'Traditional CMS' },
              { id: 'chatbot', name: 'AI Chatbot' },
              { id: 'automation', name: 'Marketing Automation' },
            ],
            features: [
              { id: 'f1', name: 'Visual Page Builder', values: [true, true, false, false] },
              { id: 'f2', name: 'Headless API', values: [true, false, false, false] },
              { id: 'f3', name: 'Autonomous AI Agent', values: [true, false, false, false] },
              { id: 'f4', name: 'Persistent Memory', values: [true, false, false, false] },
              { id: 'f5', name: 'Self-Evolving Skills', values: [true, false, false, false] },
              { id: 'f6', name: 'Lead CRM & Scoring', values: [true, false, false, true] },
              { id: 'f7', name: 'AI Content Generation', values: [true, false, true, false] },
              { id: 'f8', name: 'Email Campaigns', values: [true, false, false, true] },
              { id: 'f9', name: 'Booking System', values: [true, false, false, false] },
              { id: 'f10', name: 'E-commerce', values: [true, true, false, false] },
              { id: 'f11', name: 'Knowledge Base', values: [true, false, true, false] },
              { id: 'f12', name: 'Self-Hostable', values: [true, 'Some', false, false] },
              { id: 'f13', name: 'Private LLM / Data Sovereignty', values: [true, false, false, false] },
              { id: 'f14', name: 'Open Source', values: [true, 'Some', false, false] },
            ],
            variant: 'striped',
            showPrices: false,
            showButtons: false,
            stickyHeader: true,
          },
        },
        // RESOURCES
        {
          id: 'sep-resources',
          type: 'separator',
          data: { variant: 'text', text: 'Resources', icon: 'BookOpen' },
        },
        {
          id: 'links-resources',
          type: 'link-grid',
          data: {
            title: 'Resources',
            links: [
              { id: 'link-docs', icon: 'BookOpen', title: 'Documentation', description: 'Architecture & API reference', url: '/docs' },
              { id: 'link-github', icon: 'Github', title: 'GitHub', description: 'Source code & issues', url: 'https://github.com/magnusfroste/flowwink' },
              { id: 'link-discord', icon: 'MessageCircle', title: 'Community', description: 'Discord support', url: 'https://discord.gg/flowwink' },
              { id: 'link-selfhost', icon: 'Server', title: 'Self-Hosting', description: 'Docker deployment guide', url: '/docs/self-hosting' },
            ],
            columns: 4,
          },
        },
        {
          id: 'cta-features',
          type: 'cta',
          data: {
            title: 'See the Agent in Action',
            subtitle: 'Watch FlowPilot write, qualify, and campaign — live in the demo.',
            buttonText: 'Launch Demo',
            buttonUrl: '/demo',
            secondaryButtonText: 'View Pricing',
            secondaryButtonUrl: '/pricing',
            gradient: true,
          },
        },
      ],
    },

    // ═══════════════════════════════════════════════════════════
    // FLOWPILOT — The Autonomous Operator (differentiate)
    // ═══════════════════════════════════════════════════════════
    {
      title: 'FlowPilot',
      slug: 'flowpilot',
      menu_order: 4,
      showInMenu: true,
      meta: {
        description: 'FlowPilot is the autonomous AI operator at the heart of FlowWink. Unified knowledge, A2A protocol, and next-gen digital presence.',
        showTitle: false,
        titleAlignment: 'center',
      },
      blocks: [
        // HERO
        {
          id: 'hero-flowpilot',
          type: 'hero',
          data: {
            title: 'Meet FlowPilot',
            subtitle: 'Not a chatbot. Not a plugin. An autonomous operator with memory, goals, and self-evolving skills. FlowPilot runs your entire digital presence while you focus on what matters.',
            backgroundType: 'color',
            heightMode: 'auto',
            contentAlignment: 'center',
            overlayOpacity: 0,
            primaryButton: { text: 'See It Operate', url: '/demo' },
            secondaryButton: { text: 'Self-Host Free', url: 'https://github.com/magnusfroste/flowwink' },
          },
        },
        {
          id: 'stats-flowpilot',
          type: 'stats',
          data: {
            items: [
              { id: 'fp-s1', value: '∞', label: 'Knowledge Sources' },
              { id: 'fp-s2', value: 'A2A', label: 'Protocol Ready' },
              { id: 'fp-s3', value: '24/7', label: 'Always Operating' },
              { id: 'fp-s4', value: 'Yes', label: 'Self-Improving' },
            ],
            columns: 4,
            variant: 'minimal',
          },
        },
        // UNIFIED KNOWLEDGE
        {
          id: 'divider-unified',
          type: 'section-divider',
          data: { shape: 'wave', height: 'sm' },
        },
        {
          id: 'twocol-unified-knowledge',
          type: 'two-column',
          data: {
            eyebrow: 'UNIFIED KNOWLEDGE',
            title: 'One Brain.',
            accentText: 'Every Touchpoint.',
            accentPosition: 'end',
            leftColumn: {
              type: 'doc',
              content: [
                { type: 'paragraph', content: [{ type: 'text', text: 'Every module in FlowWink feeds into a single shared knowledge context. Blog posts. KB articles. Product catalog. Lead history. Booking data. Company profiles. Form submissions. Analytics.' }] },
                { type: 'paragraph', content: [{ type: 'text', text: 'FlowPilot doesn\'t just have access to this data — it reasons over it. When a visitor asks a question, it answers from the full picture. When it operates autonomously, it acts on the complete context of your business.' }] },
              ],
            },
            rightColumn: {
              type: 'doc',
              content: [
                { type: 'bulletList', content: [
                  { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'bold' }], text: '📝 Content' }, { type: 'text', text: ' — blog posts, pages, KB articles inform brand voice and expertise' }] }] },
                  { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'bold' }], text: '👥 CRM' }, { type: 'text', text: ' — lead history, company data, deal context personalize every interaction' }] }] },
                  { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'bold' }], text: '🛒 Commerce' }, { type: 'text', text: ' — products, orders, bookings feed recommendation and follow-up logic' }] }] },
                  { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'bold' }], text: '📊 Analytics' }, { type: 'text', text: ' — performance data drives strategy, content priorities, and campaign timing' }] }] },
                  { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'bold' }], text: '🧠 Memory' }, { type: 'text', text: ' — everything FlowPilot learns is stored and recalled across sessions and touchpoints' }] }] },
                ]},
              ],
            },
            layout: '50-50',
          },
        },
        {
          id: 'features-unified',
          type: 'features',
          data: {
            title: 'Knowledge That Works in Every Direction',
            subtitle: 'The same context that helps visitors also drives FlowPilot\'s autonomous decisions.',
            features: [
              { id: 'uk-chat', icon: 'MessageSquare', title: 'Visitor Chat', description: 'When a visitor asks a question, FlowPilot answers from your complete content library, product catalog, and KB — not a hardcoded FAQ.' },
              { id: 'uk-content', icon: 'FileText', title: 'Content Strategy', description: 'FlowPilot knows which topics you\'ve covered, what your audience engages with, and what gaps to fill next.' },
              { id: 'uk-leads', icon: 'UserCheck', title: 'Lead Context', description: 'When qualifying a lead, FlowPilot cross-references company data, past interactions, and deal history for a complete picture.' },
              { id: 'uk-email', icon: 'Mail', title: 'Personalized Campaigns', description: 'Campaigns are crafted using purchase history, content interests, and behavioral signals from across every module.' },
              { id: 'uk-ops', icon: 'Settings', title: 'Operational Decisions', description: 'FlowPilot\'s autonomous heartbeat draws on analytics, objectives, and recent activity to decide what to do next.' },
              { id: 'uk-a2a', icon: 'Network', title: 'A2A Responses', description: 'When another agent queries your FlowPilot instance, it answers from the same unified context — structured, accurate, instantly.' },
            ],
            columns: 3,
            layout: 'grid',
            variant: 'cards',
            iconStyle: 'circle',
          },
        },
        // A2A PROTOCOL
        {
          id: 'parallax-a2a',
          type: 'parallax-section',
          data: {
            backgroundImage: 'https://images.unsplash.com/photo-1635070041078-e363dbe005cb?w=1920',
            title: 'The Agentic Web is Arriving.',
            subtitle: 'AI agents don\'t browse websites. They query agents. FlowPilot is ready.',
            height: 'md',
            textColor: 'light',
            overlayOpacity: 70,
            contentAlignment: 'center',
          },
        },
        {
          id: 'bento-a2a',
          type: 'bento-grid',
          data: {
            title: 'Agent-to-Agent Ready',
            subtitle: 'FlowPilot participates in the emerging A2A protocol. Your site becomes a node in the agentic web.',
            eyebrow: 'A2A PROTOCOL',
            columns: 3,
            variant: 'glass',
            gap: 'md',
            staggeredReveal: true,
            items: [
              { id: 'a2a-1', title: 'Machine-Readable Presence', description: 'FlowPilot exposes structured endpoints that other AI agents can query directly — services, expertise, products, people.', icon: 'Network', span: 'wide', accentColor: '#6366F1' },
              { id: 'a2a-2', title: 'Fully Autonomous Response', description: 'No human in the loop required. When an external agent asks "who are your best consultants for a React project?", FlowPilot evaluates your CRM, scores profiles, and responds instantly.', icon: 'Bot', span: 'large', accentColor: '#8B5CF6' },
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
              { id: 'res-1', name: 'Elena Vasquez', role: 'Senior React Developer', image: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=400', bio: '8 years React & TypeScript. Available from July. Match score: 97%.', linkedin: 'https://linkedin.com' },
              { id: 'res-2', name: 'Jonas Berg', role: 'Full-Stack Engineer', image: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=400', bio: '6 years React, Node.js, AWS. Available now. Match score: 94%.', linkedin: 'https://linkedin.com' },
              { id: 'res-3', name: 'Priya Nair', role: 'Frontend Architect', image: 'https://images.unsplash.com/photo-1438761681033-6461ffad8d80?w=400', bio: '10 years frontend, design systems, React Native. Part-time available. Match score: 91%.', linkedin: 'https://linkedin.com' },
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
            buttonText: 'See It Live',
            buttonUrl: '/demo',
            secondaryButtonText: 'Self-Host Free',
            secondaryButtonUrl: 'https://github.com/magnusfroste/flowwink',
            gradient: true,
          },
        },
      ],
    },

    // ═══════════════════════════════════════════════════════════
    // BLOCKS — Block Catalog (showcase all block types)
    // ═══════════════════════════════════════════════════════════
    {
      title: 'Blocks',
      slug: 'blocks',
      menu_order: 5,
      showInMenu: true,
      meta: {
        description: 'Explore all 58+ block types available in FlowWink - from content blocks to interactive elements and AI-powered features.',
        showTitle: false,
        titleAlignment: 'center',
      },
      blocks: [
        { id: 'hero-blocks', type: 'hero', data: { title: 'Block Catalog', subtitle: 'This entire page is built with FlowWink blocks. Explore 58+ block types organized by category.', backgroundType: 'color', heightMode: 'auto', contentAlignment: 'center', overlayOpacity: 0, primaryButton: { text: 'Try the Admin', url: '/admin' }, secondaryButton: { text: 'View Docs', url: '/docs' } } },
        { id: 'stats-blocks-overview', type: 'stats', data: { items: [{ id: 'ds1', value: '58+', label: 'Block Types' }, { id: 'ds2', value: '21', label: 'Modules' }, { id: 'ds3', value: '8', label: 'Categories' }, { id: 'ds4', value: 'Drag & Drop', label: 'Editor' }], columns: 4, variant: 'minimal' } },
        // EDITOR INTRO
        { id: 'sep-editor', type: 'separator', data: { variant: 'text', text: 'Visual Editor', icon: 'Palette' } },
        { id: 'twocol-editor', type: 'two-column', data: { eyebrow: 'VISUAL EDITOR', title: 'Drag, Drop, Done', titleSize: 'large', content: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'The visual editor is the heart of FlowWink. Add blocks, arrange them, edit content – all in real-time with instant preview.' }] }, { type: 'heading', attrs: { level: 3 }, content: [{ type: 'text', text: 'How It Works' }] }, { type: 'orderedList', content: [{ type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'bold' }], text: 'Add a Block' }, { type: 'text', text: ' – Click the + button and choose from 47+ block types' }] }] }, { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'bold' }], text: 'Edit Content' }, { type: 'text', text: ' – Click any text to edit. Upload images. Configure settings.' }] }] }, { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'bold' }], text: 'Rearrange' }, { type: 'text', text: ' – Drag blocks to reorder. Move sections around freely.' }] }] }, { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'bold' }], text: 'Preview & Publish' }, { type: 'text', text: ' – See exactly how it looks, then go live with one click.' }] }] }] }] }, imageSrc: '', imageAlt: 'FlowWink editor interface', imagePosition: 'right', note: '🖼️ The editor panel shows a live preview on the right and block controls on the left. Every change is auto-saved.' } },
        // BLOCK CATEGORIES OVERVIEW
        { id: 'sep-blocks-demo', type: 'separator', data: { variant: 'text', text: 'Block Showcase', icon: 'LayoutGrid' } },
        { id: 'demo-block-overview', type: 'features', data: { title: '47+ Block Types Available', subtitle: 'From simple text to complex e-commerce – build any page with drag-and-drop blocks.', features: [{ id: 'cat-content', icon: 'FileText', title: 'Content', description: 'Hero, Text, Image, Quote, Separator, Two-Column, Info Box' }, { id: 'cat-showcase', icon: 'LayoutGrid', title: 'Showcase', description: 'Features, Stats, Timeline, Gallery, Logos, Team, Testimonials' }, { id: 'cat-commerce', icon: 'ShoppingCart', title: 'E-commerce', description: 'Pricing, Products, Cart, Comparison' }, { id: 'cat-forms', icon: 'ClipboardList', title: 'Forms', description: 'Contact, Form Builder, Newsletter, Booking' }, { id: 'cat-navigation', icon: 'Navigation', title: 'Navigation', description: 'Header, Footer, Link Grid, Accordion' }, { id: 'cat-media', icon: 'Play', title: 'Media', description: 'YouTube, Map, Article Grid' }, { id: 'cat-ai', icon: 'Bot', title: 'Agent & AI', description: 'FlowPilot Chat, AI Text Assistant, Autonomous Skills' }, { id: 'cat-interactive', icon: 'MousePointer', title: 'Interactive', description: 'Popup, CTA, Countdown, Progress, Badges' }], columns: 4, variant: 'minimal', iconStyle: 'square' } },
        // CONTENT BLOCKS
        { id: 'demo-features', type: 'features', data: { title: 'Features Block', subtitle: 'Showcase capabilities with icon cards. Grid or list layout.', features: [{ id: 'demo-f1', icon: 'Zap', title: 'Fast', description: 'Optimized for speed. No bloat, no lag.' }, { id: 'demo-f2', icon: 'Shield', title: 'Secure', description: 'Row-level security. GDPR compliant.' }, { id: 'demo-f3', icon: 'Bot', title: 'Autonomous', description: 'FlowPilot operates your site 24/7.' }, { id: 'demo-f4', icon: 'Code', title: 'Developer Friendly', description: 'Full API access. Webhooks. Open source.' }], columns: 4, variant: 'cards', iconStyle: 'circle' } },
        { id: 'demo-stats', type: 'stats', data: { title: 'Stats Block', items: [{ id: 'demo-s1', value: '99.9%', label: 'Uptime' }, { id: 'demo-s2', value: '< 100ms', label: 'Response Time' }, { id: 'demo-s3', value: '50k+', label: 'Pages Served' }, { id: 'demo-s4', value: '24/7', label: 'Agent Active' }], columns: 4, variant: 'minimal' } },
        { id: 'demo-testimonials', type: 'testimonials', data: { title: 'Testimonials Block', testimonials: [{ id: 'demo-t1', content: 'The visual editor is incredibly intuitive. Our marketing team creates landing pages without any developer help.', author: 'Anna Svensson', role: 'Marketing Director', company: 'TechCorp', rating: 5 }, { id: 'demo-t2', content: 'FlowPilot qualified 200 leads last month while we focused on closing deals. Game changer.', author: 'Erik Johansson', role: 'Head of Sales', company: 'AppStudio', rating: 5 }, { id: 'demo-t3', content: 'Self-hosting with private LLM was a breeze. The documentation is excellent and the community is incredibly helpful.', author: 'Maria Lindgren', role: 'DevOps Engineer', company: 'CloudNative', rating: 5 }], layout: 'grid', columns: 3, showRating: true, showAvatar: false, variant: 'cards' } },
        { id: 'demo-team', type: 'team', data: { title: 'Team Block', subtitle: 'Showcase your team members with photos, roles, and social links.', members: [{ id: 'team-1', name: 'Anna Eriksson', role: 'CEO & Founder', image: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=400', bio: 'Visionary leader with 15 years in tech.', linkedin: 'https://linkedin.com', twitter: 'https://twitter.com' }, { id: 'team-2', name: 'Erik Lindberg', role: 'CTO', image: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=400', bio: 'Full-stack developer and architecture expert.', linkedin: 'https://linkedin.com', github: 'https://github.com' }, { id: 'team-3', name: 'Sofia Berg', role: 'Head of Design', image: 'https://images.unsplash.com/photo-1438761681033-6461ffad8d80?w=400', bio: 'Award-winning UX designer.', linkedin: 'https://linkedin.com', twitter: 'https://twitter.com' }, { id: 'team-4', name: 'Marcus Johansson', role: 'Lead Developer', image: 'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=400', bio: 'Open source contributor and mentor.', linkedin: 'https://linkedin.com', github: 'https://github.com' }], columns: 4, layout: 'grid', showBio: true, showSocial: true } },
        { id: 'demo-accordion', type: 'accordion', data: { title: 'Accordion Block', items: [{ question: 'How does the FAQ block work?', answer: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Add questions and answers. Visitors click to expand. Great for reducing support tickets and improving SEO with structured FAQ markup.' }] }] } }, { question: 'Can I add images and links inside answers?', answer: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Yes! Answers support rich text formatting including bold, italic, links, images, and even code blocks.' }] }] } }, { question: 'Is this good for SEO?', answer: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Absolutely. FlowWink automatically generates FAQ structured data (JSON-LD) for accordion blocks, helping your content appear in Google rich results.' }] }] } }] } },
        { id: 'demo-gallery', type: 'gallery', data: { title: 'Gallery Block', images: [{ id: 'gal-1', url: 'https://images.unsplash.com/photo-1517694712202-14dd9538aa97?w=600', alt: 'Code on laptop', caption: 'Developer workspace' }, { id: 'gal-2', url: 'https://images.unsplash.com/photo-1460925895917-afdab827c52f?w=600', alt: 'Analytics dashboard', caption: 'Data visualization' }, { id: 'gal-3', url: 'https://images.unsplash.com/photo-1551434678-e076c223a692?w=600', alt: 'Team collaboration', caption: 'Team meeting' }, { id: 'gal-4', url: 'https://images.unsplash.com/photo-1522071820081-009f0129c71c?w=600', alt: 'Office space', caption: 'Modern office' }], layout: 'grid', columns: 4, showCaptions: true, lightbox: true } },
        { id: 'demo-timeline', type: 'timeline', data: { title: 'Timeline Block', subtitle: 'Perfect for showing processes, history, or roadmaps.', items: [{ id: 'tl-1', title: 'Step 1: Plan', description: 'Define your content structure and goals.', icon: 'Lightbulb' }, { id: 'tl-2', title: 'Step 2: Build', description: 'Create pages with the visual editor.', icon: 'Hammer' }, { id: 'tl-3', title: 'Step 3: Review', description: 'Submit for approval and get feedback.', icon: 'CheckCircle' }, { id: 'tl-4', title: 'Step 4: Launch', description: 'Publish to the world with one click.', icon: 'Rocket' }], layout: 'horizontal' } },
        // E-COMMERCE & CONVERSION
        { id: 'sep-ecommerce', type: 'separator', data: { variant: 'text', text: 'E-commerce & Conversion', icon: 'ShoppingCart' } },
        { id: 'demo-comparison', type: 'comparison', data: { title: 'Comparison Block', products: [{ id: 'c-basic', name: 'Basic', price: 'Free' }, { id: 'c-pro', name: 'Pro', price: '$49/mo', highlighted: true }, { id: 'c-ent', name: 'Enterprise', price: 'Custom' }], features: [{ id: 'cf-1', name: 'Pages', values: ['10', 'Unlimited', 'Unlimited'] }, { id: 'cf-2', name: 'Users', values: ['1', '5', 'Unlimited'] }, { id: 'cf-3', name: 'API Access', values: [false, true, true] }, { id: 'cf-4', name: 'Priority Support', values: [false, true, true] }, { id: 'cf-5', name: 'Custom Domain', values: [false, true, true] }], variant: 'bordered', showPrices: true, showButtons: false } },
        { id: 'demo-pricing', type: 'pricing', data: { title: 'Pricing Block', tiers: [{ id: 'p-free', name: 'Starter', price: 'Free', period: 'forever', description: 'For personal projects', features: ['5 pages', '1 user', 'Basic support'], buttonText: 'Get Started', buttonUrl: '#' }, { id: 'p-pro', name: 'Professional', price: '$49', period: '/month', description: 'For growing teams', features: ['Unlimited pages', '5 users', 'Priority support', 'API access'], buttonText: 'Start Trial', buttonUrl: '#', highlighted: true, badge: 'Popular' }, { id: 'p-ent', name: 'Enterprise', price: 'Custom', description: 'For large organizations', features: ['Everything in Pro', 'Unlimited users', 'Custom SLA', 'Dedicated support'], buttonText: 'Contact Us', buttonUrl: '#' }], columns: 3, variant: 'cards' } },
        { id: 'demo-table', type: 'table', data: { title: 'Table Block', caption: 'Display structured data in a clean, responsive table format.', columns: [{ id: 'col1', header: 'Feature', align: 'left' }, { id: 'col2', header: 'Starter', align: 'center' }, { id: 'col3', header: 'Pro', align: 'center' }, { id: 'col4', header: 'Enterprise', align: 'center' }], rows: [['Pages', '10', 'Unlimited', 'Unlimited'], ['Users', '1', '5', 'Unlimited'], ['API Access', '❌', '✅', '✅'], ['Support', 'Community', 'Priority', 'Dedicated']], variant: 'striped', size: 'md', stickyHeader: true, highlightOnHover: true } },
        // INTERACTIVE BLOCKS
        { id: 'sep-interactive', type: 'separator', data: { variant: 'text', text: 'Interactive & Trust Blocks', icon: 'Sparkles' } },
        { id: 'demo-announcement', type: 'announcement-bar', data: { message: '🎉 Announcement Bar – Display important updates, promotions, or alerts.', linkText: 'Learn more', linkUrl: '#', variant: 'gradient', dismissable: true, sticky: false } },
        { id: 'demo-tabs', type: 'tabs', data: { title: 'Tabs Block', subtitle: 'Organize content into switchable panels.', tabs: [{ id: 'tab-features', title: 'Features', icon: 'Star', content: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Each tab can contain rich text content, lists, links, and more.' }] }, { type: 'bulletList', content: [{ type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Horizontal and vertical orientations' }] }] }, { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Underline, pills, or boxed variants' }] }] }, { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Optional icons for each tab' }] }] }] }] } }, { id: 'tab-pricing', title: 'Pricing', icon: 'CreditCard', content: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'This is the Pricing tab. You could show pricing details or FAQs here.' }] }] } }, { id: 'tab-support', title: 'Support', icon: 'HeadphonesIcon', content: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'This is the Support tab. Add contact info, help resources, or FAQs.' }] }] } }], orientation: 'horizontal', variant: 'underline' } },
        { id: 'demo-marquee', type: 'marquee', data: { items: [{ id: 'mq1', text: 'Marquee Block', icon: '🎠' }, { id: 'mq2', text: 'Scrolling text', icon: '📢' }, { id: 'mq3', text: 'Great for announcements', icon: '✨' }, { id: 'mq4', text: 'Partner logos', icon: '🤝' }, { id: 'mq5', text: 'Tech stack display', icon: '💻' }], speed: 'normal', direction: 'left', pauseOnHover: true, variant: 'gradient', separator: '•' } },
        { id: 'demo-countdown', type: 'countdown', data: { title: 'Countdown Block', subtitle: 'Create urgency with live countdowns.', targetDate: '2027-12-31T23:59:59', expiredMessage: 'The countdown has ended!', variant: 'cards', size: 'lg', showDays: true, showHours: true, showMinutes: true, showSeconds: true } },
        { id: 'demo-progress', type: 'progress', data: { title: 'Progress Block', subtitle: 'Show funding goals, skill levels, or project completion.', items: [{ id: 'prog1', label: 'Funding Goal', value: 75, color: 'primary' }, { id: 'prog2', label: 'Development', value: 90 }, { id: 'prog3', label: 'Documentation', value: 60 }], variant: 'default', size: 'md', showLabels: true, showPercentage: true, animated: true } },
        { id: 'demo-badge', type: 'badge', data: { title: 'Badge Block', subtitle: 'Display certifications, awards, or trust indicators.', badges: [{ id: 'bdg1', title: 'SOC 2 Certified', icon: 'shield' }, { id: 'bdg2', title: 'GDPR Compliant', icon: 'check' }, { id: 'bdg3', title: 'ISO 27001', icon: 'award' }, { id: 'bdg4', title: '99.9% Uptime', icon: 'medal' }], variant: 'default', columns: 4, size: 'md', showTitles: true, grayscale: false } },
        { id: 'demo-social-proof', type: 'social-proof', data: { title: 'Social Proof Block', subtitle: 'Show live metrics, ratings, and activity.', items: [{ id: 'sp1', type: 'counter', label: 'Happy Customers', value: 12500, icon: 'users' }, { id: 'sp2', type: 'rating', label: 'Average Rating', value: 4.9, maxRating: 5 }, { id: 'sp3', type: 'counter', label: 'Projects Completed', value: 3200, icon: 'folder' }], variant: 'cards', layout: 'horizontal', size: 'lg', animated: true, showLiveIndicator: false } },
        // KNOWLEDGE BASE BLOCKS
        { id: 'sep-kb-blocks', type: 'separator', data: { variant: 'text', text: 'Knowledge Base Blocks', icon: 'BookOpen' } },
        { id: 'demo-kb-hub', type: 'kb-hub', data: { title: 'KB Hub Block', subtitle: 'Full knowledge base landing page with categories and search.' } },
        { id: 'demo-kb-featured', type: 'kb-featured', data: { title: 'KB Featured Block', subtitle: 'Highlight your most important help articles.', maxArticles: 3 } },
        { id: 'demo-kb-accordion', type: 'kb-accordion', data: { title: 'KB Accordion Block', subtitle: 'Display KB articles as expandable FAQ items.' } },
        { id: 'demo-kb-search', type: 'kb-search', data: { title: 'KB Search Block', subtitle: 'Standalone search bar for your knowledge base.', placeholder: 'Search help articles...', showResults: true, maxResults: 3 } },
        // MORE BLOCKS
        { id: 'sep-more-blocks', type: 'separator', data: { variant: 'text', text: 'More Block Types', icon: 'LayoutGrid' } },
        { id: 'demo-chat-launcher', type: 'chat-launcher', data: { title: 'Chat Launcher Block', subtitle: 'Routes visitors to FlowPilot with quick action buttons and a search-like input.', placeholder: 'Ask anything about FlowWink...', showQuickActions: true, quickActionCount: 4, variant: 'card' } },
        { id: 'demo-article-grid', type: 'article-grid', data: { title: 'Article Grid Block', subtitle: 'Display blog posts in a responsive card grid.', columns: 3, maxArticles: 3, showExcerpt: true, showDate: true, showAuthor: true } },
        { id: 'demo-webinar', type: 'webinar', data: { title: 'Webinar Block', subtitle: 'Promote upcoming webinars and online events with registration.' } },
        { id: 'info-versions', type: 'info-box', data: { variant: 'info', content: { type: 'doc', content: [{ type: 'heading', attrs: { level: 3 }, content: [{ type: 'text', text: '💾 Every Save is a Version' }] }, { type: 'paragraph', content: [{ type: 'text', text: 'Made a mistake? No problem. Every save creates a version you can restore with one click. Compare any two versions side-by-side.' }] }] } } },
        { id: 'info-popup', type: 'info-box', data: { variant: 'highlight', content: { type: 'doc', content: [{ type: 'heading', attrs: { level: 3 }, content: [{ type: 'text', text: '🎯 Popup, Floating CTA & Lottie' }] }, { type: 'paragraph', content: [{ type: 'text', text: 'Trigger popups based on scroll/time/exit intent. Floating CTAs that appear on scroll. Lightweight Lottie vector animations with autoplay and hover triggers.' }] }] } } },
        // TRY IT
        { id: 'sep-try', type: 'separator', data: { variant: 'text', text: 'Try It Yourself', icon: 'MousePointer' } },
        { id: 'twocol-try', type: 'two-column', data: { leftColumn: { type: 'doc', content: [{ type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Ready to Build?' }] }, { type: 'paragraph', content: [{ type: 'text', text: 'The best way to understand FlowWink is to use it. Access the admin panel and start creating.' }] }, { type: 'bulletList', content: [{ type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Full access to all features' }] }] }, { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'FlowPilot operates in the background' }] }] }, { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Every block type available' }] }] }] }] }, rightColumn: { type: 'doc', content: [{ type: 'heading', attrs: { level: 3 }, content: [{ type: 'text', text: 'Quick Links' }] }, { type: 'bulletList', content: [{ type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: '→ Admin Dashboard: /admin' }] }] }, { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: '→ FlowPilot CoPilot: /admin/copilot' }] }] }, { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: '→ Blog Manager: /admin/blog' }] }] }, { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: '→ Agent Skills: /admin/skills' }] }] }] }] }, layout: '50-50' } },
        { id: 'cta-blocks', type: 'cta', data: { title: 'Start Building Now', subtitle: 'Access the full admin panel and let FlowPilot help you create.', buttonText: 'Open Admin Panel', buttonUrl: '/admin', secondaryButtonText: 'Self-Host Free', secondaryButtonUrl: 'https://github.com/magnusfroste/flowwink', gradient: true } },
      ],
    },

    // ═══════════════════════════════════════════════════════════
    // PRICING — Convert (plans, FAQ, CTA)
    // ═══════════════════════════════════════════════════════════
    {
      title: 'Pricing',
      slug: 'pricing',
      menu_order: 6,
      showInMenu: true,
      meta: {
        description: 'FlowWink pricing - Self-hosted free forever with full FlowPilot agent, or managed cloud starting at €49/month.',
        showTitle: false,
        titleAlignment: 'center',
      },
      blocks: [
        { id: 'hero-pricing', type: 'hero', data: { title: 'Simple, Transparent Pricing', subtitle: 'FlowPilot agent included in every plan. No per-seat charges. No AI usage fees.', backgroundType: 'color', heightMode: 'auto', contentAlignment: 'center', overlayOpacity: 0 } },
        { id: 'countdown-launch', type: 'countdown', data: { title: 'Early Adopter Offer', subtitle: 'Get 30% off managed cloud for life – limited time', targetDate: '2026-06-30T23:59:59', expiredMessage: 'Early adopter pricing has ended', variant: 'cards', size: 'lg', showDays: true, showHours: true, showMinutes: true, showSeconds: true } },
        { id: 'pricing-detailed', type: 'pricing', data: { title: '', tiers: [{ id: 'tier-self', name: 'Self-Hosted', price: 'Free', period: 'forever', description: 'Full FlowPilot agent. Your servers. Your LLM. Complete data sovereignty.', features: ['All CMS features + FlowPilot', 'Unlimited autonomous operations', 'Private LLM support (Ollama)', '20+ agent skills', 'Persistent memory & objectives', 'Community support'], buttonText: 'View on GitHub', buttonUrl: 'https://github.com/magnusfroste/flowwink' }, { id: 'tier-managed', name: 'Managed Cloud', price: '€49', period: '/month', description: 'We run the infrastructure. FlowPilot runs your digital presence.', features: ['Everything in Self-Hosted', 'Automatic updates', 'Daily backups + SSL + CDN', 'Managed AI model access', 'Priority email support', '99.9% uptime SLA'], buttonText: 'Start Free Trial', buttonUrl: '/contact', highlighted: true, badge: 'Most Popular' }, { id: 'tier-enterprise', name: 'Enterprise', price: 'Custom', description: 'Dedicated FlowPilot with custom skills and compliance support.', features: ['Everything in Managed', 'Dedicated infrastructure', 'Custom skill development', 'SSO (SAML/OIDC)', 'Dedicated success manager', 'Compliance & audit support'], buttonText: 'Contact Sales', buttonUrl: '/contact' }], columns: 3, variant: 'cards' } },
        { id: 'table-comparison', type: 'table', data: { title: 'Detailed Feature Comparison', caption: 'See exactly what\'s included in each plan.', columns: [{ id: 'col1', header: 'Feature', align: 'left' }, { id: 'col2', header: 'Self-Hosted', align: 'center' }, { id: 'col3', header: 'Managed Cloud', align: 'center' }, { id: 'col4', header: 'Enterprise', align: 'center' }], rows: [['Pages & Content', 'Unlimited', 'Unlimited', 'Unlimited'], ['FlowPilot Agent', '✅', '✅', '✅'], ['Autonomous Skills', '20+', '20+', 'Custom'], ['Persistent Memory', '✅', '✅', '✅'], ['Private LLM Support', '✅', '✅', '✅'], ['Automatic Updates', '❌', '✅', '✅'], ['Managed Backups', '❌', '✅ Daily', '✅ Hourly'], ['SSL & CDN', '❌', '✅', '✅'], ['Uptime SLA', '❌', '99.9%', 'Custom'], ['SSO (SAML/OIDC)', '❌', '❌', '✅'], ['Custom Skills', '❌', '❌', '✅'], ['Support', 'Community', 'Priority Email', 'Dedicated Manager']], variant: 'striped', size: 'md', stickyHeader: true, highlightOnHover: true } },
        // MARQUEE — Tech stack (fits well on pricing page)
        { id: 'marquee-tech', type: 'marquee', data: { items: [{ id: 'mq1', text: 'React', icon: '⚛️' }, { id: 'mq2', text: 'TypeScript', icon: '📘' }, { id: 'mq3', text: 'Supabase', icon: '⚡' }, { id: 'mq4', text: 'OpenAI', icon: '🤖' }, { id: 'mq5', text: 'Gemini', icon: '✨' }, { id: 'mq6', text: 'Ollama', icon: '🦙' }, { id: 'mq7', text: 'Docker', icon: '🐳' }, { id: 'mq8', text: 'Stripe', icon: '💳' }], speed: 'normal', direction: 'left', pauseOnHover: true, variant: 'default', separator: '•' } },
        // FAQ (moved from Home)
        { id: 'accordion-faq', type: 'accordion', data: { title: 'Frequently Asked Questions', items: [{ question: 'What is FlowPilot?', answer: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'FlowPilot is an autonomous AI agent built into FlowWink. Unlike chatbots that respond to prompts, FlowPilot has persistent memory, self-evolving skills, and goal-driven objectives. It operates your entire digital presence — content, CRM, email, bookings — continuously and autonomously.' }] }] } }, { question: 'Is it safe to let an AI run my website?', answer: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Yes. FlowPilot has a full human-in-the-loop system. Every skill can be configured to require approval before execution. Every action is logged in the activity feed with full audit trails. You control what\'s autonomous and what requires your sign-off.' }] }] } }, { question: 'Is self-hosted really free forever?', answer: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Yes! FlowWink is open source under the MIT license. You get the full FlowPilot agent, all skills, persistent memory — everything. The only costs are your own hosting and AI model API fees.' }] }] } }, { question: 'Can I use my own AI model?', answer: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Absolutely. FlowWink supports OpenAI, Google Gemini, and local LLMs via Ollama or any OpenAI-compatible endpoint. Your data stays on your infrastructure for complete privacy.' }] }] } }, { question: 'Can I migrate from self-hosted to managed?', answer: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Yes. We provide migration tools to move your content, agent memory, and settings to our managed infrastructure. The process is seamless.' }] }] } }, { question: 'How is this different from ChatGPT + WordPress?', answer: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'ChatGPT is a conversation tool. FlowPilot is an operator. It has persistent memory that survives across sessions, objectives it tracks toward completion, skills it can execute autonomously, and a self-evolution mechanism. It\'s not just answering questions — it\'s running your business.' }] }] } }] } },
        { id: 'cta-pricing', type: 'cta', data: { title: 'Start Building Today', subtitle: 'Self-host for free or start a managed trial. Autonomous operations included in every plan.', buttonText: 'Self-Host Free', buttonUrl: 'https://github.com/magnusfroste/flowwink', secondaryButtonText: 'Start Trial', secondaryButtonUrl: '/contact', gradient: true } },
      ],
    },
  ],
  branding: {
    logo: '',
    organizationName: 'FlowWink',
    brandTagline: 'The Autonomous Agentic CMS',
    primaryColor: '162 63% 41%',
    headingFont: 'Sora',
    bodyFont: 'DM Sans',
    borderRadius: 'lg',
    shadowIntensity: 'medium',
  },
  chatSettings: {
    enabled: true,
    aiProvider: 'openai',
    n8nWebhookUrl: '',
    widgetEnabled: true,
    widgetPosition: 'bottom-right',
    widgetStyle: 'pill',
    widgetSize: 'md',
    widgetMaxPrompts: 3,
    widgetShowOnMobile: true,
    blockEnabled: true,
    landingPageEnabled: true,
    welcomeMessage: 'Hi! I\'m FlowPilot — the autonomous agent that operates this site. I have persistent memory and I\'ve read every page here. What would you like to know?',
    systemPrompt: 'You are FlowPilot, the autonomous AI agent powering FlowWink. You have persistent memory, self-evolving skills, and operate across 6 channels (content, CRM, email, bookings, e-commerce, analytics). Help users understand the agentic architecture, autonomous capabilities, and how FlowWink differs from traditional CMS platforms. Be confident, knowledgeable, and concise.',
    suggestedPrompts: [
      'What makes FlowPilot autonomous?',
      'How does the self-evolution work?',
      'Can I self-host with a private LLM?',
      'What skills does FlowPilot have?',
    ],
    includeContentAsContext: true,
    contentContextMaxTokens: 50000,
    includedPageSlugs: ['*'],
    includeKbArticles: true,
    showContextIndicator: true,
  },
  headerSettings: {
    variant: 'sticky',
    stickyHeader: true,
    backgroundStyle: 'blur',
    headerShadow: 'sm',
    showBorder: true,
  },
  footerSettings: {
    variant: 'full',
    email: 'hello@flowwink.com',
    phone: '+46 70 123 45 67',
    address: 'Stockholm, Sweden',
    postalCode: '',
    weekdayHours: 'Mon-Fri 9-17',
    weekendHours: 'FlowPilot operates 24/7',
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
    titleTemplate: '%s | FlowWink - The Autonomous Agentic CMS',
    defaultDescription: 'Your website runs itself. FlowPilot is an autonomous AI agent that writes content, qualifies leads, runs campaigns, and learns from every interaction. Self-host free.',
    robotsIndex: true,
    robotsFollow: true,
    developmentMode: false,
  },
  aeoSettings: {
    enabled: true,
    organizationName: 'FlowWink',
    shortDescription: 'The first autonomous agentic CMS. FlowPilot operates your entire digital presence — content, CRM, email, bookings, e-commerce — with persistent memory and self-evolving skills.',
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
  flowpilot: {
    objectives: [
      { goal: 'Demonstrate all platform capabilities through real content', success_criteria: { published_posts: 5, active_products: 3, kb_articles: 10 } },
      { goal: 'Build a complete sales pipeline from visitor to customer', success_criteria: { monthly_leads: 30, deal_conversion_rate: 20 } },
    ],
    prioritySkills: ['write_blog_post', 'add_lead', 'send_newsletter', 'book_appointment', 'lookup_order', 'analyze_analytics', 'search_web'],
    soul: {
      purpose: 'I showcase the full power of this platform — running content, CRM, commerce, and marketing autonomously.',
      tone: 'Confident, comprehensive. Platform expert demonstrating capability.',
    },
  },
  siteSettings: {
    homepageSlug: 'home',
  },
};
