import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import type { JSONContent } from '@tiptap/react';
import { ExternalLink, Loader2, Save, Send, EyeOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { BlogContentEditor } from '@/components/admin/BlogContentEditor';
import { useBlogPost, useUpdateBlogPost, useUpdateBlogPostStatus } from '@/hooks/useBlogPosts';

const EMPTY_DOC: JSONContent = { type: 'doc', content: [{ type: 'paragraph' }] };

/** The post's body as the editor wants it — the same unwrapping the blog editor page does. */
function bodyOf(raw: unknown): JSONContent {
  if (raw && typeof raw === 'object' && (raw as { type?: string }).type === 'doc') return raw as JSONContent;
  if (Array.isArray(raw) && raw[0]?.type === 'text' && raw[0]?.data?.content) return raw[0].data.content as JSONContent;
  return EMPTY_DOC;
}

/**
 * A blog post FlowChat wrote, open beside the chat — the artifact is the
 * RECORD, not a copy. Edit title, ingress and body in the same editor the
 * blog page uses, save, publish or unpublish — the person's own writes,
 * under their session (2026-10-31: "when a blog is created, don't we show
 * it as an artifact?").
 */
export function BlogPostPanel({ slugOrId }: { slugOrId: string }) {
  const { data: post, isLoading } = useBlogPost(slugOrId);
  const update = useUpdateBlogPost();
  const setStatus = useUpdateBlogPostStatus();
  const [title, setTitle] = useState('');
  const [excerpt, setExcerpt] = useState('');
  const [content, setContent] = useState<JSONContent | null>(null);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    if (!post) return;
    setTitle(post.title);
    setExcerpt(post.excerpt ?? '');
    setContent(bodyOf(post.content_json));
    setDirty(false);
  }, [post?.id, post?.updated_at]); // eslint-disable-line react-hooks/exhaustive-deps

  if (isLoading) return <div className="p-4 text-xs text-muted-foreground flex items-center gap-2"><Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading the post…</div>;
  if (!post) return <div className="p-4 text-xs text-muted-foreground">The post could not be found — it may have been deleted.</div>;

  const published = post.status === 'published';
  const save = () => update.mutate(
    { id: post.id, title, excerpt, content_json: (content ?? EMPTY_DOC) as never },
    { onSuccess: () => setDirty(false) },
  );

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="px-3 pt-3 pb-2 space-y-2 border-b border-border/40 shrink-0">
        <div className="flex items-center gap-2">
          <Badge variant={published ? 'default' : 'secondary'} className="text-[10px]">{post.status}</Badge>
          <span className="text-[11px] text-muted-foreground truncate">/blog/{post.slug}</span>
        </div>
        <Input value={title} onChange={(e) => { setTitle(e.target.value); setDirty(true); }} className="h-8 text-sm font-medium" aria-label="Title" />
        <Textarea value={excerpt} onChange={(e) => { setExcerpt(e.target.value); setDirty(true); }} rows={2} className="text-xs resize-none" placeholder="Ingress" aria-label="Excerpt" />
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto p-3">
        <BlogContentEditor content={content} onChange={(c) => { setContent(c); setDirty(true); }} />
      </div>

      <div className="border-t border-border/40 px-3 py-2 flex items-center gap-2 shrink-0">
        <Link to={`/admin/blog/${post.id}`} className="text-[11px] text-primary hover:underline inline-flex items-center gap-1">
          Full editor <ExternalLink className="h-3 w-3" />
        </Link>
        <span className="flex-1" />
        <Button type="button" size="sm" variant="outline" className="h-7 gap-1 text-xs" onClick={save} disabled={!dirty || update.isPending}>
          {update.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />} Save
        </Button>
        <Button
          type="button"
          size="sm"
          className="h-7 gap-1 text-xs"
          disabled={setStatus.isPending || dirty}
          title={dirty ? 'Save your changes first' : undefined}
          onClick={() => setStatus.mutate({ id: post.id, status: published ? 'draft' : 'published' })}
        >
          {published ? <><EyeOff className="h-3.5 w-3.5" /> Unpublish</> : <><Send className="h-3.5 w-3.5" /> Publish</>}
        </Button>
      </div>
    </div>
  );
}
