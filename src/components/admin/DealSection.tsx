import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Plus, Briefcase, Calendar, TrendingUp } from 'lucide-react';
import { useDeals, useUpdateDeal, getDealStageInfo, type DealStage } from '@/hooks/useDeals';
import { formatPrice } from '@/hooks/useProducts';
import { CreateDealDialog } from './CreateDealDialog';
import { useIsModuleEnabled } from '@/hooks/useModules';
import { format } from 'date-fns';

interface DealSectionProps {
  leadId: string;
}

export function DealSection({ leadId }: DealSectionProps) {
  const isDealsEnabled = useIsModuleEnabled('deals');
  
  // Early return if deals module is disabled
  if (!isDealsEnabled) {
    return null;
  }
  
  const { data: deals = [], isLoading } = useDeals(leadId);
  const updateDeal = useUpdateDeal();
  const [dialogOpen, setDialogOpen] = useState(false);

  const activeDeals = deals.filter(d => d.stage === 'proposal' || d.stage === 'negotiation');
  const closedDeals = deals.filter(d => d.stage === 'closed_won' || d.stage === 'closed_lost');

  const handleStageChange = (dealId: string, stage: DealStage) => {
    updateDeal.mutate({ id: dealId, stage });
  };

  const totalActiveValue = activeDeals.reduce((sum, d) => sum + d.value_cents, 0);

  if (isLoading) {
    return (
      <Card>
        <CardContent className="py-8">
          <div className="flex justify-center">
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary"></div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div className="flex items-center gap-2">
            <Briefcase className="h-5 w-5 text-muted-foreground" />
            <CardTitle className="text-lg">Deals</CardTitle>
            {activeDeals.length > 0 && (
              <Badge variant="secondary">
                {formatPrice(totalActiveValue)} i pipeline
              </Badge>
            )}
          </div>
          <Button size="sm" onClick={() => setDialogOpen(true)}>
            <Plus className="h-4 w-4 mr-1" />
            New Deal
          </Button>
        </CardHeader>
        <CardContent>
          {deals.length === 0 ? (
            <div className="text-center py-6 text-muted-foreground">
              <Briefcase className="h-8 w-8 mx-auto mb-2 opacity-50" />
              <p>No deals yet</p>
              <p className="text-sm">Create a deal to start tracking the opportunity</p>
            </div>
          ) : (
            <div className="space-y-6">
              {activeDeals.length > 0 && (
                <div className="space-y-3">
                  <h4 className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                    <TrendingUp className="h-4 w-4" />
                    Active Deals
                  </h4>
                  {activeDeals.map((deal) => {
                    const stageInfo = getDealStageInfo(deal.stage);
                    return (
                      <div key={deal.id} className="border rounded-lg p-4 space-y-3">
                        <div className="flex items-start justify-between">
                          <div>
                            <p className="font-medium">
                              {deal.product?.name || 'Custom deal'}
                            </p>
                            <p className="text-xl font-bold">
                              {formatPrice(deal.value_cents, deal.currency)}
                            </p>
                          </div>
                          <Select
                            value={deal.stage}
                            onValueChange={(value: DealStage) => handleStageChange(deal.id, value)}
                          >
                            <SelectTrigger className="w-[140px]">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="proposal">Proposal</SelectItem>
                              <SelectItem value="negotiation">Negotiation</SelectItem>
                              <SelectItem value="closed_won">Won</SelectItem>
                              <SelectItem value="closed_lost">Lost</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        
                        {deal.expected_close && (
                          <div className="flex items-center gap-2 text-sm text-muted-foreground">
                            <Calendar className="h-4 w-4" />
                            Expected close: {format(new Date(deal.expected_close), 'MMM d, yyyy')}
                          </div>
                        )}
                        
                        {deal.notes && (
                          <p className="text-sm text-muted-foreground">{deal.notes}</p>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
              
              {closedDeals.length > 0 && (
                <div className="space-y-3">
                  <h4 className="text-sm font-medium text-muted-foreground">Closed Deals</h4>
                  {closedDeals.map((deal) => {
                    const stageInfo = getDealStageInfo(deal.stage);
                    return (
                      <div key={deal.id} className="border rounded-lg p-4 opacity-60">
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="font-medium">
                              {deal.product?.name || 'Custom deal'}
                            </p>
                            <p className="text-lg font-semibold">
                              {formatPrice(deal.value_cents, deal.currency)}
                            </p>
                          </div>
                          <Badge className={stageInfo.color}>{stageInfo.label}</Badge>
                        </div>
                        {deal.closed_at && (
                          <p className="text-sm text-muted-foreground mt-2">
                            Closed {format(new Date(deal.closed_at), 'MMM d, yyyy')}
                          </p>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <CreateDealDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        leadId={leadId}
      />
    </>
  );
}
