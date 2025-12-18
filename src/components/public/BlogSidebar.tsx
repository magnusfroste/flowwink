import { Link, useLocation } from "react-router-dom";
import { Tag, FolderOpen } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useBlogCategories } from "@/hooks/useBlogCategories";
import { useBlogTags } from "@/hooks/useBlogTags";

export function BlogSidebar() {
  const location = useLocation();
  const { data: categories } = useBlogCategories();
  const { data: tags } = useBlogTags();

  return (
    <aside className="space-y-6">
      {/* Categories */}
      {categories && categories.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <FolderOpen className="h-4 w-4" />
              Categories
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <nav className="space-y-1">
              {categories.map((category) => {
                const isActive = location.pathname === `/blogg/kategori/${category.slug}`;
                return (
                  <Link
                    key={category.id}
                    to={`/blogg/kategori/${category.slug}`}
                    className={`block px-3 py-2 rounded-md text-sm transition-colors ${
                      isActive
                        ? "bg-primary text-primary-foreground"
                        : "hover:bg-muted"
                    }`}
                  >
                    {category.name}
                  </Link>
                );
              })}
            </nav>
          </CardContent>
        </Card>
      )}

      {/* Tags */}
      {tags && tags.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Tag className="h-4 w-4" />
              Tags
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="flex flex-wrap gap-2">
              {tags.map((tag) => {
                const isActive = location.pathname === `/blogg/tagg/${tag.slug}`;
                return (
                  <Link key={tag.id} to={`/blogg/tagg/${tag.slug}`}>
                    <Badge
                      variant={isActive ? "default" : "outline"}
                      className="cursor-pointer hover:bg-primary hover:text-primary-foreground transition-colors"
                    >
                      {tag.name}
                    </Badge>
                  </Link>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}
    </aside>
  );
}