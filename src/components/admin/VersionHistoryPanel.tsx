import { useState } from 'react';
import { History, RotateCcw, X, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { ScrollArea } from '@/components/ui/scroll-area';
import { usePageVersions, useUpdatePage } from '@/hooks/usePages';
import { useToast } from '@/hooks/use-toast';
import type { ContentBlock } from '@/types/cms';

interface VersionHistoryPanelProps {
  pageId: string;
  onRestore?: () => void;
}

export function VersionHistoryPanel({ pageId, onRestore }: VersionHistoryPanelProps) {
  const [open, setOpen] = useState(false);
  const [restoring, setRestoring] = useState<string | null>(null);
  const { data: versions, isLoading } = usePageVersions(pageId);
  const updatePage = useUpdatePage();
  const { toast } = useToast();

  const handleRestore = async (version: {
    id: string;
    title: string;
    content_json: unknown;
  }) => {
    setRestoring(version.id);
    try {
      await updatePage.mutateAsync({
        id: pageId,
        title: version.title,
        content_json: version.content_json as ContentBlock[],
      });
      toast({
        title: 'Version återställd',
        description: 'Sidan har återställts till den valda versionen.',
      });
      setOpen(false);
      onRestore?.();
    } catch (error) {
      toast({
        title: 'Fel',
        description: 'Kunde inte återställa versionen.',
        variant: 'destructive',
      });
    } finally {
      setRestoring(null);
    }
  };

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="outline" size="sm">
          <History className="h-4 w-4 mr-2" />
          Historik
        </Button>
      </SheetTrigger>
      <SheetContent>
        <SheetHeader>
          <SheetTitle className="font-serif">Versionshistorik</SheetTitle>
          <SheetDescription>
            Återställ till en tidigare publicerad version
          </SheetDescription>
        </SheetHeader>
        <ScrollArea className="h-[calc(100vh-150px)] mt-6">
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : !versions?.length ? (
            <div className="text-center py-8 text-muted-foreground">
              <History className="h-12 w-12 mx-auto mb-3 opacity-50" />
              <p>Inga publicerade versioner ännu</p>
              <p className="text-sm mt-1">
                Versioner skapas när en sida publiceras
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {versions.map((version, index) => (
                <div
                  key={version.id}
                  className="p-4 rounded-lg border bg-card hover:bg-muted/50 transition-colors"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0 flex-1">
                      <p className="font-medium truncate">{version.title}</p>
                      <p className="text-sm text-muted-foreground">
                        {new Date(version.created_at).toLocaleDateString('sv-SE', {
                          year: 'numeric',
                          month: 'long',
                          day: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </p>
                      {index === 0 && (
                        <span className="inline-block mt-2 text-xs bg-success/20 text-success px-2 py-0.5 rounded">
                          Senaste publicering
                        </span>
                      )}
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleRestore(version)}
                      disabled={restoring === version.id}
                    >
                      {restoring === version.id ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <RotateCcw className="h-4 w-4" />
                      )}
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}
