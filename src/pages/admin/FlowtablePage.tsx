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
  Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList,
} from '@/components/ui/command';
import { useIsModuleEnabled } from '@/hooks/useModules';
import { useToast } from '@/hooks/use-toast';
import {
  Table2, Plus, Download, Upload, MoreHorizontal, Trash2, ChevronDown, LayoutGrid, List as ListIcon, Rows3,
  Send, Users, X, Database, PanelLeft, PanelRight,
} from 'lucide-react';
import {
  useFlowtableBases, useCreateBase, useUpdateBase, useDeleteBase,
  useFlowtableTables, useCreateTable, useDeleteTable, useUpdateTable,
  useFlowtableFields, useCreateField, useDeleteField, useUpdateField,
  useFlowtableRecords, useCreateRecord, useUpdateRecord, useDeleteRecords, useBulkInsertRecords,
  usePushToCrmLeads,
  fieldKeyify,
  type FlowtableFieldType, type FlowtableRecord, type FlowtableField, type FlowtableTable,
} from '@/hooks/useFlowtable';

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
];

const TYPES_WITH_OPTIONS = new Set<FlowtableFieldType>(['select', 'multiselect', 'link', 'lookup', 'rollup']);
const ROLLUP_AGGS = ['count', 'sum', 'avg', 'min', 'max'] as const;

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
  const createField = useCreateField();
  const deleteField = useDeleteField();
  const updateField = useUpdateField();
  const createRecord = useCreateRecord();
  const updateRecord = useUpdateRecord();
  const deleteRecords = useDeleteRecords();
  const bulkInsert = useBulkInsertRecords();
  const pushToCrm = usePushToCrmLeads();

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
                  } catch {}
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
                      {b.workspace_shared && <Users className="h-3 w-3 text-muted-foreground" />}
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
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Label htmlFor="ws-share" className="cursor-pointer flex items-center gap-1.5">
                    <Users className="h-3.5 w-3.5" />
                    Share with workspace
                  </Label>
                  <Switch
                    id="ws-share"
                    checked={activeBase.workspace_shared}
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
                      {(['grid', 'list', 'card'] as const).map((mode) => {
                        const Icon = mode === 'grid' ? Rows3 : mode === 'list' ? ListIcon : LayoutGrid;
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
                    {activeTable.view_mode === 'card' ? (
                      <CardView
                        fields={fields}
                        records={records}
                        onUpdate={(id, values) =>
                          updateRecord.mutate({ id, table_id: activeTable.id, values })
                        }
                      />
                    ) : activeTable.view_mode === 'list' ? (
                      <ListView
                        fields={fields}
                        records={records}
                        selected={selected}
                        setSelected={setSelected}
                        onUpdate={(id, values) =>
                          updateRecord.mutate({ id, table_id: activeTable.id, values })
                        }
                      />
                    ) : (
                      <GridView
                        fields={fields}
                        records={records}
                        tables={tables}
                        selected={selected}
                        setSelected={setSelected}
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
    </AdminLayout>
  );
}

// ---------- Grid view ----------
function GridView(props: {
  fields: FlowtableField[];
  records: FlowtableRecord[];
  tables: FlowtableTable[];
  selected: Set<string>;
  setSelected: (s: Set<string>) => void;
  onUpdateRecord: (id: string, values: Record<string, unknown>) => void;
  onAddField: (name: string, type: FlowtableFieldType, options: Record<string, unknown>) => void;
  onConfigureField: (id: string, patch: Partial<FlowtableField>) => void;
  onDeleteField: (id: string) => void;
  onAddRow: () => void;
}) {
  const { fields, records, tables, selected, setSelected } = props;
  const [addFieldOpen, setAddFieldOpen] = useState(false);
  const [newName, setNewName] = useState('');
  const [newType, setNewType] = useState<FlowtableFieldType>('text');
  const [newOptions, setNewOptions] = useState<Record<string, unknown>>({});
  const [configField, setConfigField] = useState<FlowtableField | null>(null);

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
            <th className="border-r border-b w-10 p-0">
              <div className="h-9 flex items-center justify-center">
                <Checkbox
                  checked={records.length > 0 && selected.size === records.length}
                  onCheckedChange={toggleAll}
                />
              </div>
            </th>
            {fields.map((f) => (
              <th
                key={f.id}
                className="border-r border-b text-left font-medium text-xs text-muted-foreground p-0"
                style={{ width: f.width, minWidth: f.width }}
              >
                <div className="h-9 px-2 flex items-center gap-1 group">
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
                      fields={fields}
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
              <td className="border-r border-b w-10 p-0">
                <div className="h-9 flex items-center justify-center">
                  {/* Airtable-style: row number by default, checkbox on hover or when selected */}
                  <span
                    className={`text-xs text-muted-foreground tabular-nums ${
                      isSelected ? 'hidden' : 'group-hover:hidden'
                    }`}
                  >
                    {idx + 1}
                  </span>
                  <Checkbox
                    className={isSelected ? '' : 'hidden group-hover:inline-flex'}
                    checked={isSelected}
                    onCheckedChange={() => toggleOne(r.id)}
                  />
                </div>
              </td>
              {fields.map((f) => (
                <CellEditor
                  key={f.id}
                  field={f}
                  value={r.values?.[f.key]}
                  record={r}
                  fields={fields}
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

function CellEditor({ field, value, record, fields, onChange }: {
  field: FlowtableField;
  value: unknown;
  record?: FlowtableRecord;
  fields?: FlowtableField[];
  onChange: (v: unknown) => void;
}) {
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
      <td className="border-r border-b p-0" style={cellStyle}>
        <div className="h-9 px-2 flex items-center">
          <Checkbox checked={!!value} onCheckedChange={(v) => onChange(!!v)} />
        </div>
      </td>
    );
  }
  if (field.type === 'longtext') {
    return (
      <td className="border-r border-b p-0 align-top" style={cellStyle}>
        <Textarea
          defaultValue={(value as string) ?? ''}
          onBlur={(e) => e.target.value !== (value ?? '') && onChange(e.target.value)}
          rows={1}
          className="border-0 rounded-none min-h-9 resize-y focus-visible:ring-2 focus-visible:ring-offset-0"
        />
      </td>
    );
  }
  if (field.type === 'select') {
    // User-defined choices from options; only fall back to a starter set when
    // the field was never configured (keeps old select columns working).
    const configured = field.options?.choices as string[] | undefined;
    const choices = (configured && configured.length) ? configured : ['New', 'In progress', 'Done'];
    return (
      <td className="border-r border-b p-0" style={cellStyle}>
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
  // Date columns render an <input type="date">, which only accepts yyyy-MM-dd.
  // Imported data is usually free-form text ("2/13/2026", "2026-02-13 10:31:16"),
  // so coerce for display — otherwise switching a text column to Date blanks
  // every cell. Store back the normalized yyyy-MM-dd on edit.
  if (field.type === 'date') {
    const display = toDateInputValue(value);
    return (
      <td className="border-r border-b p-0" style={cellStyle}>
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
    <td className="border-r border-b p-0" style={cellStyle}>
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
      <td className="border-r border-b p-0" style={cellStyle}>
        <div className="h-9 px-2 flex items-center text-xs text-muted-foreground">Configure link target</div>
      </td>
    );
  }

  const current = value as string | undefined;
  return (
    <td className="border-r border-b p-0" style={cellStyle}>
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
    <td className="border-r border-b p-0" style={cellStyle}>
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
    <td className="border-r border-b p-0" style={cellStyle}>
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

// ---------- List view ----------
function ListView({ fields, records, selected, setSelected, onUpdate }: {
  fields: FlowtableField[]; records: FlowtableRecord[];
  selected: Set<string>; setSelected: (s: Set<string>) => void;
  onUpdate: (id: string, values: Record<string, unknown>) => void;
}) {
  const primary = fields[0];
  return (
    <div className="divide-y">
      {records.map((r) => (
        <div key={r.id} className="flex items-start gap-3 px-4 py-3 hover:bg-muted/30">
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
        </div>
      ))}
    </div>
  );
}

// ---------- Card view ----------
function CardView({ fields, records, onUpdate }: {
  fields: FlowtableField[]; records: FlowtableRecord[];
  onUpdate: (id: string, values: Record<string, unknown>) => void;
}) {
  const primary = fields[0];
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 p-4">
      {records.map((r) => (
        <Card key={r.id} className="p-3 space-y-2">
          <input
            defaultValue={primary ? (r.values?.[primary.key] as string) ?? '' : ''}
            onBlur={(e) => primary && e.target.value !== (r.values?.[primary.key] ?? '') && onUpdate(r.id, { ...r.values, [primary.key]: e.target.value })}
            placeholder="Untitled"
            className="font-semibold text-sm bg-transparent border-0 outline-none w-full"
          />
          <div className="space-y-1 text-xs">
            {fields.slice(1).map((f) => {
              const v = r.values?.[f.key];
              return (
                <div key={f.id} className="flex gap-2">
                  <span className="text-muted-foreground w-20 shrink-0 truncate">{f.name}</span>
                  <span className="flex-1 truncate">{v == null || v === '' ? '—' : String(v)}</span>
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
