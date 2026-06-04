/**
 * Demo Company Template — Public FlowWink Demo Stage (v1.4.0)
 *
 * Static "set" for a public demo instance (e.g. demo.flowwink.com).
 * Pairs with the `demo-cycle` edge function that hourly resets and re-seeds
 * dynamic data (leads, quotes, invoices, expenses) via `reset_module_data`
 * + `seed_module_demo`.
 *
 * Philosophy:
 *  - Static content lives here (pages, KB, products, identity) and is NEVER
 *    touched by demo cycles. Installed once on first boot — safe to expand.
 *  - Dynamic content (CRM rows, orders, etc.) is owned by `seed_module_demo`
 *    and registered in `demo_run_items` for safe teardown.
 *
 * Email is intentionally OFF — outbound communication skills run at
 * trust_level='approve', so agents show proposed sends in /admin/approvals
 * instead of firing real emails.
 */
import type { StarterTemplate } from './types';

// Blog posts, KB articles, products and consultants are no longer seeded by
// the template. Each module owns its own demo data — click "Seed demo data"
// on the Blog / Knowledge Base / E-commerce / Resume modules in /admin/modules.


export const demoCompanyTemplate: StarterTemplate = {
  id: 'demo-company',
  name: 'Demo Company',
  description: 'Public demo stage for FlowWink. Static set + hourly reset/seed of dynamic data so visitors can watch FlowPilot operate a live business.',
  category: 'platform',
  icon: 'PlayCircle',
  tagline: 'A working business you can poke at — resets every hour.',
  aiChatPosition: 'Demo concierge — explains what FlowPilot is doing in real time',
  requiredModules: ['blog', 'chat', 'leads', 'deals', 'companies', 'quotes', 'invoicing', 'expenses', 'forms', 'ecommerce', 'inventory', 'approvals'],

  pages: [
    {
      title: 'Home',
      slug: 'home',
      isHomePage: true,
      menu_order: 1,
      showInMenu: true,
      meta: {
        seoTitle: 'FlowWink Demo — Watch an autonomous business operate live',
        description: 'A public FlowWink instance running a fictional company. Leads, quotes and invoices reset every hour so you can see FlowPilot in action.',
        showTitle: false,
        titleAlignment: 'center',
      },
      blocks: [
        {
          id: 'announcement-demo',
          type: 'announcement-bar',
          data: {
            message: '⚡ Live demo — everything resets every hour. Login: demo@flowwink.com / demo1234',
            linkText: 'Open admin',
            linkUrl: '/auth',
            variant: 'gradient',
            dismissable: false,
            sticky: true,
          },
        },
        {
          id: 'hero-demo',
          type: 'hero',
          data: {
            eyebrow: 'LIVE DEMO · RESETS EVERY HOUR',
            eyebrowColor: 'primary',
            title: 'Watch a business run itself.',
            subtitle: 'This site is a live FlowWink instance. FlowPilot handles leads, quotes, invoices and expenses around the clock. Sign in with demo / demo1234 and break things — we reset every hour.',
            backgroundType: 'video',
            videoType: 'direct',
            videoUrl: '/videos/hero-demo-ambient.mp4',
            videoAutoplay: true,
            videoLoop: true,
            videoMuted: true,
            showVideoControls: false,
            overlayColor: 'dark',
            overlayOpacity: 70,
            textTheme: 'light',
            heightMode: '80vh',
            contentAlignment: 'center',
            textAlignment: 'center',
            titleSize: 'display',
            gradientTitle: true,
            titleAnimation: 'slide-up',
            subtitleAnimation: 'fade-in',
            buttonAnimation: 'fade-in',
            showScrollIndicator: true,
            primaryButton: { text: 'Shop the demo', url: '/shop' },
            secondaryButton: { text: 'Open the admin', url: '/auth' },
          },
        },
        {
          id: 'stats-demo',
          type: 'stats',
          data: {
            title: 'What FlowPilot is doing right now',
            stats: [
              { value: 'CRM', label: 'Live leads & deals', icon: 'Users' },
              { value: 'Quotes', label: 'Drafted & sent', icon: 'FileText' },
              { value: 'Invoices', label: 'Generated & tracked', icon: 'Receipt' },
              { value: 'Expenses', label: 'Booked & reconciled', icon: 'Wallet' },
            ],
          },
        },
        {
          id: 'chat-launcher-demo',
          type: 'chat-launcher',
          data: {
            title: 'Talk to FlowPilot',
            placeholder: 'Ask what the operator is doing right now…',
            showQuickActions: true,
            quickActionCount: 4,
            variant: 'card',
          },
        },
        {
          id: 'text-demo',
          type: 'text',
          data: {
            content: { type: 'doc', content: [
              { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'What the hourly cron actually does' }] },
              { type: 'paragraph', content: [{ type: 'text', text: 'Every hour on the hour, the demo-cycle job runs reset_module_data → seed_module_demo across the pilot modules, then restocks the shop. It only deletes rows it created itself (tracked in demo_run_items) — your admin edits and the static content set are safe.' }] },
              { type: 'heading', attrs: { level: 3 }, content: [{ type: 'text', text: 'Wiped & re-seeded every hour' }] },
              { type: 'bulletList', content: [
                { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'CRM — leads, contacts, deals' }] }] },
                { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Quotes — drafts and sent quotes' }] }] },
                { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Invoices — generated, tracked, paid' }] }] },
                { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Expenses — submitted, approved, booked' }] }] },
                { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Ecommerce — orders, fulfillment, stock levels' }] }] },
              ]},
              { type: 'heading', attrs: { level: 3 }, content: [{ type: 'text', text: 'Survives the reset' }] },
              { type: 'bulletList', content: [
                { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Pages, blog posts, KB articles, products, branding' }] }] },
                { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'FlowPilot soul, objectives, skills, agent memory' }] }] },
                { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Anything you create as a logged-in admin (until next cycle for dynamic modules)' }] }] },
              ]},
              { type: 'paragraph', content: [{ type: 'text', text: 'Email is disabled on this instance. Outbound skills are set to approve, so agents queue proposed sends in /admin/approvals instead of firing real messages.' }] },
            ]},
          },
        },
        {
          id: 'cta-demo',
          type: 'cta',
          data: { title: 'Run your own', subtitle: 'FlowWink is self-hosted and free. Clone the repo and bring your own brain (OpenAI, Gemini, or a local model).', buttonText: 'Get FlowWink', buttonUrl: 'https://www.clawable.org', gradient: true },
        },
      ],
    },
    {
      title: 'Shop',
      slug: 'shop',
      menu_order: 2,
      showInMenu: true,
      meta: {
        seoTitle: 'Shop — FlowWink Demo',
        description: 'Browse the demo catalog. Place a sandbox order and watch FlowPilot fulfill it.',
        showTitle: false,
        titleAlignment: 'center',
      },
      blocks: [
        {
          id: 'shop-hero',
          type: 'hero',
          data: {
            title: 'Demo Shop',
            subtitle: 'Add anything to your cart. Checkout is in sandbox mode — no card needed. Your order will appear in /admin/orders and FlowPilot will fulfill it.',
            backgroundType: 'color',
            heightMode: 'compact',
            contentAlignment: 'center',
          },
        },
        {
          id: 'shop-products',
          type: 'products',
          data: { title: 'Catalog', columns: 3, showPrice: true, showDescription: true, limit: 12 },
        },
        {
          id: 'shop-how-it-works',
          type: 'features',
          data: {
            title: 'How shopping works here',
            subtitle: 'Nothing is charged. The point is to watch what happens after you click buy.',
            features: [
              { id: 's1', icon: 'ShoppingCart', title: '1. Add to cart', description: 'Pick anything from the catalog. No login required to shop.' },
              { id: 's2', icon: 'CreditCard', title: '2. Sandbox checkout', description: 'Stripe is in test mode — use card 4242 4242 4242 4242 with any future date and CVC.' },
              { id: 's3', icon: 'Inbox', title: '3. Order lands in admin', description: 'Sign in and open /admin/orders. Your order is there, ready for fulfillment.' },
              { id: 's4', icon: 'Bot', title: '4. FlowPilot fulfills', description: 'The autonomous operator picks it up, allocates stock and moves it through the lifecycle.' },
            ],
            columns: 4,
            layout: 'grid',
            variant: 'centered',
            iconStyle: 'circle',
          },
        },
      ],
    },
    {
      title: 'How this demo works',
      slug: 'how-this-demo-works',
      menu_order: 3,
      showInMenu: true,
      meta: {
        seoTitle: 'How the FlowWink demo works',
        description: 'A short tour of the demo: what is live, what resets, and how to log in.',
        showTitle: true,
        titleAlignment: 'center',
      },
      blocks: [
        {
          id: 'how-hero',
          type: 'hero',
          data: {
            title: 'A live business, reset every hour.',
            subtitle: 'This is the same FlowWink you would self-host — just with a cron job that wipes the data so the next visitor sees a fresh scenario.',
            backgroundType: 'color',
            heightMode: 'compact',
            contentAlignment: 'center',
          },
        },
        {
          id: 'how-stats',
          type: 'stats',
          data: {
            title: 'The pitch in four numbers',
            stats: [
              { value: '62', label: 'Modules available', icon: 'LayoutGrid' },
              { value: '280', label: 'MCP-exposed skills', icon: 'Sparkles' },
              { value: '1h', label: 'Reset interval', icon: 'Timer' },
              { value: '0€', label: 'License cost', icon: 'Gift' },
            ],
          },
        },
        {
          id: 'how-two-layers',
          type: 'features',
          data: {
            title: 'Think of it as two layers',
            subtitle: 'One layer is the website and shop you set up once. The other is the day-to-day business activity that FlowPilot runs — and that we reset every hour so the next visitor gets a fresh stage.',
            features: [
              {
                id: 'layer-static',
                icon: 'Layers',
                title: 'Stays put — your work',
                description: 'Pages, blog posts, KB articles, products, branding and any admin edits you make. These are installed once and never touched by the reset. Edit freely, they will still be here next time.',
              },
              {
                id: 'layer-dynamic',
                icon: 'RefreshCw',
                title: 'Resets hourly — the business',
                description: 'Leads, deals, quotes, invoices, expenses, orders and stock levels. This is the data FlowPilot generated while operating the company. The hourly cron wipes it and re-seeds a new scenario.',
              },
            ],
            columns: 2,
            layout: 'grid',
            variant: 'centered',
            iconStyle: 'circle',
          },
        },
        {
          id: 'how-text',
          type: 'text',
          data: {
            content: { type: 'doc', content: [
              { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Sign in and explore' }] },
              { type: 'paragraph', content: [{ type: 'text', text: 'Open /auth and log in with demo@flowwink.com / demo1234. You land in the admin with full access. Start with /admin/leads, /admin/orders, /admin/communications and /admin/approvals — that is where you see autonomous behaviour in context.' }] },
              { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'What is not real' }] },
              { type: 'paragraph', content: [{ type: 'text', text: 'No emails leave the building. No card is ever charged. Anything FlowPilot would have sent shows up as simulated in /admin/communications, and outbound skills queue proposals in /admin/approvals instead of firing.' }] },
              { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Tip' }] },
              { type: 'paragraph', content: [{ type: 'text', text: 'Break things on purpose. Place a sandbox order, reject an approval, edit a quote, ask FlowPilot something odd. Whatever you do to the operational data, the next reset gives you a clean slate.' }] },
            ]},
          },
        },
        {
          id: 'how-cta',
          type: 'cta',
          data: { title: 'Run your own instance', subtitle: 'Clone, configure your Supabase project and your AI key, and you are live.', buttonText: 'Get FlowWink', buttonUrl: 'https://www.clawable.org', gradient: true },
        },
      ],
    },
  ],

  // blogPosts / kbCategories / products / consultants are seeded per-module
  // via "Seed demo data" in /admin/modules — not by the template installer.



  branding: {
    organizationName: 'FlowWink Demo',
    brandTagline: 'A live, autonomous business',
    primaryColor: '217 91% 60%',
    headingFont: 'Inter',
    bodyFont: 'Inter',
    borderRadius: 'md',
  },
  chatSettings: {
    enabled: true,
    landingPageEnabled: true,
    widgetPosition: 'bottom-right',
    welcomeMessage: 'Hi! This is a public demo. Ask me what FlowPilot is doing — or sign in (demo / demo1234) and poke around.',
    systemPrompt: 'You are the concierge for a public FlowWink demo. Explain what FlowPilot does, mention that data resets hourly, and never claim emails were actually sent.',
    suggestedPrompts: [
      'What does FlowPilot do here?',
      'How often does this demo reset?',
      'How do I log in?',
      'Can I self-host FlowWink?',
    ],
    includeContentAsContext: true,
    includedPageSlugs: ['*'],
    includeKbArticles: true,
    contentContextMaxTokens: 50000,
    showContextIndicator: true,
  },
  headerSettings: { variant: 'sticky', stickyHeader: true, backgroundStyle: 'blur', headerShadow: 'sm', showBorder: true },
  footerSettings: { variant: 'full', email: 'demo@flowwink.com', showBrand: true, showQuickLinks: true, showContact: false, showHours: false },
  seoSettings: {
    siteTitle: 'FlowWink Demo',
    titleTemplate: '%s | FlowWink Demo',
    defaultDescription: 'A public FlowWink instance running a fictional company. FlowPilot handles operations live; data resets every hour.',
    robotsIndex: true,
    robotsFollow: true,
  },
  aeoSettings: {
    enabled: true,
    organizationName: 'FlowWink Demo',
    shortDescription: 'Public FlowWink demo. FlowPilot operates the business live.',
    schemaOrgEnabled: true,
    schemaOrgType: 'Organization',
    faqSchemaEnabled: true,
    articleSchemaEnabled: true,
    sitemapEnabled: true,
    llmsTxtEnabled: true,
    llmsFullTxtEnabled: true,
  },
  cookieBannerSettings: { enabled: false },
  siteSettings: { homepageSlug: 'home' },
};
