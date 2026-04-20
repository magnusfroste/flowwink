import { Link } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { AlertTriangle, Clock, TrendingDown } from 'lucide-react';
import { useStaleDeals } from '@/hooks/useStaleDeals';
import { formatPrice } from '@/hooks/useProducts';
import { getDealStageInfo, type DealStage } from '@/hooks/useDeals';

interface StaleDealsCardProps {
  daysThreshold?: number;
}

/**
 * Shows deals with no activity for N days.
 * Powered by the `deal_stale_check` MCP skill — works without FlowPilot.
 */
export function StaleDealsCard({ daysThreshold = 14 }: StaleDealsCardProps) {
  const { data, isLoading, error } = useStaleDeals(daysThreshold);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <AlertTriangle className="h-4 w-4 text-warning" />
          Stale Deals
          {data && data.stale_count > 0 && (
            <Badge variant="secondary" className="ml-1">{data.stale_count}</Badge>
          )}
        </CardTitle>
        <CardDescription>
          Deals with no activity for {daysThreshold}+ days
          {data && data.total_value_at_risk_cents > 0 && (
            <span className="ml-2 inline-flex items-center gap-1 text-warning">
              <TrendingDown className="h-3 w-3" />
              {formatPrice(data.total_value_at_risk_cents)} at risk
            </span>
          )}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-2">
            {[1, 2, 3].map(i => <Skeleton key={i} className="h-12 w-full" />)}
          </div>
        ) : error ? (
          <p className="text-sm text-muted-foreground py-4">
            Could not load stale deals
          </p>
        ) : !data || data.deals.length === 0 ? (
          <div className="text-center py-6 text-muted-foreground">
            <Clock className="h-8 w-8 mx-auto mb-2 opacity-40" />
            <p className="text-sm">No stale deals — pipeline is healthy</p>
          </div>
        ) : (
          <div className="space-y-2">
            {data.deals.slice(0, 8).map(d => {
              const stageInfo = getDealStageInfo(d.stage as DealStage);
              return (
                <Link
                  key={d.deal_id}
                  to={`/admin/deals/${d.deal_id}`}
                  className="flex items-center gap-3 p-3 rounded-md border bg-card hover:bg-accent transition-colors"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-medium text-sm truncate">
                        {d.product_name || 'Custom deal'}
                      </p>
                      {stageInfo && (
                        <Badge variant="secondary" className={stageInfo.color}>
                          {stageInfo.label}
                        </Badge>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5 truncate">
                      {d.recommendation}
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="font-semibold text-sm">
                      {formatPrice(d.value_cents, d.currency)}
                    </p>
                    <p className="text-xs text-warning flex items-center gap-1 justify-end">
                      <Clock className="h-3 w-3" />
                      {d.days_idle}d idle
                    </p>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
