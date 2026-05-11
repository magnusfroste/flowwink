import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  FlaskConical, Play, CheckCircle2, XCircle, Clock, Loader2, Search,
  ExternalLink, Terminal, BookOpen, Layers, Boxes, Bot, Shield,
} from 'lucide-react';
import { AdminLayout } from '@/components/admin/AdminLayout';
import { AdminPageHeader } from '@/components/admin/AdminPageHeader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { toast } from 'sonner';
import { Link } from 'react-router-dom';
import { getAllSuites, type TestSuite, type TestScope } from '@/lib/platform-tests/registry';
import { useModules } from '@/hooks/useModules';
import { bootstrapModule } from '@/lib/module-bootstrap';
import { RefreshCw } from 'lucide-react';
import { InstanceHealthCard } from '@/components/admin/InstanceHealthCard';

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
          body: JSON.stringify(suite.run.payload ?? {}),
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

  const runAllPlatform = async () => {
    const platformSuites = filtered.filter((s) => s.scope === 'platform' && s.run.mode === 'edge');
    for (const s of platformSuites) {
      await runSuite(s);
    }
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

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div className="flex items-start justify-between gap-4">
          <AdminPageHeader
            title="Platform Tests"
            description="The catalog of every test in FlowWink — runnable from here, or executed by CI / run manually. Module tests appear automatically when modules are registered."
          />
          <Button onClick={runAllPlatform} variant="default" size="sm" className="shrink-0 mt-1">
            <Play className="h-4 w-4 mr-2" /> Run all platform suites
          </Button>
          <Button onClick={reseedAllFailing} variant="outline" size="sm" className="shrink-0 mt-1">
            <RefreshCw className="h-4 w-4 mr-2" /> Re-seed failing modules
          </Button>
        </div>

        <div className="flex flex-col md:flex-row gap-3 md:items-center">
          <Tabs value={scopeFilter} onValueChange={(v) => setScopeFilter(v as 'all' | TestScope)}>
            <TabsList>
              <TabsTrigger value="all">All ({counts.all})</TabsTrigger>
              <TabsTrigger value="platform">Platform ({counts.platform ?? 0})</TabsTrigger>
              <TabsTrigger value="module">Modules ({counts.module ?? 0})</TabsTrigger>
              <TabsTrigger value="operator">Operator ({counts.operator ?? 0})</TabsTrigger>
              <TabsTrigger value="guardrail">CI ({counts.guardrail ?? 0})</TabsTrigger>
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

        <InstanceHealthCard />

        <div className="space-y-3">
          {filtered.length === 0 && (
            <Card>
              <CardContent className="py-12 text-center text-muted-foreground">
                No test suites match these filters.
              </CardContent>
            </Card>
          )}

          {filtered.map((suite) => (
            <SuiteCard
              key={suite.id}
              suite={suite}
              state={runState[suite.id]}
              onRun={() => runSuite(suite)}
              onReseed={suite.scope === 'module' ? () => reseedModule(suite) : undefined}
              reseeding={reseeding === suite.id}
            />
          ))}
        </div>
      </div>
    </AdminLayout>
  );
}

function SuiteCard({
  suite,
  state,
  onRun,
  onReseed,
  reseeding,
}: {
  suite: TestSuite;
  state?: SuiteRunState;
  onRun: () => void;
  onReseed?: () => void;
  reseeding?: boolean;
}) {
  const meta = SCOPE_META[suite.scope];
  const Icon = meta.icon;
  const isRunning = state?.status === 'running';
  const isEdge = suite.run.mode === 'edge';
  const isManual = suite.run.mode === 'manual';
  const isDocsOnly = suite.run.mode === 'docs-only';

  return (
    <Card>
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
              {state?.summary && (
                <Badge
                  variant="outline"
                  className={state.summary.failed === 0
                    ? 'text-xs bg-green-500/10 text-green-600 border-green-500/30'
                    : 'text-xs bg-destructive/10 text-destructive border-destructive/30'}
                >
                  {state.summary.passed}/{state.summary.total} passed · {state.summary.duration_ms}ms
                </Badge>
              )}
            </div>
            <CardTitle className="text-base">{suite.title}</CardTitle>
            <p className="text-sm text-muted-foreground mt-1">{suite.description}</p>
          </div>

          <div className="flex items-center gap-2 shrink-0">
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

void FlaskConical;
