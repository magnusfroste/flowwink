import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useUiTextLanguage } from '@/lib/ui-text';
import { useSiteLanguages } from '@/hooks/useSiteSettings';
import { kbInVisitorLanguage, localizedCategoryText } from '@/lib/kb-language';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { renderToHtml } from '@/lib/tiptap-utils';

export interface KbAccordionBlockData {
  title?: string;
  subtitle?: string;
  categorySlug?: string; // Filter by specific category
  maxItems?: number;
  showCategory?: boolean;
  allowMultiple?: boolean; // Allow multiple accordions open at once
  defaultOpen?: 'none' | 'first' | 'all';
  variant?: 'default' | 'bordered' | 'minimal';
}

interface KbAccordionBlockProps {
  data: KbAccordionBlockData;
}

interface KbAccordionArticle {
  id: string;
  title: string;
  slug: string;
  question: string;
  answer_json: unknown;
  answer_text: string | null;
  /** Absent on rows written before the language rail. */
  locale?: string | null;
  translation_group_id?: string | null;
  category?: { id: string; name: string; slug: string; icon: string | null; translations?: unknown };
}

export function KbAccordionBlock({ data }: KbAccordionBlockProps) {
  const {
    title,
    subtitle,
    categorySlug,
    maxItems = 10,
    showCategory = false,
    allowMultiple = false,
    defaultOpen = 'none',
    variant = 'default',
  } = data;

  const { data: fetched, isLoading } = useQuery({
    // maxItems is applied AFTER the client-side language filter below — a DB
    // limit here would silently under-fill the block as soon as any row gets
    // filtered out on the client.
    queryKey: ['kb-accordion-articles', categorySlug],
    queryFn: async () => {
      // Ask for the language columns first and fall back to the pre-rail
      // shape: a select naming a column an un-migrated instance does not have
      // is a PostgREST error, and the fleet provably runs different schema
      // versions at once (same degrade-never-gate move as chat-context.ts).
      const fetchWith = (cols: string) => {
        let query = supabase
          .from('kb_articles')
          .select(cols)
          .eq('is_published', true)
          .eq('kb_categories.is_active', true)
          .order('sort_order', { ascending: true });
        if (categorySlug) {
          query = query.eq('kb_categories.slug', categorySlug);
        }
        return query;
      };

      let res = await fetchWith(`
          id,
          title,
          slug,
          question,
          answer_json,
          answer_text,
          locale,
          translation_group_id,
          category:kb_categories!inner(id, name, slug, icon, is_active, translations)
        `);
      if (res.error) {
        res = await fetchWith(`
          id,
          title,
          slug,
          question,
          answer_json,
          answer_text,
          category:kb_categories!inner(id, name, slug, icon, is_active)
        `);
      }

      // Filtered in the client, not in the query (see above). RLS is the gate
      // wherever the migration has landed; this only stops a logged-in staff
      // member from seeing internal articles on the PUBLIC page.
      if (res.error) throw res.error;
      return ((res.data as unknown[]) || []).filter(
        (a: any) => a.visibility !== 'internal',
      ) as KbAccordionArticle[];
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

  // Determine default open items
  const getDefaultValue = () => {
    if (!articles?.length) return undefined;
    if (defaultOpen === 'first') return allowMultiple ? [articles[0].id] : articles[0].id;
    if (defaultOpen === 'all' && allowMultiple) return articles.map(a => a.id);
    return undefined;
  };

  // Variant-specific classes
  const variantClasses = {
    default: 'bg-card border border-border rounded-lg px-6',
    bordered: 'border-2 border-border rounded-xl px-6 shadow-sm',
    minimal: 'border-b border-border',
  };

  if (isLoading) {
    return (
      <section>
        <div className="container mx-auto max-w-3xl">
          {title && <Skeleton className="h-8 w-64 mx-auto mb-4" />}
          {subtitle && <Skeleton className="h-5 w-96 mx-auto mb-8" />}
          <div className="space-y-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-16" />
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
      <div className="container mx-auto max-w-3xl">
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

        {allowMultiple ? (
          <Accordion 
            type="multiple" 
            defaultValue={getDefaultValue() as string[]} 
            className="space-y-2"
          >
            {articles.map((article) => (
              <AccordionItem
                key={article.id}
                value={article.id}
                className={variantClasses[variant] ?? variantClasses.default}
              >
                <AccordionTrigger className="text-left font-medium hover:no-underline py-4">
                  <div className="flex items-center gap-3 flex-1">
                    <span className="flex-1">{article.question}</span>
                    {showCategory && article.category && (
                      <Badge variant="secondary" className="text-xs shrink-0 mr-2">
                        {localizedCategoryText(article.category, lang, siteLang).name}
                      </Badge>
                    )}
                  </div>
                </AccordionTrigger>
                <AccordionContent className="text-muted-foreground pb-4">
                  <div 
                    className="prose prose-sm dark:prose-invert max-w-none"
                    dangerouslySetInnerHTML={{ 
                      __html: renderToHtml(article.answer_json ?? article.answer_text) 
                    }}
                  />
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        ) : (
          <Accordion 
            type="single" 
            collapsible 
            defaultValue={getDefaultValue() as string}
            className="space-y-2"
          >
            {articles.map((article) => (
              <AccordionItem
                key={article.id}
                value={article.id}
                className={variantClasses[variant] ?? variantClasses.default}
              >
                <AccordionTrigger className="text-left font-medium hover:no-underline py-4">
                  <div className="flex items-center gap-3 flex-1">
                    <span className="flex-1">{article.question}</span>
                    {showCategory && article.category && (
                      <Badge variant="secondary" className="text-xs shrink-0 mr-2">
                        {localizedCategoryText(article.category, lang, siteLang).name}
                      </Badge>
                    )}
                  </div>
                </AccordionTrigger>
                <AccordionContent className="text-muted-foreground pb-4">
                  <div 
                    className="prose prose-sm dark:prose-invert max-w-none"
                    dangerouslySetInnerHTML={{ 
                      __html: renderToHtml(article.answer_json ?? article.answer_text) 
                    }}
                  />
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        )}
      </div>
    </section>
  );
}