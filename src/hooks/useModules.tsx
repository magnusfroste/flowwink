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
  sla: ModuleConfig;
  contracts: ModuleConfig;
  hr: ModuleConfig;
  documents: ModuleConfig;
  projects: ModuleConfig;
  calendar: ModuleConfig;
  subscriptions: ModuleConfig;
  approvals: ModuleConfig;
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
    name: 'Pages',
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
    enabled: true,
    name: 'FlowPilot',
    description: 'Autonomous AI operator — skills, objectives, automations and workflows. Disable to use FlowWink as a traditional CMS without autonomous capabilities.',
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
    description: 'Clone external websites — discover pages, extract branding, and migrate content. Requires FlowPilot for AI-driven migration.',
    icon: 'Snowflake',
    category: 'content',
    autonomy: 'agent-capable',
    adminUI: false,
    requiresFlowPilot: true,
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
  '/admin/skills': 'flowpilot',
  
  '/admin/tickets': 'tickets',
  '/admin/site-migration': 'siteMigration',
  '/admin/templates': 'templates',
  '/admin/template-export': 'templates',
  '/admin/invoices': 'invoicing',
  '/admin/quotes': 'invoicing',
  '/admin/accounting': 'accounting',
  '/admin/expenses': 'expenses',
  '/admin/handbook': 'handbook',
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
      
      return {
        ...defaultModulesSettings,
        ...Object.fromEntries(
          Object.entries(stored)
            .filter(([key]) => key in defaultModulesSettings)
            .map(([key, value]) => [
              key,
              { ...defaultModulesSettings[key as keyof ModulesSettings], ...value }
            ])
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
  if (!modules) return Object.keys(defaultModulesSettings) as (keyof ModulesSettings)[];
  
  return Object.entries(modules)
    .filter(([_, config]) => config.enabled)
    .map(([key]) => key as keyof ModulesSettings);
}
