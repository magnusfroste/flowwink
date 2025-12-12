import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Save, Send, Check, X, Loader2, ExternalLink } from 'lucide-react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import Link from '@tiptap/extension-link';
import { AdminLayout } from '@/components/admin/AdminLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { StatusBadge } from '@/components/StatusBadge';
import { VersionHistoryPanel } from '@/components/admin/VersionHistoryPanel';
import { usePage, useUpdatePage, useUpdatePageStatus } from '@/hooks/usePages';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { Skeleton } from '@/components/ui/skeleton';
import { Toggle } from '@/components/ui/toggle';
import { Separator } from '@/components/ui/separator';
import { Bold, Italic, List, ListOrdered, Quote, Heading1, Heading2 } from 'lucide-react';

export default function PageEditorPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { isApprover } = useAuth();
  
  const { data: page, isLoading, refetch } = usePage(id);
  const updatePage = useUpdatePage();
  const updateStatus = useUpdatePageStatus();
  
  const [title, setTitle] = useState('');
  const [hasChanges, setHasChanges] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const editor = useEditor({
    extensions: [
      StarterKit,
      Placeholder.configure({ placeholder: 'Börja skriva innehåll här...' }),
      Link.configure({ openOnClick: false }),
    ],
    content: '',
    onUpdate: () => setHasChanges(true),
  });

  useEffect(() => {
    if (page) {
      setTitle(page.title);
      const textContent = page.content_json?.find((b: { type: string }) => b.type === 'text');
      if (textContent && editor) {
        editor.commands.setContent((textContent.data as { content?: string })?.content || '');
      }
    }
  }, [page, editor]);

  const handleSave = useCallback(async () => {
    if (!id || !editor) return;
    
    setIsSaving(true);
    try {
      await updatePage.mutateAsync({
        id,
        title,
        content_json: [{
          id: 'main-text',
          type: 'text' as const,
          data: { content: editor.getHTML() },
        }],
      });
      setHasChanges(false);
      toast({ title: 'Sparad ✓', description: 'Ändringarna har sparats.' });
    } finally {
      setIsSaving(false);
    }
  }, [id, title, editor, updatePage, toast]);

  const handleSendForReview = async () => {
    await handleSave();
    if (id) {
      await updateStatus.mutateAsync({ id, status: 'reviewing' });
    }
  };

  const handleApprove = async () => {
    if (id) {
      await updateStatus.mutateAsync({ id, status: 'published' });
    }
  };

  const handleReject = async () => {
    if (id) {
      await updateStatus.mutateAsync({ id, status: 'draft', feedback: 'Behöver ändringar' });
    }
  };

  const handleVersionRestore = () => {
    refetch();
    setHasChanges(false);
  };

  if (isLoading) {
    return (
      <AdminLayout>
        <div className="p-8">
          <Skeleton className="h-10 w-48 mb-6" />
          <Skeleton className="h-[500px] w-full" />
        </div>
      </AdminLayout>
    );
  }

  if (!page) {
    return (
      <AdminLayout>
        <div className="p-8 text-center">
          <h1 className="text-2xl font-serif font-bold mb-4">Sidan hittades inte</h1>
          <Button onClick={() => navigate('/admin/pages')}>Tillbaka till sidor</Button>
        </div>
      </AdminLayout>
    );
  }

  const canEdit = page.status === 'draft' || isApprover;
  const canSendForReview = page.status === 'draft';
  const canApprove = page.status === 'reviewing' && isApprover;

  return (
    <AdminLayout>
      <div className="flex flex-col h-full">
        {/* Header */}
        <div className="border-b bg-card p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Button variant="ghost" size="icon" onClick={() => navigate('/admin/pages')}>
                <ArrowLeft className="h-4 w-4" />
              </Button>
              <div>
                <Input
                  value={title}
                  onChange={(e) => { setTitle(e.target.value); setHasChanges(true); }}
                  className="text-xl font-serif font-bold border-none p-0 h-auto focus-visible:ring-0"
                  disabled={!canEdit}
                />
                <p className="text-sm text-muted-foreground">/{page.slug}</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              {id && <VersionHistoryPanel pageId={id} onRestore={handleVersionRestore} />}
              {page.status === 'published' && (
                <Button variant="outline" size="sm" asChild>
                  <a href={`/p/${page.slug}`} target="_blank" rel="noopener noreferrer">
                    <ExternalLink className="h-4 w-4 mr-2" />
                    Visa live
                  </a>
                </Button>
              )}
              <StatusBadge status={page.status} />
            </div>
          </div>
        </div>

        {/* Toolbar */}
        {editor && canEdit && (
          <div className="border-b bg-card px-4 py-2 flex items-center gap-1 flex-wrap">
            <Toggle size="sm" pressed={editor.isActive('bold')} onPressedChange={() => editor.chain().focus().toggleBold().run()}>
              <Bold className="h-4 w-4" />
            </Toggle>
            <Toggle size="sm" pressed={editor.isActive('italic')} onPressedChange={() => editor.chain().focus().toggleItalic().run()}>
              <Italic className="h-4 w-4" />
            </Toggle>
            <Separator orientation="vertical" className="h-6 mx-2" />
            <Toggle size="sm" pressed={editor.isActive('heading', { level: 1 })} onPressedChange={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}>
              <Heading1 className="h-4 w-4" />
            </Toggle>
            <Toggle size="sm" pressed={editor.isActive('heading', { level: 2 })} onPressedChange={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}>
              <Heading2 className="h-4 w-4" />
            </Toggle>
            <Separator orientation="vertical" className="h-6 mx-2" />
            <Toggle size="sm" pressed={editor.isActive('bulletList')} onPressedChange={() => editor.chain().focus().toggleBulletList().run()}>
              <List className="h-4 w-4" />
            </Toggle>
            <Toggle size="sm" pressed={editor.isActive('orderedList')} onPressedChange={() => editor.chain().focus().toggleOrderedList().run()}>
              <ListOrdered className="h-4 w-4" />
            </Toggle>
            <Toggle size="sm" pressed={editor.isActive('blockquote')} onPressedChange={() => editor.chain().focus().toggleBlockquote().run()}>
              <Quote className="h-4 w-4" />
            </Toggle>
          </div>
        )}

        {/* Editor */}
        <div className="flex-1 overflow-auto p-8 bg-background">
          <div className="max-w-3xl mx-auto bg-card rounded-lg border shadow-sm min-h-[500px]">
            <EditorContent editor={editor} className="tiptap" />
          </div>
        </div>

        {/* Sticky Save Bar */}
        <div className="sticky-save-bar">
          <div className="max-w-5xl mx-auto px-6 py-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <StatusBadge status={page.status} />
              {hasChanges && <span className="text-sm text-muted-foreground">Osparade ändringar</span>}
            </div>
            <div className="flex items-center gap-3">
              {canEdit && (
                <Button variant="outline" onClick={handleSave} disabled={isSaving || !hasChanges}>
                  {isSaving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
                  SPARA UTKAST
                </Button>
              )}
              {canSendForReview && (
                <Button onClick={handleSendForReview} disabled={updateStatus.isPending}>
                  <Send className="h-4 w-4 mr-2" />
                  SKICKA FÖR GRANSKNING
                </Button>
              )}
              {canApprove && (
                <>
                  <Button variant="outline" onClick={handleReject} disabled={updateStatus.isPending}>
                    <X className="h-4 w-4 mr-2" />
                    ÅTERFÖRVISA
                  </Button>
                  <Button onClick={handleApprove} disabled={updateStatus.isPending} className="bg-success hover:bg-success/90">
                    <Check className="h-4 w-4 mr-2" />
                    GODKÄNN & PUBLICERA
                  </Button>
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </AdminLayout>
  );
}
