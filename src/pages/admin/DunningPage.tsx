import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle,
} from '@/components/ui/sheet';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  useDunningSequences, useDunningMetrics, useDunningActions, useDunningControl,
  runDunningProcessor, type DunningStatus, type DunningSequence,
} from '@/hooks/useDunning';
import { useDunningSettings, useUpdateDunningSettings } from '@/hooks/useDunningSettings';
import { DunningPreview } from '@/components/admin/subscriptions/DunningPreview';
import { useToast } from '@/hooks/use-toast';
import { format, formatDistanceToNow } from 'date-fns';
import { AlertTriangle, CheckCircle2, Clock, MoreHorizontal, Pause, Play, Play as PlayIcon, RefreshCw, XCircle, Zap } from 'lucide-react';

const STATUS_LABEL: Record<DunningStatus, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
  active: { label: 'Active', variant: 'destructive' },
  recovered: { label: 'Recovered', variant: 'default' },
  failed: { label: 'Failed (cancelled)', variant: 'outline' },
  cancelled: { label: 'Manually cancelled', variant: 'outline' },
  paused: { label: 'Paused', variant: 'secondary' },
};

const STEP_LABELS = [
  'Day 0 — Gentle notice',
  'Day 3 — Reminder',
  'Day 7 — Urgent warning',
  'Day 10 — Final notice',
  'Day 14 — Subscription cancelled',
];

function formatMoney(cents: number, currency: string) {
  try {
    return new Intl.NumberFormat('en-US', {
      style: 'currency', currency: currency.toUpperCase(), maximumFractionDigits: 0,
    }).format(cents / 100);
  } catch {
    return `${(cents / 100).toFixed(0)} ${currency.toUpperCase()}`;
  }
}

export default function DunningPage() {
  const [filter, setFilter] = useState<DunningStatus | 'all'>('active');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const { toast } = useToast();

  const { data: seqs, isLoading } = useDunningSequences(filter);
  const { data: metrics } = useDunningMetrics();
  const control = useDunningControl();

  const runNow = async () => {
    setRunning(true);
    try {
      const res = await runDunningProcessor();
      toast({
        title: 'Processor ran',
        description: `${res.processed} processed · ${res.emailsSent} emails sent · ${res.recovered} recovered · ${res.cancelled} cancelled`,
      });
    } catch (e: any) {
      toast({ title: 'Processor failed', description: e?.message, variant: 'destructive' });
    } finally {
      setRunning(false);
    }
  };

  const selected = seqs?.find((s) => s.id === selectedId) ?? null;

  return (
    <div className="container mx-auto py-8 space-y-8">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Dunning</h1>
          <p className="text-muted-foreground mt-1 max-w-2xl">
            Automated recovery sequences for failed subscription payments. Each failure starts a 14-day,
            5-step timeline of branded reminders before the subscription is cancelled.
          </p>
        </div>
        <Button onClick={runNow} disabled={running} variant="outline">
          <PlayIcon className="h-4 w-4 mr-2" />
          {running ? 'Running…' : 'Run processor now'}
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <MetricCard
          icon={<AlertTriangle className="h-4 w-4 text-destructive" />}
          label="MRR at risk"
          value={metrics ? formatMoney(metrics.mrrAtRisk, metrics.currency) : '—'}
          hint={metrics ? `${metrics.activeCount} active sequence(s)` : ''}
        />
        <MetricCard
          icon={<CheckCircle2 className="h-4 w-4 text-emerald-500" />}
          label="Recovered (30d)"
          value={metrics?.recovered30?.toString() ?? '—'}
          hint={metrics ? formatMoney(metrics.recoveredMrr30, metrics.currency) + ' MRR saved' : ''}
        />
        <MetricCard
          icon={<XCircle className="h-4 w-4 text-muted-foreground" />}
          label="Lost (30d)"
          value={metrics?.failed30?.toString() ?? '—'}
          hint="Cancelled after dunning"
        />
        <MetricCard
          icon={<Zap className="h-4 w-4 text-amber-500" />}
          label="Recovery rate"
          value={metrics?.recoveryRate != null ? `${metrics.recoveryRate.toFixed(0)}%` : '—'}
          hint="Last 30 days"
        />
      </div>

      <Tabs value={filter} onValueChange={(v) => setFilter(v as any)}>
        <TabsList>
          <TabsTrigger value="active">Active</TabsTrigger>
          <TabsTrigger value="recovered">Recovered</TabsTrigger>
          <TabsTrigger value="failed">Failed</TabsTrigger>
          <TabsTrigger value="paused">Paused</TabsTrigger>
          <TabsTrigger value="all">All</TabsTrigger>
        </TabsList>
      </Tabs>

      <Card>
        <CardHeader>
          <CardTitle>{seqs?.length ?? 0} sequence(s)</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-2">
              {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
            </div>
          ) : !seqs || seqs.length === 0 ? (
            <EmptyState filter={filter} />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Customer</TableHead>
                  <TableHead>At risk</TableHead>
                  <TableHead>Step</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Next action</TableHead>
                  <TableHead className="w-12" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {seqs.map((seq) => (
                  <SeqRow
                    key={seq.id}
                    seq={seq}
                    onOpen={() => setSelectedId(seq.id)}
                    onPause={() => control.mutate({ sequenceId: seq.id, action: 'pause' })}
                    onResume={() => control.mutate({ sequenceId: seq.id, action: 'resume' })}
                    onCancel={() => control.mutate({ sequenceId: seq.id, action: 'cancel' })}
                    onEscalate={() => control.mutate({ sequenceId: seq.id, action: 'escalate' })}
                  />
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <DetailSheet sequence={selected} onClose={() => setSelectedId(null)} />
    </div>
  );
}

function MetricCard({ icon, label, value, hint }: { icon: React.ReactNode; label: string; value: string; hint?: string }) {
  return (
    <Card>
      <CardContent className="pt-6">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">{icon}{label}</div>
        <p className="text-3xl font-bold mt-2">{value}</p>
        {hint && <p className="text-xs text-muted-foreground mt-1">{hint}</p>}
      </CardContent>
    </Card>
  );
}

function SeqRow({
  seq, onOpen, onPause, onResume, onCancel, onEscalate,
}: {
  seq: DunningSequence;
  onOpen: () => void;
  onPause: () => void;
  onResume: () => void;
  onCancel: () => void;
  onEscalate: () => void;
}) {
  const status = STATUS_LABEL[seq.status];
  const sub = seq.subscriptions;
  return (
    <TableRow className="cursor-pointer" onClick={onOpen}>
      <TableCell>
        <div className="font-medium">{sub?.customer_name ?? sub?.customer_email ?? 'Unknown'}</div>
        {sub?.product_name && (
          <div className="text-xs text-muted-foreground">{sub.product_name}</div>
        )}
      </TableCell>
      <TableCell className="font-medium">{formatMoney(seq.mrr_at_risk_cents, seq.currency)}/mo</TableCell>
      <TableCell>
        <div className="text-sm">{STEP_LABELS[seq.current_step] ?? `Step ${seq.current_step}`}</div>
        {seq.attempt_count > 1 && (
          <div className="text-xs text-muted-foreground">{seq.attempt_count} failures</div>
        )}
      </TableCell>
      <TableCell><Badge variant={status.variant}>{status.label}</Badge></TableCell>
      <TableCell>
        {seq.next_action_at ? (
          <span className="text-sm flex items-center gap-1">
            <Clock className="h-3 w-3" />
            {formatDistanceToNow(new Date(seq.next_action_at), { addSuffix: true })}
          </span>
        ) : (
          <span className="text-xs text-muted-foreground">—</span>
        )}
      </TableCell>
      <TableCell onClick={(e) => e.stopPropagation()}>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon"><MoreHorizontal className="h-4 w-4" /></Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {seq.status === 'active' && (
              <>
                <DropdownMenuItem onClick={onPause}><Pause className="h-4 w-4 mr-2" />Pause</DropdownMenuItem>
                <DropdownMenuItem onClick={onEscalate}><Zap className="h-4 w-4 mr-2" />Escalate to final step</DropdownMenuItem>
                <DropdownMenuItem onClick={onCancel} className="text-destructive">
                  <XCircle className="h-4 w-4 mr-2" />Cancel sequence
                </DropdownMenuItem>
              </>
            )}
            {seq.status === 'paused' && (
              <DropdownMenuItem onClick={onResume}><Play className="h-4 w-4 mr-2" />Resume</DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </TableCell>
    </TableRow>
  );
}

function DetailSheet({ sequence, onClose }: { sequence: DunningSequence | null; onClose: () => void }) {
  const { data: actions } = useDunningActions(sequence?.id ?? null);
  if (!sequence) return null;
  const sub = sequence.subscriptions;
  return (
    <Sheet open={!!sequence} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="overflow-y-auto sm:max-w-lg">
        <SheetHeader>
          <SheetTitle>{sub?.customer_name ?? sub?.customer_email ?? 'Sequence detail'}</SheetTitle>
          <SheetDescription>{sub?.product_name ?? 'Subscription'}</SheetDescription>
        </SheetHeader>
        <div className="mt-6 space-y-6">
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div><span className="text-muted-foreground">At risk:</span><br /><strong>{formatMoney(sequence.mrr_at_risk_cents, sequence.currency)}/mo</strong></div>
            <div><span className="text-muted-foreground">Status:</span><br /><Badge variant={STATUS_LABEL[sequence.status].variant}>{STATUS_LABEL[sequence.status].label}</Badge></div>
            <div><span className="text-muted-foreground">Current step:</span><br />{STEP_LABELS[sequence.current_step] ?? `Step ${sequence.current_step}`}</div>
            <div><span className="text-muted-foreground">Failures:</span><br />{sequence.attempt_count}</div>
          </div>
          {sequence.failure_reason && (
            <div className="text-sm">
              <div className="text-muted-foreground mb-1">Failure reason</div>
              <div className="rounded-md bg-muted p-3 text-xs font-mono">{sequence.failure_reason}</div>
            </div>
          )}
          <div>
            <h3 className="font-semibold text-sm mb-3">Activity</h3>
            <div className="space-y-3">
              {(actions ?? []).length === 0 && <p className="text-xs text-muted-foreground">No actions yet.</p>}
              {(actions ?? []).map((a) => (
                <div key={a.id} className="flex items-start gap-3 text-sm border-l-2 border-border pl-3">
                  <div className="flex-1">
                    <div className="font-medium">{a.action_type.replace(/_/g, ' ')}</div>
                    {a.email_template && <div className="text-xs text-muted-foreground">{a.email_template} → {a.recipient_email}</div>}
                    {a.error_message && <div className="text-xs text-destructive">{a.error_message}</div>}
                  </div>
                  <div className="text-xs text-muted-foreground whitespace-nowrap">{format(new Date(a.created_at), 'MMM d, HH:mm')}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}

function EmptyState({ filter }: { filter: string }) {
  return (
    <div className="text-center py-12">
      <RefreshCw className="h-8 w-8 text-muted-foreground mx-auto mb-3" />
      <p className="text-muted-foreground">No {filter === 'all' ? '' : filter + ' '}dunning sequences.</p>
      <p className="text-sm text-muted-foreground mt-2 max-w-md mx-auto">
        Sequences start automatically when Stripe reports a failed subscription payment.
      </p>
    </div>
  );
}
