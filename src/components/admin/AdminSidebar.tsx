import { Link, useLocation } from "react-router-dom";
import { LayoutDashboard, FileText, Users, Settings, LogOut, Menu, Palette, MessageSquare, Database } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { ROLE_LABELS } from "@/types/cms";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarTrigger,
  useSidebar,
} from "@/components/ui/sidebar";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

const navigation = [
  { name: "Översikt", href: "/admin", icon: LayoutDashboard },
  { name: "Sidor", href: "/admin/pages", icon: FileText },
  { name: "Content Hub", href: "/admin/content-hub", icon: Database, adminOnly: true },
  { name: "Menyordning", href: "/admin/menu-order", icon: Menu, adminOnly: true },
  { name: "Användare", href: "/admin/users", icon: Users, adminOnly: true },
  { name: "Varumärke", href: "/admin/branding", icon: Palette, adminOnly: true },
  { name: "AI Chat", href: "/admin/chat", icon: MessageSquare, adminOnly: true },
  { name: "Inställningar", href: "/admin/settings", icon: Settings, adminOnly: true },
];

export function AdminSidebar() {
  const location = useLocation();
  const { profile, role, signOut, isAdmin } = useAuth();
  const { state } = useSidebar();
  const isCollapsed = state === "collapsed";

  const filteredNav = navigation.filter((item) => !item.adminOnly || isAdmin);

  return (
    <Sidebar collapsible="icon" className="border-r border-sidebar-border">
      {/* Logo */}
      <SidebarHeader className="border-b border-sidebar-border px-3 py-4">
        <div className="flex items-center justify-between">
          {!isCollapsed && (
            <div className="overflow-hidden">
              <span className="font-serif font-bold text-lg">Sophia</span>
              <span className="block text-xs text-sidebar-foreground/60">CMS</span>
            </div>
          )}
          <SidebarTrigger className="h-8 w-8" />
        </div>
      </SidebarHeader>

      {/* Navigation */}
      <SidebarContent className="px-2 py-4">
        <SidebarMenu>
          {filteredNav.map((item) => {
            const isActive =
              location.pathname === item.href || (item.href !== "/admin" && location.pathname.startsWith(item.href));

            return (
              <SidebarMenuItem key={item.name}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <SidebarMenuButton
                      asChild
                      isActive={isActive}
                      tooltip={item.name}
                    >
                      <Link to={item.href}>
                        <item.icon className="h-5 w-5" />
                        <span>{item.name}</span>
                      </Link>
                    </SidebarMenuButton>
                  </TooltipTrigger>
                  {isCollapsed && (
                    <TooltipContent side="right">
                      {item.name}
                    </TooltipContent>
                  )}
                </Tooltip>
              </SidebarMenuItem>
            );
          })}
        </SidebarMenu>
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
              <p className="text-xs text-sidebar-foreground/60">{role ? ROLE_LABELS[role] : "Laddar..."}</p>
            </div>
          )}
        </div>
        <SidebarMenu>
          <SidebarMenuItem>
            <Tooltip>
              <TooltipTrigger asChild>
                <SidebarMenuButton onClick={signOut} tooltip="Logga ut">
                  <LogOut className="h-4 w-4" />
                  <span>Logga ut</span>
                </SidebarMenuButton>
              </TooltipTrigger>
              {isCollapsed && (
                <TooltipContent side="right">
                  Logga ut
                </TooltipContent>
              )}
            </Tooltip>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}
