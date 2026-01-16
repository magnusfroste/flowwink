import { Link } from 'react-router-dom';
import { Headphones, MessageCircle, Users, Clock, ArrowRight, CircleDot } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { useIsModuleEnabled } from '@/hooks/useModules';
import { useSupportConversations } from '@/hooks/useSupportConversations';
import { useOnlineAgents } from '@/hooks/useSupportPresence';
import { useChatSettings } from '@/hooks/useSiteSettings';
import { cn } from '@/lib/utils';

export function LiveSupportDashboardWidget() {
  const chatEnabled = useIsModuleEnabled('chat');
  const { data: chatSettings, isLoading: settingsLoading } = useChatSettings();
  const { assignedConversations, waitingConversations, isLoading: conversationsLoading } = useSupportConversations();
  const { data: onlineAgents, isLoading: agentsLoading } = useOnlineAgents();

  // Only show if chat module is enabled and live handoff is enabled
  const showWidget = chatEnabled && chatSettings?.humanHandoffEnabled;

  if (!showWidget || settingsLoading) {
    return null;
  }

  const isLoading = conversationsLoading || agentsLoading;
  const activeConversations = assignedConversations || [];
  const pendingConversations = waitingConversations || [];
  const onlineAgentsList = onlineAgents?.filter(a => a.status === 'online') || [];
  const isOnline = onlineAgentsList.length > 0;

  // Calculate average sentiment from active conversations
  const allConversations = [...activeConversations, ...pendingConversations];
  const conversationsWithSentiment = allConversations.filter(c => c.sentiment_score !== null);
  const avgSentiment = conversationsWithSentiment.length > 0
    ? conversationsWithSentiment.reduce((sum, c) => sum + (c.sentiment_score || 0), 0) / conversationsWithSentiment.length
    : 0;

  const getSentimentColor = (score: number) => {
    if (score <= 3) return 'text-green-600 dark:text-green-400';
    if (score <= 6) return 'text-yellow-600 dark:text-yellow-400';
    return 'text-red-600 dark:text-red-400';
  };

  const getSentimentLabel = (score: number) => {
    if (score <= 3) return 'Positive';
    if (score <= 6) return 'Neutral';
    return 'Needs attention';
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <div>
          <CardTitle className="font-serif flex items-center gap-2">
            <Headphones className="h-5 w-5" />
            Live Support
          </CardTitle>
          <CardDescription>Human handoff and agent status</CardDescription>
        </div>
        <Button asChild size="sm" variant="ghost">
          <Link to="/admin/support">
            View All
            <ArrowRight className="h-4 w-4 ml-1" />
          </Link>
        </Button>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-3">
              {[...Array(3)].map((_, i) => (
                <Skeleton key={i} className="h-16" />
              ))}
            </div>
            <Skeleton className="h-20" />
          </div>
        ) : (
          <div className="space-y-4">
            {/* Stats Grid */}
            <div className="grid grid-cols-3 gap-3">
              <div className="text-center p-3 rounded-lg bg-blue-500/10">
                <div className="flex items-center justify-center gap-1.5">
                  <MessageCircle className="h-4 w-4 text-blue-500" />
                  <span className="text-lg font-bold text-blue-500">
                    {activeConversations.length}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground">Active</p>
              </div>
              
              <div className="text-center p-3 rounded-lg bg-amber-500/10">
                <div className="flex items-center justify-center gap-1.5">
                  <Clock className="h-4 w-4 text-amber-500" />
                  <span className="text-lg font-bold text-amber-500">
                    {pendingConversations.length}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground">Waiting</p>
              </div>
              
              <div className="text-center p-3 rounded-lg bg-green-500/10">
                <div className="flex items-center justify-center gap-1.5">
                  <Users className="h-4 w-4 text-green-500" />
                  <span className="text-lg font-bold text-green-500">
                    {onlineAgentsList.length}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground">Online</p>
              </div>
            </div>

            {/* Agent Status */}
            <div className="flex items-center gap-2 text-sm">
              <CircleDot className={cn(
                "h-3 w-3",
                isOnline ? "text-green-500 animate-pulse" : "text-muted-foreground"
              )} />
              <span className={isOnline ? "text-green-600 dark:text-green-400" : "text-muted-foreground"}>
                {isOnline ? 'Agents available' : 'No agents online'}
              </span>
            </div>

            {/* Sentiment Indicator */}
            {conversationsWithSentiment.length > 0 && (
              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Avg. Sentiment</span>
                  <span className={cn("font-medium", getSentimentColor(avgSentiment))}>
                    {getSentimentLabel(avgSentiment)}
                  </span>
                </div>
                <Progress 
                  value={100 - (avgSentiment * 10)} 
                  className="h-2"
                />
              </div>
            )}

            {/* Waiting Conversations Alert */}
            {pendingConversations.length > 0 && (
              <Link 
                to="/admin/support"
                className="flex items-center gap-2 p-3 rounded-lg bg-amber-500/10 border border-amber-500/20 hover:bg-amber-500/20 transition-colors"
              >
                <Clock className="h-4 w-4 text-amber-500" />
                <span className="text-sm flex-1">
                  {pendingConversations.length} conversation{pendingConversations.length !== 1 ? 's' : ''} waiting for agent
                </span>
                <Badge variant="secondary" className="bg-amber-500/20 text-amber-700 dark:text-amber-300">
                  Pending
                </Badge>
              </Link>
            )}

            {/* No Activity State */}
            {activeConversations.length === 0 && pendingConversations.length === 0 && (
              <div className="text-center py-4">
                <Headphones className="h-8 w-8 text-muted-foreground/50 mx-auto mb-2" />
                <p className="text-sm text-muted-foreground">
                  No active conversations
                </p>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
