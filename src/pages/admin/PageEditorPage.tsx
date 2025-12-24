import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Save, Send, Check, X, Loader2, ExternalLink, Eye, Clock, Undo2, Redo2 } from 'lucide-react';
import { format } from 'date-fns';
import { enUS } from 'date-fns/locale';
import { AdminLayout } from '@/components/admin/AdminLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { StatusBadge } from '@/components/StatusBadge';
import { VersionHistoryPanel } from '@/components/admin/VersionHistoryPanel';
import { BlockEditor } from '@/components/admin/blocks/BlockEditor';
import { PageSettingsDialog } from '@/components/admin/PageSettingsDialog';
import { SchedulePublishDialog } from '@/components/admin/SchedulePublishDialog';
import { usePage, useUpdatePage, useUpdatePageStatus } from '@/hooks/usePages';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { useUnsavedChanges, UnsavedChangesDialog } from '@/hooks/useUnsavedChanges';
import { useUndoRedo } from '@/hooks/useUndoRedo';
import { useUndoRedoKeyboard } from '@/hooks/useUndoRedoKeyboard';
import { Skeleton } from '@/components/ui/skeleton';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { ContentBlock, PageMeta } from '@/types/cms';

export default function PageEditorPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { isApprover } = useAuth();
  
  const { data: page, isLoading, refetch } = usePage(id);
  const updatePage = useUpdatePage();
  const updateStatus = useUpdatePageStatus();
  
  const [title, setTitle] = useState('');
  const [meta, setMeta] = useState<PageMeta>({});
  const [hasChanges, setHasChanges] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // Undo/Redo for blocks
  const {
    present: blocks,
    set: setBlocks,
    undo,
    redo,
    reset: resetBlocks,
    canUndo,
    canRedo,
  } = useUndoRedo<ContentBlock[]>({ initialValue: [], maxHistory: 50 });

  // Keyboard shortcuts for undo/redo
  useUndoRedoKeyboard({ undo, redo, canUndo, canRedo });

  const { blocker } = useUnsavedChanges({ hasChanges });

  useEffect(() => {
    if (page) {
      setTitle(page.title);
      // Reset undo/redo history with fresh data
      resetBlocks(JSON.parse(JSON.stringify(page.content_json || [])));
      setMeta(JSON.parse(JSON.stringify(page.meta_json || {})));
      setHasChanges(false);
    }
  }, [page?.id, page?.updated_at, resetBlocks]);

  const handleBlocksChange = useCallback((newBlocks: ContentBlock[]) => {
    setBlocks(newBlocks);
    setHasChanges(true);
  }, []);

  const handleMetaChange = useCallback((newMeta: PageMeta) => {
    setMeta(newMeta);
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
        meta_json: meta,
      });
      setHasChanges(false);
      toast({ title: 'Saved ✓', description: 'Changes have been saved.' });
    } finally {
      setIsSaving(false);
    }
  }, [id, title, blocks, meta, updatePage, toast]);

  const handleSendForReview = async (scheduledAt?: Date | null) => {
    await handleSave();
    if (id) {
      await updateStatus.mutateAsync({ id, status: 'reviewing', scheduledAt });
    }
  };

  const handleSchedule = async (scheduledAt: Date | null) => {
    if (!id) return;
    
    if (page?.status === 'draft') {
      // Save first, then send for review with schedule
      await handleSave();
      await updateStatus.mutateAsync({ id, status: 'reviewing', scheduledAt });
      toast({
        title: 'Scheduled',
        description: scheduledAt 
          ? `Page will be published on ${format(scheduledAt, "MMMM d 'at' HH:mm", { locale: enUS })}`
          : 'Schedule removed',
      });
    } else if (page?.status === 'reviewing') {
      // Just update the schedule
      await updateStatus.mutateAsync({ id, status: 'reviewing', scheduledAt });
      toast({
        title: scheduledAt ? 'Scheduled' : 'Schedule removed',
        description: scheduledAt 
          ? `Page will be published on ${format(scheduledAt, "MMMM d 'at' HH:mm", { locale: enUS })}`
          : 'Page is now awaiting manual approval',
      });
    }
  };

  const handleApprove = async () => {
    if (id) {
      await updateStatus.mutateAsync({ id, status: 'published' });
    }
  };

  const handleReject = async () => {
    if (id) {
      await updateStatus.mutateAsync({ id, status: 'draft', feedback: 'Needs changes' });
    }
  };

  const handlePreview = useCallback(() => {
    if (!id || !page) return;
    
    const previewData = {
      id,
      slug: page.slug,
      title,
      content_json: blocks,
      meta_json: meta,
      savedAt: new Date().toISOString(),
    };
    
    sessionStorage.setItem(`preview-${id}`, JSON.stringify(previewData));
    window.open(`/preview/${id}`, '_blank');
  }, [id, page, title, blocks, meta]);

  const handleVersionRestore = () => {
    refetch();
    setHasChanges(false);
  };

  if (isLoading) {
    return (
      <AdminLayout>
        <div>
          <Skeleton className="h-10 w-48 mb-6" />
          <Skeleton className="h-[500px] w-full" />
        </div>
      </AdminLayout>
    );
  }

  if (!page) {
    return (
      <AdminLayout>
        <div className="text-center">
          <h1 className="text-2xl font-serif font-bold mb-4">Page not found</h1>
          <Button onClick={() => navigate('/admin/pages')}>Back to pages</Button>
        </div>
      </AdminLayout>
    );
  }

  const canEdit = page.status === 'draft' || isApprover;
  const canSendForReview = page.status === 'draft';
  const canApprove = page.status === 'reviewing' && isApprover;

  return (
    <AdminLayout>
      <div className="flex flex-col h-full -m-8">
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
              <PageSettingsDialog 
                meta={meta} 
                onMetaChange={handleMetaChange}
                disabled={!canEdit}
              />
              {id && <VersionHistoryPanel pageId={id} onRestore={handleVersionRestore} />}
              <Button variant="outline" size="sm" onClick={handlePreview}>
                <Eye className="h-4 w-4 mr-2" />
                Preview
              </Button>
              {page.status === 'published' && (
                <Button variant="outline" size="sm" asChild>
                  <a href={`/${page.slug}`} target="_blank" rel="noopener noreferrer">
                    <ExternalLink className="h-4 w-4 mr-2" />
                    View Live
                  </a>
                </Button>
              )}
              <StatusBadge status={page.status} />
            </div>
          </div>
        </div>

        {/* Block Editor - scrollable area */}
        <div className="flex-1 min-h-0 overflow-auto p-8 bg-background">
          <div className="max-w-3xl mx-auto pb-4">
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
              {hasChanges && <span className="text-sm text-muted-foreground">Unsaved changes</span>}
            </div>
            <div className="flex items-center gap-3">
              {/* Undo/Redo buttons */}
              {canEdit && (
                <div className="flex items-center gap-1 mr-2">
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
              {canEdit && (
                <Button variant="outline" onClick={handleSave} disabled={isSaving || !hasChanges}>
                  {isSaving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
                  SAVE DRAFT
                </Button>
              )}
              {canSendForReview && (
                <Button onClick={() => handleSendForReview()} disabled={updateStatus.isPending}>
                  <Send className="h-4 w-4 mr-2" />
                  SEND FOR REVIEW
                </Button>
              )}
              {canApprove && (
                <>
                  <Button variant="outline" onClick={handleReject} disabled={updateStatus.isPending}>
                    <X className="h-4 w-4 mr-2" />
                    REJECT
                  </Button>
                  <SchedulePublishDialog
                    scheduledAt={page.scheduled_at}
                    onSchedule={handleSchedule}
                    disabled={updateStatus.isPending}
                  />
                  <Button onClick={handleApprove} disabled={updateStatus.isPending} className="bg-success hover:bg-success/90">
                    <Check className="h-4 w-4 mr-2" />
                    APPROVE & PUBLISH
                  </Button>
                </>
              )}
              {page.status === 'reviewing' && page.scheduled_at && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground bg-muted px-3 py-1.5 rounded-md">
                  <Clock className="h-4 w-4" />
                  <span>Publishes {format(new Date(page.scheduled_at), "MMM d 'at' HH:mm", { locale: enUS })}</span>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      <UnsavedChangesDialog blocker={blocker} />
    </AdminLayout>
  );
}
