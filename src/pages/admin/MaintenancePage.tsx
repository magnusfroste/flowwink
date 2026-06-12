import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { AdminLayout } from '@/components/admin/AdminLayout';
import { AdminPageContainer } from '@/components/admin/AdminPageContainer';
import { AdminPageHeader } from '@/components/admin/AdminPageHeader';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Wrench, Plus, Play, CalendarClock, Pencil } from 'lucide-react';
import { toast } from 'sonner';
import { formatDistanceToNow } from 'date-fns';

// ---------- Types ----------
interface Equipment {
  id: string;
  name: string;
  serial_number: string | null;
  category: string | null;
  location: string | null;
  status: 'operational' | 'under_maintenance' | 'broken' | 'retired';
  notes: string | null;
  created_at?: string;
}

interface MaintenanceRequest {
  id: string;
  equipment_id: string;
  title: string;
  description: string | null;
  kind: 'corrective' | 'preventive';
  priority: 'low' | 'medium' | 'high' | 'critical';
  status: 'new' | 'in_progress' | 'done' | 'cancelled';
  due_date: string | null;
  duration_minutes: number | null;
  created_at: string;
}

interface MaintenanceSchedule {
  id: string;
  equipment_id: string;
  title: string;
  interval_days: number;
  next_due: string;
  active: boolean;
  priority?: string;
  created_at?: string;
}

const STATUS_META: Record<Equipment['status'], { label: string; emoji: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
  operational: { label: 'Operational', emoji: '🟢', variant: 'default' },
  under_maintenance: { label: 'Under maintenance', emoji: '🟡', variant: 'secondary' },
  broken: { label: 'Broken', emoji: '🔴', variant: 'destructive' },
  retired: { label: 'Retired', emoji: '⚪', variant: 'outline' },
};

const REQUEST_STATUS_VARIANT: Record<MaintenanceRequest['status'], 'default' | 'secondary' | 'destructive' | 'outline'> = {
  new: 'outline',
  in_progress: 'secondary',
  done: 'default',
  cancelled: 'destructive',
};

const PRIORITY_VARIANT: Record<MaintenanceRequest['priority'], 'default' | 'secondary' | 'destructive' | 'outline'> = {
  low: 'outline',
  medium: 'secondary',
  high: 'default',
  critical: 'destructive',
};

// ---------- Hooks ----------
function useEquipment() {
  return useQuery({
    queryKey: ['equipment'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('manage_equipment' as any, { p_action: 'list' });
      if (error) throw error;
      const r = (data ?? {}) as { equipment?: Equipment[] };
      return r.equipment ?? (Array.isArray(data) ? (data as Equipment[]) : []);
    },
  });
}

function useRequests(filter: { status?: string; equipment_id?: string }) {
  return useQuery({
    queryKey: ['maintenance-requests', filter],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('manage_maintenance_request' as any, {
        p_action: 'list',
        p_status: filter.status || null,
        p_equipment_id: filter.equipment_id || null,
      });
      if (error) throw error;
      const r = (data ?? {}) as { requests?: MaintenanceRequest[] };
      return r.requests ?? (Array.isArray(data) ? (data as MaintenanceRequest[]) : []);
    },
  });
}

function useSchedules() {
  return useQuery({
    queryKey: ['maintenance-schedules'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('maintenance_schedules' as any)
        .select('*')
        .order('next_due', { ascending: true });
      if (error) throw error;
      return (data ?? []) as unknown as MaintenanceSchedule[];
    },
  });
}

// ---------- Equipment dialog ----------
function EquipmentDialog({ trigger, existing }: { trigger: React.ReactNode; existing?: Equipment }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(existing?.name ?? '');
  const [serial, setSerial] = useState(existing?.serial_number ?? '');
  const [category, setCategory] = useState(existing?.category ?? '');
  const [location, setLocation] = useState(existing?.location ?? '');
  const [status, setStatus] = useState<Equipment['status']>(existing?.status ?? 'operational');
  const [notes, setNotes] = useState(existing?.notes ?? '');

  const save = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc('manage_equipment' as any, {
        p_action: existing ? 'update' : 'create',
        p_equipment_id: existing?.id ?? null,
        p_name: name,
        p_serial_number: serial || null,
        p_category: category || null,
        p_location: location || null,
        p_status: status,
        p_notes: notes || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['equipment'] });
      toast.success(existing ? 'Equipment updated' : 'Equipment created');
      setOpen(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>{existing ? 'Edit equipment' : 'Register equipment'}</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Name *</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="CNC Mill #4" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Serial number</Label>
              <Input value={serial} onChange={(e) => setSerial(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Category</Label>
              <Input value={category} onChange={(e) => setCategory(e.target.value)} placeholder="machine, vehicle, …" />
            </div>
          </div>
          <div className="space-y-2">
            <Label>Location</Label>
            <Input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Warehouse A · Bay 3" />
          </div>
          <div className="space-y-2">
            <Label>Status</Label>
            <Select value={status} onValueChange={(v) => setStatus(v as Equipment['status'])}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {(Object.keys(STATUS_META) as Equipment['status'][]).map((s) => (
                  <SelectItem key={s} value={s}>{STATUS_META[s].emoji} {STATUS_META[s].label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Notes</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
          <Button onClick={() => save.mutate()} disabled={!name || save.isPending}>
            {existing ? 'Save changes' : 'Create'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function EquipmentTab() {
  const { data, isLoading } = useEquipment();

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle>Equipment registry</CardTitle>
          <CardDescription>Machines, vehicles and assets you maintain.</CardDescription>
        </div>
        <EquipmentDialog trigger={<Button><Plus className="h-4 w-4 mr-2" /> New equipment</Button>} />
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : (data?.length ?? 0) === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <Wrench className="h-8 w-8 mx-auto mb-2 opacity-50" />
            <p>No equipment registered yet.</p>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Serial</TableHead>
                <TableHead>Category</TableHead>
                <TableHead>Location</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data!.map((e) => {
                const meta = STATUS_META[e.status] ?? STATUS_META.operational;
                return (
                  <TableRow key={e.id}>
                    <TableCell className="font-medium">{e.name}</TableCell>
                    <TableCell className="font-mono text-xs">{e.serial_number ?? '—'}</TableCell>
                    <TableCell>{e.category ?? '—'}</TableCell>
                    <TableCell>{e.location ?? '—'}</TableCell>
                    <TableCell>
                      <Badge variant={meta.variant}>{meta.emoji} {meta.label}</Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <EquipmentDialog
                        existing={e}
                        trigger={<Button size="sm" variant="ghost"><Pencil className="h-3 w-3 mr-1" /> Edit</Button>}
                      />
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}

// ---------- Request dialogs ----------
function CreateRequestDialog({ equipment }: { equipment: Equipment[] }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [equipmentId, setEquipmentId] = useState('');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [kind, setKind] = useState<'corrective' | 'preventive'>('corrective');
  const [priority, setPriority] = useState<MaintenanceRequest['priority']>('medium');
  const [dueDate, setDueDate] = useState('');

  const create = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc('manage_maintenance_request' as any, {
        p_action: 'create',
        p_equipment_id: equipmentId,
        p_title: title,
        p_description: description || null,
        p_kind: kind,
        p_priority: priority,
        p_due_date: dueDate || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['maintenance-requests'] });
      qc.invalidateQueries({ queryKey: ['equipment'] });
      toast.success('Request created');
      setOpen(false);
      setTitle(''); setDescription(''); setDueDate(''); setEquipmentId('');
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button><Plus className="h-4 w-4 mr-2" /> New request</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>New maintenance request</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Equipment *</Label>
            <Select value={equipmentId} onValueChange={setEquipmentId}>
              <SelectTrigger><SelectValue placeholder="Pick equipment…" /></SelectTrigger>
              <SelectContent>
                {equipment.map((e) => (
                  <SelectItem key={e.id} value={e.id}>{e.name}{e.location ? ` · ${e.location}` : ''}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Title *</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Spindle vibrates at high RPM" />
          </div>
          <div className="space-y-2">
            <Label>Description</Label>
            <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Kind</Label>
              <Select value={kind} onValueChange={(v) => setKind(v as any)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="corrective">Corrective</SelectItem>
                  <SelectItem value="preventive">Preventive</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Priority</Label>
              <Select value={priority} onValueChange={(v) => setPriority(v as any)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="low">Low</SelectItem>
                  <SelectItem value="medium">Medium</SelectItem>
                  <SelectItem value="high">High</SelectItem>
                  <SelectItem value="critical">Critical</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-2">
            <Label>Due date</Label>
            <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
          <Button onClick={() => create.mutate()} disabled={!equipmentId || !title || create.isPending}>Create</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CompleteRequestDialog({ request }: { request: MaintenanceRequest }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [duration, setDuration] = useState('60');

  const complete = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc('manage_maintenance_request' as any, {
        p_action: 'update',
        p_request_id: request.id,
        p_status: 'done',
        p_duration_minutes: Number(duration) || 0,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['maintenance-requests'] });
      qc.invalidateQueries({ queryKey: ['equipment'] });
      toast.success('Request closed');
      setOpen(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">Mark done</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Close request</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">{request.title}</p>
          <div className="space-y-2">
            <Label>Duration (minutes)</Label>
            <Input type="number" min="0" value={duration} onChange={(e) => setDuration(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
          <Button onClick={() => complete.mutate()} disabled={complete.isPending}>Complete</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function RequestsTab({ equipment }: { equipment: Equipment[] }) {
  const qc = useQueryClient();
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const { data, isLoading } = useRequests({ status: statusFilter === 'all' ? undefined : statusFilter });

  const equipName = (id: string) => equipment.find((e) => e.id === id)?.name ?? id.slice(0, 8);

  const advance = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: MaintenanceRequest['status'] }) => {
      const { error } = await supabase.rpc('manage_maintenance_request' as any, {
        p_action: 'update', p_request_id: id, p_status: status,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['maintenance-requests'] });
      qc.invalidateQueries({ queryKey: ['equipment'] });
      toast.success('Updated');
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-3 flex-wrap">
        <div>
          <CardTitle>Maintenance requests</CardTitle>
          <CardDescription>
            new → in_progress → done. Critical correctives auto-flip equipment to under maintenance.
          </CardDescription>
        </div>
        <div className="flex items-center gap-2">
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              <SelectItem value="new">New</SelectItem>
              <SelectItem value="in_progress">In progress</SelectItem>
              <SelectItem value="done">Done</SelectItem>
              <SelectItem value="cancelled">Cancelled</SelectItem>
            </SelectContent>
          </Select>
          <CreateRequestDialog equipment={equipment} />
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : (data?.length ?? 0) === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <p>No requests match this filter.</p>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Title</TableHead>
                <TableHead>Equipment</TableHead>
                <TableHead>Kind</TableHead>
                <TableHead>Priority</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Due</TableHead>
                <TableHead>Age</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data!.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="font-medium max-w-xs">
                    <div className="truncate">{r.title}</div>
                    {r.description && <div className="text-xs text-muted-foreground truncate">{r.description}</div>}
                  </TableCell>
                  <TableCell className="text-sm">{equipName(r.equipment_id)}</TableCell>
                  <TableCell><Badge variant="outline">{r.kind}</Badge></TableCell>
                  <TableCell><Badge variant={PRIORITY_VARIANT[r.priority]}>{r.priority}</Badge></TableCell>
                  <TableCell><Badge variant={REQUEST_STATUS_VARIANT[r.status]}>{r.status}</Badge></TableCell>
                  <TableCell className="text-sm">{r.due_date ?? '—'}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {formatDistanceToNow(new Date(r.created_at), { addSuffix: true })}
                  </TableCell>
                  <TableCell className="text-right space-x-2 whitespace-nowrap">
                    {r.status === 'new' && (
                      <Button size="sm" variant="outline" onClick={() => advance.mutate({ id: r.id, status: 'in_progress' })}>
                        Start
                      </Button>
                    )}
                    {r.status === 'in_progress' && <CompleteRequestDialog request={r} />}
                    {(r.status === 'new' || r.status === 'in_progress') && (
                      <Button size="sm" variant="ghost" onClick={() => advance.mutate({ id: r.id, status: 'cancelled' })}>
                        Cancel
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}

// ---------- Schedules ----------
function CreateScheduleDialog({ equipment }: { equipment: Equipment[] }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [equipmentId, setEquipmentId] = useState('');
  const [title, setTitle] = useState('');
  const [interval, setInterval] = useState('30');
  const [nextDue, setNextDue] = useState(new Date().toISOString().slice(0, 10));
  const [active, setActive] = useState(true);

  const create = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from('maintenance_schedules' as any).insert({
        equipment_id: equipmentId,
        title,
        interval_days: Number(interval),
        next_due: nextDue,
        active,
      } as any);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['maintenance-schedules'] });
      toast.success('Schedule created');
      setOpen(false);
      setTitle(''); setEquipmentId('');
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button><Plus className="h-4 w-4 mr-2" /> New schedule</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>New preventive schedule</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Equipment *</Label>
            <Select value={equipmentId} onValueChange={setEquipmentId}>
              <SelectTrigger><SelectValue placeholder="Pick equipment…" /></SelectTrigger>
              <SelectContent>
                {equipment.map((e) => <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Title *</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Quarterly oil change" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Interval (days) *</Label>
              <Input type="number" min="1" value={interval} onChange={(e) => setInterval(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Next due *</Label>
              <Input type="date" value={nextDue} onChange={(e) => setNextDue(e.target.value)} />
            </div>
          </div>
          <div className="flex items-center justify-between rounded-md border p-3">
            <Label>Active</Label>
            <Switch checked={active} onCheckedChange={setActive} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
          <Button
            onClick={() => create.mutate()}
            disabled={!equipmentId || !title || !interval || !nextDue || create.isPending}
          >
            Create
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function SchedulesTab({ equipment }: { equipment: Equipment[] }) {
  const qc = useQueryClient();
  const { data, isLoading } = useSchedules();
  const equipName = (id: string) => equipment.find((e) => e.id === id)?.name ?? id.slice(0, 8);

  const sweep = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc('run_preventive_maintenance' as any, {});
      if (error) throw error;
      return (data ?? {}) as { created?: number };
    },
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ['maintenance-requests'] });
      qc.invalidateQueries({ queryKey: ['maintenance-schedules'] });
      toast.success(`Sweep complete · ${r.created ?? 0} request(s) created`);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-3 flex-wrap">
        <div>
          <CardTitle>Preventive schedules</CardTitle>
          <CardDescription>Interval-based maintenance jobs. Sweeps automatically every night at 05:00.</CardDescription>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => sweep.mutate()} disabled={sweep.isPending}>
            <Play className="h-4 w-4 mr-2" /> Run sweep now
          </Button>
          <CreateScheduleDialog equipment={equipment} />
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : (data?.length ?? 0) === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <CalendarClock className="h-8 w-8 mx-auto mb-2 opacity-50" />
            <p>No preventive schedules yet.</p>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Title</TableHead>
                <TableHead>Equipment</TableHead>
                <TableHead>Interval</TableHead>
                <TableHead>Next due</TableHead>
                <TableHead>Active</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data!.map((s) => (
                <TableRow key={s.id}>
                  <TableCell className="font-medium">{s.title}</TableCell>
                  <TableCell className="text-sm">{equipName(s.equipment_id)}</TableCell>
                  <TableCell>{s.interval_days} days</TableCell>
                  <TableCell>{s.next_due}</TableCell>
                  <TableCell>
                    <Badge variant={s.active ? 'default' : 'outline'}>{s.active ? 'Active' : 'Paused'}</Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}

// ---------- Page ----------
export default function MaintenancePage() {
  const { data: equipment = [] } = useEquipment();

  return (
    <AdminLayout>
      <AdminPageContainer>
        <AdminPageHeader
          title="Maintenance"
          description="Equipment registry, corrective + preventive maintenance, and recurring service schedules."
        >
          <Wrench className="h-5 w-5 text-muted-foreground" />
        </AdminPageHeader>

        <Tabs defaultValue="equipment" className="space-y-6">
          <TabsList>
            <TabsTrigger value="equipment">Equipment</TabsTrigger>
            <TabsTrigger value="requests">Requests</TabsTrigger>
            <TabsTrigger value="schedules">Preventive</TabsTrigger>
          </TabsList>
          <TabsContent value="equipment"><EquipmentTab /></TabsContent>
          <TabsContent value="requests"><RequestsTab equipment={equipment} /></TabsContent>
          <TabsContent value="schedules"><SchedulesTab equipment={equipment} /></TabsContent>
        </Tabs>
      </AdminPageContainer>
    </AdminLayout>
  );
}
