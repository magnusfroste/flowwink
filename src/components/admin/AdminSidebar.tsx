import { Link, useLocation } from "react-router-dom";
import { LayoutDashboard, FileText, Users, Settings, LogOut, ChevronRight, Menu } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { ROLE_LABELS } from "@/types/cms";

const navigation = [
  { name: "Översikt", href: "/admin", icon: LayoutDashboard },
  { name: "Sidor", href: "/admin/pages", icon: FileText },
  { name: "Menyordning", href: "/admin/menu-order", icon: Menu, adminOnly: true },
  { name: "Användare", href: "/admin/users", icon: Users, adminOnly: true },
  { name: "Inställningar", href: "/admin/settings", icon: Settings, adminOnly: true },
];

export function AdminSidebar() {
  const location = useLocation();
  const { profile, role, signOut, isAdmin } = useAuth();

  const filteredNav = navigation.filter((item) => !item.adminOnly || isAdmin);

  return (
    <div className="flex h-full w-64 flex-col bg-sidebar text-sidebar-foreground">
      {/* Logo */}
      <div className="flex h-16 items-center gap-2 border-b border-sidebar-border px-6">
        <div className="h-8 w-8 rounded-lg bg-primary flex items-center justify-center">
          <span className="text-primary-foreground font-serif font-bold text-lg">S</span>
        </div>
        <div>
          <span className="font-serif font-bold text-lg">Sophia</span>
          <span className="block text-xs text-sidebar-foreground/60">CMS</span>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 space-y-1 px-3 py-4">
        {filteredNav.map((item) => {
          const isActive =
            location.pathname === item.href || (item.href !== "/admin" && location.pathname.startsWith(item.href));

          return (
            <Link
              key={item.name}
              to={item.href}
              className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                isActive
                  ? "bg-sidebar-accent text-sidebar-accent-foreground"
                  : "text-sidebar-foreground/80 hover:bg-sidebar-accent/50 hover:text-sidebar-accent-foreground",
              )}
            >
              <item.icon className="h-5 w-5" />
              <span>{item.name}</span>
              {isActive && <ChevronRight className="ml-auto h-4 w-4" />}
            </Link>
          );
        })}
      </nav>

      {/* User section */}
      <div className="border-t border-sidebar-border p-4">
        <div className="flex items-center gap-3 mb-3">
          <div className="h-10 w-10 rounded-full bg-sidebar-accent flex items-center justify-center">
            <span className="text-sidebar-accent-foreground font-medium">
              {profile?.full_name?.charAt(0) || profile?.email?.charAt(0) || "?"}
            </span>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium truncate">{profile?.full_name || profile?.email}</p>
            <p className="text-xs text-sidebar-foreground/60">{role ? ROLE_LABELS[role] : "Laddar..."}</p>
          </div>
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="w-full justify-start text-sidebar-foreground/80 hover:text-sidebar-foreground hover:bg-sidebar-accent/50"
          onClick={signOut}
        >
          <LogOut className="h-4 w-4 mr-2" />
          Logga ut
        </Button>
      </div>
    </div>
  );
}
