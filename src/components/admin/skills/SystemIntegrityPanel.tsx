import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { RefreshCw, CheckCircle, AlertTriangle, XCircle, ShieldCheck } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { supabase } from '@/integrations/supabase/client';
import { cn } from '@/lib/utils';

interface CheckResult {
  id: string;
  category: string;
  label: string;
  status: 'pass' | 'warn' | 'fail';
  message: string;
  details?: string[];
}

interface IntegrityResponse {
  timestamp: string;
  summary: { total: number; pass: number; warn: number; fail: number; score: number };
  results: CheckResult[];
}

const STATUS_CONFIG = {
  pass: { icon: CheckCircle, color: 'text-emerald-500', bg: 'bg-emerald-500/10', label: 'Pass' },
  warn: { icon: AlertTriangle, color: 'text-amber-500', bg: 'bg-amber-500/10', label: 'Warning' },
  fail: { icon: XCircle, color: 'text-destructive', bg: 'bg-destructive/10', label: 'Fail' },
};

function ScoreRing({ score }: { score: number }) {
  const radius = 32;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (score / 100) * circumference;
  const color = score >= 90 ? 'stroke-emerald-500' : score >= 70 ? 'stroke-amber-500' : 'stroke-destructive';

  return (
    <div className="relative inline-flex items-center justify-center">
      <svg width={80} height={80} className="-rotate-90">
        <circle cx={40} cy={40} r={radius} fill="none" strokeWidth={5} className="stroke-muted" />
        <circle
          cx={40} cy={40} r={radius} fill="none" strokeWidth={5}
          className={cn(color, 'transition-all duration-700')}
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
        />
      </svg>
      <span className="absolute text-lg font-bold">{score}%</span>
    </div>
  );
}

function CheckRow({ check }: { check: CheckResult }) {
  const cfg = STATUS_CONFIG[check.status];
  const Icon = cfg.icon;
  const hasDetails = check.details && check.details.length > 0;

  const content = (
    <div className={cn(
      'flex items-start gap-3 p-3 rounded-lg transition-colors',
      hasDetails && 'hover:bg-muted/50 cursor-pointer'
    )}>
      <div className={cn('rounded-full p-1', cfg.bg)}>
        <Icon className={cn('h-4 w-4', cfg.color)} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium">{check.label}</span>
          <Badge variant="outline" className="text-[10px] px-1.5">{check.category}</Badge>
        </div>
        <p className="text-xs text-muted-foreground mt-0.5">{check.message}</p>
      </div>
    </div>
  );

  if (!hasDetails) return content;

  return (
    <Collapsible>
      <CollapsibleTrigger className="w-full text-left">{content}</CollapsibleTrigger>
      <CollapsibleContent>
        <div className="ml-10 mb-2 p-2 bg-muted/30 rounded text-xs space-y-1 max-h-40 overflow-y-auto">
          {check.details!.map((d, i) => (
            <div key={i} className="flex items-center gap-1.5 text-muted-foreground">
              <span className="text-[10px]">•</span>
              <code className="text-[11px]">{d}</code>
            </div>
          ))}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

export function SystemIntegrityPanel() {
  const [runKey, setRunKey] = useState(0);

  const { data, isLoading, isFetching } = useQuery<IntegrityResponse>({
    queryKey: ['system-integrity', runKey],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke('system-integrity-check');
      if (error) throw error;
      return data;
    },
    staleTime: 5 * 60 * 1000,
  });

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-4 w-72 mt-1" />
        </CardHeader>
        <CardContent className="space-y-3">
          {[1, 2, 3, 4, 5].map(i => <Skeleton key={i} className="h-16 w-full" />)}
        </CardContent>
      </Card>
    );
  }

  if (!data) return null;

  const { summary, results } = data;
  const grouped = results.reduce<Record<string, CheckResult[]>>((acc, r) => {
    (acc[r.category] = acc[r.category] || []).push(r);
    return acc;
  }, {});

  // Sort: fails first, then warns, then passes
  const sortedCategories = Object.entries(grouped).sort(([, a], [, b]) => {
    const score = (checks: CheckResult[]) =>
      checks.filter(c => c.status === 'fail').length * 100 +
      checks.filter(c => c.status === 'warn').length * 10;
    return score(b) - score(a);
  });

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <ShieldCheck className="h-5 w-5 text-muted-foreground" />
            <div>
              <CardTitle className="text-base">System Integrity</CardTitle>
              <CardDescription>
                Configuration completeness, data quality, and wiring validation
              </CardDescription>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <ScoreRing score={summary.score} />
            <Button
              variant="outline" size="sm"
              onClick={() => setRunKey(k => k + 1)}
              disabled={isFetching}
              className="gap-1.5"
            >
              <RefreshCw className={cn('h-3.5 w-3.5', isFetching && 'animate-spin')} />
              Re-scan
            </Button>
          </div>
        </div>

        {/* Summary badges */}
        <div className="flex gap-2 mt-3">
          <Badge variant="outline" className="gap-1 bg-emerald-500/10 text-emerald-600 border-emerald-200">
            <CheckCircle className="h-3 w-3" /> {summary.pass} pass
          </Badge>
          {summary.warn > 0 && (
            <Badge variant="outline" className="gap-1 bg-amber-500/10 text-amber-600 border-amber-200">
              <AlertTriangle className="h-3 w-3" /> {summary.warn} warnings
            </Badge>
          )}
          {summary.fail > 0 && (
            <Badge variant="outline" className="gap-1 bg-destructive/10 text-destructive border-destructive/20">
              <XCircle className="h-3 w-3" /> {summary.fail} failures
            </Badge>
          )}
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {sortedCategories.map(([category, checks]) => (
          <div key={category}>
            <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
              {category}
            </h3>
            <div className="space-y-1">
              {checks.map(check => <CheckRow key={check.id} check={check} />)}
            </div>
            <Separator className="mt-3" />
          </div>
        ))}

        <p className="text-[10px] text-muted-foreground text-right">
          Last scan: {new Date(data.timestamp).toLocaleString()}
        </p>
      </CardContent>
    </Card>
  );
}
