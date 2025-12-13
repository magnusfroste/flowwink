import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Save, Send, Check, X, Loader2, ExternalLink } from 'lucide-react';
import { AdminLayout } from '@/components/admin/AdminLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { StatusBadge } from '@/components/StatusBadge';
import { VersionHistoryPanel } from '@/components/admin/VersionHistoryPanel';
import { BlockEditor } from '@/components/admin/blocks/BlockEditor';
import { usePage, useUpdatePage, useUpdatePageStatus } from '@/hooks/usePages';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { Skeleton } from '@/components/ui/skeleton';
import { ContentBlock } from '@/types/cms';

export default function PageEditorPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { isApprover } = useAuth();
  
  const { data: page, isLoading, refetch } = usePage(id);
  const updatePage = useUpdatePage();
  const updateStatus = useUpdatePageStatus();
  
  const [title, setTitle] = useState('');
  const [blocks, setBlocks] = useState<ContentBlock[]>([]);
  const [hasChanges, setHasChanges] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (page) {
      setTitle(page.title);
      // Deep clone to ensure we have fresh data
      setBlocks(JSON.parse(JSON.stringify(page.content_json || [])));
      setHasChanges(false);
    }
  }, [page?.id, page?.updated_at]);

  const handleBlocksChange = useCallback((newBlocks: ContentBlock[]) => {
    setBlocks(newBlocks);
    setHasChanges(true);
  }, []);

  const handleSave = useCallback(async () => {
    if (!id) return;
    
    setIsSaving(true);
    try {
      await updatePage.mutateAsync({
        id,
        title,
        content_json: blocks,
      });
      setHasChanges(false);
      toast({ title: 'Sparad ✓', description: 'Ändringarna har sparats.' });
    } finally {
      setIsSaving(false);
    }
  }, [id, title, blocks, updatePage, toast]);

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
                  <a href={`/${page.slug}`} target="_blank" rel="noopener noreferrer">
                    <ExternalLink className="h-4 w-4 mr-2" />
                    Visa live
                  </a>
                </Button>
              )}
              <StatusBadge status={page.status} />
            </div>
          </div>
        </div>

        {/* Block Editor */}
        <div className="flex-1 overflow-auto p-8 bg-background">
          <div className="max-w-3xl mx-auto">
            <BlockEditor
              blocks={blocks}
              onChange={handleBlocksChange}
              canEdit={canEdit}
            />
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
