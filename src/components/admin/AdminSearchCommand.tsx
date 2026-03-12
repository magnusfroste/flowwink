import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search } from 'lucide-react';
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { useAuth } from '@/hooks/useAuth';
import { useModules } from '@/hooks/useModules';
import { navigationGroups } from './adminNavigation';

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

  const roleFilteredGroups = navigationGroups.filter(
    (group) => !group.adminOnly || isAdmin
  );

  const filteredGroups = useMemo(
    () =>
      roleFilteredGroups
        .map((group) => ({
          ...group,
          items: group.items.filter((item) => {
            if (!item.moduleId) return true;
            if (!modules) return true;
            return modules[item.moduleId]?.enabled ?? true;
          }),
        }))
        .filter((group) => group.items.length > 0),
    [roleFilteredGroups, modules]
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
