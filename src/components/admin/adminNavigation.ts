import {
  LayoutDashboard, BarChart3, FileText, Users, Settings, BookOpen, Image, Mail,
  Puzzle, Webhook, UserCheck, Briefcase, Building2, Package, Library, ShoppingCart,
  CalendarDays, Plug, Bot, Zap, MessageSquare, Headphones, Megaphone, Code2,
  Video, Target, Rocket, LayoutGrid, Inbox, UserCircle, Palette, FileUser,
  Network, Snowflake, Store, UserRound,
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
      { name: "Pages", href: "/admin/pages", icon: FileText, moduleId: "pages" },
      { name: "Blog", href: "/admin/blog", icon: BookOpen, moduleId: "blog" },
      { name: "Campaigns", href: "/admin/campaigns", icon: Megaphone, moduleId: "contentApi" },
      { name: "Knowledge Base", href: "/admin/knowledge-base", icon: Library, moduleId: "knowledgeBase" },
      { name: "Media Library", href: "/admin/media", icon: Image, moduleId: "mediaLibrary" },
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
      { name: "Resume", href: "/admin/resume", icon: FileUser, moduleId: "resume" },
      { name: "Deals", href: "/admin/deals", icon: Briefcase, moduleId: "deals" },
      { name: "Bookings", href: "/admin/bookings", icon: CalendarDays, moduleId: "bookings" },
    ],
  },
  {
    label: "E-commerce",
    adminOnly: true,
    items: [
      { name: "Customers", href: "/admin/customers", icon: UserRound, moduleId: "ecommerce" },
      { name: "Products", href: "/admin/products", icon: Package, moduleId: "ecommerce" },
      { name: "Orders", href: "/admin/orders", icon: ShoppingCart, moduleId: "ecommerce" },
    ],
  },
  {
    label: "Setup",
    adminOnly: true,
    collapsible: false,
    items: [
      
      { name: "Templates", href: "/admin/templates", icon: Puzzle, moduleId: "templates" },
      { name: "Branding", href: "/admin/branding", icon: Palette },
      { name: "Global Elements", href: "/admin/global-blocks", icon: LayoutGrid, moduleId: "globalElements" },
      { name: "Modules", href: "/admin/modules", icon: Puzzle },
      { name: "Integrations", href: "/admin/integrations", icon: Plug },
      { name: "Developer", href: "/admin/developer", icon: Code2, moduleId: "developer" },
    ],
  },
];
