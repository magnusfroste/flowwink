import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { History, RotateCcw, Loader2, Eye } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import { usePlatformFormat } from '@/hooks/usePlatformFormat';
import { WikiMarkdown } from '@/components/admin/wiki/WikiMarkdown';

interface WikiRevision {
  id: string;
  slug: string;
  title: string;
  revision_no: number;
  action: string;
  revised_at: string;
  content_length: number;
}

/**
 * Discreet version history for a wiki page.
 * Read-only list + preview; restore is one click (admins only, enforced in the RPC).
 */
export function WikiHistorySheet({ slug }: { slug: string }) {
  const [open, setOpen] = useState(false);
  const [previewId, setPreviewId] = useState<string | null>(null);
  const { formatDateTime } = usePlatformFormat();
  const qc = useQueryClient();

  const { data: revisions, isLoading } = useQuery({
    queryKey: ['wiki-history', slug],
    queryFn: async (): Promise<WikiRevision[]> => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await supabase.rpc('wiki_page_history' as any, {
        p_action: 'list',
        p_slug: slug,
      });
      if (error) throw error;
      return ((data as { revisions?: WikiRevision[] })?.revisions) ?? [];
    },
    enabled: open,
  });

  const { data: preview, isFetching: previewLoading } = useQuery({
    queryKey: ['wiki-revision', previewId],
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await supabase.rpc('wiki_page_history' as any, {
        p_action: 'get',
        p_revision_id: previewId,
      });
      if (error) throw error;
      return (data as { revision?: { title: string; content_md: string } })?.revision ?? null;
    },
    enabled: !!previewId,
  });

  const restore = useMutation({
    mutationFn: async (revisionId: string) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await supabase.rpc('wiki_page_history' as any, {
        p_action: 'restore',
        p_revision_id: revisionId,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['wiki-page', slug] });
      qc.invalidateQueries({ queryKey: ['wiki-pages'] });
      qc.invalidateQueries({ queryKey: ['wiki-history', slug] });
      setPreviewId(null);
      setOpen(false);
      toast.success('Version restored');
    },
    onError: (e: Error) => toast.error(`Restore failed: ${e.message}`),
  });

  return (
    <Sheet
      open={open}
      onOpenChange={(v) => {
        setOpen(v);
        if (!v) setPreviewId(null);
      }}
    >
      <SheetTrigger asChild>
        <Button variant="ghost" size="sm" title="Version history">
          <History className="h-3.5 w-3.5" />
        </Button>
      </SheetTrigger>
      <SheetContent className="w-full sm:max-w-lg flex flex-col">
        <SheetHeader>
          <SheetTitle>Version history</SheetTitle>
          <SheetDescription>Every edit is captured automatically — restore any version.</SheetDescription>
        </SheetHeader>

        <ScrollArea className="flex-1 min-h-0 -mx-2 mt-4 px-2">
          {isLoading ? (
            <div className="flex justify-center py-10">
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            </div>
          ) : !revisions?.length ? (
            <p className="py-10 text-center text-sm text-muted-foreground">
              No previous versions yet.
            </p>
          ) : (
            <div className="divide-y">
              {revisions.map((rev) => (
                <div key={rev.id} className="py-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">
                        v{rev.revision_no} · {rev.title}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {formatDateTime(rev.revised_at)} · {rev.content_length} chars{' '}
                        <Badge variant="outline" className="ml-1 text-[10px]">
                          {rev.action}
                        </Badge>
                      </p>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setPreviewId(previewId === rev.id ? null : rev.id)}
                      >
                        <Eye className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={restore.isPending}
                        onClick={() => restore.mutate(rev.id)}
                        title="Restore this version"
                      >
                        <RotateCcw className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>

                  {previewId === rev.id && (
                    <div className="mt-2 rounded-md border bg-muted/30 p-3">
                      {previewLoading ? (
                        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                      ) : (
                        <WikiMarkdown content={preview?.content_md ?? ''} knownSlugs={new Set()} />
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}
