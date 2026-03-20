import { useState, useCallback } from 'react';
import { FlaskConical, Play, CheckCircle2, XCircle, Clock, Loader2, Filter } from 'lucide-react';
import { AdminLayout } from '@/components/admin/AdminLayout';
import { AdminPageHeader } from '@/components/admin/AdminPageHeader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { toast } from 'sonner';

interface TestResult {
  name: string;
  layer: 1 | 2 | 3 | 4;
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
  summary: TestSummary;
  results: TestResult[];
  ranAt: string;
}

const LAYER_LABELS: Record<number, { label: string; description: string }> = {
  1: { label: 'Unit Tests', description: 'Pure functions: prompt compiler, token tracking, soul builder' },
  2: { label: 'Integration', description: 'Edge function API: execute, heartbeat, CORS' },
  3: { label: 'Scenarios', description: 'DB state: checkout, memory isolation, stale locks' },
  4: { label: 'Autonomy Health', description: 'Live system: skills seeded, soul, objectives, skill execution, heartbeat ran' },
};

export default function AutonomyTestSuitePage() {
  const [isRunning, setIsRunning] = useState(false);
  const [lastRun, setLastRun] = useState<TestRun | null>(null);
  const [selectedLayers, setSelectedLayers] = useState<string[]>(['1', '2', '3', '4']);

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
      };
      setLastRun(run);

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
    const variants: Record<number, 'default' | 'secondary' | 'outline'> = {
      1: 'default',
      2: 'secondary',
      3: 'outline',
      4: 'default',
    };
    return (
      <Badge variant={variants[layer] || 'default'} className="text-xs font-mono">
        L{layer}
      </Badge>
    );
  };

  return (
    <AdminLayout>
      <div className="space-y-6">
        <AdminPageHeader
          title="Autonomy Test Suite"
          description="Run OpenClaw conformance tests across all three layers"
        />

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
              <p className="text-sm text-muted-foreground">Select test layers to run:</p>
              <ToggleGroup
                type="multiple"
                value={selectedLayers}
                onValueChange={(val) => val.length > 0 && setSelectedLayers(val)}
                className="justify-start"
              >
                {[1, 2, 3, 4].map((layer) => (
                  <ToggleGroupItem key={layer} value={String(layer)} className="gap-2 px-4">
                    {getLayerBadge(layer)}
                    <span className="text-sm">{LAYER_LABELS[layer].label}</span>
                  </ToggleGroupItem>
                ))}
              </ToggleGroup>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-2 mt-2">
                {[1, 2, 3, 4].map((layer) => (
                  <p key={layer} className="text-xs text-muted-foreground">
                    <span className="font-medium">L{layer}:</span> {LAYER_LABELS[layer].description}
                  </p>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Summary */}
        {lastRun && (
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
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
              <ScrollArea className="h-[400px]">
                <div className="space-y-1">
                  {[1, 2, 3, 4].map((layer) => {
                    const layerResults = lastRun.results.filter(r => r.layer === layer);
                    if (layerResults.length === 0) return null;
                    return (
                      <div key={layer} className="mb-4">
                        <div className="flex items-center gap-2 mb-2 sticky top-0 bg-background py-1">
                          {getLayerBadge(layer)}
                          <span className="text-sm font-medium">{LAYER_LABELS[layer].label}</span>
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
                Click "Run Tests" to execute the OpenClaw autonomy conformance suite
              </p>
            </CardContent>
          </Card>
        )}
      </div>
    </AdminLayout>
  );
}
