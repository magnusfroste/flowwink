import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger,
} from '@/components/ui/dialog';
import { toast } from 'sonner';
import { Plus, SplitSquareHorizontal, CheckCircle2, XCircle, Send } from 'lucide-react';
import {
  useTimeEntries, useCreateTimeEntry, useProjects,
  type ApprovalStatus, type TimeCategory, type TimeEntry,
} from '@/hooks/useTimesheets';

const APPROVAL_VARIANTS: Record<ApprovalStatus, { label: string; variant: 'default' | 'secondary' | 'outline' | 'destructive' }> = {
  draft: { label: 'Draft', variant: 'outline' },
  submitted: { label: 'Submitted', variant: 'secondary' },
  approved: { label: 'Approved', variant: 'default' },
  rejected: { label: 'Rejected', variant: 'destructive' },
};

const CATEGORY_LABELS: Record<TimeCategory, string> = {
  work: 'Work',
  pto: 'PTO',
  sick: 'Sick',
  training: 'Training',
  overhead: 'Overhead',
};

function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function daysAgoISO(n: number) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function EntriesTab() {
  const qc = useQueryClient();
  const [rangeStart, setRangeStart] = useState(daysAgoISO(13));
  const [rangeEnd, setRangeEnd] = useState(todayISO());
  const { data: entries = [], isLoading } = useTimeEntries(rangeStart, rangeEnd);
  const { data: projects = [] } = useProjects();

  // New entry form
  const [newDate, setNewDate] = useState(todayISO());
  const [newHours, setNewHours] = useState('');
  const [newCategory, setNewCategory] = useState<TimeCategory>('work');
  const [newProject, setNewProject] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [busy, setBusy] = useState(false);
  const createEntry = useCreateTimeEntry();

  const submitEntry = async (e: React.FormEvent) => {
    e.preventDefault();
    const h = parseFloat(newHours);
    if (!Number.isFinite(h) || h <= 0) { toast.error('Hours must be positive'); return; }
    setBusy(true);
    try {
      if (newCategory === 'work') {
        if (!newProject) { toast.error('Select a project for work time'); return; }
        await createEntry.mutateAsync({
          project_id: newProject, entry_date: newDate, hours: h, description: newDesc || undefined,
        });
      } else {
        const { error } = await supabase.rpc('log_indirect_time' as any, {
          p_entry_date: newDate,
          p_hours: h,
          p_category: newCategory,
          p_description: newDesc || null,
        });
        if (error) throw error;
        toast.success(`Logged ${h}h ${CATEGORY_LABELS[newCategory]}`);
        qc.invalidateQueries({ queryKey: ['time-entries'] });
      }
      setNewHours(''); setNewDesc('');
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  };

  // Approval action
  const runApproval = async (action: 'submit' | 'approve' | 'reject') => {
    const { data, error } = await supabase.rpc('manage_timesheet_approval' as any, {
      p_action: action, p_start_date: rangeStart, p_end_date: rangeEnd,
    });
    if (error) { toast.error(error.message); return; }
    const n = (data as any)?.entries_updated ?? 0;
    toast.success(`${action === 'approve' ? 'Approved' : action === 'reject' ? 'Rejected' : 'Submitted'} ${n} entr${n === 1 ? 'y' : 'ies'}`);
    qc.invalidateQueries({ queryKey: ['time-entries'] });
  };

  return (
    <div className="space-y-4">
      {/* Approval bar */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Approvals</CardTitle>
          <CardDescription>Submit, approve or reject entries for the selected date range.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap items-end gap-3">
            <div className="space-y-1">
              <Label className="text-xs">Start</Label>
              <Input type="date" value={rangeStart} onChange={(e) => setRangeStart(e.target.value)} className="w-40" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">End</Label>
              <Input type="date" value={rangeEnd} onChange={(e) => setRangeEnd(e.target.value)} className="w-40" />
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => runApproval('submit')}>
                <Send className="mr-2 h-4 w-4" /> Submit
              </Button>
              <Button size="sm" onClick={() => runApproval('approve')}>
                <CheckCircle2 className="mr-2 h-4 w-4" /> Approve
              </Button>
              <Button variant="destructive" size="sm" onClick={() => runApproval('reject')}>
                <XCircle className="mr-2 h-4 w-4" /> Reject
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* New entry */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Log time</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={submitEntry} className="grid gap-3 md:grid-cols-6 items-end">
            <div className="space-y-1">
              <Label className="text-xs">Date</Label>
              <Input type="date" value={newDate} onChange={(e) => setNewDate(e.target.value)} required />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Hours</Label>
              <Input type="number" step="0.25" min="0" value={newHours} onChange={(e) => setNewHours(e.target.value)} required />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Category</Label>
              <Select value={newCategory} onValueChange={(v: TimeCategory) => setNewCategory(v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(Object.keys(CATEGORY_LABELS) as TimeCategory[]).map((c) => (
                    <SelectItem key={c} value={c}>{CATEGORY_LABELS[c]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1 md:col-span-2">
              <Label className="text-xs">{newCategory === 'work' ? 'Project *' : 'Project (auto)'}</Label>
              <Select value={newProject} onValueChange={setNewProject} disabled={newCategory !== 'work'}>
                <SelectTrigger>
                  <SelectValue placeholder={newCategory === 'work' ? 'Select project…' : 'Internal (non-billable)'} />
                </SelectTrigger>
                <SelectContent>
                  {projects.map((p) => (
                    <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button type="submit" disabled={busy}>
              <Plus className="mr-2 h-4 w-4" /> Log
            </Button>
            <div className="md:col-span-6 space-y-1">
              <Label className="text-xs">Description</Label>
              <Input value={newDesc} onChange={(e) => setNewDesc(e.target.value)} placeholder="Optional" />
            </div>
          </form>
        </CardContent>
      </Card>

      {/* Entries table */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Entries</CardTitle>
          <CardDescription>{entries.length} entries in range</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Project</TableHead>
                <TableHead>Description</TableHead>
                <TableHead className="text-right">Hours</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-16"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading && (
                <TableRow><TableCell colSpan={6} className="text-muted-foreground text-center py-8">Loading…</TableCell></TableRow>
              )}
              {!isLoading && entries.length === 0 && (
                <TableRow><TableCell colSpan={6} className="text-muted-foreground text-center py-8">No entries in this range.</TableCell></TableRow>
              )}
              {entries.map((e) => {
                const st = (e.approval_status ?? 'draft') as ApprovalStatus;
                const cat = (e.category ?? 'work') as TimeCategory;
                const ot = Number(e.overtime_hours ?? 0);
                return (
                  <TableRow key={e.id}>
                    <TableCell className="text-sm">{e.entry_date}</TableCell>
                    <TableCell className="text-sm">
                      <div className="flex items-center gap-2">
                        <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: e.projects?.color || '#6366f1' }} />
                        {e.projects?.name ?? '—'}
                      </div>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground max-w-xs truncate">{e.description ?? ''}</TableCell>
                    <TableCell className="text-right font-mono text-sm">
                      {Number(e.hours).toFixed(2)}
                      {ot > 0 && (
                        <Badge variant="secondary" className="ml-2 text-[10px]">OT {ot}h</Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1 flex-wrap">
                        <Badge variant={APPROVAL_VARIANTS[st].variant}>{APPROVAL_VARIANTS[st].label}</Badge>
                        {cat !== 'work' && <Badge variant="outline">{CATEGORY_LABELS[cat]}</Badge>}
                      </div>
                    </TableCell>
                    <TableCell>
                      <SplitDialog entry={e} projects={projects} />
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

function SplitDialog({ entry, projects }: { entry: TimeEntry; projects: { id: string; name: string }[] }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<{ project_id: string; hours: string; description: string }[]>([
    { project_id: entry.project_id, hours: String(Number(entry.hours) / 2), description: '' },
    { project_id: '', hours: String(Number(entry.hours) / 2), description: '' },
  ]);
  const [busy, setBusy] = useState(false);

  const total = rows.reduce((s, r) => s + (parseFloat(r.hours) || 0), 0);
  const orig = Number(entry.hours);
  const ok = Math.abs(total - orig) < 0.001 && rows.every((r) => r.project_id && parseFloat(r.hours) > 0);

  const submit = async () => {
    setBusy(true);
    const { error } = await supabase.rpc('split_time_entry' as any, {
      p_entry_id: entry.id,
      p_allocations: rows.map((r) => ({
        project_id: r.project_id,
        hours: parseFloat(r.hours),
        description: r.description || undefined,
      })),
    });
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    toast.success(`Split into ${rows.length} allocations`);
    setOpen(false);
    qc.invalidateQueries({ queryKey: ['time-entries'] });
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm"><SplitSquareHorizontal className="h-4 w-4" /></Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Split entry — {orig}h on {entry.entry_date}</DialogTitle>
        </DialogHeader>
        <div className="space-y-2">
          {rows.map((r, i) => (
            <div key={i} className="grid grid-cols-[1fr_100px_1fr_auto] gap-2 items-center">
              <Select value={r.project_id} onValueChange={(v) => setRows((rs) => rs.map((x, j) => j === i ? { ...x, project_id: v } : x))}>
                <SelectTrigger><SelectValue placeholder="Project…" /></SelectTrigger>
                <SelectContent>
                  {projects.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                </SelectContent>
              </Select>
              <Input type="number" step="0.25" min="0" value={r.hours}
                onChange={(e) => setRows((rs) => rs.map((x, j) => j === i ? { ...x, hours: e.target.value } : x))} />
              <Input placeholder="Description (optional)" value={r.description}
                onChange={(e) => setRows((rs) => rs.map((x, j) => j === i ? { ...x, description: e.target.value } : x))} />
              <Button variant="ghost" size="sm" disabled={rows.length <= 2}
                onClick={() => setRows((rs) => rs.filter((_, j) => j !== i))}>×</Button>
            </div>
          ))}
          <Button variant="outline" size="sm"
            onClick={() => setRows((rs) => [...rs, { project_id: '', hours: '0', description: '' }])}>
            <Plus className="mr-1 h-3 w-3" /> Add allocation
          </Button>
          <div className={`text-sm ${ok ? 'text-muted-foreground' : 'text-destructive'}`}>
            Total {total.toFixed(2)}h · original {orig.toFixed(2)}h
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
          <Button onClick={submit} disabled={!ok || busy}>Split</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
