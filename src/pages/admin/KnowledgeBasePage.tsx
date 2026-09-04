import { useState, useMemo, useEffect } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Plus, Folder, FileText, Search, MoreHorizontal, Pencil, Trash2, Check, X, AlertTriangle, ThumbsUp, ThumbsDown, Globe, Lock, Languages } from "lucide-react";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useWorkingLanguage } from "@/hooks/useWorkingLanguage";
import { pagesInWorkingLanguage } from "@/lib/page-language-grouping";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { renderTiptapContent } from "@/lib/tiptap-utils";
import type { KbArticle } from "@/hooks/useKnowledgeBase";

import { AdminLayout } from "@/components/admin/AdminLayout";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { AdminPageContainer } from "@/components/admin/AdminPageContainer";
import { StatCardCompact } from "@/components/admin/StatCard";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Checkbox } from "@/components/ui/checkbox";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
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
import {
  useKbCategories,
  useKbArticles,
  useDeleteKbCategory,
  useDeleteKbArticle,
  useKbStats,
  useClearKbImprovementFlag,
} from "@/hooks/useKnowledgeBase";
import { } from "@/hooks/useModules";
import { KbCategoryDialog } from "@/components/admin/kb/KbCategoryDialog";

type AudienceFilter = 'all' | 'public' | 'internal';

export default function KnowledgeBasePage() {
  const [searchQuery, setSearchQuery] = useState("");
  const [audienceFilter, setAudienceFilter] = useState<AudienceFilter>('all');
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [categoryDialogOpen, setCategoryDialogOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState<string | null>(null);
  // Read view: internal articles have no public page, so before this the EDIT
  // form was the only way for a salesperson to read what the operator wrote.
  const [readingArticle, setReadingArticle] = useState<KbArticle | null>(null);
  // `?article=<id>` opens the reading panel directly. Without it the panel was
  // only reachable by clicking a row, so nothing could link INTO it — which is
  // why FlowWork's KB citations had nowhere sensible to point (they aimed at a
  // public /kb/<slug> route that did not exist, and 404'd).
  const [searchParams, setSearchParams] = useSearchParams();
  const articleParam = searchParams.get('article');
  const [deleteDialog, setDeleteDialog] = useState<{ type: 'category' | 'article'; id: string } | null>(null);
  const [selectedArticles, setSelectedArticles] = useState<Set<string>>(new Set());

  const { data: categories, isLoading: categoriesLoading } = useKbCategories();
  const { data: articles, isLoading: articlesLoading } = useKbArticles(selectedCategory || undefined);
  const { data: stats } = useKbStats();
  const deleteCategory = useDeleteKbCategory();
  const deleteArticle = useDeleteKbArticle();
  const clearImprovementFlag = useClearKbImprovementFlag();

  // Resolve `?article=<id>` once the list has loaded. Deliberately keyed on the
  // param and the data, not on readingArticle: closing the panel clears the
  // param (below), so this cannot re-open what the user just dismissed.
  useEffect(() => {
    if (!articleParam || !articles) return;
    const match = articles.find((a) => a.id === articleParam);
    if (match) setReadingArticle(match);
  }, [articleParam, articles]);

  /** Close the reader and drop the deep-link param, so Back behaves. */
  const closeReader = () => {
    setReadingArticle(null);
    if (articleParam) {
      const next = new URLSearchParams(searchParams);
      next.delete('article');
      setSearchParams(next, { replace: true });
    }
  };

  // One row per translation group, in the working language — the same move as
  // the pages list (the grouping helper is generic over locale +
  // translation_group_id). A single-language site passes through untouched.
  const { lang: workingLang, setLang: setWorkingLang, languages } = useWorkingLanguage();
  const inWorkingLanguage = useMemo(
    () => pagesInWorkingLanguage(articles ?? [], workingLang, languages.length > 0),
    [articles, workingLang, languages],
  );

  const filteredArticles = inWorkingLanguage.filter(article => {
    const matchesSearch =
      article.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      article.question.toLowerCase().includes(searchQuery.toLowerCase());
    if (!matchesSearch) return false;
    // Rows written before the visibility column existed count as public.
    const isInternal = article.visibility === 'internal';
    if (audienceFilter === 'internal') return isInternal;
    if (audienceFilter === 'public') return !isInternal;
    return true;
  });


  const allSelected = useMemo(() => {
    if (!filteredArticles || filteredArticles.length === 0) return false;
    return filteredArticles.every(a => selectedArticles.has(a.id));
  }, [filteredArticles, selectedArticles]);

  const toggleSelectAll = () => {
    if (!filteredArticles) return;
    if (allSelected) {
      setSelectedArticles(new Set());
    } else {
      setSelectedArticles(new Set(filteredArticles.map(a => a.id)));
    }
  };

  const toggleSelect = (id: string) => {
    const next = new Set(selectedArticles);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    setSelectedArticles(next);
  };


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
      <AdminPageContainer>
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

        {/* Stats — public and internal are never merged into one number */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCardCompact
            label="Categories"
            value={stats?.categories}
            variant="default"
          />
          <StatCardCompact
            label="Published — Public"
            value={stats?.publicArticles}
            variant="default"
          />
          <StatCardCompact
            label="Published — Internal"
            value={stats?.internalArticles}
            variant="warning"
          />
          {/* What the responder can ground on for visitors — chat and mail
              alike. Published + public is the whole rule; there is no separate
              "in AI chat" switch (there was a badge; it gated nothing). */}
          <StatCardCompact
            label="Published — Public (chat & mail)"
            value={stats?.publicArticles}
            variant="primary"
          />
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
                    <div key={category.id} className="flex items-center gap-1 min-w-0">
                      <Button
                        variant={selectedCategory === category.id ? "secondary" : "ghost"}
                        className="flex-1 justify-start min-w-0 overflow-hidden"
                        onClick={() => setSelectedCategory(category.id)}
                      >
                        <Folder className="h-4 w-4 mr-2 shrink-0" />
                        <span className="truncate">{category.name}</span>
                        {!category.is_active && (
                          <Badge variant="outline" className="ml-auto text-xs shrink-0">Hidden</Badge>
                        )}
                      </Button>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0">
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
            <div className="flex flex-col gap-2 sm:flex-row">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search articles..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9"
                />
              </div>
              <ToggleGroup
                type="single"
                value={audienceFilter}
                onValueChange={(value) => value && setAudienceFilter(value as AudienceFilter)}
                className="justify-start"
              >
                <ToggleGroupItem value="all" className="border rounded-md px-3">All</ToggleGroupItem>
                <ToggleGroupItem value="public" className="border rounded-md px-3 gap-1.5">
                  <Globe className="h-3.5 w-3.5" />
                  Public
                </ToggleGroupItem>
                <ToggleGroupItem value="internal" className="border rounded-md px-3 gap-1.5">
                  <Lock className="h-3.5 w-3.5" />
                  Internal
                </ToggleGroupItem>
              </ToggleGroup>
              {languages.length > 1 && (
                <Select value={workingLang} onValueChange={setWorkingLang}>
                  <SelectTrigger className="w-full sm:w-[130px]" aria-label="Working language">
                    <Languages className="h-4 w-4 mr-2" />
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {languages.map((code) => (
                      <SelectItem key={code} value={code}>{code.toUpperCase()}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>


            {/* Bulk actions bar */}
            {selectedArticles.size > 0 && (
              <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50 border">
                <span className="text-sm font-medium">
                  {selectedArticles.size} selected
                </span>
                <div className="flex gap-2 ml-auto">
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setSelectedArticles(new Set())}
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            )}

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
                {/* Select all header */}
                {filteredArticles && filteredArticles.length > 0 && (
                  <div className="flex items-center gap-3 px-4 py-2 text-sm text-muted-foreground">
                    <Checkbox
                      checked={allSelected}
                      onCheckedChange={toggleSelectAll}
                    />
                    <span>Select all ({filteredArticles.length})</span>
                  </div>
                )}

                {filteredArticles?.map(article => (
                  <Card key={article.id} className="hover:bg-accent/50 transition-colors">
                    <CardContent className="p-4">
                      <div className="flex items-start gap-3">
                        <Checkbox
                          checked={selectedArticles.has(article.id)}
                          onCheckedChange={() => toggleSelect(article.id)}
                          className="mt-1"
                        />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <button
                              type="button"
                              onClick={() => setReadingArticle(article)}
                              className="font-medium hover:underline truncate text-left"
                            >
                              {article.title}
                            </button>
                            {article.visibility === 'internal' && (
                              <Badge className="shrink-0 bg-warning/15 text-warning border-warning/30 hover:bg-warning/15">
                                <Lock className="h-3 w-3 mr-1" />
                                Internal
                              </Badge>
                            )}
                            {!article.is_published && (
                              <Badge variant="secondary">Draft</Badge>
                            )}

                            {((article.positive_feedback_count ?? 0) + (article.negative_feedback_count ?? 0)) > 0 && (
                              <Badge variant="outline" className="text-xs gap-1">
                                <ThumbsUp className="h-3 w-3" /> {article.positive_feedback_count ?? 0}
                                <ThumbsDown className="h-3 w-3 ml-1" /> {article.negative_feedback_count ?? 0}
                              </Badge>
                            )}
                            {article.needs_improvement && (
                              <Badge variant="destructive" className="text-xs">
                                <AlertTriangle className="h-3 w-3 mr-1" />
                                Needs improvement
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
                            {article.needs_improvement && (
                              <DropdownMenuItem onClick={() => clearImprovementFlag.mutate(article.slug)}>
                                <Check className="h-4 w-4 mr-2" />
                                Mark improved (clear flag)
                              </DropdownMenuItem>
                            )}
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
      </AdminPageContainer>

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

      {/* Read view — consume the article the way a reader would, edit one click away. */}
      <Sheet open={!!readingArticle} onOpenChange={(o) => !o && closeReader()}>
        <SheetContent className="w-full sm:max-w-2xl overflow-y-auto">
          {readingArticle && (
            <>
              <SheetHeader>
                <SheetTitle className="flex items-center gap-2 text-left">
                  {readingArticle.title}
                  {readingArticle.visibility === 'internal' && (
                    <Badge className="shrink-0 bg-warning/15 text-warning border-warning/30 hover:bg-warning/15">
                      <Lock className="h-3 w-3 mr-1" />
                      Internal
                    </Badge>
                  )}
                </SheetTitle>
              </SheetHeader>
              <div className="mt-4 space-y-4">
                <p className="text-sm text-muted-foreground">{readingArticle.question}</p>
                <div
                  className="prose prose-sm dark:prose-invert max-w-none"
                  dangerouslySetInnerHTML={{ __html: renderTiptapContent(readingArticle.answer_json as never) }}
                />
                <div className="pt-4 border-t flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">
                    {readingArticle.category?.name}
                  </span>
                  <Button asChild size="sm" variant="outline">
                    <Link to={`/admin/knowledge-base/${readingArticle.id}`}>
                      <Pencil className="h-4 w-4 mr-2" />
                      Edit
                    </Link>
                  </Button>
                </div>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </AdminLayout>
  );
}
