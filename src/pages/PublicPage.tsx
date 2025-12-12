import { useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Helmet } from 'react-helmet-async';
import { Loader2 } from 'lucide-react';
import type { Page, ContentBlock } from '@/types/cms';

interface HeroBlockData {
  title: string;
  subtitle?: string;
  backgroundImage?: string;
  primaryButton?: { text: string; url: string };
  secondaryButton?: { text: string; url: string };
}

interface TextBlockData {
  content: string;
  backgroundColor?: string;
}

interface CTABlockData {
  title: string;
  subtitle?: string;
  buttonText: string;
  buttonUrl: string;
  gradient?: boolean;
}

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

// Render different block types
function RenderBlock({ block }: { block: ContentBlock }) {
  switch (block.type) {
    case 'hero': {
      const data = block.data as unknown as HeroBlockData;
      if (!data.title) return null;
      return (
        <section className="relative py-24 px-6 bg-primary text-primary-foreground">
          {data.backgroundImage && (
            <div 
              className="absolute inset-0 bg-cover bg-center opacity-20"
              style={{ backgroundImage: `url(${data.backgroundImage})` }}
            />
          )}
          <div className="relative container mx-auto text-center max-w-3xl">
            <h1 className="font-serif text-5xl font-bold mb-6">{data.title}</h1>
            {data.subtitle && <p className="text-xl opacity-90 mb-8">{data.subtitle}</p>}
            <div className="flex gap-4 justify-center">
              {data.primaryButton && (
                <a href={data.primaryButton.url} className="bg-background text-foreground px-6 py-3 rounded-lg font-medium hover:opacity-90 transition-opacity">
                  {data.primaryButton.text}
                </a>
              )}
              {data.secondaryButton && (
                <a href={data.secondaryButton.url} className="border border-current px-6 py-3 rounded-lg font-medium hover:bg-primary-foreground/10 transition-colors">
                  {data.secondaryButton.text}
                </a>
              )}
            </div>
          </div>
        </section>
      );
    }
    case 'text': {
      const data = block.data as unknown as TextBlockData;
      return (
        <section className="py-12 px-6" style={{ backgroundColor: data.backgroundColor }}>
          <div 
            className="container mx-auto max-w-3xl prose prose-lg"
            dangerouslySetInnerHTML={{ __html: data.content || '' }}
          />
        </section>
      );
    }
    case 'cta': {
      const data = block.data as unknown as CTABlockData;
      if (!data.title || !data.buttonText || !data.buttonUrl) return null;
      return (
        <section className={`py-16 px-6 ${data.gradient ? 'bg-gradient-to-r from-primary to-primary/80' : 'bg-primary'} text-primary-foreground`}>
          <div className="container mx-auto text-center max-w-2xl">
            <h2 className="font-serif text-3xl font-bold mb-4">{data.title}</h2>
            {data.subtitle && <p className="text-lg opacity-90 mb-6">{data.subtitle}</p>}
            <a href={data.buttonUrl} className="inline-block bg-background text-foreground px-8 py-3 rounded-lg font-medium hover:opacity-90 transition-opacity">
              {data.buttonText}
            </a>
          </div>
        </section>
      );
    }
    default:
      return null;
  }
}

export default function PublicPage() {
  const { slug } = useParams<{ slug: string }>();

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
    enabled: !!slug,
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
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center">
          <h1 className="font-serif text-4xl font-bold mb-4">404</h1>
          <p className="text-muted-foreground mb-6">Sidan kunde inte hittas</p>
          <a href="/" className="text-primary hover:underline">Tillbaka till startsidan</a>
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
        {/* Simple Header */}
        <header className="border-b bg-card sticky top-0 z-50">
          <div className="container mx-auto px-6 py-4 flex items-center justify-between">
            <a href="/" className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-primary flex items-center justify-center">
                <span className="text-primary-foreground font-serif font-bold text-xl">S</span>
              </div>
              <span className="font-serif font-bold text-xl">Sophiahemmet</span>
            </a>
          </div>
        </header>

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
              <RenderBlock key={block.id} block={block} />
            ))
          ) : (
            <div className="py-16 px-6">
              <div className="container mx-auto max-w-3xl text-center text-muted-foreground">
                <p>Denna sida har inget innehåll ännu.</p>
              </div>
            </div>
          )}
        </main>

        {/* Footer */}
        <footer className="py-8 border-t mt-16">
          <div className="container mx-auto px-6 text-center text-sm text-muted-foreground">
            © {new Date().getFullYear()} Sophiahemmet
          </div>
        </footer>
      </div>
    </>
  );
}
