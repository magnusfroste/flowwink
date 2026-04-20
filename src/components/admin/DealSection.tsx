import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Plus, Briefcase, TrendingUp, Trophy, ArrowRight } from 'lucide-react';
import { useDeals, ACTIVE_STAGES, STAGE_PROBABILITY, type DealStage } from '@/hooks/useDeals';
import { formatPrice } from '@/hooks/useProducts';
import { CreateDealDialog } from './CreateDealDialog';
import { useIsModuleEnabled } from '@/hooks/useModules';

interface DealSectionProps {
  leadId: string;
}

/**
 * Compact deal summary for the contact detail page.
 * Pipedrive/HubSpot pattern: contact view shows summary + deep link;
 * full pipeline management lives in /admin/deals.
 */
export function DealSection({ leadId }: DealSectionProps) {
  const isDealsEnabled = useIsModuleEnabled('deals');
  const { data: deals = [], isLoading } = useDeals(leadId);
  const [dialogOpen, setDialogOpen] = useState(false);

  if (!isDealsEnabled) return null;

  const activeDeals = deals.filter((d) => ACTIVE_STAGES.includes(d.stage as DealStage));
  const wonDeals = deals.filter((d) => d.stage === 'closed_won');

  const pipelineValue = activeDeals.reduce((sum, d) => sum + d.value_cents, 0);
  const weightedValue = activeDeals.reduce(
    (sum, d) => sum + d.value_cents * (STAGE_PROBABILITY[d.stage as DealStage] ?? 0),
    0
  );
  const wonValue = wonDeals.reduce((sum, d) => sum + d.value_cents, 0);

  if (isLoading) {
    return (
      <Card>
        <CardContent className="py-6">
          <div className="flex justify-center">
            <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-primary" />
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card>
        <CardContent className="py-5">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                <Briefcase className="h-5 w-5 text-primary" />
              </div>
              <div>
                <h3 className="font-semibold text-sm">Deals</h3>
                {deals.length === 0 ? (
                  <p className="text-xs text-muted-foreground">No deals yet</p>
                ) : (
                  <div className="flex items-center gap-3 text-xs text-muted-foreground mt-0.5">
                    {activeDeals.length > 0 && (
                      <span className="flex items-center gap-1">
                        <TrendingUp className="h-3 w-3" />
                        {activeDeals.length} open · {formatPrice(pipelineValue)}
                      </span>
                    )}
                    {wonDeals.length > 0 && (
                      <span className="flex items-center gap-1 text-success">
                        <Trophy className="h-3 w-3" />
                        {wonDeals.length} won · {formatPrice(wonValue)}
                      </span>
                    )}
                  </div>
                )}
              </div>
            </div>

            <div className="flex items-center gap-2">
              {activeDeals.length > 0 && (
                <Badge variant="secondary" className="font-mono text-xs">
                  ~{formatPrice(Math.round(weightedValue))} weighted
                </Badge>
              )}
              <Button size="sm" variant="outline" onClick={() => setDialogOpen(true)}>
                <Plus className="h-4 w-4 mr-1" />
                New Deal
              </Button>
              {deals.length > 0 && (
                <Button size="sm" variant="ghost" asChild>
                  <Link to={`/admin/deals?contact=${leadId}`}>
                    Open pipeline
                    <ArrowRight className="h-4 w-4 ml-1" />
                  </Link>
                </Button>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      <CreateDealDialog open={dialogOpen} onOpenChange={setDialogOpen} leadId={leadId} />
    </>
  );
}
