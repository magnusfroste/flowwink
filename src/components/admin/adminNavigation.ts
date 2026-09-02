import {
  LayoutDashboard,
  BarChart3,
  FileText,
  Users,
  Settings,
  BookOpen,
  Image,
  Mail,
  MailOpen,
  Puzzle,
  UserCheck,
  Briefcase,
  Building2,
  Package,
  Library,
  ShoppingCart,
  CalendarDays,
  Plug,
  Bot,
  Zap,
  MessageSquare,
  Headphones,
  Megaphone,
  Code2,
  FileText as FileQuote,
  Video,
  Target,
  Inbox,
  Webhook,
  UserCircle,
  FileUser,
  Receipt,
  Timer,
  Wallet,
  Shield,
  ShieldCheck,
  Network,
  UserRound,
  BookMarked,
  Table2,
  Truck,
  FileSignature,
  FolderOpen,
  FolderKanban,
  Wrench,
  RefreshCw,
  AlertTriangle,
  CheckSquare,
  Sparkles,
  Factory,
  UserSearch,
  Plus,
  FlaskConical,
  LayoutTemplate,
  Phone,
  Database,
  Trash2,
} from "lucide-react";

import type { AppRole } from "@/types/cms";

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
    // Everyday cockpit — the 4 tools an operator opens most.
    label: "Main",
    items: [
      { name: "Dashboard", href: "/admin", icon: LayoutDashboard },
      // Admin-only, matching the backend: agent-operate runs skills with the
      // SERVICE ROLE (bypassing RLS) and gates on has_role(admin), so a
      // non-admin opening this page got the UI and a 401 on every message.
      // The nav now says what the engine already enforced.
      { name: "FlowChat", href: "/admin/flowchat", icon: MessageSquare, allowedRoles: ['admin'] },
      { name: "FlowPilot", href: "/admin/flowpilot", icon: Zap, moduleId: "flowpilot" },
      { name: "Analytics", href: "/admin/analytics", icon: BarChart3, moduleId: "analytics" },
      // Everyone's workroom, not a support tool — it sat in the Support group,
      // which was wrong information architecture even though the matrix (not
      // the group) was what actually gated it.
      { name: "Flowwork", href: "/admin/flowwork", icon: Sparkles, moduleId: "workspaceChat" },
      // Your own profile is not an administrative act. This lived in the
      // adminOnly "Admin" group, and the route guard's first line is
      // `if (group.adminOnly) return false` — so every non-admin was denied
      // their own profile page, on every instance, and the module matrix was
      // never even consulted.
      { name: "Profile", href: "/admin/profile", icon: UserCircle },
    ],
  },
  {
    // Automation & agent orchestration — split out from Main to reduce clutter.
    label: "Automate",
    items: [
      { name: "Automations", href: "/admin/automations", icon: Timer },
      { name: "Federation", href: "/admin/federation", icon: Network, moduleId: "federation" },
    ],
  },
  {
    // Site content authoring — Website → Blog → Media are the top three.
    label: "Content",
    items: [
      { name: "Website", href: "/admin/pages", icon: FileText, moduleId: "pages" },
      // Two things sharing a URL: legal formalia AND the go-to-market message
      // (ICP, positioning) — the AI's outward grounding. It sat in the adminOnly
      // group while the matrix granted it to sales: the one group gate that
      // silences module items, so the grant was a lie (the Profile class).
      // Matrix-gated here; a formalia/message split is deliberately deferred.
      { name: "Business Identity", href: "/admin/company-insights", icon: Building2, moduleId: "companyInsights" },
      { name: "Blog", href: "/admin/blog", icon: BookOpen, moduleId: "blog" },
      { name: "Media Library", href: "/admin/media", icon: Image, moduleId: "mediaLibrary" },
      { name: "Knowledge Base", href: "/admin/knowledge-base", icon: Library, moduleId: "knowledgeBase" },
      { name: "Docs", href: "/admin/docs", icon: BookOpen, moduleId: "docs" },
      { name: "Handbook", href: "/admin/handbook", icon: BookMarked, moduleId: "handbook" },
      { name: "Wiki", href: "/admin/wiki", icon: BookMarked, moduleId: "wiki" },
      { name: "River", href: "/admin/river", icon: MessageSquare, moduleId: "river" },
      { name: "Flowtable", href: "/admin/flowtable", icon: Table2, moduleId: "flowtable" },
      // One bin for every content module, deliberately WITHOUT a moduleId: it
      // spans wiki/KB/pages, so gating the link on any single module would be
      // arbitrary. The trash_bin RPC filters row by row through
      // can_access_module, so a role sees only what its matrix already grants —
      // the link is never the gate.
      { name: "Trash", href: "/admin/trash", icon: Trash2 },
    ],
  },
  {
    // All outbound / demand generation lives here — Campaigns + Growth moved
    // out of Content/Main so marketing has one home.
    label: "Marketing",
    items: [
      // moduleId was "developer" — a copy-paste bug that admin-gated Campaigns
      // silently (#102 gränsfall 2). Campaigns is the demand-gen fan-out
      // surface; it follows the paidGrowth dial like its Growth/Social peers.
      { name: "Campaigns", href: "/admin/campaigns", icon: Megaphone, moduleId: "paidGrowth" },
      { name: "Newsletter", href: "/admin/newsletter", icon: Mail, moduleId: "newsletter" },
      { name: "Growth", href: "/admin/growth", icon: Target, moduleId: "paidGrowth" },
      { name: "Social posts", href: "/admin/growth/social", icon: Megaphone, moduleId: "paidGrowth" },
      { name: "Webinars", href: "/admin/webinars", icon: Video, moduleId: "webinars" },
      { name: "WebMeet", href: "/admin/webmeet", icon: Video, moduleId: "webmeet" },
      { name: "Forms", href: "/admin/forms", icon: Inbox, moduleId: "forms" },
      // FlowBox (Magnus's name, 2026-09-02): where everything that flows in
      // and out is handled. One queue over email, chat, tickets, forms and
      // calls organised by who has it — FlowPilot first — with Routing (the
      // rules) and Message log (the ledger) as its tabs. The Email page keeps
      // the mail threads, templates, signatures and sending setup.
      { name: "FlowBox", href: "/admin/flowbox", icon: Inbox, moduleId: "email" },
      { name: "Email", href: "/admin/email", icon: MailOpen, moduleId: "email" },
    ],
  },
  {
    label: "Support",
    items: [
      { name: "Tickets", href: "/admin/tickets", icon: Inbox, moduleId: "tickets" },
      // Moved out of the adminOnly System group (Svante-incident 2026-08-17):
      // the group gate ate the matrix grant — sales/marketing were given the
      // chat module in Role Permissions and never saw the item. Same fix as
      // Business Identity earlier: the matrix is the only dial.
      { name: "AI Chat", href: "/admin/chat", icon: MessageSquare, moduleId: "chat" },
      { name: "Voice", href: "/admin/voice", icon: Phone, moduleId: "voice" },
    ],
  },
  {
    // Renamed CRM → Sales; reordered by day-to-day usage (Contacts/Deals top,
    // Business Identity moved to Admin where operator-level config belongs).
    label: "Sales",
    items: [
      { name: "Contacts", href: "/admin/contacts", icon: UserCheck, moduleId: "leads" },
      { name: "Companies", href: "/admin/companies", icon: Building2, moduleId: "companies" },
      { name: "Deals", href: "/admin/deals", icon: Briefcase, moduleId: "deals" },
      { name: "Activities", href: "/admin/activities", icon: CheckSquare, moduleId: "crm" },
      { name: "Pipeline Stages", href: "/admin/pipelines/stages", icon: FolderKanban, moduleId: "crm" },
      { name: "Bookings", href: "/admin/bookings", icon: CalendarDays, moduleId: "bookings" },
      { name: "Calendar", href: "/admin/calendar", icon: CalendarDays, moduleId: "calendar" },
      { name: "Customer 360", href: "/admin/customer", icon: UserSearch, moduleId: "customer360" },
      { name: "Sales Intelligence", href: "/admin/sales-intelligence", icon: Target, moduleId: "salesIntelligence" },
      { name: "Visitor Intelligence", href: "/admin/visitor-intelligence", icon: UserSearch, moduleId: "visitorIntelligence" },
      { name: "Consultants", href: "/admin/consultants", icon: FileUser, moduleId: "consultants" },
      { name: "Surveys & NPS", href: "/admin/surveys", icon: Sparkles, moduleId: "surveys" },
    ],
  },
  {
    label: "Finance",
    items: [
      { name: "Quotes", href: "/admin/quotes", icon: FileQuote, moduleId: "invoicing" },
      { name: "Quote templates", href: "/admin/quotes/templates", icon: FileText, moduleId: "invoicing" },
      { name: "Invoices", href: "/admin/invoices", icon: Receipt, moduleId: "invoicing" },
      { name: "Subscriptions", href: "/admin/subscriptions", icon: RefreshCw, moduleId: "subscriptions" },
      {
        name: "Dunning",
        href: "/admin/subscriptions/dunning",
        icon: AlertTriangle,
        moduleId: "subscriptions",
        featureFlag: "dunning.enabled",
      },
      { name: "Point of Sale", href: "/admin/pos", icon: Receipt, moduleId: "pos" },
      // Moved out of the adminOnly System group (#102 gränsfall 1): the same
      // moduleId gave two different answers — /admin/pos passed the matrix
      // while POS Audit was eaten by the group's admin gate.
      { name: "POS Audit", href: "/admin/pos/audit", icon: ShieldCheck, moduleId: "pos" },
      { name: "Accounting", href: "/admin/accounting", icon: BookOpen, moduleId: "accounting" },
      { name: "Expenses", href: "/admin/expenses", icon: Wallet, moduleId: "expenses" },
      { name: "Approvals", href: "/admin/approvals", icon: ShieldCheck, moduleId: "approvals" },
      { name: "Reconciliation", href: "/admin/reconciliation", icon: RefreshCw, moduleId: "reconciliation" },
      { name: "Payroll", href: "/admin/payroll", icon: Wallet, moduleId: "payroll" },
      { name: "Fixed Assets", href: "/admin/fixed-assets", icon: Package, moduleId: "fixedAssets" },
      { name: "Currencies", href: "/admin/currencies", icon: Receipt, moduleId: "multiCurrency" },
    ],
  },
  {
    // Renamed E-commerce → Commerce (covers B2B + POS + purchasing too).
    label: "Commerce",
    items: [
      { name: "Products", href: "/admin/products", icon: Package, moduleId: "ecommerce" },
      { name: "Orders", href: "/admin/orders", icon: ShoppingCart, moduleId: "ecommerce" },
      { name: "Customers", href: "/admin/customers", icon: UserRound, moduleId: "ecommerce" },
      { name: "Inventory", href: "/admin/inventory", icon: Package, moduleId: "inventory" },
      { name: "Units of Measure", href: "/admin/products/units", icon: Package, moduleId: "ecommerce" },
      { name: "Pricelists", href: "/admin/pricelists", icon: FileText, moduleId: "pricelists" },
      { name: "Shipping", href: "/admin/shipping", icon: Truck, moduleId: "shipping" },
      { name: "Returns / RMA", href: "/admin/returns", icon: RefreshCw, moduleId: "returns" },
      {
        name: "Vendors",
        href: "/admin/vendors",
        icon: Building2,
        moduleId: "purchasing",
      },
      {
        name: "Purchase Orders",
        href: "/admin/purchase-orders",
        icon: Truck,
        moduleId: "purchasing",
      },
      {
        name: "Manufacturing",
        href: "/admin/manufacturing",
        icon: Factory,
        moduleId: "manufacturing",
      },
    ],
  },
  {
    label: "Operations",
    items: [
      {
        name: "Projects",
        href: "/admin/projects",
        icon: FolderKanban,
        moduleId: "projects",
      },
      // Bredvid projekten, inte under Finance (Magnus 2026-08-30). En tidrapport
      // skrivs av den som utfört arbetet, mot ett projekt och en uppgift — den
      // hör hemma där arbetet finns. Att den SEDAN blir underlag för
      // fakturering gör den inte till en ekonomifunktion, lika lite som en order
      // hör under bokföring för att den slutar i en faktura. Under Finance låg
      // den dessutom bakom en gruppering som ofta stänger ute just de människor
      // som ska fylla i den.
      { name: "Timesheets", href: "/admin/timesheets", icon: Timer, moduleId: "timesheets" },
      { name: "HR & Employees", href: "/admin/hr", icon: Users, moduleId: "hr" },
      {
        name: "Recruitment",
        href: "/admin/recruitment",
        icon: Briefcase,
        moduleId: "recruitment",
      },
      // allowedRoles: ["hr"] was left over from employment contracts. It hid the
      // whole customer-agreement half of the sales chain from the people who
      // sell: a salesperson could draft a quote and never see the contract it
      // turns into. Roles are still enforced by RLS; the nav entry no longer
      // pretends contracts are an HR-only concern.
      { name: "Contracts", href: "/admin/contracts", icon: FileSignature, moduleId: "contracts" },
      { name: "Contract templates", href: "/admin/contracts/templates", icon: FileText, moduleId: "contracts" },
      { name: "Documents", href: "/admin/documents", icon: FolderOpen, moduleId: "documents" },
      // Field service is work performed — dispatching technicians, service
      // orders, on-site jobs — next to Maintenance and SLA, not under Sales.
      // It lay under Sales because the module was born from bookings; the
      // person who runs it is the operations lead (Magnus 2026-09-02).
      { name: "Field Service", href: "/admin/field-service", icon: Truck, moduleId: "fieldService" },
      { name: "Maintenance", href: "/admin/maintenance", icon: Wrench, moduleId: "maintenance" },
      { name: "SLA Monitor", href: "/admin/sla", icon: Shield, moduleId: "sla" },
    ],
  },
  {
    // The old "Setup" was overgrown (13 items mixing user-admin + system).
    // Split into Admin (org-level: users, roles, branding, identity) and
    // System (platform-level: modules, integrations, developer, templates).
    label: "Admin",
    adminOnly: true,
    collapsible: true,
    items: [
      { name: "Site Settings", href: "/admin/settings", icon: Settings },
      { name: "Branding", href: "/admin/branding", icon: Image },
      { name: "Users", href: "/admin/users", icon: Users },
      { name: "Role Permissions", href: "/admin/roles", icon: Shield },
    ],
  },
  {
    label: "System",
    adminOnly: true,
    collapsible: true,
    items: [
      { name: "Modules", href: "/admin/modules", icon: Puzzle },
      { name: "Integrations", href: "/admin/integrations", icon: Plug },
      { name: "Templates", href: "/admin/templates", icon: LayoutTemplate, moduleId: "templates" },
      { name: "Developer", href: "/admin/developer", icon: Code2, moduleId: "developer" },
      { name: "AI Usage", href: "/admin/ai-usage", icon: BarChart3 },
      { name: "System", href: "/admin/system", icon: Database },
    ],
  },
];
