import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { AlertTriangle, CheckCircle2, Info, Loader2, Radio, RefreshCw, XCircle } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { usePlatformFormat } from '@/hooks/usePlatformFormat';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { parseReport, resolvePath, type LiveSpec, type ReportSegment } from '@/lib/report-blocks';

/**
 * Draws a report: markdown with the AgentReports blocks (::kpis, ::note,
 * ::details, ```chart), or a full HTML page in a sandboxed frame — its
 * scripts run, but it has no origin: no session, no cookies, no admin API.
 */
export function ReportBody({ format, content }: { format: 'markdown' | 'html'; content: string }) {
  if (format === 'html') {
    return (
      <iframe
        title="Report"
        sandbox="allow-scripts"
        srcDoc={content}
        className="h-[80vh] w-full rounded-lg border border-border bg-background"
      />
    );
  }
  return (
    <article className="space-y-5">
      {parseReport(content).map((seg, i) => <Segment key={i} seg={seg} />)}
    </article>
  );
}

const SERIES = ['hsl(var(--primary))', 'hsl(var(--chart-2, 173 58% 39%))', 'hsl(var(--chart-3, 27 87% 57%))', 'hsl(var(--chart-4, 280 65% 60%))', 'hsl(var(--chart-5, 340 75% 55%))'];

function Segment({ seg }: { seg: ReportSegment }) {
  switch (seg.kind) {
    case 'markdown':
      return (
        <div className="prose prose-sm max-w-none dark:prose-invert prose-headings:font-serif prose-table:text-sm">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{seg.text}</ReactMarkdown>
        </div>
      );
    case 'kpis':
      return (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {seg.items.map((k, i) => (
            <div key={i} className="rounded-lg border border-border bg-card p-4">
              <div className="text-2xl font-semibold tabular-nums">{k.value}</div>
              <div className="text-sm text-muted-foreground">{k.label}</div>
              {k.detail && <div className="mt-1 text-xs text-muted-foreground">{k.detail}</div>}
            </div>
          ))}
        </div>
      );
    case 'note': {
      const Icon = seg.tone === 'warn' ? AlertTriangle : seg.tone === 'bad' ? XCircle : seg.tone === 'ok' ? CheckCircle2 : Info;
      return (
        <div className={cn('flex gap-3 rounded-lg border p-4 text-sm',
          seg.tone === 'warn' && 'border-warning/40 bg-warning/10',
          seg.tone === 'bad' && 'border-destructive/40 bg-destructive/10',
          seg.tone === 'ok' && 'border-success/40 bg-success/10',
          seg.tone === 'info' && 'border-border bg-muted/40')}>
          <Icon className="mt-0.5 h-4 w-4 shrink-0" />
          <div className="prose prose-sm max-w-none dark:prose-invert"><ReactMarkdown remarkPlugins={[remarkGfm]}>{seg.text}</ReactMarkdown></div>
        </div>
      );
    }
    case 'details':
      return (
        <details className="rounded-lg border border-border p-4 text-sm">
          <summary className="cursor-pointer font-medium">{seg.summary}</summary>
          <div className="prose prose-sm mt-3 max-w-none dark:prose-invert"><ReactMarkdown remarkPlugins={[remarkGfm]}>{seg.text}</ReactMarkdown></div>
        </details>
      );
    case 'live':
      return <LiveBlock spec={seg.spec} />;
    case 'invalid':
      return (
        <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-sm">
          <div className="font-medium">A live block the reader cannot draw</div>
          <ul className="mt-1 list-disc pl-5 text-muted-foreground">{seg.errors.map((e) => <li key={e}>{e}</li>)}</ul>
        </div>
      );
    case 'chart': {
      const Chart = seg.type === 'line' ? LineChart : BarChart;
      return (
        <figure className="rounded-lg border border-border p-4">
          {seg.title && <figcaption className="mb-3 text-sm font-medium">{seg.title}{seg.unit ? ` (${seg.unit})` : ''}</figcaption>}
          <div className="h-72 w-full">
            <ResponsiveContainer>
              <Chart data={seg.rows}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                <XAxis dataKey={seg.axis} tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 12 }} width={70} />
                <Tooltip />
                {seg.series.length > 1 && <Legend />}
                {seg.series.map((s, i) => seg.type === 'line'
                  ? <Line key={s} type="monotone" dataKey={s} stroke={SERIES[i % SERIES.length]} strokeWidth={2} dot={false} />
                  : <Bar key={s} dataKey={s} fill={SERIES[i % SERIES.length]} stackId={seg.type === 'stacked' ? 'a' : undefined} />)}
              </Chart>
            </ResponsiveContainer>
          </div>
        </figure>
      );
    }
  }
}

/**
 * A live block: one READ skill, run as the person reading (agent-execute with
 * read_only — anything but a read is refused server-side), drawn as kpis, a
 * chart or a table. The role matrix decides what the figures may show.
 */
function LiveBlock({ spec }: { spec: LiveSpec }) {
  const { formatNumber, formatDateTime } = usePlatformFormat();
  const q = useQuery({
    queryKey: ['report-live', spec.skill, JSON.stringify(spec.args)],
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke('agent-execute', {
        body: { skill_name: spec.skill, arguments: spec.args, agent_type: 'admin_ui', read_only: true },
      });
      if (error) {
        // A refusal (403: the reader's role lacks the skill's module) carries
        // its reason in the body; the client's own message only says "non-2xx".
        const body = await (error as { context?: Response }).context?.json?.().catch(() => null);
        const reason = String(body?.error ?? body?.hint ?? error.message).replace(/^Forbidden:\s*/, '');
        throw new Error(reason);
      }
      if (data?.status === 'refused') throw new Error(String(data.hint ?? data.code));
      if (data?.status && data.status !== 'success') throw new Error(String(data?.result?.error ?? data?.error ?? 'failed'));
      const result = data?.result ?? data;
      if (result && typeof result === 'object' && 'error' in result && result.error) throw new Error(String(result.error));
      return { result, at: new Date().toISOString() };
    },
  });
  const show = (v: unknown, unit?: string, divide?: number) => {
    if (v === null || v === undefined || v === '') return '—';
    const n = typeof v === 'number' ? v : Number(v);
    if (typeof v !== 'boolean' && Number.isFinite(n) && String(v).trim() !== '') return `${formatNumber(divide ? n / divide : n)}${unit ? ` ${unit}` : ''}`;
    return `${String(v)}${unit ? ` ${unit}` : ''}`;
  };
  const toNum = (v: unknown, divide?: number) => { const n = Number(v); return Number.isFinite(n) ? (divide ? n / divide : n) : 0; };

  return (
    <section className="rounded-lg border border-border p-4" aria-label={spec.title ?? `Live: ${spec.skill}`}>
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-sm font-medium">
          <Radio className="h-3.5 w-3.5 text-primary" />
          {spec.title ?? spec.skill}
        </div>
        <div className="flex items-center gap-1 text-xs text-muted-foreground">
          {q.data && <span>as of {formatDateTime(q.data.at)}</span>}
          <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => q.refetch()} disabled={q.isFetching} aria-label="Refresh">
            <RefreshCw className={cn('h-3 w-3', q.isFetching && 'animate-spin')} />
          </Button>
        </div>
      </div>
      {q.isLoading ? <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        : q.isError ? <p className="text-sm text-destructive">Could not fetch the figures: {(q.error as Error).message}</p>
          : (
            <div className="space-y-4">
              {spec.kpis && (
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {spec.kpis.map((k) => (
                    <div key={k.path} className="rounded-lg border border-border bg-card p-4">
                      <div className="text-2xl font-semibold tabular-nums">{show(resolvePath(q.data?.result, k.path), k.unit, k.divide)}</div>
                      <div className="text-sm text-muted-foreground">{k.label}</div>
                    </div>
                  ))}
                </div>
              )}
              {spec.chart && (() => {
                const c = spec.chart!;
                const list = resolvePath(q.data?.result, c.rows);
                const rows = Array.isArray(list) ? list.map((r) => ({
                  [c.axis]: String(resolvePath(r, c.axis) ?? ''),
                  ...Object.fromEntries(c.series.map((s) => [s, toNum(resolvePath(r, s), c.divide)])),
                })) : [];
                if (!rows.length) return <p className="text-sm text-muted-foreground">No rows at <code>{c.rows}</code>.</p>;
                const Chart = c.type === 'line' ? LineChart : BarChart;
                return (
                  <figure>
                    {c.title && <figcaption className="mb-2 text-sm">{c.title}{c.unit ? ` (${c.unit})` : ''}</figcaption>}
                    <div className="h-64 w-full">
                      <ResponsiveContainer>
                        <Chart data={rows}>
                          <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                          <XAxis dataKey={c.axis} tick={{ fontSize: 12 }} />
                          <YAxis tick={{ fontSize: 12 }} width={70} />
                          <Tooltip />
                          {c.series.length > 1 && <Legend />}
                          {c.series.map((s, i) => c.type === 'line'
                            ? <Line key={s} type="monotone" dataKey={s} stroke={SERIES[i % SERIES.length]} strokeWidth={2} dot={false} />
                            : <Bar key={s} dataKey={s} fill={SERIES[i % SERIES.length]} stackId={c.type === 'stacked' ? 'a' : undefined} />)}
                        </Chart>
                      </ResponsiveContainer>
                    </div>
                  </figure>
                );
              })()}
              {spec.table && (() => {
                const t = spec.table!;
                const list = resolvePath(q.data?.result, t.rows);
                const rows = Array.isArray(list) ? list.slice(0, t.limit ?? 25) : [];
                if (!rows.length) return <p className="text-sm text-muted-foreground">Nothing at <code>{t.rows}</code> right now.</p>;
                return (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead><tr className="border-b border-border text-left text-muted-foreground">{t.columns.map((col) => <th key={col.path} className="py-1.5 pr-4 font-medium">{col.label}</th>)}</tr></thead>
                      <tbody>
                        {rows.map((r, i) => (
                          <tr key={i} className="border-b border-border/60">
                            {t.columns.map((col) => <td key={col.path} className="py-1.5 pr-4 tabular-nums">{show(resolvePath(r, col.path), col.unit, col.divide)}</td>)}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                );
              })()}
            </div>
          )}
    </section>
  );
}
