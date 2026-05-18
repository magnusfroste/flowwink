import { useMemo } from 'react';
import { Helmet } from 'react-helmet-async';
import { Link, useParams, Navigate } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { PublicNavigation } from '@/components/public/PublicNavigation';
import { PublicFooter } from '@/components/public/PublicFooter';
import { Card } from '@/components/ui/card';
import { useDocsPages } from '@/hooks/useDocs';
import { DocsSidebar } from '@/components/docs/DocsSidebar';
import { DocsChat } from '@/components/docs/DocsChat';
import { useIsEmbed } from '@/hooks/useIsEmbed';

const CATEGORY_LABELS: Record<string, string> = {
  concepts: 'Concepts',
  modules: 'Modules',
  processes: 'Processes',
  architecture: 'Architecture',
  pilot: 'FlowPilot',
  guides: 'Guides',
  reference: 'Reference',
  agents: 'Agents',
  contributing: 'Contributing',
  mcp: 'MCP',
  archive: 'Archive',
  general: 'General',
};

export default function DocsCategoryPage() {
  const { category } = useParams<{ category: string }>();
  const { data: pages = [], isLoading } = useDocsPages();
  const embed = useIsEmbed();

  const filtered = useMemo(
    () => pages.filter((p) => p.category === category),
    [pages, category],
  );

  if (!isLoading && filtered.length === 0) {
    return <Navigate to="/docs" replace />;
  }

  const label = CATEGORY_LABELS[category ?? ''] ?? category ?? 'Docs';

  return (
    <>
      <Helmet>
        <title>{label} — Flowwink Docs</title>
        <meta name="description" content={`Browse ${label.toLowerCase()} documentation for Flowwink.`} />
        <link rel="canonical" href={`https://flowwink.com/docs/${category}`} />
      </Helmet>

      {!embed && <PublicNavigation />}

      <main className="min-h-screen bg-background">
        <div className="container mx-auto px-4 py-8 lg:py-12 max-w-7xl">
          <div className="grid grid-cols-12 gap-8">
            <aside className="col-span-12 lg:col-span-3 hidden lg:block sticky top-20 self-start">
              <DocsSidebar pages={pages} />
            </aside>

            <div className="col-span-12 lg:col-span-9 space-y-8">
              <header className="space-y-2">
                <Link to="/docs" className="text-sm text-muted-foreground hover:text-foreground">
                  ← Docs
                </Link>
                <h1 className="text-3xl md:text-4xl font-bold tracking-tight">{label}</h1>
                <p className="text-muted-foreground">
                  {filtered.length} {filtered.length === 1 ? 'page' : 'pages'}
                </p>
              </header>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {filtered.map((p) => (
                  <Link key={p.id} to={`/docs/${p.category}/${p.slug}`} className="group">
                    <Card className="p-5 h-full hover:border-primary/50 transition-colors">
                      <h3 className="font-semibold mb-1.5 group-hover:text-primary transition-colors flex items-center justify-between gap-2">
                        <span>{p.title}</span>
                        <ArrowRight className="h-4 w-4 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0" />
                      </h3>
                      {typeof p.frontmatter?.description === 'string' && (
                        <p className="text-sm text-muted-foreground leading-relaxed line-clamp-2">
                          {p.frontmatter.description as string}
                        </p>
                      )}
                    </Card>
                  </Link>
                ))}
              </div>
            </div>
          </div>
        </div>
      </main>

      {!embed && <PublicFooter />}
      {!embed && <DocsChat />}
    </>
  );
}
