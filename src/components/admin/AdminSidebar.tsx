import { useState, useMemo, useEffect, useRef } from "react";
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
  Github,
  ArrowUpCircle,
  Headphones,
  Zap,
  Megaphone,
  Code2,
  ChevronRight,
  Video,
  Target,
  Pin,
  PinOff,
} from "lucide-react";

import { useAuth } from "@/hooks/useAuth";
import { ROLE_LABELS } from "@/types/cms";
import { useModules, type ModulesSettings } from "@/hooks/useModules";
import { usePinnedPages } from "@/hooks/usePinnedPages";
import { useBrandingSettings } from "@/hooks/useSiteSettings";
import { useVersionCheck } from "@/hooks/useVersionCheck";
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
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { supabase } from "@/integrations/supabase/client";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  Command,
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

import { navigationGroups, type NavItem, type NavGroup } from './adminNavigation';


export function AdminSidebar() {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, profile, role, signOut, isAdmin } = useAuth();
  const { state } = useSidebar();
  const { data: modules } = useModules();
  const { addPin, removePin, isPinned } = usePinnedPages(user?.id);
  const { data: branding } = useBrandingSettings();
  const { currentVersion, latestVersion, latestReleaseUrl, hasUpdate } = useVersionCheck();
  const isCollapsed = state === "collapsed";
  const [searchOpen, setSearchOpen] = useState(false);
  const sidebarScrollRef = useRef<HTMLDivElement>(null);

  // Persist scroll position in sessionStorage to survive remounts
  useEffect(() => {
    const el = sidebarScrollRef.current;
    if (!el) return;

    // Restore on mount
    const saved = sessionStorage.getItem('admin-sidebar-scroll');
    if (saved) {
      const pos = parseInt(saved, 10);
      if (pos > 0) el.scrollTop = pos;
    }

    // Save on scroll
    const handleScroll = () => {
      sessionStorage.setItem('admin-sidebar-scroll', String(el.scrollTop));
    };
    el.addEventListener('scroll', handleScroll, { passive: true });
    return () => el.removeEventListener('scroll', handleScroll);
  }, []);
  
  const adminName = branding?.adminName || 'FlowWink';
  const GITHUB_RELEASES_URL = 'https://github.com/magnusfroste/flowwink/releases';

  const isItemActive = (href: string) =>
    location.pathname === href || (href !== "/admin" && location.pathname.startsWith(href));

  // Filter by admin role
  const roleFilteredGroups = navigationGroups.filter((group) => !group.adminOnly || isAdmin);
  
  // Filter by enabled modules
  const filteredGroups = useMemo(() => roleFilteredGroups
    .map(group => ({
      ...group,
      items: group.items.filter(item => {
        if (!item.moduleId) return true;
        if (!modules) return true;
        const mod = modules[item.moduleId];
        if (!mod?.enabled) return false;
        return mod.adminUI !== false;
      }),
    }))
    .filter(group => group.items.length > 0), [roleFilteredGroups, modules]);

  // All items for search
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

  const searchInputRef = useRef<HTMLInputElement>(null);

  // Focus input when search opens
  useEffect(() => {
    if (searchOpen) {
      setTimeout(() => searchInputRef.current?.focus(), 50);
    }
  }, [searchOpen]);

  return (
    <>
      <Sidebar collapsible="icon" className="border-r border-sidebar-border">
        {/* Logo */}
        <SidebarHeader className="flex !flex-row !gap-0 !py-0 !px-3 h-10 items-center justify-between shrink-0 border-b border-sidebar-border">
          {!isCollapsed && (
            <span className="font-serif font-bold text-base truncate">{adminName}</span>
          )}
          <SidebarTrigger className="h-7 w-7 shrink-0" />
        </SidebarHeader>

        {/* Inline Search */}
        <div className="px-2 pt-1.5 pb-0.5">
          {!searchOpen ? (
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
          ) : (
            <Command className="rounded-md border border-sidebar-border bg-sidebar shadow-none">
              <CommandInput
                ref={searchInputRef}
                placeholder="Search..."
                onKeyDown={(e) => {
                  if (e.key === 'Escape') {
                    setSearchOpen(false);
                  }
                }}
                className="h-8 text-sm"
              />
              <CommandList className="max-h-[min(50vh,320px)] overflow-y-auto">
                <CommandEmpty className="py-3 text-center text-xs text-sidebar-foreground/50">No results found.</CommandEmpty>
                {Object.entries(
                  allSearchItems.reduce<Record<string, typeof allSearchItems>>((acc, item) => {
                    (acc[item.group] ??= []).push(item);
                    return acc;
                  }, {})
                ).map(([groupLabel, items]) => (
                  <CommandGroup key={groupLabel} heading={groupLabel}>
                    {items.map((item) => (
                      <CommandItem
                        key={item.href}
                        onSelect={() => handleSearchSelect(item.href)}
                        className="cursor-pointer text-sm"
                      >
                        <item.icon className="mr-2 h-4 w-4" />
                        <span>{item.name}</span>
                      </CommandItem>
                    ))}
                  </CommandGroup>
                ))}
              </CommandList>
            </Command>
          )}
        </div>

        {/* Navigation */}
        <SidebarContent ref={sidebarScrollRef} className="px-2 pt-1 pb-2">
          {filteredGroups.map((group, index) => {
            const hasActiveItem = group.items.some(item => isItemActive(item.href));

            if (group.collapsible && !isCollapsed) {
              return (
                <div key={group.label}>
                  {index > 0 && <SidebarSeparator className="my-2" />}
                  <Collapsible defaultOpen={hasActiveItem}>
                    <SidebarGroup>
                      <CollapsibleTrigger className="flex items-center w-full group/collapsible">
                        <SidebarGroupLabel className="text-[10px] text-sidebar-foreground/40 uppercase tracking-widest font-normal mb-1 transition-colors hover:text-sidebar-foreground/60 flex-1 text-left cursor-pointer">
                          {group.label}
                        </SidebarGroupLabel>
                        <ChevronRight className="h-3 w-3 text-sidebar-foreground/40 transition-transform group-data-[state=open]/collapsible:rotate-90 mr-1" />
                      </CollapsibleTrigger>
                      <CollapsibleContent>
                        <SidebarGroupContent>
                          <SidebarMenu>
                            {group.items.map((item) => {
                              const isActive = isItemActive(item.href);
                              const pinned = isPinned(item.href);
                              return (
                                <SidebarMenuItem key={item.name} className="group/pin">
                                  <SidebarMenuButton asChild isActive={isActive} tooltip={item.name}>
                                     <Link to={item.href}>
                                      <item.icon className="h-4 w-4" />
                                      <span>{item.name}</span>
                                    </Link>
                                  </SidebarMenuButton>
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      if (pinned) {
                                        removePin(item.href);
                                      } else {
                                        addPin({ href: item.href, name: item.name, icon: item.icon.displayName || item.icon.name || 'FileText' });
                                      }
                                    }}
                                    className="absolute right-1 top-1/2 -translate-y-1/2 opacity-0 group-hover/pin:opacity-100 transition-opacity p-1 rounded hover:bg-sidebar-accent"
                                    title={pinned ? 'Unpin from header' : 'Pin to header'}
                                  >
                                    {pinned ? (
                                      <PinOff className="h-3 w-3 text-sidebar-foreground/60" />
                                    ) : (
                                      <Pin className="h-3 w-3 text-sidebar-foreground/40" />
                                    )}
                                  </button>
                                </SidebarMenuItem>
                              );
                            })}
                          </SidebarMenu>
                        </SidebarGroupContent>
                      </CollapsibleContent>
                    </SidebarGroup>
                  </Collapsible>
                </div>
              );
            }

            return (
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
                        const pinned = isPinned(item.href);
                        return (
                          <SidebarMenuItem key={item.name} className="group/pin">
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
                            {!isCollapsed && (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  if (pinned) {
                                    removePin(item.href);
                                  } else {
                                    addPin({ href: item.href, name: item.name, icon: item.icon.displayName || item.icon.name || 'FileText' });
                                  }
                                }}
                                className="absolute right-1 top-1/2 -translate-y-1/2 opacity-0 group-hover/pin:opacity-100 transition-opacity p-1 rounded hover:bg-sidebar-accent"
                                title={pinned ? 'Unpin from header' : 'Pin to header'}
                              >
                                {pinned ? (
                                  <PinOff className="h-3 w-3 text-sidebar-foreground/60" />
                                ) : (
                                  <Pin className="h-3 w-3 text-sidebar-foreground/40" />
                                )}
                              </button>
                            )}
                          </SidebarMenuItem>
                        );
                      })}
                    </SidebarMenu>
                  </SidebarGroupContent>
                </SidebarGroup>
              </div>
            );
          })}
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
              
              {/* Version info */}
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
        </SidebarFooter>
      </Sidebar>
    </>
  );
}
