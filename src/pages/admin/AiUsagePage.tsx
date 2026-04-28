import { useMemo, useState } from 'react';
import { format } from 'date-fns';
import { Activity, AlertCircle, Cpu, TrendingUp, Zap } from 'lucide-react';
import { AdminLayout } from '@/components/admin/AdminLayout';
import { AdminPageContainer } from '@/components/admin/AdminPageContainer';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid,
} from 'recharts';
import { useAiUsageLogs, useAiUsageSummary, type AiUsageRow } from '@/hooks/useAiUsage';

const RANGE_OPTIONS = [
  { value: '1', label: 'Last 24 hours' },
  { value: '7', label: 'Last 7 days' },
  { value: '30', label: 'Last 30 days' },
  { value: '90', label: 'Last 90 days' },
];

function formatNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}

function StatusBadge({ status }: { status: string }) {
  if (status === 'success') return <Badge variant="outline" className="text-green-600 border-green-600/30">success</Badge>;
  if (status === 'rate_limited') return <Badge variant="outline" className="text-amber-600 border-amber-600/30">rate-limited</Badge>;
  if (status === 'payment_required') return <Badge variant="outline" className="text-red-600 border-red-600/30">payment</Badge>;
  return <Badge variant="outline" className="text-red-600 border-red-600/30">{status}</Badge>;
}

export default function AiUsagePage() {
  const [days, setDays] = useState('7');
  const [sourceFilter, setSourceFilter] = useState<string>('all');
  const [modelFilter, setModelFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');

  const summary = useAiUsageSummary(parseInt(days, 10));

  const since = useMemo(
    () => new Date(Date.now() - parseInt(days, 10) * 86_400_000).toISOString(),
    [days],
  );

  const logs = useAiUsageLogs({
    from: since,
    sources: sourceFilter !== 'all' ? [sourceFilter] : undefined,
    models: modelFilter !== 'all' ? [modelFilter] : undefined,
    status: statusFilter !== 'all' ? statusFilter : undefined,
    limit: 300,
  });

  const sourceOptions = summary.data?.bySource.map((s) => s.source) || [];
  const modelOptions = summary.data?.byModel.map((m) => m.model) || [];

  return (
    <AdminLayout>
      <AdminPageContainer>
        <div className="flex items-center justify-between gap-4 mb-6">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-foreground">AI Usage</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Token consumption across all AI calls — chat, FlowPilot, workspace chat and more.
            </p>
          </div>
          <Tabs value={days} onValueChange={setDays}>
            <TabsList>
              {RANGE_OPTIONS.map((r) => (
                <TabsTrigger key={r.value} value={r.value}>{r.label}</TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
        </div>

        {/* Summary cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <SummaryCard
            label="Total tokens"
            icon={<Zap className="h-4 w-4 text-muted-foreground" />}
            value={summary.isLoading ? null : formatNumber(summary.data?.totalTokens || 0)}
            sub={summary.data ? `${formatNumber(summary.data.promptTokens)} in / ${formatNumber(summary.data.completionTokens)} out` : ''}
          />
          <SummaryCard
            label="Requests"
            icon={<Activity className="h-4 w-4 text-muted-foreground" />}
            value={summary.isLoading ? null : formatNumber(summary.data?.totalRequests || 0)}
            sub={summary.data ? `${(summary.data.errorRate * 100).toFixed(1)}% errors` : ''}
          />
          <SummaryCard
            label="Top model"
            icon={<Cpu className="h-4 w-4 text-muted-foreground" />}
            value={summary.isLoading ? null : (summary.data?.byModel[0]?.model || '—')}
            sub={summary.data?.byModel[0] ? `${formatNumber(summary.data.byModel[0].tokens)} tokens` : ''}
          />
          <SummaryCard
            label="Top source"
            icon={<TrendingUp className="h-4 w-4 text-muted-foreground" />}
            value={summary.isLoading ? null : (summary.data?.bySource[0]?.source || '—')}
            sub={summary.data?.bySource[0] ? `${formatNumber(summary.data.bySource[0].tokens)} tokens` : ''}
          />
        </div>

        {/* Daily chart */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="text-base">Tokens per day</CardTitle>
            <CardDescription>Stacked daily token consumption</CardDescription>
          </CardHeader>
          <CardContent>
            {summary.isLoading ? (
              <Skeleton className="h-64" />
            ) : !summary.data?.byDay.length ? (
              <div className="h-64 flex items-center justify-center text-sm text-muted-foreground">
                No usage data yet. Make a chat request and come back.
              </div>
            ) : (
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={summary.data.byDay}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="day" stroke="hsl(var(--muted-foreground))" fontSize={11} />
                    <YAxis stroke="hsl(var(--muted-foreground))" fontSize={11} tickFormatter={formatNumber} />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: 'hsl(var(--card))',
                        border: '1px solid hsl(var(--border))',
                        borderRadius: '6px',
                        fontSize: '12px',
                      }}
                      formatter={(v: any) => formatNumber(Number(v))}
                    />
                    <Bar dataKey="tokens" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Two-column breakdown */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
          <BreakdownCard title="By model" rows={summary.data?.byModel.slice(0, 8) || []} keyField="model" loading={summary.isLoading} />
          <BreakdownCard title="By source" rows={summary.data?.bySource.slice(0, 8) || []} keyField="source" loading={summary.isLoading} />
        </div>

        {/* Filters + log */}
        <Card>
          <CardHeader>
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <CardTitle className="text-base">Recent requests</CardTitle>
                <CardDescription>Latest 300 calls in selected range</CardDescription>
              </div>
              <div className="flex flex-wrap gap-2">
                <Select value={sourceFilter} onValueChange={setSourceFilter}>
                  <SelectTrigger className="w-[180px] h-9"><SelectValue placeholder="Source" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All sources</SelectItem>
                    {sourceOptions.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Select value={modelFilter} onValueChange={setModelFilter}>
                  <SelectTrigger className="w-[180px] h-9"><SelectValue placeholder="Model" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All models</SelectItem>
                    {modelOptions.map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger className="w-[140px] h-9"><SelectValue placeholder="Status" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All statuses</SelectItem>
                    <SelectItem value="success">success</SelectItem>
                    <SelectItem value="error">error</SelectItem>
                    <SelectItem value="rate_limited">rate-limited</SelectItem>
                    <SelectItem value="payment_required">payment</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {logs.isLoading ? (
              <div className="space-y-2">
                {[...Array(8)].map((_, i) => <Skeleton key={i} className="h-10" />)}
              </div>
            ) : !logs.data?.length ? (
              <div className="py-12 text-center text-sm text-muted-foreground flex flex-col items-center gap-2">
                <AlertCircle className="h-5 w-5" />
                No matching requests in this range.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Time</TableHead>
                      <TableHead>Source</TableHead>
                      <TableHead>Provider</TableHead>
                      <TableHead>Model</TableHead>
                      <TableHead className="text-right">Prompt</TableHead>
                      <TableHead className="text-right">Completion</TableHead>
                      <TableHead className="text-right">Total</TableHead>
                      <TableHead className="text-right">Latency</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {logs.data.map((row: AiUsageRow) => (
                      <TableRow key={row.id} className="text-xs">
                        <TableCell className="whitespace-nowrap text-muted-foreground">
                          {format(new Date(row.created_at), 'MMM d HH:mm:ss')}
                        </TableCell>
                        <TableCell>
                          <code className="text-[11px] bg-muted px-1.5 py-0.5 rounded">{row.source}</code>
                        </TableCell>
                        <TableCell className="text-muted-foreground">{row.provider || '—'}</TableCell>
                        <TableCell className="text-muted-foreground">{row.model || '—'}</TableCell>
                        <TableCell className="text-right tabular-nums">{formatNumber(row.prompt_tokens)}</TableCell>
                        <TableCell className="text-right tabular-nums">{formatNumber(row.completion_tokens)}</TableCell>
                        <TableCell className="text-right tabular-nums font-medium">{formatNumber(row.total_tokens)}</TableCell>
                        <TableCell className="text-right tabular-nums text-muted-foreground">
                          {row.latency_ms != null ? `${row.latency_ms}ms` : '—'}
                        </TableCell>
                        <TableCell><StatusBadge status={row.status} /></TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </AdminPageContainer>
    </AdminLayout>
  );
}

function SummaryCard({ label, icon, value, sub }: { label: string; icon: React.ReactNode; value: string | null; sub?: string }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardDescription className="flex items-center gap-1.5 text-xs">{icon}{label}</CardDescription>
      </CardHeader>
      <CardContent>
        {value === null ? (
          <Skeleton className="h-7 w-24" />
        ) : (
          <div className="text-2xl font-semibold tabular-nums truncate">{value}</div>
        )}
        {sub && <div className="text-xs text-muted-foreground mt-1 truncate">{sub}</div>}
      </CardContent>
    </Card>
  );
}

function BreakdownCard({
  title, rows, keyField, loading,
}: {
  title: string;
  rows: Array<{ tokens: number; requests: number } & Record<string, any>>;
  keyField: string;
  loading?: boolean;
}) {
  const max = rows.reduce((m, r) => Math.max(m, r.tokens), 0);
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="space-y-2">{[...Array(5)].map((_, i) => <Skeleton key={i} className="h-6" />)}</div>
        ) : !rows.length ? (
          <div className="text-sm text-muted-foreground py-4">No data</div>
        ) : (
          <div className="space-y-2">
            {rows.map((r) => {
              const pct = max ? (r.tokens / max) * 100 : 0;
              return (
                <div key={r[keyField]} className="space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-medium truncate">{r[keyField]}</span>
                    <span className="text-muted-foreground tabular-nums">
                      {formatNumber(r.tokens)} · {r.requests} req
                    </span>
                  </div>
                  <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                    <div className="h-full bg-primary rounded-full" style={{ width: `${pct}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
