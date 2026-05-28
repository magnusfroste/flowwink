import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  FlaskConical, Play, CheckCircle2, XCircle, Clock, Loader2, Search,
  ExternalLink, Terminal, BookOpen, Layers, Boxes, Bot, Shield,
  History, Info, RefreshCw, ChevronDown, HeartPulse,
} from 'lucide-react';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { AdminLayout } from '@/components/admin/AdminLayout';
import { AdminPageHeader } from '@/components/admin/AdminPageHeader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { toast } from 'sonner';
import { Link } from 'react-router-dom';
import { getAllSuites, type TestSuite, type TestScope } from '@/lib/platform-tests/registry';
import { useModules } from '@/hooks/useModules';
import { bootstrapModule } from '@/lib/module-bootstrap';
import { InstanceHealthCard } from '@/components/admin/InstanceHealthCard';
import { useLatestTestRuns, useSuiteRunHistory, formatRelativeTime, type PlatformTestRun } from '@/hooks/usePlatformTestRuns';
import { useQueryClient } from '@tanstack/react-query';

interface CheckResult {
  suite: string;
  name: string;
  status: 'pass' | 'fail' | 'skip';
  duration_ms: number;
  error?: string;
}

interface SuiteRunState {
  status: 'idle' | 'running' | 'done';
  results?: CheckResult[];
  summary?: { total: number; passed: number; failed: number; skipped: number; duration_ms: number };
  error?: string;
}

const SCOPE_META: Record<TestScope, { label: string; icon: typeof Layers; color: string }> = {
  platform:  { label: 'Platform',   icon: Layers,  color: 'bg-blue-500/10 text-blue-600 border-blue-500/30' },
  module:    { label: 'Module',     icon: Boxes,   color: 'bg-violet-500/10 text-violet-600 border-violet-500/30' },
  operator:  { label: 'Operator',   icon: Bot,     color: 'bg-emerald-500/10 text-emerald-600 border-emerald-500/30' },
  guardrail: { label: 'CI Guardrail', icon: Shield, color: 'bg-amber-500/10 text-amber-600 border-amber-500/30' },
};

export default function PlatformTestsPage() {
  const allSuites = useMemo(() => getAllSuites(), []);
  const [searchParams, setSearchParams] = useSearchParams();
  const initialScope = (searchParams.get('scope') as TestScope | null) ?? 'all';
  const [scopeFilter, setScopeFilter] = useState<'all' | TestScope>(
    ['all', 'platform', 'module', 'operator', 'guardrail'].includes(initialScope) ? initialScope as 'all' | TestScope : 'all',
  );
  const [search, setSearch] = useState('');
  const [runState, setRunState] = useState<Record<string, SuiteRunState>>({});

  // Keep URL in sync so deep links from the FlowPilot panel land on the right tab.
  useEffect(() => {
    const next = new URLSearchParams(searchParams);
    if (scopeFilter === 'all') next.delete('scope'); else next.set('scope', scopeFilter);
    if (next.toString() !== searchParams.toString()) setSearchParams(next, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scopeFilter]);

  const filtered = useMemo(() => {
    return allSuites.filter((s) => {
      if (scopeFilter !== 'all' && s.scope !== scopeFilter) return false;
      if (search) {
        const q = search.toLowerCase();
        const hay = `${s.title} ${s.description} ${s.module ?? ''} ${s.category}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [allSuites, scopeFilter, search]);

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: allSuites.length };
    for (const s of allSuites) c[s.scope] = (c[s.scope] ?? 0) + 1;
    return c;
  }, [allSuites]);

  const queryClient = useQueryClient();
  const { data: latestRuns } = useLatestTestRuns();
  const [historySuite, setHistorySuite] = useState<TestSuite | null>(null);

  const runSuite = async (suite: TestSuite) => {
    if (suite.run.mode !== 'edge') return;
    setRunState((prev) => ({ ...prev, [suite.id]: { status: 'running' } }));

    try {
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/${suite.run.function}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
          },
          body: JSON.stringify({
            ...(suite.run.payload ?? {}),
            // Tell the edge function HOW to log this run — so per-module suites
            // are grouped by their unique suite_id, not by the underlying
            // 'module_skills' generic implementation.
            loggedAs: {
              suite_id: suite.id,
              suite_title: suite.title,
              scope: suite.scope,
              category: suite.category,
              module: suite.module ? String(suite.module) : undefined,
            },
            triggered_by: 'ui',
          }),
        },
      );
      if (!response.ok) {
        const err = await response.json().catch(() => ({ error: `HTTP ${response.status}` }));
        throw new Error(err.error || `HTTP ${response.status}`);
      }
      const data = await response.json();
      setRunState((prev) => ({
        ...prev,
        [suite.id]: { status: 'done', results: data.results, summary: data.summary },
      }));
      // Refresh "Last run" badges so the new run appears without a page reload.
      queryClient.invalidateQueries({ queryKey: ['platform-test-runs-latest'] });
      if (data.summary?.failed === 0) {
        toast.success(`${suite.title}: ${data.summary.passed} checks passed`);
      } else {
        toast.error(`${suite.title}: ${data.summary?.failed ?? '?'} failed`);
      }
    } catch (err) {
      setRunState((prev) => ({
        ...prev,
        [suite.id]: { status: 'done', error: (err as Error).message },
      }));
      toast.error(`${suite.title}: ${(err as Error).message}`);
    }
  };

  const [bulkProgress, setBulkProgress] = useState<{ current: number; total: number; label: string } | null>(null);
  const runAllPlatform = async () => {
    const platformSuites = filtered.filter((s) => s.scope === 'platform' && s.run.mode === 'edge');
    if (platformSuites.length === 0) return;
    for (let i = 0; i < platformSuites.length; i++) {
      setBulkProgress({ current: i + 1, total: platformSuites.length, label: platformSuites[i].title });
      await runSuite(platformSuites[i]);
    }
    setBulkProgress(null);
  };

  const { data: modules } = useModules();
  const [reseeding, setReseeding] = useState<string | null>(null);

  const reseedModule = async (suite: TestSuite) => {
    if (!suite.module || !modules) return;
    setReseeding(suite.id);
    try {
      const result = await bootstrapModule(suite.module as never, modules);
      if (result.errors.length > 0) {
        toast.error(`Re-seed ${suite.module}: ${result.errors[0]}`);
      } else {
        toast.success(`Re-seeded ${result.seededSkills} skill(s) for ${suite.module}. Re-running test…`);
        await runSuite(suite);
      }
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setReseeding(null);
    }
  };

  const reseedAllFailing = async () => {
    if (!modules) return;
    const failing = Object.entries(runState)
      .filter(([, st]) => st.summary && st.summary.failed > 0)
      .map(([id]) => allSuites.find((s) => s.id === id))
      .filter((s): s is TestSuite => !!s && s.scope === 'module' && !!s.module);
    if (failing.length === 0) {
      toast.info('No failing module suites to re-seed. Run module tests first.');
      return;
    }
    for (const s of failing) {
      await reseedModule(s);
    }
  };

  // Aggregate stats for the header
  const aggregate = useMemo(() => {
    if (!latestRuns) return { tested: 0, failing: 0, never: filtered.length };
    let tested = 0, failing = 0, never = 0;
    for (const s of filtered) {
      const last = latestRuns.get(s.id);
      if (!last) never++;
      else {
        tested++;
        if (last.failed > 0) failing++;
      }
    }
    return { tested, failing, never };
  }, [filtered, latestRuns]);

  // Split suites: guardrails go into the dev-only collapsed zone, the rest
  // render as the main test list.
  const runnableSuites = filtered.filter((s) => s.scope !== 'guardrail');
  const guardrailSuites = allSuites.filter((s) => s.scope === 'guardrail');

  return (
    <AdminLayout>
      <div className="space-y-6">
        <AdminPageHeader
          title="Platform Tests"
          description="The single source of truth for every test in FlowWink — what we test, how to run it, and when it was last green."
        />

        {/* ── ZONE 1: Instance Health (always on top, the "is the site OK?" answer) ── */}
        <div className="rounded-lg border bg-card">
          <div className="px-4 pt-4 pb-2 flex items-center gap-2">
            <HeartPulse className="h-4 w-4 text-primary" />
            <h2 className="text-sm font-semibold">Instance Health</h2>
            <span className="text-xs text-muted-foreground ml-2">Quick diagnostic — run this first.</span>
          </div>
          <div className="px-4 pb-4">
            <InstanceHealthCard />
          </div>
        </div>

        {/* ── ZONE 2: Platform & Module test suites ── */}
        <div className="space-y-3">
          <div className="flex flex-col md:flex-row gap-3 md:items-center md:justify-between">
            <div>
              <h2 className="text-sm font-semibold flex items-center gap-2">
                <FlaskConical className="h-4 w-4 text-primary" /> Test Suites
              </h2>
              <p className="text-xs text-muted-foreground mt-0.5">
                <strong className="text-foreground">{aggregate.tested}</strong> with history ·{' '}
                <strong className={aggregate.failing > 0 ? 'text-destructive' : 'text-foreground'}>{aggregate.failing}</strong> failing ·{' '}
                <strong className="text-foreground">{aggregate.never}</strong> never run
              </p>
            </div>
            <div className="flex gap-2">
              <Button onClick={runAllPlatform} variant="default" size="sm" disabled={!!bulkProgress}>
                {bulkProgress ? (
                  <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> {bulkProgress.current}/{bulkProgress.total}…</>
                ) : (
                  <><Play className="h-4 w-4 mr-2" /> Run all platform</>
                )}
              </Button>
              <Button onClick={reseedAllFailing} variant="outline" size="sm" disabled={!!bulkProgress}>
                <RefreshCw className="h-4 w-4 mr-2" /> Re-seed failing
              </Button>
            </div>
          </div>

          {bulkProgress && (
            <Alert className="border-primary/40 bg-primary/5">
              <Loader2 className="h-4 w-4 animate-spin text-primary" />
              <AlertDescription className="text-sm flex items-center justify-between gap-3">
                <span>
                  Running suite <strong>{bulkProgress.current}</strong> of <strong>{bulkProgress.total}</strong>:{' '}
                  <span className="font-mono">{bulkProgress.label}</span>
                </span>
                <div className="w-40 h-1.5 bg-primary/15 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-primary transition-all duration-300"
                    style={{ width: `${(bulkProgress.current / bulkProgress.total) * 100}%` }}
                  />
                </div>
              </AlertDescription>
            </Alert>
          )}

          <div className="flex flex-col md:flex-row gap-3 md:items-center">
            <Tabs value={scopeFilter} onValueChange={(v) => setScopeFilter(v as 'all' | TestScope)}>
              <TabsList>
                <TabsTrigger value="all">All ({(counts.platform ?? 0) + (counts.module ?? 0) + (counts.operator ?? 0)})</TabsTrigger>
                <TabsTrigger value="platform">Platform ({counts.platform ?? 0})</TabsTrigger>
                <TabsTrigger value="module">Modules ({counts.module ?? 0})</TabsTrigger>
                <TabsTrigger value="operator">Operator ({counts.operator ?? 0})</TabsTrigger>
              </TabsList>
            </Tabs>
            <div className="relative flex-1 max-w-sm">
              <Search className="h-4 w-4 absolute left-2.5 top-2.5 text-muted-foreground" />
              <Input
                placeholder="Filter by name, module, category…"
                className="pl-9"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
          </div>

          {runnableSuites.length === 0 && (
            <Card>
              <CardContent className="py-12 text-center text-muted-foreground">
                No test suites match these filters.
              </CardContent>
            </Card>
          )}

          {runnableSuites.map((suite) => (
            <SuiteCard
              key={suite.id}
              suite={suite}
              state={runState[suite.id]}
              lastRun={latestRuns?.get(suite.id)}
              onRun={() => runSuite(suite)}
              onReseed={suite.scope === 'module' ? () => reseedModule(suite) : undefined}
              reseeding={reseeding === suite.id}
              onShowHistory={() => setHistorySuite(suite)}
            />
          ))}
        </div>

        {/* ── ZONE 3: Dev-only CI guardrails (collapsed by default — these don't run from the UI) ── */}
        {guardrailSuites.length > 0 && (
          <Collapsible>
            <div className="rounded-lg border bg-muted/20">
              <CollapsibleTrigger className="w-full px-4 py-3 flex items-center justify-between text-left hover:bg-muted/40 rounded-lg transition-colors">
                <div className="flex items-center gap-2">
                  <Shield className="h-4 w-4 text-amber-600" />
                  <span className="text-sm font-semibold">CI Guardrails ({guardrailSuites.length})</span>
                  <span className="text-xs text-muted-foreground ml-2">
                    Code-level contracts that run on every PR — view-only here.
                  </span>
                </div>
                <ChevronDown className="h-4 w-4 text-muted-foreground transition-transform [&[data-state=open]]:rotate-180" />
              </CollapsibleTrigger>
              <CollapsibleContent>
                <div className="px-4 pb-4 space-y-2 pt-2">
                  {guardrailSuites.map((suite) => (
                    <div key={suite.id} className="rounded-md border bg-background px-3 py-2 flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium">{suite.title}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">{suite.description}</p>
                        {suite.run.mode === 'manual' && (
                          <code className="text-[11px] font-mono text-muted-foreground mt-1 block truncate">
                            $ {suite.run.command}
                          </code>
                        )}
                      </div>
                      {suite.docs?.startsWith('/') && (
                        <Button variant="outline" size="sm" asChild>
                          <Link to={suite.docs}>
                            <ExternalLink className="h-3.5 w-3.5 mr-1" /> Docs
                          </Link>
                        </Button>
                      )}
                    </div>
                  ))}
                </div>
              </CollapsibleContent>
            </div>
          </Collapsible>
        )}

        <HistoryDialog suite={historySuite} onClose={() => setHistorySuite(null)} />
      </div>
    </AdminLayout>
  );
}

function SuiteCard({
  suite,
  state,
  lastRun,
  onRun,
  onReseed,
  reseeding,
  onShowHistory,
}: {
  suite: TestSuite;
  state?: SuiteRunState;
  lastRun?: PlatformTestRun;
  onRun: () => void;
  onReseed?: () => void;
  reseeding?: boolean;
  onShowHistory: () => void;
}) {
  const meta = SCOPE_META[suite.scope];
  const Icon = meta.icon;
  const isRunning = state?.status === 'running';
  const isEdge = suite.run.mode === 'edge';
  const isManual = suite.run.mode === 'manual';
  const isDocsOnly = suite.run.mode === 'docs-only';

  return (
    <Card className={isRunning ? 'border-primary/40 shadow-sm' : undefined}>
      {isRunning && (
        <div className="h-0.5 w-full overflow-hidden bg-primary/10 rounded-t-lg">
          <div className="h-full w-1/3 bg-primary animate-[pulse_1.2s_ease-in-out_infinite]" />
        </div>
      )}
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap mb-1">
              <Badge variant="outline" className={`gap-1 ${meta.color}`}>
                <Icon className="h-3 w-3" /> {meta.label}
              </Badge>
              {suite.module && (
                <Badge variant="outline" className="text-xs">{String(suite.module)}</Badge>
              )}
              <Badge variant="outline" className="text-xs capitalize">{suite.category}</Badge>
              {isRunning ? (
                <Badge variant="outline" className="text-xs bg-primary/10 text-primary border-primary/30 gap-1">
                  <Loader2 className="h-3 w-3 animate-spin" /> Running…
                </Badge>
              ) : state?.summary ? (
                <Badge
                  variant="outline"
                  className={state.summary.failed === 0
                    ? 'text-xs bg-green-500/10 text-green-600 border-green-500/30'
                    : 'text-xs bg-destructive/10 text-destructive border-destructive/30'}
                >
                  {state.summary.passed}/{state.summary.total} passed · {state.summary.duration_ms}ms · just now
                </Badge>
              ) : lastRun ? (
                <Badge
                  variant="outline"
                  className={lastRun.failed === 0
                    ? 'text-xs bg-green-500/10 text-green-600 border-green-500/30'
                    : 'text-xs bg-destructive/10 text-destructive border-destructive/30'}
                  title={`Triggered by ${lastRun.triggered_by} at ${new Date(lastRun.started_at).toLocaleString()}`}
                >
                  {lastRun.passed}/{lastRun.total} passed · {formatRelativeTime(lastRun.started_at)}
                </Badge>
              ) : (
                <Badge variant="outline" className="text-xs text-muted-foreground">
                  Never run
                </Badge>
              )}
            </div>
            <CardTitle className="text-base">{suite.title}</CardTitle>
            <p className="text-sm text-muted-foreground mt-1">{suite.description}</p>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <Button onClick={onShowHistory} variant="ghost" size="sm" title="View run history">
              <History className="h-3.5 w-3.5" />
            </Button>
            {suite.docs && (
              suite.docs.startsWith('/') ? (
                <Button variant="outline" size="sm" asChild>
                  <Link to={suite.docs}>
                    <ExternalLink className="h-3.5 w-3.5 mr-1" /> Open
                  </Link>
                </Button>
              ) : (
                <Button variant="ghost" size="sm" className="text-muted-foreground" disabled>
                  <BookOpen className="h-3.5 w-3.5 mr-1" /> {suite.docs}
                </Button>
              )
            )}
            {isEdge && (
              <Button onClick={onRun} disabled={isRunning} size="sm">
                {isRunning ? (
                  <><Loader2 className="h-4 w-4 mr-1 animate-spin" /> Running…</>
                ) : (
                  <><Play className="h-4 w-4 mr-1" /> Run</>
                )}
              </Button>
            )}
            {onReseed && state?.summary && state.summary.failed > 0 && (
              <Button onClick={onReseed} disabled={!!reseeding} variant="outline" size="sm">
                {reseeding ? (
                  <><Loader2 className="h-4 w-4 mr-1 animate-spin" /> Re-seeding…</>
                ) : (
                  <><RefreshCw className="h-4 w-4 mr-1" /> Re-seed</>
                )}
              </Button>
            )}
            {isDocsOnly && !suite.docs && (
              <Badge variant="outline" className="text-xs">Dedicated page</Badge>
            )}
          </div>
        </div>
      </CardHeader>

      {(isManual || state?.results || state?.error) && (
        <CardContent className="pt-0">
          {isManual && suite.run.mode === 'manual' && (
            <div className="rounded-md bg-muted/50 px-3 py-2 flex items-center gap-2 text-xs font-mono">
              <Terminal className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
              <code className="truncate">{suite.run.command}</code>
            </div>
          )}

          {state?.error && (
            <div className="rounded-md bg-destructive/10 border border-destructive/30 px-3 py-2 text-sm text-destructive font-mono">
              {state.error}
            </div>
          )}

          {state?.results && state.results.length > 0 && (
            <ScrollArea className="max-h-64 mt-2">
              <div className="space-y-1">
                {state.results.map((r, i) => (
                  <div
                    key={i}
                    className={`flex items-start gap-2 py-1.5 px-2 rounded text-xs ${
                      r.status === 'fail' ? 'bg-destructive/5' : ''
                    }`}
                  >
                    {r.status === 'pass' && <CheckCircle2 className="h-3.5 w-3.5 text-green-500 shrink-0 mt-0.5" />}
                    {r.status === 'fail' && <XCircle className="h-3.5 w-3.5 text-destructive shrink-0 mt-0.5" />}
                    {r.status === 'skip' && <Clock className="h-3.5 w-3.5 text-muted-foreground shrink-0 mt-0.5" />}
                    <div className="flex-1 min-w-0">
                      <p className="font-mono">{r.name}</p>
                      {r.error && (
                        <p className="text-destructive mt-0.5 font-mono break-all">{r.error}</p>
                      )}
                    </div>
                    <span className="text-muted-foreground shrink-0">{r.duration_ms}ms</span>
                  </div>
                ))}
              </div>
            </ScrollArea>
          )}
        </CardContent>
      )}
    </Card>
  );
}

function HistoryDialog({ suite, onClose }: { suite: TestSuite | null; onClose: () => void }) {
  const { data: history, isLoading } = useSuiteRunHistory(suite?.id ?? null, 10);
  return (
    <Dialog open={!!suite} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <History className="h-4 w-4" /> Run history: {suite?.title}
          </DialogTitle>
        </DialogHeader>
        {isLoading && <p className="text-sm text-muted-foreground py-6 text-center">Loading…</p>}
        {!isLoading && history && history.length === 0 && (
          <p className="text-sm text-muted-foreground py-6 text-center">No runs recorded yet for this suite.</p>
        )}
        {history && history.length > 0 && (
          <ScrollArea className="max-h-96">
            <div className="space-y-1.5">
              {history.map((run, i) => (
                <div key={i} className="flex items-center gap-3 py-2 px-3 rounded border text-xs">
                  {run.failed === 0 ? (
                    <CheckCircle2 className="h-4 w-4 text-green-500 shrink-0" />
                  ) : (
                    <XCircle className="h-4 w-4 text-destructive shrink-0" />
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="font-mono">
                      {run.passed}/{run.total} passed
                      {run.failed > 0 && <span className="text-destructive"> · {run.failed} failed</span>}
                    </p>
                    <p className="text-muted-foreground mt-0.5">
                      {new Date(run.started_at).toLocaleString()} · via {run.triggered_by} · {run.duration_ms}ms
                    </p>
                    {run.error && <p className="text-destructive font-mono mt-1 break-all">{run.error}</p>}
                  </div>
                </div>
              ))}
            </div>
          </ScrollArea>
        )}
      </DialogContent>
    </Dialog>
  );
}

void FlaskConical;
