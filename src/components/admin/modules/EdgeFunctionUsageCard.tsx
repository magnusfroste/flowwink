/**
 * EdgeFunctionUsageCard — shows how many Supabase Edge Functions the site's
 * enabled modules require, against the Free-tier ceiling (100). Gives the admin
 * a clear "time to upgrade to Supabase Pro" signal as they grow into modules.
 *
 * Footprint is computed from the edge-function registry (single source of
 * truth) + the currently-enabled modules, so it updates live as modules toggle.
 */
import { useMemo } from 'react';
import { Server, TriangleAlert, ArrowUpCircle, CheckCircle2 } from 'lucide-react';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import {
  edgeFunctionUsage,
  PLAN_FUNCTION_LIMITS,
  type ModuleId,
} from '@/lib/edge-function-registry';

interface Props {
  /** Module ids currently enabled (use the live/unsaved set for instant feedback). */
  enabledModuleIds: ModuleId[];
  /** Human-readable module labels keyed by id, for the breakdown. */
  moduleNames?: Partial<Record<ModuleId, string>>;
}

const WARN_AT = 0.85; // start nudging toward Pro at 85% of the free ceiling

export function EdgeFunctionUsageCard({ enabledModuleIds, moduleNames }: Props) {
  const usage = useMemo(() => edgeFunctionUsage(enabledModuleIds), [enabledModuleIds]);

  const pct = Math.min(100, Math.round((usage.required / usage.freeLimit) * 100));
  const remaining = usage.freeLimit - usage.required;
  const over = usage.required > usage.freeLimit;
  const warning = !over && usage.required >= usage.freeLimit * WARN_AT;

  const barColor = over ? '[&>div]:bg-destructive' : warning ? '[&>div]:bg-amber-500' : '';

  return (
    <Card className={over ? 'border-destructive/40' : warning ? 'border-amber-500/40' : 'border-muted'}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-base">
            <Server className="h-5 w-5" />
            Edge function usage
          </CardTitle>
          <Badge variant={over ? 'destructive' : warning ? 'secondary' : 'outline'}>
            {usage.required} / {usage.freeLimit}
          </Badge>
        </div>
        <CardDescription>
          Supabase Free allows {PLAN_FUNCTION_LIMITS.free} edge functions per project. Your enabled
          modules deploy {usage.required} ({usage.core} core, always deployed).
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-4">
        <div className="space-y-1.5">
          <Progress value={pct} className={barColor} />
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>{usage.core} core</span>
            <span>
              {over
                ? `${usage.required - usage.freeLimit} over the Free limit`
                : `${remaining} slot${remaining === 1 ? '' : 's'} left on Free`}
            </span>
          </div>
        </div>

        {over && (
          <Alert variant="destructive">
            <ArrowUpCircle className="h-4 w-4" />
            <AlertTitle>Upgrade to Supabase Pro</AlertTitle>
            <AlertDescription className="text-xs">
              Your enabled modules need {usage.required} functions — past the Free ceiling of{' '}
              {usage.freeLimit}. Some functions won't deploy until you upgrade this project to{' '}
              <strong>Pro</strong> ({PLAN_FUNCTION_LIMITS.pro} functions, ~$25/mo). Until then,
              disable a module above to stay within Free.
            </AlertDescription>
          </Alert>
        )}

        {warning && (
          <Alert>
            <TriangleAlert className="h-4 w-4" />
            <AlertTitle>Approaching the Free limit</AlertTitle>
            <AlertDescription className="text-xs">
              You have {remaining} edge-function slot{remaining === 1 ? '' : 's'} left on Supabase
              Free. Enabling a few more modules will require upgrading to Pro.
            </AlertDescription>
          </Alert>
        )}

        {!over && !warning && (
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
            Comfortably within the Free tier — grow into more modules anytime.
          </p>
        )}

        {usage.perModule.length > 0 && (
          <div className="space-y-1.5">
            <p className="text-xs font-medium text-muted-foreground">Functions added by your modules</p>
            <div className="space-y-1">
              {usage.perModule.map(({ moduleId, count }) => (
                <div key={moduleId} className="flex items-center justify-between text-xs">
                  <span className="text-foreground">{moduleNames?.[moduleId] ?? moduleId}</span>
                  <span className="font-mono text-muted-foreground">+{count}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        <p className="border-t pt-3 text-xs text-muted-foreground">
          If you enable <strong>every</strong> module, this site would deploy{' '}
          <strong>{usage.ifAllEnabled}</strong> functions
          {usage.allFitsFree
            ? ' — still within Free.'
            : ` — which needs Supabase Pro (Free caps at ${usage.freeLimit}).`}
        </p>
      </CardContent>
    </Card>
  );
}
