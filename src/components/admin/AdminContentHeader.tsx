import { Link, useLocation, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard, BarChart3, FileText, Users, Settings, BookOpen, Image, Mail,
  Puzzle, Webhook, UserCheck, Briefcase, Building2, Package, Library, ShoppingCart,
  CalendarDays, Plug, Bot, Zap, MessageSquare, Headphones, Megaphone, Code2,
  Video, Target, Rocket, LayoutGrid, Inbox, Menu, UserCircle, LogOut, Github, ArrowUpCircle,
} from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { AdminThemeToggle } from './AdminThemeToggle';
import { FlowPilotBriefingBell } from './FlowPilotBriefingBell';
import { NotificationsBell } from './NotificationsBell';
import { useIsModuleEnabled } from '@/hooks/useModules';
import { PinnedPagesBar } from './PinnedPagesBar';
import { useVersionCheck } from '@/hooks/useVersionCheck';
import { QuickCreateMenu } from './QuickCreateMenu';

import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

// Icon registry — resolves the stored lucide icon NAME to its component.
// The old hand-curated 31-icon map was why some pins had icons and others
// none: pin a page whose nav icon (Shield, Database, Cable, …) was not in
// the list and the lookup came back empty. The full lucide namespace covers
// every icon the navigation can use; FileText is the fallback so a pin is
// never icon-less even if a stored name goes stale.
import * as LucideIcons from 'lucide-react';
const iconMap: Record<string, React.ComponentType<{ className?: string }>> =
  LucideIcons as unknown as Record<string, React.ComponentType<{ className?: string }>>;

export function AdminContentHeader() {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, profile, signOut } = useAuth();
  const { currentVersion, latestVersion, latestReleaseUrl, hasUpdate } = useVersionCheck();
  const fpEnabled = useIsModuleEnabled('flowpilot');
  const GITHUB_RELEASES_URL = 'https://github.com/magnusfroste/flowwink/releases';

  const isCopilotMode = location.pathname === '/admin/flowpilot';

  const initials =
    profile?.full_name?.charAt(0)?.toUpperCase() ||
    profile?.email?.charAt(0)?.toUpperCase() ||
    '?';

  return (
    <div className="h-10 flex items-center gap-1 px-2 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 shrink-0">

      {/* Pinned favorites — only in dashboard mode */}
      {!isCopilotMode && (
        <div className="flex-1 flex items-center gap-0.5 overflow-x-auto scrollbar-none min-w-0 ml-1">
          <PinnedPagesBar userId={user?.id} />
        </div>
      )}

      {/* Spacer in copilot mode */}
      {isCopilotMode && <div className="flex-1" />}

      {/* Quick create + Briefing bell + Theme toggle */}
      <QuickCreateMenu />
      <NotificationsBell />
      <FlowPilotBriefingBell />
      <AdminThemeToggle />

      {/* Profile */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button className="shrink-0 rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            <Avatar className="h-7 w-7">
              <AvatarFallback className="text-[11px] font-medium bg-muted text-muted-foreground">
                {initials}
              </AvatarFallback>
            </Avatar>
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuLabel className="font-normal">
            <div className="flex flex-col space-y-1">
              <p className="text-sm font-medium">{profile?.full_name || 'User'}</p>
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
          <DropdownMenuItem asChild>
            <a
              href={hasUpdate && latestReleaseUrl ? latestReleaseUrl : GITHUB_RELEASES_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="cursor-pointer"
            >
              {hasUpdate ? (
                <>
                  <ArrowUpCircle className="mr-2 h-4 w-4 text-warning" />
                  <span className="flex-1">Update: v{latestVersion}</span>
                </>
              ) : (
                <>
                  <Github className="mr-2 h-4 w-4" />
                  <span className="flex-1">v{currentVersion}</span>
                </>
              )}
            </a>
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={signOut} className="text-destructive focus:text-destructive cursor-pointer">
            <LogOut className="mr-2 h-4 w-4" />
            Sign out
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

// Export icon map + pin hook helper for sidebar integration
export { iconMap };
