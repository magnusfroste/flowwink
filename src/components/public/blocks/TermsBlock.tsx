/**
 * Terms block — published contract terms as a public surface.
 *
 * The short agreements point at versioned terms documents by exact name
 * ("Allmänna villkor v2026-08"); this block renders exactly those documents
 * from the same contract_templates rows, on whatever page and slug the
 * operator chooses. That is the point: the platform's generic public surface
 * is pages + blocks, and terms publishing must not require a hardcoded route
 * (/villkor worked only in Swedish, only because a route was written for it).
 *
 * Data lives in contract_templates behind the is_public flag; the block is
 * interface only. Anon-safe by construction: get_public_terms is a
 * SECURITY DEFINER RPC granted to anon.
 */
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { ChevronDown, Download, FileText } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { supabase } from '@/integrations/supabase/client';
import { useUiText } from '@/lib/ui-text';
import { useVisitorDateFormat } from '@/lib/visitor-date';

export interface TermsBlockData {
  title?: string;
  subtitle?: string;
  /** Offer a print/PDF copy per document. */
  showPrint?: boolean;
}

interface PublicTerm {
  id: string;
  name: string;
  description: string | null;
  body_markdown: string;
  updated_at: string;
}

interface TermsBlockProps {
  data: TermsBlockData;
}

export function TermsBlock({ data }: TermsBlockProps) {
  const { title, subtitle, showPrint = true } = data;
  const [openId, setOpenId] = useState<string | null>(null);
  const t = useUiText();
  /* Datumen låg på 'sv-SE' i koden — varje instans, varje språk. Namnbärande
     datum följer BESÖKARENS språk (docs/architecture/language.md §0). */
  const { formatDate } = useVisitorDateFormat();
  const printedMeta = (updatedAt: string) =>
    t('terms.printedMeta', 'last updated {updated}, printed {printed} from the published version')
      .replace('{updated}', formatDate(updatedAt))
      .replace('{printed}', formatDate(new Date()));

  const { data: terms = [], isLoading } = useQuery({
    queryKey: ['public-terms'],
    queryFn: async () => {
      const { data: rows, error } = await supabase.rpc('get_public_terms' as never);
      if (error) throw error;
      return (rows ?? []) as unknown as PublicTerm[];
    },
  });

  const printTerm = (term: PublicTerm) => {
    const el = document.querySelector(`[data-term-body="${term.id}"]`);
    const w = window.open('', '_blank', 'noopener,width=800,height=1000');
    if (!w || !el) return;
    w.document.write(`<!doctype html><html><head><meta charset="utf-8">
      <title>${term.name}</title>
      <style>
        body { font-family: Georgia, 'Times New Roman', serif; max-width: 44rem; margin: 2rem auto; padding: 0 1.5rem; color: #111; line-height: 1.55; }
        .meta { font-family: system-ui, sans-serif; font-size: .75rem; color: #555; margin-top: 2.5rem; border-top: 1px solid #ccc; padding-top: .75rem; }
        h1 { font-size: 1.5rem; } h2 { font-size: 1.2rem; margin-top: 1.8em; }
        table { border-collapse: collapse; width: 100%; font-size: .85em; }
        th, td { border: 1px solid #bbb; padding: .35rem .5rem; text-align: left; }
        blockquote { border-left: 3px solid #999; margin-left: 0; padding-left: 1rem; color: #444; }
      </style></head><body>
      ${el.innerHTML}
      <div class="meta">${term.name} — ${printedMeta(term.updated_at)}</div>
      </body></html>`);
    w.document.close();
    w.onload = () => w.print();
  };

  return (
    <div className="space-y-4">
      {(title || subtitle) && (
        <div className="mb-6">
          {title && <h2 className="text-3xl font-bold">{title}</h2>}
          {subtitle && <p className="text-muted-foreground mt-2">{subtitle}</p>}
        </div>
      )}

      {isLoading && (
        <div className="space-y-3">
          <Skeleton className="h-14 w-full" />
          <Skeleton className="h-14 w-full" />
          <Skeleton className="h-14 w-full" />
        </div>
      )}
      {!isLoading && terms.length === 0 && (
        <p className="text-sm text-muted-foreground">{t('terms.empty', 'No terms have been published yet.')}</p>
      )}

      {terms.map((term) => {
        const open = openId === term.id;
        return (
          <Card key={term.id}>
            <CardHeader
              className="cursor-pointer select-none py-4"
              onClick={() => setOpenId(open ? null : term.id)}
            >
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2 min-w-0">
                  <FileText className="h-4 w-4 shrink-0 text-primary" />
                  <span className="font-medium truncate">{term.name}</span>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="text-xs text-muted-foreground hidden sm:inline">
                    {t('terms.updated', 'Updated')} {formatDate(term.updated_at)}
                  </span>
                  <ChevronDown className={`h-4 w-4 transition-transform ${open ? 'rotate-180' : ''}`} />
                </div>
              </div>
              {term.description && !open && (
                <p className="text-sm text-muted-foreground mt-1 line-clamp-2">{term.description}</p>
              )}
            </CardHeader>
            {open && (
              <CardContent className="border-t pt-6">
                {showPrint && (
                  <div className="flex justify-end mb-4">
                    <Button variant="outline" size="sm" className="gap-1.5" onClick={() => printTerm(term)}>
                      <Download className="h-4 w-4" />
                      {t('terms.savePdf', 'Save as PDF')}
                    </Button>
                  </div>
                )}
                <article data-term-body={term.id} className="prose prose-sm dark:prose-invert max-w-none">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>{term.body_markdown}</ReactMarkdown>
                </article>
              </CardContent>
            )}
          </Card>
        );
      })}
    </div>
  );
}
