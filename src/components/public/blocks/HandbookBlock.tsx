import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { cn } from '@/lib/utils';
import { Book, ChevronRight, Search } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import ReactMarkdown from 'react-markdown';

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
  raw_content: string;
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

  const { data: chapters = [], isLoading } = useQuery({
    queryKey: ['handbook-chapters-public'],
    queryFn: async () => {
      const q = supabase
        .from('handbook_chapters')
        .select('id, slug, title, sort_order, raw_content, frontmatter')
        .order('sort_order', { ascending: true });

      if (maxChapters) q.limit(maxChapters);

      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as Chapter[];
    },
  });

  const filtered = useMemo(() => {
    if (!search.trim()) return chapters;
    const q = search.toLowerCase();
    return chapters.filter(
      (c) => c.title.toLowerCase().includes(q) || c.raw_content?.toLowerCase().includes(q)
    );
  }, [chapters, search]);

  const activeChapter = chapters.find((c) => c.slug === activeSlug) ?? null;

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
          {/* TOC sidebar */}
          {showToc && (
            <ScrollArea className="w-64 flex-shrink-0 border rounded-lg bg-muted/20">
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

          {/* Content */}
          <div className="flex-1 min-w-0">
            {activeChapter ? (
              <article className="prose prose-sm dark:prose-invert max-w-none">
                <h1>{activeChapter.title}</h1>
                <ReactMarkdown>{activeChapter.raw_content}</ReactMarkdown>
              </article>
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
                    <ReactMarkdown>{ch.raw_content}</ReactMarkdown>
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
