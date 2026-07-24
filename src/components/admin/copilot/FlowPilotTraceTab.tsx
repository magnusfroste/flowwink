/**
 * FlowPilot → Trace tab
 *
 * Read-only view over the harness Trace read model. Groups agent_activity rows
 * by trace_id into runs (heartbeat / cron / chat / mcp / flowpilot / automation).
 * Backend: `get_agent_trace` skill via agent-execute.
 */

import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Activity, ChevronRight, Copy, Check, ExternalLink } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { cn } from '@/lib/utils';
import { callSkill } from '@/lib/call-skill';
import { logger } from '@/lib/logger';
import { toast } from 'sonner';

// -----------------------------------------------------------------------------
// Types (mirror _shared/trace/read-model.ts)
// -----------------------------------------------------------------------------

type Health = 'ok' | 'degraded' | 'failed';
type Lifecycle = 'running' | 'paused' | 'completed' | 'failed';

interface TraceRunSummary {
  trace_id: string;
  agent: string;
  started_at: string;
  ended_at: string;
  duration_ms: number;
  step_count: number;
  failed_count: number;
  health: Health;
  skills: string[];
  lifecycle?: string;
  paused_reason?: string | null;
  cursor?: number | null;
}

interface TraceStep {
  id: string;
  skill_name: string | null;
  status: 'success' | 'failed' | string;
  input: Record<string, unknown> | null;
  output: Record<string, unknown> | null;
  error_message: string | null;
  duration_ms: number | null;
  outcome_status: string | null;
  approval_request_id: string | null;
  created_at: string;
}

interface TraceRunDetail extends TraceRunSummary {
  steps: TraceStep[];
}

// -----------------------------------------------------------------------------
// Formatting helpers
// -----------------------------------------------------------------------------

function relTime(iso: string): string {
  const d = Date.now() - new Date(iso).getTime();
  const s = Math.round(d / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 48) return `${h}h ago`;
  return `${Math.round(h / 24)}d ago`;
}

function fmtDuration(ms: number | null | undefined): string {
  if (ms == null) return '—';
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  return `${(ms / 60_000).toFixed(1)}m`;
}

const HEALTH_STYLES: Record<Health, string> = {
  ok: 'bg-success',
  degraded: 'bg-warning',
  failed: 'bg-destructive',
};

function HealthDot({ health, className }: { health: Health; className?: string }) {
  return (
    <span
      aria-label={health}
      className={cn('inline-block h-2.5 w-2.5 rounded-full shrink-0', HEALTH_STYLES[health], className)}
    />
  );
}

function AgentChip({ agent }: { agent: string }) {
  return (
    <Badge variant="secondary" className="font-mono text-[10px] uppercase tracking-wide">
      {agent}
    </Badge>
  );
}

function lifecycleOf(run: { lifecycle?: string; health?: Health }): Lifecycle {
  const l = run.lifecycle;
  if (l === 'running' || l === 'paused' || l === 'completed' || l === 'failed') return l;
  return run.health === 'failed' ? 'failed' : 'completed';
}

const LIFECYCLE_STYLES: Record<Lifecycle, string> = {
  running: 'border-primary/40 bg-primary/10 text-primary animate-pulse',
  paused: 'border-warning/40 bg-warning/10 text-warning',
  completed: 'border-border bg-muted text-muted-foreground',
  failed: 'border-destructive/40 bg-destructive/10 text-destructive',
};

const LIFECYCLE_LABELS: Record<Lifecycle, string> = {
  running: 'Running',
  paused: 'Paused',
  completed: 'Completed',
  failed: 'Failed',
};

function LifecycleBadge({ lifecycle }: { lifecycle: Lifecycle }) {
  return (
    <Badge variant="outline" className={cn('text-[10px] px-1.5 py-0', LIFECYCLE_STYLES[lifecycle])}>
      {LIFECYCLE_LABELS[lifecycle]}
    </Badge>
  );
}

/** Secondary line for a paused run: why it paused and how far it got. */
function PausedLine({ run }: { run: TraceRunSummary }) {
  return (
    <div className="mt-1.5 text-[11px] text-warning">
      Paused · {run.paused_reason ?? 'awaiting continuation'} · step {run.cursor ?? 0}/{run.step_count}
    </div>
  );
}

// -----------------------------------------------------------------------------
// Data hooks
// -----------------------------------------------------------------------------

const AGENTS = ['all', 'heartbeat', 'cron', 'chat', 'mcp', 'flowpilot', 'automation'] as const;
type AgentFilter = typeof AGENTS[number];
const LIFECYCLES = ['all', 'running', 'paused', 'completed', 'failed'] as const;
type LifecycleFilter = typeof LIFECYCLES[number];
type WindowKey = '24' | '72' | '168';

function useRuns(agent: AgentFilter, windowHours: WindowKey) {
  return useQuery({
    queryKey: ['agent-trace', 'runs', agent, windowHours],
    queryFn: async () => {
      const args: Record<string, unknown> = {
        limit: 40,
        since_hours: Number(windowHours),
      };
      if (agent !== 'all') args.agent = agent;
      try {
        const res = await callSkill<{ runs: TraceRunSummary[] }>('get_agent_trace', args);
        return res.runs ?? [];
      } catch (e) {
        logger.error('[Trace] failed to list runs', e);
        throw e;
      }
    },
    refetchInterval: 30_000,
  });
}

function useRunDetail(traceId: string | null) {
  return useQuery({
    queryKey: ['agent-trace', 'run', traceId],
    queryFn: async () => {
      if (!traceId) return null;
      try {
        const res = await callSkill<{ run: TraceRunDetail | null }>('get_agent_trace', { trace_id: traceId });
        return res.run;
      } catch (e) {
        logger.error('[Trace] failed to load run', e);
        throw e;
      }
    },
    enabled: !!traceId,
  });
}

// -----------------------------------------------------------------------------
// Step card
// -----------------------------------------------------------------------------

function CopyButton({ payload }: { payload: unknown }) {
  const [copied, setCopied] = useState(false);
  return (
    <Button
      size="sm"
      variant="ghost"
      className="h-7 gap-1.5 text-xs"
      onClick={async (e) => {
        e.stopPropagation();
        try {
          await navigator.clipboard.writeText(JSON.stringify(payload, null, 2));
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        } catch {
          toast.error('Copy failed');
        }
      }}
    >
      {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
      {copied ? 'Copied' : 'Copy'}
    </Button>
  );
}

function JsonBlock({ label, payload }: { label: string; payload: unknown }) {
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
          {label}
        </span>
        <CopyButton payload={payload} />
      </div>
      <pre className="max-h-72 overflow-auto rounded-md border bg-muted/30 p-2 font-mono text-[11px] leading-relaxed">
        {payload == null ? '—' : JSON.stringify(payload, null, 2)}
      </pre>
    </div>
  );
}

function StepRow({ step, index }: { step: TraceStep; index: number }) {
  const [open, setOpen] = useState(false);
  const failed = step.status === 'failed';

  return (
    <div className="relative pl-6">
      {/* Timeline rail */}
      <span
        className={cn(
          'absolute left-2 top-2 h-2 w-2 rounded-full ring-4 ring-background',
          failed ? 'bg-destructive' : 'bg-success',
        )}
      />
      <span className="absolute left-[11px] top-4 bottom-0 w-px bg-border" />

      <Collapsible open={open} onOpenChange={setOpen}>
        <CollapsibleTrigger asChild>
          <button
            type="button"
            className="w-full text-left rounded-md border bg-card hover:bg-accent/40 transition-colors px-3 py-2"
          >
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[10px] tabular-nums text-muted-foreground w-6">
                {String(index + 1).padStart(2, '0')}
              </span>
              <span className="font-mono text-xs font-medium">
                {step.skill_name ?? '(no skill)'}
              </span>
              <Badge
                variant={failed ? 'destructive' : 'secondary'}
                className="text-[10px] px-1.5 py-0"
              >
                {step.status}
              </Badge>
              <span className="text-[11px] tabular-nums text-muted-foreground">
                {fmtDuration(step.duration_ms)}
              </span>
              {step.outcome_status && (
                <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                  outcome: {step.outcome_status}
                </Badge>
              )}
              {step.approval_request_id && (
                <Link
                  to="/admin/approvals"
                  onClick={(e) => e.stopPropagation()}
                  className="inline-flex"
                >
                  <Badge variant="outline" className="text-[10px] gap-1 px-1.5 py-0 hover:bg-accent">
                    escalated → approval
                    <ExternalLink className="h-2.5 w-2.5" />
                  </Badge>
                </Link>
              )}
              <span className="ml-auto text-[11px] text-muted-foreground">
                {relTime(step.created_at)}
              </span>
              <ChevronRight
                className={cn(
                  'h-3.5 w-3.5 text-muted-foreground transition-transform',
                  open && 'rotate-90',
                )}
              />
            </div>
            {step.error_message && (
              <div className="mt-1 text-[11px] text-destructive font-mono truncate">
                {step.error_message}
              </div>
            )}
          </button>
        </CollapsibleTrigger>
        <CollapsibleContent className="mt-2 space-y-3 rounded-md border bg-muted/10 p-3">
          <JsonBlock label="Input (verbatim)" payload={step.input} />
          <JsonBlock label="Output" payload={step.output} />
          {step.error_message && (
            <div className="space-y-1">
              <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                Error
              </span>
              <pre className="rounded-md border border-destructive/30 bg-destructive/5 p-2 font-mono text-[11px] text-destructive whitespace-pre-wrap">
                {step.error_message}
              </pre>
            </div>
          )}
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}

// -----------------------------------------------------------------------------
// Run detail panel
// -----------------------------------------------------------------------------

function RunDetailPanel({ traceId }: { traceId: string | null }) {
  const { data: run, isLoading, error } = useRunDetail(traceId);

  if (!traceId) {
    return (
      <div className="h-full flex items-center justify-center text-sm text-muted-foreground p-6 text-center">
        Select a run to inspect its ordered steps, inputs, and outputs.
      </div>
    );
  }

  if (isLoading) {
    return <div className="p-6 text-sm text-muted-foreground">Loading run…</div>;
  }
  if (error || !run) {
    return <div className="p-6 text-sm text-destructive">Run not found or failed to load.</div>;
  }

  return (
    <div className="flex flex-col h-full">
      <div className="border-b p-4 space-y-2 bg-background">
        <div className="flex items-center gap-2 flex-wrap">
          <HealthDot health={run.health} />
          <LifecycleBadge lifecycle={lifecycleOf(run)} />
          <span className="font-mono text-xs">{run.trace_id}</span>
          <AgentChip agent={run.agent} />
          <span className="text-xs text-muted-foreground">•</span>
          <span className="text-xs text-muted-foreground">{relTime(run.started_at)}</span>
        </div>
        {lifecycleOf(run) === 'paused' && <PausedLine run={run} />}
        <div className="flex items-center gap-4 text-xs text-muted-foreground tabular-nums">
          <span>{run.step_count} steps</span>
          <span>{run.failed_count} failed</span>
          <span>{fmtDuration(run.duration_ms)}</span>
        </div>
        {run.skills.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {run.skills.map((s) => (
              <Badge key={s} variant="outline" className="font-mono text-[10px] px-1.5 py-0">
                {s}
              </Badge>
            ))}
          </div>
        )}
      </div>

      <ScrollArea className="flex-1">
        <div className="p-4 space-y-3">
          {run.steps.map((s, i) => (
            <StepRow key={s.id} step={s} index={i} />
          ))}
        </div>
      </ScrollArea>
    </div>
  );
}

// -----------------------------------------------------------------------------
// Runs master list
// -----------------------------------------------------------------------------

function RunsList({
  runs,
  activeId,
  onSelect,
}: {
  runs: TraceRunSummary[];
  activeId: string | null;
  onSelect: (id: string) => void;
}) {
  if (runs.length === 0) {
    return (
      <div className="p-8 text-center text-sm text-muted-foreground">
        No traced runs in this window. Runs are recorded when FlowPilot's loop, a cron job,
        a chat turn, or a gateway session runs.
      </div>
    );
  }

  return (
    <div className="divide-y">
      {runs.map((r) => (
        <button
          key={r.trace_id}
          type="button"
          onClick={() => onSelect(r.trace_id)}
          className={cn(
            'w-full text-left px-4 py-3 hover:bg-accent/40 transition-colors',
            activeId === r.trace_id && 'bg-accent/60',
          )}
        >
          <div className="flex items-center gap-2 flex-wrap">
            <HealthDot health={r.health} />
            <LifecycleBadge lifecycle={lifecycleOf(r)} />
            <span className="font-mono text-xs">{r.trace_id}</span>
            <AgentChip agent={r.agent} />
            <span className="ml-auto text-[11px] text-muted-foreground">
              {relTime(r.started_at)}
            </span>
          </div>
          {lifecycleOf(r) === 'paused' && <PausedLine run={r} />}
          <div className="mt-1.5 flex items-center gap-3 text-[11px] text-muted-foreground tabular-nums">
            <span>{r.step_count} steps</span>
            {r.failed_count > 0 && (
              <span className="text-destructive">{r.failed_count} failed</span>
            )}
            <span>{fmtDuration(r.duration_ms)}</span>
          </div>
          {r.skills.length > 0 && (
            <div className="mt-1.5 flex flex-wrap gap-1">
              {r.skills.slice(0, 6).map((s) => (
                <span
                  key={s}
                  className="font-mono text-[10px] px-1 py-0.5 rounded bg-muted text-muted-foreground"
                >
                  {s}
                </span>
              ))}
              {r.skills.length > 6 && (
                <span className="text-[10px] text-muted-foreground">
                  +{r.skills.length - 6}
                </span>
              )}
            </div>
          )}
        </button>
      ))}
    </div>
  );
}

// -----------------------------------------------------------------------------
// Main tab
// -----------------------------------------------------------------------------

export function FlowPilotTraceTab() {
  const [agent, setAgent] = useState<AgentFilter>('all');
  const [lifecycle, setLifecycle] = useState<LifecycleFilter>('all');
  const [windowHours, setWindowHours] = useState<WindowKey>('72');
  const [activeId, setActiveId] = useState<string | null>(null);

  const { data: allRuns = [], isLoading, error } = useRuns(agent, windowHours);

  // Lifecycle filtering is client-side — the fields ride along on the same payload.
  const runs = useMemo(
    () => (lifecycle === 'all' ? allRuns : allRuns.filter((r) => lifecycleOf(r) === lifecycle)),
    [allRuns, lifecycle],
  );

  // Auto-select first run when list loads and nothing is selected
  const firstId = runs[0]?.trace_id ?? null;
  useMemo(() => {
    if (!activeId && firstId) setActiveId(firstId);
  }, [firstId, activeId]);

  return (
    <ScrollArea className="h-full">
      <div className="p-4 max-w-7xl mx-auto space-y-4">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Activity className="h-4 w-4 text-primary" />
              Trace
            </CardTitle>
            <CardDescription>
              One coherent view per autonomous run. Groups activity rows by trace_id across
              heartbeat, cron, chat, and gateway sessions.
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">Agent</span>
                <Select value={agent} onValueChange={(v) => setAgent(v as AgentFilter)}>
                  <SelectTrigger className="h-8 w-[140px] text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {AGENTS.map((a) => (
                      <SelectItem key={a} value={a} className="text-xs">
                        {a === 'all' ? 'All agents' : a}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">Window</span>
                <ToggleGroup
                  type="single"
                  size="sm"
                  value={windowHours}
                  onValueChange={(v) => v && setWindowHours(v as WindowKey)}
                >
                  <ToggleGroupItem value="24" className="h-8 px-3 text-xs">24h</ToggleGroupItem>
                  <ToggleGroupItem value="72" className="h-8 px-3 text-xs">72h</ToggleGroupItem>
                  <ToggleGroupItem value="168" className="h-8 px-3 text-xs">7d</ToggleGroupItem>
                </ToggleGroup>
              </div>
              <div className="ml-auto text-[11px] text-muted-foreground tabular-nums">
                {runs.length} run{runs.length === 1 ? '' : 's'}
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)] gap-4 min-h-[600px]">
          <Card className="overflow-hidden">
            <ScrollArea className="h-[70vh]">
              {isLoading ? (
                <div className="p-6 text-sm text-muted-foreground">Loading runs…</div>
              ) : error ? (
                <div className="p-6 text-sm text-destructive">Failed to load runs.</div>
              ) : (
                <RunsList runs={runs} activeId={activeId} onSelect={setActiveId} />
              )}
            </ScrollArea>
          </Card>

          <Card className="overflow-hidden">
            <div className="h-[70vh]">
              <RunDetailPanel traceId={activeId} />
            </div>
          </Card>
        </div>
      </div>
    </ScrollArea>
  );
}
