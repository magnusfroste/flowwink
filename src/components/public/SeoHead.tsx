import { Helmet } from 'react-helmet-async';
import { useSeoSettings, usePerformanceSettings } from '@/hooks/useSiteSettings';

interface SeoHeadProps {
  title?: string;
  description?: string;
  ogImage?: string;
  canonicalUrl?: string;
  noIndex?: boolean;
}

export function SeoHead({ 
  title, 
  description, 
  ogImage,
  canonicalUrl,
  noIndex = false
}: SeoHeadProps) {
  const { data: seoSettings } = useSeoSettings();
  const { data: performanceSettings } = usePerformanceSettings();

  const siteTitle = seoSettings?.siteTitle || 'Webbplats';
  const titleTemplate = seoSettings?.titleTemplate || '%s';
  const finalTitle = title 
    ? titleTemplate.replace('%s', title)
    : siteTitle;
  
  const finalDescription = description || seoSettings?.defaultDescription || '';
  const finalOgImage = ogImage || seoSettings?.ogImage || '';
  
  const robotsIndex = noIndex ? false : (seoSettings?.robotsIndex ?? true);
  const robotsFollow = seoSettings?.robotsFollow ?? true;
  const robotsContent = `${robotsIndex ? 'index' : 'noindex'}, ${robotsFollow ? 'follow' : 'nofollow'}`;

  return (
    <Helmet>
      {/* Basic Meta */}
      <title>{finalTitle}</title>
      {finalDescription && <meta name="description" content={finalDescription} />}
      <meta name="robots" content={robotsContent} />
      
      {/* Google Verification */}
      {seoSettings?.googleSiteVerification && (
        <meta name="google-site-verification" content={seoSettings.googleSiteVerification} />
      )}

      {/* Open Graph */}
      <meta property="og:title" content={finalTitle} />
      {finalDescription && <meta property="og:description" content={finalDescription} />}
      <meta property="og:type" content="website" />
      {finalOgImage && <meta property="og:image" content={finalOgImage} />}
      {canonicalUrl && <meta property="og:url" content={canonicalUrl} />}
      <meta property="og:site_name" content={siteTitle} />

      {/* Twitter Card */}
      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:title" content={finalTitle} />
      {finalDescription && <meta name="twitter:description" content={finalDescription} />}
      {finalOgImage && <meta name="twitter:image" content={finalOgImage} />}
      {seoSettings?.twitterHandle && (
        <meta name="twitter:site" content={seoSettings.twitterHandle} />
      )}

      {/* Canonical */}
      {canonicalUrl && <link rel="canonical" href={canonicalUrl} />}

      {/* Performance hints */}
      {performanceSettings?.prefetchLinks && (
        <link rel="dns-prefetch" href="//fonts.googleapis.com" />
      )}
    </Helmet>
  );
}
