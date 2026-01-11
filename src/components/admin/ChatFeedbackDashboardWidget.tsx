import { Link } from 'react-router-dom';
import { MessageSquare, ThumbsUp, ThumbsDown, AlertTriangle, TrendingUp, ExternalLink } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Progress } from '@/components/ui/progress';
import { useChatFeedbackStats, useKbArticlesNeedingImprovement } from '@/hooks/useChatFeedback';
import { useIsModuleEnabled } from '@/hooks/useModules';

export function ChatFeedbackDashboardWidget() {
  const chatEnabled = useIsModuleEnabled('chat');
  const { data: stats, isLoading: statsLoading } = useChatFeedbackStats();
  const { data: articlesNeedingImprovement, isLoading: articlesLoading } = useKbArticlesNeedingImprovement();

  // Don't show widget if chat module is disabled
  if (!chatEnabled) {
    return null;
  }

  const isLoading = statsLoading || articlesLoading;
  const hasData = stats && stats.total > 0;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle className="font-serif flex items-center gap-2">
            <MessageSquare className="h-5 w-5" />
            AI Chat Feedback
          </CardTitle>
          <CardDescription>Användarfeedback och innehåll som behöver förbättras</CardDescription>
        </div>
        <Button asChild size="sm" variant="outline">
          <Link to="/admin/chat?tab=feedback">
            Visa allt
            <ExternalLink className="h-3 w-3 ml-1" />
          </Link>
        </Button>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-4">
              {[...Array(3)].map((_, i) => (
                <Skeleton key={i} className="h-20" />
              ))}
            </div>
            <Skeleton className="h-24" />
          </div>
        ) : !hasData ? (
          <div className="text-center py-6">
            <MessageSquare className="h-10 w-10 text-muted-foreground mx-auto mb-2 opacity-50" />
            <p className="text-sm text-muted-foreground">
              Ingen feedback ännu. Feedback samlas in när användare interagerar med AI-chatten.
            </p>
          </div>
        ) : (
          <div className="space-y-6">
            {/* Stats Grid */}
            <div className="grid grid-cols-3 gap-4">
              <div className="p-3 rounded-lg bg-muted/50 text-center">
                <div className="flex items-center justify-center gap-1.5 mb-1">
                  <ThumbsUp className="h-4 w-4 text-success" />
                  <span className="text-lg font-bold">{stats.positive}</span>
                </div>
                <p className="text-xs text-muted-foreground">Positiv</p>
              </div>
              
              <div className="p-3 rounded-lg bg-muted/50 text-center">
                <div className="flex items-center justify-center gap-1.5 mb-1">
                  <ThumbsDown className="h-4 w-4 text-destructive" />
                  <span className="text-lg font-bold">{stats.negative}</span>
                </div>
                <p className="text-xs text-muted-foreground">Negativ</p>
              </div>
              
              <div className="p-3 rounded-lg bg-muted/50 text-center">
                <div className="flex items-center justify-center gap-1.5 mb-1">
                  <TrendingUp className="h-4 w-4 text-primary" />
                  <span className="text-lg font-bold">{stats.positiveRate}%</span>
                </div>
                <p className="text-xs text-muted-foreground">Nöjdhet</p>
              </div>
            </div>

            {/* Satisfaction Progress Bar */}
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Nöjdhetsgrad</span>
                <span className="font-medium">{stats.positiveRate}%</span>
              </div>
              <Progress 
                value={stats.positiveRate} 
                className="h-2"
              />
            </div>

            {/* Articles Needing Improvement */}
            {articlesNeedingImprovement && articlesNeedingImprovement.length > 0 && (
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-sm font-medium text-warning">
                  <AlertTriangle className="h-4 w-4" />
                  Artiklar som behöver förbättras ({articlesNeedingImprovement.length})
                </div>
                <div className="space-y-1.5">
                  {articlesNeedingImprovement.slice(0, 3).map((article) => (
                    <Link
                      key={article.id}
                      to={`/admin/knowledge-base/${article.id}`}
                      className="flex items-center justify-between p-2 rounded-md border border-warning/30 bg-warning/5 hover:bg-warning/10 transition-colors text-sm"
                    >
                      <span className="font-medium truncate flex-1 mr-2">{article.title}</span>
                      <div className="flex items-center gap-2 text-xs shrink-0">
                        <span className="flex items-center gap-0.5 text-destructive">
                          <ThumbsDown className="h-3 w-3" />
                          {article.negative_feedback_count}
                        </span>
                        <span className="flex items-center gap-0.5 text-success">
                          <ThumbsUp className="h-3 w-3" />
                          {article.positive_feedback_count}
                        </span>
                      </div>
                    </Link>
                  ))}
                  {articlesNeedingImprovement.length > 3 && (
                    <Link 
                      to="/admin/chat?tab=feedback"
                      className="text-xs text-muted-foreground hover:text-primary transition-colors block text-center pt-1"
                    >
                      +{articlesNeedingImprovement.length - 3} fler artiklar →
                    </Link>
                  )}
                </div>
              </div>
            )}

            {/* No issues state */}
            {(!articlesNeedingImprovement || articlesNeedingImprovement.length === 0) && (
              <div className="flex items-center gap-2 p-3 rounded-lg bg-success/10 text-success text-sm">
                <ThumbsUp className="h-4 w-4" />
                <span>Inga artiklar behöver förbättras just nu!</span>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
