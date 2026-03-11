import {
  LayoutDashboard, BarChart3, FileText, Users, Settings, BookOpen, Image, Mail,
  Puzzle, Webhook, UserCheck, Briefcase, Building2, Package, Library, ShoppingCart,
  CalendarDays, Plug, Bot, Zap, MessageSquare, Headphones, Megaphone, Code2,
  Video, Target, Rocket, LayoutGrid, Inbox, Menu, UserCircle, Palette, FileUser,
} from 'lucide-react';

export type NavItem = {
  name: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  moduleId?: string;
  setupOnly?: boolean;
  searchOnly?: boolean;
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
      { name: "FlowPilot", href: "/admin/copilot", icon: Zap },
      { name: "Skill Hub", href: "/admin/skills", icon: Bot },
      { name: "Analytics", href: "/admin/analytics", icon: BarChart3, moduleId: "analytics" },
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
    ],
  },
  {
    label: "CRM",
    adminOnly: true,
    items: [
      { name: "Contacts", href: "/admin/contacts", icon: UserCheck, moduleId: "leads" },
      { name: "Companies", href: "/admin/companies", icon: Building2, moduleId: "companies" },
      { name: "Sales Intelligence", href: "/admin/sales-intelligence", icon: Target, moduleId: "salesIntelligence" },
      { name: "Resume", href: "/admin/resume", icon: FileUser, moduleId: "resume" },
      { name: "Deals", href: "/admin/deals", icon: Briefcase, moduleId: "deals" },
      { name: "Bookings", href: "/admin/bookings", icon: CalendarDays, moduleId: "bookings" },
      { name: "Products", href: "/admin/products", icon: Package, moduleId: "products" },
      { name: "Orders", href: "/admin/orders", icon: ShoppingCart, moduleId: "orders" },
    ],
  },
  {
    label: "Setup",
    adminOnly: true,
    collapsible: false,
    items: [
      { name: "Quick Start", href: "/admin/quick-start", icon: Rocket, setupOnly: true },
      { name: "Templates", href: "/admin/templates", icon: Puzzle, setupOnly: true },
      { name: "Branding", href: "/admin/branding", icon: Palette },
      { name: "Global Elements", href: "/admin/global-blocks", icon: LayoutGrid, moduleId: "globalElements" },
      { name: "Modules", href: "/admin/modules", icon: Puzzle },
      { name: "Integrations", href: "/admin/integrations", icon: Plug },
      { name: "Content API", href: "/admin/content-api", icon: Code2, moduleId: "contentApi" },
      { name: "Webhooks", href: "/admin/webhooks", icon: Webhook },
      { name: "Menu Order", href: "/admin/menu-order", icon: Menu },
      { name: "Users", href: "/admin/users", icon: Users },
      { name: "Settings", href: "/admin/settings", icon: Settings },
      { name: "Developer Tools", href: "/admin/developer-tools", icon: Code2, searchOnly: true },
      { name: "New Site", href: "/admin/new-site", icon: Rocket, searchOnly: true },
      { name: "Trash", href: "/admin/pages/trash", icon: FileText, searchOnly: true },
      { name: "Blog Categories", href: "/admin/blog/categories", icon: BookOpen, searchOnly: true },
      { name: "Blog Tags", href: "/admin/blog/tags", icon: BookOpen, searchOnly: true },
      { name: "Blog Settings", href: "/admin/blog/settings", icon: BookOpen, searchOnly: true },
      { name: "Profile", href: "/admin/profile", icon: UserCircle, searchOnly: true },
      { name: "Booking Services", href: "/admin/bookings/services", icon: CalendarDays, searchOnly: true },
      { name: "Booking Availability", href: "/admin/bookings/availability", icon: CalendarDays, searchOnly: true },
      { name: "Template Export", href: "/admin/template-export", icon: Puzzle, searchOnly: true },
    ],
  },
];
