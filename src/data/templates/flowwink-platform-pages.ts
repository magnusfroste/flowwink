/**
 * FlowWink Platform Template — Platform story pages
 *
 * These pages extend the flowwink-platform template with the product story:
 *   /platform      → Business Operating System: one kernel, three shells, CMS · CRM · ERP
 *   /processes     → Hub over the 14 documented end-to-end business processes
 *   /process-*     → Five deep-dive process pages (the ones buyers compare on)
 *   /mcp           → MCP gateway, 500+ skills, bring-your-own-agent
 *   /use-cases     → Industry hub linking to the For-<industry> pages
 *
 * Content is derived from docs/processes/*.md and docs/architecture/*.md.
 * Keep those docs and these pages in sync when a process changes.
 */
import type { TemplatePage } from './types';

const doc = (...paragraphs: string[]) => ({
  type: 'doc',
  content: paragraphs.map((text) => ({
    type: 'paragraph',
    content: [{ type: 'text', text }],
  })),
});

// ─────────────────────────────────────────────────────────────
// Shared factory for the five process deep-dive pages
// ─────────────────────────────────────────────────────────────
interface ProcessPageInput {
  slug: string;
  title: string;
  eyebrow: string;
  heroTitle: string;
  heroSubtitle: string;
  seoTitle: string;
  seoDescription: string;
  stats: { value: string; label: string }[];
  steps: { title: string; description: string; icon: string }[];
  modules: { icon: string; title: string; description: string }[];
  agentCoverage: string;
  humanCoverage: string;
  heroImage: string;
}

function processPage(p: ProcessPageInput): TemplatePage {
  return {
    title: p.title,
    slug: p.slug,
    showInMenu: false,
    meta: {
      seoTitle: p.seoTitle,
      description: p.seoDescription,
      showTitle: false,
      titleAlignment: 'center',
    },
    blocks: [
      {
        id: `${p.slug}-hero`,
        type: 'hero',
        data: {
          eyebrow: p.eyebrow,
          title: p.heroTitle,
          subtitle: p.heroSubtitle,
          backgroundType: 'image',
          backgroundImage: p.heroImage,
          overlayOpacity: 65,
          heightMode: '60vh',
          contentAlignment: 'center',
          titleAnimation: 'fade-in',
          primaryButton: { text: 'All processes', url: '/processes' },
          secondaryButton: { text: 'Ask FlowPilot', url: `#${p.slug}-chat` },
        },
      },
      {
        id: `${p.slug}-stats`,
        type: 'stats',
        data: {
          animated: true,
          animationStyle: 'count-up',
          stats: p.stats.map((s, i) => ({ id: `${p.slug}-s${i}`, value: s.value, label: s.label })),
        },
      },
      {
        id: `${p.slug}-timeline`,
        type: 'timeline',
        data: {
          title: 'The flow, end to end',
          subtitle: 'Every step is a skill. Every skill is callable by a human, by FlowPilot, or by an external agent.',
          variant: 'alternating',
          staggeredReveal: true,
          steps: p.steps.map((s, i) => ({ id: `${p.slug}-t${i}`, ...s })),
        },
      },
      {
        id: `${p.slug}-modules`,
        type: 'features',
        data: {
          title: 'Modules involved',
          subtitle: 'No integrations, no sync jobs — the same database, the same audit trail.',
          features: p.modules.map((m, i) => ({ id: `${p.slug}-m${i}`, ...m })),
          columns: 3,
          variant: 'cards',
        },
      },
      {
        id: `${p.slug}-split`,
        type: 'two-column',
        data: {
          eyebrow: 'WHO DOES WHAT',
          title: 'Autonomy is a dial, not a switch',
          content: doc(...p.agentCoverage.split('\n\n')),
          secondaryContent: doc(...p.humanCoverage.split('\n\n')),
          layout: 'text-text',
        },
      },
      {
        id: `${p.slug}-chat`,
        type: 'chat-launcher',
        data: {
          title: `Ask about ${p.title.toLowerCase()}`,
          subtitle: 'FlowPilot has read the process documentation for this flow. Ask it how a step works, or what it would do in your business.',
          placeholder: `How does ${p.title.toLowerCase()} work in FlowWink?`,
          showQuickActions: true,
          quickActionCount: 3,
          variant: 'hero-integrated',
        },
      },
      {
        id: `${p.slug}-links`,
        type: 'quick-links',
        data: {
          heading: 'Continue exploring',
          links: [
            { id: `${p.slug}-l1`, label: 'All 14 processes', url: '/processes' },
            { id: `${p.slug}-l2`, label: 'The platform', url: '/platform' },
            { id: `${p.slug}-l3`, label: 'Skills & MCP', url: '/mcp' },
          ],
          variant: 'dark',
          layout: 'split',
        },
      },
    ],
  };
}

// ─────────────────────────────────────────────────────────────
// PLATFORM — one kernel, three shells
// ─────────────────────────────────────────────────────────────
const platformPage: TemplatePage = {
  title: 'Platform',
  slug: 'platform',
  menu_order: 2,
  showInMenu: true,
  meta: {
    seoTitle: 'The Platform — CMS, CRM and ERP on One Kernel | FlowWink',
    description: 'FlowWink is a Business Operating System: one kernel of modules, tables and skills, reached through three shells — admin UI, chat and MCP. CMS, CRM and ERP in one engine.',
    showTitle: false,
    titleAlignment: 'center',
  },
  blocks: [
    {
      id: 'platform-hero',
      type: 'hero',
      data: {
        eyebrow: 'THE BUSINESS OPERATING SYSTEM',
        title: 'One Kernel. Three Shells. Every Business Process.',
        subtitle: 'Most companies run a CMS, a CRM and an ERP — three databases, two integrations and a person in the middle. FlowWink runs all three on one kernel: shared tables, shared permissions, shared audit trail, and one skill surface every human and every agent uses.',
        backgroundType: 'image',
        backgroundImage: '/templates/hero/ai-dark.jpg',
        heightMode: '80vh',
        contentAlignment: 'center',
        overlayOpacity: 65,
        titleAnimation: 'slide-up',
        primaryButton: { text: 'See the processes', url: '/processes' },
        secondaryButton: { text: 'Skills & MCP', url: '/mcp' },
      },
    },
    { id: 'platform-divider', type: 'section-divider', data: { shape: 'wave', height: 'md' } },
    {
      id: 'platform-stats',
      type: 'stats',
      data: {
        stats: [
          { id: 'pf1', value: '68', label: 'Modules' },
          { id: 'pf2', value: '14', label: 'Documented end-to-end processes' },
          { id: 'pf3', value: '500+', label: 'Skills, all MCP-exposed' },
          { id: 'pf4', value: '3', label: 'Shells over one kernel' },
        ],
      },
    },
    {
      id: 'platform-shells',
      type: 'bento-grid',
      data: {
        eyebrow: 'ARCHITECTURE',
        title: 'The kernel is the product. The interfaces are just doors.',
        subtitle: 'Modules, tables, row-level security, the event bus and the skill registry make up the kernel. Everything else is a way of talking to it — and every door reaches exactly the same capability.',
        columns: 3,
        variant: 'glass',
        gap: 'md',
        staggeredReveal: true,
        items: [
          { id: 'psh-kernel', title: 'The Kernel', description: 'Modules, database tables, row-level security, the event bus, automations and the skill registry. Business logic lives here — in the database and in the skills — never in a screen. Turn a module on and its tables, policies, admin UI and skills all arrive together.', icon: 'Cpu', span: 'large', accentColor: '#6366F1' },
          { id: 'psh-admin', title: 'Shell 1 — Admin UI', description: 'The visual shell. Lists, forms, kanban boards, ledgers and dashboards for people who want to see and choose.', icon: 'LayoutDashboard', accentColor: '#3B82F6' },
          { id: 'psh-chat', title: 'Shell 2 — FlowChat', description: 'The conversational shell. Natural language in, the right skill out. Faster than clicking when you already know what you want.', icon: 'MessageSquare', accentColor: '#14B8A6' },
          { id: 'psh-mcp', title: 'Shell 3 — MCP', description: 'The machine shell. Strict JSON tool calls over Streamable HTTP so Claude, Cursor, OpenClaw or your own agent operate the business with the same rights a colleague has — and the same audit trail.', icon: 'Network', span: 'wide', accentColor: '#F97316' },
          { id: 'psh-rls', title: 'One Permission Model', description: 'Roles and row-level security are enforced in the database, not in the frontend. A skill called from chat, from MCP or from a button obeys exactly the same rules — an agent can never see more than the person or service it acts for.', icon: 'ShieldCheck', span: 'wide', accentColor: '#10B981' },
          { id: 'psh-audit', title: 'One Audit Trail', description: 'Every skill execution — human, FlowPilot or external — lands in the same event log with actor, arguments and outcome. Sensitive operations stage for approval before they touch the ledger.', icon: 'ScrollText', accentColor: '#8B5CF6' },
        ],
      },
    },
    {
      id: 'platform-three-layers',
      type: 'two-column',
      data: {
        eyebrow: 'CMS · CRM · ERP',
        title: 'Three products that were never meant to be three products',
        content: doc(...('A visitor reads a page, fills in a form, becomes a lead, gets qualified, receives a quote, signs it, gets an invoice, pays it, and the payment lands in the general ledger.\n\nIn a normal stack that story crosses three vendors and two integrations, and breaks at every seam. In FlowWink it never leaves the database. The page, the lead, the quote, the invoice and the journal entry are rows in one system with one identity model.\n\nThat is what makes autonomy possible: an operator can only run a process end to end if the process is actually end to end.').split('\n\n')),
        secondaryContent: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'bold' }], text: 'Always included' }] }, { type: 'bulletList', content: [{ type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'CMS with blocks, blog and knowledge base' }] }] }, { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'CRM with leads, companies and deals' }] }] }, { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'The ERP core you switch on as you grow' }] }] }, { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'FlowPilot, or your own agent over MCP' }] }] }, { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Self-hosted, single-tenant, open source' }] }] }] }] },
        layout: 'text-text',
      },
    },
    {
      id: 'platform-modules',
      type: 'features',
      data: {
        title: 'Modules are the unit of the system',
        subtitle: 'Every module adds one clear capability, can be switched off, describes itself to the agent, and ships its own tables, policies, admin UI and skills.',
        features: [
          { id: 'pm-toggle', icon: 'ToggleRight', title: 'Toggleable', description: 'Enable only what the business needs. A disabled module hides its UI and withdraws its skills from every shell — including MCP.' },
          { id: 'pm-contract', icon: 'FileCode2', title: 'Contract-bound', description: 'Cross-module data exchange runs through typed contracts, so modules compose instead of coupling.' },
          { id: 'pm-selfdesc', icon: 'BookOpen', title: 'Self-describing', description: 'Each module and skill carries the metadata an agent needs to pick it correctly. No hardcoded routing anywhere in the system.' },
          { id: 'pm-rls', icon: 'Lock', title: 'Secure by construction', description: 'Tables ship with row-level security and explicit grants from the first migration. There is no "we will add permissions later" state.' },
          { id: 'pm-demo', icon: 'Sparkles', title: 'Demo-seedable', description: 'Any module can seed realistic demo data and reset it, so you can watch a full process run before putting real data in.' },
          { id: 'pm-docs', icon: 'FileText', title: 'Documented automatically', description: 'Module documentation, the skill catalogue and the parity scorecard are generated from the code, so what you read is what runs.' },
        ],
        columns: 3,
        variant: 'cards',
      },
    },
    {
      id: 'platform-deploy',
      type: 'two-column',
      data: {
        eyebrow: 'HOW IT RUNS',
        title: 'Self-hosted, single-tenant, yours',
        content: doc(...('Every FlowWink deployment belongs to one business. Your database, your storage, your model keys, your domain. Open source under MIT — clone it, read it, fork it, run it forever without asking anyone.\n\nA site is four layers that deploy together: the schema, the skill registry, the edge functions and the frontend. Bring your own AI provider — OpenAI, Google Gemini or a local model behind an OpenAI-compatible endpoint. Nothing about the platform assumes a specific vendor.').split('\n\n')),
        secondaryContent: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'bold' }], text: 'Always included' }] }, { type: 'bulletList', content: [{ type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'CMS with blocks, blog and knowledge base' }] }] }, { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'CRM with leads, companies and deals' }] }] }, { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'The ERP core you switch on as you grow' }] }] }, { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'FlowPilot, or your own agent over MCP' }] }] }, { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Self-hosted, single-tenant, open source' }] }] }] }] },
        layout: 'text-text',
      },
    },
    {
      id: 'platform-links',
      type: 'quick-links',
      data: {
        heading: 'Go deeper',
        links: [
          { id: 'plk1', label: 'The 14 processes', url: '/processes' },
          { id: 'plk2', label: 'FlowPilot, the operator', url: '/flowpilot' },
          { id: 'plk3', label: 'Skills & MCP', url: '/mcp' },
          { id: 'plk4', label: 'Industry use cases', url: '/use-cases' },
        ],
        variant: 'dark',
        layout: 'split',
      },
    },
    {
      id: 'platform-cta',
      type: 'cta',
      data: {
        title: 'One system. Every process. An operator on top.',
        subtitle: 'Run it yourself for free, or let us host it.',
        buttonText: 'Self-Host Free',
        buttonUrl: 'https://github.com/magnusfroste/flowwink',
        secondaryButtonText: 'See the processes',
        secondaryButtonUrl: '/processes',
        gradient: true,
      },
    },
  ],
};

// ─────────────────────────────────────────────────────────────
// PROCESSES — the hub
// ─────────────────────────────────────────────────────────────
const processesPage: TemplatePage = {
  title: 'Processes',
  slug: 'processes',
  menu_order: 3,
  showInMenu: true,
  meta: {
    seoTitle: '14 End-to-End Business Processes | FlowWink',
    description: 'Lead-to-customer, quote-to-cash, order-to-delivery, procure-to-pay, record-to-report and nine more — documented, implemented and agent-operable end to end in FlowWink.',
    showTitle: false,
    titleAlignment: 'center',
  },
  blocks: [
    {
      id: 'processes-hero',
      type: 'hero',
      data: {
        eyebrow: 'WHAT THE SYSTEM ACTUALLY DOES',
        title: 'Fourteen Processes, Documented End to End',
        subtitle: 'Software is not a feature list — it is the set of business processes it can carry from first touch to final entry. These are ours, each one documented, implemented across modules, and callable step by step by a human or an agent.',
        backgroundType: 'image',
        backgroundImage: '/templates/hero/tech-abstract.jpg',
        overlayOpacity: 65,
        heightMode: '80vh',
        contentAlignment: 'center',
        titleAnimation: 'slide-up',
        primaryButton: { text: 'Lead-to-Customer', url: '/process-lead-to-customer' },
        secondaryButton: { text: 'Quote-to-Cash', url: '/process-quote-to-cash' },
      },
    },
    { id: 'processes-divider', type: 'section-divider', data: { shape: 'wave', height: 'md' } },
    {
      id: 'processes-core',
      type: 'bento-grid',
      data: {
        eyebrow: 'THE FIVE THAT DECIDE A PURCHASE',
        title: 'The core money flows',
        subtitle: 'These are the processes buyers compare vendors on. Each has its own deep dive.',
        columns: 3,
        variant: 'glass',
        gap: 'md',
        staggeredReveal: true,
        items: [
          { id: 'pc-l2c', title: 'Lead-to-Customer', description: 'Form or chat capture, visitor intent scoring, company enrichment, lead qualification, nurture sequencing, deal conversion and stale-deal detection — with inbound email resolved to the right lead automatically.', icon: 'UserPlus', span: 'large', accentColor: '#3B82F6' },
          { id: 'pc-q2c', title: 'Quote-to-Cash', description: 'Quote with approval threshold, e-signature, automatic draft invoice on accept, payment, dunning and the journal entry — one unbroken chain.', icon: 'FilePen', accentColor: '#14B8A6' },
          { id: 'pc-o2d', title: 'Order-to-Delivery', description: 'Order intake, stock reservation, pick, pack, ship, partial fulfilment per line, tracking links and customer notifications.', icon: 'Truck', accentColor: '#F59E0B' },
          { id: 'pc-p2p', title: 'Procure-to-Pay', description: 'Reorder detection, purchase orders, goods receipt, three-way matching, vendor invoices, employee expenses with receipt scanning, and payment.', icon: 'ShoppingCart', span: 'wide', accentColor: '#F97316' },
          { id: 'pc-r2r', title: 'Record-to-Report', description: 'Double-entry bookkeeping on a pluggable chart of accounts (BAS 2024, IFRS, US GAAP), bank and Stripe reconciliation, period lock, VAT return and statutory export.', icon: 'Calculator', span: 'wide', accentColor: '#8B5CF6' },
        ],
      },
    },
    {
      id: 'processes-all',
      type: 'features',
      data: {
        title: 'The full catalogue',
        subtitle: 'Fourteen processes, each with a documented step-by-step flow, the modules it touches, and exactly which steps a human, FlowPilot or an external agent can perform.',
        features: [
          { id: 'pa-l2c', icon: 'UserPlus', title: 'Lead-to-Customer', description: 'Capture, enrich, score, nurture and convert inbound demand into a deal.' },
          { id: 'pa-q2c', icon: 'FilePen', title: 'Quote-to-Cash', description: 'Offer, signature, invoice, payment, dunning and booking — money in the bank.' },
          { id: 'pa-o2d', icon: 'Truck', title: 'Order-to-Delivery', description: 'Order to picked, packed, shipped and delivered with SLA supervision.' },
          { id: 'pa-p2p', icon: 'ShoppingCart', title: 'Procure-to-Pay', description: 'Need to purchase order to goods receipt to matched vendor invoice to payment.' },
          { id: 'pa-r2r', icon: 'Calculator', title: 'Record-to-Report', description: 'Every transaction into the ledger, reconciled, locked and reported.' },
          { id: 'pa-s2r', icon: 'LifeBuoy', title: 'Support-to-Resolution', description: 'Ticket intake from mail, chat and portal through triage, SLA and resolution.' },
          { id: 'pa-h2r', icon: 'UserCog', title: 'Hire-to-Retire', description: 'Job post, application, hire, contract, onboarding, payroll and offboarding.' },
          { id: 'pa-sub', icon: 'RefreshCw', title: 'Subscribe-to-Renew', description: 'Recurring billing, upgrades, dunning, churn signals and renewal.' },
          { id: 'pa-r2f', icon: 'Undo2', title: 'Return-to-Refund', description: 'RMA intake, inspection with restocking fee, partial refunds and restock.' },
          { id: 'pa-p2prod', icon: 'Factory', title: 'Plan-to-Produce', description: 'Bill of materials, manufacturing order, shop-floor work orders and variance.' },
          { id: 'pa-a2r', icon: 'Building2', title: 'Acquire-to-Retire', description: 'Fixed assets from acquisition through depreciation to disposal.' },
          { id: 'pa-c2c', icon: 'Megaphone', title: 'Content-to-Conversion', description: 'Content planning, publishing, SEO/AEO and attribution back to revenue.' },
          { id: 'pa-b2m', icon: 'CalendarCheck', title: 'Book-to-Meet', description: 'Service selection, availability, booking, confirmation and reminders.' },
          { id: 'pa-r2a', icon: 'Presentation', title: 'Register-to-Attend', description: 'Webinar registration, reminder sequence, attendance and follow-up leads.' },
        ],
        columns: 3,
        variant: 'cards',
      },
    },
    {
      id: 'processes-coverage',
      type: 'two-column',
      data: {
        eyebrow: 'HOW WE DOCUMENT THEM',
        title: 'Every step says who can do it',
        content: doc(...('Each process document lists the modules involved, the step-by-step flow, the state machines behind the records, and a coverage table marking every step as manual, FlowPilot-operable or reachable by an external agent over MCP.\n\nIt also lists the known gaps. We would rather tell you what is not automated yet than let you discover it in month three.').split('\n\n')),
        secondaryContent: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'bold' }], text: 'Always included' }] }, { type: 'bulletList', content: [{ type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'CMS with blocks, blog and knowledge base' }] }] }, { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'CRM with leads, companies and deals' }] }] }, { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'The ERP core you switch on as you grow' }] }] }, { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'FlowPilot, or your own agent over MCP' }] }] }, { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Self-hosted, single-tenant, open source' }] }] }] }] },
        layout: 'text-text',
      },
    },
    {
      id: 'processes-chat',
      type: 'chat-launcher',
      data: {
        title: 'Ask about your process',
        subtitle: 'Describe how your business works today and FlowPilot will map it onto the processes above — including the parts we do not automate yet.',
        placeholder: 'We sell services and invoice monthly per consultant — how would that run?',
        showQuickActions: true,
        quickActionCount: 4,
        variant: 'hero-integrated',
      },
    },
    {
      id: 'processes-cta',
      type: 'cta',
      data: {
        title: 'See a process run on your own data',
        subtitle: 'Seed demo data, watch the flow end to end, then reset it.',
        buttonText: 'Self-Host Free',
        buttonUrl: 'https://github.com/magnusfroste/flowwink',
        secondaryButtonText: 'Industry use cases',
        secondaryButtonUrl: '/use-cases',
        gradient: true,
      },
    },
  ],
};

// ─────────────────────────────────────────────────────────────
// MCP & SKILLS
// ─────────────────────────────────────────────────────────────
const mcpPage: TemplatePage = {
  title: 'Skills & MCP',
  slug: 'mcp',
  menu_order: 5,
  showInMenu: true,
  meta: {
    seoTitle: 'Skills & MCP — 500+ Agent-Callable Business Operations | FlowWink',
    description: 'Every FlowWink capability is a skill, and every skill is exposed over the Model Context Protocol. Connect Claude, Cursor, OpenClaw or your own agent and let it run the business.',
    showTitle: false,
    titleAlignment: 'center',
  },
  blocks: [
    {
      id: 'mcp-hero',
      type: 'hero',
      data: {
        eyebrow: 'BRING YOUR OWN AGENT',
        title: '500+ Skills. One Protocol. Any Agent.',
        subtitle: 'Every operation in FlowWink — create a quote, book a receipt, ship a picking, publish an article, refund a return — is a self-describing skill. All of them are exposed over MCP, so your agent is not integrated with the business. It operates it.',
        backgroundType: 'image',
        backgroundImage: '/templates/hero/ai-dark.jpg',
        heightMode: '80vh',
        contentAlignment: 'center',
        overlayOpacity: 65,
        titleAnimation: 'fade-in',
        primaryButton: { text: 'Read the docs', url: '/docs' },
        secondaryButton: { text: 'Ask FlowPilot', url: '#mcp-chat' },
      },
    },
    { id: 'mcp-divider', type: 'section-divider', data: { shape: 'wave', height: 'md' } },
    {
      id: 'mcp-stats',
      type: 'stats',
      data: {
        stats: [
          { id: 'mc1', value: '500+', label: 'MCP-exposed skills' },
          { id: 'mc2', value: '2', label: 'Tools in dispatch mode' },
          { id: 'mc3', value: 'HTTP', label: 'Streamable transport' },
          { id: 'mc4', value: 'RLS', label: 'Same permissions as a human' },
        ],
      },
    },
    {
      id: 'mcp-bento',
      type: 'bento-grid',
      data: {
        eyebrow: 'THE GATEWAY',
        title: 'Built for agents that have to stay in context',
        subtitle: 'Five hundred tools would drown any client. The gateway offers three connection profiles so an agent gets exactly the surface it needs.',
        columns: 3,
        variant: 'glass',
        gap: 'md',
        staggeredReveal: true,
        items: [
          { id: 'mg-dispatch', title: 'Dispatch mode — three tools', description: 'The generalist profile. The agent gets search_skills to rank capabilities by intent, and execute_skill to run one. Unlimited reach, two schemas in context. This is how an autonomous operator should connect.', icon: 'Compass', span: 'large', accentColor: '#6366F1' },
          { id: 'mg-groups', title: 'Connection groups', description: 'The specialist profile. Ask for crm and commerce and the agent sees only those tools — roughly eight schemas instead of five hundred.', icon: 'Filter', accentColor: '#3B82F6' },
          { id: 'mg-full', title: 'Full surface', description: 'Every skill as its own tool, for clients that index tools themselves or for narrow scripted automation.', icon: 'List', accentColor: '#14B8A6' },
          { id: 'mg-relevance', title: 'Skill Relevance Engine', description: 'A platform primitive, not an agent trick: skills are ranked against the current intent using their own metadata plus recent usage. The same engine narrows the surface for the built-in operator and for external agents — so capability discovery behaves identically on both sides of the boundary.', icon: 'Radar', span: 'wide', accentColor: '#F97316' },
          { id: 'mg-selfdesc', title: 'Self-describing skills', description: 'Each skill carries a description, "use when" and "not for" markers, a strict argument schema and workflow instructions. There is no keyword routing in the system — if an agent picks the wrong skill, the fix is better metadata, never a hardcoded rule.', icon: 'BookOpen', span: 'wide', accentColor: '#10B981' },
          { id: 'mg-selfcorrect', title: 'Self-correcting errors', description: 'Call a skill with a wrong argument name and the error tells the agent what it sent, what the skill declares and how to fix it — so the next turn succeeds instead of looping.', icon: 'RotateCcw', accentColor: '#8B5CF6' },
          { id: 'mg-staged', title: 'Staged operations', description: 'Skills that touch the ledger or the outside world can require an approval handshake: the agent proposes, a human approves, the agent re-invokes with the approval id. Autonomy without a blank cheque.', icon: 'ShieldCheck', accentColor: '#EC4899' },
          { id: 'mg-rest', title: 'REST fallback', description: 'The same tool surface over plain HTTP POST for clients that do not speak MCP yet, including dispatch mode and connection groups.', icon: 'Plug', accentColor: '#0EA5E9' },
        ],
      },
    },
    {
      id: 'mcp-clients',
      type: 'features',
      data: {
        title: 'Who connects',
        subtitle: 'Anything that speaks the Model Context Protocol — the transport is Streamable HTTP, so there is no local process to babysit.',
        features: [
          { id: 'mcl-flowpilot', icon: 'Bot', title: 'FlowPilot', description: 'The built-in operator. It shares the same skill registry directly in-process, and needs no gateway hop to act.' },
          { id: 'mcl-claude', icon: 'MessageSquare', title: 'Claude & Claude Desktop', description: 'Point a connector at the gateway in dispatch mode and ask for a sales report, a quote or a KB article.' },
          { id: 'mcl-cursor', icon: 'CodeXml', title: 'Cursor & coding agents', description: 'Query real business data while building, or drive test scenarios through the same interface production uses.' },
          { id: 'mcl-openclaw', icon: 'Network', title: 'External operators', description: 'Department-specific agents — a finance claw, a support claw — each connected to only its own skill group.' },
          { id: 'mcl-custom', icon: 'Terminal', title: 'Your own scripts', description: 'The REST layer exposes the identical surface for cron jobs, integrations and one-off migrations.' },
          { id: 'mcl-peers', icon: 'Share2', title: 'Peer FlowWink instances', description: 'Federation makes two deployments talk agent-to-agent, so a supplier and a customer can transact without a portal in between.' },
        ],
        columns: 3,
        variant: 'cards',
      },
    },
    {
      id: 'mcp-trust',
      type: 'two-column',
      data: {
        eyebrow: 'TRUST MODEL',
        title: 'An agent is a colleague, not a superuser',
        content: doc(...('Every skill carries a trust level. Some run silently, some notify, some stage for human approval before they execute. You move the dial per skill as confidence grows — and the dial is a runtime setting, so tightening it never requires a deploy.\n\nUnderneath, permissions are enforced by row-level security in the database. An agent acting for a customer sees that customer\'s data and nothing else, no matter what its prompt claims.').split('\n\n')),
        secondaryContent: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'bold' }], text: 'Always included' }] }, { type: 'bulletList', content: [{ type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'CMS with blocks, blog and knowledge base' }] }] }, { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'CRM with leads, companies and deals' }] }] }, { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'The ERP core you switch on as you grow' }] }] }, { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'FlowPilot, or your own agent over MCP' }] }] }, { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Self-hosted, single-tenant, open source' }] }] }] }] },
        layout: 'text-text',
      },
    },
    {
      id: 'mcp-chat',
      type: 'chat-launcher',
      data: {
        title: 'Ask the agent about the agent surface',
        subtitle: 'FlowPilot runs on the same skills it can describe. Ask what it can do, or how you would connect your own client.',
        placeholder: 'How do I connect Claude to the MCP gateway?',
        showQuickActions: true,
        quickActionCount: 4,
        variant: 'hero-integrated',
      },
    },
    {
      id: 'mcp-links',
      type: 'quick-links',
      data: {
        heading: 'Next',
        links: [
          { id: 'mlk1', label: 'FlowPilot, the built-in operator', url: '/flowpilot' },
          { id: 'mlk2', label: 'The platform', url: '/platform' },
          { id: 'mlk3', label: 'Source on GitHub', url: 'https://github.com/magnusfroste/flowwink' },
        ],
        variant: 'dark',
        layout: 'split',
      },
    },
  ],
};

// ─────────────────────────────────────────────────────────────
// USE CASES — industry hub
// ─────────────────────────────────────────────────────────────
const useCasesPage: TemplatePage = {
  title: 'Use Cases',
  slug: 'use-cases',
  menu_order: 6,
  showInMenu: true,
  meta: {
    seoTitle: 'Use Cases — FlowWink by Industry',
    description: 'How agencies, consultancies, e-commerce, service businesses and healthcare providers run their operations on FlowWink.',
    showTitle: false,
    titleAlignment: 'center',
  },
  blocks: [
    {
      id: 'usecases-hero',
      type: 'hero',
      data: {
        eyebrow: 'ONE PLATFORM, MANY SHAPES',
        title: 'Same Operating System. Different Business.',
        subtitle: 'The modules you enable and the processes you run decide what FlowWink becomes. Here is what it looks like in five industries — pick the one closest to yours.',
        backgroundType: 'image',
        backgroundImage: '/templates/hero/team-collaboration.jpg',
        overlayOpacity: 65,
        heightMode: '80vh',
        contentAlignment: 'center',
        titleAnimation: 'slide-up',
        primaryButton: { text: 'For Agencies', url: '/for-agencies' },
        secondaryButton: { text: 'For E-Commerce', url: '/for-ecommerce' },
      },
    },
    { id: 'usecases-divider', type: 'section-divider', data: { shape: 'wave', height: 'md' } },
    {
      id: 'usecases-grid',
      type: 'bento-grid',
      data: {
        eyebrow: 'BY INDUSTRY',
        title: 'Choose your starting point',
        subtitle: 'Each page shows the modules that matter, the processes that carry the money, and what the operator takes off your desk.',
        columns: 3,
        variant: 'glass',
        gap: 'md',
        staggeredReveal: true,
        items: [
          { id: 'uc-agency', title: 'Digital Agencies', description: 'White-label client sites, multi-site content operations and autonomous client reporting. Take on more clients without more headcount.', icon: 'Palette', span: 'large', accentColor: '#6366F1' },
          { id: 'uc-consult', title: 'Consultancies', description: 'Consultant profiles, matching, project delivery, timesheets and invoicing from logged hours.', icon: 'Briefcase', accentColor: '#3B82F6' },
          { id: 'uc-ecom', title: 'E-Commerce', description: 'Catalog, orders, inventory, shipping, returns and subscriptions with an operator watching the funnel.', icon: 'ShoppingBag', accentColor: '#F59E0B' },
          { id: 'uc-service', title: 'Service Business', description: 'Bookings, field service, quotes, recurring plans and support — the calendar and the ledger in one system.', icon: 'Wrench', span: 'wide', accentColor: '#14B8A6' },
          { id: 'uc-health', title: 'Healthcare', description: 'Appointment intake, consent-aware content, documentation trails and compliance-conscious automation.', icon: 'HeartPulse', span: 'wide', accentColor: '#EC4899' },
        ],
      },
    },
    {
      id: 'usecases-links',
      type: 'quick-links',
      data: {
        heading: 'Open an industry page',
        links: [
          { id: 'uclk1', label: 'For Agencies', url: '/for-agencies' },
          { id: 'uclk2', label: 'For Consultancies', url: '/for-consultancies' },
          { id: 'uclk3', label: 'For E-Commerce', url: '/for-ecommerce' },
          { id: 'uclk4', label: 'For Service Business', url: '/for-services' },
          { id: 'uclk5', label: 'For Healthcare', url: '/for-healthcare' },
        ],
        variant: 'dark',
        layout: 'split',
      },
    },
    {
      id: 'usecases-common',
      type: 'two-column',
      data: {
        eyebrow: 'WHAT NEVER CHANGES',
        title: 'The industry decides the modules, not the architecture',
        content: doc(...('Whichever page you open, the foundation is identical: one kernel, three shells, row-level security, a documented process catalogue and an agent surface over every capability.\n\nThat is why moving between shapes is a configuration change rather than a migration. An agency that starts selling a product does not switch systems — it enables commerce.').split('\n\n')),
        secondaryContent: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'bold' }], text: 'Always included' }] }, { type: 'bulletList', content: [{ type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'CMS with blocks, blog and knowledge base' }] }] }, { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'CRM with leads, companies and deals' }] }] }, { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'The ERP core you switch on as you grow' }] }] }, { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'FlowPilot, or your own agent over MCP' }] }] }, { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Self-hosted, single-tenant, open source' }] }] }] }] },
        layout: 'text-text',
      },
    },
    {
      id: 'usecases-chat',
      type: 'chat-launcher',
      data: {
        title: 'Not sure which one you are?',
        subtitle: 'Describe your business in a sentence and FlowPilot will tell you which modules and processes it would switch on first.',
        placeholder: 'We are a 12-person agency that also resells hardware…',
        showQuickActions: true,
        quickActionCount: 4,
        variant: 'hero-integrated',
      },
    },
  ],
};

// ─────────────────────────────────────────────────────────────
// FIVE PROCESS DEEP DIVES
// ─────────────────────────────────────────────────────────────
const leadToCustomer = processPage({
  slug: 'process-lead-to-customer',
  heroImage: '/templates/hero/professional-handshake.jpg',
  title: 'Lead-to-Customer',
  eyebrow: 'PROCESS 01',
  heroTitle: 'From Anonymous Visitor to Signed Deal',
  heroSubtitle: 'Capture, enrich, score, nurture and convert — with the browsing history, the inbound email and the company data attached to the same record.',
  seoTitle: 'Lead-to-Customer Process | FlowWink',
  seoDescription: 'How FlowWink runs lead-to-customer: form and chat capture, visitor intent scoring, company enrichment, qualification, nurture sequences and deal conversion.',
  stats: [
    { value: '8', label: 'Modules involved' },
    { value: '9', label: 'Agent-operable steps' },
    { value: '24/7', label: 'Qualification cadence' },
  ],
  steps: [
    { title: 'Capture', description: 'A form submission, a chat conversation or an inbound email creates the lead. Anonymous page views collected with consent attach retroactively the moment the visitor identifies.', icon: 'Inbox' },
    { title: 'Enrich', description: 'The company behind the address is looked up and firmographics, domain and contacts are written to the company registry — so the sales conversation starts informed.', icon: 'Building2' },
    { title: 'Score', description: 'Fit and intent are scored from firmographics plus real behaviour: which pages, how often, how recently. Scores are refreshed on a schedule, not only at capture.', icon: 'Gauge' },
    { title: 'Nurture', description: 'Leads that are interested but not ready enter a sequence instead of a spreadsheet. Every send is logged against the lead.', icon: 'Mail' },
    { title: 'Convert', description: 'A qualified lead becomes a deal in the pipeline with its history intact — activities, emails, page views and scores follow the record.', icon: 'Handshake' },
    { title: 'Supervise', description: 'Deals that stop moving are surfaced automatically, and the pipeline is reviewed on a cadence rather than when someone remembers.', icon: 'Radar' },
  ],
  modules: [
    { icon: 'FileInput', title: 'Forms', description: 'Inbound capture from any page block, wired straight to the lead record.' },
    { icon: 'Footprints', title: 'Visitor Intelligence', description: 'Consent-based page-view tracking that turns into scoring signals on identification.' },
    { icon: 'Users', title: 'Leads', description: 'Lead records, stages, scoring and activity history.' },
    { icon: 'Building2', title: 'Companies', description: 'B2B registry with org numbers, hierarchy, duplicate detection and account ownership.' },
    { icon: 'Sparkles', title: 'Sales Intelligence', description: 'Prospect research, enrichment and fit analysis.' },
    { icon: 'Handshake', title: 'Deals', description: 'Pipeline stages from qualified to won or lost, with forecasting.' },
    { icon: 'Mail', title: 'Email', description: 'Inbound sync resolves senders to leads and companies; outbound sends are logged.' },
    { icon: 'Send', title: 'Newsletter', description: 'Nurture sequences for demand that is early rather than dead.' },
  ],
  agentCoverage: 'Nearly every step here is agent-operable: signal processing on capture, visitor intent scoring on a trigger and a fifteen-minute sweep, company enrichment and prospect research, lead qualification, nurture sequencing, deal management and stale-deal detection.\n\nInbound mail is classified before it lands, so newsletters and bulk mail never create noise on a sales record.',
  humanCoverage: '**A human still owns**\n\n• The judgement call on a borderline qualification\n• The first real conversation\n• Pricing and negotiation\n• Deciding what "good fit" means — the agent applies your definition, it does not invent one',
});

const quoteToCash = processPage({
  slug: 'process-quote-to-cash',
  heroImage: '/templates/hero/modern-office.jpg',
  title: 'Quote-to-Cash',
  eyebrow: 'PROCESS 02',
  heroTitle: 'From Offer to Money in the Bank',
  heroSubtitle: 'A quote that approves itself against your threshold, signs in the browser, becomes a draft invoice on acceptance, chases its own payment and lands in the ledger.',
  seoTitle: 'Quote-to-Cash Process | FlowWink',
  seoDescription: 'Quote approval thresholds, e-signature, automatic invoicing on acceptance, payment, dunning and double-entry booking — one unbroken chain in FlowWink.',
  stats: [
    { value: '9', label: 'Modules involved' },
    { value: '0', label: 'Handoffs between systems' },
    { value: '4', label: 'Dunning stages' },
  ],
  steps: [
    { title: 'Build the quote', description: 'Line items recalculate totals as you go, with price lists and contract terms applied automatically. Above your approval threshold it routes for sign-off before it can be sent.', icon: 'FilePen' },
    { title: 'Send and track', description: 'Sending mints a public link, snapshots a version and stamps the record. Opening it is logged, and an expiry reminder goes out before the offer lapses.', icon: 'Send' },
    { title: 'Sign', description: 'The customer signs on a public page. Name, drawn signature, IP, user agent and a content hash are stored as evidence — signing after expiry is refused outright.', icon: 'PenLine' },
    { title: 'Invoice', description: 'Acceptance creates a linked draft invoice from the quote lines and notifies both sides. Pay-now becomes available immediately.', icon: 'Receipt' },
    { title: 'Collect', description: 'Payments add up against the invoice, so a deposit leaves it partially paid and still open. Overdue invoices enter a four-stage dunning sequence on their own.', icon: 'CreditCard' },
    { title: 'Book', description: 'The settled invoice posts to the general ledger against the chart of accounts, and bank or Stripe reconciliation matches the money to the entry.', icon: 'Calculator' },
  ],
  modules: [
    { icon: 'FilePen', title: 'Quotes', description: 'Offers with versioning, approval thresholds and e-signature.' },
    { icon: 'Handshake', title: 'Deals', description: 'The won deal that triggers delivery and project start.' },
    { icon: 'SquareKanban', title: 'Projects', description: 'Delivery work, tasks and profitability per engagement.' },
    { icon: 'Clock', title: 'Timesheets', description: 'Logged hours that can be invoiced directly.' },
    { icon: 'Receipt', title: 'Invoicing', description: 'Invoice generation, PDF, email and dunning automation.' },
    { icon: 'Calculator', title: 'Accounting', description: 'Booking against the chart of accounts with period lock.' },
    { icon: 'GitMerge', title: 'Reconciliation', description: 'Stripe payouts and bank files matched against receivables.' },
    { icon: 'FileText', title: 'Contracts', description: 'The agreements that govern price and terms.' },
    { icon: 'Building2', title: 'Company Portal', description: 'B2B contacts approve quotes and pay invoices for their own company, role-gated.' },
  ],
  agentCoverage: 'The operator can draft the quote from a deal, request approval, send it, chase the signature, generate the invoice, run dunning and post the journal entry. Ledger-touching steps are staged: the agent proposes, a human approves, the agent completes.\n\nEvery state transition writes evidence — who moved it, when, and what the move did.',
  humanCoverage: '**A human still owns**\n\n• The price and the terms\n• Approval above the threshold you set\n• Writing off or disputing a receivable\n• Closing the period',
});

const orderToDelivery = processPage({
  slug: 'process-order-to-delivery',
  heroImage: '/templates/hero/ecommerce.jpg',
  title: 'Order-to-Delivery',
  eyebrow: 'PROCESS 03',
  heroTitle: 'From Checkout to Doorstep',
  heroSubtitle: 'Order intake, stock reservation, picking, packing, shipping and tracking — with partial fulfilment per line and an SLA watching every manual step.',
  seoTitle: 'Order-to-Delivery Process | FlowWink',
  seoDescription: 'How FlowWink runs order fulfilment: stock reservation, pick and pack, partial line fulfilment, carrier tracking and customer notifications.',
  stats: [
    { value: '6', label: 'Modules involved' },
    { value: 'Per line', label: 'Partial fulfilment' },
    { value: 'Auto', label: 'Stock reservation' },
  ],
  steps: [
    { title: 'Intake', description: 'Orders arrive from the storefront, the point of sale or an agent placing them on a customer\'s behalf — all into the same order record.', icon: 'ShoppingCart' },
    { title: 'Reserve', description: 'Stock is checked and reserved across warehouses as the order is confirmed, so two orders never promise the same unit.', icon: 'Boxes' },
    { title: 'Pick', description: 'A picking list is allocated and confirmed line by line. Movements post to inventory as they happen, not at the end of the day.', icon: 'ClipboardList' },
    { title: 'Ship', description: 'The shipment is created with a carrier and tracking number, and the tracking link is clickable everywhere the order appears.', icon: 'Truck' },
    { title: 'Notify', description: 'Confirmation and delivery notifications go out automatically, and abandoned carts get their own recovery flow.', icon: 'Bell' },
    { title: 'Supervise', description: 'Orders that stall in a manual step breach an SLA and surface in the monitor with a deep link straight to the record.', icon: 'AlarmClock' },
  ],
  modules: [
    { icon: 'ShoppingBag', title: 'Products & Orders', description: 'Catalog, pricing, order lifecycle and cart recovery.' },
    { icon: 'Boxes', title: 'Inventory', description: 'Reservation, picking, adjustments and multi-warehouse stock.' },
    { icon: 'Store', title: 'POS', description: 'In-store sales feeding the same fulfilment pipe.' },
    { icon: 'Truck', title: 'Shipping', description: 'Carriers, tracking templates and shipment records.' },
    { icon: 'AlarmClock', title: 'SLA', description: 'Monitors that the manual steps happen on time.' },
    { icon: 'FileText', title: 'Documents', description: 'Delivery notes and shipping labels archived on the order.' },
  ],
  agentCoverage: 'Stock checks, reservations, allocation, pick confirmation, shipping, per-line fulfilment and status updates are all skills — callable by the built-in operator and by an external agent over MCP, which is what makes a warehouse client or a 3PL integration possible without a bespoke API.',
  humanCoverage: '**A human still owns**\n\n• The physical pick and pack\n• Exceptions: damage, shortfall, address problems\n• Carrier choice when it is a judgement call\n• Anything the SLA escalates',
});

const procureToPay = processPage({
  slug: 'process-procure-to-pay',
  heroImage: '/templates/hero/tech-future.jpg',
  title: 'Procure-to-Pay',
  eyebrow: 'PROCESS 04',
  heroTitle: 'From Need to Payment, Matched Three Ways',
  heroSubtitle: 'Reorder detection, purchase orders with revision history, goods receipt, three-way matching against the vendor invoice — plus employee expenses with receipt scanning.',
  seoTitle: 'Procure-to-Pay Process | FlowWink',
  seoDescription: 'Purchase orders, goods receipt, three-way matching, vendor invoices and employee expense reimbursement with AI receipt scanning and automatic VAT.',
  stats: [
    { value: '6', label: 'Modules involved' },
    { value: '3-way', label: 'Invoice matching' },
    { value: 'OCR', label: 'Receipt capture' },
  ],
  steps: [
    { title: 'Detect the need', description: 'Reorder points and material requirements surface purchase candidates before someone notices an empty shelf.', icon: 'Radar' },
    { title: 'Raise the order', description: 'A purchase order is created against a vendor with agreed terms, dispatched by email, and every revision is kept.', icon: 'FilePen' },
    { title: 'Receive', description: 'Goods receipt records what actually arrived — including partial deliveries — and updates stock on the spot.', icon: 'PackageCheck' },
    { title: 'Match', description: 'The vendor invoice is matched three ways against the order and the receipt. Discrepancies are held rather than paid.', icon: 'GitCompare' },
    { title: 'Book', description: 'The approved cost posts against accounts payable and the cost account, with input VAT split out automatically.', icon: 'Calculator' },
    { title: 'Reimburse', description: 'Employee expenses run the parallel track: photograph the receipt, VAT and category are read, the monthly report is submitted, approved, booked and paid.', icon: 'Camera' },
  ],
  modules: [
    { icon: 'ShoppingCart', title: 'Purchasing', description: 'Vendors, purchase orders, revisions and goods receipt.' },
    { icon: 'Boxes', title: 'Inventory', description: 'Stock levels and reorder triggers.' },
    { icon: 'Camera', title: 'Expenses', description: 'Employee claims with receipt scanning and monthly reports.' },
    { icon: 'Receipt', title: 'Invoicing', description: 'Incoming vendor invoices on the payables side.' },
    { icon: 'Calculator', title: 'Accounting', description: 'Booking against payables and cost accounts.' },
    { icon: 'FileText', title: 'Documents', description: 'Order, delivery note and invoice PDFs kept with the transaction.' },
  ],
  agentCoverage: 'Vendor onboarding, reorder detection, purchase order creation and dispatch, revision history, goods receipt, matching and expense booking are all skills. The expense track is close to fully autonomous: the operator generates the monthly report, attaches loose receipts, and books it once approved.',
  humanCoverage: '**A human still owns**\n\n• Approving spend and the vendor relationship\n• Resolving a three-way mismatch\n• Releasing the payment\n• Anything that changes the terms',
});

const recordToReport = processPage({
  slug: 'process-record-to-report',
  heroImage: '/templates/misc/financial-analysis.jpg',
  title: 'Record-to-Report',
  eyebrow: 'PROCESS 05',
  heroTitle: 'Every Transaction, Reconciled and Reportable',
  heroSubtitle: 'Double-entry bookkeeping on a pluggable chart of accounts, automatic reconciliation of bank and card flows, period lock, VAT return and statutory export.',
  seoTitle: 'Record-to-Report Process | FlowWink',
  seoDescription: 'Double-entry accounting with BAS 2024, IFRS or US GAAP locale packs, bank and Stripe reconciliation, period lock, VAT return and SIE / SAF-T export.',
  stats: [
    { value: '3', label: 'Accounting locale packs' },
    { value: '6', label: 'Modules involved' },
    { value: 'Locked', label: 'Closed periods, enforced' },
  ],
  steps: [
    { title: 'Choose the standard', description: 'The chart of accounts arrives as a locale pack — BAS 2024, IFRS or US GAAP. The engine itself assumes no country, so the same software books correctly in different markets.', icon: 'Globe' },
    { title: 'Record', description: 'Invoices, expenses, payroll and manufacturing all post journal entries automatically from their own modules. Voucher numbers are allocated under a lock, so two entries can never collide.', icon: 'BookOpen' },
    { title: 'Reconcile', description: 'Bank files and Stripe payouts are imported and matched against receivables and the ledger, with the unmatched remainder shown rather than hidden.', icon: 'GitMerge' },
    { title: 'Review', description: 'Unbalanced entries are flagged in the journal before they become a month-end problem, and the trial balance is live rather than exported.', icon: 'Scale' },
    { title: 'Close', description: 'The period locks. Anything trying to post into a closed period is refused at the database level, not by a reminder in a checklist.', icon: 'Lock' },
    { title: 'Report', description: 'Profit and loss, balance sheet, VAT return and statutory export files — generated from the ledger, not reassembled in a spreadsheet.', icon: 'FileChartColumn' },
  ],
  modules: [
    { icon: 'Calculator', title: 'Accounting', description: 'Chart of accounts, journal entries, templates, period lock and exports.' },
    { icon: 'GitMerge', title: 'Reconciliation', description: 'Bank import, Stripe payouts and automatic matching.' },
    { icon: 'Receipt', title: 'Invoicing', description: 'Source of receivable bookings.' },
    { icon: 'Camera', title: 'Expenses', description: 'Source of payable and cost bookings.' },
    { icon: 'ChartColumn', title: 'Analytics', description: 'Financial KPI reporting on top of the ledger.' },
    { icon: 'FileText', title: 'Documents', description: 'Voucher and supporting-document archive.' },
  ],
  agentCoverage: 'The operator maintains the chart of accounts and templates, books approved expenses and invoices, runs reconciliation passes, prepares the VAT return and produces the reports. Everything that writes to the ledger is staged for approval by default — this is the one place where autonomy earns its trust slowly.',
  humanCoverage: '**A human still owns**\n\n• The accounting policy and the chart\n• Approving every ledger-touching operation until you say otherwise\n• Closing the period\n• Filing with the authority',
});

export const flowwinkPlatformExtraPages: TemplatePage[] = [
  platformPage,
  processesPage,
  mcpPage,
  useCasesPage,
  leadToCustomer,
  quoteToCash,
  orderToDelivery,
  procureToPay,
  recordToReport,
];

// `doc` is exported so future pages in this file can use rich-text columns
// without re-declaring the helper.
export { doc };
