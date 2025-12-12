import { useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Helmet } from 'react-helmet-async';
import { Loader2 } from 'lucide-react';
import { BlockRenderer } from '@/components/public/BlockRenderer';
import { PublicNavigation } from '@/components/public/PublicNavigation';
import { PublicFooter } from '@/components/public/PublicFooter';
import type { Page, ContentBlock } from '@/types/cms';

function parseContent(data: {
  content_json: unknown;
  meta_json: unknown;
  [key: string]: unknown;
}): Page {
  return {
    ...data,
    content_json: (data.content_json || []) as ContentBlock[],
    meta_json: (data.meta_json || {}) as Page['meta_json'],
  } as Page;
}

export default function PublicPage() {
  const { slug: paramSlug } = useParams<{ slug: string }>();
  const slug = paramSlug || 'hem';

  const { data: page, isLoading, error } = useQuery({
    queryKey: ['public-page', slug],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('pages')
        .select('*')
        .eq('slug', slug)
        .eq('status', 'published')
        .maybeSingle();

      if (error) throw error;
      if (!data) return null;

      return parseContent(data);
    },
  });

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (error || !page) {
    return (
      <div className="min-h-screen bg-background">
        <PublicNavigation />
        <div className="flex items-center justify-center py-32">
          <div className="text-center">
            <h1 className="font-serif text-4xl font-bold mb-4">404</h1>
            <p className="text-muted-foreground mb-6">Sidan kunde inte hittas</p>
            <a href="/" className="text-primary hover:underline">Tillbaka till startsidan</a>
          </div>
        </div>
      </div>
    );
  }

  return (
    <>
      <Helmet>
        <title>{page.title} | Sophiahemmet</title>
        {page.meta_json?.description && (
          <meta name="description" content={page.meta_json.description} />
        )}
        {page.meta_json?.keywords && (
          <meta name="keywords" content={page.meta_json.keywords.join(', ')} />
        )}
        <meta property="og:title" content={page.title} />
        {page.meta_json?.description && (
          <meta property="og:description" content={page.meta_json.description} />
        )}
        {page.meta_json?.og_image && (
          <meta property="og:image" content={page.meta_json.og_image} />
        )}
      </Helmet>

      <div className="min-h-screen bg-background">
        <PublicNavigation />

        {/* Page Title */}
        <div className="bg-muted/30 py-12 px-6">
          <div className="container mx-auto">
            <h1 className="font-serif text-4xl font-bold">{page.title}</h1>
          </div>
        </div>

        {/* Content Blocks */}
        <main>
          {page.content_json?.length > 0 ? (
            page.content_json.map((block) => (
              <BlockRenderer key={block.id} block={block} />
            ))
          ) : (
            <div className="py-16 px-6">
              <div className="container mx-auto max-w-3xl text-center text-muted-foreground">
                <p>Denna sida har inget innehåll ännu.</p>
              </div>
            </div>
          )}
        </main>

        <PublicFooter />
      </div>
    </>
  );
}