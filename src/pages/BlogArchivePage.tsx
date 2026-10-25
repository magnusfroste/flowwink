import { useSearchParams } from "react-router-dom";
import { useUiText, useUiTextLanguage } from '@/lib/ui-text';
import { operatorText } from '@/lib/operator-text';
import { Rss } from "lucide-react";
import { Helmet } from "react-helmet-async";
import { PublicNavigation } from "@/components/public/PublicNavigation";
import { PublicFooter } from "@/components/public/PublicFooter";
import { BlogPostCard } from "@/components/public/BlogPostCard";
import { BlogSidebar } from "@/components/public/BlogSidebar";
import { BlogPagination } from "@/components/public/BlogPagination";
import { Button } from "@/components/ui/button";
import { useBlogPosts } from "@/hooks/useBlogPosts";
import { useBlogSettings, useSeoSettings, defaultBlogSettings } from "@/hooks/useSiteSettings";
import { usePageViewTracker } from "@/hooks/usePageViewTracker";
import { useBlogLanguage } from "@/hooks/useBlogLanguage";
import { blogIndexPath } from "@/lib/language-path";
import { useSiteLanguages } from "@/hooks/useSiteSettings";
import NotFound from "./NotFound";

export default function BlogArchivePage() {
  const t = useUiText();
  const { lang, siteLang } = useUiTextLanguage();
  const [searchParams, setSearchParams] = useSearchParams();
  const currentPage = parseInt(searchParams.get("page") || "1", 10);
  // /blog in the site language, /<lang>/blog in the others (page-translations.md §9).
  const blogLang = useBlogLanguage();
  const { languages } = useSiteLanguages();
  
  // Track page view
  usePageViewTracker({
    pageSlug: 'blog',
    pageTitle: 'Blog',
  });
  
  const { data: blogSettings } = useBlogSettings();
  const { data: seoSettings } = useSeoSettings();
  
  const { data, isLoading } = useBlogPosts({
    status: "published",
    page: currentPage,
    limit: blogSettings?.postsPerPage || 10,
    language: blogLang.listLanguage,
    defaultLanguage: blogLang.defaultLanguage,
  });
  
  // Featured posts (only on first page)
  const { data: featuredData } = useBlogPosts({
    status: "published",
    featured: true,
    limit: 3,
    language: blogLang.listLanguage,
    defaultLanguage: blogLang.defaultLanguage,
  });
  
  const handlePageChange = (page: number) => {
    setSearchParams({ page: page.toString() });
    window.scrollTo({ top: 0, behavior: "smooth" });
  };
  
  const posts = data?.posts || [];
  const featuredPosts = currentPage === 1 ? (featuredData?.posts || []) : [];
  
  // Filter out featured posts from main list to avoid duplicates
  const regularPosts = currentPage === 1
    ? posts.filter(p => !featuredPosts.some(fp => fp.id === p.id))
    : posts;
  
  /* Tom sträng är AV-ratten (samma semantik som footerrubrikerna, #309):
     ?? behåller defaulten när inget satts, '' döljer synliga rubriken helt —
     arkivet har inget hero-block, så titeln är enda sättet den syns.
     <title>-taggen behåller alltid ett namn för SEO:ns skull. */
  const archiveHidden = blogSettings?.archiveTitle === '';
  // Samma regel som menyns bloggänk: operatörens ord på sajtens eget språk,
  // packet på de andra — och hookens 'Blog' är kodens, inte operatörens.
  const archiveTitle = archiveHidden ? '' : operatorText(
    blogSettings?.archiveTitle, t('nav.blog', 'Blog'), lang, siteLang, defaultBlogSettings.archiveTitle,
  );
  const seoName = archiveTitle || t('nav.blog', 'Blog');
  const pageTitle = currentPage > 1
    ? `${seoName} - Page ${currentPage}`
    : seoName;

  // The archive in every language the site has: the switcher and hreflang.
  const archiveVersions = blogLang.isMultilingual
    ? languages.map((l) => ({ slug: 'blog', locale: l, title: seoName, href: blogIndexPath(l, blogLang.defaultLanguage) }))
    : [];
  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  const rssHref = blogLang.lang === blogLang.defaultLanguage ? '/api/blog-rss' : `/api/blog-rss?lang=${encodeURIComponent(blogLang.lang)}`;

  if (!blogLang.valid) return <NotFound />;

  return (
    <>
      <Helmet>
        <title>{pageTitle} | {seoSettings?.siteTitle || "CMS"}</title>
        <meta name="description" content={`Read our latest articles and news.`} />
        {blogSettings?.rssEnabled && (
          <link
            rel="alternate"
            type="application/rss+xml"
            title={blogSettings.rssTitle || "RSS Feed"}
            href={rssHref}
          />
        )}
        <html lang={blogLang.lang} />
        {archiveVersions.map((v) => (
          <link key={v.locale} rel="alternate" hrefLang={v.locale} href={`${origin}${v.href}`} />
        ))}
      </Helmet>
      
      <PublicNavigation translations={archiveVersions} currentLocale={blogLang.lang} />
      
      <main className="pt-[var(--overlay-header-offset,0px)] min-h-screen bg-background">
        <div className="container mx-auto px-4 py-12">
          {/* Header */}
          <div className={archiveTitle
            ? "flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8"
            : "flex justify-end gap-4 mb-8"}>
            {archiveTitle && <h1 className="text-3xl md:text-4xl font-serif font-bold">{archiveTitle}</h1>}
            {blogSettings?.rssEnabled && (
              <Button variant="outline" size="sm" asChild>
                <a href={rssHref} target="_blank" rel="noopener noreferrer">
                  <Rss className="mr-2 h-4 w-4" />
                  RSS
                </a>
              </Button>
            )}
          </div>
          
          <div className="flex flex-col lg:flex-row gap-8">
            {/* Main content */}
            <div className="flex-1">
              {isLoading ? (
                <div className="text-center py-12 text-muted-foreground">
                  Loading posts...
                </div>
              ) : posts.length === 0 ? (
                <div className="text-center py-12">
                  <p className="text-muted-foreground mb-4">{t('blog.empty', 'No posts published yet.')}</p>
                </div>
              ) : (
                <>
                  {/* Featured posts */}
                  {featuredPosts.length > 0 && (
                    <div className="mb-10">
                      <h2 className="text-lg font-semibold mb-4 text-muted-foreground">Featured</h2>
                      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
                        {featuredPosts.slice(0, 2).map((post) => (
                          <BlogPostCard
                            key={post.id}
                            post={post}
                            variant="featured"
                            showReadingTime={blogSettings?.showReadingTime}
                          />
                        ))}
                      </div>
                    </div>
                  )}
                  
                  {/* Regular posts — 2-col grid on md+ for denser use of the space */}
                  <div className="grid gap-6 md:grid-cols-2">
                    {regularPosts.map((post) => (
                      <BlogPostCard
                        key={post.id}
                        post={post}
                        showReadingTime={blogSettings?.showReadingTime}
                      />
                    ))}
                  </div>

                  
                  {/* Pagination */}
                  {data && data.totalPages > 1 && (
                    <div className="mt-10">
                      <BlogPagination
                        currentPage={currentPage}
                        totalPages={data.totalPages}
                        onPageChange={handlePageChange}
                      />
                    </div>
                  )}
                </>
              )}
            </div>
            
            {/* Sidebar */}
            <div className="w-full lg:w-72 shrink-0">
              <BlogSidebar />
            </div>
          </div>
        </div>
      </main>
      
      <PublicFooter />
    </>
  );
}