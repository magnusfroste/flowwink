import { useEffect, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useVisitorConsent } from '@/hooks/useVisitorConsent';

interface PublicTrackingConfig {
  google_analytics?: { enabled?: boolean; measurementId?: string | null };
  meta_pixel?: { enabled?: boolean; pixelId?: string | null };
}

/**
 * Injects GA4 and Meta Pixel tracking scripts into public pages.
 * Only loads scripts when the integration is enabled AND has a valid ID.
 *
 * This component used to read the whole `site_settings.integrations` row with
 * the visitor's own eyes — which is precisely why that row had to stay
 * anon-readable, and why a vendor `apiKey` sitting in the same JSON was
 * fetchable by anyone holding the publishable key. Two public ids do not
 * justify publishing the instance's key ring, so it now goes through
 * `get_public_tracking_config()`: a SECURITY DEFINER window with a FIXED field
 * list. Adding a new secret to the integrations JSON can never widen it.
 *
 * CONSENT (2026-08-22): these scripts used to load for EVERY visitor while the
 * site's own page-view tracker honoured `hasConsent('analytics')` — so the
 * banner asked, one tracker obeyed, and the vendor tag ignored the answer. A
 * banner that does not govern the measurement it is mostly about is
 * decoration. Both tags now wait for consent, and re-check when the visitor
 * changes their mind (`cookie-consent-changed`), so accepting later still
 * loads them without a reload.
 * Analytics tag → 'analytics'. Meta Pixel is advertising → 'marketing'.
 *
 * CONSENT, PART TWO (2026-08-23): that gate was `hasConsent`, which answers
 * "is a yes stored?" — and on an instance with the banner switched off nothing
 * ever stores one, so the answer was no forever and the tags never loaded. The
 * gate is now `useVisitorConsent`, which respects consent where consent is
 * actually collected and waits for `ready` before deciding either way. Do not
 * reach for `hasConsent` here again.
 */
export function TrackingScripts() {
  const { data: tracking } = useQuery({
    queryKey: ['public-tracking-config'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_public_tracking_config' as never);
      if (error) throw error;
      return (data as PublicTrackingConfig | null) ?? {};
    },
    staleTime: 5 * 60 * 1000,
    // An instance that never ran the migration must not throw on every page
    // view — no config simply means no tracking (Law 4: degrade, never gate).
    retry: false,
  });

  // Whether each tag may run. The hook listens for `cookie-consent-changed`,
  // so a later "accept" flips these and the effects below load the tags
  // without a reload. `ready` is false until the banner setting is known —
  // until then neither tag is loaded and neither is written off.
  const consent = useVisitorConsent();

  const ga4Loaded = useRef(false);
  const metaPixelLoaded = useRef(false);

  const ga4Config = tracking?.google_analytics;
  const metaConfig = tracking?.meta_pixel;

  const measurementId = ga4Config?.measurementId?.trim();
  const pixelId = metaConfig?.pixelId?.trim();

  // Google Analytics 4
  useEffect(() => {
    if (!consent.ready) return;
    if (!consent.analytics) return;
    if (!ga4Config?.enabled || !measurementId || ga4Loaded.current) return;

    // Load gtag.js
    const script = document.createElement('script');
    script.src = `https://www.googletagmanager.com/gtag/js?id=${measurementId}`;
    script.async = true;
    document.head.appendChild(script);

    // Initialize gtag
    const initScript = document.createElement('script');
    initScript.textContent = `
      window.dataLayer = window.dataLayer || [];
      function gtag(){dataLayer.push(arguments);}
      gtag('js', new Date());
      gtag('config', '${measurementId}');
    `;
    document.head.appendChild(initScript);

    ga4Loaded.current = true;
  }, [ga4Config?.enabled, measurementId, consent.ready, consent.analytics]);

  // Meta Pixel
  useEffect(() => {
    if (!consent.ready) return;
    if (!consent.marketing) return;
    if (!metaConfig?.enabled || !pixelId || metaPixelLoaded.current) return;

    // Initialize Meta Pixel
    const script = document.createElement('script');
    script.textContent = `
      !function(f,b,e,v,n,t,s)
      {if(f.fbq)return;n=f.fbq=function(){n.callMethod?
      n.callMethod.apply(n,arguments):n.queue.push(arguments)};
      if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';
      n.queue=[];t=b.createElement(e);t.async=!0;
      t.src=v;s=b.getElementsByTagName(e)[0];
      s.parentNode.insertBefore(t,s)}(window, document,'script',
      'https://connect.facebook.net/en_US/fbevents.js');
      fbq('init', '${pixelId}');
      fbq('track', 'PageView');
    `;
    document.head.appendChild(script);

    // Add noscript fallback
    const noscript = document.createElement('noscript');
    const img = document.createElement('img');
    img.height = 1;
    img.width = 1;
    img.style.display = 'none';
    img.src = `https://www.facebook.com/tr?id=${pixelId}&ev=PageView&noscript=1`;
    noscript.appendChild(img);
    document.body.appendChild(noscript);

    metaPixelLoaded.current = true;
  }, [metaConfig?.enabled, pixelId, consent.ready, consent.marketing]);

  return null;
}
