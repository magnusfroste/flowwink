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
  Receipt,
  CalendarPlus,
  Megaphone,
  ClipboardList,
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
import type { AppRole } from '@/types/cms';

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

interface QuickAction {
  label: string;
  href: string;
  icon: any;
  moduleId?: string;
  roles: AppRole[]; // admin sees all
}

// Role-aware quick creates surfaced at the top of ⌘K. Filtered by user roles + enabled modules.
const QUICK_ACTIONS: QuickAction[] = [
  // Sales
  { label: 'New lead',            href: '/admin/leads?new=1',           icon: UserPlus,      moduleId: 'leads',       roles: ['sales', 'marketing'] },
  { label: 'New deal',            href: '/admin/deals?new=1',           icon: HandCoins,     moduleId: 'deals',       roles: ['sales'] },
  { label: 'New quote',           href: '/admin/quotes/new',            icon: FileSignature, moduleId: 'quotes',      roles: ['sales'] },
  { label: 'New company',         href: '/admin/companies?new=1',       icon: Building2,     moduleId: 'companies',   roles: ['sales', 'accounting', 'support'] },
  // Accounting / CFO
  { label: 'New invoice',         href: '/admin/invoices/new',          icon: FileText,      moduleId: 'invoicing',   roles: ['accounting', 'sales'] },
  { label: 'New expense',         href: '/admin/expenses?new=1',        icon: Receipt,       moduleId: 'expenses',    roles: ['accounting', 'hr'] },
  { label: 'New purchase order',  href: '/admin/purchase-orders?new=1', icon: ClipboardList, moduleId: 'purchasing',  roles: ['purchasing', 'accounting'] },
  // Support
  { label: 'New ticket',          href: '/admin/tickets?new=1',         icon: LifeBuoy,      moduleId: 'tickets',     roles: ['support'] },
  // HR
  { label: 'New employee',        href: '/admin/employees?new=1',       icon: User,          moduleId: 'hr',          roles: ['hr'] },
  { label: 'New job posting',     href: '/admin/recruitment?new=1',     icon: Briefcase,     moduleId: 'recruitment', roles: ['hr'] },
  // Marketing / content
  { label: 'New blog post',       href: '/admin/blog/new',              icon: Newspaper,     moduleId: 'blog',        roles: ['marketing'] },
  { label: 'New page',            href: '/admin/pages/new',             icon: FileCode,      moduleId: 'pages',       roles: ['marketing'] },
  { label: 'New campaign',        href: '/admin/campaigns?new=1',       icon: Megaphone,     moduleId: 'growth',      roles: ['marketing'] },
  // Projects
  { label: 'New project',         href: '/admin/projects?new=1',        icon: Briefcase,     moduleId: 'projects',    roles: ['projects'] },
  { label: 'New task',            href: '/admin/tasks?new=1',           icon: CalendarPlus,  moduleId: 'projects',    roles: ['projects', 'sales', 'support'] },
  // Warehouse / purchasing
  { label: 'New product',         href: '/admin/products?new=1',        icon: Package,       moduleId: 'products',    roles: ['warehouse', 'sales'] },
  { label: 'New vendor',          href: '/admin/vendors?new=1',         icon: Truck,         moduleId: 'vendors',     roles: ['purchasing', 'warehouse'] },
];

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
  const [query, setQuery] = useState('');
  const debouncedQuery = useDebounced(query, 200);

  useEffect(() => {
    if (!open) setQuery('');
  }, [open]);

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

  const { data: hits, isFetching } = useQuery({
    queryKey: ['global-search', debouncedQuery],
    enabled: isAdmin && open && debouncedQuery.trim().length >= 2,
    queryFn: async (): Promise<SearchHit[]> => {
      const { data, error } = await supabase.rpc('global_search' as any, {
        search_query: debouncedQuery,
        result_limit: 6,
      });
      if (error) throw error;
      return (data ?? []) as SearchHit[];
    },
    staleTime: 10_000,
  });

  const hitsByGroup = useMemo(() => {
    const map = new Map<string, SearchHit[]>();
    for (const h of hits ?? []) {
      const key = ENTITY_META[h.entity_type]?.group ?? h.entity_type;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(h);
    }
    return Array.from(map.entries());
  }, [hits]);

  const handleSelect = (href: string) => {
    onOpenChange(false);
    navigate(href);
  };

  const showingDataResults = debouncedQuery.trim().length >= 2;

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange}>
      <CommandInput
        placeholder="Search pages, leads, orders, invoices, contracts…"
        value={query}
        onValueChange={setQuery}
      />
      <CommandList>
        <CommandEmpty>
          {isFetching ? 'Searching…' : 'No results found.'}
        </CommandEmpty>

        {showingDataResults &&
          hitsByGroup.map(([group, items]) => (
            <CommandGroup key={`hit-${group}`} heading={group}>
              {items.map((hit) => {
                const meta = ENTITY_META[hit.entity_type];
                const Icon = meta?.icon ?? FileText;
                return (
                  <CommandItem
                    key={`${hit.entity_type}-${hit.entity_id}`}
                    value={`${hit.entity_type} ${hit.title} ${hit.subtitle ?? ''} ${hit.entity_id}`}
                    onSelect={() => handleSelect(hit.url)}
                    className="cursor-pointer"
                  >
                    <Icon className="mr-2 h-4 w-4 shrink-0" />
                    <div className="flex flex-col min-w-0">
                      <span className="truncate">{hit.title || '(untitled)'}</span>
                      {hit.subtitle && (
                        <span className="text-xs text-muted-foreground truncate">
                          {hit.subtitle}
                        </span>
                      )}
                    </div>
                  </CommandItem>
                );
              })}
            </CommandGroup>
          ))}

        {showingDataResults && hitsByGroup.length > 0 && <CommandSeparator />}

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
