import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { generateHTML } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Link from '@tiptap/extension-link';
import { TiptapDocument } from '@/types/cms';

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

// Helper to check if content is Tiptap JSON
function isTiptapDocument(content: unknown): content is TiptapDocument {
  return typeof content === 'object' && content !== null && (content as TiptapDocument).type === 'doc';
}

// Render answer as HTML (handles both legacy plaintext and Tiptap JSON)
function renderAnswer(answer: unknown): string {
  if (!answer) return '';
  if (isTiptapDocument(answer)) {
    return generateHTML(answer, [StarterKit, Link]);
  }
  // Legacy plaintext - wrap in paragraph
  if (typeof answer === 'string') {
    return `<p>${answer}</p>`;
  }
  return '';
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

  const { data: articles, isLoading } = useQuery({
    queryKey: ['kb-accordion-articles', categorySlug, maxItems],
    queryFn: async () => {
      let query = supabase
        .from('kb_articles')
        .select(`
          id,
          title,
          slug,
          question,
          answer_json,
          answer_text,
          category:kb_categories!inner(id, name, slug, icon, is_active)
        `)
        .eq('is_published', true)
        .eq('kb_categories.is_active', true)
        .order('sort_order', { ascending: true })
        .limit(maxItems);

      if (categorySlug) {
        query = query.eq('kb_categories.slug', categorySlug);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data;
    },
  });

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
      <section className="py-16 px-4">
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
    <section className="py-16 px-4">
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
                className={variantClasses[variant]}
              >
                <AccordionTrigger className="text-left font-medium hover:no-underline py-4">
                  <div className="flex items-center gap-3 flex-1">
                    <span className="flex-1">{article.question}</span>
                    {showCategory && article.category && (
                      <Badge variant="secondary" className="text-xs shrink-0 mr-2">
                        {article.category.name}
                      </Badge>
                    )}
                  </div>
                </AccordionTrigger>
                <AccordionContent className="text-muted-foreground pb-4">
                  <div 
                    className="prose prose-sm dark:prose-invert max-w-none"
                    dangerouslySetInnerHTML={{ 
                      __html: renderAnswer(article.answer_json || article.answer_text) 
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
                className={variantClasses[variant]}
              >
                <AccordionTrigger className="text-left font-medium hover:no-underline py-4">
                  <div className="flex items-center gap-3 flex-1">
                    <span className="flex-1">{article.question}</span>
                    {showCategory && article.category && (
                      <Badge variant="secondary" className="text-xs shrink-0 mr-2">
                        {article.category.name}
                      </Badge>
                    )}
                  </div>
                </AccordionTrigger>
                <AccordionContent className="text-muted-foreground pb-4">
                  <div 
                    className="prose prose-sm dark:prose-invert max-w-none"
                    dangerouslySetInnerHTML={{ 
                      __html: renderAnswer(article.answer_json || article.answer_text) 
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