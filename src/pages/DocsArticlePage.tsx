import { useMemo } from 'react';
import { Helmet } from 'react-helmet-async';
import { Link, useParams } from 'react-router-dom';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Github, ChevronRight, ChevronLeft } from 'lucide-react';
import { PublicNavigation } from '@/components/public/PublicNavigation';
import { PublicFooter } from '@/components/public/PublicFooter';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { useDocsPages, useDocsPage, type DocsPage } from '@/hooks/useDocs';
import { DocsSidebar } from '@/components/docs/DocsSidebar';
import { DocsChat } from '@/components/docs/DocsChat';
import { DocsTOC } from '@/components/docs/DocsTOC';

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-');
}

function makeSlugger() {
  const seen = new Map<string, number>();
  return (text: string) => {
    const base = slugify(text);
    const n = seen.get(base) ?? 0;
    seen.set(base, n + 1);
    return n ? `${base}-${n}` : base;
  };
}

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

  // prev/next within same category, ordered by sort_order then title
  const { prev, next } = useMemo(() => {
    if (!page) return { prev: null as DocsPage | null, next: null as DocsPage | null };
    const siblings = pages
      .filter((p) => p.category === page.category)
      .sort((a, b) => {
        if (a.sort_order !== b.sort_order) return a.sort_order - b.sort_order;
        return a.title.localeCompare(b.title);
      });
    const idx = siblings.findIndex((p) => p.id === page.id);
    return {
      prev: idx > 0 ? siblings[idx - 1] : null,
      next: idx >= 0 && idx < siblings.length - 1 ? siblings[idx + 1] : null,
    };
  }, [page, pages]);

  // Build a slugger we can reuse to give every heading a stable id matching DocsTOC
  const headingSlugger = useMemo(makeSlugger, [page?.id]);

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

            <article className="col-span-12 lg:col-span-7 max-w-3xl">
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
                    <ReactMarkdown
                      remarkPlugins={[remarkGfm]}
                      components={{
                        h2: ({ children, ...props }) => {
                          const text = String(children);
                          return (
                            <h2 id={headingSlugger(text)} {...props}>
                              {children}
                            </h2>
                          );
                        },
                        h3: ({ children, ...props }) => {
                          const text = String(children);
                          return (
                            <h3 id={headingSlugger(text)} {...props}>
                              {children}
                            </h3>
                          );
                        },
                      }}
                    >
                      {page.content}
                    </ReactMarkdown>
                  </div>

                  {/* Prev / Next */}
                  {(prev || next) && (
                    <nav className="mt-12 grid grid-cols-1 md:grid-cols-2 gap-3">
                      {prev ? (
                        <Link to={`/docs/${prev.category}/${prev.slug}`} className="group">
                          <Card className="p-4 h-full hover:border-primary/50 transition-colors">
                            <div className="flex items-center gap-1 text-xs text-muted-foreground mb-1">
                              <ChevronLeft className="h-3 w-3" /> Previous
                            </div>
                            <div className="font-medium group-hover:text-primary transition-colors">
                              {prev.title}
                            </div>
                          </Card>
                        </Link>
                      ) : (
                        <div />
                      )}
                      {next ? (
                        <Link
                          to={`/docs/${next.category}/${next.slug}`}
                          className="group md:text-right"
                        >
                          <Card className="p-4 h-full hover:border-primary/50 transition-colors">
                            <div className="flex items-center gap-1 text-xs text-muted-foreground mb-1 md:justify-end">
                              Next <ChevronRight className="h-3 w-3" />
                            </div>
                            <div className="font-medium group-hover:text-primary transition-colors">
                              {next.title}
                            </div>
                          </Card>
                        </Link>
                      ) : (
                        <div />
                      )}
                    </nav>
                  )}

                  <footer className="mt-8 pt-6 border-t border-border flex items-center justify-between">
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

            {/* Right rail: TOC */}
            <aside className="hidden xl:block col-span-2 sticky top-20 self-start">
              {page && <DocsTOC content={page.content} />}
            </aside>
          </div>
        </div>
      </main>

      <PublicFooter />
      <DocsChat />
    </>
  );
}
