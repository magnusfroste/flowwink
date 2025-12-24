import { useState, useEffect, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Save, ArrowLeft, Send, Check, Star, StarOff, Eye, Settings2, Undo2, Redo2 } from "lucide-react";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { BlockEditor } from "@/components/admin/blocks/BlockEditor";
import { ImagePickerField } from "@/components/admin/ImagePickerField";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { useUndoRedo } from "@/hooks/useUndoRedo";
import { useUndoRedoKeyboard } from "@/hooks/useUndoRedoKeyboard";
import {
  useBlogPost,
  useCreateBlogPost,
  useUpdateBlogPost,
  useUpdateBlogPostStatus,
  useAuthors,
} from "@/hooks/useBlogPosts";
import { useBlogCategories } from "@/hooks/useBlogCategories";
import { useBlogTags, useGetOrCreateBlogTag } from "@/hooks/useBlogTags";
import { useBlogSettings } from "@/hooks/useSiteSettings";
import type { ContentBlock, PageStatus, BlogPostMeta } from "@/types/cms";

function generateSlug(title: string): string {
  return title
    .toLowerCase()
    .replace(/[åä]/g, "a")
    .replace(/ö/g, "o")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

export default function BlogPostEditorPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { user, role, isAdmin, isApprover } = useAuth();
  const isNew = !id || id === "new";
  
  const { data: post, isLoading } = useBlogPost(isNew ? undefined : id);
  const { data: blogSettings } = useBlogSettings();
  const { data: authors } = useAuthors();
  const { data: categories } = useBlogCategories();
  const { data: tags } = useBlogTags();
  
  const createMutation = useCreateBlogPost();
  const updateMutation = useUpdateBlogPost();
  const statusMutation = useUpdateBlogPostStatus();
  const getOrCreateTag = useGetOrCreateBlogTag();
  
  // Form state
  const [title, setTitle] = useState("");
  const [slug, setSlug] = useState("");
  const [excerpt, setExcerpt] = useState("");
  const [featuredImage, setFeaturedImage] = useState("");
  const [featuredImageAlt, setFeaturedImageAlt] = useState("");
  const [authorId, setAuthorId] = useState<string>("");
  const [reviewerId, setReviewerId] = useState<string>("");
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [isFeatured, setIsFeatured] = useState(false);
  const [meta, setMeta] = useState<BlogPostMeta>({});
  const [newTagInput, setNewTagInput] = useState("");
  
  const [hasChanges, setHasChanges] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // Undo/Redo for content blocks
  const {
    present: content,
    set: setContent,
    undo,
    redo,
    reset: resetContent,
    canUndo,
    canRedo,
  } = useUndoRedo<ContentBlock[]>({ initialValue: [], maxHistory: 50 });

  // Keyboard shortcuts for undo/redo
  useUndoRedoKeyboard({ undo, redo, canUndo, canRedo });
  
  // Load post data
  useEffect(() => {
    if (post) {
      setTitle(post.title);
      setSlug(post.slug);
      setExcerpt(post.excerpt || "");
      resetContent(structuredClone(post.content_json));
      setFeaturedImage(post.featured_image || "");
      setFeaturedImageAlt(post.featured_image_alt || "");
      setAuthorId(post.author_id || "");
      setReviewerId(post.reviewer_id || "");
      setSelectedCategories(post.categories?.map(c => c.id) || []);
      setSelectedTags(post.tags?.map(t => t.id) || []);
      setIsFeatured(post.is_featured);
      setMeta(post.meta_json || {});
    } else if (isNew && user) {
      setAuthorId(user.id);
    }
  }, [post, isNew, user]);
  
  // Track changes
  useEffect(() => {
    if (isNew) {
      // For new posts, any title means there are changes to save
      setHasChanges(title.trim().length > 0);
    } else if (post) {
      // For existing posts, compare against saved values
      const changed =
        title !== post.title ||
        slug !== post.slug ||
        excerpt !== (post.excerpt || "") ||
        JSON.stringify(content) !== JSON.stringify(post.content_json) ||
        featuredImage !== (post.featured_image || "") ||
        isFeatured !== post.is_featured ||
        authorId !== (post.author_id || "") ||
        JSON.stringify(selectedCategories) !== JSON.stringify(post.categories?.map(c => c.id) || []) ||
        JSON.stringify(selectedTags) !== JSON.stringify(post.tags?.map(t => t.id) || []);
      setHasChanges(changed);
    }
  }, [title, slug, excerpt, content, featuredImage, isFeatured, authorId, selectedCategories, selectedTags, post, isNew]);
  
  const handleTitleChange = (value: string) => {
    setTitle(value);
    if (isNew || !post?.slug) {
      setSlug(generateSlug(value));
    }
  };
  
  const handleSave = useCallback(async () => {
    if (!title.trim()) {
      toast({ title: "Error", description: "Title is required", variant: "destructive" });
      return;
    }
    
    if (!slug.trim()) {
      toast({ title: "Error", description: "Slug is required", variant: "destructive" });
      return;
    }
    
    setIsSaving(true);
    
    try {
      if (isNew) {
        const newPost = await createMutation.mutateAsync({
          title,
          slug,
          content,
          excerpt: excerpt || undefined,
          featured_image: featuredImage || undefined,
          featured_image_alt: featuredImageAlt || undefined,
          author_id: authorId || undefined,
          meta,
          categories: selectedCategories,
          tags: selectedTags,
        });
        
        navigate(`/admin/blog/${newPost.id}`, { replace: true });
      } else if (post) {
        await updateMutation.mutateAsync({
          id: post.id,
          title,
          slug,
          excerpt,
          content_json: content,
          featured_image: featuredImage,
          featured_image_alt: featuredImageAlt,
          author_id: authorId || undefined,
          reviewer_id: reviewerId || null,
          reviewed_at: reviewerId ? new Date().toISOString() : null,
          meta_json: meta,
          is_featured: isFeatured,
          categories: selectedCategories,
          tags: selectedTags,
        });
        
        toast({ title: "Saved", description: "Post has been saved." });
        setHasChanges(false);
      }
    } finally {
      setIsSaving(false);
    }
  }, [title, slug, excerpt, content, featuredImage, featuredImageAlt, authorId, reviewerId, meta, isFeatured, selectedCategories, selectedTags, isNew, post, createMutation, updateMutation, navigate, toast]);
  
  const handleStatusChange = async (newStatus: PageStatus) => {
    if (!post) return;
    await statusMutation.mutateAsync({ id: post.id, status: newStatus });
  };
  
  const handleAddTag = async () => {
    if (!newTagInput.trim()) return;
    
    try {
      const tag = await getOrCreateTag.mutateAsync(newTagInput.trim());
      if (!selectedTags.includes(tag.id)) {
        setSelectedTags([...selectedTags, tag.id]);
      }
      setNewTagInput("");
    } catch (error) {
      console.error("Failed to create tag:", error);
    }
  };
  
  const canEdit = isNew || post?.status === "draft" || isAdmin || isApprover;
  const canPublish = isAdmin || isApprover;
  
  if (!isNew && isLoading) {
    return (
      <AdminLayout>
        <div className="flex items-center justify-center h-64">
          <p className="text-muted-foreground">Loading post...</p>
        </div>
      </AdminLayout>
    );
  }
  
  return (
    <AdminLayout>
      <div className="flex flex-col h-full">
        {/* Header */}
        <div className="shrink-0 border-b bg-background px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Button variant="ghost" size="icon" onClick={() => navigate("/admin/blog")}>
                <ArrowLeft className="h-4 w-4" />
              </Button>
              <div>
                <h1 className="text-xl font-semibold">
                  {isNew ? "New Post" : "Edit Post"}
                </h1>
                {!isNew && post && (
                  <div className="flex items-center gap-2 mt-1">
                    <Badge variant={post.status === "published" ? "default" : "secondary"}>
                      {post.status}
                    </Badge>
                    {post.is_featured && (
                      <Badge variant="outline">
                        <Star className="h-3 w-3 mr-1" />
                        Featured
                      </Badge>
                    )}
                  </div>
                )}
              </div>
            </div>
            
            <div className="flex items-center gap-2">
              {!isNew && post?.status === "published" && (
                <Button variant="outline" asChild>
                  <a href={`/blogg/${post.slug}`} target="_blank" rel="noopener noreferrer">
                    <Eye className="mr-2 h-4 w-4" />
                    View
                  </a>
                </Button>
              )}
              
              {/* Undo/Redo buttons */}
              {canEdit && (
                <div className="flex items-center gap-1">
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={undo}
                        disabled={!canUndo}
                        className="h-8 w-8"
                      >
                        <Undo2 className="h-4 w-4" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>Undo (Ctrl+Z)</TooltipContent>
                  </Tooltip>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={redo}
                        disabled={!canRedo}
                        className="h-8 w-8"
                      >
                        <Redo2 className="h-4 w-4" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>Redo (Ctrl+Shift+Z)</TooltipContent>
                  </Tooltip>
                </div>
              )}

              <Sheet>
                <SheetTrigger asChild>
                  <Button variant="outline">
                    <Settings2 className="mr-2 h-4 w-4" />
                    Settings
                  </Button>
                </SheetTrigger>
                <SheetContent className="overflow-y-auto">
                  <SheetHeader>
                    <SheetTitle>Post Settings</SheetTitle>
                    <SheetDescription>
                      Configure post metadata, SEO, and categories
                    </SheetDescription>
                  </SheetHeader>
                  
                  <div className="space-y-6 mt-6">
                    {/* Featured */}
                    <div className="flex items-center justify-between">
                      <Label>Featured Post</Label>
                      <Button
                        variant={isFeatured ? "default" : "outline"}
                        size="sm"
                        onClick={() => setIsFeatured(!isFeatured)}
                        disabled={!canEdit}
                      >
                        {isFeatured ? (
                          <>
                            <Star className="mr-2 h-4 w-4 fill-current" />
                            Featured
                          </>
                        ) : (
                          <>
                            <StarOff className="mr-2 h-4 w-4" />
                            Not Featured
                          </>
                        )}
                      </Button>
                    </div>
                    
                    <Separator />
                    
                    {/* Author */}
                    <div className="space-y-2">
                      <Label>Author</Label>
                      <Select value={authorId} onValueChange={setAuthorId} disabled={!canEdit}>
                        <SelectTrigger>
                          <SelectValue placeholder="Select author" />
                        </SelectTrigger>
                        <SelectContent>
                          {authors?.map((author) => (
                            <SelectItem key={author.id} value={author.id}>
                              {author.full_name || author.email}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    
                    {/* Reviewer (if enabled) */}
                    {blogSettings?.showReviewer && (
                      <div className="space-y-2">
                        <Label>Content Reviewer</Label>
                        <Select
                          value={reviewerId}
                          onValueChange={setReviewerId}
                          disabled={!canEdit}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Select reviewer" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="">None</SelectItem>
                            {authors?.map((author) => (
                              <SelectItem key={author.id} value={author.id}>
                                {author.full_name || author.email}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    )}
                    
                    <Separator />
                    
                    {/* Categories */}
                    <div className="space-y-2">
                      <Label>Categories</Label>
                      <div className="flex flex-wrap gap-2">
                        {categories?.map((category) => (
                          <Badge
                            key={category.id}
                            variant={selectedCategories.includes(category.id) ? "default" : "outline"}
                            className="cursor-pointer"
                            onClick={() => {
                              if (!canEdit) return;
                              setSelectedCategories(prev =>
                                prev.includes(category.id)
                                  ? prev.filter(id => id !== category.id)
                                  : [...prev, category.id]
                              );
                            }}
                          >
                            {category.name}
                          </Badge>
                        ))}
                        {(!categories || categories.length === 0) && (
                          <p className="text-sm text-muted-foreground">
                            No categories. Create some first.
                          </p>
                        )}
                      </div>
                    </div>
                    
                    {/* Tags */}
                    <div className="space-y-2">
                      <Label>Tags</Label>
                      <div className="flex flex-wrap gap-2 mb-2">
                        {selectedTags.map((tagId) => {
                          const tag = tags?.find(t => t.id === tagId);
                          return (
                            <Badge
                              key={tagId}
                              variant="secondary"
                              className="cursor-pointer"
                              onClick={() => {
                                if (!canEdit) return;
                                setSelectedTags(prev => prev.filter(id => id !== tagId));
                              }}
                            >
                              {tag?.name || tagId} ×
                            </Badge>
                          );
                        })}
                      </div>
                      <div className="flex gap-2">
                        <Input
                          placeholder="Add tag..."
                          value={newTagInput}
                          onChange={(e) => setNewTagInput(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              e.preventDefault();
                              handleAddTag();
                            }
                          }}
                          disabled={!canEdit}
                        />
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={handleAddTag}
                          disabled={!canEdit || !newTagInput.trim()}
                        >
                          Add
                        </Button>
                      </div>
                    </div>
                    
                    <Separator />
                    
                    {/* SEO */}
                    <div className="space-y-4">
                      <Label className="text-base font-medium">SEO</Label>
                      
                      <div className="space-y-2">
                        <Label className="text-sm">SEO Title</Label>
                        <Input
                          value={meta.seoTitle || ""}
                          onChange={(e) => setMeta({ ...meta, seoTitle: e.target.value })}
                          placeholder={title}
                          disabled={!canEdit}
                        />
                      </div>
                      
                      <div className="space-y-2">
                        <Label className="text-sm">Meta Description</Label>
                        <Textarea
                          value={meta.description || ""}
                          onChange={(e) => setMeta({ ...meta, description: e.target.value })}
                          placeholder={excerpt || "Enter a description for search engines"}
                          rows={3}
                          disabled={!canEdit}
                        />
                      </div>
                    </div>
                  </div>
                </SheetContent>
              </Sheet>
              
              {canEdit && (
                <Button onClick={handleSave} disabled={isSaving || !hasChanges}>
                  <Save className="mr-2 h-4 w-4" />
                  {isSaving ? "Saving..." : "Save"}
                </Button>
              )}
              
              {!isNew && post && (
                <>
                  {post.status === "draft" && (
                    <Button
                      variant="secondary"
                      onClick={() => handleStatusChange("reviewing")}
                      disabled={statusMutation.isPending}
                    >
                      <Send className="mr-2 h-4 w-4" />
                      Submit for Review
                    </Button>
                  )}
                  
                  {post.status === "reviewing" && canPublish && (
                    <Button
                      onClick={() => handleStatusChange("published")}
                      disabled={statusMutation.isPending}
                    >
                      <Check className="mr-2 h-4 w-4" />
                      Publish
                    </Button>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
        
        {/* Editor */}
        <div className="flex-1 overflow-auto p-6">
          <div className="max-w-4xl mx-auto space-y-6">
            {/* Title & Slug */}
            <Card>
              <CardContent className="pt-6 space-y-4">
                <div className="space-y-2">
                  <Label>Title</Label>
                  <Input
                    value={title}
                    onChange={(e) => handleTitleChange(e.target.value)}
                    placeholder="Post title"
                    className="text-lg font-medium"
                    disabled={!canEdit}
                  />
                </div>
                
                <div className="space-y-2">
                  <Label>URL Slug</Label>
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-muted-foreground">/blogg/</span>
                    <Input
                      value={slug}
                      onChange={(e) => setSlug(e.target.value)}
                      placeholder="url-slug"
                      disabled={!canEdit}
                    />
                  </div>
                </div>
                
                <div className="space-y-2">
                  <Label>Excerpt</Label>
                  <Textarea
                    value={excerpt}
                    onChange={(e) => setExcerpt(e.target.value)}
                    placeholder="A brief summary of the post (shown in listings)"
                    rows={2}
                    disabled={!canEdit}
                  />
                </div>
              </CardContent>
            </Card>
            
            {/* Featured Image */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Featured Image</CardTitle>
              </CardHeader>
              <CardContent>
                <ImagePickerField
                  value={featuredImage}
                  onChange={setFeaturedImage}
                />
                {featuredImage && (
                  <div className="mt-3">
                    <Label className="text-sm">Alt Text</Label>
                    <Input
                      value={featuredImageAlt}
                      onChange={(e) => setFeaturedImageAlt(e.target.value)}
                      placeholder="Describe the image"
                      className="mt-1"
                      disabled={!canEdit}
                    />
                  </div>
                )}
              </CardContent>
            </Card>
            
            {/* Content */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Content</CardTitle>
              </CardHeader>
              <CardContent>
                <BlockEditor
                  blocks={content}
                  onChange={setContent}
                  canEdit={canEdit}
                />
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </AdminLayout>
  );
}