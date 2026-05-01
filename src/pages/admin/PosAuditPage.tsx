import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { ShieldCheck, Clock, Database, Trash2 } from 'lucide-react';

interface RetentionStatus {
  retention_days: number;
  total_rows: number;
  pos_stock_rows: number;
  oldest_row_at: string | null;
  newest_row_at: string | null;
  rows_past_retention: number;
  cutoff_at: string;
}

interface AuditRow {
  id: string;
  action: string;
  entity_type: string;
  entity_id: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
}

function formatDate(d: string | null): string {
  if (!d) return '—';
  return new Date(d).toLocaleString();
}

function daysBetween(from: string | null, to: Date): number | null {
  if (!from) return null;
  const ms = to.getTime() - new Date(from).getTime();
  return Math.floor(ms / (1000 * 60 * 60 * 24));
}

export default function PosAuditPage() {
  const status = useQuery({
    queryKey: ['audit-logs-retention-status'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('audit_logs_retention_status' as never);
      if (error) throw error;
      return data as unknown as RetentionStatus;
    },
    refetchInterval: 60_000,
  });

  const recent = useQuery({
    queryKey: ['audit-logs-pos-stock'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('audit_logs')
        .select('id, action, entity_type, entity_id, metadata, created_at')
        .in('action', ['pos.stock.decrement', 'pos.stock.increment'])
        .order('created_at', { ascending: false })
        .limit(50);
      if (error) throw error;
      return (data ?? []) as unknown as AuditRow[];
    },
    refetchInterval: 30_000,
  });

  const purgeRuns = useQuery({
    queryKey: ['audit-logs-purge-runs'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('audit_logs')
        .select('id, action, entity_type, entity_id, metadata, created_at')
        .eq('action', 'audit_logs.retention.purge')
        .order('created_at', { ascending: false })
        .limit(5);
      if (error) throw error;
      return (data ?? []) as unknown as AuditRow[];
    },
  });

  const oldestAge = status.data ? daysBetween(status.data.oldest_row_at, new Date()) : null;

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-semibold">POS Stock Audit & Retention</h1>
        <p className="text-muted-foreground">
          Verifies that every POS sale writes a row to <code className="text-xs bg-muted px-1 rounded">audit_logs</code> and
          that records older than <strong>2 years (730 days)</strong> are purged daily by the retention cron.
        </p>
      </div>

      {/* Retention status cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-2">
              <ShieldCheck className="h-4 w-4" /> POS-stock rows
            </CardDescription>
            <CardTitle className="text-3xl">
              {status.isLoading ? <Skeleton className="h-8 w-16" /> : status.data?.pos_stock_rows ?? 0}
            </CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground">
            Total POS lager-händelser i revisionsloggen
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-2">
              <Database className="h-4 w-4" /> Total audit rows
            </CardDescription>
            <CardTitle className="text-3xl">
              {status.isLoading ? <Skeleton className="h-8 w-16" /> : status.data?.total_rows ?? 0}
            </CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground">Alla actions i audit_logs</CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-2">
              <Clock className="h-4 w-4" /> Oldest row
            </CardDescription>
            <CardTitle className="text-lg">
              {status.isLoading ? <Skeleton className="h-6 w-24" /> : oldestAge !== null ? `${oldestAge} dagar gammal` : '—'}
            </CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground">
            {formatDate(status.data?.oldest_row_at ?? null)}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-2">
              <Trash2 className="h-4 w-4" /> Past retention
            </CardDescription>
            <CardTitle className="text-3xl">
              {status.isLoading ? (
                <Skeleton className="h-8 w-16" />
              ) : (
                <span className={status.data?.rows_past_retention ? 'text-amber-600' : 'text-green-600'}>
                  {status.data?.rows_past_retention ?? 0}
                </span>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground">
            Rader äldre än {status.data?.retention_days ?? 730} dagar (rensas 03:15 dagligen)
          </CardContent>
        </Card>
      </div>

      {/* Cron explanation */}
      <Alert>
        <ShieldCheck className="h-4 w-4" />
        <AlertTitle>Retention policy</AlertTitle>
        <AlertDescription className="text-sm">
          Funktionen <code className="text-xs bg-muted px-1 rounded">purge_audit_logs_past_retention()</code> körs varje natt
          kl <strong>03:15</strong> via pg_cron och raderar audit-rader äldre än 730 dagar. Cutoff just nu:{' '}
          <strong>{formatDate(status.data?.cutoff_at ?? null)}</strong>.
        </AlertDescription>
      </Alert>

      {/* Recent purge runs */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Senaste retention-körningar</CardTitle>
          <CardDescription>Loggade som <code className="text-xs">audit_logs.retention.purge</code></CardDescription>
        </CardHeader>
        <CardContent>
          {purgeRuns.isLoading ? (
            <Skeleton className="h-20 w-full" />
          ) : purgeRuns.data && purgeRuns.data.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Tidpunkt</TableHead>
                  <TableHead className="text-right">Raderade rader</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {purgeRuns.data.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell className="text-sm">{formatDate(row.created_at)}</TableCell>
                    <TableCell className="text-right font-mono">
                      {(row.metadata as { deleted_rows?: number })?.deleted_rows ?? 0}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <p className="text-sm text-muted-foreground">
              Inga rensningar har körts ännu — cron schemalagd 03:15 dagligen.
            </p>
          )}
        </CardContent>
      </Card>

      {/* Recent POS stock audit rows */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Senaste POS lager-händelser (audit trail)</CardTitle>
          <CardDescription>50 senaste raderna med action <code className="text-xs">pos.stock.*</code></CardDescription>
        </CardHeader>
        <CardContent>
          {recent.isLoading ? (
            <Skeleton className="h-40 w-full" />
          ) : recent.data && recent.data.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Tidpunkt</TableHead>
                  <TableHead>Action</TableHead>
                  <TableHead>Produkt</TableHead>
                  <TableHead className="text-right">Δ Antal</TableHead>
                  <TableHead>Källa</TableHead>
                  <TableHead>Sale</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {recent.data.map((row) => {
                  const m = (row.metadata ?? {}) as {
                    quantity_delta?: number;
                    source?: string;
                    sale_id?: string;
                  };
                  const isDecrement = row.action === 'pos.stock.decrement';
                  return (
                    <TableRow key={row.id}>
                      <TableCell className="text-xs whitespace-nowrap">{formatDate(row.created_at)}</TableCell>
                      <TableCell>
                        <Badge variant={isDecrement ? 'secondary' : 'default'} className="text-xs">
                          {row.action.replace('pos.stock.', '')}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs font-mono">{row.entity_id?.slice(0, 8) ?? '—'}</TableCell>
                      <TableCell
                        className={`text-right font-mono ${isDecrement ? 'text-red-600' : 'text-green-600'}`}
                      >
                        {(m.quantity_delta ?? 0) > 0 ? '+' : ''}
                        {m.quantity_delta ?? 0}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">{m.source ?? '—'}</TableCell>
                      <TableCell className="text-xs font-mono">{m.sale_id?.slice(0, 8) ?? '—'}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          ) : (
            <p className="text-sm text-muted-foreground">
              Inga POS lager-händelser ännu. Gör en försäljning i <a href="/admin/pos" className="underline">/admin/pos</a> så
              dyker raderna upp här inom sekunder.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
