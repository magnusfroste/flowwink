import { useParams, Link } from "react-router-dom";
import { ArrowLeft, Calendar, Clock, User, CheckCircle } from "lucide-react";
import { format } from "date-fns";
import { PublicNavigation } from "@/components/public/PublicNavigation";
import { PublicFooter } from "@/components/public/PublicFooter";
import { BlockRenderer } from "@/components/public/BlockRenderer";
import { AuthorCard } from "@/components/public/AuthorCard";
import { BlogPostCard } from "@/components/public/BlogPostCard";
import { SeoHead } from "@/components/public/SeoHead";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { useBlogPost, useBlogPosts } from "@/hooks/useBlogPosts";
import { useBlogSettings } from "@/hooks/useSiteSettings";
import NotFound from "./NotFound";

export default function BlogPostPage() {
  const { slug } = useParams();
  const { data: post, isLoading, error } = useBlogPost(slug);
  const { data: blogSettings } = useBlogSettings();
  
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
            <p className="text-center text-muted-foreground">Loading article...</p>
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
  
  // Build canonical URL and breadcrumbs
  const baseUrl = typeof window !== 'undefined' ? window.location.origin : '';
  const canonicalUrl = `${baseUrl}/blogg/${slug}`;
  const breadcrumbs = [
    { name: 'Hem', url: baseUrl },
    { name: 'Blogg', url: `${baseUrl}/blogg` },
    { name: post.title, url: canonicalUrl }
  ];
  
  // Extract tags for article schema
  const articleTags = post.tags?.map(t => t.name) || [];

  return (
    <>
      <SeoHead
        title={seoTitle}
        description={metaDescription}
        ogImage={post.featured_image || undefined}
        canonicalUrl={canonicalUrl}
        pageType="article"
        contentBlocks={post.content_json}
        breadcrumbs={breadcrumbs}
        articleAuthor={post.author?.full_name || undefined}
        articlePublishedTime={publishedDate.toISOString()}
        articleModifiedTime={post.updated_at}
        articleTags={articleTags}
      />
      
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
                {format(publishedDate, "d MMMM yyyy")}
              </time>
            </div>
            {blogSettings?.showReadingTime && post.reading_time_minutes && (
              <div className="flex items-center gap-2">
                <Clock className="h-4 w-4" />
                <span>{post.reading_time_minutes} min read</span>
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
                  Reviewed by {post.reviewer.full_name || post.reviewer.email}
                  {post.reviewer.title && `, ${post.reviewer.title}`}
                </span>
                {post.reviewed_at && (
                  <span className="text-green-600 dark:text-green-400 ml-2">
                    ({format(new Date(post.reviewed_at), "d MMM yyyy")})
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