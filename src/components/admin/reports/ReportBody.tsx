import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { AlertTriangle, CheckCircle2, Info, XCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { parseReport, type ReportSegment } from '@/lib/report-blocks';

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
