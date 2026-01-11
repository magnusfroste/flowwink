import { useState, useMemo, useEffect } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import {
  LayoutDashboard,
  BarChart3,
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
  Library,
  Search,
  ChevronsUpDown,
  UserCircle,
  ShoppingCart,
  CalendarDays,
  Plug,
  Bot,
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { ROLE_LABELS } from "@/types/cms";
import { useModules, SIDEBAR_TO_MODULE, type ModulesSettings } from "@/hooks/useModules";
import { useBrandingSettings } from "@/hooks/useSiteSettings";
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
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

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
      { name: "Analytics", href: "/admin/analytics", icon: BarChart3, moduleId: "analytics" },
      { name: "Copilot", href: "/admin/copilot", icon: Bot },
      { name: "Quick Start", href: "/admin/quick-start", icon: Rocket },
      { name: "Templates", href: "/admin/templates", icon: Puzzle },
    ],
  },
  {
    label: "Content",
    items: [
      { name: "Pages", href: "/admin/pages", icon: FileText, moduleId: "pages" },
      { name: "Blog", href: "/admin/blog", icon: BookOpen, moduleId: "blog" },
      { name: "Knowledge Base", href: "/admin/knowledge-base", icon: Library, moduleId: "knowledgeBase" },
      { name: "Media Library", href: "/admin/media", icon: Image, moduleId: "mediaLibrary" },
      { name: "Global Elements", href: "/admin/global-blocks", icon: LayoutGrid, moduleId: "globalElements" },
    ],
  },
  {
    label: "CRM",
    adminOnly: true,
    items: [
      { name: "Contacts", href: "/admin/contacts", icon: UserCheck, moduleId: "leads" },
      { name: "Companies", href: "/admin/companies", icon: Building2, moduleId: "companies" },
      { name: "Deals", href: "/admin/deals", icon: Briefcase, moduleId: "deals" },
      { name: "Bookings", href: "/admin/bookings", icon: CalendarDays, moduleId: "bookings" },
      { name: "Products", href: "/admin/products", icon: Package, moduleId: "products" },
      { name: "Orders", href: "/admin/orders", icon: ShoppingCart, moduleId: "orders" },
    ],
  },
  {
    label: "Marketing",
    adminOnly: true,
    items: [
      { name: "Newsletter", href: "/admin/newsletter", icon: Mail, moduleId: "newsletter" },
      { name: "Form Submissions", href: "/admin/forms", icon: Inbox, moduleId: "forms" },
      { name: "AI Chat", href: "/admin/chat", icon: MessageSquare, moduleId: "chat" },
    ],
  },
  {
    label: "System",
    adminOnly: true,
    items: [
      { name: "Modules", href: "/admin/modules", icon: Puzzle },
      { name: "Integrations", href: "/admin/integrations", icon: Plug },
      { name: "Content Hub", href: "/admin/content-hub", icon: Database, moduleId: "contentApi" },
      { name: "Webhooks", href: "/admin/webhooks", icon: Webhook },
      { name: "Menu Order", href: "/admin/menu-order", icon: Menu },
      { name: "Users", href: "/admin/users", icon: Users },
      { name: "Branding", href: "/admin/branding", icon: Palette },
      { name: "Settings", href: "/admin/settings", icon: Settings },
    ],
  },
];

export function AdminSidebar() {
  const location = useLocation();
  const navigate = useNavigate();
  const { profile, role, signOut, isAdmin } = useAuth();
  const { state } = useSidebar();
  const { data: modules } = useModules();
  const { data: branding } = useBrandingSettings();
  const isCollapsed = state === "collapsed";
  const [searchOpen, setSearchOpen] = useState(false);
  
  const adminName = branding?.adminName || 'FlowWink';

  const isItemActive = (href: string) =>
    location.pathname === href || (href !== "/admin" && location.pathname.startsWith(href));

  // Filter by admin role
  const roleFilteredGroups = navigationGroups.filter((group) => !group.adminOnly || isAdmin);
  
  // Filter by enabled modules
  const filteredGroups = useMemo(() => roleFilteredGroups
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
    .filter(group => group.items.length > 0), [roleFilteredGroups, modules]);

  // Flatten all items for search
  const allSearchItems = useMemo(() => 
    filteredGroups.flatMap(group => 
      group.items.map(item => ({ ...item, group: group.label }))
    ), [filteredGroups]);

  const handleSearchSelect = (href: string) => {
    setSearchOpen(false);
    navigate(href);
  };

  // Keyboard shortcut for search
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setSearchOpen((open) => !open);
      }
    };
    document.addEventListener("keydown", down);
    return () => document.removeEventListener("keydown", down);
  }, []);

  return (
    <>
      {/* Search Command Dialog */}
      <CommandDialog open={searchOpen} onOpenChange={setSearchOpen}>
        <CommandInput placeholder="Search pages..." />
        <CommandList>
          <CommandEmpty>No results found.</CommandEmpty>
          {filteredGroups.map((group) => (
            <CommandGroup key={group.label} heading={group.label}>
              {group.items.map((item) => (
                <CommandItem
                  key={item.href}
                  onSelect={() => handleSearchSelect(item.href)}
                  className="cursor-pointer"
                >
                  <item.icon className="mr-2 h-4 w-4" />
                  <span>{item.name}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          ))}
        </CommandList>
      </CommandDialog>

      <Sidebar collapsible="icon" className="border-r border-sidebar-border">
        {/* Logo */}
        <SidebarHeader className="border-b border-sidebar-border px-3 py-3">
          <div className="flex items-center justify-between gap-2">
            {!isCollapsed && (
              <span className="font-serif font-bold text-base truncate">{adminName}</span>
            )}
            <SidebarTrigger className="h-7 w-7 shrink-0" />
          </div>
        </SidebarHeader>

        {/* Search Button */}
        <div className="px-2 py-2">
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                onClick={() => setSearchOpen(true)}
                className="flex items-center gap-2 w-full px-2 py-1.5 text-sm text-sidebar-foreground/60 hover:text-sidebar-foreground hover:bg-sidebar-accent rounded-md transition-colors"
              >
                <Search className="h-4 w-4" />
                {!isCollapsed && (
                  <>
                    <span className="flex-1 text-left">Search...</span>
                    <kbd className="hidden lg:inline-flex h-5 items-center gap-1 rounded border bg-muted px-1.5 font-mono text-[10px] font-medium text-muted-foreground">
                      ⌘K
                    </kbd>
                  </>
                )}
              </button>
            </TooltipTrigger>
            {isCollapsed && <TooltipContent side="right">Search (⌘K)</TooltipContent>}
          </Tooltip>
        </div>

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
        <SidebarFooter className="border-t border-sidebar-border p-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="flex items-center gap-3 w-full p-2 rounded-md hover:bg-sidebar-accent transition-colors text-left">
                <div className="h-8 w-8 shrink-0 rounded-full bg-sidebar-accent flex items-center justify-center">
                  <span className="text-sidebar-accent-foreground font-medium text-sm">
                    {profile?.full_name?.charAt(0) || profile?.email?.charAt(0) || "?"}
                  </span>
                </div>
                {!isCollapsed && (
                  <>
                    <div className="flex-1 min-w-0 overflow-hidden">
                      <p className="text-sm font-medium truncate">{profile?.full_name || profile?.email}</p>
                      <p className="text-xs text-sidebar-foreground/60">{role ? ROLE_LABELS[role] : "Loading..."}</p>
                    </div>
                    <ChevronsUpDown className="h-4 w-4 text-sidebar-foreground/40" />
                  </>
                )}
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent 
              side={isCollapsed ? "right" : "top"} 
              align="start"
              className="w-56"
            >
              <DropdownMenuLabel className="font-normal">
                <div className="flex flex-col space-y-1">
                  <p className="text-sm font-medium">{profile?.full_name || "User"}</p>
                  <p className="text-xs text-muted-foreground truncate">{profile?.email}</p>
                </div>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem asChild>
                <Link to="/admin/profile" className="cursor-pointer">
                  <UserCircle className="mr-2 h-4 w-4" />
                  Profile
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link to="/admin/settings" className="cursor-pointer">
                  <Settings className="mr-2 h-4 w-4" />
                  Settings
                </Link>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={signOut} className="text-destructive focus:text-destructive cursor-pointer">
                <LogOut className="mr-2 h-4 w-4" />
                Sign out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </SidebarFooter>
      </Sidebar>
    </>
  );
}
