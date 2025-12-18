import { useParams, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Loader2, Lock, Wrench } from 'lucide-react';
import { BlockRenderer } from '@/components/public/BlockRenderer';
import { PublicNavigation } from '@/components/public/PublicNavigation';
import { PublicFooter } from '@/components/public/PublicFooter';
import { SeoHead, HeadScripts } from '@/components/public/SeoHead';
import { BodyScripts } from '@/components/public/BodyScripts';
import { CookieBanner } from '@/components/public/CookieBanner';
import { ChatWidget } from '@/components/public/ChatWidget';
import { cn } from '@/lib/utils';
import { useSeoSettings, useMaintenanceSettings, useGeneralSettings } from '@/hooks/useSiteSettings';
import { Button } from '@/components/ui/button';
import { useEffect, useState } from 'react';
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
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const { data: generalSettings } = useGeneralSettings();
  const { data: seoSettings } = useSeoSettings();
  const { data: maintenanceSettings } = useMaintenanceSettings();
  const [user, setUser] = useState<unknown>(null);
  const [authLoading, setAuthLoading] = useState(true);

  // Use configured homepage slug, default to 'hem'
  const homepageSlug = generalSettings?.homepageSlug || 'hem';
  const pageSlug = slug || homepageSlug;

  // Check auth state for dev mode protection
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
      setAuthLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_, session) => {
      setUser(session?.user ?? null);
    });

    return () => subscription.unsubscribe();
  }, []);

  const { data: page, isLoading, error } = useQuery({
    queryKey: ['public-page', pageSlug],
    queryFn: async () => {
      try {
        // Use edge function for fetching (handles caching internally)
        const response = await fetch(
          `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/get-page?slug=${encodeURIComponent(pageSlug)}`
        );
        
        if (response.ok) {
          const pageData = await response.json();
          if (!pageData.error) {
            return parseContent(pageData);
          }
        }
        
        // If edge function fails (404 is valid), check status
        if (response.status === 404) return null;
      } catch {
        console.log('[PublicPage] Edge function unavailable, using direct DB query');
      }

      // Fallback to direct DB query
      const { data: dbData, error: dbError } = await supabase
        .from('pages')
        .select('*')
        .eq('slug', pageSlug)
        .eq('status', 'published')
        .maybeSingle();

      if (dbError) throw dbError;
      if (!dbData) return null;

      return parseContent(dbData);
    },
    staleTime: 5 * 60 * 1000, // 5 min client-side cache
  });

  if (isLoading || authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  // Maintenance mode - block unauthenticated users
  if (maintenanceSettings?.enabled && !user) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <SeoHead title={maintenanceSettings.title || 'Underhåll'} noIndex />
        <div className="text-center max-w-md px-6">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-muted mb-6">
            <Wrench className="h-8 w-8 text-muted-foreground" />
          </div>
          <h1 className="font-serif text-3xl font-bold mb-4">
            {maintenanceSettings.title || 'Webbplatsen är under underhåll'}
          </h1>
          <p className="text-muted-foreground mb-4">
            {maintenanceSettings.message || 'Vi genomför planerat underhåll just nu. Webbplatsen kommer att vara tillgänglig igen inom kort.'}
          </p>
          {maintenanceSettings.expectedEndTime && (
            <p className="text-sm text-muted-foreground mb-8">
              Beräknad sluttid: {new Date(maintenanceSettings.expectedEndTime).toLocaleString('sv-SE')}
            </p>
          )}
          <Button variant="outline" onClick={() => navigate('/auth')} size="sm">
            Logga in (administratörer)
          </Button>
        </div>
      </div>
    );
  }

  // Dev mode with auth requirement - block unauthenticated users
  if (seoSettings?.developmentMode && seoSettings?.requireAuthInDevMode && !user) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <SeoHead title="Under utveckling" noIndex />
        <div className="text-center max-w-md px-6">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-muted mb-6">
            <Lock className="h-8 w-8 text-muted-foreground" />
          </div>
          <h1 className="font-serif text-3xl font-bold mb-4">Webbplatsen är under utveckling</h1>
          <p className="text-muted-foreground mb-8">
            Den här webbplatsen är för närvarande under utveckling och endast tillgänglig för inloggade användare.
          </p>
          <Button onClick={() => navigate('/auth')} size="lg">
            Logga in
          </Button>
        </div>
      </div>
    );
  }

  if (error || !page) {
    return (
      <div className="min-h-screen bg-background">
        <SeoHead title="Sidan hittades inte" noIndex />
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
      <SeoHead 
        title={page.meta_json?.seoTitle || page.title}
        description={page.meta_json?.description}
        ogImage={page.meta_json?.og_image}
        noIndex={page.meta_json?.noIndex}
        noFollow={page.meta_json?.noFollow}
      />
      <HeadScripts />
      <BodyScripts position="start" />

      <div className="min-h-screen bg-background">
        <PublicNavigation />

        {/* Page Title - only show if showTitle !== false */}
        {page.meta_json?.showTitle !== false && (
          <div className="bg-muted/30 py-12 px-6">
            <div className={cn(
              "container mx-auto",
              page.meta_json?.titleAlignment === 'center' && "text-center"
            )}>
              <h1 className="font-serif text-4xl font-bold">{page.title}</h1>
            </div>
          </div>
        )}

        {/* Content Blocks */}
        <main>
          {page.content_json?.length > 0 ? (
            page.content_json.map((block) => (
              <BlockRenderer key={block.id} block={block} pageId={page.id} />
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
        <CookieBanner />
        <ChatWidget />
      </div>

      <BodyScripts position="end" />
    </>
  );
}