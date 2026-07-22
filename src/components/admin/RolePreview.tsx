import { Eye, ExternalLink, X } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuCheckboxItem,
  DropdownMenuItem,
} from '@/components/ui/dropdown-menu';
import { ROLE_LABELS, type AppRole } from '@/types/cms';

// Operator roles only. `customer` lives in /account (customer portal) — previewing
// it inside /admin would just render an empty admin shell. Use the "Open customer
// portal" shortcut below to jump to the real customer surface instead.
const PREVIEWABLE_ROLES: AppRole[] = [
  'sales',
  'accounting',
  'hr',
  'support',
  'warehouse',
  'marketing',
  'purchasing',
  'projects',
];

/**
 * Admin-only role preview switcher. Visual-only — server-side RLS is unchanged
 * because the real JWT is still admin. Lets an admin see the sidebar / quick
 * actions exactly as a colleague with the previewed role(s) would.
 */
export function RolePreviewSwitcher({ collapsed }: { collapsed?: boolean }) {
  const { realIsAdmin, previewRoles, setPreviewRoles } = useAuth();
  if (!realIsAdmin) return null;

  const active = previewRoles ?? [];
  const toggle = (r: AppRole) => {
    const next = active.includes(r) ? active.filter((x) => x !== r) : [...active, r];
    setPreviewRoles(next.length > 0 ? next : null);
  };

  const label = active.length === 0
    ? 'View as…'
    : active.length === 1
      ? `View: ${ROLE_LABELS[active[0]]}`
      : `View: ${active.length} roles`;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          className="flex items-center gap-2 w-full px-2 py-1.5 rounded-md text-xs text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-foreground transition-colors"
          title="Preview the admin UI as another role"
        >
          <Eye className="h-3.5 w-3.5 shrink-0" />
          {!collapsed && <span className="truncate flex-1 text-left">{label}</span>}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent side="top" align="start" className="w-56">
        <DropdownMenuLabel className="text-xs">
          Preview as role
          <p className="text-[10px] font-normal text-muted-foreground mt-0.5">
            Visual only. Your real permissions are unchanged.
          </p>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {PREVIEWABLE_ROLES.map((r) => (
          <DropdownMenuCheckboxItem
            key={r}
            checked={active.includes(r)}
            onCheckedChange={() => toggle(r)}
            onSelect={(e) => e.preventDefault()}
          >
            {ROLE_LABELS[r]}
          </DropdownMenuCheckboxItem>
        ))}
        {active.length > 0 && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => setPreviewRoles(null)}>
              <X className="mr-2 h-4 w-4" />
              Exit preview
            </DropdownMenuItem>
          </>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
          Customer view lives in the portal
        </DropdownMenuLabel>
        <DropdownMenuItem asChild>
          <a href="/account" target="_blank" rel="noopener noreferrer">
            <ExternalLink className="mr-2 h-4 w-4" />
            Open customer portal
          </a>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** Slim banner rendered at the top of the admin surface while a preview is active. */
export function RolePreviewBanner() {
  const { realIsAdmin, previewRoles, setPreviewRoles } = useAuth();
  if (!realIsAdmin || !previewRoles || previewRoles.length === 0) return null;

  const names = previewRoles.map((r) => ROLE_LABELS[r]).join(', ');
  return (
    <div className="flex items-center justify-between gap-3 border-b border-warning/40 bg-warning/10 px-4 py-1.5 text-xs text-warning-foreground">
      <div className="flex items-center gap-2">
        <Eye className="h-3.5 w-3.5" />
        <span>
          Previewing admin UI as <strong>{names}</strong>. Server permissions are unchanged.
        </span>
      </div>
      <Button
        size="sm"
        variant="ghost"
        className="h-6 px-2 text-xs"
        onClick={() => setPreviewRoles(null)}
      >
        Exit preview
      </Button>
    </div>
  );
}
