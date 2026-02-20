import { useState, useEffect } from 'react';
import { AdminLayout } from '@/components/admin/AdminLayout';
import { AdminPageContainer } from '@/components/admin/AdminPageContainer';
import { AdminPageHeader } from '@/components/admin/AdminPageHeader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { usePages } from '@/hooks/usePages';

export default function PagesDebugPage() {
  const { session, loading: authLoading, isAdmin } = useAuth();
  const { data: hookPages, isLoading: hookLoading, error: hookError } = usePages();
  const [directPages, setDirectPages] = useState<any[]>([]);
  const [directError, setDirectError] = useState<string | null>(null);
  const [directLoading, setDirectLoading] = useState(false);

  const fetchDirect = async () => {
    setDirectLoading(true);
    setDirectError(null);
    try {
      const { data, error } = await supabase
        .from('pages')
        .select('id, title, slug, status, created_at')
        .is('deleted_at', null)
        .order('updated_at', { ascending: false });

      if (error) {
        setDirectError(error.message);
      } else {
        setDirectPages(data || []);
      }
    } catch (e: any) {
      setDirectError(e.message);
    } finally {
      setDirectLoading(false);
    }
  };

  useEffect(() => {
    if (!authLoading) {
      fetchDirect();
    }
  }, [authLoading, session]);

  return (
    <AdminLayout>
      <AdminPageContainer>
        <AdminPageHeader title="Pages Debug" description="Diagnostic view for page visibility" />

        {/* Auth Status */}
        <Card>
          <CardHeader><CardTitle>Auth Status</CardTitle></CardHeader>
          <CardContent className="space-y-1 text-sm font-mono">
            <p>authLoading: <strong>{String(authLoading)}</strong></p>
            <p>session: <strong>{session ? 'YES' : 'NO'}</strong></p>
            <p>user_id: <strong>{session?.user?.id ?? 'none'}</strong></p>
            <p>email: <strong>{session?.user?.email ?? 'none'}</strong></p>
            <p>isAdmin: <strong>{String(isAdmin)}</strong></p>
            <p>token (first 20): <strong>{session?.access_token?.slice(0, 20) ?? 'none'}...</strong></p>
          </CardContent>
        </Card>

        {/* usePages hook result */}
        <Card>
          <CardHeader><CardTitle>usePages Hook ({hookPages?.length ?? 0} pages)</CardTitle></CardHeader>
          <CardContent>
            {hookLoading && <p className="text-muted-foreground">Loading...</p>}
            {hookError && <p className="text-destructive">Error: {String(hookError)}</p>}
            {hookPages && hookPages.length === 0 && <p className="text-muted-foreground">No pages returned</p>}
            <div className="space-y-1 text-sm font-mono">
              {hookPages?.map(p => (
                <p key={p.id}>{p.status} | {p.title} | /{p.slug}</p>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Direct query result */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              Direct Query ({directPages.length} pages)
              <Button size="sm" variant="outline" onClick={fetchDirect} disabled={directLoading}>
                Refresh
              </Button>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {directLoading && <p className="text-muted-foreground">Loading...</p>}
            {directError && <p className="text-destructive">Error: {directError}</p>}
            {directPages.length === 0 && !directLoading && <p className="text-muted-foreground">No pages returned</p>}
            <div className="space-y-1 text-sm font-mono">
              {directPages.map((p: any) => (
                <p key={p.id}>{p.status} | {p.title} | /{p.slug}</p>
              ))}
            </div>
          </CardContent>
        </Card>
      </AdminPageContainer>
    </AdminLayout>
  );
}
