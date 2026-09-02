import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useUiTextLanguage } from '@/lib/ui-text';
import { useSiteLanguages } from '@/hooks/useSiteSettings';
import { kbInVisitorLanguage, localizedCategoryText } from '@/lib/kb-language';
import { Link } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { HelpCircle, ChevronRight } from 'lucide-react';
import { useKbSlug } from '@/hooks/useKbSlug';

export interface KbFeaturedBlockData {
  title?: string;
  subtitle?: string;
  maxItems?: number;
  showCategory?: boolean;
  layout?: 'grid' | 'list';
  columns?: 2 | 3 | 4;
  kbPageSlug?: string;
}

interface KbFeaturedBlockProps {
  data: KbFeaturedBlockData;
}

interface KbFeaturedArticle {
  id: string;
  title: string;
  slug: string;
  question: string;
  /** Absent on rows written before the language rail. */
  locale?: string | null;
  translation_group_id?: string | null;
  category?: { id: string; name: string; slug: string; icon: string | null; translations?: unknown };
}

export function KbFeaturedBlock({ data }: KbFeaturedBlockProps) {
  const {
    title = 'Frequently Asked Questions',
    subtitle,
    maxItems = 6,
    showCategory = true,
    layout = 'grid',
    columns = 3,
    kbPageSlug,
  } = data;

  const kbSlug = useKbSlug(kbPageSlug);

  const { data: fetched, isLoading } = useQuery({
    // maxItems is applied AFTER the client-side language filter below — a DB
    // limit here would silently under-fill the block as soon as any row gets
    // filtered out on the client.
    queryKey: ['kb-featured-articles'],
    queryFn: async () => {
      // Ask for the language columns first and fall back to the pre-rail
      // shape: a select naming a column an un-migrated instance does not have
      // is a PostgREST error, and the fleet provably runs different schema
      // versions at once (same degrade-never-gate move as chat-context.ts).
      const fetchWith = (cols: string) =>
        supabase
          .from('kb_articles')
          .select(cols)
          .eq('is_published', true)
          .eq('is_featured', true)
          .order('sort_order', { ascending: true });

      let res = await fetchWith(`
          id,
          title,
          slug,
          question,
          locale,
          translation_group_id,
          category:kb_categories!inner(id, name, slug, icon, translations)
        `);
      if (res.error) {
        res = await fetchWith(`
          id,
          title,
          slug,
          question,
          category:kb_categories!inner(id, name, slug, icon)
        `);
      }

      // Filtered in the client, not in the query (see above). RLS is the gate
      // wherever the migration has landed; this only stops a logged-in staff
      // member from seeing internal articles on the PUBLIC page.
      if (res.error) throw res.error;
      return ((res.data as unknown[]) || []).filter(
        (a: any) => a.visibility !== 'internal',
      ) as KbFeaturedArticle[];
    },
  });

  // The block answers in the language the page is being read in; a group with
  // no version in it is honestly absent rather than silently another language.
  const { lang, siteLang } = useUiTextLanguage();
  const { isMultilingual } = useSiteLanguages();
  const articles = useMemo(
    () => kbInVisitorLanguage(fetched || [], lang, siteLang, isMultilingual).slice(0, maxItems),
    [fetched, lang, siteLang, isMultilingual, maxItems],
  );

  const columnClass = {
    2: 'md:grid-cols-2',
    3: 'md:grid-cols-2 lg:grid-cols-3',
    4: 'md:grid-cols-2 lg:grid-cols-4',
  }[columns];

  if (isLoading) {
    return (
      <section>
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
    <section>
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
                to={`/kb/${article.slug}`}
                className="group"
              >
                <Card className="h-full transition-all duration-200 hover:shadow-lg hover:border-primary/50 group-hover:-translate-y-1">
                  <CardContent className="p-5">
                    {showCategory && article.category && (
                      <Badge variant="secondary" className="mb-3 text-xs">
                        {localizedCategoryText(article.category, lang, siteLang).name}
                      </Badge>
                    )}
                    <h3 className="font-semibold text-foreground group-hover:text-primary transition-colors line-clamp-2 mb-2">
                      {article.question}
                    </h3>
                    <div className="flex items-center text-sm text-accent-foreground font-medium mt-auto">
                      Read more
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
                to={`/kb/${article.slug}`}
                className="group block"
              >
                <div className="flex items-center gap-4 p-4 rounded-lg border bg-card hover:bg-accent/50 transition-colors">
                  <HelpCircle className="h-5 w-5 text-accent-foreground shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-foreground group-hover:text-primary transition-colors truncate">
                      {article.question}
                    </p>
                    {showCategory && article.category && (
                      <p className="text-sm text-muted-foreground">
                        {localizedCategoryText(article.category, lang, siteLang).name}
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
