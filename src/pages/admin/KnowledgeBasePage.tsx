import { useState } from "react";
import { Link } from "react-router-dom";
import { Plus, Folder, FileText, MessageSquare, Search, MoreHorizontal, Pencil, Trash2, Eye, EyeOff } from "lucide-react";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  useKbCategories,
  useKbArticles,
  useDeleteKbCategory,
  useDeleteKbArticle,
  useKbStats,
} from "@/hooks/useKnowledgeBase";
import { KbCategoryDialog } from "@/components/admin/kb/KbCategoryDialog";

export default function KnowledgeBasePage() {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [categoryDialogOpen, setCategoryDialogOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState<string | null>(null);
  const [deleteDialog, setDeleteDialog] = useState<{ type: 'category' | 'article'; id: string } | null>(null);

  const { data: categories, isLoading: categoriesLoading } = useKbCategories();
  const { data: articles, isLoading: articlesLoading } = useKbArticles(selectedCategory || undefined);
  const { data: stats } = useKbStats();
  const deleteCategory = useDeleteKbCategory();
  const deleteArticle = useDeleteKbArticle();

  const filteredArticles = articles?.filter(article =>
    article.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
    article.question.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleDelete = () => {
    if (!deleteDialog) return;
    if (deleteDialog.type === 'category') {
      deleteCategory.mutate(deleteDialog.id);
    } else {
      deleteArticle.mutate(deleteDialog.id);
    }
    setDeleteDialog(null);
  };

  return (
    <AdminLayout>
      <div className="space-y-6">
        <AdminPageHeader
          title="Knowledge Base"
          description="Manage FAQ articles and categories for your help center and AI chat"
        >
          <Button variant="outline" onClick={() => setCategoryDialogOpen(true)}>
            <Folder className="h-4 w-4 mr-2" />
            New Category
          </Button>
          <Button asChild>
            <Link to="/admin/knowledge-base/new">
              <Plus className="h-4 w-4 mr-2" />
              New Article
            </Link>
          </Button>
        </AdminPageHeader>

        {/* Stats */}
        <div className="grid gap-4 sm:grid-cols-3">
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Categories</CardDescription>
              <CardTitle className="text-2xl">{stats?.categories ?? '—'}</CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Published Articles</CardDescription>
              <CardTitle className="text-2xl">{stats?.articles ?? '—'}</CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription className="flex items-center gap-1">
                <MessageSquare className="h-3.5 w-3.5" />
                In AI Chat Context
              </CardDescription>
              <CardTitle className="text-2xl">{stats?.chatArticles ?? '—'}</CardTitle>
            </CardHeader>
          </Card>
        </div>

        <div className="grid gap-6 lg:grid-cols-4">
          {/* Categories sidebar */}
          <Card className="lg:col-span-1">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium">Categories</CardTitle>
            </CardHeader>
            <CardContent className="space-y-1">
              {categoriesLoading ? (
                Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-9" />)
              ) : (
                <>
                  <Button
                    variant={selectedCategory === null ? "secondary" : "ghost"}
                    className="w-full justify-start"
                    onClick={() => setSelectedCategory(null)}
                  >
                    <FileText className="h-4 w-4 mr-2" />
                    All Articles
                  </Button>
                  {categories?.map(category => (
                    <div key={category.id} className="flex items-center gap-1">
                      <Button
                        variant={selectedCategory === category.id ? "secondary" : "ghost"}
                        className="flex-1 justify-start"
                        onClick={() => setSelectedCategory(category.id)}
                      >
                        <Folder className="h-4 w-4 mr-2" />
                        {category.name}
                        {!category.is_active && (
                          <Badge variant="outline" className="ml-auto text-xs">Hidden</Badge>
                        )}
                      </Button>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => setEditingCategory(category.id)}>
                            <Pencil className="h-4 w-4 mr-2" />
                            Edit
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            className="text-destructive"
                            onClick={() => setDeleteDialog({ type: 'category', id: category.id })}
                          >
                            <Trash2 className="h-4 w-4 mr-2" />
                            Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  ))}
                </>
              )}
            </CardContent>
          </Card>

          {/* Articles list */}
          <div className="lg:col-span-3 space-y-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search articles..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
              />
            </div>

            {articlesLoading ? (
              <div className="space-y-3">
                {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-20" />)}
              </div>
            ) : filteredArticles?.length === 0 ? (
              <Card>
                <CardContent className="py-12 text-center">
                  <FileText className="h-12 w-12 mx-auto text-muted-foreground/50 mb-4" />
                  <p className="text-muted-foreground">No articles found</p>
                  <Button asChild className="mt-4">
                    <Link to="/admin/knowledge-base/new">Create your first article</Link>
                  </Button>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-2">
                {filteredArticles?.map(article => (
                  <Card key={article.id} className="hover:bg-accent/50 transition-colors">
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <Link
                              to={`/admin/knowledge-base/${article.id}`}
                              className="font-medium hover:underline truncate"
                            >
                              {article.title}
                            </Link>
                            {!article.is_published && (
                              <Badge variant="secondary">Draft</Badge>
                            )}
                            {article.include_in_chat && (
                              <Badge variant="outline" className="text-xs">
                                <MessageSquare className="h-3 w-3 mr-1" />
                                AI
                              </Badge>
                            )}
                          </div>
                          <p className="text-sm text-muted-foreground line-clamp-1">
                            {article.question}
                          </p>
                          <p className="text-xs text-muted-foreground mt-1">
                            {article.category?.name}
                          </p>
                        </div>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-8 w-8">
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem asChild>
                              <Link to={`/admin/knowledge-base/${article.id}`}>
                                <Pencil className="h-4 w-4 mr-2" />
                                Edit
                              </Link>
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              className="text-destructive"
                              onClick={() => setDeleteDialog({ type: 'article', id: article.id })}
                            >
                              <Trash2 className="h-4 w-4 mr-2" />
                              Delete
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Category Dialog */}
      <KbCategoryDialog
        open={categoryDialogOpen || !!editingCategory}
        onOpenChange={(open) => {
          if (!open) {
            setCategoryDialogOpen(false);
            setEditingCategory(null);
          }
        }}
        categoryId={editingCategory}
      />

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteDialog} onOpenChange={() => setDeleteDialog(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {deleteDialog?.type}?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteDialog?.type === 'category'
                ? 'This will also delete all articles in this category. This action cannot be undone.'
                : 'This action cannot be undone.'}
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
