import { Link } from 'react-router-dom';
import { MessageSquare, TrendingUp, Users, Bot } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useChatAnalyticsSummary } from '@/hooks/useChatAnalytics';
import { useChatSettings } from '@/hooks/useSiteSettings';

export function ChatAnalyticsDashboardWidget() {
  const { data: settings } = useChatSettings();
  const { data: analytics, isLoading } = useChatAnalyticsSummary();

  // Don't show if chat is disabled
  if (!settings?.enabled) {
    return null;
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <div>
          <CardTitle className="text-base font-medium flex items-center gap-2">
            <MessageSquare className="h-4 w-4" />
            Chat Analytics
          </CardTitle>
          <CardDescription>AI chat performance this week</CardDescription>
        </div>
        <Button variant="ghost" size="sm" asChild>
          <Link to="/admin/chat?tab=analytics">View details</Link>
        </Button>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="grid grid-cols-4 gap-4">
            {[...Array(4)].map((_, i) => (
              <Skeleton key={i} className="h-16" />
            ))}
          </div>
        ) : analytics ? (
          <div className="grid grid-cols-4 gap-4">
            <div className="text-center p-3 rounded-lg bg-muted/50">
              <div className="flex items-center justify-center gap-1 text-2xl font-bold">
                <MessageSquare className="h-5 w-5 text-muted-foreground" />
                {analytics.todayCount}
              </div>
              <div className="text-xs text-muted-foreground">Today</div>
            </div>
            
            <div className="text-center p-3 rounded-lg bg-muted/50">
              <div className="flex items-center justify-center gap-1 text-2xl font-bold">
                <TrendingUp className="h-5 w-5 text-muted-foreground" />
                {analytics.weekCount}
              </div>
              <div className="text-xs text-muted-foreground">This week</div>
            </div>
            
            <div className="text-center p-3 rounded-lg bg-green-50 dark:bg-green-950/50">
              <div className="flex items-center justify-center gap-1 text-2xl font-bold text-green-600">
                <Bot className="h-5 w-5" />
                {analytics.aiResolutionRate}%
              </div>
              <div className="text-xs text-green-600/70">AI resolved</div>
            </div>
            
            <div className="text-center p-3 rounded-lg bg-amber-50 dark:bg-amber-950/50">
              <div className="flex items-center justify-center gap-1 text-2xl font-bold text-amber-600">
                <Users className="h-5 w-5" />
                {analytics.weekEscalated}
              </div>
              <div className="text-xs text-amber-600/70">Escalated</div>
            </div>
          </div>
        ) : (
          <p className="text-muted-foreground text-center py-4">No chat data yet</p>
        )}
      </CardContent>
    </Card>
  );
}
