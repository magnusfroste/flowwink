import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Eye, Loader2, Pencil, Save, Undo2, ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { WikiMarkdown } from '@/components/admin/wiki/WikiMarkdown';
import { toWikiSlug, useUpsertWikiPage } from '@/hooks/useWiki';
import type { ChatDocument } from '@/hooks/useWorkspaceChat';
import { toast } from 'sonner';

/**
 * The document beside the chat — the Result tab, FlowWink's artifact.
 *
 * The assistant writes it (write_document); the person edits it right here
 * and saves it to the wiki — their write, under their own permissions, no
 * approval card for a page they are looking at. Each message sends the text
 * as it is NOW, so "read it through" and "shorten section 3" are about what
 * is on screen, edits included. A revision from the chat replaces the text
 * and keeps the previous version one Undo away.
 */
export function DocumentPanel({
  doc,
  onChange,
  canUndo,
  onUndo,
  dirty,
  onSaved,
}: {
  doc: ChatDocument;
  onChange: (next: ChatDocument) => void;
  canUndo: boolean;
  onUndo: () => void;
  /** Changed since the last save (or never saved). */
  dirty: boolean;
  onSaved: (slug: string) => void;
}) {
  const [preview, setPreview] = useState(false);
  const upsert = useUpsertWikiPage();
  const slug = useMemo(() => doc.slug || toWikiSlug(doc.title), [doc.slug, doc.title]);

  const save = async () => {
    if (!doc.title.trim() || !doc.content_md.trim()) {
      toast.error('A wiki page needs a title and some text.');
      return;
    }
    const page = await upsert.mutateAsync({ slug, title: doc.title.trim(), content_md: doc.content_md });
    onSaved(page.slug);
    toast.success(doc.slug ? `Saved "${page.title}"` : `Created wiki page "${page.title}"`);
  };

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="px-3 pt-3 pb-2 space-y-2 border-b border-border/40 shrink-0">
        <Input
          value={doc.title}
          onChange={(e) => onChange({ ...doc, title: e.target.value })}
          className="h-8 text-sm font-medium"
          aria-label="Document title"
        />
        <div className="flex items-center gap-1">
          <Button type="button" variant={preview ? 'ghost' : 'secondary'} size="sm" className="h-7 gap-1 text-xs" onClick={() => setPreview(false)}>
            <Pencil className="h-3.5 w-3.5" /> Edit
          </Button>
          <Button type="button" variant={preview ? 'secondary' : 'ghost'} size="sm" className="h-7 gap-1 text-xs" onClick={() => setPreview(true)}>
            <Eye className="h-3.5 w-3.5" /> Preview
          </Button>
          {canUndo && (
            <Button type="button" variant="ghost" size="sm" className="h-7 gap-1 text-xs ml-auto" onClick={onUndo} title="Back to the version before the assistant's last change">
              <Undo2 className="h-3.5 w-3.5" /> Undo change
            </Button>
          )}
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto">
        {preview ? (
          <div className="p-3 prose prose-sm dark:prose-invert max-w-none">
            <WikiMarkdown content={doc.content_md} knownSlugs={new Set()} />
          </div>
        ) : (
          <Textarea
            value={doc.content_md}
            onChange={(e) => onChange({ ...doc, content_md: e.target.value })}
            className="h-full min-h-[300px] w-full resize-none rounded-none border-0 font-mono text-xs leading-relaxed focus-visible:ring-0 p-3"
            aria-label="Document text (markdown)"
          />
        )}
      </div>

      <div className="border-t border-border/40 px-3 py-2 flex items-center gap-2 shrink-0">
        <span className="text-[11px] text-muted-foreground flex-1 min-w-0 truncate">
          {doc.slug
            ? dirty ? 'Unsaved changes' : 'Saved to the wiki'
            : 'Not saved — only you see this draft'}
        </span>
        {doc.slug && (
          <Link to={`/admin/wiki/${encodeURIComponent(doc.slug)}`} className="text-[11px] text-primary hover:underline inline-flex items-center gap-1">
            Open <ExternalLink className="h-3 w-3" />
          </Link>
        )}
        <Button type="button" size="sm" className="h-7 gap-1 text-xs" onClick={save} disabled={upsert.isPending || (!!doc.slug && !dirty)}>
          {upsert.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
          {doc.slug ? 'Save' : 'Save to wiki'}
        </Button>
      </div>
    </div>
  );
}
