import { Helmet } from 'react-helmet-async';
import { Link, useParams } from 'react-router-dom';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Github, ChevronRight } from 'lucide-react';
import { PublicNavigation } from '@/components/public/PublicNavigation';
import { PublicFooter } from '@/components/public/PublicFooter';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { useDocsPages, useDocsPage } from '@/hooks/useDocs';
import { DocsSidebar } from '@/components/docs/DocsSidebar';
import { DocsChat } from '@/components/docs/DocsChat';

export default function DocsArticlePage() {
  const { category, slug } = useParams<{ category: string; slug: string }>();
  const { data: pages = [] } = useDocsPages();
  const { data: page, isLoading } = useDocsPage(category, slug);

  const description =
    typeof page?.frontmatter?.description === 'string'
      ? (page.frontmatter.description as string)
      : '';

  const githubUrl = page
    ? `https://github.com/${page.repo_owner}/${page.repo_name}/blob/main/${page.file_path}`
    : '';

  return (
    <>
      <Helmet>
        <title>{page ? `${page.title} — Flowwink Docs` : 'Docs — Flowwink'}</title>
        <meta name="description" content={description} />
        <link rel="canonical" href={`https://flowwink.com/docs/${category}/${slug}`} />
      </Helmet>

      <PublicNavigation />

      <main className="min-h-screen bg-background">
        <div className="container mx-auto px-4 py-8 lg:py-12 max-w-7xl">
          <div className="grid grid-cols-12 gap-8">
            <aside className="col-span-12 lg:col-span-3 hidden lg:block sticky top-20 self-start">
              <DocsSidebar pages={pages} />
            </aside>

            <article className="col-span-12 lg:col-span-9 max-w-3xl">
              {/* Breadcrumb */}
              <nav className="flex items-center gap-1.5 text-sm text-muted-foreground mb-6">
                <Link to="/docs" className="hover:text-foreground">Docs</Link>
                <ChevronRight className="h-3.5 w-3.5" />
                <Link to={`/docs/${category}`} className="hover:text-foreground capitalize">
                  {category}
                </Link>
              </nav>

              {isLoading ? (
                <div className="text-muted-foreground">Loading…</div>
              ) : !page ? (
                <Card className="p-8 text-center">
                  <p className="text-muted-foreground mb-3">Page not found.</p>
                  <Button asChild variant="outline">
                    <Link to="/docs">Back to docs</Link>
                  </Button>
                </Card>
              ) : (
                <>
                  <header className="mb-8 pb-6 border-b border-border">
                    <h1 className="text-3xl md:text-4xl font-bold tracking-tight mb-3">
                      {page.title}
                    </h1>
                    {description && (
                      <p className="text-lg text-muted-foreground leading-relaxed">{description}</p>
                    )}
                  </header>

                  <div className="prose prose-neutral dark:prose-invert max-w-none prose-headings:scroll-mt-20 prose-a:text-primary prose-pre:bg-muted prose-pre:text-foreground prose-pre:border prose-pre:border-border prose-code:text-foreground prose-code:bg-muted prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded prose-code:before:content-none prose-code:after:content-none prose-pre:code:bg-transparent prose-pre:code:p-0">
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>{page.content}</ReactMarkdown>
                  </div>

                  <footer className="mt-12 pt-6 border-t border-border flex items-center justify-between">
                    <Button variant="ghost" size="sm" asChild>
                      <a href={githubUrl} target="_blank" rel="noopener noreferrer">
                        <Github className="mr-2 h-3.5 w-3.5" />
                        Edit on GitHub
                      </a>
                    </Button>
                    <span className="text-xs text-muted-foreground">
                      Synced {new Date(page.synced_at).toLocaleDateString()}
                    </span>
                  </footer>
                </>
              )}
            </article>
          </div>
        </div>
      </main>

      <PublicFooter />
      <DocsChat />
    </>
  );
}
