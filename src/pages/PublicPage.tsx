import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { logger } from '@/lib/logger';
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
import { TrackingScripts } from '@/components/public/TrackingScripts';
import { ComingSoonPage } from '@/components/public/ComingSoonPage';
import { SetupRequiredPage } from '@/components/public/SetupRequiredPage';
import { cn } from '@/lib/utils';
import { useSeoSettings, useMaintenanceSettings, useGeneralSettings } from '@/hooks/useSiteSettings';
import { Button } from '@/components/ui/button';
import { useEffect, useState } from 'react';
import type { Page, ContentBlock } from '@/types/cms';
import { usePageViewTracker } from '@/hooks/usePageViewTracker';
import { useAnchorScroll } from '@/hooks/useAnchorScroll';

// Special marker to distinguish connection errors from "page not found"
const CONNECTION_ERROR = Symbol('CONNECTION_ERROR');
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
  const [searchParams] = useSearchParams();
  const { data: generalSettings } = useGeneralSettings();
  const { data: seoSettings } = useSeoSettings();
  const { data: maintenanceSettings } = useMaintenanceSettings();
  const [user, setUser] = useState<unknown>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [renderError, setRenderError] = useState<Error | null>(null);

  // Handle smooth scrolling to anchors
  useAnchorScroll();

  // Check for ?setup=true to force setup wizard (dev mode)
  const forceSetup = searchParams.get('setup') === 'true';

  // Use configured homepage slug, default to 'home'
  const homepageSlug = generalSettings?.homepageSlug || 'home';
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

  // Check if any published pages exist (to detect fresh installs)
  const { data: hasAnyPages, isLoading: checkingPages } = useQuery({
    queryKey: ['has-published-pages'],
    queryFn: async (): Promise<boolean> => {
      try {
        const { count, error } = await supabase
          .from('pages')
          .select('*', { count: 'exact', head: true })
          .eq('status', 'published');
        
        if (error) {
          logger.error('[PublicPage] Error checking for pages:', error);
          return false;
        }
        
        return (count ?? 0) > 0;
      } catch (e) {
        logger.error('[PublicPage] Error checking for pages:', e);
        return false;
      }
    },
    staleTime: 5 * 60 * 1000, // 5 min cache
    retry: false,
  });

  const { data: page, isLoading } = useQuery({
    queryKey: ['public-page', pageSlug],
    queryFn: async (): Promise<Page | null | typeof CONNECTION_ERROR> => {
      logger.log('[PublicPage] Fetching page:', pageSlug);
      
      // Check if Supabase URL is configured
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      if (!supabaseUrl || supabaseUrl === 'undefined' || supabaseUrl === '') {
        logger.error('[PublicPage] Supabase URL not configured');
        return CONNECTION_ERROR;
      }

      try {
        // Use edge function for fetching (handles caching internally)
        const edgeFunctionUrl = `${supabaseUrl}/functions/v1/get-page?slug=${encodeURIComponent(pageSlug)}`;
        logger.log('[PublicPage] Trying edge function:', edgeFunctionUrl);
        
        const response = await fetch(edgeFunctionUrl);
        logger.log('[PublicPage] Edge function response status:', response.status);
        
        // If edge function returns 404, page doesn't exist - return null (not an error)
        if (response.status === 404) {
          logger.log('[PublicPage] Page not found via edge function:', pageSlug);
          return null;
        }
        
        if (response.ok) {
          const pageData = await response.json();
          logger.log('[PublicPage] Edge function returned data:', { 
            hasError: !!pageData.error, 
            hasContent: !!pageData.content_json,
            contentLength: pageData.content_json?.length 
          });
          
          if (!pageData.error) {
            const parsed = parseContent(pageData);
            logger.log('[PublicPage] Successfully parsed page data');
            return parsed;
          }
          // Edge function returned data with error field - treat as not found
          logger.log('[PublicPage] Edge function returned error:', pageData.error);
          return null;
        }
        
        // Other error status codes - fall through to direct DB query
        logger.log('[PublicPage] Edge function returned status:', response.status, '- falling back to DB');
      } catch (e) {
        logger.log('[PublicPage] Edge function unavailable, using direct DB query', e);
      }

      // Fallback to direct DB query
      logger.log('[PublicPage] Using direct DB query for:', pageSlug);
      try {
        const { data: dbData, error: dbError } = await supabase
          .from('pages')
          .select('*')
          .eq('slug', pageSlug)
          .eq('status', 'published')
          .maybeSingle();

        if (dbError) {
          logger.error('[PublicPage] DB query error:', dbError);
          
          // Check for connection-related errors
          const errorMessage = dbError.message?.toLowerCase() || '';
          const isConnectionError = 
            errorMessage.includes('fetch') ||
            errorMessage.includes('network') ||
            errorMessage.includes('connection') ||
            errorMessage.includes('failed to fetch') ||
            dbError.code === 'PGRST000' || // PostgREST connection error
            dbError.code === '42P01'; // Relation does not exist (table missing)
          
          if (isConnectionError) {
            logger.error('[PublicPage] Database connection error:', dbError);
            return CONNECTION_ERROR;
          }
          
          return null;
        }
        
        if (!dbData) {
          logger.log('[PublicPage] No page found in DB for slug:', pageSlug);
          return null;
        }

        logger.log('[PublicPage] DB query successful:', {
          hasContent: !!dbData.content_json,
          contentLength: Array.isArray(dbData.content_json) ? dbData.content_json.length : 'not-array'
        });
        
        const parsed = parseContent(dbData);
        logger.log('[PublicPage] Successfully parsed DB data');
        return parsed;
      } catch (e) {
        logger.error('[PublicPage] Unexpected error:', e);
        return CONNECTION_ERROR;
      }
    },
    staleTime: 5 * 60 * 1000, // 5 min client-side cache
    retry: false, // Don't retry on errors
    // Wait for generalSettings to load before fetching homepage (when no explicit slug)
    enabled: slug !== undefined || generalSettings !== undefined,
  });

  // Check for connection error first
  const isConnectionError = page === CONNECTION_ERROR;
  
  // Get the actual page data (null if error or not found)
  const pageData = isConnectionError ? null : page;

  // Track page view
  usePageViewTracker({
    pageId: pageData?.id,
    pageSlug: pageSlug,
    pageTitle: pageData?.title,
  });

  if (isLoading || authLoading || checkingPages) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  // Force setup wizard via ?setup=true URL parameter (for testing)
  if (forceSetup) {
    return <SetupRequiredPage />;
  }

  // Database connection error - show setup page for self-hosted users
  if (isConnectionError) {
    return <SetupRequiredPage />;
  }

  // Maintenance mode - block unauthenticated users
  if (maintenanceSettings?.enabled && !user) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <SeoHead title={maintenanceSettings.title || 'Maintenance'} noIndex />
        <div className="text-center max-w-md px-6">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-muted mb-6">
            <Wrench className="h-8 w-8 text-muted-foreground" />
          </div>
          <h1 className="font-serif text-3xl font-bold mb-4">
            {maintenanceSettings.title || 'Website is under maintenance'}
          </h1>
          <p className="text-muted-foreground mb-4">
            {maintenanceSettings.message || 'We are performing scheduled maintenance. The website will be available again shortly.'}
          </p>
          {maintenanceSettings.expectedEndTime && (
            <p className="text-sm text-muted-foreground mb-8">
              Expected end time: {new Date(maintenanceSettings.expectedEndTime).toLocaleString('en-US')}
            </p>
          )}
          <Button variant="outline" onClick={() => navigate('/auth')} size="sm">
            Sign in (administrators)
          </Button>
        </div>
      </div>
    );
  }

  // Dev mode with auth requirement - block unauthenticated users
  if (seoSettings?.developmentMode && seoSettings?.requireAuthInDevMode && !user) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <SeoHead title="Under Development" noIndex />
        <div className="text-center max-w-md px-6">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-muted mb-6">
            <Lock className="h-8 w-8 text-muted-foreground" />
          </div>
          <h1 className="font-serif text-3xl font-bold mb-4">Website is under development</h1>
          <p className="text-muted-foreground mb-8">
            This website is currently under development and only available to logged-in users.
          </p>
          <Button onClick={() => navigate('/auth')} size="lg">
            Sign in
          </Button>
        </div>
      </div>
    );
  }

  // No page found - show Coming Soon if no pages exist, otherwise 404
  if (!pageData) {
    // If no pages exist in the database at all (fresh install or template switch),
    // show Coming Soon page for all routes to avoid 404 errors during setup
    if (!hasAnyPages) {
      return <ComingSoonPage />;
    }

    // Pages exist but this specific page wasn't found - show 404
    return (
      <div className="min-h-screen bg-background">
        <SeoHead title="Page not found" noIndex />
        <PublicNavigation />
        <div className="flex items-center justify-center py-32">
          <div className="text-center">
            <h1 className="font-serif text-4xl font-bold mb-4">404</h1>
            <p className="text-muted-foreground mb-6">Page could not be found</p>
            <a href="/" className="text-primary hover:underline">Back to homepage</a>
          </div>
        </div>
      </div>
    );
  }

  // Build canonical URL
  const baseUrl = window.location.origin;
  const canonicalUrl = `${baseUrl}/${pageSlug === homepageSlug ? '' : pageSlug}`;
  
  // Build breadcrumbs for structured data
  const breadcrumbs = [
    { name: 'Hem', url: baseUrl }
  ];
  if (pageSlug !== homepageSlug) {
    breadcrumbs.push({ name: pageData.title, url: canonicalUrl });
  }

  return (
    <>
      <SeoHead 
        title={pageData.meta_json?.seoTitle || pageData.title}
        description={pageData.meta_json?.description}
        ogImage={pageData.meta_json?.og_image}
        canonicalUrl={canonicalUrl}
        noIndex={pageData.meta_json?.noIndex}
        noFollow={pageData.meta_json?.noFollow}
        pageType="page"
        contentBlocks={pageData.content_json}
        breadcrumbs={breadcrumbs}
      />
      <HeadScripts />
      <BodyScripts position="start" />

      <div className="min-h-screen bg-background">
        <PublicNavigation />

        {/* Page Title - only show if showTitle !== false */}
        {pageData.meta_json?.showTitle !== false && (
          <div className="bg-muted/30 py-12 px-6">
            <div className={cn(
              "container mx-auto",
              pageData.meta_json?.titleAlignment === 'center' && "text-center"
            )}>
              <h1 className="font-serif text-4xl font-bold">{pageData.title}</h1>
            </div>
          </div>
        )}

        {/* Content Blocks */}
        <main>
          {renderError ? (
            <div className="py-16 px-6">
              <div className="container mx-auto max-w-3xl text-center">
                <p className="text-destructive mb-2">Error rendering page content</p>
                <p className="text-sm text-muted-foreground">{renderError.message}</p>
              </div>
            </div>
          ) : pageData.content_json?.length > 0 ? (
            pageData.content_json.map((block, index) => {
              try {
                return <BlockRenderer key={block.id} block={block} pageId={pageData.id} index={index} />;
              } catch (err) {
                logger.error('[PublicPage] Error rendering block:', block.type, err);
                setRenderError(err as Error);
                return null;
              }
            })
          ) : (
            <div className="py-16 px-6">
              <div className="container mx-auto max-w-3xl text-center text-muted-foreground">
                <p>This page has no content yet.</p>
              </div>
            </div>
          )}
        </main>

        <PublicFooter />
        <CookieBanner />
        <ChatWidget />
      </div>

      <TrackingScripts />
      <BodyScripts position="end" />
    </>
  );
}