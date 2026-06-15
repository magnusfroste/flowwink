import { useState, useEffect } from 'react';
import { Plus, Pencil, Trash2, History, Globe, Lock, RotateCcw, ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  useDocsPages, useManageDocsPage, useDocsPageVersions, type DocsPage,
} from '@/hooks/useDocs';

/** In-app docs authoring: create/edit/delete app-authored pages + version history. */
export function DocsAuthoring() {
  const { data: pages = [], isLoading } = useDocsPages();
  const manage = useManageDocsPage();

  const appDocs = pages.filter((p) => p.source === 'app');

  const [editing, setEditing] = useState<DocsPage | 'new' | null>(null);
  const [historyFor, setHistoryFor] = useState<DocsPage | null>(null);
  const [deleting, setDeleting] = useState<DocsPage | null>(null);

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <div>
            <CardTitle className="text-base">Authored pages</CardTitle>
            <CardDescription>
              {isLoading ? 'Loading…' : `${appDocs.length} in-app page(s). GitHub-synced pages are managed via Sync.`}
            </CardDescription>
          </div>
          <Button size="sm" onClick={() => setEditing('new')}>
            <Plus className="h-3.5 w-3.5 mr-1.5" /> New page
          </Button>
        </CardHeader>
        <CardContent>
          {appDocs.length === 0 ? (
            <div className="text-sm text-muted-foreground py-8 text-center">
              No in-app pages yet. Click <strong>New page</strong> to author one — it won't be
              touched by the GitHub sync.
            </div>
          ) : (
            <div className="divide-y">
              {appDocs.map((p) => (
                <div key={p.id} className="flex items-center justify-between gap-3 py-2.5">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium truncate">{p.title || '(untitled)'}</span>
                      {p.is_published ? (
                        <Badge variant="secondary" className="gap-1"><Globe className="h-3 w-3" />Public</Badge>
                      ) : (
                        <Badge variant="outline" className="gap-1 text-muted-foreground"><Lock className="h-3 w-3" />Draft</Badge>
                      )}
                    </div>
                    <div className="text-xs text-muted-foreground truncate">
                      /docs/{p.category}/{p.slug}
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    {p.is_published && (
                      <Button variant="ghost" size="icon" asChild title="Open">
                        <a href={`/docs/${p.category}/${p.slug}`} target="_blank" rel="noopener noreferrer">
                          <ExternalLink className="h-4 w-4" />
                        </a>
                      </Button>
                    )}
                    <Button variant="ghost" size="icon" title="History" onClick={() => setHistoryFor(p)}>
                      <History className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon" title="Edit" onClick={() => setEditing(p)}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon" title="Delete" onClick={() => setDeleting(p)}>
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {editing && (
        <DocEditorDialog
          doc={editing === 'new' ? null : editing}
          saving={manage.isPending}
          onCancel={() => setEditing(null)}
          onSave={(input) => manage.mutate(input, { onSuccess: () => setEditing(null) })}
        />
      )}

      {historyFor && (
        <VersionHistoryDialog
          doc={historyFor}
          restoring={manage.isPending}
          onClose={() => setHistoryFor(null)}
          onRestore={(version_no) =>
            manage.mutate(
              { action: 'restore_version', id: historyFor.id, version_no },
              { onSuccess: () => setHistoryFor(null) },
            )
          }
        />
      )}

      <AlertDialog open={!!deleting} onOpenChange={(o) => !o && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete "{deleting?.title}"?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently removes the page and its version history. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() =>
                deleting &&
                manage.mutate({ action: 'delete', id: deleting.id }, { onSuccess: () => setDeleting(null) })
              }
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function DocEditorDialog({
  doc, saving, onCancel, onSave,
}: {
  doc: DocsPage | null;
  saving: boolean;
  onCancel: () => void;
  onSave: (input: {
    action: 'create' | 'update';
    id?: string;
    title: string;
    content: string;
    category: string;
    is_published: boolean;
  }) => void;
}) {
  const [title, setTitle] = useState(doc?.title ?? '');
  const [category, setCategory] = useState(doc?.category ?? 'general');
  const [content, setContent] = useState(doc?.content ?? '');
  const [isPublished, setIsPublished] = useState(doc?.is_published ?? true);

  useEffect(() => {
    setTitle(doc?.title ?? '');
    setCategory(doc?.category ?? 'general');
    setContent(doc?.content ?? '');
    setIsPublished(doc?.is_published ?? true);
  }, [doc]);

  const canSave = title.trim() !== '' && content.trim() !== '';

  return (
    <Dialog open onOpenChange={(o) => !o && onCancel()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{doc ? 'Edit page' : 'New page'}</DialogTitle>
          <DialogDescription>
            {doc ? 'Saving snapshots the previous version to history.' : 'Authored in-app; the slug is derived from the title.'}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-2 space-y-1.5">
              <Label htmlFor="doc-title">Title</Label>
              <Input id="doc-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Getting started" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="doc-category">Category</Label>
              <Input id="doc-category" value={category} onChange={(e) => setCategory(e.target.value)} placeholder="guides" />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="doc-content">Content (Markdown)</Label>
            <Textarea
              id="doc-content"
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="# Heading&#10;&#10;Write the page in Markdown…"
              className="min-h-[280px] font-mono text-sm"
            />
          </div>
          <div className="flex items-center gap-2">
            <Switch id="doc-published" checked={isPublished} onCheckedChange={setIsPublished} />
            <Label htmlFor="doc-published" className="cursor-pointer">
              {isPublished ? 'Public — visible at /docs' : 'Draft — hidden from visitors'}
            </Label>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onCancel} disabled={saving}>Cancel</Button>
          <Button
            disabled={!canSave || saving}
            onClick={() =>
              onSave({
                action: doc ? 'update' : 'create',
                id: doc?.id,
                title: title.trim(),
                content,
                category: category.trim() || 'general',
                is_published: isPublished,
              })
            }
          >
            {doc ? 'Save changes' : 'Create page'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function VersionHistoryDialog({
  doc, restoring, onClose, onRestore,
}: {
  doc: DocsPage;
  restoring: boolean;
  onClose: () => void;
  onRestore: (versionNo: number) => void;
}) {
  const { data: versions = [], isLoading } = useDocsPageVersions(doc.id);

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Version history — {doc.title}</DialogTitle>
          <DialogDescription>
            Each save and restore snapshots the prior content. Restore rolls back to a snapshot
            (and snapshots the current state first).
          </DialogDescription>
        </DialogHeader>
        <ScrollArea className="max-h-[50vh] pr-3">
          {isLoading ? (
            <div className="text-sm text-muted-foreground py-6 text-center">Loading…</div>
          ) : versions.length === 0 ? (
            <div className="text-sm text-muted-foreground py-6 text-center">
              No prior versions yet — they appear here after the first edit.
            </div>
          ) : (
            <div className="divide-y">
              {versions.map((v) => (
                <div key={v.id} className="flex items-center justify-between gap-3 py-2.5">
                  <div className="min-w-0">
                    <div className="font-medium text-sm">
                      v{v.version_no} · <span className="font-normal truncate">{v.title}</span>
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {new Date(v.created_at).toLocaleString()} · {v.content.length} chars
                    </div>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={restoring}
                    onClick={() => onRestore(v.version_no)}
                  >
                    <RotateCcw className="h-3.5 w-3.5 mr-1.5" /> Restore
                  </Button>
                </div>
              ))}
            </div>
          )}
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
