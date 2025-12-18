import { useState } from "react";
import { useParams, useSearchParams, Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { Helmet } from "react-helmet-async";
import { PublicNavigation } from "@/components/public/PublicNavigation";
import { PublicFooter } from "@/components/public/PublicFooter";
import { BlogPostCard } from "@/components/public/BlogPostCard";
import { BlogSidebar } from "@/components/public/BlogSidebar";
import { BlogPagination } from "@/components/public/BlogPagination";
import { useBlogPosts } from "@/hooks/useBlogPosts";
import { useBlogCategory } from "@/hooks/useBlogCategories";
import { useBlogSettings, useSeoSettings } from "@/hooks/useSiteSettings";
import NotFound from "./NotFound";

export default function BlogCategoryPage() {
  const { slug } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const currentPage = parseInt(searchParams.get("page") || "1", 10);
  
  const { data: category, isLoading: categoryLoading, error: categoryError } = useBlogCategory(slug);
  const { data: blogSettings } = useBlogSettings();
  const { data: seoSettings } = useSeoSettings();
  
  const { data, isLoading } = useBlogPosts({
    status: "published",
    categorySlug: slug,
    page: currentPage,
    limit: blogSettings?.postsPerPage || 10,
  });
  
  const handlePageChange = (page: number) => {
    setSearchParams({ page: page.toString() });
    window.scrollTo({ top: 0, behavior: "smooth" });
  };
  
  if (categoryLoading) {
    return (
      <>
        <PublicNavigation />
        <main className="min-h-screen bg-background">
          <div className="container mx-auto px-4 py-12">
            <p className="text-center text-muted-foreground">Laddar...</p>
          </div>
        </main>
        <PublicFooter />
      </>
    );
  }
  
  if (categoryError || !category) {
    return <NotFound />;
  }
  
  const posts = data?.posts || [];
  const pageTitle = currentPage > 1
    ? `${category.name} - Sida ${currentPage}`
    : category.name;

  return (
    <>
      <Helmet>
        <title>{pageTitle} | {blogSettings?.archiveTitle || "Blogg"} | {seoSettings?.siteTitle || "CMS"}</title>
        {category.description && <meta name="description" content={category.description} />}
      </Helmet>
      
      <PublicNavigation />
      
      <main className="min-h-screen bg-background">
        <div className="container mx-auto px-4 py-12">
          {/* Breadcrumb */}
          <nav className="mb-6">
            <Link
              to="/blogg"
              className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              <ArrowLeft className="mr-2 h-4 w-4" />
              Tillbaka till bloggen
            </Link>
          </nav>
          
          {/* Header */}
          <div className="mb-8">
            <p className="text-sm text-muted-foreground mb-2">Kategori</p>
            <h1 className="text-4xl font-serif font-bold">{category.name}</h1>
            {category.description && (
              <p className="text-muted-foreground mt-2">{category.description}</p>
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
                  <p className="text-muted-foreground">Inga inlägg i denna kategori ännu.</p>
                </div>
              ) : (
                <>
                  <div className="space-y-4">
                    {posts.map((post) => (
                      <BlogPostCard
                        key={post.id}
                        post={post}
                        showReadingTime={blogSettings?.showReadingTime}
                      />
                    ))}
                  </div>
                  
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