import { Link } from 'react-router-dom';
import { FileText, Clock, CheckCircle, AlertCircle, Plus } from 'lucide-react';
import { AdminLayout } from '@/components/admin/AdminLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { StatusBadge } from '@/components/StatusBadge';
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
      <div>
        <div className="mb-8">
          <h1 className="font-serif text-3xl font-bold text-foreground">
            Välkommen, {profile?.full_name?.split(' ')[0] || 'användare'}
          </h1>
          <p className="text-muted-foreground mt-1">
            Här är en översikt över ditt innehåll
          </p>
        </div>

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
                  <p className="text-sm text-muted-foreground">Totalt antal sidor</p>
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
                  <p className="text-sm text-muted-foreground">Utkast</p>
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
                  <p className="text-sm text-muted-foreground">Väntar på granskning</p>
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
                  <p className="text-sm text-muted-foreground">Publicerade</p>
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
                <CardTitle className="font-serif">Senaste sidor</CardTitle>
                <CardDescription>Nyligen uppdaterade sidor</CardDescription>
              </div>
              <Button asChild size="sm">
                <Link to="/admin/pages/new">
                  <Plus className="h-4 w-4 mr-1" />
                  Ny sida
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
                  Inga sidor ännu. Skapa din första sida!
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
                <CardTitle className="font-serif">Väntar på granskning</CardTitle>
                <CardDescription>Sidor som behöver godkännas</CardDescription>
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
                      Inga sidor väntar på granskning
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
                            Uppdaterad {new Date(page.updated_at).toLocaleDateString('sv-SE')}
                          </p>
                        </div>
                        <Button size="sm" variant="outline">
                          Granska
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
                <CardTitle className="font-serif">Snabbåtgärder</CardTitle>
                <CardDescription>Vanliga åtgärder</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <Button asChild className="w-full justify-start" variant="outline">
                  <Link to="/admin/pages/new">
                    <Plus className="h-4 w-4 mr-2" />
                    Skapa ny sida
                  </Link>
                </Button>
                <Button asChild className="w-full justify-start" variant="outline">
                  <Link to="/admin/pages">
                    <FileText className="h-4 w-4 mr-2" />
                    Visa alla sidor
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
