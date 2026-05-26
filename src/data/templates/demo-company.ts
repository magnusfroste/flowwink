/**
 * Demo Company Template — Public FlowWink Demo Stage
 *
 * Static "set" for a public demo instance (e.g. demo.flowwink.com).
 * Pairs with the `demo-cycle` edge function that hourly resets and re-seeds
 * dynamic data (leads, quotes, invoices, expenses) via `reset_module_data`
 * + `seed_module_demo`.
 *
 * Philosophy:
 *  - Static content lives here (pages, KB, products, identity) and is NEVER
 *    touched by demo cycles.
 *  - Dynamic content (CRM rows, orders, etc.) is owned by `seed_module_demo`
 *    and registered in `demo_run_items` for safe teardown.
 *
 * Email is intentionally OFF in this template — no transactional or Gmail
 * connectors are required. Outbound communication skills run at
 * trust_level='approve', so agents show proposed sends in the approval queue
 * instead of firing real emails.
 */
import type { StarterTemplate } from './types';

export const demoCompanyTemplate: StarterTemplate = {
  id: 'demo-company',
  name: 'Demo Company',
  description: 'Public demo stage for FlowWink. Static set + hourly reset/seed of dynamic data so visitors can watch FlowPilot operate a live business.',
  category: 'platform',
  icon: 'PlayCircle',
  tagline: 'A working business you can poke at — resets every hour.',
  aiChatPosition: 'Demo concierge — explains what FlowPilot is doing in real time',
  requiredModules: ['blog', 'chat', 'leads', 'deals', 'companies', 'quotes', 'invoicing', 'expenses', 'forms', 'ecommerce'],

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
            message: '⚡ Live demo — everything resets every hour. Login: demo / demo1234',
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
            title: 'Watch a business run itself.',
            subtitle: 'This site is a live FlowWink instance. FlowPilot handles leads, quotes, invoices and expenses around the clock. Sign in with demo / demo1234 and break things — we reset every hour.',
            backgroundType: 'color',
            heightMode: 'auto',
            contentAlignment: 'center',
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
          id: 'text-demo',
          type: 'text',
          data: {
            content: { type: 'doc', content: [
              { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'How this demo works' }] },
              { type: 'paragraph', content: [{ type: 'text', text: 'Every hour a cron job calls reset_module_data to wipe the dynamic data this demo produced, then seed_module_demo re-stages a fresh scenario across CRM, quotes, invoices and expenses. Static content (pages, KB, products) is never touched.' }] },
              { type: 'paragraph', content: [{ type: 'text', text: 'Email is disabled. Outbound communication skills are set to approve, so agents propose sends in the approval queue instead of firing real messages.' }] },
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
      ],
    },
  ],

  products: [
    {
      name: 'FlowWink Pilot Tee',
      description: 'Soft cotton tee with the FlowPilot logo. Limited demo run.',
      price_cents: 29900,
      currency: 'SEK',
      type: 'one_time',
      image_url: 'https://images.unsplash.com/photo-1521572163474-6864f9cf17ab?w=800&q=80',
      is_active: true,
      stock: { quantity_on_hand: 50, reorder_point: 10 },
    },
    {
      name: 'Operator Hoodie',
      description: 'Heavyweight hoodie for the autonomous operator on duty.',
      price_cents: 79900,
      currency: 'SEK',
      type: 'one_time',
      image_url: 'https://images.unsplash.com/photo-1556821840-3a63f95609a7?w=800&q=80',
      is_active: true,
      stock: { quantity_on_hand: 30, reorder_point: 5 },
    },
    {
      name: 'Claw Mug',
      description: 'Ceramic mug. Holds 350 ml of fuel for late-night agent runs.',
      price_cents: 14900,
      currency: 'SEK',
      type: 'one_time',
      image_url: 'https://images.unsplash.com/photo-1514228742587-6b1558fcca3d?w=800&q=80',
      is_active: true,
      stock: { quantity_on_hand: 100, reorder_point: 20 },
    },
    {
      name: 'Agent Notebook',
      description: 'Dotted-grid notebook for sketching skill graphs and event flows.',
      price_cents: 19900,
      currency: 'SEK',
      type: 'one_time',
      image_url: 'https://images.unsplash.com/photo-1531346878377-a5be20888e57?w=800&q=80',
      is_active: true,
      stock: { quantity_on_hand: 80, reorder_point: 15 },
    },
    {
      name: 'Sticker Pack',
      description: 'Six vinyl stickers — FlowPilot, Hermes, OpenClaw and friends.',
      price_cents: 6900,
      currency: 'SEK',
      type: 'one_time',
      image_url: 'https://images.unsplash.com/photo-1612548403247-aa2873e9422d?w=800&q=80',
      is_active: true,
      stock: { quantity_on_hand: 200, reorder_point: 30 },
    },
    {
      name: 'Tote Bag',
      description: 'Canvas tote with subtle FlowWink monogram. Holds a laptop and a mug.',
      price_cents: 24900,
      currency: 'SEK',
      type: 'one_time',
      image_url: 'https://images.unsplash.com/photo-1597481499750-3e6b22637e12?w=800&q=80',
      is_active: true,
      stock: { quantity_on_hand: 60, reorder_point: 10 },
    },
  ],


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
    articleSchemaEnabled: false,
    sitemapEnabled: true,
    llmsTxtEnabled: true,
    llmsFullTxtEnabled: true,
  },
  cookieBannerSettings: { enabled: false },
  siteSettings: { homepageSlug: 'home' },
};
