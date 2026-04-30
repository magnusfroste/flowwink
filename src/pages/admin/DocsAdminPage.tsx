import { BookOpen, RefreshCw, Loader2, ExternalLink } from 'lucide-react';
import { AdminLayout } from '@/components/admin/AdminLayout';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useDocsPages, useSyncDocs } from '@/hooks/useDocs';

export default function DocsAdminPage() {
  const { data: pages = [], isLoading } = useDocsPages();
  const sync = useSyncDocs();

  const byCategory = pages.reduce<Record<string, number>>((acc, p) => {
    acc[p.category] = (acc[p.category] ?? 0) + 1;
    return acc;
  }, {});

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <BookOpen className="h-6 w-6 text-primary" />
            <div>
              <h1 className="text-2xl font-bold tracking-tight">Docs</h1>
              <p className="text-sm text-muted-foreground">
                Public documentation portal at <code className="text-xs">/docs</code> — synced from{' '}
                <code className="text-xs">magnusfroste/flowwink/docs</code>
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" asChild>
              <a href="/docs" target="_blank" rel="noopener noreferrer">
                <ExternalLink className="h-3.5 w-3.5 mr-1.5" />
                View public site
              </a>
            </Button>
            <Button size="sm" onClick={() => sync.mutate(undefined)} disabled={sync.isPending}>
              {sync.isPending ? (
                <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
              ) : (
                <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
              )}
              Sync from GitHub
            </Button>
          </div>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Synced content</CardTitle>
            <CardDescription>
              {isLoading ? 'Loading…' : `${pages.length} pages across ${Object.keys(byCategory).length} categories`}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="text-sm text-muted-foreground">Loading…</div>
            ) : pages.length === 0 ? (
              <div className="text-sm text-muted-foreground py-8 text-center">
                No pages synced yet. Click <strong>Sync from GitHub</strong> above to pull
                everything from the <code>docs/</code> folder.
              </div>
            ) : (
              <div className="flex flex-wrap gap-2">
                {Object.entries(byCategory)
                  .sort(([, a], [, b]) => b - a)
                  .map(([cat, count]) => (
                    <Badge key={cat} variant="secondary" className="gap-1.5">
                      <span className="capitalize">{cat}</span>
                      <span className="text-muted-foreground">·</span>
                      <span>{count}</span>
                    </Badge>
                  ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">How it works</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground space-y-2">
            <p>
              The docs portal pulls every <code>.md</code> file (recursively) from{' '}
              <code>magnusfroste/flowwink/docs/</code> and stores them in the database with
              public read access.
            </p>
            <p>
              The <strong>category</strong> for each page is the first subfolder under{' '}
              <code>docs/</code> — so <code>docs/modules/purchasing.md</code> becomes{' '}
              <code>/docs/modules/purchasing</code>.
            </p>
            <p>
              The <strong>Ask the docs</strong> chat on every public page is scoped to the synced
              content and cites pages directly.
            </p>
          </CardContent>
        </Card>
      </div>
    </AdminLayout>
  );
}
