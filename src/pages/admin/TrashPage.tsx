import { useMemo, useState } from 'react';
import { Trash2, RotateCcw, AlertTriangle, Search, Loader2 } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { enUS } from 'date-fns/locale';
import { AdminLayout } from '@/components/admin/AdminLayout';
import { AdminPageContainer } from '@/components/admin/AdminPageContainer';
import { AdminPageHeader } from '@/components/admin/AdminPageHeader';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
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
import {
  useTrashBin,
  useRestoreFromTrash,
  usePurgeFromTrash,
  type TrashItem,
  type TrashSource,
} from '@/hooks/useTrash';

/**
 * One trash bin for every content module.
 *
 * Not one per module: if you cannot remember what a file was called, you
 * usually cannot remember which module it lived in either — "was that the wiki
 * or the KB?" is the same recall problem one level up. So the list is merged,
 * newest first, and every row carries a text preview. Recognition, not recall.
 */
export default function TrashPage() {
  const [search, setSearch] = useState('');
  const [source, setSource] = useState<string | null>(null);
  const [purgeTarget, setPurgeTarget] = useState<TrashItem | null>(null);

  const { data, isLoading } = useTrashBin({ source, search });
  const restore = useRestoreFromTrash();
  const purge = usePurgeFromTrash();

  const sources: TrashSource[] = useMemo(() => data?.sources ?? [], [data]);
  const items: TrashItem[] = data?.items ?? [];
  const sourceByKey = useMemo(
    () => new Map(sources.map((s) => [s.source, s])),
    [sources],
  );

  const confirmPurge = async () => {
    if (!purgeTarget) return;
    await purge.mutateAsync(purgeTarget);
    setPurgeTarget(null);
  };

  return (
    <AdminLayout>
      <AdminPageContainer>
        <AdminPageHeader
          title="Trash"
          description="Everything deleted across your content modules — restore it, or remove it for good"
        />

        <Card>
          <CardHeader className="space-y-4">
            <div>
              <CardTitle className="font-serif">
                {items.length} {items.length === 1 ? 'item' : 'items'} in trash
              </CardTitle>
              <CardDescription>
                Search the text, not the filename — you rarely remember what it was called.
              </CardDescription>
            </div>

            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search titles and content…"
                  className="pl-9"
                  aria-label="Search trash"
                />
              </div>
              {sources.length > 1 && (
                <div className="flex flex-wrap gap-2">
                  <Button
                    variant={source === null ? 'secondary' : 'ghost'}
                    size="sm"
                    onClick={() => setSource(null)}
                  >
                    All
                  </Button>
                  {sources.map((s) => (
                    <Button
                      key={s.source}
                      variant={source === s.source ? 'secondary' : 'ghost'}
                      size="sm"
                      onClick={() => setSource(s.source)}
                    >
                      {s.label}
                    </Button>
                  ))}
                </div>
              )}
            </div>
          </CardHeader>

          <CardContent>
            {isLoading ? (
              <div className="space-y-3">
                {[...Array(3)].map((_, i) => (
                  <Skeleton key={i} className="h-24 w-full" />
                ))}
              </div>
            ) : items.length === 0 ? (
              <div className="py-12 text-center">
                <Trash2 className="mx-auto mb-3 h-10 w-10 text-muted-foreground/40" />
                <p className="text-muted-foreground">
                  {search || source ? 'Nothing matches' : 'Trash is empty'}
                </p>
                {sources.length === 0 && !search && (
                  <p className="mt-2 text-sm text-muted-foreground">
                    No content module is granted to your role.
                  </p>
                )}
              </div>
            ) : (
              <div className="space-y-2">
                {items.map((item) => {
                  const src = sourceByKey.get(item.source);
                  const canRestore = src?.can_restore ?? false;
                  const canPurge = src?.can_purge ?? false;
                  const restoreButton = (
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={!canRestore || restore.isPending}
                      onClick={() => restore.mutate(item)}
                    >
                      {restore.isPending ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      ) : (
                        <RotateCcw className="mr-2 h-4 w-4" />
                      )}
                      Restore
                    </Button>
                  );

                  return (
                    <div
                      key={`${item.source}:${item.item_key}`}
                      className="flex flex-col gap-3 rounded-lg border p-4 sm:flex-row sm:items-start sm:justify-between"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="truncate font-medium">
                            {item.title || 'Untitled'}
                          </p>
                          <Badge variant="secondary">{item.label}</Badge>
                        </div>
                        {item.preview && (
                          <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">
                            {item.preview}
                          </p>
                        )}
                        <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                          {item.subtitle && (
                            <>
                              <span className="truncate">{item.subtitle}</span>
                              <span aria-hidden>•</span>
                            </>
                          )}
                          <span>
                            deleted{' '}
                            {formatDistanceToNow(new Date(item.deleted_at), {
                              addSuffix: true,
                              locale: enUS,
                            })}
                          </span>
                          {item.deleted_by_name && (
                            <>
                              <span aria-hidden>•</span>
                              <span>by {item.deleted_by_name}</span>
                            </>
                          )}
                        </div>
                      </div>

                      <div className="flex shrink-0 items-center gap-2">
                        {canRestore ? (
                          restoreButton
                        ) : (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span>{restoreButton}</span>
                            </TooltipTrigger>
                            <TooltipContent>
                              Restoring a {item.label.toLowerCase()} is admin-only
                            </TooltipContent>
                          </Tooltip>
                        )}
                        {canPurge && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-destructive hover:text-destructive"
                            aria-label={`Permanently delete ${item.title ?? item.label}`}
                            onClick={() => setPurgeTarget(item)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </AdminPageContainer>

      {/* Permanent delete. Named for what it does: the stored revisions go too. */}
      <AlertDialog open={!!purgeTarget} onOpenChange={(open) => !open && setPurgeTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-destructive" />
              Permanently delete “{purgeTarget?.title || purgeTarget?.label}”?
            </AlertDialogTitle>
            <AlertDialogDescription>
              This removes the {purgeTarget?.label.toLowerCase()} <strong>and its entire
              stored revision history</strong>. Nothing is kept behind the scenes and nothing
              can bring it back — this is the option to use when the content must genuinely
              be gone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmPurge}
              disabled={purge.isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {purge.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Delete permanently
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AdminLayout>
  );
}
