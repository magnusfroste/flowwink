import {
  LayoutDashboard, BarChart3, FileText, Users, Settings, BookOpen, Image, Mail,
  Puzzle, UserCheck, Briefcase, Building2, Package, Library, ShoppingCart,
  CalendarDays, Plug, Bot, Zap, MessageSquare, Headphones, Megaphone, Code2, FileText as FileQuote,
  Video, Target, Inbox, UserCircle, FileUser, Receipt, Timer, Wallet, Shield, ShieldCheck,
  Network, UserRound, BookMarked, Truck, FileSignature, FolderOpen, FolderKanban, Wrench,
  RefreshCw, AlertTriangle, CheckSquare, Sparkles, Factory, UserSearch, Plus, FlaskConical,
  LayoutTemplate, Phone,
} from 'lucide-react';

import type { AppRole } from '@/types/cms';

export type NavItem = {
  name: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  moduleId?: string;
  /**
   * Optional feature-flag inside a module's settings (site_settings row).
   * Item is only shown when the corresponding flag is truthy.
   * Format: 'site_settings_key.field' — e.g. 'dunning.enabled'.
   */
  featureFlag?: string;
  /** Functional roles allowed to see this item. Admin always sees everything. */
  allowedRoles?: AppRole[];
};

export type NavGroup = {
  label: string;
  items: NavItem[];
  /** @deprecated Use allowedRoles instead. Kept for backwards compatibility — equivalent to admin-only. */
  adminOnly?: boolean;
  /** Functional roles allowed to see this group. Admin always sees everything. */
  allowedRoles?: AppRole[];
  collapsible?: boolean;
};

export const navigationGroups: NavGroup[] = [
  {
    label: "Main",
    items: [
      { name: "Dashboard", href: "/admin", icon: LayoutDashboard },
      { name: "FlowChat", href: "/admin/flowchat", icon: MessageSquare },
      { name: "FlowPilot", href: "/admin/flowpilot", icon: Zap, moduleId: "flowpilot" },
      { name: "Federation", href: "/admin/federation", icon: Network, moduleId: "federation" },
      
      { name: "Analytics", href: "/admin/analytics", icon: BarChart3, moduleId: "analytics" },
      { name: "Growth", href: "/admin/growth", icon: Megaphone, moduleId: "paidGrowth" },
    ],
  },
  {
    label: "Content",
    items: [
      { name: "Website", href: "/admin/pages", icon: FileText, moduleId: "pages" },
      { name: "Blog", href: "/admin/blog", icon: BookOpen, moduleId: "blog" },
      { name: "Campaigns", href: "/admin/campaigns", icon: Megaphone, moduleId: "developer" },
      { name: "Knowledge Base", href: "/admin/knowledge-base", icon: Library, moduleId: "knowledgeBase" },
      { name: "Media Library", href: "/admin/media", icon: Image, moduleId: "mediaLibrary" },
      { name: "Handbook", href: "/admin/handbook", icon: BookMarked, moduleId: "handbook" },
      { name: "Docs", href: "/admin/docs", icon: BookOpen, moduleId: "docs" },
      { name: "Wiki", href: "/admin/wiki", icon: BookMarked, moduleId: "wiki" },
      { name: "River", href: "/admin/river", icon: MessageSquare, moduleId: "river" },
    ],
  },
  {
    label: "Marketing",
    allowedRoles: ['marketing'],
    items: [
      { name: "Newsletter", href: "/admin/newsletter", icon: Mail, moduleId: "newsletter" },
      { name: "Webinars", href: "/admin/webinars", icon: Video, moduleId: "webinars" },
      { name: "Forms", href: "/admin/forms", icon: Inbox, moduleId: "forms" },
      { name: "Communications", href: "/admin/communications", icon: Mail },
    ],
  },
  {
    label: "Support",
    allowedRoles: ['support'],
    items: [
      { name: "Cowork Chat", href: "/admin/cowork", icon: Sparkles, moduleId: "workspaceChat" },
      { name: "Live Support", href: "/admin/live-support", icon: Headphones, moduleId: "liveSupport" },
      { name: "Voice", href: "/admin/voice", icon: Phone, moduleId: "voice" },
      { name: "Tickets", href: "/admin/tickets", icon: Inbox, moduleId: "tickets" },
    ],
  },
  {
    label: "CRM",
    allowedRoles: ['sales'],
    items: [
      { name: "Business Identity", href: "/admin/company-insights", icon: Building2, moduleId: "companyInsights" },
      { name: "Customer 360", href: "/admin/customer", icon: UserSearch, moduleId: "customer360" },
      { name: "Contacts", href: "/admin/contacts", icon: UserCheck, moduleId: "leads" },
      { name: "Companies", href: "/admin/companies", icon: Building2, moduleId: "companies" },
      { name: "Sales Intelligence", href: "/admin/sales-intelligence", icon: Target, moduleId: "salesIntelligence" },
      { name: "Consultants", href: "/admin/resume", icon: FileUser, moduleId: "resume" },
      { name: "Deals", href: "/admin/deals", icon: Briefcase, moduleId: "deals" },
      { name: "Pipeline Stages", href: "/admin/pipelines/stages", icon: FolderKanban, moduleId: "crm" },
      { name: "Activities", href: "/admin/activities", icon: CheckSquare, moduleId: "crm" },
      { name: "Bookings", href: "/admin/bookings", icon: CalendarDays, moduleId: "bookings" },
      { name: "Calendar", href: "/admin/calendar", icon: CalendarDays, moduleId: "calendar" },
      { name: "Surveys & NPS", href: "/admin/surveys", icon: Sparkles, moduleId: "surveys" },
      { name: "Field Service", href: "/admin/field-service", icon: Truck, moduleId: "fieldService" },
      { name: "New service order", href: "/admin/field-service?new=1", icon: Plus, moduleId: "fieldService" },
    ],
  },
  {
    label: "Finance",
    allowedRoles: ['accounting'],
    items: [
      { name: "Quotes", href: "/admin/quotes", icon: FileQuote, moduleId: "invoicing" },
      { name: "Invoices", href: "/admin/invoices", icon: Receipt, moduleId: "invoicing" },
      { name: "Subscriptions", href: "/admin/subscriptions", icon: RefreshCw, moduleId: "subscriptions" },
      { name: "Dunning", href: "/admin/subscriptions/dunning", icon: AlertTriangle, moduleId: "subscriptions", featureFlag: "dunning.enabled" },
      { name: "Point of Sale", href: "/admin/pos", icon: Receipt, moduleId: "pos" },
      { name: "Accounting", href: "/admin/accounting", icon: BookOpen, moduleId: "accounting" },
      { name: "Expenses", href: "/admin/expenses", icon: Wallet, moduleId: "expenses" },
      { name: "Timesheets", href: "/admin/timesheets", icon: Timer, moduleId: "timesheets" },
      { name: "Approvals", href: "/admin/approvals", icon: ShieldCheck, moduleId: "approvals" },
      { name: "Reconciliation", href: "/admin/reconciliation", icon: RefreshCw, moduleId: "reconciliation" },
    ],
  },
  {
    label: "E-commerce",
    allowedRoles: ['warehouse', 'purchasing'],
    items: [
      { name: "Customers", href: "/admin/customers", icon: UserRound, moduleId: "ecommerce" },
      { name: "Products", href: "/admin/products", icon: Package, moduleId: "ecommerce" },
      { name: "Units of Measure", href: "/admin/products/units", icon: Package, moduleId: "ecommerce" },
      { name: "Inventory", href: "/admin/inventory", icon: Package, moduleId: "inventory" },
      { name: "Vendors", href: "/admin/vendors", icon: Building2, moduleId: "purchasing", allowedRoles: ['purchasing'] },
      { name: "Purchase Orders", href: "/admin/purchase-orders", icon: Truck, moduleId: "purchasing", allowedRoles: ['purchasing'] },
      { name: "Orders", href: "/admin/orders", icon: ShoppingCart, moduleId: "ecommerce" },
      { name: "Manufacturing", href: "/admin/manufacturing", icon: Factory, moduleId: "manufacturing", allowedRoles: ['warehouse'] },
    ],
  },
  {
    label: "Operations",
    allowedRoles: ['hr', 'projects'],
    items: [
      { name: "Projects", href: "/admin/projects", icon: FolderKanban, moduleId: "projects", allowedRoles: ['projects'] },
      { name: "HR & Employees", href: "/admin/hr", icon: Users, moduleId: "hr", allowedRoles: ['hr'] },
      { name: "Recruitment", href: "/admin/recruitment", icon: Briefcase, moduleId: "recruitment", allowedRoles: ['hr'] },
      { name: "Contracts", href: "/admin/contracts", icon: FileSignature, moduleId: "contracts", allowedRoles: ['hr'] },
      { name: "Documents", href: "/admin/documents", icon: FolderOpen, moduleId: "documents" },
      { name: "Maintenance", href: "/admin/maintenance", icon: Wrench, moduleId: "maintenance" },
      { name: "SLA Monitor", href: "/admin/sla", icon: Shield, moduleId: "sla" },
    ],
  },
  {
    label: "Setup",
    adminOnly: true,
    collapsible: false,
    items: [
      
      { name: "Chat Widget", href: "/admin/chat", icon: MessageSquare, moduleId: "chat" },
      { name: "Templates", href: "/admin/templates", icon: LayoutTemplate, moduleId: "templates" },
      { name: "Modules", href: "/admin/modules", icon: Puzzle },
      { name: "Automations", href: "/admin/automations", icon: Zap },
      { name: "Integrations", href: "/admin/integrations", icon: Plug },
      { name: "Branding", href: "/admin/branding", icon: Image },
      { name: "Developer", href: "/admin/developer", icon: Code2, moduleId: "developer" },
      { name: "Skills", href: "/admin/skills", icon: Sparkles },
      { name: "Platform Tests", href: "/admin/platform-tests", icon: FlaskConical },
      
      { name: "AI Usage", href: "/admin/ai-usage", icon: BarChart3 },

      { name: "Users", href: "/admin/users", icon: Users },
      { name: "Role Permissions", href: "/admin/roles", icon: Shield },
      { name: "Profile", href: "/admin/profile", icon: UserCircle },
      { name: "Settings", href: "/admin/settings", icon: Settings },
    ],
  },
];
