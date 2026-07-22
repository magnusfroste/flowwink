import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Plus, UserPlus, Briefcase, CheckSquare, LifeBuoy, HandCoins, FileSignature,
  Building2, FileText, Receipt, ClipboardList, User, Newspaper, FileCode,
  Megaphone, Package, Truck, Image as ImageIcon, FolderKanban, BookOpen, Clock,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
  DropdownMenuLabel, DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { CreateLeadDialog } from '@/components/admin/CreateLeadDialog';
import { CreateTaskDialog } from '@/components/admin/CreateTaskDialog';
import { CreateTicketDialog } from '@/components/admin/tickets/CreateTicketDialog';
import { useEnabledModules } from '@/hooks/useModules';
import { useAuth } from '@/hooks/useAuth';
import type { AppRole } from '@/types/cms';

type DialogKey = 'lead' | 'task' | 'ticket' | null;

type QuickAction =
  | { kind: 'dialog'; key: Exclude<DialogKey, null>; label: string; icon: React.ElementType; moduleId?: string; roles: AppRole[] }
  | { kind: 'nav'; href: string; label: string; icon: React.ElementType; moduleId?: string; roles: AppRole[] };

// Same role/module filter as the ⌘K quick-create shortcuts, so what you see in
// the +-menu matches what a real signed-in user of that role would see.
const ACTIONS: QuickAction[] = [
  { kind: 'dialog', key: 'lead',   label: 'Contact / lead',  icon: UserPlus,      moduleId: 'leads',       roles: ['sales', 'marketing'] },
  { kind: 'nav',    href: '/admin/deals?new=1',           label: 'Deal',           icon: HandCoins,     moduleId: 'deals',       roles: ['sales'] },
  { kind: 'nav',    href: '/admin/quotes?new=1',          label: 'Quote',          icon: FileSignature, moduleId: 'quotes',      roles: ['sales'] },
  { kind: 'nav',    href: '/admin/companies?new=1',       label: 'Company',        icon: Building2,     moduleId: 'companies',   roles: ['sales', 'accounting', 'support'] },
  { kind: 'nav',    href: '/admin/invoices?new=1',        label: 'Invoice',        icon: FileText,      moduleId: 'invoicing',   roles: ['accounting', 'sales'] },
  { kind: 'nav',    href: '/admin/expenses?new=1',        label: 'Expense',        icon: Receipt,       moduleId: 'expenses',    roles: ['accounting', 'hr'] },
  { kind: 'nav',    href: '/admin/purchase-orders?new=1', label: 'Purchase order', icon: ClipboardList, moduleId: 'purchasing',  roles: ['purchasing', 'accounting'] },
  { kind: 'dialog', key: 'ticket', label: 'Ticket',         icon: LifeBuoy,      moduleId: 'tickets',     roles: ['support'] },
  { kind: 'nav',    href: '/admin/hr?new=1',              label: 'Employee',       icon: User,          moduleId: 'hr',          roles: ['hr'] },
  { kind: 'nav',    href: '/admin/recruitment?new=1',     label: 'Job posting',    icon: Briefcase,     moduleId: 'recruitment', roles: ['hr'] },
  { kind: 'nav',    href: '/admin/blog/new',              label: 'Blog post',      icon: Newspaper,     moduleId: 'blog',        roles: ['marketing'] },
  { kind: 'nav',    href: '/admin/pages/new',             label: 'Page',           icon: FileCode,      moduleId: 'pages',       roles: ['marketing'] },
  { kind: 'nav',    href: '/admin/campaigns?new=1',       label: 'Campaign',       icon: Megaphone,     moduleId: 'paidGrowth',  roles: ['marketing'] },
  { kind: 'nav',    href: '/admin/media?upload=1',        label: 'Media upload',   icon: ImageIcon,     moduleId: 'media',       roles: ['marketing'] },
  { kind: 'nav',    href: '/admin/projects?new=1',        label: 'Project',        icon: FolderKanban,  moduleId: 'projects',    roles: ['projects'] },
  { kind: 'nav',    href: '/admin/products?new=1',        label: 'Product',        icon: Package,       moduleId: 'ecommerce',   roles: ['warehouse', 'sales'] },
  { kind: 'nav',    href: '/admin/vendors?new=1',         label: 'Vendor',         icon: Truck,         moduleId: 'purchasing',  roles: ['purchasing', 'warehouse'] },
  { kind: 'nav',    href: '/admin/accounting?tab=journal&new=1', label: 'Journal entry', icon: BookOpen, moduleId: 'accounting', roles: ['accounting'] },
  { kind: 'nav',    href: '/admin/timesheets?tab=entries&new=1', label: 'Time entry',    icon: Clock,    moduleId: 'projects',   roles: ['projects', 'hr', 'sales'] },
  // Task is available to everyone with an operator role — it's the universal capture surface.
  { kind: 'dialog', key: 'task',   label: 'Activity / task', icon: CheckSquare,   roles: ['sales', 'support', 'hr', 'accounting', 'warehouse', 'marketing', 'purchasing', 'projects'] },
];

export function QuickCreateMenu() {
  const navigate = useNavigate();
  const [active, setActive] = useState<DialogKey>(null);
  const { isAdmin, roles } = useAuth();
  const enabledModules = useEnabledModules();
  const enabledModuleIds = useMemo(() => new Set<string>(enabledModules), [enabledModules]);

  const visible = useMemo(() => {
    return ACTIONS.filter((a) => {
      if (a.moduleId && !enabledModuleIds.has(a.moduleId)) return false;
      if (isAdmin) return true;
      return a.roles.some((r) => roles.includes(r));
    });
  }, [enabledModuleIds, isAdmin, roles]);

  // Keyboard shortcut: "c" opens menu via simulated click target
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || (e.target as HTMLElement)?.isContentEditable) return;
      if (e.key === 'c' && !e.metaKey && !e.ctrlKey && !e.altKey) {
        e.preventDefault();
        document.getElementById('quick-create-trigger')?.click();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  if (visible.length === 0) return null;

  return (
    <>
      <DropdownMenu>
        <Tooltip>
          <TooltipTrigger asChild>
            <DropdownMenuTrigger asChild>
              <Button id="quick-create-trigger" size="icon" variant="ghost" className="h-7 w-7 shrink-0">
                <Plus className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
          </TooltipTrigger>
          <TooltipContent side="bottom">Quick create (c)</TooltipContent>
        </Tooltip>
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuLabel className="text-xs text-muted-foreground">Create new</DropdownMenuLabel>
          <DropdownMenuSeparator />
          {visible.map((a) => {
            const Icon = a.icon;
            return (
              <DropdownMenuItem
                key={a.kind === 'dialog' ? `d:${a.key}` : `n:${a.href}`}
                onSelect={() => {
                  if (a.kind === 'dialog') setActive(a.key);
                  else navigate(a.href);
                }}
              >
                <Icon className="mr-2 h-4 w-4" /> {a.label}
              </DropdownMenuItem>
            );
          })}
        </DropdownMenuContent>
      </DropdownMenu>

      <CreateLeadDialog open={active === 'lead'} onOpenChange={(o) => !o && setActive(null)} />
      <CreateTaskDialog open={active === 'task'} onOpenChange={(o) => !o && setActive(null)} />
      <CreateTicketDialog hideTrigger open={active === 'ticket'} onOpenChange={(o) => !o && setActive(null)} />
    </>
  );
}
