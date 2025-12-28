import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { ArrowLeft, Save, Eye, EyeOff, MessageSquare, Sparkles } from "lucide-react";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Link from "@tiptap/extension-link";
import Placeholder from "@tiptap/extension-placeholder";
import {
  useKbCategories,
  useKbArticle,
  useCreateKbArticle,
  useUpdateKbArticle,
} from "@/hooks/useKnowledgeBase";
import { extractPlainText } from "@/lib/tiptap-utils";

export default function KbArticleEditorPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const isNew = id === "new";

  const { data: categories, isLoading: categoriesLoading } = useKbCategories();
  const { data: article, isLoading: articleLoading } = useKbArticle(isNew ? "" : id || "");
  const createArticle = useCreateKbArticle();
  const updateArticle = useUpdateKbArticle();

  const [formData, setFormData] = useState({
    title: "",
    slug: "",
    question: "",
    category_id: "",
    is_published: true,
    is_featured: false,
    include_in_chat: true,
  });

  const editor = useEditor({
    extensions: [
      StarterKit,
      Link.configure({ openOnClick: false }),
      Placeholder.configure({ placeholder: "Write a detailed answer..." }),
    ],
    content: "",
    editorProps: {
      attributes: {
        class: "prose prose-sm max-w-none min-h-[200px] focus:outline-none p-4",
      },
    },
  });

  // Load existing article
  useEffect(() => {
    if (article && editor) {
      setFormData({
        title: article.title,
        slug: article.slug,
        question: article.question,
        category_id: article.category_id,
        is_published: article.is_published,
        is_featured: article.is_featured,
        include_in_chat: article.include_in_chat,
      });
      if (article.answer_json) {
        editor.commands.setContent(article.answer_json as any);
      }
    }
  }, [article, editor]);

  // Auto-generate slug from title
  useEffect(() => {
    if (isNew && formData.title) {
      const slug = formData.title
        .toLowerCase()
        .replace(/[åä]/g, "a")
        .replace(/ö/g, "o")
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "");
      setFormData(prev => ({ ...prev, slug }));
    }
  }, [formData.title, isNew]);

  const handleSave = async () => {
    if (!editor || !formData.category_id) return;

    const answer_json = editor.getJSON();
    const answer_text = extractPlainText(answer_json);

    const data = {
      ...formData,
      answer_json,
      answer_text,
    };

    if (isNew) {
      const created = await createArticle.mutateAsync(data);
      navigate(`/admin/knowledge-base/${created.id}`);
    } else if (id) {
      await updateArticle.mutateAsync({ id, ...data });
    }
  };

  const isPending = createArticle.isPending || updateArticle.isPending;
  const isLoading = !isNew && articleLoading;

  if (isLoading) {
    return (
      <AdminLayout>
        <div className="space-y-4">
          <Skeleton className="h-10 w-48" />
          <Skeleton className="h-[400px]" />
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon" onClick={() => navigate("/admin/knowledge-base")}>
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <div>
              <h1 className="text-2xl font-bold">{isNew ? "New Article" : "Edit Article"}</h1>
              <p className="text-sm text-muted-foreground">
                {isNew ? "Create a new knowledge base article" : formData.title}
              </p>
            </div>
          </div>
          <Button onClick={handleSave} disabled={isPending}>
            <Save className="h-4 w-4 mr-2" />
            {isPending ? "Saving..." : "Save"}
          </Button>
        </div>

        <div className="grid gap-6 lg:grid-cols-3">
          {/* Main Content */}
          <div className="lg:col-span-2 space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Article Content</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <Label>Title</Label>
                  <Input
                    value={formData.title}
                    onChange={e => setFormData(prev => ({ ...prev, title: e.target.value }))}
                    placeholder="How to reset your password"
                  />
                </div>

                <div>
                  <Label>Slug</Label>
                  <Input
                    value={formData.slug}
                    onChange={e => setFormData(prev => ({ ...prev, slug: e.target.value }))}
                    placeholder="how-to-reset-password"
                  />
                </div>

                <div>
                  <Label>Question</Label>
                  <Textarea
                    value={formData.question}
                    onChange={e => setFormData(prev => ({ ...prev, question: e.target.value }))}
                    placeholder="How do I reset my password?"
                    rows={2}
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    The question as users would ask it
                  </p>
                </div>

                <div>
                  <Label>Answer</Label>
                  <div className="border rounded-lg overflow-hidden bg-background">
                    <EditorContent editor={editor} />
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Settings</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <Label>Category</Label>
                  {categoriesLoading ? (
                    <Skeleton className="h-10" />
                  ) : (
                    <Select
                      value={formData.category_id}
                      onValueChange={value => setFormData(prev => ({ ...prev, category_id: value }))}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select category" />
                      </SelectTrigger>
                      <SelectContent>
                        {categories?.map(category => (
                          <SelectItem key={category.id} value={category.id}>
                            {category.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                </div>

                <div className="flex items-center justify-between rounded-lg border p-3">
                  <div className="flex items-center gap-2">
                    {formData.is_published ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
                    <div>
                      <Label>Published</Label>
                      <p className="text-xs text-muted-foreground">Visible on public pages</p>
                    </div>
                  </div>
                  <Switch
                    checked={formData.is_published}
                    onCheckedChange={checked => setFormData(prev => ({ ...prev, is_published: checked }))}
                  />
                </div>

                <div className="flex items-center justify-between rounded-lg border p-3">
                  <div className="flex items-center gap-2">
                    <Sparkles className="h-4 w-4" />
                    <div>
                      <Label>Featured</Label>
                      <p className="text-xs text-muted-foreground">Show prominently</p>
                    </div>
                  </div>
                  <Switch
                    checked={formData.is_featured}
                    onCheckedChange={checked => setFormData(prev => ({ ...prev, is_featured: checked }))}
                  />
                </div>
              </CardContent>
            </Card>

            <Card className="border-primary/20 bg-primary/5">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <MessageSquare className="h-4 w-4" />
                  AI Chat Integration
                </CardTitle>
                <CardDescription>
                  Include this article in AI Chat context
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium">Include in Chat</p>
                    <p className="text-xs text-muted-foreground">
                      AI will use this to answer questions
                    </p>
                  </div>
                  <Switch
                    checked={formData.include_in_chat}
                    onCheckedChange={checked => setFormData(prev => ({ ...prev, include_in_chat: checked }))}
                  />
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </AdminLayout>
  );
}
