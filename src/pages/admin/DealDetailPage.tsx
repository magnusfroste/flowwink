import { useParams, useNavigate, Link } from 'react-router-dom';
import { AdminLayout } from '@/components/admin/AdminLayout';
import { AdminPageHeader } from '@/components/admin/AdminPageHeader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useDeal, useUpdateDeal, getDealStageInfo, type DealStage } from '@/hooks/useDeals';
import { useLead } from '@/hooks/useLeads';
import { useDealActivities, useAddDealActivity, useUpdateDealActivity, type ActivityType } from '@/hooks/useActivities';
import { ActivityTimeline } from '@/components/admin/ActivityTimeline';
import { ArrowLeft, Calendar, DollarSign, User, Package, Building } from 'lucide-react';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';

export default function DealDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data: deal, isLoading } = useDeal(id);
  const { data: lead } = useLead(deal?.lead_id);
  const { data: activities, isLoading: activitiesLoading } = useDealActivities(id);
  const updateDeal = useUpdateDeal();
  const addActivity = useAddDealActivity();
  const updateActivity = useUpdateDealActivity();

  if (isLoading) {
    return (
      <AdminLayout>
        <div className="flex items-center justify-center h-64">
          <p>Loading...</p>
        </div>
      </AdminLayout>
    );
  }

  if (!deal) {
    return (
      <AdminLayout>
        <div className="flex flex-col items-center justify-center h-64 gap-4">
          <p>Deal not found</p>
          <Button onClick={() => navigate('/admin/deals')}>
            Back to deals
          </Button>
        </div>
      </AdminLayout>
    );
  }

  const stageInfo = getDealStageInfo(deal.stage);
  const formattedValue = new Intl.NumberFormat('sv-SE', {
    style: 'currency',
    currency: deal.currency,
    minimumFractionDigits: 0,
  }).format(deal.value_cents / 100);

  const handleStageChange = (newStage: DealStage) => {
    updateDeal.mutate({ id: deal.id, stage: newStage });
  };

  const handleAddActivity = (activity: { type: ActivityType; title?: string; description?: string; scheduledAt?: string }) => {
    addActivity.mutate({
      dealId: deal.id,
      type: activity.type,
      title: activity.title,
      description: activity.description,
      scheduledAt: activity.scheduledAt || undefined,
    });
  };

  const handleMarkComplete = (activityId: string) => {
    updateActivity.mutate({
      id: activityId,
      dealId: deal.id,
      completedAt: new Date().toISOString(),
    });
  };

  return (
    <AdminLayout>
      <div className="mb-6">
        <Button variant="ghost" size="sm" onClick={() => navigate('/admin/deals')}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to deals
        </Button>
      </div>

      <AdminPageHeader
        title={deal.product?.name || 'Unnamed Deal'}
        description={`Deal with ${lead?.name || lead?.email || 'Unknown'}`}
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main Content */}
        <div className="lg:col-span-2 space-y-6">
          {/* Stage & Value */}
          <Card>
            <CardContent className="pt-6">
              <div className="flex flex-wrap items-center gap-4">
                <div className="flex items-center gap-2">
                  <span className="text-sm text-muted-foreground">Stage:</span>
                  <Select value={deal.stage} onValueChange={handleStageChange}>
                    <SelectTrigger className="w-40">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="proposal">Proposal</SelectItem>
                      <SelectItem value="negotiation">Negotiation</SelectItem>
                      <SelectItem value="closed_won">Closed Won</SelectItem>
                      <SelectItem value="closed_lost">Closed Lost</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <Badge 
                  variant="secondary" 
                  className={cn("font-mono text-lg", stageInfo.color)}
                >
                  {formattedValue}
                </Badge>

                {deal.expected_close && (
                  <Badge variant="outline" className="flex items-center gap-1">
                    <Calendar className="h-3 w-3" />
                    Expected: {format(new Date(deal.expected_close), 'MMM d, yyyy')}
                  </Badge>
                )}
              </div>

              {deal.notes && (
                <p className="text-sm text-muted-foreground mt-4 border-t pt-4">
                  {deal.notes}
                </p>
              )}
            </CardContent>
          </Card>

          {/* Activity Timeline */}
          <ActivityTimeline
            activities={activities || []}
            onAddActivity={handleAddActivity}
            onMarkComplete={handleMarkComplete}
            isLoading={activitiesLoading}
          />
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* Deal Info */}
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Deal Information</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {deal.product && (
                <div className="flex items-center gap-3">
                  <Package className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm">{deal.product.name}</span>
                </div>
              )}

              <div className="flex items-center gap-3">
                <DollarSign className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm">{formattedValue}</span>
              </div>

              <div className="flex items-center gap-3">
                <Calendar className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm">
                  Created {format(new Date(deal.created_at), 'PPP')}
                </span>
              </div>

              {deal.closed_at && (
                <div className="flex items-center gap-3">
                  <Calendar className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm">
                    Closed {format(new Date(deal.closed_at), 'PPP')}
                  </span>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Linked Lead */}
          {lead && (
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Linked Contact</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-center gap-3">
                  <User className="h-4 w-4 text-muted-foreground" />
                  <Link 
                    to={`/admin/leads/${lead.id}`}
                    className="text-sm hover:underline text-primary"
                  >
                    {lead.name || lead.email}
                  </Link>
                </div>

                {lead.company && (
                  <div className="flex items-center gap-3">
                    <Building className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm">{lead.company}</span>
                  </div>
                )}

                <Button 
                  variant="outline" 
                  size="sm" 
                  className="w-full mt-2"
                  onClick={() => navigate(`/admin/leads/${lead.id}`)}
                >
                  View Contact
                </Button>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </AdminLayout>
  );
}
