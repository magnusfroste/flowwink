import { useState } from 'react';
import { Play, Pause, Check, ClipboardCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { WorkOrderOutcomeDialog } from './WorkOrderOutcomeDialog';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  useMoWorkOrders,
  useGenerateMoWorkOrders,
  useProgressWorkOrder,
  useWorkCenters,
  type MoWorkOrder,
} from '@/hooks/useManufacturing';
import { logger } from '@/lib/logger';

function fmtMoney(cents: number) {
  return `${(cents / 100).toFixed(2)}`;
}

function fmtMin(v: number | null | undefined) {
  if (v === null || v === undefined) return '—';
  return Number(v).toFixed(0);
}

function VarianceCell({ wo }: { wo: MoWorkOrder }) {
  if (wo.actual_minutes === null || wo.actual_minutes === undefined) {
    return <span className="text-muted-foreground">—</span>;
  }
  const diff = Number(wo.actual_minutes) - Number(wo.planned_minutes);
  if (Math.abs(diff) < 0.5) return <span className="text-muted-foreground">on plan</span>;
  return (
    <span className={diff > 0 ? 'text-destructive' : 'text-primary'}>
      {diff > 0 ? '+' : ''}
      {diff.toFixed(0)}
    </span>
  );
}

export function MoWorkOrdersPanel({ moId }: { moId: string }) {
  const { data: workOrders, isLoading } = useMoWorkOrders(moId);
  const { data: workCenters } = useWorkCenters();
  const generate = useGenerateMoWorkOrders();
  const progress = useProgressWorkOrder();
  const [outcomeFor, setOutcomeFor] = useState<string | null>(null);

  const wcName = (id: string | null) =>
    id ? workCenters?.find((w) => w.id === id)?.name ?? '—' : '—';

  async function handleGenerate() {
    try {
      await generate.mutateAsync({ p_mo_id: moId });
    } catch (err) {
      logger.error('Generate work orders failed', err);
    }
  }

  function run(id: string, action: 'start' | 'pause' | 'done') {
    progress.mutate({ p_work_order_id: id, p_action: action });
  }

  const rows = workOrders ?? [];
  const totalPlanned = rows.reduce((s, w) => s + Number(w.planned_minutes ?? 0), 0);
  const totalActual = rows.reduce((s, w) => s + Number(w.actual_minutes ?? 0), 0);
  const totalLabor = rows.reduce((s, w) => s + (w.planned_labor_cost_cents ?? 0), 0);
  const totalActualLabor = rows.reduce((s, w) => s + (w.actual_labor_cost_cents ?? 0), 0);
  const open = rows.filter((w) => w.status !== 'done' && w.status !== 'cancelled').length;

  return (
    <div className="space-y-2 rounded-md border bg-muted/20 p-3">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-semibold">
          Work orders
          {rows.length > 0 && (
            <span className="ml-2 font-normal text-muted-foreground">
              {open === 0 ? 'all done' : `${open} open`}
            </span>
          )}
        </h4>
        <Button size="sm" variant="outline" onClick={handleGenerate} disabled={generate.isPending}>
          <Play className="mr-1 h-3 w-3" />
          {generate.isPending ? 'Generating…' : 'Generate work orders'}
        </Button>
      </div>

      {isLoading ? (
        <Skeleton className="h-16 w-full" />
      ) : rows.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          No work orders yet. Generate them from the active BOM's routing.
        </p>
      ) : (
        <>
          <div className="overflow-x-auto rounded border bg-background">
            <table className="w-full text-xs">
              <thead className="bg-muted/40 text-muted-foreground">
                <tr>
                  <th className="w-8 px-2 py-1.5 text-left font-medium">#</th>
                  <th className="px-2 py-1.5 text-left font-medium">Operation</th>
                  <th className="px-2 py-1.5 text-left font-medium">Work center</th>
                  <th className="px-2 py-1.5 text-right font-medium">Planned</th>
                  <th className="px-2 py-1.5 text-right font-medium">Actual</th>
                  <th className="px-2 py-1.5 text-right font-medium">Δ min</th>
                  <th className="px-2 py-1.5 text-right font-medium">Labor</th>
                  <th className="px-2 py-1.5 text-right font-medium">Scrap</th>
                  <th className="px-2 py-1.5 text-left font-medium">Status</th>
                  <th className="px-2 py-1.5 text-right font-medium">Report</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((w) => (
                  <tr key={w.id} className="border-t">
                    <td className="px-2 py-1.5 tabular-nums text-muted-foreground">{w.sequence}</td>
                    <td className="px-2 py-1.5">{w.name}</td>
                    <td className="px-2 py-1.5 text-muted-foreground">{wcName(w.work_center_id)}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums">
                      {fmtMin(w.planned_minutes)}
                    </td>
                    <td className="px-2 py-1.5 text-right tabular-nums">
                      {fmtMin(w.actual_minutes)}
                    </td>
                    <td className="px-2 py-1.5 text-right tabular-nums">
                      <VarianceCell wo={w} />
                    </td>
                    <td className="px-2 py-1.5 text-right tabular-nums">
                      {fmtMoney(w.actual_labor_cost_cents ?? w.planned_labor_cost_cents)}
                      {w.actual_labor_cost_cents === null && (
                        <span className="ml-1 text-muted-foreground">plan</span>
                      )}
                    </td>
                    <td className="px-2 py-1.5 text-right tabular-nums">
                      {Number(w.qty_scrapped ?? 0) > 0 ? (
                        <span className="text-destructive" title={w.scrap_reason ?? undefined}>{Number(w.qty_scrapped)}</span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="px-2 py-1.5">
                      <Badge
                        variant={
                          w.status === 'done'
                            ? 'default'
                            : w.status === 'in_progress'
                              ? 'secondary'
                              : 'outline'
                        }
                        className="text-[10px]"
                      >
                        {w.status.replace('_', ' ')}
                      </Badge>
                    </td>
                    <td className="px-2 py-1.5 text-right">
                      {w.status === 'cancelled' ? (
                        <span className="text-muted-foreground">—</span>
                      ) : w.status === 'done' ? (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-6 px-2"
                          onClick={() => setOutcomeFor(w.id)}
                          aria-label="Quality and scrap"
                        >
                          <ClipboardCheck className="h-3 w-3" />
                        </Button>
                      ) : (
                        <div className="flex justify-end gap-1">
                          {w.status === 'in_progress' ? (
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-6 px-2"
                              disabled={progress.isPending}
                              onClick={() => run(w.id, 'pause')}
                            >
                              <Pause className="h-3 w-3" />
                            </Button>
                          ) : (
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-6 px-2"
                              disabled={progress.isPending}
                              onClick={() => run(w.id, 'start')}
                            >
                              <Play className="h-3 w-3" />
                            </Button>
                          )}
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-6 px-2"
                            onClick={() => setOutcomeFor(w.id)}
                            aria-label="Quality and scrap"
                          >
                            <ClipboardCheck className="h-3 w-3" />
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-6 px-2"
                            disabled={progress.isPending}
                            onClick={() => run(w.id, 'done')}
                          >
                            <Check className="h-3 w-3" />
                          </Button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-muted-foreground">
            Planned <span className="font-medium text-foreground">{totalPlanned.toFixed(0)} min</span>{' '}
            / {fmtMoney(totalLabor)} · Actual{' '}
            <span className="font-medium text-foreground">{totalActual.toFixed(0)} min</span> /{' '}
            {fmtMoney(totalActualLabor)}
          </p>
        </>
      )}
      {outcomeFor && (
        <WorkOrderOutcomeDialog
          workOrder={rows.find((w) => w.id === outcomeFor)!}
          open={!!outcomeFor}
          onOpenChange={(o) => !o && setOutcomeFor(null)}
        />
      )}
    </div>
  );
}
