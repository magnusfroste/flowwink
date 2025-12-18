import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { Plus, Search, Filter, MoreHorizontal, Clock, Star, Trash2, Edit, Eye, FolderOpen, Settings } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { sv } from "date-fns/locale";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useBlogPosts, useDeleteBlogPost } from "@/hooks/useBlogPosts";
import { STATUS_LABELS, PageStatus } from "@/types/cms";

const statusColors: Record<PageStatus, string> = {
  draft: "bg-muted text-muted-foreground",
  reviewing: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200",
  published: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
  archived: "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200",
};

export default function BlogPostsPage() {
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [deleteId, setDeleteId] = useState<string | null>(null);
  
  const { data, isLoading } = useBlogPosts({
    status: statusFilter !== "all" ? statusFilter as PageStatus : undefined,
  });
  const deleteMutation = useDeleteBlogPost();
  
  const posts = data?.posts || [];
  
  const filteredPosts = posts.filter(post =>
    post.title.toLowerCase().includes(search.toLowerCase()) ||
    post.slug.toLowerCase().includes(search.toLowerCase())
  );
  
  const handleDelete = () => {
    if (deleteId) {
      deleteMutation.mutate(deleteId, {
        onSuccess: () => setDeleteId(null),
      });
    }
  };
  
  return (
    <AdminLayout>
      <div className="space-y-6">
        <AdminPageHeader
          title="Blog Posts"
          description="Manage your blog posts and articles"
        >
          <div className="flex items-center gap-2">
            <Button variant="outline" asChild>
              <Link to="/admin/blog/categories">
                <FolderOpen className="mr-2 h-4 w-4" />
                Categories
              </Link>
            </Button>
            <Button variant="outline" asChild>
              <Link to="/admin/blog/settings">
                <Settings className="mr-2 h-4 w-4" />
                Settings
              </Link>
            </Button>
            <Button onClick={() => navigate("/admin/blog/new")}>
              <Plus className="mr-2 h-4 w-4" />
              New Post
            </Button>
          </div>
        </AdminPageHeader>
        
        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search posts..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[180px]">
              <Filter className="mr-2 h-4 w-4" />
              <SelectValue placeholder="Filter by status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              <SelectItem value="draft">Draft</SelectItem>
              <SelectItem value="reviewing">Reviewing</SelectItem>
              <SelectItem value="published">Published</SelectItem>
              <SelectItem value="archived">Archived</SelectItem>
            </SelectContent>
          </Select>
        </div>
        
        {/* Posts list */}
        {isLoading ? (
          <div className="text-center py-12 text-muted-foreground">
            Loading posts...
          </div>
        ) : filteredPosts.length === 0 ? (
          <Card className="p-12 text-center">
            <p className="text-muted-foreground mb-4">No blog posts found</p>
            <Button onClick={() => navigate("/admin/blog/new")}>
              <Plus className="mr-2 h-4 w-4" />
              Create your first post
            </Button>
          </Card>
        ) : (
          <div className="space-y-3">
            {filteredPosts.map((post) => (
              <Card key={post.id} className="p-4 hover:shadow-md transition-shadow">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <Link
                        to={`/admin/blog/${post.id}`}
                        className="font-medium hover:underline truncate"
                      >
                        {post.title}
                      </Link>
                      {post.is_featured && (
                        <Star className="h-4 w-4 text-yellow-500 fill-yellow-500 shrink-0" />
                      )}
                    </div>
                    
                    <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                      <span className="truncate">/{post.slug}</span>
                      
                      {post.categories && post.categories.length > 0 && (
                        <>
                          <span>•</span>
                          <span>{post.categories.map(c => c.name).join(", ")}</span>
                        </>
                      )}
                      
                      {post.author && (
                        <>
                          <span>•</span>
                          <span>{post.author.full_name || post.author.email}</span>
                        </>
                      )}
                      
                      <span>•</span>
                      <span>
                        {formatDistanceToNow(new Date(post.updated_at), {
                          addSuffix: true,
                          locale: sv,
                        })}
                      </span>
                      
                      {post.reading_time_minutes && (
                        <>
                          <span>•</span>
                          <span>{post.reading_time_minutes} min read</span>
                        </>
                      )}
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-2 shrink-0">
                    {post.scheduled_at && post.status === "reviewing" && (
                      <Badge variant="outline" className="gap-1">
                        <Clock className="h-3 w-3" />
                        Scheduled
                      </Badge>
                    )}
                    
                    <Badge className={statusColors[post.status]}>
                      {STATUS_LABELS[post.status]}
                    </Badge>
                    
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon">
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => navigate(`/admin/blog/${post.id}`)}>
                          <Edit className="mr-2 h-4 w-4" />
                          Edit
                        </DropdownMenuItem>
                        {post.status === "published" && (
                          <DropdownMenuItem asChild>
                            <Link to={`/blogg/${post.slug}`} target="_blank">
                              <Eye className="mr-2 h-4 w-4" />
                              View
                            </Link>
                          </DropdownMenuItem>
                        )}
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          className="text-destructive"
                          onClick={() => setDeleteId(post.id)}
                        >
                          <Trash2 className="mr-2 h-4 w-4" />
                          Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>
      
      {/* Delete confirmation */}
      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete post?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. The post will be permanently deleted.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AdminLayout>
  );
}