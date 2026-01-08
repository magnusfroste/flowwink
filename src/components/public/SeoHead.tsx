import { Helmet } from 'react-helmet-async';
import { useSeoSettings, usePerformanceSettings, useCustomScriptsSettings, useAeoSettings } from '@/hooks/useSiteSettings';

interface ContentBlock {
  id: string;
  type: string;
  data?: Record<string, unknown>;
}

interface BreadcrumbItem {
  name: string;
  url: string;
}

interface SeoHeadProps {
  title?: string;
  description?: string;
  ogImage?: string;
  canonicalUrl?: string;
  noIndex?: boolean;
  noFollow?: boolean;
  // New props for structured data
  pageType?: 'page' | 'article' | 'kb-article';
  contentBlocks?: ContentBlock[];
  breadcrumbs?: BreadcrumbItem[];
  // Article-specific
  articleAuthor?: string;
  articlePublishedTime?: string;
  articleModifiedTime?: string;
  articleTags?: string[];
}

// Helper to extract FAQ items from accordion blocks
function extractFaqItems(blocks: ContentBlock[]): Array<{ question: string; answer: string }> {
  const faqItems: Array<{ question: string; answer: string }> = [];
  
  for (const block of blocks) {
    if (block.type === 'accordion' && block.data) {
      const items = block.data.items as Array<{ title?: string; content?: string }> | undefined;
      if (Array.isArray(items)) {
        for (const item of items) {
          if (item.title && item.content) {
            // Strip HTML tags from content
            const cleanContent = item.content.replace(/<[^>]*>/g, '').trim();
            if (cleanContent) {
              faqItems.push({
                question: item.title,
                answer: cleanContent
              });
            }
          }
        }
      }
    }
  }
  
  return faqItems;
}

// Generate Organization schema
function generateOrganizationSchema(aeoSettings: {
  organizationName?: string;
  shortDescription?: string;
  contactEmail?: string;
  schemaOrgType?: string;
  socialProfiles?: string[];
}, seoSettings: { ogImage?: string }) {
  if (!aeoSettings?.organizationName) return null;
  
  const schema: Record<string, unknown> = {
    '@type': aeoSettings.schemaOrgType || 'Organization',
    name: aeoSettings.organizationName,
  };
  
  if (aeoSettings.shortDescription) {
    schema.description = aeoSettings.shortDescription;
  }
  
  if (aeoSettings.contactEmail) {
    schema.email = aeoSettings.contactEmail;
  }
  
  if (seoSettings?.ogImage) {
    schema.logo = seoSettings.ogImage;
  }
  
  if (aeoSettings.socialProfiles && aeoSettings.socialProfiles.length > 0) {
    schema.sameAs = aeoSettings.socialProfiles.filter(p => p.trim());
  }
  
  return schema;
}

// Generate WebPage schema
function generateWebPageSchema(
  title: string,
  description: string,
  canonicalUrl?: string,
  organizationName?: string
) {
  const schema: Record<string, unknown> = {
    '@type': 'WebPage',
    name: title,
  };
  
  if (description) {
    schema.description = description;
  }
  
  if (canonicalUrl) {
    schema.url = canonicalUrl;
  }
  
  if (organizationName) {
    schema.isPartOf = {
      '@type': 'WebSite',
      name: organizationName
    };
  }
  
  return schema;
}

// Generate Article schema
function generateArticleSchema(
  title: string,
  description: string,
  canonicalUrl?: string,
  author?: string,
  publishedTime?: string,
  modifiedTime?: string,
  image?: string,
  tags?: string[]
) {
  const schema: Record<string, unknown> = {
    '@type': 'Article',
    headline: title,
  };
  
  if (description) {
    schema.description = description;
  }
  
  if (canonicalUrl) {
    schema.url = canonicalUrl;
    schema.mainEntityOfPage = {
      '@type': 'WebPage',
      '@id': canonicalUrl
    };
  }
  
  if (author) {
    schema.author = {
      '@type': 'Person',
      name: author
    };
  }
  
  if (publishedTime) {
    schema.datePublished = publishedTime;
  }
  
  if (modifiedTime) {
    schema.dateModified = modifiedTime;
  }
  
  if (image) {
    schema.image = image;
  }
  
  if (tags && tags.length > 0) {
    schema.keywords = tags.join(', ');
  }
  
  return schema;
}

// Generate FAQPage schema
function generateFaqSchema(faqItems: Array<{ question: string; answer: string }>) {
  if (faqItems.length === 0) return null;
  
  return {
    '@type': 'FAQPage',
    mainEntity: faqItems.map(item => ({
      '@type': 'Question',
      name: item.question,
      acceptedAnswer: {
        '@type': 'Answer',
        text: item.answer
      }
    }))
  };
}

// Generate BreadcrumbList schema
function generateBreadcrumbSchema(breadcrumbs: BreadcrumbItem[]) {
  if (breadcrumbs.length === 0) return null;
  
  return {
    '@type': 'BreadcrumbList',
    itemListElement: breadcrumbs.map((item, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: item.name,
      item: item.url
    }))
  };
}

export function SeoHead({ 
  title, 
  description, 
  ogImage,
  canonicalUrl,
  noIndex = false,
  noFollow = false,
  pageType = 'page',
  contentBlocks = [],
  breadcrumbs = [],
  articleAuthor,
  articlePublishedTime,
  articleModifiedTime,
  articleTags
}: SeoHeadProps) {
  const { data: seoSettings } = useSeoSettings();
  const { data: performanceSettings } = usePerformanceSettings();
  const { data: scriptsSettings } = useCustomScriptsSettings();
  const { data: aeoSettings } = useAeoSettings();

  const siteTitle = seoSettings?.siteTitle || 'Website';
  const titleTemplate = seoSettings?.titleTemplate || '%s';
  const finalTitle = title 
    ? titleTemplate.replace('%s', title)
    : siteTitle;
  
  const finalDescription = description || seoSettings?.defaultDescription || '';
  const finalOgImage = ogImage || seoSettings?.ogImage || '';
  
  // Development mode overrides all other settings
  const isDevelopmentMode = seoSettings?.developmentMode ?? false;
  
  // Per-page settings override global settings (unless development mode is active)
  const robotsIndex = isDevelopmentMode ? false : (noIndex ? false : (seoSettings?.robotsIndex ?? true));
  const robotsFollow = isDevelopmentMode ? false : (noFollow ? false : (seoSettings?.robotsFollow ?? true));
  const robotsContent = `${robotsIndex ? 'index' : 'noindex'}, ${robotsFollow ? 'follow' : 'nofollow'}`;

  // Generate structured data if AEO is enabled
  const generateStructuredData = () => {
    if (!aeoSettings?.enabled) return null;
    
    const schemas: Record<string, unknown>[] = [];
    
    // Always add Organization schema if configured
    const orgSchema = generateOrganizationSchema(aeoSettings, seoSettings || {});
    if (orgSchema) {
      schemas.push(orgSchema);
    }
    
    // Add page-type specific schema
    if (pageType === 'article') {
      const articleSchema = generateArticleSchema(
        title || siteTitle,
        finalDescription,
        canonicalUrl,
        articleAuthor,
        articlePublishedTime,
        articleModifiedTime,
        finalOgImage,
        articleTags
      );
      schemas.push(articleSchema);
    } else {
      const webPageSchema = generateWebPageSchema(
        title || siteTitle,
        finalDescription,
        canonicalUrl,
        aeoSettings.organizationName
      );
      schemas.push(webPageSchema);
    }
    
    // Add FAQ schema if accordion blocks exist
    const faqItems = extractFaqItems(contentBlocks);
    const faqSchema = generateFaqSchema(faqItems);
    if (faqSchema) {
      schemas.push(faqSchema);
    }
    
    // Add breadcrumb schema if breadcrumbs provided
    const breadcrumbSchema = generateBreadcrumbSchema(breadcrumbs);
    if (breadcrumbSchema) {
      schemas.push(breadcrumbSchema);
    }
    
    if (schemas.length === 0) return null;
    
    // Return as @graph for multiple schemas
    return {
      '@context': 'https://schema.org',
      '@graph': schemas
    };
  };

  const structuredData = generateStructuredData();

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
      <meta property="og:type" content={pageType === 'article' ? 'article' : 'website'} />
      {finalOgImage && <meta property="og:image" content={finalOgImage} />}
      {canonicalUrl && <meta property="og:url" content={canonicalUrl} />}
      <meta property="og:site_name" content={siteTitle} />

      {/* Article-specific Open Graph */}
      {pageType === 'article' && articlePublishedTime && (
        <meta property="article:published_time" content={articlePublishedTime} />
      )}
      {pageType === 'article' && articleModifiedTime && (
        <meta property="article:modified_time" content={articleModifiedTime} />
      )}
      {pageType === 'article' && articleAuthor && (
        <meta property="article:author" content={articleAuthor} />
      )}
      {pageType === 'article' && articleTags?.map((tag, i) => (
        <meta key={i} property="article:tag" content={tag} />
      ))}

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

      {/* Structured Data / JSON-LD */}
      {structuredData && (
        <script type="application/ld+json">
          {JSON.stringify(structuredData)}
        </script>
      )}

      {/* Custom Scripts - Head Start */}
      {scriptsSettings?.headStart && (
        <script type="text/javascript">
          {`/* Head Start Scripts */`}
        </script>
      )}
    </Helmet>
  );
}

// Separate component for injecting raw scripts into head
export function HeadScripts() {
  const { data: scriptsSettings } = useCustomScriptsSettings();

  if (!scriptsSettings?.headStart && !scriptsSettings?.headEnd) return null;

  return (
    <Helmet>
      {scriptsSettings?.headStart && (
        <script>{scriptsSettings.headStart}</script>
      )}
      {scriptsSettings?.headEnd && (
        <script>{scriptsSettings.headEnd}</script>
      )}
    </Helmet>
  );
}
