import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { format } from 'date-fns';

interface ComplianceReport {
  period_days: number;
  violations_opened: number;
  violations_resolved: number;
  violations_open_now: number;
  avg_overage_ratio: number;
  escalations_fired: number;
  service_credits_accrued_cents: number;
  by_entity_type: Record<string, number>;
  by_severity: Record<string, number>;
  compliance_by_entity: Record<
    string,
    { created_in_period: number; violations_in_period: number; compliance_pct: number }
  >;
}

function useComplianceReport(days: number) {
  return useQuery({
    queryKey: ['sla-compliance-report', days],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('sla_compliance_report' as any, {
        p_days: days,
        p_entity_type: null,
      });
      if (error) throw error;
      return (data ?? {}) as ComplianceReport;
    },
  });
}

function useSlaTiers() {
  return useQuery({
    queryKey: ['sla-tiers'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('manage_sla_tier' as any, { p_action: 'list' });
      if (error) throw error;
      const d: any = data ?? {};
      return (d.tiers ?? []) as Array<{
        id: string;
        name: string;
        threshold_multiplier: number;
        assignments: number;
      }>;
    },
  });
}

function useServiceCredits() {
  return useQuery({
    queryKey: ['sla-service-credits'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('manage_service_credit' as any, {
        p_action: 'list',
      });
      if (error) throw error;
      const d: any = data ?? {};
      return {
        credits: (d.credits ?? []) as Array<{
          id: string;
          amount_cents: number;
          currency: string | null;
          status: string;
          reason: string | null;
          created_at: string;
        }>,
        total_accrued_cents: (d.total_accrued_cents ?? 0) as number,
      };
    },
  });
}

const fmtSek = (cents: number) =>
  new Intl.NumberFormat('sv-SE', { style: 'currency', currency: 'SEK', maximumFractionDigits: 0 }).format(
    (cents ?? 0) / 100,
  );

function complianceBar(pct: number): string {
  if (pct >= 95) return 'bg-green-600';
  if (pct >= 80) return 'bg-amber-500';
  return 'bg-destructive';
}

const CREDIT_STATUS: Record<string, string> = {
  accrued: 'bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/20',
  applied: 'bg-green-500/10 text-green-700 dark:text-green-400 border-green-500/20',
  waived: 'bg-muted text-muted-foreground border-border',
};

export function ComplianceTab() {
  const [days, setDays] = useState(30);
  const { data: report, isLoading } = useComplianceReport(days);
  const { data: tiers, isLoading: tiersLoading } = useSlaTiers();
  const { data: credits, isLoading: creditsLoading } = useServiceCredits();

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          Compliance rollup for the last {days} days.
        </p>
        <Select value={String(days)} onValueChange={(v) => setDays(parseInt(v))}>
          <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="7">Last 7 days</SelectItem>
            <SelectItem value="30">Last 30 days</SelectItem>
            <SelectItem value="90">Last 90 days</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* KPI cards */}
      {isLoading ? (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Card key={i}><CardContent className="pt-6"><Skeleton className="h-6 w-16" /></CardContent></Card>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          {[
            { label: 'Violations opened', value: report?.violations_opened ?? 0 },
            { label: 'Resolved', value: report?.violations_resolved ?? 0 },
            { label: 'Open now', value: report?.violations_open_now ?? 0 },
            { label: 'Escalations fired', value: report?.escalations_fired ?? 0 },
            { label: 'Service credits', value: fmtSek(report?.service_credits_accrued_cents ?? 0) },
            {
              label: 'Avg overage',
              value: report?.avg_overage_ratio
                ? `${report.avg_overage_ratio.toFixed(1)}× threshold`
                : '—',
            },
          ].map((k) => (
            <Card key={k.label}>
              <CardContent className="pt-5 pb-4">
                <p className="text-2xl font-semibold tabular-nums">{k.value}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{k.label}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Compliance by channel */}
      <Card>
        <CardHeader><CardTitle className="text-base">Compliance by channel</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          {isLoading ? (
            <Skeleton className="h-24 w-full" />
          ) : !report?.compliance_by_entity || Object.keys(report.compliance_by_entity).length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">No entity activity in this window.</p>
          ) : (
            Object.entries(report.compliance_by_entity).map(([entity, m]) => (
              <div key={entity} className="space-y-1.5">
                <div className="flex items-center justify-between text-sm">
                  <span className="capitalize font-medium">{entity}</span>
                  <span className="text-muted-foreground text-xs">
                    {m.created_in_period} created · {m.violations_in_period} violations
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="flex-1 h-2 rounded bg-muted overflow-hidden">
                    <div
                      className={`h-full ${complianceBar(m.compliance_pct)}`}
                      style={{ width: `${Math.min(m.compliance_pct, 100)}%` }}
                    />
                  </div>
                  <span className="text-xs tabular-nums w-14 text-right">{m.compliance_pct.toFixed(1)}%</span>
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      {/* Severity breakdown */}
      <Card>
        <CardHeader><CardTitle className="text-base">Severity breakdown</CardTitle></CardHeader>
        <CardContent>
          {isLoading ? (
            <Skeleton className="h-10 w-full" />
          ) : !report?.by_severity || Object.keys(report.by_severity).length === 0 ? (
            <p className="text-sm text-muted-foreground">No violations in this window.</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {Object.entries(report.by_severity).map(([sev, count]) => (
                <Badge key={sev} variant="outline" className="capitalize gap-1.5">
                  <span>{sev}</span>
                  <span className="font-semibold">{count}</span>
                </Badge>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* SLA tiers + Service credits panels */}
      <div className="grid md:grid-cols-2 gap-4">
        <Card>
          <CardHeader><CardTitle className="text-base">SLA tiers</CardTitle></CardHeader>
          <CardContent>
            {tiersLoading ? (
              <Skeleton className="h-16 w-full" />
            ) : !tiers?.length ? (
              <p className="text-sm text-muted-foreground">No tiers configured.</p>
            ) : (
              <div className="space-y-2">
                {tiers.map((t) => (
                  <div key={t.id} className="flex items-center justify-between text-sm border-b last:border-b-0 pb-2 last:pb-0">
                    <div>
                      <p className="font-medium">{t.name}</p>
                      <p className="text-xs text-muted-foreground">
                        ×{Number(t.threshold_multiplier).toFixed(2)} threshold
                      </p>
                    </div>
                    <Badge variant="outline">{t.assignments} assigned</Badge>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center justify-between">
              <span>Service credits</span>
              {credits && (
                <span className="text-xs font-normal text-muted-foreground">
                  Accrued: {fmtSek(credits.total_accrued_cents)}
                </span>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {creditsLoading ? (
              <Skeleton className="h-16 w-full" />
            ) : !credits?.credits.length ? (
              <p className="text-sm text-muted-foreground">No service credits recorded.</p>
            ) : (
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {credits.credits.map((c) => (
                  <div key={c.id} className="flex items-center justify-between text-sm border-b last:border-b-0 pb-2 last:pb-0 gap-3">
                    <div className="min-w-0">
                      <p className="font-medium tabular-nums">
                        {new Intl.NumberFormat('sv-SE', {
                          style: 'currency',
                          currency: c.currency || 'SEK',
                          maximumFractionDigits: 0,
                        }).format(c.amount_cents / 100)}
                      </p>
                      <p className="text-xs text-muted-foreground truncate">
                        {c.reason || format(new Date(c.created_at), 'PP')}
                      </p>
                    </div>
                    <Badge variant="outline" className={`capitalize ${CREDIT_STATUS[c.status] ?? ''}`}>
                      {c.status}
                    </Badge>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
