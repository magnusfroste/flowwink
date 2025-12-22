import { Link, useLocation } from "react-router-dom";
import {
  LayoutDashboard,
  FileText,
  Users,
  Settings,
  LogOut,
  Menu,
  Palette,
  MessageSquare,
  Database,
  Rocket,
  LayoutGrid,
  Inbox,
  BookOpen,
  Image,
  Mail,
  Puzzle,
  Webhook,
  UserCheck,
  Briefcase,
  Building2,
  Package,
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { ROLE_LABELS } from "@/types/cms";
import { useModules, SIDEBAR_TO_MODULE, type ModulesSettings } from "@/hooks/useModules";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarTrigger,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarGroupContent,
  SidebarSeparator,
  useSidebar,
} from "@/components/ui/sidebar";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

type NavItem = {
  name: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  moduleId?: keyof ModulesSettings;
};

type NavGroup = {
  label: string;
  items: NavItem[];
  adminOnly?: boolean;
};

const navigationGroups: NavGroup[] = [
  {
    label: "Main",
    items: [
      { name: "Dashboard", href: "/admin", icon: LayoutDashboard },
      { name: "Quick Start", href: "/admin/quick-start", icon: Rocket },
    ],
  },
  {
    label: "Content",
    items: [
      { name: "Pages", href: "/admin/pages", icon: FileText, moduleId: "pages" },
      { name: "Blog", href: "/admin/blog", icon: BookOpen, moduleId: "blog" },
    ],
  },
  {
    label: "Data",
    adminOnly: true,
    items: [
      { name: "Leads", href: "/admin/leads", icon: UserCheck, moduleId: "leads" },
      { name: "Deals", href: "/admin/deals", icon: Briefcase, moduleId: "deals" },
      { name: "Companies", href: "/admin/companies", icon: Building2, moduleId: "companies" },
      { name: "Products", href: "/admin/products", icon: Package, moduleId: "products" },
      { name: "Form Submissions", href: "/admin/forms", icon: Inbox, moduleId: "forms" },
      { name: "Newsletter", href: "/admin/newsletter", icon: Mail, moduleId: "newsletter" },
      { name: "Media Library", href: "/admin/media", icon: Image, moduleId: "mediaLibrary" },
      { name: "Content Hub", href: "/admin/content-hub", icon: Database, moduleId: "contentApi" },
      { name: "Global Elements", href: "/admin/global-blocks", icon: LayoutGrid, moduleId: "globalElements" },
    ],
  },
  {
    label: "System",
    adminOnly: true,
    items: [
      { name: "Modules", href: "/admin/modules", icon: Puzzle },
      { name: "Webhooks", href: "/admin/webhooks", icon: Webhook },
      { name: "Menu Order", href: "/admin/menu-order", icon: Menu },
      { name: "Users", href: "/admin/users", icon: Users },
      { name: "Branding", href: "/admin/branding", icon: Palette },
      { name: "AI Chat", href: "/admin/chat", icon: MessageSquare, moduleId: "chat" },
      { name: "Settings", href: "/admin/settings", icon: Settings },
    ],
  },
];

export function AdminSidebar() {
  const location = useLocation();
  const { profile, role, signOut, isAdmin } = useAuth();
  const { state } = useSidebar();
  const { data: modules } = useModules();
  const isCollapsed = state === "collapsed";

  const isItemActive = (href: string) =>
    location.pathname === href || (href !== "/admin" && location.pathname.startsWith(href));

  // Filter by admin role
  const roleFilteredGroups = navigationGroups.filter((group) => !group.adminOnly || isAdmin);
  
  // Filter by enabled modules
  const filteredGroups = roleFilteredGroups
    .map(group => ({
      ...group,
      items: group.items.filter(item => {
        // If no moduleId, always show
        if (!item.moduleId) return true;
        // If modules not loaded yet, show all
        if (!modules) return true;
        // Check if module is enabled
        return modules[item.moduleId]?.enabled ?? true;
      }),
    }))
    .filter(group => group.items.length > 0);

  return (
    <Sidebar collapsible="icon" className="border-r border-sidebar-border">
      {/* Logo */}
      <SidebarHeader className="border-b border-sidebar-border px-3 py-4">
        <div className="flex items-center justify-between">
          {!isCollapsed && (
            <div className="overflow-hidden">
              <span className="font-serif font-bold text-lg">PEZ</span>
              <span className="block text-xs text-sidebar-foreground/60">CMS</span>
            </div>
          )}
          <SidebarTrigger className="h-8 w-8" />
        </div>
      </SidebarHeader>

      {/* Navigation */}
      <SidebarContent className="px-2 py-2">
        {filteredGroups.map((group, index) => (
          <div key={group.label}>
            {index > 0 && <SidebarSeparator className="my-2" />}
            <SidebarGroup>
              {!isCollapsed && (
                <SidebarGroupLabel className="text-[10px] text-sidebar-foreground/40 uppercase tracking-widest font-normal mb-1 transition-colors hover:text-sidebar-foreground/60">
                  {group.label}
                </SidebarGroupLabel>
              )}
              <SidebarGroupContent>
                <SidebarMenu>
                  {group.items.map((item) => {
                    const isActive = isItemActive(item.href);
                    return (
                      <SidebarMenuItem key={item.name}>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <SidebarMenuButton asChild isActive={isActive} tooltip={item.name}>
                              <Link to={item.href}>
                                <item.icon className="h-4 w-4" />
                                <span>{item.name}</span>
                              </Link>
                            </SidebarMenuButton>
                          </TooltipTrigger>
                          {isCollapsed && <TooltipContent side="right">{item.name}</TooltipContent>}
                        </Tooltip>
                      </SidebarMenuItem>
                    );
                  })}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          </div>
        ))}
      </SidebarContent>

      {/* User section */}
      <SidebarFooter className="border-t border-sidebar-border p-3">
        <div className="flex items-center gap-3 mb-3">
          <div className="h-9 w-9 shrink-0 rounded-full bg-sidebar-accent flex items-center justify-center">
            <span className="text-sidebar-accent-foreground font-medium text-sm">
              {profile?.full_name?.charAt(0) || profile?.email?.charAt(0) || "?"}
            </span>
          </div>
          {!isCollapsed && (
            <div className="flex-1 min-w-0 overflow-hidden">
              <p className="text-sm font-medium truncate">{profile?.full_name || profile?.email}</p>
              <p className="text-xs text-sidebar-foreground/60">{role ? ROLE_LABELS[role] : "Loading..."}</p>
            </div>
          )}
        </div>
        <SidebarMenu>
          <SidebarMenuItem>
            <Tooltip>
              <TooltipTrigger asChild>
                <SidebarMenuButton onClick={signOut} tooltip="Sign Out">
                  <LogOut className="h-4 w-4" />
                  <span>Sign Out</span>
                </SidebarMenuButton>
              </TooltipTrigger>
              {isCollapsed && <TooltipContent side="right">Sign Out</TooltipContent>}
            </Tooltip>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}
