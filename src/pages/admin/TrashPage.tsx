import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Trash2, RotateCcw, AlertTriangle } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { enUS } from 'date-fns/locale';
import { AdminLayout } from '@/components/admin/AdminLayout';
import { AdminPageContainer } from '@/components/admin/AdminPageContainer';
import { AdminPageHeader } from '@/components/admin/AdminPageHeader';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useDeletedPages, useRestorePage, usePermanentDeletePage } from '@/hooks/usePages';

export default function TrashPage() {
  const { data: deletedPages, isLoading } = useDeletedPages();
  const restorePage = useRestorePage();
  const permanentDelete = usePermanentDeletePage();
  const [permanentDeleteId, setPermanentDeleteId] = useState<string | null>(null);

  const handlePermanentDelete = async () => {
    if (permanentDeleteId) {
      await permanentDelete.mutateAsync(permanentDeleteId);
      setPermanentDeleteId(null);
    }
  };

  return (
    <AdminLayout>
      <AdminPageContainer>
        <AdminPageHeader
          title="Trash"
          description="Deleted pages can be restored or permanently removed"
        >
          <Button variant="outline" asChild>
            <Link to="/admin/pages">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Pages
            </Link>
          </Button>
        </AdminPageHeader>

        <Card>
          <CardHeader>
            <CardTitle className="font-serif">
              {deletedPages?.length || 0} {(deletedPages?.length || 0) === 1 ? 'page' : 'pages'} in trash
            </CardTitle>
            <CardDescription>
              Permanently deleted pages cannot be recovered
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-3">
                {[...Array(3)].map((_, i) => (
                  <Skeleton key={i} className="h-16 w-full" />
                ))}
              </div>
            ) : !deletedPages || deletedPages.length === 0 ? (
              <div className="text-center py-12">
                <Trash2 className="h-10 w-10 mx-auto mb-3 text-muted-foreground/40" />
                <p className="text-muted-foreground">Trash is empty</p>
              </div>
            ) : (
              <div className="space-y-2">
                {deletedPages.map((page) => (
                  <div
                    key={page.id}
                    className="flex items-center justify-between p-4 rounded-lg border"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="font-medium truncate">{page.title}</p>
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <span className="truncate">/{page.slug}</span>
                        <span>•</span>
                        <span className="text-xs">
                          deleted {page.deleted_at ? formatDistanceToNow(new Date(page.deleted_at), { addSuffix: true, locale: enUS }) : ''}
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 ml-4">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => restorePage.mutate(page.id)}
                        disabled={restorePage.isPending}
                      >
                        <RotateCcw className="h-4 w-4 mr-2" />
                        Restore
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-destructive hover:text-destructive"
                        onClick={() => setPermanentDeleteId(page.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </AdminPageContainer>

      {/* Permanent Delete Confirmation */}
      <AlertDialog open={!!permanentDeleteId} onOpenChange={() => setPermanentDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-destructive" />
              Permanently delete?
            </AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. The page and all its version history will be permanently removed.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handlePermanentDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete Permanently
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AdminLayout>
  );
}
