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
import { useIsModuleEnabled } from '@/hooks/useModules';
import { useToast } from '@/hooks/use-toast';
import {
  Table2, Plus, Download, Upload, MoreHorizontal, Trash2, ChevronDown, LayoutGrid, List as ListIcon, Rows3,
  Send, Users, X, Database, PanelLeft, PanelRight, ChevronRight,
} from 'lucide-react';
import {
  useFlowtableBases, useCreateBase, useUpdateBase, useDeleteBase,
  useFlowtableTables, useCreateTable, useDeleteTable, useUpdateTable,
  useFlowtableFields, useCreateField, useDeleteField, useUpdateField,
  useFlowtableRecords, useCreateRecord, useUpdateRecord, useDeleteRecords, useBulkInsertRecords,
  usePushToCrmLeads,
  fieldKeyify,
  type FlowtableFieldType, type FlowtableRecord, type FlowtableField,
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
];

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
                        selected={selected}
                        setSelected={setSelected}
                        onUpdateRecord={(id, values) =>
                          updateRecord.mutate({ id, table_id: activeTable.id, values })
                        }
                        onAddField={(name, type) =>
                          createField.mutate({ table_id: activeTable.id, name, type, position: fields.length })
                        }
                        onRenameField={(id, name) =>
                          updateField.mutate({ id, table_id: activeTable.id, patch: { name, key: fieldKeyify(name) } })
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
  selected: Set<string>;
  setSelected: (s: Set<string>) => void;
  onUpdateRecord: (id: string, values: Record<string, unknown>) => void;
  onAddField: (name: string, type: FlowtableFieldType) => void;
  onRenameField: (id: string, name: string) => void;
  onDeleteField: (id: string) => void;
  onAddRow: () => void;
}) {
  const { fields, records, selected, setSelected } = props;
  const [addFieldOpen, setAddFieldOpen] = useState(false);
  const [newName, setNewName] = useState('');
  const [newType, setNewType] = useState<FlowtableFieldType>('text');

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
                      if (e.target.value && e.target.value !== f.name) props.onRenameField(f.id, e.target.value);
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
                      <DropdownMenuLabel className="text-xs">Field type</DropdownMenuLabel>
                      {FIELD_TYPES.map((t) => (
                        <DropdownMenuItem
                          key={t.value}
                          onClick={() => f.type !== t.value && props.onRenameField(f.id, f.name)}
                          className={f.type === t.value ? 'bg-accent' : ''}
                        >
                          {t.label}
                        </DropdownMenuItem>
                      ))}
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
                  <Select value={newType} onValueChange={(v) => setNewType(v as FlowtableFieldType)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {FIELD_TYPES.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <Button
                    className="w-full" size="sm"
                    onClick={() => {
                      if (!newName.trim()) return;
                      props.onAddField(newName.trim(), newType);
                      setNewName(''); setNewType('text'); setAddFieldOpen(false);
                    }}
                  >Add field</Button>
                </DropdownMenuContent>
              </DropdownMenu>
            </th>
          </tr>
        </thead>
        <tbody>
          {records.map((r) => (
            <tr key={r.id} className="group hover:bg-muted/30">
              <td className="border-r border-b w-10 p-0">
                <div className="h-9 flex items-center justify-center">
                  <Checkbox checked={selected.has(r.id)} onCheckedChange={() => toggleOne(r.id)} />
                </div>
              </td>
              {fields.map((f) => (
                <CellEditor
                  key={f.id}
                  field={f}
                  value={r.values?.[f.key]}
                  onChange={(v) => props.onUpdateRecord(r.id, { ...r.values, [f.key]: v })}
                />
              ))}
              <td className="border-b" />
            </tr>
          ))}
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
    </div>
  );
}

function CellEditor({ field, value, onChange }: { field: FlowtableField; value: unknown; onChange: (v: unknown) => void }) {
  const common = 'h-9 w-full px-2 bg-transparent border-0 outline-none focus:ring-2 focus:ring-primary/40 focus:bg-background';
  const cellStyle = { width: field.width, minWidth: field.width } as const;
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
    const choices = ((field.options?.choices as string[]) ?? ['New', 'In Progress', 'Done']);
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
  const inputType =
    field.type === 'number' ? 'number' :
    field.type === 'date' ? 'date' :
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
