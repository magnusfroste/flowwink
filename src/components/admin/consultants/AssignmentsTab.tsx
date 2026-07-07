import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Plus, Pencil, ChevronDown, ChevronRight, ExternalLink } from 'lucide-react';
import { format } from 'date-fns';
import {
  useAssignments, useAssignmentMutation, useUtilizationReport,
  type ConsultantAssignment,
} from '@/hooks/useConsultantOps';
import { useContracts } from '@/hooks/useContracts';
import { logger } from '@/lib/logger';

function useConsultantOptions() {
  return useQuery({
    queryKey: ['consultants-options'],
    queryFn: async () => {
      const { data, error } = await supabase.from('consultant_profiles')
        .select('id, name').eq('is_active', true).order('name');
      if (error) throw error;
      return (data ?? []) as { id: string; name: string }[];
    },
  });
}

const STATUSES = ['planned', 'active', 'ended'] as const;

export function AssignmentsTab() {
  const { data: rows, isLoading } = useAssignments();
  const [editing, setEditing] = useState<ConsultantAssignment | null>(null);
  const [newOpen, setNewOpen] = useState(false);
  const mut = useAssignmentMutation();

  const today = new Date();
  const first = new Date(today.getFullYear(), today.getMonth(), 1);
  const last = new Date(today.getFullYear(), today.getMonth() + 1, 0);
  const [from, setFrom] = useState(first.toISOString().slice(0, 10));
  const [to, setTo] = useState(last.toISOString().slice(0, 10));
  const { data: util } = useUtilizationReport(from, to);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <CardTitle>Assignments</CardTitle>
          <Button size="sm" onClick={() => setNewOpen(true)}>
            <Plus className="h-4 w-4 mr-1" /> New assignment
          </Button>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="py-6 text-center text-sm text-muted-foreground">Loading…</div>
          ) : !rows || rows.length === 0 ? (
            <div className="py-6 text-center text-sm text-muted-foreground">No assignments yet.</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Consultant</TableHead>
                  <TableHead>Client / role</TableHead>
                  <TableHead>Period</TableHead>
                  <TableHead className="text-right">Alloc</TableHead>
                  <TableHead className="text-right">Rate</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Contract / SOW</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((a) => (
                  <TableRow key={a.id}>
                    <TableCell className="text-sm">{a.consultant_name ?? a.consultant_id.slice(0, 8)}</TableCell>
                    <TableCell className="text-sm">
                      <div className="font-medium">{a.client_name ?? '—'}</div>
                      <div className="text-xs text-muted-foreground">{a.role_title ?? ''}</div>
                    </TableCell>
                    <TableCell className="text-xs">
                      {a.start_date && format(new Date(a.start_date), 'PP')}
                      {a.end_date && ` → ${format(new Date(a.end_date), 'PP')}`}
                    </TableCell>
                    <TableCell className="text-right">{a.allocation_pct ?? '—'}%</TableCell>
                    <TableCell className="text-right font-mono text-xs">
                      {a.hourly_rate_cents != null
                        ? `${(a.hourly_rate_cents / 100).toFixed(0)} ${a.currency ?? ''}`
                        : '—'}
                    </TableCell>
                    <TableCell><Badge variant="outline" className="capitalize">{a.status}</Badge></TableCell>
                    <TableCell className="text-xs">
                      {a.contract_title && <div>{a.contract_title}</div>}
                      {a.sow_url && (
                        <a href={a.sow_url} target="_blank" rel="noreferrer" className="text-primary underline inline-flex items-center gap-1">
                          SOW <ExternalLink className="h-3 w-3" />
                        </a>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button size="icon" variant="ghost" onClick={() => setEditing(a)}>
                        <Pencil className="h-3 w-3" />
                      </Button>
                      {a.status !== 'ended' && (
                        <Button size="sm" variant="ghost"
                          onClick={() => mut.mutate({ action: 'end', assignment_id: a.id })}
                        >End</Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <CardTitle>Utilization</CardTitle>
          <div className="flex items-center gap-2">
            <Input type="date" className="h-8 w-40" value={from} onChange={(e) => setFrom(e.target.value)} />
            <span className="text-xs text-muted-foreground">→</span>
            <Input type="date" className="h-8 w-40" value={to} onChange={(e) => setTo(e.target.value)} />
          </div>
        </CardHeader>
        <CardContent>
          {!util || util.length === 0 ? (
            <div className="py-6 text-center text-sm text-muted-foreground">No data for this range.</div>
          ) : (
            <div className="space-y-2">
              {util.map((u) => {
                const pct = Math.max(0, u.utilization_pct ?? 0);
                const over = pct > 100;
                const bench = pct === 0;
                const isOpen = expanded.has(u.consultant_id);
                return (
                  <div key={u.consultant_id} className="border rounded p-2">
                    <button className="w-full flex items-center gap-2 text-sm"
                      onClick={() => {
                        const s = new Set(expanded);
                        if (s.has(u.consultant_id)) s.delete(u.consultant_id); else s.add(u.consultant_id);
                        setExpanded(s);
                      }}
                    >
                      {isOpen ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                      <span className="font-medium">{u.consultant_name}</span>
                      <span className="ml-auto text-xs font-mono">
                        {bench ? <Badge variant="outline">Bench</Badge>
                          : <span className={over ? 'text-destructive' : ''}>{pct.toFixed(0)}%</span>}
                      </span>
                    </button>
                    <div className="h-2 mt-1 bg-muted rounded overflow-hidden">
                      <div className={`h-full ${over ? 'bg-destructive' : 'bg-primary'}`}
                        style={{ width: `${Math.min(pct, 150)}%` }} />
                    </div>
                    {isOpen && u.assignments && (
                      <ul className="mt-2 text-xs text-muted-foreground space-y-0.5 pl-5">
                        {u.assignments.map((a, i) => (
                          <li key={i}>
                            {a.client_name} — {a.role_title ?? ''} · {a.allocation_pct}%
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <AssignmentDialog
        open={newOpen || !!editing}
        assignment={editing}
        onClose={() => { setNewOpen(false); setEditing(null); }}
      />
    </div>
  );
}

function AssignmentDialog({ open, assignment, onClose }: {
  open: boolean; assignment: ConsultantAssignment | null; onClose: () => void;
}) {
  const mut = useAssignmentMutation();
  const { data: consultants } = useConsultantOptions();
  const { data: contracts } = useContracts();
  const [form, setForm] = useState<any>({});

  useEffect(() => {
    if (!open) return;
    if (assignment) {
      setForm({
        consultant_id: assignment.consultant_id,
        client_name: assignment.client_name ?? '',
        role_title: assignment.role_title ?? '',
        start_date: assignment.start_date ?? '',
        end_date: assignment.end_date ?? '',
        allocation_pct: assignment.allocation_pct ?? 100,
        hourly_rate_cents: assignment.hourly_rate_cents ?? 0,
        currency: assignment.currency ?? 'SEK',
        contract_id: assignment.contract_id ?? '',
        sow_url: assignment.sow_url ?? '',
        status: assignment.status ?? 'planned',
        notes: assignment.notes ?? '',
      });
    } else {
      setForm({ allocation_pct: 100, currency: 'SEK', status: 'planned' });
    }
  }, [open, assignment?.id]);


  async function save() {
    try {
      await mut.mutateAsync({
        action: assignment ? 'update' : 'create',
        assignment_id: assignment?.id,
        consultant_id: form.consultant_id,
        client_name: form.client_name,
        role_title: form.role_title,
        start_date: form.start_date || undefined,
        end_date: form.end_date || undefined,
        allocation_pct: Number(form.allocation_pct) || undefined,
        hourly_rate_cents: Number(form.hourly_rate_cents) || undefined,
        currency: form.currency,
        contract_id: form.contract_id || undefined,
        sow_url: form.sow_url || undefined,
        status: form.status,
        notes: form.notes || undefined,
      });
      onClose();
    } catch (e) { logger.error('save assignment', e); }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-2xl">
        <DialogHeader><DialogTitle>{assignment ? 'Edit assignment' : 'New assignment'}</DialogTitle></DialogHeader>
        <div className="space-y-3 max-h-[65vh] overflow-y-auto">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Consultant</Label>
              <Select value={form.consultant_id ?? ''} onValueChange={(v) => setForm({ ...form, consultant_id: v })}>
                <SelectTrigger><SelectValue placeholder="Pick" /></SelectTrigger>
                <SelectContent>
                  {(consultants ?? []).map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Client name</Label>
              <Input value={form.client_name ?? ''} onChange={(e) => setForm({ ...form, client_name: e.target.value })} />
            </div>
          </div>
          <div>
            <Label>Role title</Label>
            <Input value={form.role_title ?? ''} onChange={(e) => setForm({ ...form, role_title: e.target.value })} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label>Start</Label><Input type="date" value={form.start_date ?? ''} onChange={(e) => setForm({ ...form, start_date: e.target.value })} /></div>
            <div><Label>End</Label><Input type="date" value={form.end_date ?? ''} onChange={(e) => setForm({ ...form, end_date: e.target.value })} /></div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div><Label>Allocation %</Label><Input type="number" value={form.allocation_pct ?? ''} onChange={(e) => setForm({ ...form, allocation_pct: e.target.value })} /></div>
            <div><Label>Hourly rate (cents)</Label><Input type="number" value={form.hourly_rate_cents ?? ''} onChange={(e) => setForm({ ...form, hourly_rate_cents: e.target.value })} /></div>
            <div>
              <Label>Currency</Label>
              <Select value={form.currency ?? 'SEK'} onValueChange={(v) => setForm({ ...form, currency: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {['SEK', 'EUR', 'USD', 'NOK'].map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div>
            <Label>Contract</Label>
            <Select value={form.contract_id ?? ''} onValueChange={(v) => setForm({ ...form, contract_id: v })}>
              <SelectTrigger><SelectValue placeholder="No contract" /></SelectTrigger>
              <SelectContent>
                {(contracts ?? []).map((c: any) => (
                  <SelectItem key={c.id} value={c.id}>{c.title ?? c.contract_number ?? c.id.slice(0, 8)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div><Label>SOW URL</Label><Input value={form.sow_url ?? ''} onChange={(e) => setForm({ ...form, sow_url: e.target.value })} /></div>
          <div>
            <Label>Status</Label>
            <Select value={form.status ?? 'planned'} onValueChange={(v) => setForm({ ...form, status: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {STATUSES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div><Label>Notes</Label><Textarea rows={2} value={form.notes ?? ''} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={save} disabled={!form.consultant_id || mut.isPending}>Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
