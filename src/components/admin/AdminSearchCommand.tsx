import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  Search,
  Building2,
  UserPlus,
  HandCoins,
  ShoppingCart,
  FileText,
  FileSignature,
  LifeBuoy,
  ScrollText,
  FolderOpen,
  BookOpen,
  Package,
  FileCode,
  Newspaper,
  User,
  Truck,
  Briefcase,
} from 'lucide-react';
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from '@/components/ui/command';
import { useAuth } from '@/hooks/useAuth';
import { useModules } from '@/hooks/useModules';
import { useNavFeatureFlags, isFeatureFlagOn } from '@/hooks/useNavFeatureFlags';
import { navigationGroups } from './adminNavigation';
import { supabase } from '@/integrations/supabase/client';

const ENTITY_META: Record<string, { label: string; icon: any; group: string }> = {
  company:    { label: 'Company',    icon: Building2,     group: 'Companies' },
  lead:       { label: 'Lead',       icon: UserPlus,      group: 'Leads' },
  deal:       { label: 'Deal',       icon: HandCoins,     group: 'Deals' },
  order:      { label: 'Order',      icon: ShoppingCart,  group: 'Orders' },
  invoice:    { label: 'Invoice',    icon: FileText,      group: 'Invoices' },
  quote:      { label: 'Quote',      icon: FileSignature, group: 'Quotes' },
  ticket:     { label: 'Ticket',     icon: LifeBuoy,      group: 'Tickets' },
  contract:   { label: 'Contract',   icon: ScrollText,    group: 'Contracts' },
  document:   { label: 'Document',   icon: FolderOpen,    group: 'Documents' },
  kb_article: { label: 'KB',         icon: BookOpen,      group: 'Knowledge' },
  product:    { label: 'Product',    icon: Package,       group: 'Products' },
  page:       { label: 'Page',       icon: FileCode,      group: 'Pages' },
  blog_post:  { label: 'Blog post',  icon: Newspaper,     group: 'Blog' },
  employee:   { label: 'Employee',   icon: User,          group: 'Employees' },
  vendor:     { label: 'Vendor',     icon: Truck,         group: 'Vendors' },
  project:    { label: 'Project',    icon: Briefcase,     group: 'Projects' },
};

interface SearchHit {
  entity_type: string;
  entity_id: string;
  title: string;
  subtitle: string | null;
  url: string;
  rank: number;
}

function useDebounced<T>(value: T, ms = 200): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setV(value), ms);
    return () => clearTimeout(id);
  }, [value, ms]);
  return v;
}

export function useAdminSearch() {
  const [searchOpen, setSearchOpen] = useState(false);

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === 'k' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setSearchOpen((open) => !open);
      }
    };
    document.addEventListener('keydown', down);
    return () => document.removeEventListener('keydown', down);
  }, []);

  return { searchOpen, setSearchOpen };
}

interface AdminSearchCommandProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function AdminSearchCommand({ open, onOpenChange }: AdminSearchCommandProps) {
  const navigate = useNavigate();
  const { isAdmin } = useAuth();
  const { data: modules } = useModules();
  const { data: featureFlags } = useNavFeatureFlags();

  const roleFilteredGroups = navigationGroups.filter(
    (group) => !group.adminOnly || isAdmin
  );

  const filteredGroups = useMemo(
    () =>
      roleFilteredGroups
        .map((group) => ({
          ...group,
          items: group.items.filter((item) => {
            if (item.moduleId) {
              if (!modules) return true;
              if (!(modules[item.moduleId]?.enabled ?? true)) return false;
            }
            if (!isFeatureFlagOn(featureFlags, item.featureFlag)) return false;
            return true;
          }),
        }))
        .filter((group) => group.items.length > 0),
    [roleFilteredGroups, modules, featureFlags]
  );

  const handleSelect = (href: string) => {
    onOpenChange(false);
    navigate(href);
  };

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange}>
      <CommandInput placeholder="Search pages..." />
      <CommandList>
        <CommandEmpty>No results found.</CommandEmpty>
        {filteredGroups.map((group) => (
          <CommandGroup key={group.label} heading={group.label}>
            {group.items.map((item) => (
              <CommandItem
                key={item.href}
                onSelect={() => handleSelect(item.href)}
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
  );
}

interface SearchButtonProps {
  onClick: () => void;
  collapsed?: boolean;
}

export function SearchButton({ onClick, collapsed }: SearchButtonProps) {
  return (
    <div className="px-2 pt-1.5 pb-0.5">
      <button
        onClick={onClick}
        className="flex items-center gap-2 w-full px-2 py-1.5 text-sm text-sidebar-foreground/60 hover:text-sidebar-foreground hover:bg-sidebar-accent rounded-md transition-colors"
      >
        <Search className="h-4 w-4" />
        {!collapsed && (
          <>
            <span className="flex-1 text-left">Search...</span>
            <kbd className="hidden lg:inline-flex h-5 items-center gap-1 rounded border bg-muted px-1.5 font-mono text-[10px] font-medium text-muted-foreground">
              ⌘K
            </kbd>
          </>
        )}
      </button>
    </div>
  );
}
