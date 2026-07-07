import { useState } from 'react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { CheckCircle2, XCircle, Clock, PlayCircle, StopCircle, Signature, Link as LinkIcon, Package, Repeat } from 'lucide-react';
import { format, formatDistanceStrict } from 'date-fns';
import {
  useServiceOrder, useServiceVisits, type ServiceVisit,
} from '@/hooks/useFieldService';
import {
  useSlaStatus, useSetSla, useRecordVisitTime, useServicePackages,
  useServicePackageMutation, useRecurrenceMutation, useLinkServiceOrder,
} from '@/hooks/useFieldServiceRpc';
import { useContracts } from '@/hooks/useContracts';
import { useProjects } from '@/hooks/useProjects';
import { useDeals } from '@/hooks/useDeals';
import { VisitProofDialog } from './VisitProofDialog';
import { logger } from '@/lib/logger';

interface Props { orderId: string | null; onClose: () => void; }

const RULES = ['weekly', 'biweekly', 'monthly', 'quarterly', 'yearly'] as const;

export function ServiceOrderDetailDialog({ orderId, onClose }: Props) {
  const { data: order } = useServiceOrder(orderId ?? undefined);
  const { data: visits } = useServiceVisits(orderId ?? undefined);

  return (
    <Dialog open={!!orderId} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {order?.order_number ?? 'Order'} — {order?.title ?? ''}
          </DialogTitle>
          <DialogDescription>
            {order?.customer_name}
            {(order as any)?.parent_order_id && (
              <span className="ml-2 inline-flex items-center gap-1">
                <Badge variant="secondary" className="text-[10px]">Recurring child</Badge>
                <span className="text-xs text-muted-foreground">
                  parent {String((order as any).parent_order_id).slice(0, 8)}
                </span>
              </span>
            )}
          </DialogDescription>

        </DialogHeader>

        {orderId && (
          <Tabs defaultValue="visits" className="space-y-3">
            <TabsList>
              <TabsTrigger value="visits">Visits</TabsTrigger>
              <TabsTrigger value="sla">SLA</TabsTrigger>
              <TabsTrigger value="package">Apply package</TabsTrigger>
              <TabsTrigger value="recurrence">Recurrence</TabsTrigger>
              <TabsTrigger value="links">Links</TabsTrigger>
            </TabsList>

            <TabsContent value="visits">
              <VisitsSection visits={visits ?? []} />
            </TabsContent>
            <TabsContent value="sla">
              <SlaSection orderId={orderId} />
            </TabsContent>
            <TabsContent value="package">
              <ApplyPackageSection orderId={orderId} onDone={onClose} />
            </TabsContent>
            <TabsContent value="recurrence">
              <RecurrenceSection orderId={orderId}
                rule={(order as any)?.recurrence_rule ?? null}
                until={(order as any)?.recurrence_until ?? null}
                nextAt={(order as any)?.next_occurrence_at ?? null}
              />
            </TabsContent>
            <TabsContent value="links">
              <LinksSection orderId={orderId}
                contractId={(order as any)?.contract_id ?? null}
                projectId={(order as any)?.project_id ?? null}
                dealId={(order as any)?.deal_id ?? null}
              />
            </TabsContent>
          </Tabs>
        )}
      </DialogContent>
    </Dialog>
  );
}

function VisitsSection({ visits }: { visits: ServiceVisit[] }) {
  const time$ = useRecordVisitTime();
  const [proofVisit, setProofVisit] = useState<ServiceVisit | null>(null);

  if (visits.length === 0) return <div className="py-6 text-center text-sm text-muted-foreground">No visits scheduled.</div>;
  return (
    <div className="space-y-2">
      {visits.map((v) => {
        const dur = v.actual_start && v.actual_end
          ? formatDistanceStrict(new Date(v.actual_end), new Date(v.actual_start))
          : null;
        return (
          <Card key={v.id}>
            <CardContent className="py-3 space-y-2">
              <div className="flex items-center justify-between">
                <div className="text-sm">
                  <div className="font-medium">
                    {format(new Date(v.scheduled_start), 'PP HH:mm')} – {format(new Date(v.scheduled_end), 'HH:mm')}
                  </div>
                  <div className="text-xs text-muted-foreground capitalize">{v.status}</div>
                </div>
                <div className="flex gap-1">
                  {!v.actual_start ? (
                    <Button size="sm" variant="outline" onClick={() => time$.mutate({ visit_id: v.id, action: 'start' })}>
                      <PlayCircle className="h-3 w-3 mr-1" /> Clock in
                    </Button>
                  ) : !v.actual_end ? (
                    <Button size="sm" variant="outline" onClick={() => time$.mutate({ visit_id: v.id, action: 'stop' })}>
                      <StopCircle className="h-3 w-3 mr-1" /> Clock out
                    </Button>
                  ) : (
                    <Badge variant="secondary">Done{dur && ` · ${dur}`}</Badge>
                  )}
                  <Button size="sm" variant="outline" onClick={() => setProofVisit(v)}>
                    <Signature className="h-3 w-3 mr-1" /> Proof
                  </Button>
                </div>
              </div>
              {(v.actual_start || v.actual_end) && (
                <div className="text-xs text-muted-foreground">
                  {v.actual_start && <>Started {format(new Date(v.actual_start), 'PP HH:mm')}</>}
                  {v.actual_end && <> · Ended {format(new Date(v.actual_end), 'HH:mm')}</>}
                </div>
              )}
              {(v.signature_url || (v as any).signed_by) && (
                <div className="text-xs text-muted-foreground flex items-center gap-2">
                  {(v as any).signed_by && <span>Signed by {(v as any).signed_by}</span>}
                  {v.signature_url && <img src={v.signature_url} alt="sig" className="h-8" />}
                </div>
              )}
            </CardContent>
          </Card>
        );
      })}
      <VisitProofDialog visit={proofVisit} onClose={() => setProofVisit(null)} />
    </div>
  );
}

function SlaSection({ orderId }: { orderId: string }) {
  const { data: status } = useSlaStatus(orderId);
  const set$ = useSetSla();
  const [resp, setResp] = useState('');
  const [reso, setReso] = useState('');

  function icon(met: boolean | null | undefined) {
    if (met === true) return <CheckCircle2 className="h-4 w-4 text-green-600" />;
    if (met === false) return <XCircle className="h-4 w-4 text-destructive" />;
    return <Clock className="h-4 w-4 text-muted-foreground" />;
  }

  return (
    <Card>
      <CardHeader className="pb-2"><CardTitle className="text-base">SLA</CardTitle></CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div className="flex items-center gap-2">{icon(status?.response_met)}
            <div>Response {status?.response_hours != null && <span className="text-muted-foreground">· target {status.response_hours}h</span>}</div>
          </div>
          <div className="flex items-center gap-2">{icon(status?.resolution_met)}
            <div>Resolution {status?.resolution_hours != null && <span className="text-muted-foreground">· target {status.resolution_hours}h</span>}</div>
          </div>
        </div>
        <div className="grid grid-cols-3 gap-2 items-end">
          <div><Label className="text-xs">Response hrs</Label>
            <Input type="number" step="0.5" value={resp} onChange={(e) => setResp(e.target.value)}
              placeholder={String(status?.response_hours ?? '')} />
          </div>
          <div><Label className="text-xs">Resolution hrs</Label>
            <Input type="number" step="0.5" value={reso} onChange={(e) => setReso(e.target.value)}
              placeholder={String(status?.resolution_hours ?? '')} />
          </div>
          <Button size="sm" disabled={!resp || !reso || set$.isPending}
            onClick={() => set$.mutate({ order_id: orderId, response_hours: Number(resp), resolution_hours: Number(reso) })}
          >Set targets</Button>
        </div>
      </CardContent>
    </Card>
  );
}

function ApplyPackageSection({ orderId, onDone }: { orderId: string; onDone: () => void }) {
  const { data: packages } = useServicePackages();
  const mut = useServicePackageMutation();
  const [pick, setPick] = useState('');

  return (
    <Card>
      <CardContent className="pt-4 space-y-3">
        <p className="text-xs text-muted-foreground">Append a package's lines to this order.</p>
        <Select value={pick} onValueChange={setPick}>
          <SelectTrigger><SelectValue placeholder="Pick a package" /></SelectTrigger>
          <SelectContent>
            {(packages ?? []).filter((p) => p.active).map((p) => (
              <SelectItem key={p.id} value={p.id}>{p.name} ({(p.lines ?? []).length} lines)</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button size="sm" disabled={!pick || mut.isPending}
          onClick={async () => {
            try {
              await mut.mutateAsync({ action: 'apply', package_id: pick, order_id: orderId });
              onDone();
            } catch (e) { logger.error('apply', e); }
          }}
        >
          <Package className="h-3 w-3 mr-1" /> Apply
        </Button>
      </CardContent>
    </Card>
  );
}

function RecurrenceSection({ orderId, rule, until, nextAt }: {
  orderId: string; rule: string | null; until: string | null; nextAt: string | null;
}) {
  const mut = useRecurrenceMutation();
  const [ruleSel, setRuleSel] = useState<string>(rule ?? 'weekly');
  const [untilSel, setUntilSel] = useState<string>(until ?? '');

  return (
    <Card>
      <CardContent className="pt-4 space-y-3">
        {rule ? (
          <div className="text-sm">
            <Badge variant="secondary" className="mr-2"><Repeat className="h-3 w-3 mr-1" />{rule}</Badge>
            {nextAt && <span className="text-muted-foreground">Next: {format(new Date(nextAt), 'PP')}</span>}
            {until && <span className="text-muted-foreground ml-2">until {format(new Date(until), 'PP')}</span>}
          </div>
        ) : (
          <div className="text-sm text-muted-foreground">Not recurring.</div>
        )}
        <div className="grid grid-cols-3 gap-2 items-end">
          <div><Label className="text-xs">Rule</Label>
            <Select value={ruleSel} onValueChange={setRuleSel}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {RULES.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div><Label className="text-xs">Until (optional)</Label>
            <Input type="date" value={untilSel} onChange={(e) => setUntilSel(e.target.value)} />
          </div>
          <div className="flex gap-1">
            <Button size="sm" disabled={mut.isPending}
              onClick={() => mut.mutate({
                action: 'set', order_id: orderId,
                rule: ruleSel as any,
                until: untilSel || null,
              })}
            >Set</Button>
            {rule && (
              <Button size="sm" variant="outline" disabled={mut.isPending}
                onClick={() => mut.mutate({ action: 'clear', order_id: orderId })}
              >Clear</Button>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function LinksSection({ orderId, contractId, projectId, dealId }: {
  orderId: string; contractId: string | null; projectId: string | null; dealId: string | null;
}) {
  const link$ = useLinkServiceOrder();
  const { data: contracts } = useContracts();
  const { data: projects } = useProjects();
  const { data: deals } = useDeals();

  function row(
    kind: 'contract' | 'project' | 'deal',
    currentId: string | null,
    items: { id: string; label: string }[],
  ) {
    const currentLabel = items.find((i) => i.id === currentId)?.label;
    return (
      <div className="flex items-center gap-2">
        <div className="w-24 text-sm capitalize">{kind}</div>
        <Select value={currentId ?? ''} onValueChange={(v) => link$.mutate({
          order_id: orderId, ...(kind === 'contract' ? { contract_id: v } : kind === 'project' ? { project_id: v } : { deal_id: v }),
        })}>
          <SelectTrigger className="flex-1"><SelectValue placeholder={`Pick ${kind}`}>{currentLabel}</SelectValue></SelectTrigger>
          <SelectContent>
            {items.map((it) => <SelectItem key={it.id} value={it.id}>{it.label}</SelectItem>)}
          </SelectContent>
        </Select>
        {currentId && (
          <Button size="sm" variant="ghost" onClick={() => link$.mutate({ order_id: orderId, unlink: kind })}>Clear</Button>
        )}
      </div>
    );
  }

  return (
    <Card>
      <CardContent className="pt-4 space-y-3">
        {row('contract', contractId, (contracts ?? []).map((c: any) => ({ id: c.id, label: c.title ?? c.contract_number ?? c.id.slice(0, 8) })))}
        {row('project', projectId, (projects ?? []).map((p: any) => ({ id: p.id, label: p.name ?? p.title ?? p.id.slice(0, 8) })))}
        {row('deal', dealId, (deals ?? []).map((d: any) => ({ id: d.id, label: d.title ?? d.name ?? d.id.slice(0, 8) })))}
        <div className="text-xs text-muted-foreground flex items-center gap-1">
          <LinkIcon className="h-3 w-3" /> Links surface this order under the linked record.
        </div>
      </CardContent>
    </Card>
  );
}
