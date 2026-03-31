import { useState, useCallback, useEffect } from 'react';
import {
  FlaskConical, Play, CheckCircle2, XCircle, Clock, Loader2, Filter,
  History, TrendingUp, Target, BarChart3, RefreshCw
} from 'lucide-react';
import { AdminLayout } from '@/components/admin/AdminLayout';
import { AdminPageHeader } from '@/components/admin/AdminPageHeader';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';

interface TestResult {
  name: string;
  layer: number;
  status: 'pass' | 'fail' | 'skip';
  duration_ms: number;
  error?: string;
}

interface TestSummary {
  total: number;
  passed: number;
  failed: number;
  skipped: number;
  duration_ms: number;
}

interface TestRun {
  id?: string;
  summary: TestSummary;
  results: TestResult[];
  ranAt: string;
  l9_accuracy?: number | null;
  layers?: number[];
}

interface HistoryEntry {
  id: string;
  created_at: string;
  layers: number[];
  summary: TestSummary;
  duration_ms: number;
  l9_accuracy: number | null;
  triggered_by: string;
}

const LAYER_LABELS: Record<number, { label: string; description: string; color: string }> = {
  1: { label: 'Unit', description: 'Pure functions: prompt compiler, token tracking', color: 'bg-blue-500/10 text-blue-600' },
  2: { label: 'Integration', description: 'Edge function API endpoints', color: 'bg-indigo-500/10 text-indigo-600' },
  3: { label: 'Scenarios', description: 'DB state: checkout, locks, memory', color: 'bg-violet-500/10 text-violet-600' },
  4: { label: 'Health', description: 'Live system: skills, soul, objectives', color: 'bg-purple-500/10 text-purple-600' },
  5: { label: 'Wiring', description: 'Pipeline: soul→prompt, skill→tools', color: 'bg-fuchsia-500/10 text-fuchsia-600' },
  6: { label: 'Behavior', description: 'AI personality, prioritization, grounding', color: 'bg-pink-500/10 text-pink-600' },
  7: { label: 'Robustness', description: 'Error propagation, trace forwarding', color: 'bg-rose-500/10 text-rose-600' },
  8: { label: 'Diagnostics', description: 'Heartbeat frequency, token efficiency', color: 'bg-orange-500/10 text-orange-600' },
  9: { label: 'Accuracy', description: 'Skill selection benchmark (intent→tool)', color: 'bg-emerald-500/10 text-emerald-600' },
};

export default function AutonomyTestSuitePage() {
  const [isRunning, setIsRunning] = useState(false);
  const [lastRun, setLastRun] = useState<TestRun | null>(null);
  const [selectedLayers, setSelectedLayers] = useState<string[]>(['1', '2', '3', '4', '5', '6', '7', '8', '9']);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(true);

  // Load history on mount
  useEffect(() => {
    loadHistory();
  }, []);

  const loadHistory = async () => {
    setLoadingHistory(true);
    const { data } = await supabase
      .from('autonomy_test_runs')
      .select('id, created_at, layers, summary, duration_ms, l9_accuracy, triggered_by')
      .order('created_at', { ascending: false })
      .limit(50);
    setHistory((data as unknown as HistoryEntry[]) || []);
    setLoadingHistory(false);
  };

  const runTests = useCallback(async () => {
    setIsRunning(true);
    try {
      const layers = selectedLayers.map(Number);
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/run-autonomy-tests`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
          },
          body: JSON.stringify({ layers }),
        }
      );

      if (!response.ok) {
        const errData = await response.json().catch(() => ({ error: 'Unknown error' }));
        throw new Error(errData.error || `HTTP ${response.status}`);
      }

      const data = await response.json();
      const run: TestRun = {
        summary: data.summary,
        results: data.results,
        ranAt: new Date().toISOString(),
        l9_accuracy: data.l9_accuracy,
        layers,
      };
      setLastRun(run);
      loadHistory(); // Refresh history

      if (data.summary.failed === 0) {
        toast.success(`All ${data.summary.passed} tests passed in ${data.summary.duration_ms}ms`);
      } else {
        toast.error(`${data.summary.failed} of ${data.summary.total} tests failed`);
      }
    } catch (err: any) {
      toast.error(`Test run failed: ${err.message}`);
    } finally {
      setIsRunning(false);
    }
  }, [selectedLayers]);

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'pass': return <CheckCircle2 className="h-4 w-4 text-green-500" />;
      case 'fail': return <XCircle className="h-4 w-4 text-destructive" />;
      case 'skip': return <Clock className="h-4 w-4 text-muted-foreground" />;
      default: return null;
    }
  };

  const getLayerBadge = (layer: number) => {
    const config = LAYER_LABELS[layer];
    return (
      <Badge variant="outline" className={`text-xs font-mono ${config?.color || ''}`}>
        L{layer}
      </Badge>
    );
  };

  // Stats calculations
  const recentRuns = history.slice(0, 10);
  const avgPassRate = recentRuns.length > 0
    ? Math.round(recentRuns.reduce((acc, r) => acc + (r.summary.passed / Math.max(r.summary.total, 1)) * 100, 0) / recentRuns.length)
    : 0;
  const l9Runs = history.filter(h => h.l9_accuracy !== null);
  const latestL9 = l9Runs.length > 0 ? l9Runs[0].l9_accuracy : null;
  const l9Trend = l9Runs.length >= 2
    ? (l9Runs[0].l9_accuracy || 0) - (l9Runs[1].l9_accuracy || 0)
    : null;

  return (
    <AdminLayout>
      <div className="space-y-6">
        <AdminPageHeader
          title="Service Room"
          description="FlowPilot autonomy testing, skill accuracy benchmarks, and system health diagnostics"
        />

        <Tabs defaultValue="run" className="space-y-4">
          <TabsList>
            <TabsTrigger value="run" className="gap-2">
              <FlaskConical className="h-4 w-4" /> Run Tests
            </TabsTrigger>
            <TabsTrigger value="stats" className="gap-2">
              <BarChart3 className="h-4 w-4" /> Statistics
            </TabsTrigger>
            <TabsTrigger value="history" className="gap-2">
              <History className="h-4 w-4" /> History
            </TabsTrigger>
          </TabsList>

          {/* ── Run Tests Tab ────────────────────────────────── */}
          <TabsContent value="run" className="space-y-4">
            {/* Controls */}
            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Filter className="h-4 w-4" />
                    Test Configuration
                  </CardTitle>
                  <Button onClick={runTests} disabled={isRunning || selectedLayers.length === 0} size="sm">
                    {isRunning ? (
                      <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Running...</>
                    ) : (
                      <><Play className="h-4 w-4 mr-2" /> Run Tests</>
                    )}
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  <p className="text-sm text-muted-foreground">Select test layers:</p>
                  <ToggleGroup
                    type="multiple"
                    value={selectedLayers}
                    onValueChange={(val) => val.length > 0 && setSelectedLayers(val)}
                    className="justify-start flex-wrap"
                  >
                    {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((layer) => (
                      <ToggleGroupItem key={layer} value={String(layer)} className="gap-1.5 px-3">
                        {getLayerBadge(layer)}
                        <span className="text-xs">{LAYER_LABELS[layer].label}</span>
                      </ToggleGroupItem>
                    ))}
                  </ToggleGroup>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-2 mt-2">
                    {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((layer) => (
                      <p key={layer} className="text-xs text-muted-foreground">
                        <span className="font-medium">L{layer}:</span> {LAYER_LABELS[layer].description}
                      </p>
                    ))}
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Summary Cards */}
            {lastRun && (
              <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
                <Card>
                  <CardContent className="pt-4 pb-3 text-center">
                    <p className="text-2xl font-bold">{lastRun.summary.total}</p>
                    <p className="text-xs text-muted-foreground">Total</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-4 pb-3 text-center">
                    <p className="text-2xl font-bold text-green-500">{lastRun.summary.passed}</p>
                    <p className="text-xs text-muted-foreground">Passed</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-4 pb-3 text-center">
                    <p className={`text-2xl font-bold ${lastRun.summary.failed > 0 ? 'text-destructive' : 'text-muted-foreground'}`}>
                      {lastRun.summary.failed}
                    </p>
                    <p className="text-xs text-muted-foreground">Failed</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-4 pb-3 text-center">
                    <p className="text-2xl font-bold text-muted-foreground">{lastRun.summary.skipped}</p>
                    <p className="text-xs text-muted-foreground">Skipped</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-4 pb-3 text-center">
                    <p className="text-2xl font-bold">{lastRun.summary.duration_ms}ms</p>
                    <p className="text-xs text-muted-foreground">Duration</p>
                  </CardContent>
                </Card>
                {lastRun.l9_accuracy !== null && lastRun.l9_accuracy !== undefined && (
                  <Card className="border-emerald-500/30">
                    <CardContent className="pt-4 pb-3 text-center">
                      <p className={`text-2xl font-bold ${(lastRun.l9_accuracy ?? 0) >= 70 ? 'text-emerald-500' : 'text-amber-500'}`}>
                        {lastRun.l9_accuracy}%
                      </p>
                      <p className="text-xs text-muted-foreground">L9 Accuracy</p>
                    </CardContent>
                  </Card>
                )}
              </div>
            )}

            {/* Results */}
            {lastRun && (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">
                    Test Results
                    <span className="text-xs text-muted-foreground ml-2 font-normal">
                      {new Date(lastRun.ranAt).toLocaleString()}
                    </span>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <ScrollArea className="h-[500px]">
                    <div className="space-y-1">
                      {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((layer) => {
                        const layerResults = lastRun.results.filter(r => r.layer === layer);
                        if (layerResults.length === 0) return null;
                        return (
                          <div key={layer} className="mb-4">
                            <div className="flex items-center gap-2 mb-2 sticky top-0 bg-background py-1 z-10">
                              {getLayerBadge(layer)}
                              <span className="text-sm font-medium">{LAYER_LABELS[layer]?.label}</span>
                              <span className="text-xs text-muted-foreground">
                                ({layerResults.filter(r => r.status === 'pass').length}/{layerResults.length} passed)
                              </span>
                            </div>
                            {layerResults.map((result, idx) => (
                              <div
                                key={idx}
                                className={`flex items-start gap-3 py-2 px-3 rounded-md text-sm ${
                                  result.status === 'fail' ? 'bg-destructive/5' : 'hover:bg-muted/50'
                                }`}
                              >
                                <div className="mt-0.5 shrink-0">{getStatusIcon(result.status)}</div>
                                <div className="flex-1 min-w-0">
                                  <p className="font-mono text-xs truncate">{result.name}</p>
                                  {result.error && (
                                    <p className="text-xs text-destructive mt-1 font-mono break-all">
                                      {result.error}
                                    </p>
                                  )}
                                </div>
                                <span className="text-xs text-muted-foreground shrink-0">
                                  {result.duration_ms}ms
                                </span>
                              </div>
                            ))}
                          </div>
                        );
                      })}
                    </div>
                  </ScrollArea>
                </CardContent>
              </Card>
            )}

            {/* Empty State */}
            {!lastRun && !isRunning && (
              <Card>
                <CardContent className="py-12 text-center">
                  <FlaskConical className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
                  <p className="text-lg font-medium mb-2">No test results yet</p>
                  <p className="text-sm text-muted-foreground mb-4">
                    Run the OpenClaw conformance suite — includes L9 skill accuracy benchmark
                  </p>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          {/* ── Statistics Tab ──────────────────────────────── */}
          <TabsContent value="stats" className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <Card>
                <CardHeader className="pb-2">
                  <CardDescription className="flex items-center gap-1.5">
                    <BarChart3 className="h-3.5 w-3.5" /> Total Runs
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <p className="text-3xl font-bold">{history.length}</p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardDescription className="flex items-center gap-1.5">
                    <CheckCircle2 className="h-3.5 w-3.5" /> Avg Pass Rate (last 10)
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <p className={`text-3xl font-bold ${avgPassRate >= 80 ? 'text-green-500' : avgPassRate >= 60 ? 'text-amber-500' : 'text-destructive'}`}>
                    {avgPassRate}%
                  </p>
                </CardContent>
              </Card>

              <Card className="border-emerald-500/20">
                <CardHeader className="pb-2">
                  <CardDescription className="flex items-center gap-1.5">
                    <Target className="h-3.5 w-3.5" /> L9 Skill Accuracy
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {latestL9 !== null ? (
                    <div className="flex items-baseline gap-2">
                      <p className={`text-3xl font-bold ${(latestL9 ?? 0) >= 70 ? 'text-emerald-500' : 'text-amber-500'}`}>
                        {latestL9}%
                      </p>
                      {l9Trend !== null && (
                        <span className={`text-sm font-medium ${l9Trend > 0 ? 'text-green-500' : l9Trend < 0 ? 'text-destructive' : 'text-muted-foreground'}`}>
                          {l9Trend > 0 ? '↑' : l9Trend < 0 ? '↓' : '→'}{Math.abs(l9Trend)}%
                        </span>
                      )}
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">No L9 runs yet</p>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardDescription className="flex items-center gap-1.5">
                    <TrendingUp className="h-3.5 w-3.5" /> L9 Trend
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {l9Runs.length >= 2 ? (
                    <div className="flex items-end gap-1 h-12">
                      {l9Runs.slice(0, 10).reverse().map((run, i) => (
                        <div
                          key={i}
                          className={`flex-1 rounded-sm ${(run.l9_accuracy ?? 0) >= 70 ? 'bg-emerald-500' : 'bg-amber-500'}`}
                          style={{ height: `${Math.max((run.l9_accuracy ?? 0), 10)}%` }}
                          title={`${run.l9_accuracy}% — ${new Date(run.created_at).toLocaleDateString()}`}
                        />
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">Need ≥2 L9 runs</p>
                  )}
                </CardContent>
              </Card>
            </div>

            {/* Layer breakdown from latest run */}
            {lastRun && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Layer Breakdown — Latest Run</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-3 md:grid-cols-9 gap-2">
                    {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((layer) => {
                      const lr = lastRun.results.filter(r => r.layer === layer);
                      if (lr.length === 0) return <div key={layer} />;
                      const passed = lr.filter(r => r.status === 'pass').length;
                      const rate = Math.round((passed / lr.length) * 100);
                      return (
                        <div key={layer} className="text-center p-3 rounded-lg bg-muted/40">
                          {getLayerBadge(layer)}
                          <p className={`text-lg font-bold mt-1 ${rate === 100 ? 'text-green-500' : rate >= 70 ? 'text-amber-500' : 'text-destructive'}`}>
                            {rate}%
                          </p>
                          <p className="text-xs text-muted-foreground">{passed}/{lr.length}</p>
                        </div>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          {/* ── History Tab ─────────────────────────────────── */}
          <TabsContent value="history" className="space-y-4">
            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base">Run History</CardTitle>
                  <Button variant="ghost" size="sm" onClick={loadHistory} disabled={loadingHistory}>
                    <RefreshCw className={`h-4 w-4 mr-1 ${loadingHistory ? 'animate-spin' : ''}`} />
                    Refresh
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                {history.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-8">No test runs recorded yet</p>
                ) : (
                  <ScrollArea className="h-[500px]">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Date</TableHead>
                          <TableHead>Layers</TableHead>
                          <TableHead className="text-center">Total</TableHead>
                          <TableHead className="text-center">Pass</TableHead>
                          <TableHead className="text-center">Fail</TableHead>
                          <TableHead className="text-center">L9</TableHead>
                          <TableHead className="text-right">Duration</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {history.map((run) => (
                          <TableRow key={run.id}>
                            <TableCell className="font-mono text-xs">
                              {new Date(run.created_at).toLocaleString()}
                            </TableCell>
                            <TableCell>
                              <div className="flex gap-1 flex-wrap">
                                {(run.layers || []).map(l => (
                                  <span key={l} className="text-[10px] font-mono text-muted-foreground">L{l}</span>
                                ))}
                              </div>
                            </TableCell>
                            <TableCell className="text-center font-medium">{run.summary.total}</TableCell>
                            <TableCell className="text-center text-green-500 font-medium">{run.summary.passed}</TableCell>
                            <TableCell className={`text-center font-medium ${run.summary.failed > 0 ? 'text-destructive' : 'text-muted-foreground'}`}>
                              {run.summary.failed}
                            </TableCell>
                            <TableCell className="text-center">
                              {run.l9_accuracy !== null ? (
                                <Badge variant="outline" className={`text-xs ${(run.l9_accuracy ?? 0) >= 70 ? 'border-emerald-500/50 text-emerald-600' : 'border-amber-500/50 text-amber-600'}`}>
                                  {run.l9_accuracy}%
                                </Badge>
                              ) : (
                                <span className="text-xs text-muted-foreground">—</span>
                              )}
                            </TableCell>
                            <TableCell className="text-right text-xs text-muted-foreground">
                              {(run.duration_ms / 1000).toFixed(1)}s
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </ScrollArea>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </AdminLayout>
  );
}
