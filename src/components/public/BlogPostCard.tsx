import { Link } from "react-router-dom";
import { stripHtml } from "@/lib/utils";
import { Calendar, User, Clock } from "lucide-react";
import { useCustomerFormat } from "@/hooks/useCustomerFormat";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { BlogPost } from "@/types/cms";
import { PostPicture } from "@/components/public/PostPicture";
import { useBlogCoverStyle } from "@/hooks/useSiteSettings";
import { hasPostPicture } from "@/lib/blog-cover";

interface BlogPostCardProps {
  post: BlogPost;
  variant?: "default" | "featured" | "compact";
  showExcerpt?: boolean;
  showReadingTime?: boolean;
}

export function BlogPostCard({
  post,
  variant = "default",
  showExcerpt = true,
  showReadingTime = true,
}: BlogPostCardProps) {
  const { formatDateTime } = useCustomerFormat();
  // Photo or brand cover — the site's dial (Blog settings → Cover images).
  const coverStyle = useBlogCoverStyle();
  const hasPicture = hasPostPicture(post, coverStyle);
  const eyebrow = post.categories?.[0]?.name;
  const publishedDate = post.published_at
    ? new Date(post.published_at)
    : new Date(post.created_at);

  if (variant === "compact") {
    return (
      <Link to={post.href ?? `/blog/${post.slug}`} className="block group">
        <div className="flex gap-4 py-3">
          {hasPicture && (
            <PostPicture
              post={post}
              style={coverStyle}
              variant="thumb"
              imgClassName="w-20 h-20 object-cover rounded-md shrink-0"
              coverClassName="w-20 h-20 rounded-md shrink-0"
            />
          )}
          <div className="min-w-0">
            <h3 className="font-medium group-hover:text-primary transition-colors line-clamp-2">
              {post.title}
            </h3>
            <p className="text-sm text-muted-foreground mt-1">
              {formatDateTime(publishedDate, { year: "numeric", month: "short", day: "numeric" })}
            </p>
          </div>
        </div>
      </Link>
    );
  }

  if (variant === "featured") {
    return (
      <Link to={post.href ?? `/blog/${post.slug}`} className="block group">
        <Card className="overflow-hidden h-full hover:shadow-lg transition-shadow">
          {hasPicture && (
            <div className="aspect-[16/9] overflow-hidden">
              <PostPicture
                post={post}
                style={coverStyle}
                variant="card"
                eyebrow={eyebrow}
                imgClassName="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                coverClassName="w-full h-full"
              />
            </div>
          )}
          <CardContent className="p-6">
            {post.categories && post.categories.length > 0 && (
              <div className="flex flex-wrap gap-2 mb-3">
                {post.categories.slice(0, 2).map((category) => (
                  <Badge key={category.id} variant="secondary">
                    {category.name}
                  </Badge>
                ))}
              </div>
            )}
            
            <h2 className="text-xl sm:text-2xl font-serif font-bold group-hover:text-primary transition-colors mb-3">
              {post.title}
            </h2>
            
            {showExcerpt && post.excerpt && (
              <p className="text-muted-foreground line-clamp-3 mb-4">
                {stripHtml(post.excerpt)}
              </p>
            )}
            
            <div className="flex items-center gap-4 text-sm text-muted-foreground">
              {post.author && (
                <div className="flex items-center gap-1.5">
                  <User className="h-4 w-4" />
                  <span>{post.author.full_name || "Unknown"}</span>
                </div>
              )}
              <div className="flex items-center gap-1.5">
                <Calendar className="h-4 w-4" />
                <span>{formatDateTime(publishedDate, { year: "numeric", month: "short", day: "numeric" })}</span>
              </div>
              {showReadingTime && post.reading_time_minutes && (
                <div className="flex items-center gap-1.5">
                  <Clock className="h-4 w-4" />
                  <span>{post.reading_time_minutes} min</span>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </Link>
    );
  }

  // Default variant
  return (
    <Link to={post.href ?? `/blog/${post.slug}`} className="block group">
      <Card className="overflow-hidden h-full hover:shadow-md transition-shadow">
        <div className="flex flex-col sm:flex-row h-full">
          {hasPicture && (
            <div className="sm:w-1/3 aspect-[16/9] sm:aspect-auto overflow-hidden shrink-0">
              <PostPicture
                post={post}
                style={coverStyle}
                variant="card"
                eyebrow={eyebrow}
                imgClassName="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                coverClassName="w-full h-full min-h-[10rem]"
              />
            </div>
          )}
          <CardContent className={`p-5 flex flex-col ${hasPicture ? "sm:w-2/3" : "w-full"}`}>
            {post.categories && post.categories.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mb-2">
                {post.categories.slice(0, 2).map((category) => (
                  <Badge key={category.id} variant="outline" className="text-xs">
                    {category.name}
                  </Badge>
                ))}
              </div>
            )}
            
            <h3 className="text-lg font-serif font-semibold group-hover:text-primary transition-colors mb-2 line-clamp-2">
              {post.title}
            </h3>
            
            {showExcerpt && post.excerpt && (
              <p className="text-sm text-muted-foreground line-clamp-2 mb-3 flex-1">
                {stripHtml(post.excerpt)}
              </p>
            )}
            
            <div className="flex items-center gap-3 text-xs text-muted-foreground mt-auto">
              {post.author && (
                <span>{post.author.full_name || "Unknown"}</span>
              )}
              <span>•</span>
              <span>{formatDateTime(publishedDate, { year: "numeric", month: "short", day: "numeric" })}</span>
              {showReadingTime && post.reading_time_minutes && (
                <>
                  <span>•</span>
                  <span>{post.reading_time_minutes} min</span>
                </>
              )}
            </div>
          </CardContent>
        </div>
      </Card>
    </Link>
  );
}