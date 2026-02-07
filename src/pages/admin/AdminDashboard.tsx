import { Link } from 'react-router-dom';
import { FileText, Clock, CheckCircle, AlertCircle, Plus, ArrowRight, UserCheck, Headphones, BookOpen, Megaphone, BarChart3 } from 'lucide-react';
import { AdminLayout } from '@/components/admin/AdminLayout';
import { AdminPageHeader } from '@/components/admin/AdminPageHeader';
import { AdminPageContainer } from '@/components/admin/AdminPageContainer';
import { EmptyDashboard } from '@/components/admin/EmptyDashboard';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { StatusBadge } from '@/components/StatusBadge';
import { WelcomeModal } from '@/components/admin/WelcomeModal';
import { LeadsDashboardWidget } from '@/components/admin/LeadsDashboardWidget';
import { AeoDashboardWidget } from '@/components/admin/AeoDashboardWidget';
import { ChatFeedbackDashboardWidget } from '@/components/admin/ChatFeedbackDashboardWidget';
import { ChatAnalyticsDashboardWidget } from '@/components/admin/ChatAnalyticsDashboardWidget';
import { LiveSupportDashboardWidget } from '@/components/admin/LiveSupportDashboardWidget';
import { usePages } from '@/hooks/usePages';
import { useAuth } from '@/hooks/useAuth';
import { useIsModuleEnabled } from '@/hooks/useModules';
import { useLeadStats } from '@/hooks/useLeads';
import { useSupportConversations } from '@/hooks/useSupportConversations';
import { useChatSettings } from '@/hooks/useSiteSettings';

function NeedsAttentionItem({
  icon: Icon,
  label,
  count,
  href,
  variant = 'default',
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  count: number;
  href: string;
  variant?: 'warning' | 'default';
}) {
  if (count === 0) return null;
  return (
    <Link
      to={href}
      className={`flex items-center gap-3 p-3 rounded-lg border transition-colors ${
        variant === 'warning'
          ? 'border-warning/30 bg-warning/5 hover:bg-warning/10'
          : 'border-border hover:bg-muted/50'
      }`}
    >
      <Icon className={`h-4 w-4 shrink-0 ${variant === 'warning' ? 'text-warning' : 'text-muted-foreground'}`} />
      <span className="text-sm flex-1">{label}</span>
      <span className={`text-sm font-semibold ${
        variant === 'warning' ? 'text-warning' : 'text-foreground'
      }`}>{count}</span>
      <ArrowRight className="h-3 w-3 text-muted-foreground" />
    </Link>
  );
}

export default function AdminDashboard() {
  const { data: pages, isLoading } = usePages();
  const { profile, isApprover } = useAuth();
  const leadsEnabled = useIsModuleEnabled('leads');
  const chatEnabled = useIsModuleEnabled('chat');

  // Action item data
  const { data: leadStats } = useLeadStats();
  const { data: chatSettings } = useChatSettings();
  const { waitingConversations } = useSupportConversations();

  const stats = {
    total: pages?.length || 0,
    draft: pages?.filter(p => p.status === 'draft').length || 0,
    reviewing: pages?.filter(p => p.status === 'reviewing').length || 0,
    published: pages?.filter(p => p.status === 'published').length || 0,
  };

  const recentPages = pages?.slice(0, 5) || [];
  const pendingReview = pages?.filter(p => p.status === 'reviewing') || [];

  const isEmpty = !isLoading && stats.total === 0;

  // Build action items
  const actionItems = [
    { icon: AlertCircle, label: 'Pages pending review', count: stats.reviewing, href: '/admin/pages', variant: 'warning' as const },
    leadsEnabled && { icon: UserCheck, label: 'Leads need review', count: leadStats?.needsReview || 0, href: '/admin/contacts', variant: 'warning' as const },
    chatEnabled && chatSettings?.humanHandoffEnabled && { icon: Headphones, label: 'Waiting for support', count: waitingConversations?.length || 0, href: '/admin/live-support', variant: 'warning' as const },
  ].filter(Boolean) as Array<{ icon: React.ComponentType<{ className?: string }>; label: string; count: number; href: string; variant: 'warning' | 'default' }>;

  const totalActionItems = actionItems.reduce((sum, item) => sum + item.count, 0);

  return (
    <AdminLayout>
      <WelcomeModal />
      <AdminPageContainer>
        <AdminPageHeader 
          title={`Welcome, ${profile?.full_name?.split(' ')[0] || 'user'}`}
          description={isEmpty ? "Let's get your site up and running" : "Here's what's happening"}
        />

        {/* Empty State - Show when no pages exist */}
        {isEmpty ? (
          <EmptyDashboard />
        ) : (
          <>
            {/* Needs Attention */}
            {totalActionItems > 0 && (
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base font-medium flex items-center gap-2">
                    <AlertCircle className="h-4 w-4 text-warning" />
                    Needs Attention
                    <span className="text-xs font-normal text-muted-foreground">({totalActionItems})</span>
                  </CardTitle>
                </CardHeader>
                <CardContent className="pt-0">
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
                    {actionItems.map((item) => (
                      <NeedsAttentionItem key={item.label} {...item} />
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Content Overview */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <Link to="/admin/pages" className="group">
                <Card className="transition-colors group-hover:border-primary/30">
                  <CardContent className="pt-4 pb-4">
                    <div className="flex items-center justify-between mb-1">
                      <FileText className="h-4 w-4 text-muted-foreground" />
                      <span className="text-2xl font-bold">{isLoading ? '-' : stats.total}</span>
                    </div>
                    <p className="text-xs text-muted-foreground">Pages</p>
                  </CardContent>
                </Card>
              </Link>
              <Link to="/admin/pages" className="group">
                <Card className="transition-colors group-hover:border-primary/30">
                  <CardContent className="pt-4 pb-4">
                    <div className="flex items-center justify-between mb-1">
                      <Clock className="h-4 w-4 text-muted-foreground" />
                      <span className="text-2xl font-bold">{isLoading ? '-' : stats.draft}</span>
                    </div>
                    <p className="text-xs text-muted-foreground">Drafts</p>
                  </CardContent>
                </Card>
              </Link>
              <Link to="/admin/pages" className="group">
                <Card className="transition-colors group-hover:border-primary/30">
                  <CardContent className="pt-4 pb-4">
                    <div className="flex items-center justify-between mb-1">
                      <CheckCircle className="h-4 w-4 text-success" />
                      <span className="text-2xl font-bold">{isLoading ? '-' : stats.published}</span>
                    </div>
                    <p className="text-xs text-muted-foreground">Published</p>
                  </CardContent>
                </Card>
              </Link>
              <Link to="/admin/analytics" className="group">
                <Card className="transition-colors group-hover:border-primary/30">
                  <CardContent className="pt-4 pb-4">
                    <div className="flex items-center justify-between mb-1">
                      <BarChart3 className="h-4 w-4 text-muted-foreground" />
                    </div>
                    <p className="text-xs text-muted-foreground">View Analytics →</p>
                  </CardContent>
                </Card>
              </Link>
            </div>

            {/* Operational Widgets */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Leads Widget (if enabled) */}
              {leadsEnabled && <LeadsDashboardWidget />}

              {/* Live Support Widget */}
              <LiveSupportDashboardWidget />
            </div>

            {/* AI Insights */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <ChatAnalyticsDashboardWidget />
              <ChatFeedbackDashboardWidget />
            </div>

            <AeoDashboardWidget />

            {/* Recent Pages + Quick Actions */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Recent Pages */}
              <Card>
                <CardHeader className="flex flex-row items-center justify-between">
                  <div>
                    <CardTitle className="font-serif">Recent Pages</CardTitle>
                    <CardDescription>Recently updated pages</CardDescription>
                  </div>
                  <Button asChild size="sm">
                    <Link to="/admin/pages/new">
                      <Plus className="h-4 w-4 mr-1" />
                      New Page
                    </Link>
                  </Button>
                </CardHeader>
                <CardContent>
                  {isLoading ? (
                    <div className="space-y-3">
                      {[...Array(3)].map((_, i) => (
                        <Skeleton key={i} className="h-16 w-full" />
                      ))}
                    </div>
                  ) : recentPages.length === 0 ? (
                    <p className="text-muted-foreground text-center py-8">
                      No pages yet. Create your first page!
                    </p>
                  ) : (
                    <div className="space-y-3">
                      {recentPages.map((page) => (
                        <Link
                          key={page.id}
                          to={`/admin/pages/${page.id}`}
                          className="flex items-center justify-between p-3 rounded-lg border hover:bg-muted/50 transition-colors"
                        >
                          <div>
                            <p className="font-medium">{page.title}</p>
                            <p className="text-sm text-muted-foreground">/{page.slug}</p>
                          </div>
                          <StatusBadge status={page.status} />
                        </Link>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Pending Review (for approvers) */}
              {isApprover ? (
                <Card>
                  <CardHeader>
                    <CardTitle className="font-serif">Pending Review</CardTitle>
                    <CardDescription>Pages awaiting approval</CardDescription>
                  </CardHeader>
                  <CardContent>
                    {isLoading ? (
                      <div className="space-y-3">
                        {[...Array(3)].map((_, i) => (
                          <Skeleton key={i} className="h-16 w-full" />
                        ))}
                      </div>
                    ) : pendingReview.length === 0 ? (
                      <div className="text-center py-8">
                        <CheckCircle className="h-12 w-12 text-success mx-auto mb-3" />
                        <p className="text-muted-foreground">
                          No pages pending review
                        </p>
                      </div>
                    ) : (
                      <div className="space-y-3">
                        {pendingReview.map((page) => (
                          <Link
                            key={page.id}
                            to={`/admin/pages/${page.id}`}
                            className="flex items-center justify-between p-3 rounded-lg border border-warning/30 bg-warning/5 hover:bg-warning/10 transition-colors"
                          >
                            <div>
                              <p className="font-medium">{page.title}</p>
                              <p className="text-sm text-muted-foreground">
                                Updated {new Date(page.updated_at).toLocaleDateString('en-US')}
                              </p>
                            </div>
                            <Button size="sm" variant="outline">
                              Review
                            </Button>
                          </Link>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>
              ) : (
                <Card>
                  <CardHeader>
                    <CardTitle className="font-serif">Quick Actions</CardTitle>
                    <CardDescription>Common actions</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <Button asChild className="w-full justify-start" variant="outline">
                      <Link to="/admin/pages/new">
                        <Plus className="h-4 w-4 mr-2" />
                        Create new page
                      </Link>
                    </Button>
                    <Button asChild className="w-full justify-start" variant="outline">
                      <Link to="/admin/blog/new">
                        <BookOpen className="h-4 w-4 mr-2" />
                        Write blog post
                      </Link>
                    </Button>
                    <Button asChild className="w-full justify-start" variant="outline">
                      <Link to="/admin/campaigns">
                        <Megaphone className="h-4 w-4 mr-2" />
                        Create campaign
                      </Link>
                    </Button>
                    <Button asChild className="w-full justify-start" variant="outline">
                      <Link to="/admin/analytics">
                        <BarChart3 className="h-4 w-4 mr-2" />
                        View analytics
                      </Link>
                    </Button>
                  </CardContent>
                </Card>
              )}
            </div>
          </>
        )}
      </AdminPageContainer>
    </AdminLayout>
  );
}
