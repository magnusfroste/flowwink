import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import Papa from 'papaparse';
import { AdminLayout } from '@/components/admin/AdminLayout';
import { AdminPageContainer } from '@/components/admin/AdminPageContainer';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from '@/components/ui/dialog';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator, DropdownMenuLabel,
} from '@/components/ui/dropdown-menu';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Popover, PopoverContent, PopoverTrigger,
} from '@/components/ui/popover';
import {
  Sheet, SheetContent, SheetHeader, SheetTitle,
} from '@/components/ui/sheet';
import {
  Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList,
} from '@/components/ui/command';
import { useIsModuleEnabled } from '@/hooks/useModules';
import { useToast } from '@/hooks/use-toast';
import {
  Table2, Plus, Download, Upload, MoreHorizontal, Trash2, ChevronDown, LayoutGrid, List as ListIcon, Rows3,
  Send, Users, X, Database, PanelLeft, PanelRight, Filter, ArrowUpDown, Columns3, GripVertical,
  Maximize2, ChevronLeft, ChevronRight, WrapText, Lock,
} from 'lucide-react';
import {
  useFlowtableBases, useCreateBase, useUpdateBase, useDeleteBase,
  useFlowtableTables, useCreateTable, useDeleteTable, useUpdateTable,
  useFlowtableFields, useCreateField, useDeleteField, useUpdateField,
  useFlowtableRecords, useCreateRecord, useUpdateRecord, useDeleteRecords, useBulkInsertRecords,
  usePushToCrmLeads,
  fieldKeyify,
  type FlowtableFieldType, type FlowtableRecord, type FlowtableField, type FlowtableTable,
  type FlowtableViewConfig, type FlowtableViewFilter,
  useTeamProfiles, type TeamProfile,
} from '@/hooks/useFlowtable';
import {
  DndContext, closestCorners, PointerSensor, useSensor, useSensors, DragOverlay,
  useDroppable, useDraggable, type DragStartEvent, type DragEndEvent,
} from '@dnd-kit/core';
import { FieldsMenu } from '@/components/admin/flowtable/FieldsMenu';


// Row height ("fit to text") — a reading preference, not data. `auto` lets a
// row grow to its tallest cell; the fixed steps clamp long text to N lines so
// the grid stays scannable. Cells stay editable in every mode.
type RowHeight = 'short' | 'medium' | 'tall' | 'auto';
const ROW_HEIGHTS: { value: RowHeight; label: string; hint: string; lines: number | null; minPx: number }[] = [
  { value: 'short', label: 'Short', hint: 'One line, densest', lines: 1, minPx: 36 },
  { value: 'medium', label: 'Medium', hint: 'Up to 3 lines', lines: 3, minPx: 64 },
  { value: 'tall', label: 'Tall', hint: 'Up to 6 lines', lines: 6, minPx: 112 },
  { value: 'auto', label: 'Fit to text', hint: 'Grow to full content', lines: null, minPx: 36 },
];
const rowHeightSpec = (h: RowHeight) => ROW_HEIGHTS.find((r) => r.value === h) ?? ROW_HEIGHTS[0];

const FIELD_TYPES: { value: FlowtableFieldType; label: string }[] = [
  { value: 'text', label: 'Single line text' },
  { value: 'longtext', label: 'Long text' },
  { value: 'number', label: 'Number' },
  { value: 'checkbox', label: 'Checkbox' },
  { value: 'select', label: 'Single select' },
  { value: 'multiselect', label: 'Multi select' },
  { value: 'date', label: 'Date' },
  { value: 'url', label: 'URL' },
  { value: 'email', label: 'Email' },
  { value: 'phone', label: 'Phone' },
  { value: 'link', label: 'Link to table' },
  { value: 'lookup', label: 'Lookup (from linked row)' },
  { value: 'rollup', label: 'Rollup (aggregate linked rows)' },
  { value: 'user', label: 'User (team member)' },
  { value: 'currency', label: 'Currency' },
  { value: 'rating', label: 'Rating (1-5)' },
];

// Platform roles usable as a picker filter on user fields (assign to a
// PERSON; the role only scopes who is pickable). 'customer' excluded — not team.
const APP_ROLE_FILTERS = [
  'admin', 'employee', 'sales', 'hr', 'accounting', 'support',
  'warehouse', 'marketing', 'purchasing', 'projects', 'writer', 'approver',
] as const;

const TYPES_WITH_OPTIONS = new Set<FlowtableFieldType>(['select', 'multiselect', 'link', 'lookup', 'rollup', 'user', 'currency']);
const ROLLUP_AGGS = ['count', 'sum', 'avg', 'min', 'max'] as const;

/**
 * The choices a select/multiselect cell should offer, given what it currently holds.
 *
 * A stored value that is not among the configured choices used to render as an
 * empty dropdown: `<select value="Månadsavgift">` with no matching `<option>`
 * shows blank, so the data looked missing — and touching the control replaced a
 * correct value with whatever the list did offer. That is a silent edit of good
 * data, and it happens exactly when an agent fills rows before anyone configures
 * the column. The multiselect renderer already kept out-of-list values visible;
 * single select did not. Same idea, two renderers, one of them wrong.
 *
 * The old fallback made it worse: an unconfigured select offered
 * `New / In progress / Done` regardless of the column's meaning, so a
 * "Debiteringsform" column invited you to set a row to "In progress". The
 * starter set is now only used when the column is BOTH unconfigured and empty —
 * a genuinely new column, which is what it was for.
 */
export function selectChoices(
  configured: string[] | undefined,
  present: string[],
  starterWhenEmpty: string[] = [],
): string[] {
  // Blanks are dropped first: `String(values?.[key] ?? '')` yields '' for unset
  // cells, and counting those as data would deny a genuinely empty column its
  // starter set.
  const held = present.filter(Boolean);
  const base = configured?.length ? configured : (held.length ? [] : starterWhenEmpty);
  // Deduped: the result is rendered as `<option key={c}>`, so a repeated value
  // would both warn and show twice.
  return [...new Set([...base, ...held])];
}

const FILTER_OPS: { value: FlowtableViewFilter['op']; label: string; needsValue: boolean }[] = [
  { value: 'eq', label: 'is', needsValue: true },
  { value: 'neq', label: 'is not', needsValue: true },
  { value: 'contains', label: 'contains', needsValue: true },
  { value: 'gt', label: '>', needsValue: true },
  { value: 'lt', label: '<', needsValue: true },
  { value: 'not_empty', label: 'is not empty', needsValue: false },
  { value: 'empty', label: 'is empty', needsValue: false },
];

// Apply a view's filters + sort to the loaded records (client-side; records for
// a table are already in memory). Feeds grid, list, card and kanban alike.
// ─── Expanded record view ────────────────────────────────────────────────────
// Agent-written rows carry paragraphs, not cells — a grid truncates them into
// unreadability. This is the Airtable pattern: one record as a vertical form,
// stepped with prev/next (or arrow keys), every field readable at full height.
function RecordSheet({ open, onClose, records, fields, index, setIndex, onUpdate }: {
  open: boolean;
  onClose: () => void;
  records: FlowtableRecord[];
  fields: FlowtableField[];
  index: number;
  setIndex: (i: number) => void;
  onUpdate: (id: string, values: Record<string, unknown>) => void;
}) {
  const rec = records[index];

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      // Don't steal arrows from an input the user is typing in.
      const t = e.target as HTMLElement;
      if (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT') return;
      if (e.key === 'ArrowLeft' && index > 0) setIndex(index - 1);
      if (e.key === 'ArrowRight' && index < records.length - 1) setIndex(index + 1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, index, records.length, setIndex]);

  if (!rec) return null;
  const write = (key: string, v: unknown) => onUpdate(rec.id, { ...rec.values, [key]: v });
  const primary = fields[0];
  const title = String(rec.values?.[primary?.key ?? ''] ?? '') || 'Untitled record';

  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-full sm:max-w-xl overflow-y-auto">
        <SheetHeader>
          <div className="flex items-center justify-between gap-3 pr-8">
            <SheetTitle className="truncate text-left">{title}</SheetTitle>
            <div className="flex items-center gap-1 shrink-0">
              <span className="text-xs text-muted-foreground tabular-nums">
                {index + 1} / {records.length}
              </span>
              <Button variant="ghost" size="icon" className="h-7 w-7" disabled={index === 0}
                onClick={() => setIndex(index - 1)} aria-label="Previous record">
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button variant="ghost" size="icon" className="h-7 w-7" disabled={index >= records.length - 1}
                onClick={() => setIndex(index + 1)} aria-label="Next record">
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </SheetHeader>

        <div className="mt-4 space-y-4 pb-8">
          {fields.map((f) => {
            const v = rec.values?.[f.key];
            const label = (
              <Label className="text-xs uppercase tracking-wide text-muted-foreground">
                {f.name}
              </Label>
            );
            if (f.type === 'longtext') {
              return (
                <div key={f.id} className="space-y-1.5">
                  {label}
                  <Textarea key={rec.id + f.id} defaultValue={(v as string) ?? ''} rows={6}
                    className="resize-y"
                    onBlur={(e) => e.target.value !== ((v as string) ?? '') && write(f.key, e.target.value)} />
                </div>
              );
            }
            if (f.type === 'checkbox') {
              return (
                <div key={f.id} className="flex items-center gap-2">
                  <Checkbox checked={!!v} onCheckedChange={(c) => write(f.key, !!c)} />
                  {label}
                </div>
              );
            }
            if (f.type === 'select') {
              const choices = selectChoices(
                f.options?.choices as string[] | undefined,
                v ? [String(v)] : [],
                ['New', 'In progress', 'Done'],
              );
              return (
                <div key={f.id} className="space-y-1.5">
                  {label}
                  <select value={(v as string) ?? ''} onChange={(e) => write(f.key, e.target.value || null)}
                    className="h-9 w-full rounded-md border bg-background px-2 text-sm">
                    <option value=""></option>
                    {choices.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
              );
            }
            if (f.type === 'multiselect') {
              const choices = (f.options?.choices as string[]) ?? [];
              const current = Array.isArray(v) ? (v as string[]) : [];
              return (
                <div key={f.id} className="space-y-1.5">
                  {label}
                  <div className="flex flex-wrap gap-2">
                    {choices.map((c) => {
                      const on = current.includes(c);
                      return (
                        <button key={c} type="button"
                          onClick={() => write(f.key, on ? current.filter((x) => x !== c) : [...current, c])}
                          className={`text-xs px-2 py-1 rounded-full border transition-colors ${on ? 'bg-primary text-primary-foreground border-primary' : 'bg-background hover:bg-muted'}`}>
                          {c}
                        </button>
                      );
                    })}
                    {current.filter((c) => !choices.includes(c)).map((c) => (
                      <span key={c} className="text-xs px-2 py-1 rounded-full border bg-muted">{c}</span>
                    ))}
                  </div>
                </div>
              );
            }
            if (f.type === 'number' || f.type === 'currency') {
              return (
                <div key={f.id} className="space-y-1.5">
                  {label}
                  <div className="flex items-center gap-2">
                    <Input key={rec.id + f.id} type="number" defaultValue={(v as number | undefined) ?? ''}
                      onBlur={(e) => {
                        const n = e.target.value === '' ? null : Number(e.target.value);
                        if (n !== ((v as number | null) ?? null)) write(f.key, n);
                      }} />
                    {f.type === 'currency' && (
                      <span className="text-xs text-muted-foreground">{(f.options?.currency_code as string) || 'SEK'}</span>
                    )}
                  </div>
                </div>
              );
            }
            if (f.type === 'date') {
              return (
                <div key={f.id} className="space-y-1.5">
                  {label}
                  <Input key={rec.id + f.id} type="date" defaultValue={toDateInputValue(v)}
                    onBlur={(e) => e.target.value !== toDateInputValue(v) && write(f.key, e.target.value || null)} />
                </div>
              );
            }
            if (f.type === 'link' || f.type === 'user' || f.type === 'lookup' || f.type === 'rollup') {
              // Relations are edited in the grid where their pickers live; here
              // they are read-only so the reading flow stays uninterrupted.
              const display = Array.isArray(v) ? v.join(', ') : String(v ?? '—');
              return (
                <div key={f.id} className="space-y-1.5">
                  {label}
                  <p className="text-sm text-muted-foreground">{display || '—'} <span className="text-xs opacity-60">(edit in grid)</span></p>
                </div>
              );
            }
            return (
              <div key={f.id} className="space-y-1.5">
                {label}
                <Input key={rec.id + f.id} defaultValue={(v as string) ?? ''}
                  onBlur={(e) => e.target.value !== ((v as string) ?? '') && write(f.key, e.target.value)} />
              </div>
            );
          })}
        </div>
      </SheetContent>
    </Sheet>
  );
}

function applyViewConfig(records: FlowtableRecord[], cfg?: FlowtableViewConfig): FlowtableRecord[] {
  let out = records;
  const filters = cfg?.filters ?? [];
  if (filters.length) {
    out = out.filter((r) => filters.every((f) => {
      const raw = r.values?.[f.field];
      const s = raw == null ? '' : String(raw);
      switch (f.op) {
        case 'empty': return s.trim() === '';
        case 'not_empty': return s.trim() !== '';
        case 'eq': return s.toLowerCase() === (f.value ?? '').toLowerCase();
        case 'neq': return s.toLowerCase() !== (f.value ?? '').toLowerCase();
        case 'contains': return s.toLowerCase().includes((f.value ?? '').toLowerCase());
        case 'gt': return Number(raw) > Number(f.value);
        case 'lt': return Number(raw) < Number(f.value);
        default: return true;
      }
    }));
  }
  if (cfg?.sort?.field) {
    const { field, dir } = cfg.sort;
    const mul = dir === 'desc' ? -1 : 1;
    out = [...out].sort((a, b) => {
      const av = a.values?.[field]; const bv = b.values?.[field];
      const an = Number(av); const bn = Number(bv);
      if (!Number.isNaN(an) && !Number.isNaN(bn)) return (an - bn) * mul;
      return String(av ?? '').localeCompare(String(bv ?? ''), undefined, { numeric: true }) * mul;
    });
  }
  return out;
}

export default function FlowtablePage() {
  const enabled = useIsModuleEnabled('flowtable');
  const { baseSlug, tableSlug } = useParams<{ baseSlug?: string; tableSlug?: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();

  const { data: bases = [] } = useFlowtableBases();
  const createBase = useCreateBase();
  const updateBase = useUpdateBase();
  const deleteBase = useDeleteBase();

  const activeBase = useMemo(
    () => bases.find((b) => b.slug === baseSlug) ?? bases[0],
    [bases, baseSlug],
  );
  const { data: tables = [] } = useFlowtableTables(activeBase?.id);
  const createTable = useCreateTable();
  const deleteTable = useDeleteTable();
  const updateTable = useUpdateTable();

  const activeTable = useMemo(
    () => tables.find((t) => t.slug === tableSlug) ?? tables[0],
    [tables, tableSlug],
  );

  // ensure URL stays in sync
  useEffect(() => {
    if (activeBase && !baseSlug) navigate(`/admin/flowtable/${activeBase.slug}`, { replace: true });
    if (activeBase && activeTable && tableSlug !== activeTable.slug) {
      navigate(`/admin/flowtable/${activeBase.slug}/${activeTable.slug}`, { replace: true });
    }
  }, [activeBase, activeTable, baseSlug, tableSlug, navigate]);

  const { data: fields = [] } = useFlowtableFields(activeTable?.id);
  const { data: records = [] } = useFlowtableRecords(activeTable?.id);
  // Expanded record view: index into displayedRecords (the filtered/sorted set
  // the user is actually looking at), so prev/next steps what the eye expects.
  const [expandedIndex, setExpandedIndex] = useState<number | null>(null);
  // Row height is a per-table reading preference (Airtable's short/medium/tall
  // plus a true "fit to text" that grows a row to its tallest cell). Kept in
  // localStorage per table id so switching tables doesn't lose the setting.
  const [rowHeight, setRowHeight] = useState<RowHeight>('short');
  useEffect(() => {
    if (!activeTable?.id) return;
    try {
      const stored = localStorage.getItem(`flowtable-rowheight-${activeTable.id}`);
      setRowHeight(ROW_HEIGHTS.some((r) => r.value === stored) ? (stored as RowHeight) : 'short');
    } catch {
      setRowHeight('short');
    }
  }, [activeTable?.id]);
  const changeRowHeight = (value: RowHeight) => {
    setRowHeight(value);
    try {
      if (activeTable?.id) localStorage.setItem(`flowtable-rowheight-${activeTable.id}`, value);
    } catch { /* storage unavailable — session-only */ }
  };

  // Card view density: how many cards fit per row. A reading preference like
  // row height, so it lives in localStorage per table rather than in the saved
  // view config.
  const [cardColumns, setCardColumns] = useState(3);
  useEffect(() => {
    if (!activeTable?.id) return;
    try {
      const stored = Number(localStorage.getItem(`flowtable-cardcols-${activeTable.id}`));
      setCardColumns(stored >= 1 && stored <= 6 ? stored : 3);
    } catch {
      setCardColumns(3);
    }
  }, [activeTable?.id]);
  const changeCardColumns = (value: number) => {
    setCardColumns(value);
    try {
      if (activeTable?.id) localStorage.setItem(`flowtable-cardcols-${activeTable.id}`, String(value));
    } catch { /* storage unavailable — session-only */ }
  };

  // Column visibility is a per-viewer reading preference (like row height), so it
  // lives in localStorage per table — hiding a column must never look like the
  // data or the schema changed for everyone.
  const [hiddenFieldIds, setHiddenFieldIds] = useState<Set<string>>(new Set());
  useEffect(() => {
    if (!activeTable?.id) return;
    try {
      const raw = localStorage.getItem(`flowtable-hiddenfields-${activeTable.id}`);
      const parsed = raw ? (JSON.parse(raw) as unknown) : [];
      setHiddenFieldIds(new Set(Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === 'string') : []));
    } catch {
      setHiddenFieldIds(new Set());
    }
  }, [activeTable?.id]);
  const persistHidden = (ids: string[]) => {
    setHiddenFieldIds(new Set(ids));
    try {
      if (activeTable?.id) localStorage.setItem(`flowtable-hiddenfields-${activeTable.id}`, JSON.stringify(ids));
    } catch { /* storage unavailable — session-only */ }
  };
  const toggleHiddenField = (id: string) => {
    const next = new Set(hiddenFieldIds);
    if (next.has(id)) next.delete(id); else next.add(id);
    persistHidden(Array.from(next));
  };
  const visibleFields = useMemo(
    () => fields.filter((f) => !hiddenFieldIds.has(f.id)),
    [fields, hiddenFieldIds],
  );


  const displayedRecords = useMemo(
    () => applyViewConfig(records, activeTable?.view_config),
    [records, activeTable?.view_config],
  );
  const createField = useCreateField();
  const deleteField = useDeleteField();
  const updateField = useUpdateField();
  const createRecord = useCreateRecord();
  const updateRecord = useUpdateRecord();
  const deleteRecords = useDeleteRecords();
  const bulkInsert = useBulkInsertRecords();
  const pushToCrm = usePushToCrmLeads();

  // Column order is schema, not preference: `position` is what agents and every
  // other viewer read, so a reorder writes it for the whole ordered set.
  const reorderFields = (orderedIds: string[]) => {
    if (!activeTable?.id) return;
    orderedIds.forEach((id, index) => {
      const current = fields.find((f) => f.id === id);
      if (!current || current.position === index) return;
      updateField.mutate({ id, table_id: activeTable.id, patch: { position: index } });
    });
  };



  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [pushOpen, setPushOpen] = useState(false);
  const [basesMinimized, setBasesMinimized] = useState(() => {
    try {
      return localStorage.getItem('flowtable-bases-minimized') === 'true';
    } catch {
      return false;
    }
  });
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => setSelected(new Set()), [activeTable?.id]);

  if (!enabled) {
    return (
      <AdminLayout>
        <AdminPageContainer>
          <Card>
            <CardContent className="py-12 text-center space-y-4">
              <Table2 className="h-10 w-10 mx-auto text-muted-foreground" />
              <h2 className="text-xl font-semibold">Flowtable is disabled</h2>
              <CardDescription className="max-w-md mx-auto">
                Enable the Flowtable module in /admin/modules to create Airtable-style
                ad-hoc lists, prospect sheets and content backlogs.
              </CardDescription>
            </CardContent>
          </Card>
        </AdminPageContainer>
      </AdminLayout>
    );
  }

  const handleCreateBase = async () => {
    const name = window.prompt('Base name? e.g. "Prospecting Q3"');
    if (!name?.trim()) return;
    const b = await createBase.mutateAsync({ name: name.trim() });
    navigate(`/admin/flowtable/${b.slug}`);
  };

  const handleCreateTable = async () => {
    if (!activeBase) return;
    const name = window.prompt('Table name? e.g. "Cold List"');
    if (!name?.trim()) return;
    const t = await createTable.mutateAsync({ base_id: activeBase.id, name: name.trim() });
    navigate(`/admin/flowtable/${activeBase.slug}/${t.slug}`);
  };

  const handleExport = (delim: ',' | ';' | '\t') => {
    if (!activeTable || !fields.length) return;
    const headers = fields.map((f) => f.name);
    const rows = records.map((r) =>
      fields.map((f) => {
        const v = r.values?.[f.key];
        if (v == null) return '';
        if (Array.isArray(v)) return v.join('|');
        return String(v);
      }),
    );
    const csv = Papa.unparse([headers, ...rows], { delimiter: delim });
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${activeTable.slug}.${delim === '\t' ? 'tsv' : 'csv'}`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const handleImportFile = async (file: File) => {
    if (!activeTable) return;
    const text = await file.text();
    const sample = text.split('\n').slice(0, 3).join('\n');
    const guessedDelim = sample.includes('\t') ? '\t' : sample.split(';').length > sample.split(',').length ? ';' : ',';
    const parsed = Papa.parse<Record<string, string>>(text, {
      header: true,
      delimiter: guessedDelim,
      skipEmptyLines: true,
    });
    if (parsed.errors.length) {
      toast({ title: 'CSV parse warning', description: parsed.errors[0].message, variant: 'destructive' });
    }
    const headers = parsed.meta.fields ?? [];
    if (!headers.length) {
      toast({ title: 'No columns detected', variant: 'destructive' });
      return;
    }
    // ensure fields exist
    const existingKeys = new Set(fields.map((f) => f.key));
    const headerToKey = new Map<string, string>();
    let nextPos = fields.length;
    for (const h of headers) {
      const key = fieldKeyify(h);
      headerToKey.set(h, key);
      if (!existingKeys.has(key)) {
        await createField.mutateAsync({ table_id: activeTable.id, name: h, type: 'text', position: nextPos++ });
      }
    }
    const rows = parsed.data.map((row) => {
      const v: Record<string, unknown> = {};
      for (const h of headers) {
        const k = headerToKey.get(h)!;
        const val = row[h];
        if (val !== undefined && val !== '') v[k] = val;
      }
      return v;
    }).filter((r) => Object.keys(r).length > 0);
    const n = await bulkInsert.mutateAsync({ table_id: activeTable.id, rows });
    toast({ title: `Imported ${n} rows`, description: `Delimiter: ${guessedDelim === '\t' ? 'TAB' : guessedDelim}` });
  };

  return (
    <AdminLayout>
      <div className="flex h-[calc(100vh-3.5rem)] overflow-hidden">
        {/* Bases sidebar */}
        <aside
          className={`border-r bg-muted/30 flex flex-col transition-all duration-200 ${
            basesMinimized ? 'w-14' : 'w-60'
          }`}
        >
          <div className={`border-b flex items-center ${basesMinimized ? 'flex-col p-1.5 gap-1.5' : 'p-3 justify-between'}`}>
            {!basesMinimized && (
              <div className="flex items-center gap-2 text-sm font-semibold">
                <Database className="h-4 w-4" /> Bases
              </div>
            )}
            <Button
              size="icon"
              variant="ghost"
              onClick={() => {
                setBasesMinimized((v) => {
                  const next = !v;
                  try {
                    localStorage.setItem('flowtable-bases-minimized', String(next));
                  } catch { /* localStorage unavailable — the panel still toggles, it just does not remember. */ }
                  return next;
                });
              }}
              title={basesMinimized ? 'Expand bases panel' : 'Minimize bases panel'}
            >
              {basesMinimized ? <PanelRight className="h-4 w-4" /> : <PanelLeft className="h-4 w-4" />}
            </Button>
            <Button size="icon" variant="ghost" onClick={handleCreateBase} title="New base">
              <Plus className="h-4 w-4" />
            </Button>
          </div>
          <div className="flex-1 overflow-y-auto p-2 space-y-1">
            {bases.length === 0 && !basesMinimized && (
              <p className="text-xs text-muted-foreground px-2 py-4">
                No bases yet. Create one to start.
              </p>
            )}
            {bases.map((b) => {
              const isActive = activeBase?.id === b.id;
              return (
                <button
                  key={b.id}
                  onClick={() => navigate(`/admin/flowtable/${b.slug}`)}
                  title={b.name}
                  className={`w-full rounded-md text-sm flex items-center gap-2 group ${
                    basesMinimized ? 'justify-center px-1 py-1.5' : 'text-left px-2 py-2'
                  } ${isActive ? 'bg-background shadow-sm' : 'hover:bg-background/60'}`}
                >
                  <span
                    className={`rounded flex items-center justify-center font-bold text-white shrink-0 ${
                      basesMinimized ? 'h-8 w-8 text-[11px]' : 'h-6 w-6 text-[10px]'
                    }`}
                    style={{ background: b.color }}
                  >
                    {b.name.slice(0, 2).toUpperCase()}
                  </span>
                  {!basesMinimized && (
                    <>
                      <span className="flex-1 truncate">{b.name}</span>
                      {/* Mark the exception, not the rule. Shared is the default
                          now, so a group icon on almost every row says nothing —
                          a lock on the few private ones says everything. */}
                      {!b.workspace_shared && (
                        <Lock className="h-3 w-3 text-muted-foreground" aria-label="Private — only you can see this base" />
                      )}
                    </>
                  )}
                </button>
              );
            })}
          </div>
        </aside>

        {/* Main */}
        <div className="flex-1 flex flex-col min-w-0">
          {!activeBase ? (
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center space-y-4">
                <Table2 className="h-12 w-12 mx-auto text-muted-foreground" />
                <div>
                  <h2 className="text-lg font-semibold">Create your first base</h2>
                  <p className="text-sm text-muted-foreground">A base is a workspace that holds tables.</p>
                </div>
                <Button onClick={handleCreateBase}><Plus className="h-4 w-4 mr-1" /> New base</Button>
              </div>
            </div>
          ) : (
            <>
              {/* Base header */}
              <div className="border-b px-4 py-2 flex items-center gap-2 bg-background">
                <span
                  className="h-7 w-7 rounded flex items-center justify-center text-xs font-bold text-white"
                  style={{ background: activeBase.color }}
                >
                  {activeBase.name.slice(0, 2).toUpperCase()}
                </span>
                <input
                  value={activeBase.name}
                  onChange={(e) =>
                    updateBase.mutate({ id: activeBase.id, patch: { name: e.target.value } })
                  }
                  className="bg-transparent border-0 outline-none text-base font-semibold flex-1 min-w-0"
                />
                {/* The label follows the state instead of naming one direction.
                    "Share with workspace" read as an invitation to opt in, which
                    is backwards now that shared is the default — the switch is
                    how you opt OUT. */}
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Label htmlFor="ws-share" className="cursor-pointer flex items-center gap-1.5">
                    {activeBase.workspace_shared ? (
                      <><Users className="h-3.5 w-3.5" /> Shared with colleagues</>
                    ) : (
                      <><Lock className="h-3.5 w-3.5" /> Private to you</>
                    )}
                  </Label>
                  <Switch
                    id="ws-share"
                    checked={activeBase.workspace_shared}
                    title={
                      activeBase.workspace_shared
                        ? 'Everyone can see this base. Switch off to make it private.'
                        : 'Only you can see this base — and neither can FlowPilot. Switch on to share it.'
                    }
                    onCheckedChange={(v) =>
                      updateBase.mutate({ id: activeBase.id, patch: { workspace_shared: v } })
                    }
                  />
                </div>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button size="icon" variant="ghost"><MoreHorizontal className="h-4 w-4" /></Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem
                      className="text-destructive"
                      onClick={() => {
                        if (confirm(`Delete base "${activeBase.name}" and all its tables?`)) {
                          deleteBase.mutate(activeBase.id);
                          navigate('/admin/flowtable');
                        }
                      }}
                    >
                      <Trash2 className="h-4 w-4 mr-2" /> Delete base
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>

              {/* Tables tabs */}
              <div className="border-b px-2 flex items-center gap-1 bg-muted/20 overflow-x-auto">
                {tables.map((t) => {
                  const isActive = activeTable?.id === t.id;
                  return (
                    <button
                      key={t.id}
                      onClick={() => navigate(`/admin/flowtable/${activeBase.slug}/${t.slug}`)}
                      className={`px-3 py-2 text-sm whitespace-nowrap border-b-2 -mb-px ${
                        isActive ? 'border-primary font-medium' : 'border-transparent text-muted-foreground hover:text-foreground'
                      }`}
                    >
                      {t.name}
                    </button>
                  );
                })}
                <Button size="sm" variant="ghost" onClick={handleCreateTable}>
                  <Plus className="h-3.5 w-3.5 mr-1" /> Add table
                </Button>
              </div>

              {!activeTable ? (
                <div className="flex-1 flex items-center justify-center text-sm text-muted-foreground">
                  No tables yet. Click "Add table" to start.
                </div>
              ) : (
                <>
                  {/* Toolbar */}
                  <div className="border-b px-3 py-2 flex items-center gap-2 bg-background">
                    <div className="flex items-center rounded-md border overflow-hidden text-xs">
                      {(['grid', 'list', 'card', 'kanban'] as const).map((mode) => {
                        const Icon = mode === 'grid' ? Rows3 : mode === 'list' ? ListIcon : mode === 'card' ? LayoutGrid : Columns3;
                        return (
                          <button
                            key={mode}
                            onClick={() =>
                              updateTable.mutate({ id: activeTable.id, base_id: activeBase.id, patch: { view_mode: mode } })
                            }
                            className={`px-2.5 py-1.5 flex items-center gap-1 ${
                              activeTable.view_mode === mode ? 'bg-accent text-accent-foreground' : 'hover:bg-muted'
                            }`}
                          >
                            <Icon className="h-3.5 w-3.5" />
                            <span className="capitalize">{mode}</span>
                          </button>
                        );
                      })}
                    </div>
                    {activeTable.view_mode !== 'kanban' && activeTable.view_mode !== 'card' && (
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            variant={rowHeight === 'short' ? 'ghost' : 'secondary'}
                            size="sm"
                            className="h-8 px-2 gap-1 text-xs"
                            title="Row height"
                          >
                            <WrapText className="h-3.5 w-3.5" />
                            <span className="hidden sm:inline">{rowHeightSpec(rowHeight).label}</span>
                            <ChevronDown className="h-3 w-3 opacity-60" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="start" className="w-56">
                          <DropdownMenuLabel className="text-xs text-muted-foreground">Row height</DropdownMenuLabel>
                          {ROW_HEIGHTS.map((r) => (
                            <DropdownMenuItem
                              key={r.value}
                              onClick={() => changeRowHeight(r.value)}
                              className="flex flex-col items-start gap-0"
                            >
                              <span className={rowHeight === r.value ? 'font-medium' : ''}>
                                {r.label}{rowHeight === r.value ? ' ✓' : ''}
                              </span>
                              <span className="text-[11px] text-muted-foreground">{r.hint}</span>
                            </DropdownMenuItem>
                          ))}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    )}
                    {activeTable.view_mode === 'card' && (
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            variant={cardColumns === 3 ? 'ghost' : 'secondary'}
                            size="sm"
                            className="h-8 px-2 gap-1 text-xs"
                            title="Cards per row"
                          >
                            <LayoutGrid className="h-3.5 w-3.5" />
                            <span className="hidden sm:inline">
                              {cardColumns} {cardColumns === 1 ? 'card' : 'cards'}
                            </span>
                            <ChevronDown className="h-3 w-3 opacity-60" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="start" className="w-52">
                          <DropdownMenuLabel className="text-xs text-muted-foreground">Cards per row</DropdownMenuLabel>
                          {[1, 2, 3, 4, 5, 6].map((n) => (
                            <DropdownMenuItem key={n} onClick={() => changeCardColumns(n)}>
                              <span className={cardColumns === n ? 'font-medium' : ''}>
                                {n} {n === 1 ? 'card — widest' : n === 6 ? 'cards — densest' : 'cards'}
                                {cardColumns === n ? ' ✓' : ''}
                              </span>
                            </DropdownMenuItem>
                          ))}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    )}

                    {activeTable.view_mode !== 'kanban' && (
                      <FieldsMenu
                        fields={fields}
                        hidden={hiddenFieldIds}
                        onToggleHidden={toggleHiddenField}
                        onSetHidden={persistHidden}
                        onReorder={reorderFields}
                      />
                    )}

                    <ViewToolbar
                      fields={fields}
                      config={activeTable.view_config ?? {}}
                      onChange={(view_config) =>
                        updateTable.mutate({ id: activeTable.id, base_id: activeBase.id, patch: { view_config } })
                      }
                    />

                    <div className="flex-1" />
                    {selected.size > 0 && (
                      <>
                        <Badge variant="secondary">{selected.size} selected</Badge>
                        <Button
                          size="sm" variant="outline"
                          onClick={() => setPushOpen(true)}
                        >
                          <Send className="h-3.5 w-3.5 mr-1" /> Push to CRM
                        </Button>
                        <Button
                          size="sm" variant="ghost"
                          onClick={async () => {
                            await deleteRecords.mutateAsync({ ids: Array.from(selected), table_id: activeTable.id });
                            setSelected(new Set());
                          }}
                        >
                          <Trash2 className="h-3.5 w-3.5 mr-1 text-destructive" /> Delete
                        </Button>
                      </>
                    )}
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button size="sm" variant="outline">
                          <Download className="h-3.5 w-3.5 mr-1" /> Export
                          <ChevronDown className="h-3 w-3 ml-1" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => handleExport(',')}>CSV (comma)</DropdownMenuItem>
                        <DropdownMenuItem onClick={() => handleExport(';')}>CSV (semicolon)</DropdownMenuItem>
                        <DropdownMenuItem onClick={() => handleExport('\t')}>TSV (tab)</DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                    <Button size="sm" variant="outline" onClick={() => fileInputRef.current?.click()}>
                      <Upload className="h-3.5 w-3.5 mr-1" /> Import
                    </Button>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept=".csv,.tsv,.txt"
                      className="hidden"
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) handleImportFile(f);
                        e.target.value = '';
                      }}
                    />
                    <Button
                      size="sm"
                      onClick={() => createRecord.mutate({ table_id: activeTable.id, position: Date.now() })}
                    >
                      <Plus className="h-3.5 w-3.5 mr-1" /> Add row
                    </Button>
                  </div>

                  {/* View */}
                  <div className="flex-1 overflow-auto">
                    {activeTable.view_mode === 'kanban' ? (
                      <KanbanView
                        fields={fields}
                        records={displayedRecords}
                        config={activeTable.view_config ?? {}}
                        onChangeConfig={(view_config) =>
                          updateTable.mutate({ id: activeTable.id, base_id: activeBase.id, patch: { view_config } })
                        }
                        onUpdate={(id, values) =>
                          updateRecord.mutate({ id, table_id: activeTable.id, values })
                        }
                      />
                    ) : activeTable.view_mode === 'card' ? (
                      <CardView
                        columns={cardColumns}

                        fields={visibleFields}
                        records={displayedRecords}
                        onExpand={setExpandedIndex}
                        onUpdate={(id, values) =>
                          updateRecord.mutate({ id, table_id: activeTable.id, values })
                        }
                      />
                    ) : activeTable.view_mode === 'list' ? (
                      <ListView
                        fields={visibleFields}
                        records={displayedRecords}
                        selected={selected}
                        setSelected={setSelected}
                        onExpand={setExpandedIndex}
                        onUpdate={(id, values) =>
                          updateRecord.mutate({ id, table_id: activeTable.id, values })
                        }
                      />
                    ) : (
                      <GridView
                        fields={visibleFields}
                        allFields={fields}
                        onReorderFields={reorderFields}

                        records={displayedRecords}
                        tables={tables}
                        selected={selected}
                        setSelected={setSelected}
                        rowHeight={rowHeight}
                        onExpand={setExpandedIndex}
                        onUpdateRecord={(id, values) =>
                          updateRecord.mutate({ id, table_id: activeTable.id, values })
                        }
                        onAddField={(name, type, options) =>
                          createField.mutate({ table_id: activeTable.id, name, type, options, position: fields.length })
                        }
                        onConfigureField={(id, patch) =>
                          updateField.mutate({
                            id,
                            table_id: activeTable.id,
                            patch: patch.name !== undefined ? { ...patch, key: fieldKeyify(patch.name) } : patch,
                          })
                        }
                        onDeleteField={(id) =>
                          deleteField.mutate({ id, table_id: activeTable.id })
                        }
                        onAddRow={() => createRecord.mutate({ table_id: activeTable.id, position: Date.now() })}
                      />
                    )}
                  </div>

                  {/* Footer */}
                  <div className="border-t px-3 py-1.5 text-xs text-muted-foreground flex items-center justify-between bg-muted/20">
                    <span>{records.length} record{records.length === 1 ? '' : 's'}</span>
                    {tables.length > 0 && activeTable && (
                      <button
                        className="text-destructive/70 hover:text-destructive"
                        onClick={() => {
                          if (confirm(`Delete table "${activeTable.name}" and all its records?`)) {
                            deleteTable.mutate({ id: activeTable.id, base_id: activeBase.id });
                          }
                        }}
                      >
                        Delete this table
                      </button>
                    )}
                  </div>
                </>
              )}
            </>
          )}
        </div>
      </div>

      {/* Push-to-CRM dialog */}
      <Dialog open={pushOpen} onOpenChange={setPushOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Push {selected.size} row{selected.size === 1 ? '' : 's'} to CRM</DialogTitle>
            <DialogDescription>
              Map Flowtable columns to lead fields. Rows with no name/email/phone are skipped.
            </DialogDescription>
          </DialogHeader>
          <CrmMappingForm
            fields={fields}
            onCancel={() => setPushOpen(false)}
            onConfirm={async (mapping) => {
              const rows = records.filter((r) => selected.has(r.id));
              const n = await pushToCrm.mutateAsync({ rows, mapping });
              toast({ title: `Created ${n} leads`, description: 'Open /admin/leads to enrich and qualify.' });
              setPushOpen(false);
              setSelected(new Set());
            }}
          />
        </DialogContent>
      </Dialog>

      {activeTable && expandedIndex !== null && (
        <RecordSheet
          open={expandedIndex !== null}
          onClose={() => setExpandedIndex(null)}
          records={displayedRecords}
          fields={fields}
          index={Math.min(expandedIndex, Math.max(displayedRecords.length - 1, 0))}
          setIndex={setExpandedIndex}
          onUpdate={(id, values) => updateRecord.mutate({ id, table_id: activeTable.id, values })}
        />
      )}
    </AdminLayout>
  );
}

// ---------- Grid view ----------
function GridView(props: {
  fields: FlowtableField[];
  /** Every field, hidden ones included — link/lookup cells resolve against the schema, not the view. */
  allFields?: FlowtableField[];
  records: FlowtableRecord[];
  tables: FlowtableTable[];
  selected: Set<string>;
  setSelected: (s: Set<string>) => void;
  rowHeight?: RowHeight;
  onExpand?: (index: number) => void;
  onUpdateRecord: (id: string, values: Record<string, unknown>) => void;
  onAddField: (name: string, type: FlowtableFieldType, options: Record<string, unknown>) => void;
  onConfigureField: (id: string, patch: Partial<FlowtableField>) => void;
  onDeleteField: (id: string) => void;
  onReorderFields?: (orderedIds: string[]) => void;
  onAddRow: () => void;
}) {
  const { fields, records, tables, selected, setSelected } = props;
  const allFields = props.allFields ?? fields;
  const [addFieldOpen, setAddFieldOpen] = useState(false);
  const [newName, setNewName] = useState('');
  const [newType, setNewType] = useState<FlowtableFieldType>('text');
  const [newOptions, setNewOptions] = useState<Record<string, unknown>>({});
  const [configField, setConfigField] = useState<FlowtableField | null>(null);
  // Header drag = reorder. The handle only appears on hover so the header keeps
  // reading as a label, not as a control surface.
  const [dragFieldId, setDragFieldId] = useState<string | null>(null);
  const [overFieldId, setOverFieldId] = useState<string | null>(null);
  const resizeRef = useRef<{ id: string; startX: number; startWidth: number } | null>(null);

  const moveField = (fromId: string, toId: string) => {
    if (!props.onReorderFields || fromId === toId) return;
    const ids = allFields.map((f) => f.id);
    const fromIdx = ids.indexOf(fromId);
    const toIdx = ids.indexOf(toId);
    if (fromIdx < 0 || toIdx < 0) return;
    ids.splice(toIdx, 0, ids.splice(fromIdx, 1)[0]);
    props.onReorderFields(ids);
  };

  // Resize writes once on release: a mutation per mouse-move would turn a drag
  // into dozens of writes and make the column jitter.
  const startResize = (e: React.MouseEvent, f: FlowtableField) => {
    e.preventDefault();
    e.stopPropagation();
    resizeRef.current = { id: f.id, startX: e.clientX, startWidth: f.width || 150 };
    const onMove = (ev: MouseEvent) => {
      const state = resizeRef.current;
      if (!state) return;
      const next = Math.max(64, Math.round(state.startWidth + (ev.clientX - state.startX)));
      const th = document.querySelector<HTMLElement>(`[data-field-col="${state.id}"]`);
      if (th) { th.style.width = `${next}px`; th.style.minWidth = `${next}px`; }
    };
    const onUp = (ev: MouseEvent) => {
      const state = resizeRef.current;
      resizeRef.current = null;
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      if (!state) return;
      const next = Math.max(64, Math.round(state.startWidth + (ev.clientX - state.startX)));
      if (next !== state.startWidth) props.onConfigureField(state.id, { width: next });
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };

  const toggleAll = () => {
    if (selected.size === records.length) setSelected(new Set());
    else setSelected(new Set(records.map((r) => r.id)));
  };
  const toggleOne = (id: string) => {
    const n = new Set(selected);
    if (n.has(id)) n.delete(id); else n.add(id);
    setSelected(n);
  };


  return (
    <div className="min-w-fit">
      <table className="border-collapse text-sm">
        <thead className="sticky top-0 bg-muted/40 z-10">
          <tr>
            <th className="border-r border-b w-16 min-w-16 max-w-16 p-0">
              <div className="h-9 flex items-center justify-center">
                <Checkbox
                  checked={records.length > 0 && selected.size === records.length}
                  onCheckedChange={toggleAll}
                />
              </div>
            </th>
            {fields.map((f, fi) => (
              <th
                key={f.id}
                data-field-col={f.id}
                className={`relative border-r border-b text-left font-medium text-xs text-muted-foreground p-0 ${
                  overFieldId === f.id && dragFieldId && dragFieldId !== f.id
                    ? 'shadow-[inset_2px_0_0_0_hsl(var(--primary))]'
                    : ''
                } ${dragFieldId === f.id ? 'opacity-60' : ''}`}
                style={{ width: f.width, minWidth: f.width }}
                onDragOver={(e) => {
                  if (!dragFieldId) return;
                  e.preventDefault();
                  setOverFieldId(f.id);
                }}
                onDrop={(e) => {
                  if (!dragFieldId) return;
                  e.preventDefault();
                  moveField(dragFieldId, f.id);
                  setDragFieldId(null);
                  setOverFieldId(null);
                }}
              >
                <div className="h-9 px-2 flex items-center gap-1 group">
                  {props.onReorderFields && (
                    <span
                      draggable
                      onDragStart={() => setDragFieldId(f.id)}
                      onDragEnd={() => { setDragFieldId(null); setOverFieldId(null); }}
                      title="Drag to move column"
                      className="cursor-grab text-muted-foreground/70 opacity-0 group-hover:opacity-100 -ml-1"
                    >
                      <GripVertical className="h-3 w-3" />
                    </span>
                  )}
                  <input
                    defaultValue={f.name}
                    onBlur={(e) => {
                      if (e.target.value && e.target.value !== f.name) props.onConfigureField(f.id, { name: e.target.value });
                    }}
                    className="bg-transparent border-0 outline-none flex-1 min-w-0 font-medium text-foreground"
                  />
                  <span className="text-[10px] uppercase opacity-60">{f.type}</span>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button className="opacity-0 group-hover:opacity-100">
                        <ChevronDown className="h-3 w-3" />
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => setConfigField(f)}>
                        Configure field…
                      </DropdownMenuItem>
                      {props.onReorderFields && (
                        <>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            disabled={fi === 0}
                            onClick={() => moveField(f.id, fields[fi - 1].id)}
                          >
                            <ChevronLeft className="h-3.5 w-3.5 mr-2" /> Move left
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            disabled={fi === fields.length - 1}
                            onClick={() => moveField(f.id, fields[fi + 1].id)}
                          >
                            <ChevronRight className="h-3.5 w-3.5 mr-2" /> Move right
                          </DropdownMenuItem>
                        </>
                      )}
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        className="text-destructive"
                        onClick={() => confirm(`Delete column "${f.name}"?`) && props.onDeleteField(f.id)}
                      >
                        <Trash2 className="h-3.5 w-3.5 mr-2" /> Delete field
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
                {/* Resize grip: invisible until hovered, so width is adjustable without a visible control. */}
                <span
                  role="separator"
                  aria-orientation="vertical"
                  title="Drag to resize column"
                  onMouseDown={(e) => startResize(e, f)}
                  onDoubleClick={() => props.onConfigureField(f.id, { width: 150 })}
                  className="absolute top-0 right-0 h-full w-1.5 cursor-col-resize hover:bg-primary/60"
                />
              </th>
            ))}

            <th className="border-b p-0 w-12">
              <DropdownMenu open={addFieldOpen} onOpenChange={setAddFieldOpen}>
                <DropdownMenuTrigger asChild>
                  <button className="h-9 w-12 flex items-center justify-center hover:bg-muted">
                    <Plus className="h-4 w-4" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-72 p-3 space-y-2">
                  <Input placeholder="Field name" value={newName} onChange={(e) => setNewName(e.target.value)} autoFocus />
                  <Select value={newType} onValueChange={(v) => { setNewType(v as FlowtableFieldType); setNewOptions({}); }}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {FIELD_TYPES.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  {TYPES_WITH_OPTIONS.has(newType) && (
                    <FieldOptionsEditor
                      type={newType}
                      options={newOptions}
                      onChange={setNewOptions}
                      tables={tables}
                      fields={allFields}

                    />
                  )}
                  <Button
                    className="w-full" size="sm"
                    onClick={() => {
                      if (!newName.trim()) return;
                      props.onAddField(newName.trim(), newType, newOptions);
                      setNewName(''); setNewType('text'); setNewOptions({}); setAddFieldOpen(false);
                    }}
                  >Add field</Button>
                </DropdownMenuContent>
              </DropdownMenu>
            </th>
          </tr>
        </thead>
        <tbody>
          {records.map((r, idx) => {
            const isSelected = selected.has(r.id);
            return (
            <tr key={r.id} className="group hover:bg-muted/30">
              <td className="relative border-r border-b w-16 min-w-16 max-w-16 p-0 align-middle">
                {/* The spacer keeps the rail measurable; the overlays fill the full row height. */}
                <div className="min-h-9" aria-hidden="true" />
                <span
                  className={`absolute inset-0 flex items-center justify-center text-xs text-muted-foreground tabular-nums transition-opacity ${
                    isSelected ? 'opacity-0' : 'group-hover:opacity-0'
                  }`}
                >
                  {idx + 1}
                </span>
                <div
                  className={`absolute inset-0 flex items-center justify-center gap-1 transition-opacity ${
                    isSelected
                      ? 'opacity-100'
                      : 'pointer-events-none opacity-0 group-hover:pointer-events-auto group-hover:opacity-100'
                  }`}
                >
                  {/* Keep the control rail fixed so hover never changes table layout. */}
                  <Checkbox
                    checked={isSelected}
                    onCheckedChange={() => toggleOne(r.id)}
                  />
                  {props.onExpand && (
                    <button
                      type="button"
                      className="text-muted-foreground hover:text-foreground"
                      title="Open record"
                      onClick={() => props.onExpand!(idx)}
                    >
                      <Maximize2 className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              </td>
              {fields.map((f) => (
                <CellEditor
                  key={f.id}
                  field={f}
                  value={r.values?.[f.key]}
                  record={r}
                  fields={allFields}

                  rowHeight={props.rowHeight}
                  onChange={(v) => props.onUpdateRecord(r.id, { ...r.values, [f.key]: v })}
                />
              ))}
              <td className="border-b" />
            </tr>
            );
          })}
          <tr>
            <td colSpan={fields.length + 2} className="border-b p-0">
              <button
                onClick={props.onAddRow}
                className="h-9 w-full text-left px-3 text-sm text-muted-foreground hover:bg-muted flex items-center gap-1"
              >
                <Plus className="h-3.5 w-3.5" /> Add row
              </button>
            </td>
          </tr>
        </tbody>
      </table>

      {configField && (
        <FieldConfigDialog
          field={configField}
          tables={tables}
          fields={fields}
          onClose={() => setConfigField(null)}
          onSave={(patch) => { props.onConfigureField(configField.id, patch); setConfigField(null); }}
        />
      )}
    </div>
  );
}

// Type-specific options editor, shared by the add-field popover and the
// per-field config dialog. select/multiselect → user-defined choices;
// link → target table + display field; lookup → pull a field from the linked
// row; rollup → aggregate rows from another table that link back here.
function FieldOptionsEditor({ type, options, onChange, tables, fields }: {
  type: FlowtableFieldType;
  options: Record<string, unknown>;
  onChange: (o: Record<string, unknown>) => void;
  tables: FlowtableTable[];
  fields: FlowtableField[];
}) {
  if (type === 'select' || type === 'multiselect') {
    const choices = (options.choices as string[]) ?? [];
    return (
      <div className="space-y-1">
        <Label className="text-xs text-muted-foreground">Choices (one per line)</Label>
        <Textarea
          rows={4}
          defaultValue={choices.join('\n')}
          placeholder={'New\nIn progress\nDone'}
          onChange={(e) => onChange({
            ...options,
            choices: e.target.value.split('\n').map((s) => s.trim()).filter(Boolean),
          })}
          className="text-sm"
        />
      </div>
    );
  }
  if (type === 'link') {
    const targetId = (options.link_table_id as string) || '';
    return <LinkOptionsEditor targetId={targetId} options={options} onChange={onChange} tables={tables} />;
  }
  if (type === 'lookup') {
    return <LookupOptionsEditor options={options} onChange={onChange} fields={fields} />;
  }
  if (type === 'rollup') {
    return <RollupOptionsEditor options={options} onChange={onChange} tables={tables} />;
  }
  if (type === 'user') {
    const rf = (options.role_filter as string) || '';
    return (
      <div className="space-y-1">
        <Label className="text-xs text-muted-foreground">Limit picker to role (optional)</Label>
        <Select value={rf || '__any__'} onValueChange={(v) => onChange({ ...options, role_filter: v === '__any__' ? '' : v })}>
          <SelectTrigger><SelectValue placeholder="Everyone" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="__any__">Everyone</SelectItem>
            {APP_ROLE_FILTERS.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}
          </SelectContent>
        </Select>
        <p className="text-[11px] text-muted-foreground">Assignments store the person; the role only filters who is pickable.</p>
      </div>
    );
  }
  if (type === 'currency') {
    return (
      <div className="space-y-1">
        <Label className="text-xs text-muted-foreground">Currency code</Label>
        <Input
          defaultValue={(options.currency_code as string) || 'SEK'}
          maxLength={3}
          onChange={(e) => onChange({ ...options, currency_code: e.target.value.toUpperCase() })}
        />
      </div>
    );
  }
  return null;
}

// Lookup — pull a field from the row referenced by one of THIS table's link
// columns (e.g. Case → show the linked Product's price). Pick a link field in
// this table, then a field from that link's target table.
function LookupOptionsEditor({ options, onChange, fields }: {
  options: Record<string, unknown>;
  onChange: (o: Record<string, unknown>) => void;
  fields: FlowtableField[];
}) {
  const viaKey = (options.via_link_field as string) || '';
  const linkFields = fields.filter((f) => f.type === 'link' && f.options?.link_table_id);
  const viaField = linkFields.find((f) => f.key === viaKey);
  const targetTableId = viaField?.options?.link_table_id as string | undefined;
  const { data: targetFields = [] } = useFlowtableFields(targetTableId);
  return (
    <div className="space-y-2">
      <div className="space-y-1">
        <Label className="text-xs text-muted-foreground">Via link field</Label>
        <Select value={viaKey} onValueChange={(v) => onChange({ via_link_field: v, target_field: '' })}>
          <SelectTrigger><SelectValue placeholder={linkFields.length ? 'Pick a link field' : 'No link fields yet'} /></SelectTrigger>
          <SelectContent>
            {linkFields.map((f) => <SelectItem key={f.key} value={f.key}>{f.name}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
      {targetTableId && (
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">Show which field</Label>
          <Select value={(options.target_field as string) || ''} onValueChange={(v) => onChange({ ...options, target_field: v })}>
            <SelectTrigger><SelectValue placeholder="Field from linked row" /></SelectTrigger>
            <SelectContent>
              {targetFields.map((f) => <SelectItem key={f.key} value={f.key}>{f.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      )}
    </div>
  );
}

// Rollup — aggregate rows from another table that link back to this row
// (e.g. Product → count(Cases) or sum(Order.total)). Pick the source table,
// the link field in it that points here, an aggregation, and (for
// sum/avg/min/max) the field to aggregate.
function RollupOptionsEditor({ options, onChange, tables }: {
  options: Record<string, unknown>;
  onChange: (o: Record<string, unknown>) => void;
  tables: FlowtableTable[];
}) {
  const sourceId = (options.source_table_id as string) || '';
  const agg = (options.agg as string) || 'count';
  const { data: sourceFields = [] } = useFlowtableFields(sourceId || undefined);
  const linkFields = sourceFields.filter((f) => f.type === 'link');
  const numericish = sourceFields.filter((f) => ['number', 'text'].includes(f.type));
  return (
    <div className="space-y-2">
      <div className="space-y-1">
        <Label className="text-xs text-muted-foreground">Source table (that links here)</Label>
        <Select value={sourceId} onValueChange={(v) => onChange({ source_table_id: v, source_link_field: '', agg: 'count' })}>
          <SelectTrigger><SelectValue placeholder="Pick a table" /></SelectTrigger>
          <SelectContent>
            {tables.map((t) => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
      {sourceId && (
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">Its link field (pointing here)</Label>
          <Select value={(options.source_link_field as string) || ''} onValueChange={(v) => onChange({ ...options, source_link_field: v })}>
            <SelectTrigger><SelectValue placeholder={linkFields.length ? 'Pick a link field' : 'No link fields'} /></SelectTrigger>
            <SelectContent>
              {linkFields.map((f) => <SelectItem key={f.key} value={f.key}>{f.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      )}
      {sourceId && (
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">Aggregate</Label>
          <Select value={agg} onValueChange={(v) => onChange({ ...options, agg: v })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {ROLLUP_AGGS.map((a) => <SelectItem key={a} value={a}>{a}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      )}
      {sourceId && agg !== 'count' && (
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">Of field</Label>
          <Select value={(options.agg_field as string) || ''} onValueChange={(v) => onChange({ ...options, agg_field: v })}>
            <SelectTrigger><SelectValue placeholder="Numeric field" /></SelectTrigger>
            <SelectContent>
              {numericish.map((f) => <SelectItem key={f.key} value={f.key}>{f.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      )}
    </div>
  );
}

function LinkOptionsEditor({ targetId, options, onChange, tables }: {
  targetId: string;
  options: Record<string, unknown>;
  onChange: (o: Record<string, unknown>) => void;
  tables: FlowtableTable[];
}) {
  const { data: targetFields = [] } = useFlowtableFields(targetId || undefined);
  return (
    <div className="space-y-2">
      <div className="space-y-1">
        <Label className="text-xs text-muted-foreground">Linked table</Label>
        <Select
          value={targetId}
          onValueChange={(v) => onChange({ link_table_id: v, display_field: '' })}
        >
          <SelectTrigger><SelectValue placeholder="Pick a table" /></SelectTrigger>
          <SelectContent>
            {tables.map((t) => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
      {targetId && (
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">Show which field</Label>
          <Select
            value={(options.display_field as string) || ''}
            onValueChange={(v) => onChange({ ...options, display_field: v })}
          >
            <SelectTrigger><SelectValue placeholder="Display field" /></SelectTrigger>
            <SelectContent>
              {targetFields.map((f) => <SelectItem key={f.key} value={f.key}>{f.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      )}
    </div>
  );
}

// Per-field config dialog — rename, retype, and edit type-specific options.
function FieldConfigDialog({ field, tables, fields, onClose, onSave }: {
  field: FlowtableField;
  tables: FlowtableTable[];
  fields: FlowtableField[];
  onClose: () => void;
  onSave: (patch: Partial<FlowtableField>) => void;
}) {
  const [name, setName] = useState(field.name);
  const [type, setType] = useState<FlowtableFieldType>(field.type);
  const [options, setOptions] = useState<Record<string, unknown>>(field.options ?? {});
  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Configure field</DialogTitle>
          <DialogDescription>Rename, change type, or edit its options.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Type</Label>
            <Select value={type} onValueChange={(v) => { setType(v as FlowtableFieldType); setOptions({}); }}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {FIELD_TYPES.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          {TYPES_WITH_OPTIONS.has(type) && (
            <FieldOptionsEditor type={type} options={options} onChange={setOptions} tables={tables} fields={fields} />
          )}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button
            onClick={() => onSave({ name: name.trim() || field.name, type, options })}
          >Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CellEditor({ field, value, record, fields, onChange, rowHeight = 'short' }: {
  field: FlowtableField;
  value: unknown;
  record?: FlowtableRecord;
  fields?: FlowtableField[];
  onChange: (v: unknown) => void;
  rowHeight?: RowHeight;
}) {
  const spec = rowHeightSpec(rowHeight);
  const common = 'h-9 w-full px-2 bg-transparent border-0 outline-none focus:ring-2 focus:ring-primary/40 focus:bg-background';
  const cellStyle = { width: field.width, minWidth: field.width } as const;
  if (field.type === 'lookup') {
    return <LookupCell field={field} record={record} fields={fields ?? []} cellStyle={cellStyle} />;
  }
  if (field.type === 'rollup') {
    return <RollupCell field={field} record={record} cellStyle={cellStyle} />;
  }
  if (field.type === 'checkbox') {
    return (
      <td className="border-r border-b p-0 align-top" style={cellStyle}>
        <div className="h-9 px-2 flex items-center">
          <Checkbox checked={!!value} onCheckedChange={(v) => onChange(!!v)} />
        </div>
      </td>
    );
  }
  // Text-ish columns are where row height actually matters: read as wrapped
  // text (clamped to the chosen number of lines, or unclamped in "Fit to
  // text"), edit in an auto-growing textarea that never hides content behind a
  // scroll. Single-line <input> columns (email/url/phone/plain text) silently
  // cut off long values, so they wrap too as soon as the row is taller than one
  // line.
  const isLinkish = field.type === 'url' || field.type === 'email' || field.type === 'phone';
  const wrapsAsText =
    field.type === 'longtext' ||
    isLinkish ||
    (rowHeight !== 'short' && field.type === 'text');
  if (wrapsAsText) {
    return (
      <WrapTextCell
        value={value}
        onChange={onChange}
        cellStyle={cellStyle}
        spec={spec}
        multiline={field.type === 'longtext'}
        href={isLinkish ? linkishHref(field.type, value) : undefined}
      />
    );
  }


  if (field.type === 'select') {
    // The current value is always offered, even when it is not among the
    // configured choices — otherwise the cell renders blank and editing any
    // other cell in the column silently overwrites good data. See selectChoices.
    const choices = selectChoices(
      field.options?.choices as string[] | undefined,
      value ? [String(value)] : [],
      ['New', 'In progress', 'Done'],
    );
    return (
      <td className="border-r border-b p-0 align-top" style={cellStyle}>
        <select
          value={(value as string) ?? ''}
          onChange={(e) => onChange(e.target.value || null)}
          className={common}
        >
          <option value=""></option>
          {choices.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
      </td>
    );
  }
  if (field.type === 'link') {
    return <LinkCell field={field} value={value} onChange={onChange} cellStyle={cellStyle} common={common} />;
  }
  if (field.type === 'user') {
    return <UserCell field={field} value={value} onChange={onChange} cellStyle={cellStyle} common={common} />;
  }
  if (field.type === 'currency') {
    const code = (field.options?.currency_code as string) || 'SEK';
    return (
      <td className="border-r border-b p-0 align-top" style={cellStyle}>
        <div className="flex items-center h-9">
          <input
            type="number"
            defaultValue={(value as number | undefined) ?? ''}
            onBlur={(e) => {
              const v = e.target.value === '' ? null : Number(e.target.value);
              if (v !== (value ?? null)) onChange(v);
            }}
            className={`${common} text-right pr-1`}
          />
          <span className="pr-2 text-[11px] text-muted-foreground shrink-0">{code}</span>
        </div>
      </td>
    );
  }
  if (field.type === 'rating') {
    const n = Number(value) || 0;
    return (
      <td className="border-r border-b p-0 align-top" style={cellStyle}>
        <div className="h-9 px-2 flex items-center gap-0.5">
          {[1, 2, 3, 4, 5].map((i) => (
            <button
              key={i}
              type="button"
              onClick={() => onChange(i === n ? null : i)}
              className={`text-sm leading-none transition-colors ${i <= n ? 'text-amber-500' : 'text-muted-foreground/30 hover:text-amber-300'}`}
              aria-label={`Rate ${i}`}
            >★</button>
          ))}
        </div>
      </td>
    );
  }
  // Date columns render an <input type="date">, which only accepts yyyy-MM-dd.
  // Imported data is usually free-form text ("2/13/2026", "2026-02-13 10:31:16"),
  // so coerce for display — otherwise switching a text column to Date blanks
  // every cell. Store back the normalized yyyy-MM-dd on edit.
  if (field.type === 'date') {
    const display = toDateInputValue(value);
    return (
      <td className="border-r border-b p-0 align-top" style={cellStyle}>
        <input
          type="date"
          key={display}
          defaultValue={display}
          title={display ? undefined : (value as string) ?? ''}
          onBlur={(e) => { if (e.target.value !== display) onChange(e.target.value || null); }}
          className={common}
        />
      </td>
    );
  }
  const inputType =
    field.type === 'number' ? 'number' :
    field.type === 'email' ? 'email' :
    field.type === 'url' ? 'url' :
    field.type === 'phone' ? 'tel' : 'text';
  return (
    <td className="border-r border-b p-0 align-top" style={cellStyle}>
      <input
        type={inputType}
        defaultValue={(value as string | number | undefined) ?? ''}
        onBlur={(e) => {
          const v = field.type === 'number' ? (e.target.value === '' ? null : Number(e.target.value)) : e.target.value;
          if (v !== (value ?? '')) onChange(v);
        }}
        className={common}
      />
    </td>
  );
}

// URL/email/phone cells are addresses, not prose — render them as real links so
// a row is actionable (open the site, start a mail draft, dial) without copy
// -paste. Bare domains ("flowwink.com") get https:// so the browser does not
// treat them as a relative path.
function linkishHref(type: string, value: unknown): string | undefined {
  const raw = value == null ? '' : String(value).trim();
  if (!raw) return undefined;
  if (type === 'email') return raw.includes('@') ? `mailto:${raw}` : undefined;
  if (type === 'phone') return `tel:${raw.replace(/[^\d+]/g, '')}`;
  if (/^(https?:|mailto:|tel:)/i.test(raw)) return raw;
  if (/^[\w.-]+\.[a-z]{2,}(\/|$|\?)/i.test(raw)) return `https://${raw}`;
  return undefined;
}

// Wrapping text cell — the reading half of the row-height control. Idle state
// is plain wrapped text (clamped to spec.lines, or the full value in "Fit to
// text"); clicking or pressing Enter swaps in an auto-growing textarea so the
// cell you edit is exactly as tall as its content. Esc reverts, blur saves.
function WrapTextCell({ value, onChange, cellStyle, spec, multiline, href }: {
  value: unknown;
  onChange: (v: unknown) => void;
  cellStyle: { width: number; minWidth: number };
  spec: (typeof ROW_HEIGHTS)[number];
  multiline: boolean;
  href?: string;
}) {
  const [editing, setEditing] = useState(false);
  const ref = useRef<HTMLTextAreaElement>(null);
  const text = value == null ? '' : String(value);

  const autosize = (el: HTMLTextAreaElement) => {
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  };

  useEffect(() => {
    if (editing && ref.current) {
      autosize(ref.current);
      ref.current.focus();
      ref.current.setSelectionRange(ref.current.value.length, ref.current.value.length);
    }
  }, [editing]);

  if (editing) {
    return (
      <td className="border-r border-b p-0 align-top" style={cellStyle}>
        <textarea
          ref={ref}
          defaultValue={text}
          onInput={(e) => autosize(e.currentTarget)}
          onBlur={(e) => {
            setEditing(false);
            if (e.target.value !== text) onChange(e.target.value);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Escape') { e.currentTarget.value = text; setEditing(false); }
            if (e.key === 'Enter' && !multiline && !e.shiftKey) { e.preventDefault(); e.currentTarget.blur(); }
          }}
          className="w-full px-2 py-1.5 text-sm leading-snug bg-background border-0 resize-none outline-none ring-2 ring-inset ring-primary/40 max-h-[60vh] overflow-auto"
          style={{ minHeight: spec.minPx }}
        />
      </td>
    );
  }

  return (
    <td className="border-r border-b p-0 align-top" style={cellStyle}>
      <div
        role="textbox"
        tabIndex={0}
        title={spec.lines && text ? text : undefined}
        onClick={() => setEditing(true)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === 'F2') { e.preventDefault(); setEditing(true); }
        }}
        className="px-2 py-1.5 text-sm leading-snug whitespace-pre-wrap break-words cursor-text outline-none focus:ring-2 focus:ring-inset focus:ring-primary/40"
        style={{
          minHeight: spec.minPx,
          ...(spec.lines
            ? {
                display: '-webkit-box',
                WebkitBoxOrient: 'vertical' as const,
                WebkitLineClamp: spec.lines,
                overflow: 'hidden',
              }
            : {}),
        }}
      >
        {text
          ? (href
              ? (
                <a
                  href={href}
                  target={href.startsWith('http') ? '_blank' : undefined}
                  rel="noreferrer"
                  onClick={(e) => e.stopPropagation()}
                  className="text-primary underline decoration-primary/40 underline-offset-2 hover:decoration-primary"
                >
                  {text}
                </a>
              )
              : text)
          : <span className="text-muted-foreground/40">—</span>}
      </div>
    </td>
  );
}


// Link cell — a searchable picker over the target table's rows (Airtable
// "link to another record"). Stores the linked record id in values[key];
// resolves it to the configured display field on read, so the grid shows
// human text, not a UUID. Tolerates a deleted target row (shows "(missing)").
function LinkCell({ field, value, onChange, cellStyle, common }: {
  field: FlowtableField;
  value: unknown;
  onChange: (v: unknown) => void;
  cellStyle: { width: number; minWidth: number };
  common: string;
}) {
  const targetId = field.options?.link_table_id as string | undefined;
  const displayField = field.options?.display_field as string | undefined;
  const { data: rows = [] } = useFlowtableRecords(targetId);
  const [open, setOpen] = useState(false);

  const displayOf = (id: string | undefined): string => {
    if (!id) return '';
    const r = rows.find((x) => x.id === id);
    if (!r) return '(missing)';
    const v = displayField ? r.values?.[displayField] : undefined;
    return String(v ?? Object.values(r.values ?? {})[0] ?? r.id);
  };

  if (!targetId) {
    return (
      <td className="border-r border-b p-0 align-top" style={cellStyle}>
        <div className="h-9 px-2 flex items-center text-xs text-muted-foreground">Configure link target</div>
      </td>
    );
  }

  const current = value as string | undefined;
  return (
    <td className="border-r border-b p-0 align-top" style={cellStyle}>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button className={`${common} text-left truncate`}>
            {current
              ? <span className="inline-flex items-center rounded bg-muted px-1.5 py-0.5 text-xs">{displayOf(current)}</span>
              : <span className="text-muted-foreground">—</span>}
          </button>
        </PopoverTrigger>
        <PopoverContent className="p-0 w-64" align="start">
          <Command>
            <CommandInput placeholder="Search rows…" />
            <CommandList>
              <CommandEmpty>No match</CommandEmpty>
              <CommandGroup>
                <CommandItem value="__clear__" onSelect={() => { onChange(null); setOpen(false); }}>
                  <span className="text-muted-foreground">— (clear)</span>
                </CommandItem>
                {rows.slice(0, 500).map((r) => (
                  <CommandItem
                    key={r.id}
                    value={`${displayOf(r.id)} ${r.id}`}
                    onSelect={() => { onChange(r.id); setOpen(false); }}
                  >
                    {displayOf(r.id)}
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </td>
  );
}

// User cell — assign a TEAM MEMBER (profiles.id). The picker lists people
// (optionally scoped to a platform role via options.role_filter); the cell
// shows an initials chip + name. Roles gate what a person may DO; the value
// stored is always the person — never a role.
function UserCell({ field, value, onChange, cellStyle, common }: {
  field: FlowtableField;
  value: unknown;
  onChange: (v: unknown) => void;
  cellStyle: { width: number; minWidth: number };
  common: string;
}) {
  const roleFilter = (field.options?.role_filter as string) || undefined;
  const { data: people = [] } = useTeamProfiles(roleFilter);
  const [open, setOpen] = useState(false);
  const current = value as string | undefined;
  const person = current ? people.find((p) => p.id === current) : undefined;

  const initials = (p?: TeamProfile) => {
    const n = p?.full_name || p?.email || '?';
    return n.split(/\s+/).map((w) => w[0]).slice(0, 2).join('').toUpperCase();
  };
  const displayName = (p?: TeamProfile) => p?.full_name || p?.email || '(unknown)';

  return (
    <td className="border-r border-b p-0 align-top" style={cellStyle}>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button className={`${common} text-left truncate`}>
            {current ? (
              <span className="inline-flex items-center gap-1.5">
                <span className="h-5 w-5 rounded-full bg-primary/15 text-primary text-[10px] font-semibold flex items-center justify-center shrink-0">
                  {person ? initials(person) : '?'}
                </span>
                <span className="text-sm truncate">{person ? displayName(person) : '(unknown user)'}</span>
              </span>
            ) : (
              <span className="text-muted-foreground">—</span>
            )}
          </button>
        </PopoverTrigger>
        <PopoverContent className="p-0 w-64" align="start">
          <Command>
            <CommandInput placeholder="Search people…" />
            <CommandList>
              <CommandEmpty>No match</CommandEmpty>
              <CommandGroup>
                <CommandItem value="__clear__" onSelect={() => { onChange(null); setOpen(false); }}>
                  <span className="text-muted-foreground">— (unassign)</span>
                </CommandItem>
                {people.map((p) => (
                  <CommandItem
                    key={p.id}
                    value={`${displayName(p)} ${p.email} ${p.id}`}
                    onSelect={() => { onChange(p.id); setOpen(false); }}
                  >
                    <span className="h-5 w-5 rounded-full bg-primary/15 text-primary text-[10px] font-semibold flex items-center justify-center mr-2 shrink-0">
                      {initials(p)}
                    </span>
                    <span className="flex-1 min-w-0">
                      <span className="block text-sm truncate">{displayName(p)}</span>
                      {p.title && <span className="block text-[11px] text-muted-foreground truncate">{p.title}</span>}
                    </span>
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </td>
  );
}

// Lookup cell — read-only. Follows one of this table's link fields to the
// referenced row and shows a field from it (e.g. Case → linked Product.price).
function LookupCell({ field, record, fields, cellStyle }: {
  field: FlowtableField;
  record?: FlowtableRecord;
  fields: FlowtableField[];
  cellStyle: { width: number; minWidth: number };
}) {
  const viaKey = field.options?.via_link_field as string | undefined;
  const targetField = field.options?.target_field as string | undefined;
  const viaField = fields.find((f) => f.key === viaKey);
  const targetTableId = viaField?.options?.link_table_id as string | undefined;
  const { data: rows = [] } = useFlowtableRecords(targetTableId);
  const linkedId = viaKey ? (record?.values?.[viaKey] as string | undefined) : undefined;
  const targetRow = linkedId ? rows.find((r) => r.id === linkedId) : undefined;
  const out = targetRow && targetField ? targetRow.values?.[targetField] : undefined;
  return (
    <td className="border-r border-b p-0 align-top" style={cellStyle}>
      <div className="h-9 px-2 flex items-center text-sm text-muted-foreground truncate">
        {!viaKey || !targetField
          ? <span className="text-xs italic">configure lookup</span>
          : out != null && out !== '' ? String(out) : ''}
      </div>
    </td>
  );
}

// Rollup cell — read-only. Aggregates rows in another table that link back to
// this row (e.g. Product → count(Cases), sum(Order.total)).
function RollupCell({ field, record, cellStyle }: {
  field: FlowtableField;
  record?: FlowtableRecord;
  cellStyle: { width: number; minWidth: number };
}) {
  const sourceTableId = field.options?.source_table_id as string | undefined;
  const sourceLinkField = field.options?.source_link_field as string | undefined;
  const agg = (field.options?.agg as string) || 'count';
  const aggField = field.options?.agg_field as string | undefined;
  const { data: rows = [] } = useFlowtableRecords(sourceTableId);

  let out: string = '';
  if (!sourceTableId || !sourceLinkField) {
    out = 'configure rollup';
  } else if (record) {
    const matches = rows.filter((r) => r.values?.[sourceLinkField] === record.id);
    if (agg === 'count') {
      out = String(matches.length);
    } else {
      const nums = matches
        .map((r) => Number(aggField ? r.values?.[aggField] : undefined))
        .filter((n) => !Number.isNaN(n));
      if (!aggField) out = '—';
      else if (!nums.length) out = '0';
      else if (agg === 'sum') out = String(nums.reduce((a, b) => a + b, 0));
      else if (agg === 'avg') out = String(Math.round((nums.reduce((a, b) => a + b, 0) / nums.length) * 100) / 100);
      else if (agg === 'min') out = String(Math.min(...nums));
      else if (agg === 'max') out = String(Math.max(...nums));
    }
  }
  return (
    <td className="border-r border-b p-0 align-top" style={cellStyle}>
      <div className="h-9 px-2 flex items-center text-sm tabular-nums text-muted-foreground">
        {out === 'configure rollup' ? <span className="text-xs italic">{out}</span> : out}
      </div>
    </td>
  );
}

// Best-effort coercion of arbitrary imported date text to yyyy-MM-dd for
// <input type="date">. Handles ISO (with or without time), M/D/YYYY and
// D/M/YYYY (ambiguous → assumes the US M/D/YYYY that CSV exports usually emit).
// Returns '' when it can't parse, so the cell stays editable without lying.
function toDateInputValue(raw: unknown): string {
  if (raw == null || raw === '') return '';
  const s = String(raw).trim();
  // Already yyyy-MM-dd (optionally followed by time) — take the date part.
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  // M/D/YYYY or D/M/YYYY
  const slash = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (slash) {
    const a = Number(slash[1]);
    const b = Number(slash[2]);
    const y = slash[3];
    // If the first part can't be a month (>12), it must be the day.
    const month = a > 12 ? b : a;
    const day = a > 12 ? a : b;
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      return `${y}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    }
  }
  return '';
}

// ---------- View toolbar: filter + sort (persisted per table) ----------
function ViewToolbar({ fields, config, onChange }: {
  fields: FlowtableField[];
  config: FlowtableViewConfig;
  onChange: (c: FlowtableViewConfig) => void;
}) {
  const filters = config.filters ?? [];
  const sort = config.sort ?? null;
  const activeCount = filters.length;
  const setFilters = (next: FlowtableViewFilter[]) => onChange({ ...config, filters: next });
  return (
    <div className="flex items-center gap-1.5">
      {/* Filter */}
      <Popover>
        <PopoverTrigger asChild>
          <Button size="sm" variant={activeCount ? 'secondary' : 'ghost'} className="h-8 gap-1.5 text-xs">
            <Filter className="h-3.5 w-3.5" />
            Filter
            {activeCount > 0 && (
              <span className="ml-0.5 rounded-full bg-primary/15 text-primary px-1.5 text-[10px] font-semibold">{activeCount}</span>
            )}
          </Button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-[26rem] p-3 space-y-2">
          {filters.length === 0 && (
            <p className="text-xs text-muted-foreground px-0.5 py-1">No filters. Show all rows.</p>
          )}
          {filters.map((f, i) => {
            const opMeta = FILTER_OPS.find((o) => o.value === f.op);
            return (
              <div key={i} className="flex items-center gap-1.5">
                <span className="text-[11px] text-muted-foreground w-8 shrink-0">{i === 0 ? 'Where' : 'and'}</span>
                <Select value={f.field} onValueChange={(v) => setFilters(filters.map((x, j) => j === i ? { ...x, field: v } : x))}>
                  <SelectTrigger className="h-8 text-xs flex-1"><SelectValue placeholder="Field" /></SelectTrigger>
                  <SelectContent>
                    {fields.map((fl) => <SelectItem key={fl.key} value={fl.key}>{fl.name}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Select value={f.op} onValueChange={(v) => setFilters(filters.map((x, j) => j === i ? { ...x, op: v as FlowtableViewFilter['op'] } : x))}>
                  <SelectTrigger className="h-8 text-xs w-28"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {FILTER_OPS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                  </SelectContent>
                </Select>
                {opMeta?.needsValue && (
                  <Input
                    className="h-8 text-xs w-28"
                    value={f.value ?? ''}
                    onChange={(e) => setFilters(filters.map((x, j) => j === i ? { ...x, value: e.target.value } : x))}
                    placeholder="value"
                  />
                )}
                <button className="text-muted-foreground hover:text-destructive shrink-0" onClick={() => setFilters(filters.filter((_, j) => j !== i))}>
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            );
          })}
          <div className="flex items-center justify-between pt-1">
            <Button size="sm" variant="ghost" className="h-7 text-xs gap-1"
              onClick={() => setFilters([...filters, { field: fields[0]?.key ?? '', op: 'contains', value: '' }])}
              disabled={!fields.length}
            >
              <Plus className="h-3.5 w-3.5" /> Add condition
            </Button>
            {filters.length > 0 && (
              <Button size="sm" variant="ghost" className="h-7 text-xs text-muted-foreground" onClick={() => setFilters([])}>
                Clear all
              </Button>
            )}
          </div>
        </PopoverContent>
      </Popover>

      {/* Sort */}
      <Popover>
        <PopoverTrigger asChild>
          <Button size="sm" variant={sort ? 'secondary' : 'ghost'} className="h-8 gap-1.5 text-xs">
            <ArrowUpDown className="h-3.5 w-3.5" />
            {sort ? `Sorted by ${fields.find((f) => f.key === sort.field)?.name ?? sort.field}` : 'Sort'}
          </Button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-64 p-3 space-y-2">
          <div className="flex items-center gap-1.5">
            <Select value={sort?.field ?? ''} onValueChange={(v) => onChange({ ...config, sort: { field: v, dir: sort?.dir ?? 'asc' } })}>
              <SelectTrigger className="h-8 text-xs flex-1"><SelectValue placeholder="Field" /></SelectTrigger>
              <SelectContent>
                {fields.map((fl) => <SelectItem key={fl.key} value={fl.key}>{fl.name}</SelectItem>)}
              </SelectContent>
            </Select>
            <div className="flex rounded-md border overflow-hidden text-xs">
              {(['asc', 'desc'] as const).map((d) => (
                <button key={d}
                  className={`px-2 py-1.5 ${sort?.dir === d ? 'bg-accent text-accent-foreground' : 'hover:bg-muted'}`}
                  onClick={() => sort?.field && onChange({ ...config, sort: { field: sort.field, dir: d } })}
                >{d === 'asc' ? '↑' : '↓'}</button>
              ))}
            </div>
          </div>
          {sort && (
            <Button size="sm" variant="ghost" className="h-7 text-xs w-full text-muted-foreground" onClick={() => onChange({ ...config, sort: null })}>
              Clear sort
            </Button>
          )}
        </PopoverContent>
      </Popover>
    </div>
  );
}

// ---------- Kanban view: group into columns by a select/text/link field, DnD ----------
function KanbanView({ fields, records, config, onChangeConfig, onUpdate }: {
  fields: FlowtableField[];
  records: FlowtableRecord[];
  config: FlowtableViewConfig;
  onChangeConfig: (c: FlowtableViewConfig) => void;
  onUpdate: (id: string, values: Record<string, unknown>) => void;
}) {
  const groupKey = config.kanban_field ?? null;
  const groupField = fields.find((f) => f.key === groupKey);
  const [dragId, setDragId] = useState<string | null>(null);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));

  // Fields shown on a card: the first text-ish field as title, then a few more.
  const titleField = fields.find((f) => ['text', 'longtext'].includes(f.type)) ?? fields[0];
  const bodyFields = fields.filter((f) => f !== titleField && f.key !== groupKey && !['longtext'].includes(f.type)).slice(0, 4);

  const columns = useMemo(() => {
    if (!groupField) return [];
    let values: string[];
    if (groupField.type === 'select' || groupField.type === 'multiselect') {
      // Configured choices set the column ORDER; values in the data that are not
      // configured still get a column rather than collapsing into Uncategorized.
      // Without this, grouping by an unconfigured select produced a board with
      // exactly one column — every card in "Uncategorized".
      values = selectChoices(
        groupField.options?.choices as string[] | undefined,
        [...new Set(records.map((r) => String(r.values?.[groupField.key] ?? '')).filter(Boolean))],
      );
    } else {
      values = [...new Set(records.map((r) => String(r.values?.[groupField.key] ?? '')).filter(Boolean))];
    }
    const cols = values.map((v) => ({ key: v, label: v }));
    cols.push({ key: '__none__', label: 'Uncategorized' });
    return cols;
  }, [groupField, records]);

  const byColumn = useMemo(() => {
    const map: Record<string, FlowtableRecord[]> = {};
    for (const c of columns) map[c.key] = [];
    for (const r of records) {
      const v = groupField ? String(r.values?.[groupField.key] ?? '') : '';
      const k = v && map[v] !== undefined ? v : '__none__';
      (map[k] = map[k] || []).push(r);
    }
    return map;
  }, [columns, records, groupField]);

  if (!groupField) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-center space-y-3 max-w-xs">
          <Columns3 className="h-10 w-10 mx-auto text-muted-foreground" />
          <div>
            <h3 className="text-sm font-semibold">Group cards by a field</h3>
            <p className="text-xs text-muted-foreground">Pick a single-select or text field to stack cards into columns.</p>
          </div>
          <Select onValueChange={(v) => onChangeConfig({ ...config, kanban_field: v })}>
            <SelectTrigger className="h-9"><SelectValue placeholder="Group by…" /></SelectTrigger>
            <SelectContent>
              {fields.filter((f) => !['lookup', 'rollup', 'checkbox', 'user'].includes(f.type)).map((f) => (
                <SelectItem key={f.key} value={f.key}>{f.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
    );
  }

  const onDragEnd = (e: DragEndEvent) => {
    setDragId(null);
    const over = e.over?.id as string | undefined;
    const cardId = e.active.id as string;
    if (!over) return;
    const rec = records.find((r) => r.id === cardId);
    if (!rec) return;
    const newVal = over === '__none__' ? null : over;
    if (String(rec.values?.[groupField.key] ?? '') === String(newVal ?? '')) return;
    onUpdate(cardId, { ...rec.values, [groupField.key]: newVal });
  };

  const dragRec = dragId ? records.find((r) => r.id === dragId) : null;

  return (
    <div className="h-full flex flex-col">
      {/* Group-by control */}
      <div className="px-3 py-2 flex items-center gap-2 border-b bg-muted/20">
        <span className="text-xs text-muted-foreground">Grouping by</span>
        <Select value={groupField.key} onValueChange={(v) => onChangeConfig({ ...config, kanban_field: v })}>
          <SelectTrigger className="h-7 text-xs w-44"><SelectValue /></SelectTrigger>
          <SelectContent>
            {fields.filter((f) => !['lookup', 'rollup', 'checkbox', 'user'].includes(f.type)).map((f) => (
              <SelectItem key={f.key} value={f.key}>{f.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <DndContext sensors={sensors} collisionDetection={closestCorners}
        onDragStart={(e: DragStartEvent) => setDragId(e.active.id as string)}
        onDragEnd={onDragEnd}
      >
        <div className="flex-1 overflow-x-auto overflow-y-hidden">
          <div className="flex gap-3 p-3 h-full min-w-fit">
            {columns.map((col) => (
              <KanbanColumn key={col.key} id={col.key} label={col.label} count={byColumn[col.key]?.length ?? 0}>
                {(byColumn[col.key] ?? []).map((r) => (
                  <KanbanCard key={r.id} id={r.id} record={r} titleField={titleField} bodyFields={bodyFields} />
                ))}
              </KanbanColumn>
            ))}
          </div>
        </div>
        <DragOverlay dropAnimation={null}>
          {dragRec && titleField ? (
            <div className="w-64 rounded-lg border bg-background shadow-lg px-3 py-2 text-sm rotate-2">
              {String(dragRec.values?.[titleField.key] ?? 'Untitled')}
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>
    </div>
  );
}

function KanbanColumn({ id, label, count, children }: {
  id: string; label: string; count: number; children: React.ReactNode;
}) {
  const { setNodeRef, isOver } = useDroppable({ id });
  return (
    <div className="w-72 shrink-0 flex flex-col rounded-lg bg-muted/40">
      <div className="px-3 py-2 flex items-center justify-between">
        <span className="text-xs font-semibold truncate">{label}</span>
        <span className="text-[10px] text-muted-foreground rounded-full bg-background px-1.5 py-0.5">{count}</span>
      </div>
      <div
        ref={setNodeRef}
        className={`flex-1 overflow-y-auto px-2 pb-2 space-y-2 rounded-b-lg transition-colors ${isOver ? 'bg-primary/5 ring-1 ring-inset ring-primary/30' : ''}`}
      >
        {children}
        {count === 0 && <div className="text-[11px] text-muted-foreground/60 text-center py-6">Drop here</div>}
      </div>
    </div>
  );
}

function KanbanCard({ id, record, titleField, bodyFields }: {
  id: string; record: FlowtableRecord; titleField?: FlowtableField; bodyFields: FlowtableField[];
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id });
  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      className={`group/card rounded-lg border bg-background px-3 py-2 shadow-sm hover:shadow-md hover:border-primary/40 cursor-grab active:cursor-grabbing transition-all ${isDragging ? 'opacity-40' : ''}`}
    >
      <div className="flex items-start gap-1.5">
        <GripVertical className="h-3.5 w-3.5 text-muted-foreground/40 mt-0.5 shrink-0 opacity-0 group-hover/card:opacity-100 transition-opacity" />
        <div className="min-w-0 flex-1">
          <div className="text-sm font-medium truncate">
            {titleField ? String(record.values?.[titleField.key] ?? '') || <span className="text-muted-foreground italic">Untitled</span> : 'Untitled'}
          </div>
          {bodyFields.length > 0 && (
            <div className="mt-1.5 space-y-1">
              {bodyFields.map((f) => {
                const v = record.values?.[f.key];
                if (v == null || v === '') return null;
                if (f.type === 'select') {
                  return <span key={f.key} className="inline-block rounded bg-muted px-1.5 py-0.5 text-[11px] mr-1">{String(v)}</span>;
                }
                return <div key={f.key} className="text-[11px] text-muted-foreground truncate"><span className="opacity-60">{f.name}:</span> {String(v)}</div>;
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ---------- List view ----------
function ListView({ fields, records, selected, setSelected, onUpdate, onExpand }: {
  fields: FlowtableField[]; records: FlowtableRecord[];
  selected: Set<string>; setSelected: (s: Set<string>) => void;
  onUpdate: (id: string, values: Record<string, unknown>) => void;
  onExpand?: (index: number) => void;
}) {
  const primary = fields[0];
  return (
    <div className="divide-y">
      {records.map((r, idx) => (
        <div key={r.id} className="group flex items-start gap-3 px-4 py-3 hover:bg-muted/30">
          <Checkbox
            checked={selected.has(r.id)}
            onCheckedChange={() => {
              const n = new Set(selected);
              if (n.has(r.id)) n.delete(r.id); else n.add(r.id);
              setSelected(n);
            }}
            className="mt-1"
          />
          <div className="flex-1 min-w-0 space-y-1">
            <input
              defaultValue={primary ? (r.values?.[primary.key] as string) ?? '' : ''}
              onBlur={(e) => primary && e.target.value !== (r.values?.[primary.key] ?? '') && onUpdate(r.id, { ...r.values, [primary.key]: e.target.value })}
              placeholder={primary?.name ?? 'Untitled'}
              className="text-sm font-medium bg-transparent border-0 outline-none w-full"
            />
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
              {fields.slice(1).map((f) => {
                const v = r.values?.[f.key];
                if (v == null || v === '') return null;
                return <span key={f.id}><span className="opacity-60">{f.name}:</span> {String(v)}</span>;
              })}
            </div>
          </div>
          {onExpand && (
            <button type="button" title="Open record"
              className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-foreground mt-1"
              onClick={() => onExpand(idx)}>
              <Maximize2 className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      ))}
    </div>
  );
}

// ---------- Card view ----------
function CardView({ fields, records, onUpdate, onExpand, columns = 3 }: {
  fields: FlowtableField[]; records: FlowtableRecord[];
  onUpdate: (id: string, values: Record<string, unknown>) => void;
  onExpand?: (index: number) => void;
  /** Cards per row (1–6). Chosen in the toolbar; wider = more text per card. */
  columns?: number;
}) {
  const primary = fields[0];
  // Explicit template instead of Tailwind grid-cols-N so the count stays
  // dynamic without relying on classes that JIT can't see.
  const cols = Math.min(6, Math.max(1, columns));
  return (
    <div
      className="grid gap-3 p-4"
      style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}
    >
      {records.map((r, idx) => (
        <Card key={r.id} className="group relative p-3 space-y-2">
          {onExpand && (
            <button type="button" title="Open record"
              className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-foreground"
              onClick={() => onExpand(idx)}>
              <Maximize2 className="h-3.5 w-3.5" />
            </button>
          )}
          <input
            defaultValue={primary ? (r.values?.[primary.key] as string) ?? '' : ''}
            onBlur={(e) => primary && e.target.value !== (r.values?.[primary.key] ?? '') && onUpdate(r.id, { ...r.values, [primary.key]: e.target.value })}
            placeholder="Untitled"
            className="font-semibold text-sm bg-transparent border-0 outline-none w-full pr-6"
          />
          <div className="space-y-1 text-xs">
            {fields.slice(1).map((f) => {
              const v = r.values?.[f.key];
              const text = v == null || v === '' ? '—' : String(v);
              return (
                <div key={f.id} className="flex gap-2">
                  <span className="text-muted-foreground w-20 shrink-0 truncate">{f.name}</span>
                  {/* Wrap rather than truncate — a card exists to show content */}
                  <span className="flex-1 whitespace-pre-wrap break-words" title={text}>{text}</span>
                </div>
              );
            })}
          </div>
        </Card>
      ))}
    </div>
  );
}



// ---------- CRM mapping ----------
function CrmMappingForm({ fields, onCancel, onConfirm }: {
  fields: FlowtableField[];
  onCancel: () => void;
  onConfirm: (mapping: { name?: string; email?: string; phone?: string; company?: string; notes?: string }) => void;
}) {
  const guess = (needle: string) =>
    fields.find((f) => f.key.includes(needle) || f.name.toLowerCase().includes(needle))?.key;
  const [name, setName] = useState(guess('name') ?? fields[0]?.key);
  const [email, setEmail] = useState(guess('email') ?? '');
  const [phone, setPhone] = useState(guess('phone') ?? guess('tel') ?? '');
  const [company, setCompany] = useState(guess('company') ?? guess('org') ?? '');
  const [notes, setNotes] = useState(guess('note') ?? '');

  const opts = (
    <SelectContent>
      <SelectItem value="__none__">— none —</SelectItem>
      {fields.map((f) => <SelectItem key={f.id} value={f.key}>{f.name}</SelectItem>)}
    </SelectContent>
  );
  const row = (label: string, val: string, set: (v: string) => void) => (
    <div className="grid grid-cols-3 items-center gap-2">
      <Label className="text-sm">{label}</Label>
      <div className="col-span-2">
        <Select value={val || '__none__'} onValueChange={(v) => set(v === '__none__' ? '' : v)}>
          <SelectTrigger><SelectValue placeholder="— none —" /></SelectTrigger>
          {opts}
        </Select>
      </div>
    </div>
  );

  return (
    <>
      <div className="space-y-3 py-2">
        {row('Lead name', name ?? '', setName)}
        {row('Email', email, setEmail)}
        {row('Phone', phone, setPhone)}
        {row('Company', company, setCompany)}
        {row('Notes', notes, setNotes)}
      </div>
      <DialogFooter>
        <Button variant="outline" onClick={onCancel}>Cancel</Button>
        <Button onClick={() => onConfirm({ name, email, phone, company, notes })}>
          <Send className="h-4 w-4 mr-1" /> Create leads
        </Button>
      </DialogFooter>
    </>
  );
}
