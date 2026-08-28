import { useParams, Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { PublicNavigation } from '@/components/public/PublicNavigation';
import { PublicFooter } from '@/components/public/PublicFooter';
import { SeoHead } from '@/components/public/SeoHead';
import { Badge } from '@/components/ui/badge';
import { useKbArticleBySlug } from '@/hooks/useKnowledgeBase';
import { usePageViewTracker } from '@/hooks/usePageViewTracker';
import { renderToHtml } from '@/lib/tiptap-utils';
import NotFound from './NotFound';

/**
 * A knowledge base article at its own public address.
 *
 * Until now a KB article had no URL of its own. The hub block rendered every
 * question and answer inline, and its "read more" links pointed at
 * `/<kb-page>/<article>` — a two-segment path no route matched, so it 404'd.
 * The indexer and the manage_kb_article skill both stamped `/kb/<slug>`, which
 * also matched nothing. Three components, three opinions, no address.
 *
 * This is the address. `/kb/:slug`, modelled on `/blog/:slug`: the article
 * belongs to the article, not to whichever page happens to carry the block.
 * That makes it shareable, linkable from chat answers, and indexable by search
 * engines — and it makes the URL those two writers already emit come true.
 */
export default function KbArticlePage() {
  const { slug } = useParams<{ slug: string }>();
  const { data: article, isLoading } = useKbArticleBySlug(slug);

  usePageViewTracker({
    pageId: article?.id,
    pageSlug: slug ? `kb/${slug}` : 'kb',
    pageTitle: article?.title,
  });

  if (isLoading) {
    return (
      <>
        <PublicNavigation />
        <main className="pt-[var(--overlay-header-offset,0px)] min-h-screen bg-background">
          <div className="container mx-auto px-4 py-12">
            <p className="text-center text-muted-foreground">Loading article…</p>
          </div>
        </main>
        <PublicFooter />
      </>
    );
  }

  // Unpublished or unknown slug both land here — a draft must not be readable
  // by guessing its address.
  if (!article) return <NotFound />;

  const baseUrl = typeof window !== 'undefined' ? window.location.origin : '';
  const category = (article as { category?: { name?: string; slug?: string } }).category;
  const bodyHtml = renderToHtml(article.answer_json) || '';

  return (
    <>
      <SeoHead
        title={article.title}
        description={article.question || article.answer_text?.slice(0, 155) || ''}
        canonicalUrl={`${baseUrl}/kb/${article.slug}`}
      />
      <PublicNavigation />
      <main className="pt-[var(--overlay-header-offset,0px)] min-h-screen bg-background">
        <article className="container mx-auto max-w-3xl px-4 py-12 md:py-16">
          <Link
            to="/kb"
            className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-6"
          >
            <ArrowLeft className="h-4 w-4" />
            Knowledge Base
          </Link>

          {category?.name && (
            <Badge variant="secondary" className="mb-3">{category.name}</Badge>
          )}

          <h1 className="font-serif text-3xl md:text-4xl font-semibold tracking-tight">
            {article.title}
          </h1>

          {article.question && article.question !== article.title && (
            <p className="mt-3 text-lg text-muted-foreground">{article.question}</p>
          )}

          {bodyHtml ? (
            <div
              className="prose prose-neutral dark:prose-invert max-w-none mt-8"
              dangerouslySetInnerHTML={{ __html: bodyHtml }}
            />
          ) : (
            <p className="mt-8 whitespace-pre-wrap leading-relaxed">{article.answer_text}</p>
          )}
        </article>
      </main>
      <PublicFooter />
    </>
  );
}
