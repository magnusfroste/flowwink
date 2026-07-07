import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  FileText,
  Plus,
  Search,
} from 'lucide-react';
import {
  useAccountingTemplates,
  useDeleteAccountingTemplate,
  type AccountingTemplate,
} from '@/hooks/useAccounting';
import { Skeleton } from '@/components/ui/skeleton';
import { useAccountingLocale } from '@/hooks/useAccountingLocale';
import { EditTemplateDialog } from './EditTemplateDialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import { AccountingTabHeader } from './AccountingTabHeader';

type SortKey = 'uses' | 'entries' | 'corrections' | 'last_used' | 'name';
type SortDir = 'asc' | 'desc';

interface TemplateLineRow {
  account_code: string;
  account_name?: string;
  debit_pct?: number;
  credit_pct?: number;
  type?: 'debit' | 'credit';
}

interface TemplateStats {
  entries: number;
  corrections: number;
  lastUsed: string | null;
}

function deriveDirection(lines: TemplateLineRow[]): 'in' | 'out' | 'n/a' {
  for (const l of lines || []) {
    if (!l?.account_code?.startsWith('19')) continue;
    const cp = Number(l.credit_pct ?? (l.type === 'credit' ? 100 : 0));
    const dp = Number(l.debit_pct ?? (l.type === 'debit' ? 100 : 0));
    if (cp > 0) return 'out';
    if (dp > 0) return 'in';
  }
  return 'n/a';
}

function fmtDate(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
  });
}

export function TemplatesTab() {
  const { locale } = useAccountingLocale();
  const { data: templates, isLoading } = useAccountingTemplates(locale);
  const deleteMut = useDeleteAccountingTemplate();

  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [sortKey, setSortKey] = useState<SortKey>('uses');
  const [sortDir, setSortDir] = useState<SortDir>('desc');

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<AccountingTemplate | null>(null);
  const [cloneTarget, setCloneTarget] = useState<AccountingTemplate | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<AccountingTemplate | null>(null);

  // Grouped stats — two queries total, aggregated client-side.
  const { data: stats } = useQuery({
    queryKey: ['template-registry-stats'],
    queryFn: async (): Promise<Map<string, TemplateStats>> => {
      const [entriesRes, correctionsRes] = await Promise.all([
        supabase
          .from('journal_entries')
          .select('id, template_id, created_at')
          .not('template_id', 'is', null)
          .limit(50000),
        supabase
          .from('accounting_corrections')
          .select('journal_entry_id')
          .limit(50000),
      ]);
      if (entriesRes.error) throw entriesRes.error;
      if (correctionsRes.error) throw correctionsRes.error;

      const entryToTemplate = new Map<string, string>();
      const byTemplate = new Map<string, TemplateStats>();

      for (const e of entriesRes.data ?? []) {
        const tid = (e as any).template_id as string;
        entryToTemplate.set((e as any).id, tid);
        const s = byTemplate.get(tid) ?? { entries: 0, corrections: 0, lastUsed: null };
        s.entries += 1;
        const created = (e as any).created_at as string;
        if (!s.lastUsed || created > s.lastUsed) s.lastUsed = created;
        byTemplate.set(tid, s);
      }

      for (const c of correctionsRes.data ?? []) {
        const eid = (c as any).journal_entry_id as string | null;
        if (!eid) continue;
        const tid = entryToTemplate.get(eid);
        if (!tid) continue;
        const s = byTemplate.get(tid) ?? { entries: 0, corrections: 0, lastUsed: null };
        s.corrections += 1;
        byTemplate.set(tid, s);
      }

      return byTemplate;
    },
  });

  const categories = useMemo(() => {
    const set = new Set<string>();
    (templates ?? []).forEach((t) => set.add(t.category || 'general'));
    return Array.from(set).sort();
  }, [templates]);

  const rows = useMemo(() => {
    const s = search.toLowerCase();
    const list = (templates ?? [])
      .filter((t) => categoryFilter === 'all' || (t.category || 'general') === categoryFilter)
      .filter(
        (t) =>
          !s ||
          t.template_name.toLowerCase().includes(s) ||
          (t.keywords ?? []).some((k) => k.toLowerCase().includes(s)),
      )
      .map((t) => {
        const st = stats?.get(t.id) ?? { entries: 0, corrections: 0, lastUsed: null };
        return {
          template: t,
          direction: deriveDirection(t.template_lines as TemplateLineRow[]),
          uses: t.usage_count ?? 0,
          entries: st.entries,
          corrections: st.corrections,
          lastUsed: st.lastUsed,
        };
      });

    const dir = sortDir === 'asc' ? 1 : -1;
    list.sort((a, b) => {
      switch (sortKey) {
        case 'name':
          return a.template.template_name.localeCompare(b.template.template_name) * dir;
        case 'entries':
          return (a.entries - b.entries) * dir;
        case 'corrections':
          return (a.corrections - b.corrections) * dir;
        case 'last_used': {
          const av = a.lastUsed ?? '';
          const bv = b.lastUsed ?? '';
          return av.localeCompare(bv) * dir;
        }
        case 'uses':
        default:
          return (a.uses - b.uses) * dir;
      }
    });
    return list;
  }, [templates, stats, search, categoryFilter, sortKey, sortDir]);

  const summary = useMemo(() => {
    const all = templates ?? [];
    const neverUsed = all.filter((t) => {
      const st = stats?.get(t.id);
      return !st || st.entries === 0;
    }).length;
    const withCorrections = all.filter((t) => (stats?.get(t.id)?.corrections ?? 0) > 0).length;
    return { total: all.length, neverUsed, withCorrections };
  }, [templates, stats]);

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir(key === 'name' ? 'asc' : 'desc');
    }
  }

  const openNew = () => {
    setEditTarget(null);
    setCloneTarget(null);
    setDialogOpen(true);
  };
  const openEdit = (t: AccountingTemplate) => {
    setEditTarget(t);
    setCloneTarget(null);
    setDialogOpen(true);
  };
  const openClone = (t: AccountingTemplate) => {
    setEditTarget(null);
    setCloneTarget(t);
    setDialogOpen(true);
  };

  if (isLoading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-10" />
        <Skeleton className="h-96" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <AccountingTabHeader
        title="Templates"
        description="Reusable booking recipes for common events. Frequent, correction-free templates keep autonomous bookkeeping trustworthy."
        actions={
          <Button size="sm" variant="outline" onClick={openNew}>
            <Plus className="h-4 w-4 mr-1" />
            New template
          </Button>
        }
      />

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search name or keyword…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10 h-9"
          />
        </div>
        <Select value={categoryFilter} onValueChange={setCategoryFilter}>
          <SelectTrigger className="w-[180px] h-9">
            <SelectValue placeholder="All categories" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All categories</SelectItem>
            {categories.map((c) => (
              <SelectItem key={c} value={c}>
                {c}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Summary */}
      <p className="text-xs text-muted-foreground">
        {summary.total} templates · {summary.neverUsed} never used ·{' '}
        <span className={summary.withCorrections > 0 ? 'text-warning' : ''}>
          {summary.withCorrections} with corrections
        </span>
      </p>


      {/* Table */}
      {rows.length === 0 ? (
        <div className="rounded-lg border bg-card py-16 text-center">
          <FileText className="h-10 w-10 text-muted-foreground/50 mx-auto mb-3" />
          <h3 className="text-sm font-medium mb-1">No templates match</h3>
          <p className="text-sm text-muted-foreground mb-4">
            Adjust the filters or create a new template.
          </p>
          <Button variant="outline" size="sm" onClick={openNew}>
            <Plus className="h-4 w-4 mr-1" />
            New template
          </Button>
        </div>
      ) : (
        <div className="rounded-lg border bg-card overflow-hidden">
          <div className="grid grid-cols-[minmax(0,1fr)_5rem_5rem_6rem_6rem_7rem_2rem] gap-4 px-4 py-2 border-b text-xs text-muted-foreground">
            <SortHeader label="Template" active={sortKey === 'name'} dir={sortDir} onClick={() => toggleSort('name')} />
            <div>Direction</div>
            <SortHeader label="Uses" align="right" active={sortKey === 'uses'} dir={sortDir} onClick={() => toggleSort('uses')} />
            <SortHeader label="Booked" align="right" active={sortKey === 'entries'} dir={sortDir} onClick={() => toggleSort('entries')} />
            <SortHeader label="Corrections" align="right" active={sortKey === 'corrections'} dir={sortDir} onClick={() => toggleSort('corrections')} />
            <SortHeader label="Last used" align="right" active={sortKey === 'last_used'} dir={sortDir} onClick={() => toggleSort('last_used')} />
            <div />
          </div>

          <div className="divide-y">
            {rows.map((row) => (
              <div
                key={row.template.id}
                onClick={() => openEdit(row.template)}
                className="grid grid-cols-[minmax(0,1fr)_5rem_5rem_6rem_6rem_7rem_2rem] gap-4 px-4 py-3 items-center text-sm cursor-pointer hover:bg-muted/40"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="truncate font-medium">{row.template.template_name}</span>
                    {row.template.is_system && (
                      <Badge variant="outline" className="text-[10px] font-normal px-1.5 py-0">
                        system
                      </Badge>
                    )}
                  </div>
                  <div className="text-xs text-muted-foreground truncate">
                    {row.template.category || 'general'}
                  </div>
                </div>

                <DirectionBadge dir={row.direction} />

                <div className="text-right font-mono tabular-nums">{row.uses}</div>
                <div className="text-right font-mono tabular-nums">{row.entries}</div>
                <div
                  className={cn(
                    'text-right font-mono tabular-nums',
                    row.corrections > 0 && 'text-warning font-medium',
                  )}
                >
                  {row.corrections}
                </div>
                <div className="text-right text-xs text-muted-foreground">
                  {fmtDate(row.lastUsed)}
                </div>

                <div onClick={(e) => e.stopPropagation()} className="justify-self-end">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground">
                        …
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => openEdit(row.template)}>Edit</DropdownMenuItem>
                      <DropdownMenuItem onClick={() => openClone(row.template)}>Clone</DropdownMenuItem>
                      {!row.template.is_system && (
                        <DropdownMenuItem
                          className="text-destructive"
                          onClick={() => setDeleteTarget(row.template)}
                        >
                          Delete
                        </DropdownMenuItem>
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <EditTemplateDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        template={editTarget}
        cloneFrom={cloneTarget}
      />

      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete template?</AlertDialogTitle>
            <AlertDialogDescription>
              "{deleteTarget?.template_name}" will be permanently removed. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => {
                if (deleteTarget) {
                  await deleteMut.mutateAsync(deleteTarget.id);
                  setDeleteTarget(null);
                }
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function SortHeader({
  label,
  align,
  active,
  dir,
  onClick,
}: {
  label: string;
  align?: 'right';
  active: boolean;
  dir: SortDir;
  onClick: () => void;
}) {
  const Icon = !active ? ArrowUpDown : dir === 'asc' ? ArrowUp : ArrowDown;
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex items-center gap-1 text-xs hover:text-foreground transition-colors',
        align === 'right' ? 'justify-end' : 'justify-start',
        active ? 'text-foreground' : 'text-muted-foreground',
      )}
    >
      {align === 'right' && <Icon className="h-3 w-3 opacity-60" />}
      <span>{label}</span>
      {align !== 'right' && <Icon className="h-3 w-3 opacity-60" />}
    </button>
  );
}

function DirectionBadge({ dir }: { dir: 'in' | 'out' | 'n/a' }) {
  if (dir === 'n/a') {
    return <span className="text-xs text-muted-foreground">—</span>;
  }
  const cls =
    dir === 'in'
      ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/20'
      : 'bg-sky-500/10 text-sky-700 dark:text-sky-400 border-sky-500/20';
  return (
    <Badge variant="outline" className={cn('font-normal text-[10px] px-1.5 py-0', cls)}>
      {dir}
    </Badge>
  );
}
