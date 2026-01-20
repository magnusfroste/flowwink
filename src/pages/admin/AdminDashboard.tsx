import { Link } from 'react-router-dom';
import { FileText, Clock, CheckCircle, AlertCircle, Plus } from 'lucide-react';
import { AdminLayout } from '@/components/admin/AdminLayout';
import { AdminPageHeader } from '@/components/admin/AdminPageHeader';
import { AdminPageContainer } from '@/components/admin/AdminPageContainer';
import { EmptyDashboard } from '@/components/admin/EmptyDashboard';
import { StatCard } from '@/components/admin/StatCard';
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

export default function AdminDashboard() {
  const { data: pages, isLoading } = usePages();
  const { profile, isApprover } = useAuth();
  const leadsEnabled = useIsModuleEnabled('leads');

  const stats = {
    total: pages?.length || 0,
    draft: pages?.filter(p => p.status === 'draft').length || 0,
    reviewing: pages?.filter(p => p.status === 'reviewing').length || 0,
    published: pages?.filter(p => p.status === 'published').length || 0,
  };

  const recentPages = pages?.slice(0, 5) || [];
  const pendingReview = pages?.filter(p => p.status === 'reviewing') || [];

  const isEmpty = !isLoading && stats.total === 0;

  return (
    <AdminLayout>
      <WelcomeModal />
      <AdminPageContainer>
        <AdminPageHeader 
          title={`Welcome, ${profile?.full_name?.split(' ')[0] || 'user'}`}
          description={isEmpty ? "Let's get your site up and running" : "Here's an overview of your content"}
        />

        {/* Empty State - Show when no pages exist */}
        {isEmpty ? (
          <EmptyDashboard />
        ) : (
          <>
            {/* Stats Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <StatCard
                label="Total pages"
                value={stats.total}
                icon={FileText}
                variant="primary"
                isLoading={isLoading}
              />
              <StatCard
                label="Drafts"
                value={stats.draft}
                icon={Clock}
                variant="muted"
                isLoading={isLoading}
              />
              <StatCard
                label="Pending review"
                value={stats.reviewing}
                icon={AlertCircle}
                variant="warning"
                isLoading={isLoading}
              />
              <StatCard
                label="Published"
                value={stats.published}
                icon={CheckCircle}
                variant="success"
                isLoading={isLoading}
              />
            </div>

        {/* Leads Widget (if enabled) */}
        {leadsEnabled && (
          <LeadsDashboardWidget />
        )}

        <AeoDashboardWidget />

        <ChatAnalyticsDashboardWidget />

        <ChatFeedbackDashboardWidget />

        <LiveSupportDashboardWidget />

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
          {isApprover && (
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
          )}

          {/* Quick Actions (for non-approvers) */}
          {!isApprover && (
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
                  <Link to="/admin/pages">
                    <FileText className="h-4 w-4 mr-2" />
                    View all pages
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
