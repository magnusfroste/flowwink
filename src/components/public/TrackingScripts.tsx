import { useEffect, useRef } from 'react';
import { useIntegrations } from '@/hooks/useIntegrations';

/**
 * Injects GA4 and Meta Pixel tracking scripts into public pages.
 * Reads config from integrations settings (not site_settings).
 * Only loads scripts when integration is enabled AND has a valid ID.
 */
export function TrackingScripts() {
  const { data: integrations } = useIntegrations();
  const ga4Loaded = useRef(false);
  const metaPixelLoaded = useRef(false);

  const ga4Config = integrations?.google_analytics;
  const metaConfig = integrations?.meta_pixel;

  const measurementId = ga4Config?.config?.measurementId?.trim();
  const pixelId = metaConfig?.config?.pixelId?.trim();

  // Google Analytics 4
  useEffect(() => {
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
  }, [ga4Config?.enabled, measurementId]);

  // Meta Pixel
  useEffect(() => {
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
  }, [metaConfig?.enabled, pixelId]);

  return null;
}
