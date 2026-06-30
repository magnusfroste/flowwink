import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { ArrowRight, Calendar } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import type { LatestPostsBlockData } from '@/types/cms';

interface LatestPostsBlockProps {
  data: LatestPostsBlockData;
}

const gridCols: Record<number, string> = {
  1: 'md:grid-cols-1',
  2: 'md:grid-cols-2',
  3: 'md:grid-cols-3',
  4: 'md:grid-cols-4',
};

export function LatestPostsBlock({ data }: LatestPostsBlockProps) {
  const count = Math.min(Math.max(data.count ?? 3, 1), 6);
  const columns = data.columns ?? 3;
  const showExcerpt = data.showExcerpt ?? true;
  const showDate = data.showDate ?? true;

  const { data: posts, isLoading } = useQuery({
    queryKey: ['latest-posts-block', count, data.category ?? null],
    queryFn: async () => {
      let q = supabase
        .from('blog_posts')
        .select('id, slug, title, excerpt, featured_image, featured_image_alt, published_at')
        .eq('status', 'published')
        .order('published_at', { ascending: false })
        .limit(count);
      if (data.category) {
        // best-effort category filter; ignored silently if join shape differs
        q = q.contains('meta_json', { category: data.category });
      }
      const { data: rows, error } = await q;
      if (error) throw error;
      return rows ?? [];
    },
    staleTime: 1000 * 60 * 5,
  });

  return (
    <section className="py-12 md:py-16">
      <div className="container mx-auto px-4">
        {(data.title || data.subtitle) && (
          <div className="mb-10 text-center">
            {data.title && (
              <h2 className="font-serif text-3xl md:text-4xl font-bold mb-3">{data.title}</h2>
            )}
            {data.subtitle && (
              <p className="text-muted-foreground max-w-2xl mx-auto">{data.subtitle}</p>
            )}
          </div>
        )}

        {isLoading ? (
          <div className={`grid gap-6 ${gridCols[columns]}`}>
            {Array.from({ length: count }).map((_, i) => (
              <div key={i} className="space-y-3">
                <Skeleton className="aspect-video w-full rounded-lg" />
                <Skeleton className="h-5 w-3/4" />
                <Skeleton className="h-4 w-full" />
              </div>
            ))}
          </div>
        ) : !posts || posts.length === 0 ? (
          <p className="text-center text-muted-foreground">No posts published yet.</p>
        ) : (
          <div className={`grid gap-6 ${gridCols[columns]}`}>
            {posts.map((post) => (
              <a
                key={post.id}
                href={`/blog/${post.slug}`}
                className="group bg-card border border-border rounded-lg overflow-hidden hover:shadow-lg transition-shadow flex flex-col"
              >
                {post.featured_image && (
                  <div className="aspect-video overflow-hidden bg-muted">
                    <img
                      src={post.featured_image}
                      alt={post.featured_image_alt || post.title}
                      loading="lazy"
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                    />
                  </div>
                )}
                <div className="p-5 flex flex-col flex-1">
                  {showDate && post.published_at && (
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-2">
                      <Calendar className="h-3.5 w-3.5" />
                      <time dateTime={post.published_at}>
                        {new Date(post.published_at).toLocaleDateString(undefined, {
                          year: 'numeric',
                          month: 'short',
                          day: 'numeric',
                        })}
                      </time>
                    </div>
                  )}
                  <h3 className="font-semibold text-lg mb-2 group-hover:text-primary transition-colors line-clamp-2">
                    {post.title}
                  </h3>
                  {showExcerpt && post.excerpt && (
                    <p className="text-sm text-muted-foreground line-clamp-3 mb-4 flex-1">
                      {post.excerpt}
                    </p>
                  )}
                  <span className="inline-flex items-center gap-1 text-sm text-primary font-medium mt-auto">
                    Read more
                    <ArrowRight className="h-4 w-4 group-hover:translate-x-1 transition-transform" />
                  </span>
                </div>
              </a>
            ))}
          </div>
        )}

        {data.ctaText && (
          <div className="mt-10 text-center">
            <a
              href={data.ctaUrl || '/blog'}
              className="inline-flex items-center gap-2 text-primary font-medium hover:underline"
            >
              {data.ctaText}
              <ArrowRight className="h-4 w-4" />
            </a>
          </div>
        )}
      </div>
    </section>
  );
}
