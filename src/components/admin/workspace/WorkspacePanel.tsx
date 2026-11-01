import { Link, useLocation, useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useBrandingSettings } from '@/hooks/useSiteSettings';
import { leaveWorkspace } from '@/hooks/useWorkspace';
import { activeItem, type WorkspaceBadge, type WorkspaceDef, type WorkspaceSection } from '@/lib/workspaces';
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from '@/components/ui/select';
import { SidebarBadge } from '@/components/admin/SidebarBadge';
import { useBooksHealth } from '@/hooks/useBooksHealth';

interface Props {
  def: WorkspaceDef;
  sections: WorkspaceSection[];
}

function BooksAttentionCount() {
  const { data } = useBooksHealth();
  // The same figure the Overview's Needs attention card leads with.
  const n = data?.summary.total ?? 0;
  if (n <= 0) return null;
  return (
    <span className="ml-auto inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-warning px-1 text-[10px] font-medium text-warning-foreground" title="Findings that need attention in the books">
      {n > 99 ? '99+' : n}
    </span>
  );
}

function Badge({ kind }: { kind: WorkspaceBadge }) {
  if (kind === 'books_attention') return <BooksAttentionCount />;
  if (kind === 'pending_expenses') return <SidebarBadge href="/admin/expenses" />;
  return <SidebarBadge href="/admin/approvals" />;
}

/**
 * The workspace's own left menu (desktop), beside the folded FlowWink rail.
 * See src/lib/workspaces.ts for when it shows and to whom.
 */
export function WorkspacePanel({ def, sections }: Props) {
  const { pathname, search } = useLocation();
  const { data: branding } = useBrandingSettings();
  const current = activeItem(def, pathname, search);
  const home = branding?.adminName || 'FlowWink';

  return (
    <aside className="hidden md:flex w-56 shrink-0 flex-col border-r border-border bg-muted/30" aria-label={`${def.label} menu`}>
      <div className="flex h-10 shrink-0 items-center border-b border-border px-3">
        <Link
          to="/admin"
          onClick={leaveWorkspace}
          className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
          title={`Leave ${def.label} and go back to ${home}`}
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          {home}
        </Link>
      </div>
      <div className="px-3 pb-1 pt-3 text-sm font-semibold">{def.label}</div>
      <nav className="flex-1 overflow-y-auto px-2 pb-4">
        {sections.map((section) => (
          <div key={section.label} className="mt-3 first:mt-1">
            <div className="px-2 pb-1 text-[10px] uppercase tracking-widest text-muted-foreground/70">{section.label}</div>
            <ul className="space-y-0.5">
              {section.items.map((item) => {
                const active = current?.id === item.id;
                const Icon = item.icon;
                return (
                  <li key={item.id}>
                    <Link
                      to={item.href}
                      aria-current={active ? 'page' : undefined}
                      className={cn(
                        'flex items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors',
                        active ? 'bg-accent font-medium text-accent-foreground' : 'text-foreground/80 hover:bg-accent/60 hover:text-foreground',
                      )}
                    >
                      <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
                      <span className="truncate">{item.label}</span>
                      {item.badge && <Badge kind={item.badge} />}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>
    </aside>
  );
}

/** On a phone there is no room for a second column: the same menu as a picker above the page. */
export function WorkspaceMobileNav({ def, sections }: Props) {
  const { pathname, search } = useLocation();
  const navigate = useNavigate();
  const current = activeItem(def, pathname, search);
  const byId = new Map(sections.flatMap((s) => s.items).map((i) => [i.id, i]));

  return (
    <div className="mb-4 flex items-center gap-2 md:hidden">
      <Link to="/admin" onClick={leaveWorkspace} className="shrink-0 rounded-md p-2 text-muted-foreground hover:bg-accent" aria-label={`Leave ${def.label}`}>
        <ArrowLeft className="h-4 w-4" />
      </Link>
      <Select value={current?.id} onValueChange={(id) => { const it = byId.get(id); if (it) navigate(it.href); }}>
        <SelectTrigger className="flex-1" aria-label={`${def.label} menu`}>
          <SelectValue placeholder={def.label} />
        </SelectTrigger>
        <SelectContent>
          {sections.map((s) => (
            <SelectGroup key={s.label}>
              <SelectLabel className="text-[11px] uppercase tracking-wider text-muted-foreground">{s.label}</SelectLabel>
              {s.items.map((i) => <SelectItem key={i.id} value={i.id}>{i.label}</SelectItem>)}
            </SelectGroup>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
