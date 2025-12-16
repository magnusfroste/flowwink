import { Link } from 'react-router-dom';
import { FileText, Clock, CheckCircle, AlertCircle, Plus } from 'lucide-react';
import { AdminLayout } from '@/components/admin/AdminLayout';
import { AdminPageHeader } from '@/components/admin/AdminPageHeader';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { StatusBadge } from '@/components/StatusBadge';
import { WelcomeModal } from '@/components/admin/WelcomeModal';
import { usePages } from '@/hooks/usePages';
import { useAuth } from '@/hooks/useAuth';
import { Skeleton } from '@/components/ui/skeleton';

export default function AdminDashboard() {
  const { data: pages, isLoading } = usePages();
  const { profile, isApprover } = useAuth();

  const stats = {
    total: pages?.length || 0,
    draft: pages?.filter(p => p.status === 'draft').length || 0,
    reviewing: pages?.filter(p => p.status === 'reviewing').length || 0,
    published: pages?.filter(p => p.status === 'published').length || 0,
  };

  const recentPages = pages?.slice(0, 5) || [];
  const pendingReview = pages?.filter(p => p.status === 'reviewing') || [];

  return (
    <AdminLayout>
      <WelcomeModal />
      <div>
        <AdminPageHeader 
          title={`Welcome, ${profile?.full_name?.split(' ')[0] || 'user'}`}
          description="Here's an overview of your content"
        />

        {/* Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-4">
                <div className="p-3 rounded-lg bg-primary/10">
                  <FileText className="h-6 w-6 text-primary" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{isLoading ? '-' : stats.total}</p>
                  <p className="text-sm text-muted-foreground">Total pages</p>
                </div>
              </div>
            </CardContent>
          </Card>
          
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-4">
                <div className="p-3 rounded-lg bg-muted">
                  <Clock className="h-6 w-6 text-muted-foreground" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{isLoading ? '-' : stats.draft}</p>
                  <p className="text-sm text-muted-foreground">Drafts</p>
                </div>
              </div>
            </CardContent>
          </Card>
          
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-4">
                <div className="p-3 rounded-lg bg-warning/10">
                  <AlertCircle className="h-6 w-6 text-warning" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{isLoading ? '-' : stats.reviewing}</p>
                  <p className="text-sm text-muted-foreground">Pending review</p>
                </div>
              </div>
            </CardContent>
          </Card>
          
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-4">
                <div className="p-3 rounded-lg bg-success/10">
                  <CheckCircle className="h-6 w-6 text-success" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{isLoading ? '-' : stats.published}</p>
                  <p className="text-sm text-muted-foreground">Published</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
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
      </div>
    </AdminLayout>
  );
}
