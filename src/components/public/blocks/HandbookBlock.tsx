import { useState, useMemo, useCallback, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { cn } from '@/lib/utils';
import { Book, ChevronLeft, ChevronRight, Search, PanelLeftClose, PanelLeft } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

export interface HandbookBlockData {
  title?: string;
  subtitle?: string;
  showSearch?: boolean;
  showToc?: boolean;
  maxChapters?: number;
  layout?: 'sidebar' | 'accordion';
}

interface HandbookBlockProps {
  data: HandbookBlockData;
}

interface Chapter {
  id: string;
  slug: string;
  title: string;
  sort_order: number;
  content: string;
  frontmatter: Record<string, unknown> | null;
}

export function HandbookBlock({ data }: HandbookBlockProps) {
  const {
    title = 'Handbook',
    subtitle,
    showSearch = true,
    showToc = true,
    maxChapters,
    layout = 'sidebar',
  } = data;

  const [activeSlug, setActiveSlug] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [tocCollapsed, setTocCollapsed] = useState(false);

  const { data: chapters = [], isLoading } = useQuery({
    queryKey: ['handbook-chapters-public'],
    queryFn: async () => {
      const q = supabase
        .from('handbook_chapters')
        .select('id, slug, title, sort_order, content, frontmatter')
        .order('sort_order', { ascending: true });

      if (maxChapters) q.limit(maxChapters);

      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as Chapter[];
    },
  });

  // Auto-select foreword (first chapter) when chapters load
  useEffect(() => {
    if (chapters.length > 0 && !activeSlug) {
      setActiveSlug(chapters[0].slug);
    }
  }, [chapters, activeSlug]);

  const filtered = useMemo(() => {
    if (!search.trim()) return chapters;
    const q = search.toLowerCase();
    return chapters.filter(
      (c) => c.title.toLowerCase().includes(q) || c.content?.toLowerCase().includes(q)
    );
  }, [chapters, search]);

  const activeChapter = chapters.find((c) => c.slug === activeSlug) ?? null;
  const activeIndex = activeChapter ? chapters.indexOf(activeChapter) : -1;
  const prevChapter = activeIndex > 0 ? chapters[activeIndex - 1] : null;
  const nextChapter = activeIndex >= 0 && activeIndex < chapters.length - 1 ? chapters[activeIndex + 1] : null;

  const navigateToSlug = useCallback((slug: string) => {
    setActiveSlug(slug);
    document.getElementById('handbook-content')?.scrollTo(0, 0);
  }, []);

  const markdownComponents = useMemo(() => ({
    a: ({ href, children, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { children?: React.ReactNode }) => {
      if (href && href.endsWith('.md')) {
        const slug = href.replace(/^.*\//, '').replace(/\.md$/, '');
        const target = chapters.find((c) => c.slug === slug);
        if (target) {
          return (
            <button
              className="text-primary underline hover:text-primary/80 transition-colors"
              onClick={() => navigateToSlug(slug)}
            >
              {children}
            </button>
          );
        }
      }
      return <a href={href} target="_blank" rel="noopener noreferrer" {...props}>{children}</a>;
    },
    table: ({ children, ...props }: React.HTMLAttributes<HTMLTableElement> & { children?: React.ReactNode }) => (
      <div className="overflow-x-auto my-4">
        <table className="min-w-full border border-border text-sm" {...props}>{children}</table>
      </div>
    ),
    th: ({ children, ...props }: React.ThHTMLAttributes<HTMLTableCellElement> & { children?: React.ReactNode }) => (
      <th className="border border-border bg-muted/50 px-3 py-2 text-left font-semibold" {...props}>{children}</th>
    ),
    td: ({ children, ...props }: React.TdHTMLAttributes<HTMLTableCellElement> & { children?: React.ReactNode }) => (
      <td className="border border-border px-3 py-2" {...props}>{children}</td>
    ),
  }), [chapters, navigateToSlug]);

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-48" />
        <div className="grid grid-cols-4 gap-4">
          <Skeleton className="h-64 col-span-1" />
          <Skeleton className="h-64 col-span-3" />
        </div>
      </div>
    );
  }

  if (chapters.length === 0) {
    return (
      <div className="text-center py-12">
        <Book className="h-10 w-10 mx-auto text-muted-foreground/40 mb-3" />
        <p className="text-muted-foreground">No handbook chapters synced yet.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="space-y-2">
        <h2 className="text-2xl font-bold tracking-tight text-foreground">{title}</h2>
        {subtitle && <p className="text-muted-foreground">{subtitle}</p>}
      </div>

      {showSearch && (
        <div className="relative max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search chapters…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
      )}

      {layout === 'sidebar' ? (
        <div className="flex gap-6 min-h-[400px]">
          {/* Collapsible TOC sidebar */}
          {showToc && (
            <div className={cn(
              'flex-shrink-0 transition-all duration-300 ease-in-out',
              tocCollapsed ? 'w-10' : 'w-64'
            )}>
              <div className="border rounded-lg bg-muted/20 h-full relative">
                {/* Toggle button */}
                <Button
                  variant="ghost"
                  size="icon"
                  className="absolute -right-3 top-3 z-10 h-6 w-6 rounded-full border bg-background shadow-sm hover:bg-muted"
                  onClick={() => setTocCollapsed(!tocCollapsed)}
                >
                  {tocCollapsed ? (
                    <PanelLeft className="h-3 w-3" />
                  ) : (
                    <PanelLeftClose className="h-3 w-3" />
                  )}
                </Button>

                {!tocCollapsed && (
                  <ScrollArea className="h-full">
                    <nav className="p-3 space-y-0.5">
                      {filtered.map((ch) => (
                        <button
                          key={ch.slug}
                          onClick={() => setActiveSlug(ch.slug)}
                          className={cn(
                            'w-full text-left px-3 py-2 rounded-md text-sm transition-colors flex items-center gap-2',
                            'hover:bg-muted',
                            activeSlug === ch.slug
                              ? 'bg-primary/10 text-primary font-medium'
                              : 'text-muted-foreground'
                          )}
                        >
                          <ChevronRight
                            className={cn(
                              'h-3 w-3 flex-shrink-0 transition-transform',
                              activeSlug === ch.slug && 'rotate-90'
                            )}
                          />
                          <span className="truncate">{ch.title}</span>
                        </button>
                      ))}
                    </nav>
                  </ScrollArea>
                )}
              </div>
            </div>
          )}

          {/* Content */}
          <div className="flex-1 min-w-0" id="handbook-content">
            {activeChapter ? (
              <div className="space-y-8">
                <article className="prose prose-sm dark:prose-invert max-w-none">
                  <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>{activeChapter.content}</ReactMarkdown>
                </article>

                {/* Prev / Next navigation */}
                <nav className="flex items-center justify-between border-t pt-6">
                  {prevChapter ? (
                    <button
                      onClick={() => navigateToSlug(prevChapter.slug)}
                      className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
                    >
                      <ChevronLeft className="h-4 w-4" />
                      <div className="text-left">
                        <span className="text-xs text-muted-foreground/60 block">Previous</span>
                        <span className="font-medium">{prevChapter.title}</span>
                      </div>
                    </button>
                  ) : <div />}
                  {nextChapter ? (
                    <button
                      onClick={() => navigateToSlug(nextChapter.slug)}
                      className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors text-right"
                    >
                      <div>
                        <span className="text-xs text-muted-foreground/60 block">Next</span>
                        <span className="font-medium">{nextChapter.title}</span>
                      </div>
                      <ChevronRight className="h-4 w-4" />
                    </button>
                  ) : <div />}
                </nav>
              </div>
            ) : (
              <div className="flex items-center justify-center h-full text-muted-foreground">
                <div className="text-center space-y-2">
                  <Book className="h-8 w-8 mx-auto opacity-40" />
                  <p className="text-sm">Select a chapter to start reading</p>
                </div>
              </div>
            )}
          </div>
        </div>
      ) : (
        /* Accordion layout */
        <div className="space-y-2">
          {filtered.map((ch) => (
            <div key={ch.slug} className="border rounded-lg overflow-hidden">
              <button
                onClick={() => setActiveSlug(activeSlug === ch.slug ? null : ch.slug)}
                className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-muted/50 transition-colors"
              >
                <span className="font-medium text-sm">{ch.title}</span>
                <ChevronRight
                  className={cn(
                    'h-4 w-4 text-muted-foreground transition-transform',
                    activeSlug === ch.slug && 'rotate-90'
                  )}
                />
              </button>
              {activeSlug === ch.slug && (
                <div className="px-4 pb-4 border-t">
                  <article className="prose prose-sm dark:prose-invert max-w-none pt-4">
                    <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>{ch.content}</ReactMarkdown>
                  </article>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
