import { useParams, Link } from "react-router-dom";
import { ArrowLeft, Calendar, Clock, User, Share2, CheckCircle } from "lucide-react";
import { Helmet } from "react-helmet-async";
import { format } from "date-fns";
import { sv } from "date-fns/locale";
import { PublicNavigation } from "@/components/public/PublicNavigation";
import { PublicFooter } from "@/components/public/PublicFooter";
import { BlockRenderer } from "@/components/public/BlockRenderer";
import { AuthorCard } from "@/components/public/AuthorCard";
import { BlogPostCard } from "@/components/public/BlogPostCard";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { useBlogPost, useBlogPosts } from "@/hooks/useBlogPosts";
import { useBlogSettings, useSeoSettings } from "@/hooks/useSiteSettings";
import NotFound from "./NotFound";

export default function BlogPostPage() {
  const { slug } = useParams();
  const { data: post, isLoading, error } = useBlogPost(slug);
  const { data: blogSettings } = useBlogSettings();
  const { data: seoSettings } = useSeoSettings();
  
  // Related posts (same category)
  const { data: relatedData } = useBlogPosts({
    status: "published",
    categorySlug: post?.categories?.[0]?.slug,
    limit: 3,
  });
  
  const relatedPosts = (relatedData?.posts || []).filter(p => p.id !== post?.id).slice(0, 2);
  
  if (isLoading) {
    return (
      <>
        <PublicNavigation />
        <main className="min-h-screen bg-background">
          <div className="container mx-auto px-4 py-12">
            <p className="text-center text-muted-foreground">Laddar artikel...</p>
          </div>
        </main>
        <PublicFooter />
      </>
    );
  }
  
  if (error || !post) {
    return <NotFound />;
  }
  
  const publishedDate = post.published_at
    ? new Date(post.published_at)
    : new Date(post.created_at);
  
  const metaDescription = post.meta_json?.description || post.excerpt || "";
  const seoTitle = post.meta_json?.seoTitle || post.title;

  return (
    <>
      <Helmet>
        <title>{seoTitle} | {seoSettings?.siteTitle || "CMS"}</title>
        <meta name="description" content={metaDescription} />
        
        {/* Open Graph */}
        <meta property="og:type" content="article" />
        <meta property="og:title" content={seoTitle} />
        <meta property="og:description" content={metaDescription} />
        {post.featured_image && <meta property="og:image" content={post.featured_image} />}
        <meta property="article:published_time" content={publishedDate.toISOString()} />
        {post.author?.full_name && <meta property="article:author" content={post.author.full_name} />}
        
        {/* Article schema.org */}
        <script type="application/ld+json">
          {JSON.stringify({
            "@context": "https://schema.org",
            "@type": "Article",
            headline: post.title,
            description: metaDescription,
            image: post.featured_image,
            datePublished: publishedDate.toISOString(),
            dateModified: post.updated_at,
            author: post.author ? {
              "@type": "Person",
              name: post.author.full_name,
            } : undefined,
          })}
        </script>
      </Helmet>
      
      <PublicNavigation />
      
      <main className="min-h-screen bg-background">
        <article className="container mx-auto px-4 py-8 max-w-4xl">
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
          
          {/* Categories */}
          {post.categories && post.categories.length > 0 && (
            <div className="flex flex-wrap gap-2 mb-4">
              {post.categories.map((category) => (
                <Link key={category.id} to={`/blogg/kategori/${category.slug}`}>
                  <Badge variant="secondary" className="hover:bg-secondary/80">
                    {category.name}
                  </Badge>
                </Link>
              ))}
            </div>
          )}
          
          {/* Title */}
          <h1 className="text-4xl md:text-5xl font-serif font-bold mb-6 leading-tight">
            {post.title}
          </h1>
          
          {/* Meta */}
          <div className="flex flex-wrap items-center gap-4 text-sm text-muted-foreground mb-8">
            {post.author && (
              <div className="flex items-center gap-2">
                <User className="h-4 w-4" />
                <span>{post.author.full_name || post.author.email}</span>
              </div>
            )}
            <div className="flex items-center gap-2">
              <Calendar className="h-4 w-4" />
              <time dateTime={publishedDate.toISOString()}>
                {format(publishedDate, "d MMMM yyyy", { locale: sv })}
              </time>
            </div>
            {blogSettings?.showReadingTime && post.reading_time_minutes && (
              <div className="flex items-center gap-2">
                <Clock className="h-4 w-4" />
                <span>{post.reading_time_minutes} min läsning</span>
              </div>
            )}
          </div>
          
          {/* Featured Image */}
          {post.featured_image && (
            <figure className="mb-10">
              <img
                src={post.featured_image}
                alt={post.featured_image_alt || post.title}
                className="w-full rounded-lg shadow-lg"
              />
            </figure>
          )}
          
          {/* Reviewer badge */}
          {blogSettings?.showReviewer && post.reviewer && (
            <div className="bg-green-50 dark:bg-green-950 border border-green-200 dark:border-green-800 rounded-lg p-4 mb-8 flex items-center gap-3">
              <CheckCircle className="h-5 w-5 text-green-600 dark:text-green-400 shrink-0" />
              <div className="text-sm">
                <span className="text-green-800 dark:text-green-200">
                  Granskat av {post.reviewer.full_name || post.reviewer.email}
                  {post.reviewer.title && `, ${post.reviewer.title}`}
                </span>
                {post.reviewed_at && (
                  <span className="text-green-600 dark:text-green-400 ml-2">
                    ({format(new Date(post.reviewed_at), "d MMM yyyy", { locale: sv })})
                  </span>
                )}
              </div>
            </div>
          )}
          
          {/* Content */}
          <div className="prose prose-lg dark:prose-invert max-w-none mb-12">
            {post.content_json.map((block, index) => (
              <BlockRenderer key={block.id || index} block={block} />
            ))}
          </div>
          
          {/* Tags */}
          {post.tags && post.tags.length > 0 && (
            <div className="flex flex-wrap items-center gap-2 mb-8">
              <span className="text-sm text-muted-foreground">Taggar:</span>
              {post.tags.map((tag) => (
                <Link key={tag.id} to={`/blogg/tagg/${tag.slug}`}>
                  <Badge variant="outline" className="hover:bg-muted">
                    {tag.name}
                  </Badge>
                </Link>
              ))}
            </div>
          )}
          
          <Separator className="my-8" />
          
          {/* Author bio */}
          {blogSettings?.showAuthorBio && post.author && (
            <div className="mb-12">
              <h3 className="text-lg font-semibold mb-4">Om författaren</h3>
              <AuthorCard author={post.author} />
            </div>
          )}
          
          {/* Related posts */}
          {relatedPosts.length > 0 && (
            <div>
              <h3 className="text-lg font-semibold mb-4">Relaterade inlägg</h3>
              <div className="grid gap-4 md:grid-cols-2">
                {relatedPosts.map((relatedPost) => (
                  <BlogPostCard
                    key={relatedPost.id}
                    post={relatedPost}
                    showExcerpt={false}
                    showReadingTime={false}
                  />
                ))}
              </div>
            </div>
          )}
        </article>
      </main>
      
      <PublicFooter />
    </>
  );
}