import { logger } from '@/lib/logger';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import type { Json } from '@/integrations/supabase/types';

/**
 * Module autonomy levels determine whether an admin UI is required:
 * - 'view-required': Data flows in passively; useless without a UI to review (Forms, Leads, Orders)
 * - 'config-required': Needs visual setup/configuration (Bookings, Products, Global Elements)
 * - 'agent-capable': Fully operable via FlowPilot; admin UI is optional (Resume, Sales Intelligence)
 */
export type ModuleAutonomy = 'view-required' | 'config-required' | 'agent-capable';

export type BookingEmailProvider = 'resend' | 'composio_gmail';

export interface ModuleConfig {
  enabled: boolean;
  name: string;
  description: string;
  icon: string;
  category: 'content' | 'data' | 'communication' | 'system' | 'insights';
  core?: boolean; // Core modules cannot be disabled
  autonomy: ModuleAutonomy;
  adminUI: boolean; // Whether admin interface is shown (default: true for view/config-required)
  requiredIntegrations?: string[]; // Module won't function without these
  optionalIntegrations?: string[]; // Enhanced functionality with these
  /** Module requires at least one AI provider (openai, gemini, or local_llm) to function */
  requiresAI?: boolean;
  /** Module requires FlowPilot to be enabled — non-functional without the autonomous engine */
  requiresFlowPilot?: boolean;
  /** Module works without FlowPilot but gains proactive capabilities when enabled */
  enhancedByFlowPilot?: boolean;
  // E-commerce sandbox settings (sandboxMode is derived: auto-on when Stripe is inactive)
  sandboxAutoPayDays?: number; // 0 = instant, >0 = mark as paid after N days (for testing flows)
  // Booking-specific settings
  confirmationEmailEnabled?: boolean; // Send confirmation email on new booking
  bookingEmailProvider?: BookingEmailProvider; // Which provider to use for booking emails
}

export interface ModulesSettings {
  analytics: ModuleConfig;
  bookings: ModuleConfig;
  pages: ModuleConfig;
  blog: ModuleConfig;
  knowledgeBase: ModuleConfig;
  chat: ModuleConfig;
  liveSupport: ModuleConfig;
  newsletter: ModuleConfig;
  forms: ModuleConfig;
  leads: ModuleConfig;
  deals: ModuleConfig;
  companies: ModuleConfig;
  ecommerce: ModuleConfig;
  developer: ModuleConfig;
  /** @deprecated Merged into pages module */
  globalElements: ModuleConfig;
  mediaLibrary: ModuleConfig;
  webinars: ModuleConfig;
  salesIntelligence: ModuleConfig;
  resume: ModuleConfig;
  browserControl: ModuleConfig;
  federation: ModuleConfig;
  paidGrowth: ModuleConfig;
  companyInsights: ModuleConfig;
  flowpilot: ModuleConfig;
  
  tickets: ModuleConfig;
  siteMigration: ModuleConfig;
  composio: ModuleConfig;
  templates: ModuleConfig;
  invoicing: ModuleConfig;
  accounting: ModuleConfig;
  expenses: ModuleConfig;
  handbook: ModuleConfig;
  timesheets: ModuleConfig;
  inventory: ModuleConfig;
  purchasing: ModuleConfig;
  manufacturing: ModuleConfig;
  sla: ModuleConfig;
  contracts: ModuleConfig;
  hr: ModuleConfig;
  documents: ModuleConfig;
  projects: ModuleConfig;
  calendar: ModuleConfig;
  subscriptions: ModuleConfig;
  approvals: ModuleConfig;
  reconciliation: ModuleConfig;
  quotes: ModuleConfig;
  email: ModuleConfig;
  recruitment: ModuleConfig;
  workspaceChat: ModuleConfig;
  docs: ModuleConfig;
  customer360: ModuleConfig;
  surveys: ModuleConfig;
  fieldService: ModuleConfig;
  pos: ModuleConfig;
  pricelists: ModuleConfig;
  returns: ModuleConfig;
  fixedAssets: ModuleConfig;
  shipping: ModuleConfig;
  multiCurrency: ModuleConfig;
  payroll: ModuleConfig;
  
  wiki: ModuleConfig;
  river: ModuleConfig;
}

export const defaultModulesSettings: ModulesSettings = {
  analytics: {
    enabled: true,
    name: 'Analytics',
    description: 'Dashboard with insights on leads, deals, and newsletter performance',
    icon: 'BarChart3',
    category: 'insights',
    autonomy: 'view-required',
    adminUI: true,
    optionalIntegrations: ['google_analytics', 'meta_pixel'],
  },
  bookings: {
    enabled: false,
    name: 'Bookings',
    description: 'Appointment scheduling with calendar view and email confirmations',
    icon: 'CalendarDays',
    category: 'data',
    autonomy: 'config-required',
    adminUI: true,
    optionalIntegrations: ['resend', 'stripe'],
    confirmationEmailEnabled: false,
    bookingEmailProvider: 'resend',
  },
  pages: {
    enabled: true,
    name: 'Website',
    description: 'Pages, header, footer, branding and navigation — the complete visual layer',
    icon: 'FileText',
    category: 'content',
    core: true,
    autonomy: 'config-required',
    adminUI: true,
  },
  blog: {
    enabled: false,
    name: 'Blog',
    description: 'Blog posts with categories, tags and RSS feed — AI-assisted writing optional',
    icon: 'BookOpen',
    category: 'content',
    autonomy: 'config-required',
    adminUI: true,
    enhancedByFlowPilot: true,
    optionalIntegrations: ['openai', 'gemini', 'unsplash'],
  },
  knowledgeBase: {
    enabled: false,
    name: 'Knowledge Base',
    description: 'Structured FAQ with categories and AI Chat integration',
    icon: 'Library',
    category: 'content',
    autonomy: 'config-required',
    adminUI: true,
  },
  chat: {
    enabled: false,
    name: 'AI Chat',
    description: 'Intelligent chatbot with Context-Augmented Generation — requires at least one AI provider',
    icon: 'MessageSquare',
    category: 'communication',
    autonomy: 'view-required',
    adminUI: true,
    requiresAI: true,
    enhancedByFlowPilot: true,
    optionalIntegrations: ['openai', 'gemini', 'local_llm', 'n8n'],
  },
  liveSupport: {
    enabled: false,
    name: 'Live Support',
    description: 'Human agent support with AI handoff and escalation',
    icon: 'Headphones',
    category: 'communication',
    autonomy: 'view-required',
    adminUI: true,
  },
  newsletter: {
    enabled: false,
    name: 'Newsletter',
    description: 'Email campaigns and subscriber management via Resend',
    icon: 'Mail',
    category: 'communication',
    autonomy: 'config-required',
    adminUI: true,
    requiredIntegrations: ['resend'],
  },
  forms: {
    enabled: false,
    name: 'Forms',
    description: 'Form submissions and contact requests',
    icon: 'Inbox',
    category: 'data',
    autonomy: 'view-required',
    adminUI: true,
  },
  leads: {
    enabled: false,
    name: 'Leads',
    description: 'AI-driven lead management with automatic qualification',
    icon: 'UserCheck',
    category: 'data',
    autonomy: 'view-required',
    adminUI: true,
    enhancedByFlowPilot: true,
  },
  deals: {
    enabled: false,
    name: 'Deals',
    description: 'Pipeline management for sales opportunities',
    icon: 'Briefcase',
    category: 'data',
    autonomy: 'view-required',
    adminUI: true,
    enhancedByFlowPilot: true,
  },
  companies: {
    enabled: false,
    name: 'Companies',
    description: 'Organization management with multiple contacts',
    icon: 'Building2',
    category: 'data',
    autonomy: 'view-required',
    adminUI: true,
  },
  ecommerce: {
    enabled: false,
    name: 'E-commerce',
    description: 'Products, orders, cart, and customer portal',
    icon: 'ShoppingBag',
    category: 'data',
    autonomy: 'config-required',
    adminUI: true,
    optionalIntegrations: ['stripe', 'resend', 'stripe_webhook'],
    sandboxAutoPayDays: 0, // Instant payment simulation by default
  },
  developer: {
    enabled: false,
    name: 'Developer',
    description: 'API explorer, webhooks, and developer tools for integrating with external systems',
    icon: 'Code2',
    category: 'system',
    autonomy: 'config-required',
    adminUI: true,
  },
  globalElements: {
    enabled: false,
    name: 'Global Elements',
    description: 'Merged into Pages module — kept for backward compatibility',
    icon: 'LayoutGrid',
    category: 'system',
    autonomy: 'config-required',
    adminUI: false,
    core: false,
  },
  mediaLibrary: {
    enabled: true,
    name: 'Media Library',
    description: 'Manage images and files',
    icon: 'Image',
    category: 'data',
    core: true,
    autonomy: 'config-required',
    adminUI: true,
  },
  webinars: {
    enabled: false,
    name: 'Webinars',
    description: 'Plan, promote and follow up webinars and online events',
    icon: 'Video',
    category: 'communication',
    autonomy: 'config-required',
    adminUI: true,
    optionalIntegrations: ['resend'],
  },
  salesIntelligence: {
    enabled: false,
    name: 'Sales Intelligence',
    description: 'Prospect research, fit analysis, and AI-powered introduction letters — enhanced by FlowPilot for autonomous prospecting chains',
    icon: 'Target',
    category: 'data',
    autonomy: 'agent-capable',
    adminUI: true,
    requiresAI: true,
    enhancedByFlowPilot: true,
    optionalIntegrations: ['hunter', 'jina', 'firecrawl', 'openai', 'gemini'],
  },
  resume: {
    enabled: false,
    name: 'Consultants',
    description: 'AI-powered consultant matching with tailored CVs and cover letters — requires at least one AI provider',
    icon: 'FileUser',
    category: 'data',
    autonomy: 'agent-capable',
    adminUI: true,
    requiresAI: true,
    enhancedByFlowPilot: true,
    optionalIntegrations: ['openai', 'gemini'],
  },
  browserControl: {
    enabled: false,
    name: 'Browser Control',
    description: 'Chrome Extension relay for authenticated web browsing — read LinkedIn, X, and login-walled sites via your browser',
    icon: 'Globe',
    category: 'system',
    autonomy: 'config-required',
    adminUI: true,
  },
  federation: {
    enabled: false,
    name: 'Federation',
    description: 'Agent-to-Agent protocol — connect with other FlowWink instances and external agents',
    icon: 'Network',
    category: 'system',
    autonomy: 'agent-capable',
    adminUI: true,
  },
  paidGrowth: {
    enabled: false,
    name: 'Paid Growth',
    description: 'Autonomous ad campaigns — create, optimize and monitor paid advertising across platforms',
    icon: 'Megaphone',
    category: 'insights',
    autonomy: 'agent-capable',
    adminUI: true,
    requiredIntegrations: ['meta_ads'],
    optionalIntegrations: ['openai', 'gemini'],
  },
  companyInsights: {
    enabled: false,
    name: 'Business Identity',
    description: 'Unified business identity, financials, and market positioning — feeds Sales Intelligence, Chat, and SEO',
    icon: 'Building2',
    category: 'insights',
    autonomy: 'agent-capable',
    adminUI: true,
    optionalIntegrations: ['firecrawl'],
  },
  flowpilot: {
    enabled: false,
    name: 'FlowPilot',
    description: 'Optional autonomous AI operator — skills, objectives, automations and workflows. Disabled by default. FlowWink works as a traditional SaaS without it; enabling FlowPilot lets other modules opt into autonomous behavior (heartbeats, automations, scheduled actions).',
    icon: 'Sparkles',
    category: 'system',
    autonomy: 'agent-capable',
    adminUI: true,
  },
  tickets: {
    enabled: false,
    name: 'Tickets',
    description: 'Helpdesk ticket management — Kanban pipeline with auto-categorization, KB matching, and SLA tracking. Enhanced by FlowPilot for auto-triage.',
    icon: 'Headphones',
    category: 'communication',
    autonomy: 'agent-capable',
    adminUI: true,
    enhancedByFlowPilot: true,
  },
  siteMigration: {
    enabled: true,
    name: 'Site Migration',
    description: 'Clone external websites — discover pages, extract branding, and migrate content. Skill-driven (migrate_url) — runs from admin UI, MCP, or FlowPilot.',
    icon: 'Snowflake',
    category: 'content',
    autonomy: 'agent-capable',
    adminUI: false,
    enhancedByFlowPilot: true,
    requiresAI: true,
    requiredIntegrations: ['firecrawl'],
    optionalIntegrations: ['jina'],
  },
  composio: {
    enabled: false,
    name: 'Composio',
    description: 'Connect to 1000+ external apps via managed OAuth — Gmail, Slack, HubSpot and more',
    icon: 'Network',
    category: 'system',
    autonomy: 'agent-capable',
    adminUI: false,
    requiredIntegrations: ['composio'],
  },
  templates: {
    enabled: true,
    name: 'Templates',
    description: 'Template gallery, export current site as reusable template, and import templates from file',
    icon: 'Puzzle',
    category: 'system',
    autonomy: 'config-required',
    adminUI: true,
  },
  invoicing: {
    enabled: false,
    name: 'Quotes & Invoicing',
    description: 'Create quotes, convert to invoices on acceptance, track payments — full Quote-to-Cash flow',
    icon: 'Receipt',
    category: 'data',
    autonomy: 'agent-capable',
    adminUI: true,
    optionalIntegrations: ['stripe', 'resend'],
  },
  accounting: {
    enabled: false,
    name: 'Accounting',
    description: 'Double-entry bookkeeping with BAS 2024 chart of accounts, journal entries, general ledger, balance sheet and P&L reports',
    icon: 'BookOpen',
    category: 'data',
    autonomy: 'agent-capable',
    adminUI: true,
  },
  expenses: {
    enabled: false,
    name: 'Expense Reporting',
    description: 'Employee expense reporting with receipt scanning, monthly approval workflow, and autonomous journal entry booking',
    icon: 'Receipt',
    category: 'data',
    autonomy: 'agent-capable',
    adminUI: true,
    enhancedByFlowPilot: true,
    requiredIntegrations: [],
  },
  handbook: {
    enabled: false,
    name: 'Handbook',
    description: 'Sync and display markdown documentation from a GitHub repository — enables FlowPilot to discuss content with visitors',
    icon: 'BookMarked',
    category: 'content',
    autonomy: 'agent-capable',
    adminUI: true,
  },
  docs: {
    enabled: false,
    name: 'Docs',
    description: 'Public documentation portal at /docs — auto-syncs the GitHub docs/ folder so evaluators can browse modules, processes and architecture, with embedded AI chat scoped to the docs.',
    icon: 'BookOpen',
    category: 'content',
    autonomy: 'agent-capable',
    adminUI: true,
  },
  timesheets: {
    enabled: false,
    name: 'Timesheets',
    description: 'Track time per project and client — weekly views, billable hours, and invoicing integration',
    icon: 'Timer',
    category: 'data',
    autonomy: 'agent-capable',
    adminUI: true,
  },
  inventory: {
    enabled: false,
    name: 'Inventory',
    description: 'Stock levels, movements and reorder points — auto-decrements on orders, low-stock alerts',
    icon: 'Package',
    category: 'data',
    autonomy: 'agent-capable',
    adminUI: true,
  },
  purchasing: {
    enabled: false,
    name: 'Purchasing',
    description: 'Vendor management, purchase orders, goods receipts — FlowPilot auto-creates POs when stock is low',
    icon: 'Truck',
    category: 'data',
    autonomy: 'agent-capable',
    adminUI: true,
    enhancedByFlowPilot: true,
    optionalIntegrations: ['resend'],
  },
  manufacturing: {
    enabled: false,
    name: 'Manufacturing',
    description: 'MRP-light: Bills of Materials, Manufacturing Orders, component reservation, and the link from production demand to procurement.',
    icon: 'Factory',
    category: 'data',
    autonomy: 'agent-capable',
    adminUI: true,
    enhancedByFlowPilot: true,
  },
  sla: {
    enabled: false,
    name: 'SLA Monitor',
    description: 'Define response and resolution time targets — FlowPilot monitors compliance and flags breaches automatically',
    icon: 'Shield',
    category: 'insights',
    autonomy: 'agent-capable',
    adminUI: true,
    enhancedByFlowPilot: true,
  },
  contracts: {
    enabled: false,
    name: 'Contracts',
    description: 'Contract lifecycle management with renewal tracking, document versioning, and deadline alerts — FlowPilot monitors expirations autonomously',
    icon: 'FileSignature',
    category: 'data',
    autonomy: 'agent-capable',
    adminUI: true,
    enhancedByFlowPilot: true,
  },
  hr: {
    enabled: false,
    name: 'HR & Employees',
    description: 'Employee directory, leave management, onboarding checklists, and document handling — FlowPilot automates routine HR tasks and escalates exceptions',
    icon: 'Users',
    category: 'data',
    autonomy: 'agent-capable',
    adminUI: true,
    enhancedByFlowPilot: true,
  },
  documents: {
    enabled: false,
    name: 'Documents',
    description: 'Central document archive with categories, folders, and tagging — links to contracts, HR, finance, and projects',
    icon: 'FolderOpen',
    category: 'data',
    autonomy: 'agent-capable',
    adminUI: true,
  },
  projects: {
    enabled: false,
    name: 'Projects',
    description: 'Project management with kanban task boards, budget tracking, and team assignment — integrates with timesheets and invoicing',
    icon: 'FolderKanban',
    category: 'data',
    autonomy: 'agent-capable',
    adminUI: true,
  },
  calendar: {
    enabled: false,
    name: 'Calendar',
    description: 'Unified calendar that aggregates bookings, CRM tasks, leave, project deadlines and contract renewals — view-only, owns no data',
    icon: 'CalendarDays',
    category: 'insights',
    autonomy: 'view-required',
    adminUI: true,
  },
  subscriptions: {
    enabled: false,
    name: 'Subscriptions',
    description: 'Recurring revenue lifecycle — MRR, churn, dunning, trials and customer self-service portal. Synced from your payment provider via webhooks. Provider-agnostic (Stripe today, Paddle next).',
    icon: 'RefreshCw',
    category: 'data',
    autonomy: 'view-required',
    adminUI: true,
    optionalIntegrations: ['stripe', 'stripe_webhook'],
    enhancedByFlowPilot: true,
  },
  approvals: {
    enabled: true,
    name: 'Approvals',
    description: 'Generic approval engine — define rules (entity type + amount + required role) and route requests for sign-off. Used by Purchasing, Expenses, Invoicing and Quotes.',
    icon: 'ShieldCheck',
    category: 'data',
    autonomy: 'agent-capable',
    adminUI: true,
    enhancedByFlowPilot: true,
  },
  reconciliation: {
    enabled: false,
    name: 'Reconciliation',
    description: 'Bank reconciliation — sync Stripe payouts, import CSV/CAMT.053/SIE bank files, auto-match against invoices, expenses and orders. Live bank connectivity (GoCardless/Tink/Plaid) coming in v0.5.',
    icon: 'RefreshCw',
    category: 'data',
    autonomy: 'agent-capable',
    adminUI: true,
    optionalIntegrations: ['stripe'],
    enhancedByFlowPilot: true,
  },
  quotes: {
    enabled: false,
    name: 'Quotes',
    description: 'Send branded quotes, track acceptance, and convert to orders or invoices — FlowPilot autonomously follows up on pending quotes.',
    icon: 'FileSignature',
    category: 'data',
    autonomy: 'view-required',
    adminUI: true,
    optionalIntegrations: ['stripe', 'resend'],
    enhancedByFlowPilot: true,
  },
  email: {
    enabled: true,
    name: 'Email Router',
    description:
      'Internal infrastructure module that routes all system emails (dunning, newsletter, receipts, booking confirmations) through SMTP or Resend. Auto-detects available providers — explicit provider can be set in Integrations.',
    icon: 'Mail',
    category: 'system',
    core: true,
    autonomy: 'agent-capable',
    adminUI: false,
    optionalIntegrations: ['smtp', 'resend'],
  },
  recruitment: {
    enabled: false,
    name: 'Recruitment',
    description:
      'Applicant Tracking System — job postings, candidate pipeline, AI screening and outreach. FlowPilot summarizes the pipeline daily and flags top-fit candidates.',
    icon: 'Briefcase',
    category: 'data',
    autonomy: 'agent-capable',
    adminUI: true,
    enhancedByFlowPilot: true,
  },
  workspaceChat: {
    enabled: false,
    name: 'Cowork Chat',
    description:
      'Internal authenticated chat for admins/employees. Combines your workspace data (documents, contracts, KB, CRM, HR) with the model\'s own knowledge and optional web search. Read-only with source citations.',
    icon: 'Sparkles',
    category: 'communication',
    autonomy: 'view-required',
    adminUI: true,
    requiresAI: true,
    optionalIntegrations: ['openai', 'gemini', 'local_llm', 'firecrawl'],
  },
  customer360: {
    enabled: false,
    name: 'Customer 360',
    description:
      'Unified view of every signal, deal, order, invoice, ticket, booking, subscription, chat and webinar tied to a person — with timeline and lifetime-value KPIs.',
    icon: 'UserSearch',
    category: 'data',
    autonomy: 'view-required',
    adminUI: true,
  },
  surveys: {
    enabled: false,
    name: 'Surveys & NPS',
    description:
      'Send one-click NPS, CSAT and custom surveys triggered by lifecycle events (order delivered, ticket closed, subscription renewed). Auto-categorizes promoters/passives/detractors and emits platform events FlowPilot can act on.',
    icon: 'Smile',
    category: 'data',
    autonomy: 'agent-capable',
    adminUI: true,
    enhancedByFlowPilot: true,
  },
  fieldService: {
    enabled: false,
    name: 'Field Service',
    description:
      'Dispatch on-site service orders: schedule technicians, track visits with calendar integration, capture customer signatures, and auto-generate invoices on completion. FlowPilot can auto-schedule open orders to available time slots.',
    icon: 'Truck',
    category: 'data',
    autonomy: 'view-required',
    adminUI: true,
    enhancedByFlowPilot: true,
  },
  pos: {
    enabled: false,
    name: 'Point of Sale',
    description:
      'Counter-sales register for in-store retail: open/close cashier shifts with cash counting, ring up sales with multi-payment (cash, card, Swish, Klarna), print receipts and reconcile end-of-day variance. Sales feed the same revenue ledger as e-commerce.',
    icon: 'Receipt',
    category: 'data',
    autonomy: 'view-required',
    adminUI: true,
    enhancedByFlowPilot: false,
  },
  pricelists: {
    enabled: false,
    name: 'Pricelists',
    description:
      'Versioned pricing per customer, company, or period — Odoo-style price lists with fixed prices or discount %. Resolves the best applicable price for any product+customer+date.',
    icon: 'Tag',
    category: 'data',
    autonomy: 'config-required',
    adminUI: true,
  },
  returns: {
    enabled: false,
    name: 'Returns / RMA',
    description:
      'Return-merchandise-authorization flow with line-item tracking, approval, restock-on-receive, and refund processing.',
    icon: 'Undo2',
    category: 'data',
    autonomy: 'view-required',
    adminUI: true,
  },
  shipping: {
    enabled: false,
    name: 'Shipping',
    description:
      'Outbound shipping with multi-parcel support and carrier integrations (PostNord, DHL, Bring). Tracking URLs auto-rendered from per-carrier templates.',
    icon: 'Truck',
    category: 'data',
    autonomy: 'config-required',
    adminUI: true,
    optionalIntegrations: ['postnord', 'dhl', 'bring'],
  },
  multiCurrency: {
    enabled: false,
    name: 'Multi-Currency',
    description:
      'Sell and bill in multiple currencies. Daily ECB exchange rates, currency selector on invoices/quotes/orders/POs/expenses, and FX revaluation of open AR/AP at period close (BAS 2024: 3960/7960).',
    icon: 'Coins',
    category: 'data',
    autonomy: 'agent-capable',
    adminUI: true,
    enhancedByFlowPilot: true,
  },
  fixedAssets: {
    enabled: false,
    name: 'Fixed Assets',
    description:
      'Capitalize equipment, run monthly depreciation, and post disposals. Auto-bookkeeping per BAS 2024 (1210 cost / 1219 accum / 7832 expense, 3970/7970 disposal gain/loss).',
    icon: 'Building2',
    category: 'data',
    autonomy: 'agent-capable',
    adminUI: true,
    enhancedByFlowPilot: true,
  },
  payroll: {
    enabled: false,
    name: 'Payroll',
    description:
      'Monthly payroll runs (SE-locale): snapshots active employees + recurring components, posts wage journals (BAS 7210/7510/2710/2731/2890), 31.42% employer social fee default.',
    icon: 'Wallet',
    category: 'data',
    autonomy: 'agent-capable',
    adminUI: true,
    enhancedByFlowPilot: true,
  },
  wiki: {
    enabled: false,
    name: 'Wiki',
    description:
      'Internal TEdit-style wiki / intranet. Authenticated staff can read and edit; CamelCase or [[WikiWord]] auto-links create missing pages on click. Surfaces as a selectable knowledge source in Cowork Chat.',
    icon: 'BookOpen',
    category: 'content',
    autonomy: 'agent-capable',
    adminUI: true,
    enhancedByFlowPilot: true,
  },
  river: {
    enabled: false,
    name: 'River',
    description:
      'Internal social feed (X / Instagram / Slack-inspired). Team members post short messages with images, reply in threads, and react with emoji — realtime.',
    icon: 'MessageSquare',
    category: 'communication',
    autonomy: 'view-required',
    adminUI: true,
    enhancedByFlowPilot: true,
  },
};

// Map sidebar items to module IDs
export const SIDEBAR_TO_MODULE: Record<string, keyof ModulesSettings> = {
  '/admin/analytics': 'analytics',
  '/admin/bookings': 'bookings',
  '/admin/pages': 'pages',
  '/admin/blog': 'blog',
  '/admin/knowledge-base': 'knowledgeBase',
  '/admin/chat': 'chat',
  '/admin/live-support': 'liveSupport',
  '/admin/newsletter': 'newsletter',
  '/admin/forms': 'forms',
  '/admin/leads': 'leads',
  '/admin/deals': 'deals',
  '/admin/companies': 'companies',
  '/admin/products': 'ecommerce',
  '/admin/orders': 'ecommerce',
  '/admin/customers': 'ecommerce',
  '/admin/surveys': 'surveys',
  '/admin/field-service': 'fieldService',
  '/admin/pos': 'pos',
  '/admin/developer': 'developer',
  '/admin/global-blocks': 'pages',
  '/admin/media': 'mediaLibrary',
  '/admin/webinars': 'webinars',
  '/admin/sales-intelligence': 'salesIntelligence',
  '/admin/resume': 'resume',
  '/admin/federation': 'federation',
  '/admin/growth': 'paidGrowth',
  '/admin/company-insights': 'companyInsights',
  '/admin/flowpilot': 'flowpilot',
  
  '/admin/tickets': 'tickets',
  '/admin/site-migration': 'siteMigration',
  '/admin/templates': 'templates',
  '/admin/template-export': 'templates',
  '/admin/invoices': 'invoicing',
  '/admin/quotes': 'invoicing',
  '/admin/accounting': 'accounting',
  '/admin/expenses': 'expenses',
  '/admin/handbook': 'handbook',
  '/admin/docs': 'docs',
  '/admin/timesheets': 'timesheets',
  '/admin/inventory': 'inventory',
  '/admin/vendors': 'purchasing',
  '/admin/purchase-orders': 'purchasing',
  '/admin/sla': 'sla',
  '/admin/contracts': 'contracts',
  '/admin/hr': 'hr',
  '/admin/documents': 'documents',
  '/admin/projects': 'projects',
  '/admin/calendar': 'calendar',
  '/admin/subscriptions': 'subscriptions',
  '/admin/approvals': 'approvals',
  '/admin/reconciliation': 'reconciliation',
  '/admin/recruitment': 'recruitment',
  '/admin/pricelists': 'pricelists',
  '/admin/returns': 'returns',
  '/admin/shipping': 'shipping',
  '/admin/currencies': 'multiCurrency',
  '/admin/fixed-assets': 'fixedAssets',
  '/admin/payroll': 'payroll',
  '/admin/wiki': 'wiki',
  '/admin/river': 'river',
};

export function useModules() {
  return useQuery({
    queryKey: ['site-settings', 'modules'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('site_settings')
        .select('value')
        .eq('key', 'modules')
        .maybeSingle();

      if (error) throw error;
      
      // Merge stored settings with defaults to ensure all modules exist
      const stored = (data?.value as unknown as Partial<ModulesSettings>) || {};
      
      // Backward compatibility: migrate old products/orders keys to ecommerce
      const storedAny = stored as Record<string, unknown>;
      if (('products' in storedAny || 'orders' in storedAny) && !('ecommerce' in storedAny)) {
        const oldProducts = storedAny.products as ModuleConfig | undefined;
        const oldOrders = storedAny.orders as ModuleConfig | undefined;
        storedAny.ecommerce = {
          ...defaultModulesSettings.ecommerce,
          enabled: oldProducts?.enabled || oldOrders?.enabled || false,
        };
        delete storedAny.products;
        delete storedAny.orders;
      }
      
      // Structural fields are owned by code, not the DB. Stored rows from
      // older versions may have stale values (e.g. flowpilot persisted with
      // core:true) — those must never override the current defaults, otherwise
      // admins can't toggle modules that used to be marked core.
      const STRUCTURAL_KEYS = [
        'core', 'name', 'description', 'icon', 'category', 'autonomy',
        'adminUI', 'requiresFlowPilot', 'enhancedByFlowPilot', 'requiresAI',
        'requiredIntegrations', 'optionalIntegrations',
      ] as const;

      return {
        ...defaultModulesSettings,
        ...Object.fromEntries(
          Object.entries(stored)
            .filter(([key]) => key in defaultModulesSettings)
            .map(([key, value]) => {
              const def = defaultModulesSettings[key as keyof ModulesSettings];
              const merged = { ...def, ...(value as object) } as ModuleConfig;
              for (const k of STRUCTURAL_KEYS) {
                (merged as unknown as Record<string, unknown>)[k] = (def as unknown as Record<string, unknown>)[k];
              }
              return [key, merged];
            })
        ),
      } as ModulesSettings;
    },
    staleTime: 1000 * 60 * 5,
  });
}

export function useUpdateModules() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (modules: ModulesSettings) => {
      const { data: existing } = await supabase
        .from('site_settings')
        .select('id')
        .eq('key', 'modules')
        .maybeSingle();

      const jsonValue = modules as unknown as Json;

      if (existing) {
        const { error } = await supabase
          .from('site_settings')
          .update({ 
            value: jsonValue,
            updated_at: new Date().toISOString()
          })
          .eq('key', 'modules');

        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('site_settings')
          .insert({ 
            key: 'modules', 
            value: jsonValue
          });

        if (error) throw error;
      }

      return modules;
    },
    onSuccess: (modules) => {
      queryClient.setQueryData(['site-settings', 'modules'], modules);
      toast({
        title: 'Saved',
        description: 'Module settings have been updated.',
      });
    },
    onError: (error) => {
      toast({
        title: 'Error',
        description: 'Could not save module settings.',
        variant: 'destructive',
      });
      logger.error('Failed to update modules:', error);
    },
  });
}

export function useIsModuleEnabled(moduleId: keyof ModulesSettings): boolean {
  const { data: modules } = useModules();
  return modules?.[moduleId]?.enabled ?? defaultModulesSettings[moduleId]?.enabled ?? false;
}

export function useEnabledModules(): (keyof ModulesSettings)[] {
  const { data: modules } = useModules();
  // During initial load we MUST return [] — returning all keys made every
  // gating check (MCP exposure, nav, FlowPilot skill filter) believe disabled
  // modules like payroll/manufacturing/pos were active until hydration.
  if (!modules) return [];

  return Object.entries(modules)
    .filter(([_, config]) => config.enabled)
    .map(([key]) => key as keyof ModulesSettings);
}
