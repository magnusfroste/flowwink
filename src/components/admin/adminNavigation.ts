import {
  LayoutDashboard, BarChart3, FileText, Users, Settings, BookOpen, Image, Mail,
  Puzzle, UserCheck, Briefcase, Building2, Package, Library, ShoppingCart,
  CalendarDays, Plug, Bot, Zap, MessageSquare, Headphones, Megaphone, Code2, FileText as FileQuote,
  Video, Target, Inbox, UserCircle, FileUser, Receipt, Timer, Wallet, Shield,
  Network, Snowflake, UserRound, BookMarked, Truck, FileSignature, FolderOpen, FolderKanban,
  RefreshCw,
} from 'lucide-react';

export type NavItem = {
  name: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  moduleId?: string;
};

export type NavGroup = {
  label: string;
  items: NavItem[];
  adminOnly?: boolean;
  collapsible?: boolean;
};

export const navigationGroups: NavGroup[] = [
  {
    label: "Main",
    items: [
      { name: "Dashboard", href: "/admin", icon: LayoutDashboard },
      { name: "FlowPilot", href: "/admin/flowpilot", icon: Zap, moduleId: "flowpilot" },
      { name: "Engine Room", href: "/admin/skills", icon: Bot, moduleId: "flowpilot" },
      { name: "Federation", href: "/admin/federation", icon: Network, moduleId: "federation" },
      { name: "OpenClaw", href: "/admin/openclaw", icon: Snowflake, moduleId: "openclaw" },
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
    ],
  },
  {
    label: "Marketing",
    adminOnly: true,
    items: [
      { name: "Newsletter", href: "/admin/newsletter", icon: Mail, moduleId: "newsletter" },
      { name: "Webinars", href: "/admin/webinars", icon: Video, moduleId: "webinars" },
      { name: "Forms", href: "/admin/forms", icon: Inbox, moduleId: "forms" },
    ],
  },
  {
    label: "Support",
    adminOnly: true,
    items: [
      { name: "AI Chat", href: "/admin/chat", icon: MessageSquare, moduleId: "chat" },
      { name: "Live Support", href: "/admin/live-support", icon: Headphones, moduleId: "liveSupport" },
      { name: "Tickets", href: "/admin/tickets", icon: Inbox, moduleId: "tickets" },
    ],
  },
  {
    label: "CRM",
    adminOnly: true,
    items: [
      { name: "Business Identity", href: "/admin/company-insights", icon: Building2, moduleId: "companyInsights" },
      { name: "Contacts", href: "/admin/contacts", icon: UserCheck, moduleId: "leads" },
      { name: "Companies", href: "/admin/companies", icon: Building2, moduleId: "companies" },
      { name: "Sales Intelligence", href: "/admin/sales-intelligence", icon: Target, moduleId: "salesIntelligence" },
      { name: "Consultants", href: "/admin/resume", icon: FileUser, moduleId: "resume" },
      { name: "Deals", href: "/admin/deals", icon: Briefcase, moduleId: "deals" },
      { name: "Bookings", href: "/admin/bookings", icon: CalendarDays, moduleId: "bookings" },
      { name: "Calendar", href: "/admin/calendar", icon: CalendarDays, moduleId: "calendar" },
    ],
  },
  {
    label: "Finance",
    adminOnly: true,
    items: [
      { name: "Quotes", href: "/admin/quotes", icon: FileQuote, moduleId: "invoicing" },
      { name: "Invoices", href: "/admin/invoices", icon: Receipt, moduleId: "invoicing" },
      { name: "Subscriptions", href: "/admin/subscriptions", icon: RefreshCw, moduleId: "subscriptions" },
      { name: "Accounting", href: "/admin/accounting", icon: BookOpen, moduleId: "accounting" },
      { name: "Expenses", href: "/admin/expenses", icon: Wallet, moduleId: "expenses" },
      { name: "Timesheets", href: "/admin/timesheets", icon: Timer, moduleId: "timesheets" },
    ],
  },
  {
    label: "E-commerce",
    adminOnly: true,
    items: [
      { name: "Customers", href: "/admin/customers", icon: UserRound, moduleId: "ecommerce" },
      { name: "Products", href: "/admin/products", icon: Package, moduleId: "ecommerce" },
      { name: "Inventory", href: "/admin/inventory", icon: Package, moduleId: "inventory" },
      { name: "Vendors", href: "/admin/vendors", icon: Building2, moduleId: "purchasing" },
      { name: "Purchase Orders", href: "/admin/purchase-orders", icon: Truck, moduleId: "purchasing" },
      { name: "Orders", href: "/admin/orders", icon: ShoppingCart, moduleId: "ecommerce" },
    ],
  },
  {
    label: "Operations",
    adminOnly: true,
    items: [
      { name: "Projects", href: "/admin/projects", icon: FolderKanban, moduleId: "projects" },
      { name: "HR & Employees", href: "/admin/hr", icon: Users, moduleId: "hr" },
      { name: "Contracts", href: "/admin/contracts", icon: FileSignature, moduleId: "contracts" },
      { name: "Documents", href: "/admin/documents", icon: FolderOpen, moduleId: "documents" },
      { name: "SLA Monitor", href: "/admin/sla", icon: Shield, moduleId: "sla" },
    ],
  },
  {
    label: "Setup",
    adminOnly: true,
    collapsible: false,
    items: [
      
      { name: "Templates", href: "/admin/templates", icon: Puzzle, moduleId: "templates" },
      { name: "Modules", href: "/admin/modules", icon: Puzzle },
      { name: "Integrations", href: "/admin/integrations", icon: Plug },
      { name: "Developer", href: "/admin/developer", icon: Code2, moduleId: "developer" },
      
      { name: "Users", href: "/admin/users", icon: Users },
      { name: "Profile", href: "/admin/profile", icon: UserCircle },
      { name: "Settings", href: "/admin/settings", icon: Settings },
    ],
  },
];
