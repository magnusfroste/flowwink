import { Link, useLocation, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard, BarChart3, FileText, Users, Settings, BookOpen, Image, Mail,
  Puzzle, Webhook, UserCheck, Briefcase, Building2, Package, Library, ShoppingCart,
  CalendarDays, Plug, Bot, Zap, MessageSquare, Headphones, Megaphone, Code2,
  Video, Target, Rocket, LayoutGrid, Inbox, Menu, UserCircle, LogOut, Pin, PinOff,
  Github, ArrowUpCircle,
} from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { AdminThemeToggle } from './AdminThemeToggle';
import { FlowPilotBriefingBell } from './FlowPilotBriefingBell';
import { usePinnedPages } from '@/hooks/usePinnedPages';
import { useVersionCheck } from '@/hooks/useVersionCheck';

import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Tooltip, TooltipContent, TooltipTrigger,
} from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

// Icon registry — maps icon name strings to components
const iconMap: Record<string, React.ComponentType<{ className?: string }>> = {
  LayoutDashboard, BarChart3, FileText, Users, Settings, BookOpen, Image, Mail,
  Puzzle, Webhook, UserCheck, Briefcase, Building2, Package, Library, ShoppingCart,
  CalendarDays, Plug, Bot, Zap, MessageSquare, Headphones, Megaphone, Code2,
  Video, Target, Rocket, LayoutGrid, Inbox, Menu, UserCircle,
};

export function AdminContentHeader() {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, profile, signOut } = useAuth();
  const { pins, removePin } = usePinnedPages(user?.id);
  const { currentVersion, latestVersion, latestReleaseUrl, hasUpdate } = useVersionCheck();
  const GITHUB_RELEASES_URL = 'https://github.com/magnusfroste/flowwink/releases';

  const isCopilotMode = location.pathname === '/admin/flowpilot';

  const initials =
    profile?.full_name?.charAt(0)?.toUpperCase() ||
    profile?.email?.charAt(0)?.toUpperCase() ||
    '?';

  return (
    <div className="h-10 flex items-center gap-1 px-2 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 shrink-0">

      {/* Mode toggle pills */}
      <div className="flex items-center bg-muted/50 rounded-lg p-0.5 gap-0.5 ml-1 shrink-0">
        <button
          onClick={() => navigate('/admin')}
          className={cn(
            'flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-medium transition-colors',
            !isCopilotMode
              ? 'bg-background text-foreground shadow-sm'
              : 'text-muted-foreground hover:text-foreground',
          )}
        >
          <LayoutDashboard className="h-3.5 w-3.5" />
          Dashboard
        </button>
        <button
          onClick={() => navigate('/admin/flowpilot')}
          className={cn(
            'flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-medium transition-colors',
            isCopilotMode
              ? 'bg-background text-foreground shadow-sm'
              : 'text-muted-foreground hover:text-foreground',
          )}
        >
          <Zap className="h-3.5 w-3.5" />
          FlowPilot
        </button>
      </div>

      {/* Pinned favorites — only in dashboard mode */}
      {!isCopilotMode && (
        <div className="flex-1 flex items-center gap-0.5 overflow-x-auto scrollbar-none min-w-0 ml-1">
          {pins.map((pin) => {
            const Icon = iconMap[pin.icon];
            const isActive =
              location.pathname === pin.href ||
              (pin.href !== '/admin' && location.pathname.startsWith(pin.href));

            return (
              <Tooltip key={pin.href}>
                <TooltipTrigger asChild>
                  <Link
                    to={pin.href}
                    className={cn(
                      'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium whitespace-nowrap transition-colors',
                      isActive
                        ? 'bg-accent text-accent-foreground'
                        : 'text-muted-foreground hover:text-foreground hover:bg-muted',
                    )}
                  >
                    {Icon && <Icon className="h-3.5 w-3.5 shrink-0" />}
                    <span className="hidden sm:inline">{pin.name}</span>
                  </Link>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="flex items-center gap-2">
                  {pin.name}
                  <button
                    onClick={(e) => {
                      e.preventDefault();
                      removePin(pin.href);
                    }}
                    className="text-muted-foreground hover:text-destructive"
                  >
                    <PinOff className="h-3 w-3" />
                  </button>
                </TooltipContent>
              </Tooltip>
            );
          })}
          {pins.length === 0 && (
            <span className="text-xs text-muted-foreground/50 ml-1 select-none">
              Pin pages here for quick access
            </span>
          )}
        </div>
      )}

      {/* Spacer in copilot mode */}
      {isCopilotMode && <div className="flex-1" />}

      {/* Briefing bell + Theme toggle */}
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
                  <span className="flex-1">v{currentVersion} → v{latestVersion}</span>
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
