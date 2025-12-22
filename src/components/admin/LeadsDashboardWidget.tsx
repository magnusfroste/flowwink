import { Link } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useLeadStats, useLeads } from '@/hooks/useLeads';
import { getLeadStatusInfo } from '@/lib/lead-utils';
import { UserCheck, TrendingUp, Sparkles, AlertCircle, ArrowRight } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { sv } from 'date-fns/locale';
import { cn } from '@/lib/utils';

export function LeadsDashboardWidget() {
  const { data: stats, isLoading: statsLoading } = useLeadStats();
  const { data: leads, isLoading: leadsLoading } = useLeads();

  const recentLeads = leads?.slice(0, 4) || [];
  const isLoading = statsLoading || leadsLoading;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <div>
          <CardTitle className="font-serif flex items-center gap-2">
            <UserCheck className="h-5 w-5" />
            Leads
          </CardTitle>
          <CardDescription>AI-driven leadhantering</CardDescription>
        </div>
        <Button asChild size="sm" variant="ghost">
          <Link to="/admin/leads">
            Visa alla
            <ArrowRight className="h-4 w-4 ml-1" />
          </Link>
        </Button>
      </CardHeader>
      <CardContent>
        {/* Mini stats */}
        <div className="grid grid-cols-3 gap-3 mb-4">
          <div className="text-center p-2 rounded-lg bg-blue-500/10">
            <p className="text-lg font-bold text-blue-500">
              {isLoading ? '-' : stats?.leads || 0}
            </p>
            <p className="text-xs text-muted-foreground">Leads</p>
          </div>
          <div className="text-center p-2 rounded-lg bg-amber-500/10">
            <p className="text-lg font-bold text-amber-500">
              {isLoading ? '-' : stats?.opportunities || 0}
            </p>
            <p className="text-xs text-muted-foreground">Opportunities</p>
          </div>
          <div className="text-center p-2 rounded-lg bg-green-500/10">
            <p className="text-lg font-bold text-green-500">
              {isLoading ? '-' : stats?.customers || 0}
            </p>
            <p className="text-xs text-muted-foreground">Kunder</p>
          </div>
        </div>

        {/* Needs review alert */}
        {(stats?.needsReview || 0) > 0 && (
          <Link 
            to="/admin/leads?tab=review"
            className="flex items-center gap-2 p-2 mb-4 rounded-lg bg-amber-500/10 border border-amber-500/20 hover:bg-amber-500/20 transition-colors"
          >
            <AlertCircle className="h-4 w-4 text-amber-500" />
            <span className="text-sm">
              {stats?.needsReview} lead{stats?.needsReview !== 1 ? 's' : ''} behöver granskas
            </span>
          </Link>
        )}

        {/* Recent leads */}
        {isLoading ? (
          <div className="space-y-2">
            {[...Array(3)].map((_, i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        ) : recentLeads.length === 0 ? (
          <p className="text-muted-foreground text-center py-4 text-sm">
            Inga leads ännu. Leads skapas automatiskt från formulär.
          </p>
        ) : (
          <div className="space-y-2">
            {recentLeads.map((lead) => {
              const statusInfo = getLeadStatusInfo(lead.status);
              return (
                <Link
                  key={lead.id}
                  to={`/admin/leads/${lead.id}`}
                  className="flex items-center justify-between p-2 rounded-lg border hover:bg-muted/50 transition-colors"
                >
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-sm truncate">
                      {lead.name || lead.email}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {formatDistanceToNow(new Date(lead.created_at), { addSuffix: true, locale: sv })}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="font-mono text-xs">
                      {lead.score}p
                    </Badge>
                    <div className={cn("h-2 w-2 rounded-full", statusInfo.color)} />
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
