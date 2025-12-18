import { useState } from "react";
import { useSearchParams, Link } from "react-router-dom";
import { Rss } from "lucide-react";
import { Helmet } from "react-helmet-async";
import { PublicNavigation } from "@/components/public/PublicNavigation";
import { PublicFooter } from "@/components/public/PublicFooter";
import { BlogPostCard } from "@/components/public/BlogPostCard";
import { BlogSidebar } from "@/components/public/BlogSidebar";
import { BlogPagination } from "@/components/public/BlogPagination";
import { Button } from "@/components/ui/button";
import { useBlogPosts } from "@/hooks/useBlogPosts";
import { useBlogSettings, useSeoSettings } from "@/hooks/useSiteSettings";

export default function BlogArchivePage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const currentPage = parseInt(searchParams.get("page") || "1", 10);
  
  const { data: blogSettings } = useBlogSettings();
  const { data: seoSettings } = useSeoSettings();
  
  const { data, isLoading } = useBlogPosts({
    status: "published",
    page: currentPage,
    limit: blogSettings?.postsPerPage || 10,
  });
  
  // Featured posts (only on first page)
  const { data: featuredData } = useBlogPosts({
    status: "published",
    featured: true,
    limit: 3,
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
  
  const archiveTitle = blogSettings?.archiveTitle || "Blogg";
  const pageTitle = currentPage > 1 
    ? `${archiveTitle} - Sida ${currentPage}` 
    : archiveTitle;

  return (
    <>
      <Helmet>
        <title>{pageTitle} | {seoSettings?.siteTitle || "CMS"}</title>
        <meta name="description" content={`Läs våra senaste artiklar och nyheter.`} />
        {blogSettings?.rssEnabled && (
          <link
            rel="alternate"
            type="application/rss+xml"
            title={blogSettings.rssTitle || "RSS Feed"}
            href="/api/blog-rss"
          />
        )}
      </Helmet>
      
      <PublicNavigation />
      
      <main className="min-h-screen bg-background">
        <div className="container mx-auto px-4 py-12">
          {/* Header */}
          <div className="flex items-center justify-between mb-8">
            <h1 className="text-4xl font-serif font-bold">{archiveTitle}</h1>
            {blogSettings?.rssEnabled && (
              <Button variant="outline" size="sm" asChild>
                <a href="/api/blog-rss" target="_blank" rel="noopener noreferrer">
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
                  Laddar inlägg...
                </div>
              ) : posts.length === 0 ? (
                <div className="text-center py-12">
                  <p className="text-muted-foreground mb-4">Inga inlägg ännu.</p>
                </div>
              ) : (
                <>
                  {/* Featured posts */}
                  {featuredPosts.length > 0 && (
                    <div className="mb-10">
                      <h2 className="text-lg font-semibold mb-4 text-muted-foreground">Utvalda</h2>
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
                  
                  {/* Regular posts */}
                  <div className="space-y-4">
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