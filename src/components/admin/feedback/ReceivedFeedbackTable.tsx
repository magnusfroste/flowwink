import { useState } from 'react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useFeedbackSkill, type FeedbackPost } from '@/hooks/useFeedbackBoard';

const STATUSES = ['open', 'planned', 'in_progress', 'done', 'declined'] as const;

/** The received posts, one row each: status dial, origin, a staff reply. */
export function ReceivedFeedbackTable({ posts }: { posts: FeedbackPost[] }) {
  const skill = useFeedbackSkill();
  const [open, setOpen] = useState<string | null>(null);
  const [note, setNote] = useState('');

  const setStatus = (post: FeedbackPost, status: string) =>
    skill.mutateAsync({ skill: 'manage_feedback', args: { action: 'set_status', post_id: post.id, status } })
      .then(() => toast.success(`${post.title}: ${status.replace('_', ' ')}`))
      .catch((e: unknown) => toast.error(e instanceof Error ? e.message : String(e)));
  const reply = (post: FeedbackPost) =>
    skill.mutateAsync({ skill: 'manage_feedback', args: { action: 'comment', post_id: post.id, note } })
      .then(() => { toast.success('Reply posted'); setNote(''); setOpen(null); })
      .catch((e: unknown) => toast.error(e instanceof Error ? e.message : String(e)));

  if (posts.length === 0) return <p className="text-sm text-muted-foreground">Nothing here yet.</p>;
  return (
    <div className="space-y-2">
      {posts.map((p) => {
        const origin = (p.origin ?? {}) as { skills_sha?: string; module_count?: number };
        return (
          <div key={p.id} className="rounded-md border p-3">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="outline" className="text-[10px] uppercase">{p.board}</Badge>
                  <a className="font-medium hover:underline" href={`/feedback/${p.id}`} target="_blank" rel="noreferrer">{p.title}</a>
                </div>
                <p className="mt-1 line-clamp-2 whitespace-pre-wrap text-sm text-muted-foreground">{p.body}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {p.author_name || 'anonymous'}{p.author_email ? ` · ${p.author_email}` : ''}
                  {p.origin_site_url ? <> · from <a className="underline" href={p.origin_site_url} target="_blank" rel="noreferrer">{p.origin_site_url.replace(/^https?:\/\//, '')}</a></> : null}
                  {origin.skills_sha ? <> · <code>{origin.skills_sha}</code>{typeof origin.module_count === 'number' ? ` · ${origin.module_count} modules` : ''}</> : null}
                  {' · '}{new Date(p.created_at).toLocaleDateString()} · {p.votes_count} vote{p.votes_count === 1 ? '' : 's'} · {p.comments_count} comment{p.comments_count === 1 ? '' : 's'}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Select value={p.status} onValueChange={(v) => setStatus(p, v)}>
                  <SelectTrigger className="w-36 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>{STATUSES.map((s) => <SelectItem key={s} value={s}>{s.replace('_', ' ')}</SelectItem>)}</SelectContent>
                </Select>
                <Button size="sm" variant="outline" onClick={() => setOpen(open === p.id ? null : p.id)}>Reply</Button>
              </div>
            </div>
            {open === p.id && (
              <div className="mt-3 space-y-2">
                <Textarea rows={3} value={note} onChange={(e) => setNote(e.target.value)} placeholder="A staff reply the reporter sees on the board" />
                <Button size="sm" disabled={!note.trim() || skill.isPending} onClick={() => reply(p)}>Post reply</Button>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
