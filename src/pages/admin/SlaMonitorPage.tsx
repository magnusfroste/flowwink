import { useState } from 'react';
import { useIsModuleEnabled } from '@/hooks/useModules';
import { AdminLayout } from '@/components/admin/AdminLayout';
import { AdminPageContainer } from '@/components/admin/AdminPageContainer';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogClose } from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Shield, AlertTriangle, CheckCircle2, Clock, Plus, Trash2, Activity, TrendingUp,
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import {
  useSlaPolicies, useSlaViolations, useSlaStats,
  useCreateSlaPolicy, useUpdateSlaPolicy, useDeleteSlaPolicy, useResolveSlaViolation,
  type SlaPolicy, type CreatePolicyInput,
} from '@/hooks/useSla';

// ── Helpers ──────────────────────────────────────────────────────────

const ENTITY_TYPES = [
  { value: 'ticket', label: 'Ticket' },
  { value: 'order', label: 'Order' },
  { value: 'lead', label: 'Lead' },
  { value: 'chat', label: 'Chat' },
  { value: 'booking', label: 'Booking' },
];

const METRICS: Record<string, { value: string; label: string }[]> = {
  ticket: [
    { value: 'first_response', label: 'First response' },
    { value: 'resolution', label: 'Resolution' },
  ],
  order: [
    { value: 'fulfillment', label: 'Fulfillment' },
  ],
  lead: [
    { value: 'follow_up', label: 'Follow-up' },
  ],
  chat: [
    { value: 'first_response', label: 'First response' },
  ],
  booking: [
    { value: 'confirmation', label: 'Confirmation' },
  ],
};

const SEVERITY_COLORS: Record<string, string> = {
  warning: 'bg-yellow-500/10 text-yellow-700 dark:text-yellow-400 border-yellow-500/20',
  breach: 'bg-orange-500/10 text-orange-700 dark:text-orange-400 border-orange-500/20',
  critical: 'bg-red-500/10 text-red-700 dark:text-red-400 border-red-500/20',
};

function formatMinutes(m: number): string {
  if (m < 60) return `${m}m`;
  if (m < 1440) return `${Math.round(m / 60)}h`;
  return `${Math.round(m / 1440)}d`;
}

// ── Stats Cards ──────────────────────────────────────────────────────

function StatsCards() {
  const { data: stats, isLoading } = useSlaStats();

  if (isLoading) {
    return (
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Card key={i}><CardContent className="pt-6"><Skeleton className="h-8 w-16" /></CardContent></Card>
        ))}
      </div>
    );
  }

  const cards = [
    { label: 'Active Policies', value: stats?.activePolicies ?? 0, icon: Shield, color: 'text-primary' },
    { label: 'Open Violations', value: stats?.openViolations ?? 0, icon: AlertTriangle, color: stats?.openViolations ? 'text-orange-500' : 'text-muted-foreground' },
    { label: 'Critical', value: stats?.criticalOpen ?? 0, icon: Activity, color: stats?.criticalOpen ? 'text-red-500' : 'text-muted-foreground' },
    { label: 'Compliance (30d)', value: `${stats?.complianceRate ?? 100}%`, icon: TrendingUp, color: 'text-green-600' },
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
      {cards.map((c) => (
        <Card key={c.label}>
          <CardContent className="pt-5 pb-4 flex items-center gap-3">
            <c.icon className={`h-5 w-5 ${c.color}`} />
            <div>
              <p className="text-2xl font-semibold">{c.value}</p>
              <p className="text-xs text-muted-foreground">{c.label}</p>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

// ── Policies Tab ─────────────────────────────────────────────────────

function PoliciesTab() {
  const fpEnabled = useIsModuleEnabled('flowpilot');
  const { data: policies = [], isLoading } = useSlaPolicies();
  const updatePolicy = useUpdateSlaPolicy();
  const deletePolicy = useDeleteSlaPolicy();
  const [dialogOpen, setDialogOpen] = useState(false);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          Define target times for each entity type. {fpEnabled ? 'FlowPilot monitors and flags breaches.' : 'Enable FlowPilot to auto-monitor and flag breaches.'}
        </p>
        <Button size="sm" onClick={() => setDialogOpen(true)} className="gap-1.5">
          <Plus className="h-3.5 w-3.5" /> Add Policy
        </Button>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
        </div>
      ) : policies.length === 0 ? (
        <Card className="py-12 text-center">
          <CardContent>
            <Shield className="h-8 w-8 mx-auto text-muted-foreground mb-3" />
            <p className="text-muted-foreground">No SLA policies defined yet.</p>
            <p className="text-sm text-muted-foreground mt-1">Create a policy to start monitoring service levels.</p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Entity</TableHead>
                <TableHead>Metric</TableHead>
                <TableHead>Target</TableHead>
                <TableHead>Priority</TableHead>
                <TableHead>Enabled</TableHead>
                <TableHead className="w-10" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {policies.map((p) => (
                <TableRow key={p.id}>
                  <TableCell className="font-medium">{p.name}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className="capitalize">{p.entity_type}</Badge>
                  </TableCell>
                  <TableCell className="capitalize">{p.metric.replace('_', ' ')}</TableCell>
                  <TableCell>{formatMinutes(p.threshold_minutes)}</TableCell>
                  <TableCell className="capitalize">{p.priority}</TableCell>
                  <TableCell>
                    <Switch
                      checked={p.enabled}
                      onCheckedChange={(enabled) => updatePolicy.mutate({ id: p.id, enabled })}
                    />
                  </TableCell>
                  <TableCell>
                    <Button
                      variant="ghost" size="icon"
                      onClick={() => deletePolicy.mutate(p.id)}
                      className="h-8 w-8 text-destructive"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}

      <NewPolicyDialog open={dialogOpen} onOpenChange={setDialogOpen} />
    </div>
  );
}

// ── New Policy Dialog ────────────────────────────────────────────────

function NewPolicyDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const createPolicy = useCreateSlaPolicy();
  const [form, setForm] = useState({
    name: '',
    entity_type: 'ticket',
    metric: 'first_response',
    threshold_minutes: 60,
    priority: 'all',
  });

  const handleSubmit = () => {
    createPolicy.mutate({
      name: form.name || `${form.entity_type} ${form.metric}`,
      description: null,
      entity_type: form.entity_type,
      metric: form.metric,
      threshold_minutes: form.threshold_minutes,
      priority: form.priority,
      enabled: true,
    }, {
      onSuccess: () => {
        onOpenChange(false);
        setForm({ name: '', entity_type: 'ticket', metric: 'first_response', threshold_minutes: 60, priority: 'all' });
      },
    });
  };

  const availableMetrics = METRICS[form.entity_type] || [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>New SLA Policy</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label>Name</Label>
            <Input
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="e.g. Ticket first response under 1h"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Entity type</Label>
              <Select value={form.entity_type} onValueChange={(v) => setForm({ ...form, entity_type: v, metric: METRICS[v]?.[0]?.value || '' })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {ENTITY_TYPES.map((e) => (
                    <SelectItem key={e.value} value={e.value}>{e.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Metric</Label>
              <Select value={form.metric} onValueChange={(v) => setForm({ ...form, metric: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {availableMetrics.map((m) => (
                    <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Target (minutes)</Label>
              <Input
                type="number"
                min={1}
                value={form.threshold_minutes}
                onChange={(e) => setForm({ ...form, threshold_minutes: parseInt(e.target.value) || 60 })}
              />
            </div>
            <div>
              <Label>Priority filter</Label>
              <Select value={form.priority} onValueChange={(v) => setForm({ ...form, priority: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All priorities</SelectItem>
                  <SelectItem value="high">High only</SelectItem>
                  <SelectItem value="medium">Medium only</SelectItem>
                  <SelectItem value="low">Low only</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline">Cancel</Button>
          </DialogClose>
          <Button onClick={handleSubmit} disabled={createPolicy.isPending}>Create</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Violations Tab ───────────────────────────────────────────────────

function ViolationsTab() {
  const [filter, setFilter] = useState<'open' | 'resolved' | 'all'>('open');
  const { data: violations = [], isLoading } = useSlaViolations({
    resolved: filter === 'open' ? false : filter === 'resolved' ? true : undefined,
  });
  const resolveViolation = useResolveSlaViolation();

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        {(['open', 'resolved', 'all'] as const).map((f) => (
          <Button
            key={f}
            size="sm"
            variant={filter === f ? 'default' : 'outline'}
            onClick={() => setFilter(f)}
            className="capitalize"
          >
            {f}
          </Button>
        ))}
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
        </div>
      ) : violations.length === 0 ? (
        <Card className="py-12 text-center">
          <CardContent>
            <CheckCircle2 className="h-8 w-8 mx-auto text-green-500 mb-3" />
            <p className="text-muted-foreground">
              {filter === 'open' ? 'No open violations — all SLAs met!' : 'No violations found.'}
            </p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Severity</TableHead>
                <TableHead>Entity</TableHead>
                <TableHead>Metric</TableHead>
                <TableHead>Target</TableHead>
                <TableHead>Actual</TableHead>
                <TableHead>When</TableHead>
                <TableHead className="w-10" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {violations.map((v) => (
                <TableRow key={v.id}>
                  <TableCell>
                    <Badge variant="outline" className={SEVERITY_COLORS[v.severity] || ''}>
                      {v.severity}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <span className="capitalize">{v.entity_type}</span>
                    <span className="text-muted-foreground text-xs ml-1">#{v.entity_id.slice(0, 8)}</span>
                  </TableCell>
                  <TableCell className="capitalize">{v.metric.replace('_', ' ')}</TableCell>
                  <TableCell>{formatMinutes(v.threshold_minutes)}</TableCell>
                  <TableCell className="font-medium text-destructive">{formatMinutes(v.actual_minutes)}</TableCell>
                  <TableCell className="text-muted-foreground text-sm">
                    {formatDistanceToNow(new Date(v.created_at), { addSuffix: true })}
                  </TableCell>
                  <TableCell>
                    {!v.resolved_at && (
                      <Button
                        variant="ghost" size="sm"
                        onClick={() => resolveViolation.mutate({ id: v.id })}
                        className="text-xs"
                      >
                        Resolve
                      </Button>
                    )}
                    {v.resolved_at && (
                      <Badge variant="outline" className="text-green-600 border-green-200">
                        Resolved
                      </Badge>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}
    </div>
  );
}

// ── Page ─────────────────────────────────────────────────────────────

export default function SlaMonitorPage() {
  const fpEnabled = useIsModuleEnabled('flowpilot');
  return (
    <AdminLayout>
      <AdminPageContainer>
        <div className="space-y-6">
          <div className="flex items-center gap-3">
            <Shield className="h-6 w-6 text-primary" />
            <div>
              <h1 className="text-2xl font-semibold tracking-tight">SLA Monitor</h1>
              <p className="text-sm text-muted-foreground">
                Service level targets — {fpEnabled ? 'FlowPilot monitors compliance automatically' : 'enable FlowPilot to auto-monitor compliance'}
              </p>
            </div>
          </div>

          <StatsCards />

          <Tabs defaultValue="violations">
            <TabsList>
              <TabsTrigger value="violations" className="gap-1.5">
                <AlertTriangle className="h-3.5 w-3.5" />
                Violations
              </TabsTrigger>
              <TabsTrigger value="policies" className="gap-1.5">
                <Clock className="h-3.5 w-3.5" />
                Policies
              </TabsTrigger>
            </TabsList>

            <TabsContent value="violations" className="mt-4">
              <ViolationsTab />
            </TabsContent>

            <TabsContent value="policies" className="mt-4">
              <PoliciesTab />
            </TabsContent>
          </Tabs>
        </div>
      </AdminPageContainer>
    </AdminLayout>
  );
}
