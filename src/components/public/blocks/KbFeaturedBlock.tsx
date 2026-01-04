import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Link } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { HelpCircle, ChevronRight } from 'lucide-react';
import { useKbSettings } from '@/hooks/useSiteSettings';

export interface KbFeaturedBlockData {
  title?: string;
  subtitle?: string;
  maxItems?: number;
  showCategory?: boolean;
  layout?: 'grid' | 'list';
  columns?: 2 | 3 | 4;
}

interface KbFeaturedBlockProps {
  data: KbFeaturedBlockData;
}

export function KbFeaturedBlock({ data }: KbFeaturedBlockProps) {
  const {
    title = 'Vanliga frågor',
    subtitle,
    maxItems = 6,
    showCategory = true,
    layout = 'grid',
    columns = 3,
  } = data;

  const { data: kbSettings } = useKbSettings();
  const kbSlug = kbSettings?.menuSlug || 'help';

  const { data: articles, isLoading } = useQuery({
    queryKey: ['kb-featured-articles', maxItems],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('kb_articles')
        .select(`
          id,
          title,
          slug,
          question,
          category:kb_categories!inner(id, name, slug, icon)
        `)
        .eq('is_published', true)
        .eq('is_featured', true)
        .order('sort_order', { ascending: true })
        .limit(maxItems);

      if (error) throw error;
      return data;
    },
  });

  const columnClass = {
    2: 'md:grid-cols-2',
    3: 'md:grid-cols-2 lg:grid-cols-3',
    4: 'md:grid-cols-2 lg:grid-cols-4',
  }[columns];

  if (isLoading) {
    return (
      <section className="py-16 px-4">
        <div className="container mx-auto max-w-6xl">
          {title && <Skeleton className="h-8 w-64 mx-auto mb-4" />}
          {subtitle && <Skeleton className="h-5 w-96 mx-auto mb-8" />}
          <div className={`grid gap-4 ${columnClass}`}>
            {Array.from({ length: maxItems }).map((_, i) => (
              <Skeleton key={i} className="h-32" />
            ))}
          </div>
        </div>
      </section>
    );
  }

  if (!articles?.length) {
    return null;
  }

  return (
    <section className="py-16 px-4">
      <div className="container mx-auto max-w-6xl">
        {(title || subtitle) && (
          <div className="text-center mb-10">
            {title && (
              <h2 className="text-3xl font-bold text-foreground mb-3">
                {title}
              </h2>
            )}
            {subtitle && (
              <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
                {subtitle}
              </p>
            )}
          </div>
        )}

        {layout === 'grid' ? (
          <div className={`grid gap-4 ${columnClass}`}>
            {articles.map((article) => (
              <Link
                key={article.id}
                to={`/${kbSlug}/${article.slug}`}
                className="group"
              >
                <Card className="h-full transition-all duration-200 hover:shadow-lg hover:border-primary/50 group-hover:-translate-y-1">
                  <CardContent className="p-5">
                    {showCategory && article.category && (
                      <Badge variant="secondary" className="mb-3 text-xs">
                        {article.category.name}
                      </Badge>
                    )}
                    <h3 className="font-semibold text-foreground group-hover:text-primary transition-colors line-clamp-2 mb-2">
                      {article.question}
                    </h3>
                    <div className="flex items-center text-sm text-primary font-medium mt-auto">
                      Läs mer
                      <ChevronRight className="h-4 w-4 ml-1 transition-transform group-hover:translate-x-1" />
                    </div>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        ) : (
          <div className="space-y-3 max-w-2xl mx-auto">
            {articles.map((article) => (
              <Link
                key={article.id}
                to={`/${kbSlug}/${article.slug}`}
                className="group block"
              >
                <div className="flex items-center gap-4 p-4 rounded-lg border bg-card hover:bg-accent/50 transition-colors">
                  <HelpCircle className="h-5 w-5 text-primary shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-foreground group-hover:text-primary transition-colors truncate">
                      {article.question}
                    </p>
                    {showCategory && article.category && (
                      <p className="text-sm text-muted-foreground">
                        {article.category.name}
                      </p>
                    )}
                  </div>
                  <ChevronRight className="h-5 w-5 text-muted-foreground group-hover:text-primary transition-colors shrink-0" />
                </div>
              </Link>
            ))}
          </div>
        )}

        <div className="text-center mt-8">
          <Link
            to={`/${kbSlug}`}
            className="inline-flex items-center text-primary hover:underline font-medium"
          >
            Visa alla artiklar
            <ChevronRight className="h-4 w-4 ml-1" />
          </Link>
        </div>
      </div>
    </section>
  );
}
