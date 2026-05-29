import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { formatDistanceToNow } from 'date-fns';
import {
  RefreshCw, Clock, Activity, HeartPulse, AlertTriangle, ShieldCheck, ShieldAlert,
} from 'lucide-react';

export interface HealthCheckResult {
  status: 'healthy' | 'degraded' | 'unhealthy';
  checked_at: string;
  version: {
    skill_count: number;
    enabled_count: number;
    skill_hash: string;
    expected_hash: string | null;
    hash_match: boolean | null;
  };
  memory: { soul: boolean; identity: boolean; agents: boolean };
  heartbeat: { last_run: string | null; age_hours: number | null; stale: boolean; skipped?: boolean; reason?: string };
  integrity: { score: number; issues: string[] };
  checks_passed: number;
  checks_total: number;
}

interface InstanceHealthCardProps {
  /**
   * Compact mode renders only the badge + small "run" button. Use inside the
   * FlowPilot module sheet where space is tight.
   */
  variant?: 'full' | 'compact';
}

const STATUS_CONFIG = {
  healthy:   { icon: ShieldCheck, color: 'text-success', label: 'Healthy' },
  degraded:  { icon: AlertTriangle, color: 'text-warning', label: 'Degraded' },
  unhealthy: { icon: ShieldAlert, color: 'text-destructive', label: 'Unhealthy' },
} as const;

/**
 * Instance Health card — platform-level diagnostic.
 *
 * Calls the `instance-health` edge function which checks:
 *   - DB reachability + critical tables
 *   - skill catalog hash drift vs bootstrap baseline
 *   - core memory keys (soul, identity, agents)
 *   - heartbeat freshness (only relevant when FlowPilot module is on)
 *   - integrity score + open issues
 *
 * Lives at platform level because most checks are system-wide. Heartbeat is
 * the only operator-specific signal — gracefully shown as a "stale" warning
 * when FlowPilot is enabled but inactive.
 */
export function InstanceHealthCard({ variant = 'full' }: InstanceHealthCardProps) {
  const [isChecking, setIsChecking] = useState(false);
  const [result, setResult] = useState<HealthCheckResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const runHealthCheck = async () => {
    setIsChecking(true);
    setError(null);
    try {
      const { data, error: fnError } = await supabase.functions.invoke('instance-health', { body: {} });
      if (fnError) throw fnError;
      setResult(data as HealthCheckResult);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Health check failed';
      setError(msg);
      toast.error('Health check failed');
    } finally {
      setIsChecking(false);
    }
  };

  const Badge2 = result ? (() => {
    const cfg = STATUS_CONFIG[result.status];
    const Icon = cfg.icon;
    return (
      <Badge
        variant={
          result.status === 'healthy' ? 'default'
          : result.status === 'degraded' ? 'secondary'
          : 'destructive'
        }
        className="text-[10px]"
      >
        <Icon className="h-3 w-3 mr-1" />
        {cfg.label}
      </Badge>
    );
  })() : null;

  return (
    <div className="rounded-lg border p-3 bg-muted/20">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2 text-sm font-medium">
          <HeartPulse className="h-4 w-4 text-primary" />
          Instance Health
        </div>
        {Badge2}
      </div>

      {!result && !error && (
        <p className="text-[11px] text-muted-foreground mb-2">
          Run a health check to detect skill drift, stale heartbeats, missing
          memory keys, and configuration issues.
        </p>
      )}

      {error && (
        <div className="rounded-md bg-destructive/10 p-2 mb-2">
          <p className="text-[11px] text-destructive">{error}</p>
        </div>
      )}

      {result && variant === 'full' && (
        <div className="space-y-2">
          <div className="flex items-center gap-3 text-[11px]">
            <span className="text-muted-foreground">Checks:</span>
            <span className="font-medium">{result.checks_passed}/{result.checks_total} passed</span>
            <span className="text-muted-foreground">Integrity:</span>
            <span className="font-medium">{result.integrity.score}%</span>
          </div>

          {result.version.hash_match === false && (
            <div className="rounded-md bg-warning/10 border border-warning/20 p-2 flex items-start gap-2">
              <AlertTriangle className="h-3.5 w-3.5 text-warning shrink-0 mt-0.5" />
              <div>
                <p className="text-[11px] font-medium text-warning">Skill Hash Drift Detected</p>
                <p className="text-[10px] text-muted-foreground">
                  Instance skills differ from bootstrap baseline. Re-bootstrap the affected module(s) to sync.
                </p>
              </div>
            </div>
          )}

          {result.heartbeat.stale && !result.heartbeat.skipped && (
            <div className="rounded-md bg-warning/10 border border-warning/20 p-2 flex items-start gap-2">
              <Clock className="h-3.5 w-3.5 text-warning shrink-0 mt-0.5" />
              <div>
                <p className="text-[11px] font-medium text-warning">Heartbeat Stale</p>
                <p className="text-[10px] text-muted-foreground">
                  {result.heartbeat.age_hours
                    ? `Last heartbeat ${Math.round(result.heartbeat.age_hours)}h ago`
                    : 'No heartbeat recorded'}
                </p>
              </div>
            </div>
          )}

          {result.heartbeat.skipped && (
            <div className="rounded-md bg-muted/40 border border-border p-2 flex items-start gap-2">
              <Clock className="h-3.5 w-3.5 text-muted-foreground shrink-0 mt-0.5" />
              <div>
                <p className="text-[11px] font-medium text-muted-foreground">Heartbeat check skipped</p>
                <p className="text-[10px] text-muted-foreground">FlowPilot module is disabled — heartbeat is only relevant when the autonomous operator is on.</p>
              </div>
            </div>
          )}

          {(!result.memory.soul || !result.memory.identity || !result.memory.agents) && (
            <div className="rounded-md bg-destructive/10 border border-destructive/20 p-2 flex items-start gap-2">
              <ShieldAlert className="h-3.5 w-3.5 text-destructive shrink-0 mt-0.5" />
              <div>
                <p className="text-[11px] font-medium text-destructive">Missing Memory Keys</p>
                <p className="text-[10px] text-muted-foreground">
                  {[
                    !result.memory.soul && 'soul',
                    !result.memory.identity && 'identity',
                    !result.memory.agents && 'agents',
                  ].filter(Boolean).join(', ')}
                </p>
              </div>
            </div>
          )}

          {result.integrity.issues.length > 0 && (
            <div className="space-y-1">
              {result.integrity.issues.slice(0, 3).map((issue, i) => (
                <p key={i} className="text-[10px] text-muted-foreground flex items-start gap-1.5">
                  <Activity className="h-3 w-3 shrink-0 mt-0.5 text-muted-foreground" />
                  {issue}
                </p>
              ))}
            </div>
          )}

          <p className="text-[10px] text-muted-foreground text-right">
            Checked {formatDistanceToNow(new Date(result.checked_at), { addSuffix: true })}
          </p>
        </div>
      )}

      <Button
        onClick={runHealthCheck}
        disabled={isChecking}
        variant="outline"
        size="sm"
        className="w-full h-7 text-xs mt-2"
      >
        {isChecking ? (
          <><RefreshCw className="h-3 w-3 mr-1.5 animate-spin" /> Running check…</>
        ) : (
          <><HeartPulse className="h-3 w-3 mr-1.5" /> Run Health Check</>
        )}
      </Button>
    </div>
  );
}
